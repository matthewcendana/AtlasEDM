"""
Syncs upcoming EDM events from the Edmtrain API into the AtlasEDM Postgres/PostGIS database.

Usage:
    python sync/sync_events.py

On each run, fetches events created since the last successful sync (using Edmtrain's
createdStartDate filter, which only returns events added since that date and are still
upcoming). On the first run, fetches all upcoming events with no date filter.

Known tradeoff: the backend's GET /events caches responses in Redis for ~20 minutes
(see kEventsCacheTtlSeconds in backend/controllers/EventController.cc). This script
doesn't invalidate that cache after writing new data, so a request can serve results up
to ~20 minutes stale relative to what this sync just wrote. This is intentional for now:
the TTL is short relative to the once-daily sync cadence, so it self-resolves quickly
without needing a real invalidation pipeline (e.g. this script publishing a Redis
message, or flushing/versioning cache keys on sync completion). Worth revisiting only if
the sync schedule becomes much more frequent, or if 20 minutes of staleness right after
a sync turns out to actually matter for how the product gets used.
"""
import logging
import os
import sys
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("sync_events")

EDMTRAIN_EVENTS_URL = "https://edmtrain.com/api/events"
REQUEST_TIMEOUT_SECONDS = 30


def get_db_connection():
    return psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", "localhost"),
        port=os.environ.get("POSTGRES_PORT", "5432"),
        dbname=os.environ["POSTGRES_DB"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
    )


def get_last_sync_date(conn):
    """Returns the UTC date of the most recent successful sync, or None if there hasn't been one.

    Edmtrain's createdStartDate filter only accepts date granularity (not a full
    timestamp) even though the docs describe it as a UTC timestamp filter. To avoid
    missing events added later on the same UTC day as the last sync, we re-fetch that
    whole day; re-processing already-synced events is safe because every upsert is
    ON CONFLICT DO UPDATE.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT run_at FROM sync_log WHERE status = 'success' ORDER BY run_at DESC LIMIT 1"
        )
        row = cur.fetchone()
    if row is None:
        return None
    return row[0].astimezone(timezone.utc).date()


def fetch_events(api_key, created_start_date=None):
    params = {"client": api_key}
    if created_start_date is not None:
        params["createdStartDate"] = created_start_date.strftime("%Y-%m-%d")

    response = requests.get(EDMTRAIN_EVENTS_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    payload = response.json()

    if not payload.get("success", False):
        raise RuntimeError(f"Edmtrain API error: {payload.get('message', 'unknown error')}")

    events = payload.get("data", [])
    # No pagination metadata exists in the Edmtrain response as of this writing;
    # if that changes, page-following logic would go here.
    return events


def upsert_venue(cur, venue):
    if venue is None:
        return None

    location = venue.get("location") or ""
    city = location.split(",")[0].strip() or None

    cur.execute(
        """
        INSERT INTO venues (edmtrain_id, name, address, city, state, country, geom)
        VALUES (
            %(edmtrain_id)s, %(name)s, %(address)s, %(city)s, %(state)s, %(country)s,
            CASE
                WHEN %(longitude)s IS NOT NULL AND %(latitude)s IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint(%(longitude)s, %(latitude)s), 4326)::geography
                ELSE NULL
            END
        )
        ON CONFLICT (edmtrain_id) DO UPDATE SET
            name = EXCLUDED.name,
            address = EXCLUDED.address,
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            country = EXCLUDED.country,
            geom = EXCLUDED.geom
        RETURNING id
        """,
        {
            "edmtrain_id": venue["id"],
            "name": venue.get("name"),
            "address": venue.get("address"),
            "city": city,
            "state": venue.get("state"),
            "country": venue.get("country"),
            "longitude": venue.get("longitude"),
            "latitude": venue.get("latitude"),
        },
    )
    return cur.fetchone()[0]


def categorize_age(ages):
    """Buckets Edmtrain's free-form `ages` string into one of three fixed categories.

    Keeps this mapping in one place so the API can filter on a plain equality/inclusion
    check against age_category instead of parsing `ages` on every request.
    """
    if ages == "21+":
        return "21+"
    if ages in ("18+", "19+"):
        return "18+"
    return "Other"


def load_flagship_patterns(conn):
    """Loads flagship_festivals' matching columns once per sync run rather than
    re-querying per event — the list is small and static within a run, so this trades
    one query for what would otherwise be one EXISTS subquery per upserted event.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT name_pattern, venue_pattern FROM flagship_festivals")
        return cur.fetchall()


def is_flagship_event(name, venue_name, flagship_patterns):
    """Same case-insensitive substring match as the SQL recompute in
    migrations/005_flagship_venue_pattern.sql (`name ILIKE '%' || name_pattern || '%'
    AND (venue_pattern IS NULL OR venue_name ILIKE '%' || venue_pattern || '%')`) — kept
    equivalent so a newly-synced event and a backfilled one get the same answer.

    A bare name_pattern can't tell a flagship festival apart from an unrelated event
    that merely shares its name (e.g. an unofficial afterparty, or a same-named show at
    a different venue) — venue_pattern is an optional second constraint, matched
    against the event's own venue, for the handful of patterns where that's ambiguous.
    Most rows leave venue_pattern NULL, meaning name alone is enough.
    """
    if not name:
        return False
    lowered_name = name.lower()
    lowered_venue = (venue_name or "").lower()
    for name_pattern, venue_pattern in flagship_patterns:
        if name_pattern.lower() not in lowered_name:
            continue
        if venue_pattern is not None and venue_pattern.lower() not in lowered_venue:
            continue
        return True
    return False


def upsert_event(cur, event, venue_id, venue_name, flagship_patterns):
    cur.execute(
        """
        INSERT INTO events (
            edmtrain_id, name, link, ages, age_category, is_flagship, festival_ind,
            livestream_ind, electronic_genre_ind, other_genre_ind, event_date,
            start_time, end_time, created_date, venue_id
        )
        VALUES (
            %(edmtrain_id)s, %(name)s, %(link)s, %(ages)s, %(age_category)s,
            %(is_flagship)s, %(festival_ind)s, %(livestream_ind)s,
            %(electronic_genre_ind)s, %(other_genre_ind)s, %(event_date)s,
            %(start_time)s, %(end_time)s, %(created_date)s, %(venue_id)s
        )
        ON CONFLICT (edmtrain_id) DO UPDATE SET
            name = EXCLUDED.name,
            link = EXCLUDED.link,
            ages = EXCLUDED.ages,
            age_category = EXCLUDED.age_category,
            is_flagship = EXCLUDED.is_flagship,
            festival_ind = EXCLUDED.festival_ind,
            livestream_ind = EXCLUDED.livestream_ind,
            electronic_genre_ind = EXCLUDED.electronic_genre_ind,
            other_genre_ind = EXCLUDED.other_genre_ind,
            event_date = EXCLUDED.event_date,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            created_date = EXCLUDED.created_date,
            venue_id = EXCLUDED.venue_id
        RETURNING id
        """,
        {
            "edmtrain_id": event["id"],
            "name": event.get("name"),
            "link": event.get("link"),
            "ages": event.get("ages"),
            "age_category": categorize_age(event.get("ages")),
            "is_flagship": is_flagship_event(event.get("name"), venue_name, flagship_patterns),
            "festival_ind": event.get("festivalInd", False),
            "livestream_ind": event.get("livestreamInd", False),
            "electronic_genre_ind": event.get("electronicGenreInd", False),
            "other_genre_ind": event.get("otherGenreInd", False),
            "event_date": event["date"],
            "start_time": event.get("startTime"),
            "end_time": event.get("endTime"),
            "created_date": event.get("createdDate"),
            "venue_id": venue_id,
        },
    )
    return cur.fetchone()[0]


def upsert_artist(cur, artist):
    cur.execute(
        """
        INSERT INTO artists (edmtrain_id, name, link)
        VALUES (%(edmtrain_id)s, %(name)s, %(link)s)
        ON CONFLICT (edmtrain_id) DO UPDATE SET
            name = EXCLUDED.name,
            link = EXCLUDED.link
        RETURNING id
        """,
        {
            "edmtrain_id": artist["id"],
            "name": artist.get("name"),
            "link": artist.get("link"),
        },
    )
    return cur.fetchone()[0]


def sync_event_artists(cur, event_id, artist_list):
    cur.execute("DELETE FROM event_artists WHERE event_id = %s", (event_id,))
    for position, artist in enumerate(artist_list):
        artist_id = upsert_artist(cur, artist)
        cur.execute(
            """
            INSERT INTO event_artists (event_id, artist_id, b2b_ind, position)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (event_id, artist_id) DO UPDATE SET
                b2b_ind = EXCLUDED.b2b_ind,
                position = EXCLUDED.position
            """,
            (event_id, artist_id, artist.get("b2bInd", False), position),
        )


def process_event(conn, event, flagship_patterns):
    """Upserts a single event (and its venue/artists) in its own transaction."""
    with conn.cursor() as cur:
        venue = event.get("venue")
        venue_id = upsert_venue(cur, venue)
        venue_name = (venue or {}).get("name")
        event_id = upsert_event(cur, event, venue_id, venue_name, flagship_patterns)
        sync_event_artists(cur, event_id, event.get("artistList") or [])
    conn.commit()


def write_sync_log(conn, status, events_upserted, error_message=None):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sync_log (status, events_upserted, error_message)
            VALUES (%s, %s, %s)
            """,
            (status, events_upserted, error_message),
        )
    conn.commit()


def main():
    load_dotenv()

    api_key = os.environ["EDMTRAIN_API_KEY"]
    conn = get_db_connection()

    events_fetched = 0
    events_upserted = 0
    events_failed = 0

    try:
        last_sync_date = get_last_sync_date(conn)
        if last_sync_date is not None:
            log.info("Last successful sync was on %s (UTC) — fetching events created since then", last_sync_date)
        else:
            log.info("No prior successful sync found — fetching all upcoming events")

        flagship_patterns = load_flagship_patterns(conn)

        events = fetch_events(api_key, created_start_date=last_sync_date)
        events_fetched = len(events)
        log.info("Fetched %d event(s) from Edmtrain", events_fetched)

        for event in events:
            try:
                process_event(conn, event, flagship_patterns)
                events_upserted += 1
            except Exception:
                conn.rollback()
                events_failed += 1
                log.exception("Failed to upsert event id=%s", event.get("id"))

        write_sync_log(conn, status="success", events_upserted=events_upserted)

        log.info(
            "Sync complete — fetched: %d, upserted: %d, failed: %d",
            events_fetched,
            events_upserted,
            events_failed,
        )

    except Exception as exc:
        conn.rollback()
        log.exception("Sync run failed")
        try:
            write_sync_log(conn, status="failure", events_upserted=events_upserted, error_message=str(exc))
        except Exception:
            log.exception("Additionally failed to write sync_log row")
        sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
