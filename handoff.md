# AtlasEDM — Handoff

## What this project is

AtlasEDM is an interactive map that shows upcoming electronic dance music (EDM) events
and festivals around the world. The idea: instead of digging through a events site
list-by-list, you land on a map, pick a location, and see what's happening there and
nearby, plotted as pins you can click into for details (lineup, date, venue, ticket
link).

The event data comes from Edmtrain, an existing EDM events aggregator — AtlasEDM pulls
that data in on a recurring basis and serves it back out through its own map-focused
interface, with its own filtering (bounding box, date range, age restriction, artist).

The core product loop now works end to end: land on the search page, pick a location
and (optionally) artists, fly into a clustered map of real venues for that area, click
a pin for event details. What's still missing is the on-map filter bar (date range, age
restriction, event count, artist re-filtering) — see "Next step" below.

## Tech stack

**Data source:** [Edmtrain's API](https://edmtrain.com/api-documentation) — the
upstream source of truth for events, venues, and artists.

**Database:** PostgreSQL + PostGIS (for geographic queries — bounding-box searches
against venue coordinates), running in Docker. Schema lives in `migrations/` as
sequential `.sql` files, applied automatically on first container start.

**Sync job:** a Python script (`sync/sync_events.py`) that calls the Edmtrain API and
upserts venues, events, artists, and artist-event relationships into Postgres. Runs
daily via cron (`0 3 * * * sync/run_sync.sh`, installed in the local crontab), which
also brings the Docker stack up before syncing.

**Cache:** Redis, sitting in front of the backend's event-query endpoint to reduce
repeated database load for identical map queries (same bounding box, filters, etc.).

**Backend API:** C++ using the [Drogon](https://github.com/drogonframework/drogon)
framework, in `backend/`. Talks to Postgres and Redis directly. Fully containerized
(`backend/Dockerfile`) alongside Postgres and Redis in `docker-compose.yml`, so the
whole stack comes up with one `docker compose up`.

**Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS, in `frontend/`. Meant to
deploy on Vercel. Two real pages: the landing/search page (`/`) and the map (`/map`).

**Design/dev tooling:** a custom Claude skill (`vercel-deployable`) encoding Next.js/
Vercel deployment best practices, used while building the frontend, plus a third-party
`design-taste-frontend` skill used for the app's visual direction (dark panel, single
pink accent, neutral zinc bases) — see "Known loose ends" for its install state.

## Current state of the code

### Backend — functionally complete for this phase

Three REST endpoints, all tested against real data:

- `GET /health` — DB connectivity check, returns a live row count.
- `GET /events` — the core map query. Filters: bounding box (`minLat`/`minLng`/
  `maxLat`/`maxLng`, required), date range (optional, defaults to today through 90
  days out), `eventsPerVenue` cap (default 10, with a `totalEventCount` per venue so
  the frontend knows when more exist), `minAge` (18/21/other, inclusive threshold
  semantics), `artistIds` (up to 5, OR logic), `festivalsOnly` (restricts to events
  flagged `is_flagship`, used for the map's low-zoom festival pins). Results are
  grouped by venue, each with its nested list of events and each event's full artist
  lineup plus its `isFlagship` flag. Responses are cached in Redis (~20 min TTL,
  configurable) and gracefully fall back to Postgres if Redis is unavailable.
- `GET /artists/search?query=` — autocomplete lookup against the artists table, powers
  the landing page's artist-filter tagging.

`migrations/004_flagship_festivals.sql` added a `flagship_festivals` table (a curated
list of ~20 major festivals — name pattern + a location hint for reference) and an
`events.is_flagship` boolean, matched via `ILIKE '%pattern%'` since Edmtrain's actual
event names vary in capitalization and wording around the festival name. `sync_events.py`
applies the same matching at upsert time (patterns loaded once per sync run, matched in
Python) so newly-synced events get `is_flagship` set without a separate backfill step.

Consistent error shape everywhere (`{ "error": true, "message": "..." }`), no internal
exception details ever leak to the client (logged server-side instead), and CORS
origins are configured via an env var (`ALLOWED_ORIGIN`, comma-separated) rather than
hardcoded, so the production frontend domain can be added later with zero backend code
changes.

The whole stack — Postgres, Redis, and the backend — has been verified to come up
correctly from a completely clean `docker compose down -v && docker compose up -d`,
including migrations auto-applying and the sync script populating real data into the
freshly-built containers.

### Frontend — search page + working map view

**Landing page** (`frontend/app/page.tsx`): "AtlasEDM" title, subheading, and a
functional search bar — location search (Mapbox Geocoding API, autocomplete, resolves
to a bounding box) plus artist search/tagging (`GET /artists/search`, up to 5). On
submit, that filter state is carried to `/map` as query params. The right-side panel is
a live, idle Mapbox globe (dark style, pannable/zoomable, no event data) purely for
atmosphere.

**Map page** (`frontend/app/map/`): arriving from a search starts the camera at a wide
globe view and `flyTo`s into the target location (~2.2s, `essential: true` so it plays
even with OS-level reduced-motion settings on), with a loading overlay that stays up
until both the animation and the first `GET /events` response are ready. Landing on
`/map` directly (no search) falls back to a default continental-US view.

Venues render as Mapbox GL native clusters (not individual DOM markers) — the current
viewport's venues refetch on a debounced `moveend`, clusters expand on click, and
individual pins open a sidebar (`VenueDetailPanel`) with the venue's events: a single
card for one event, a scrollable list for several, with a "Showing X of Y" indicator
when the backend's `eventsPerVenue` cap trims the list.

Below a zoom threshold (world/continent scale), the map switches to a "monuments" view:
only flagship-festival pins (fetched globally via `festivalsOnly`, styled as a larger
accent-colored circle with a star) plus a persistent "anchor" cluster representing
wherever the user originally searched. The anchor is sourced from that one-time
search-arrival fetch rather than the live viewport, so it stays in place regardless of
panning; clicking it flies back into that city at normal clustering zoom rather than
opening the sidebar (it represents a place, not a single venue). Above the threshold,
monuments/anchor hide and normal clustering resumes.

### Known loose ends worth flagging

- **Nothing since the last commit (`894733f`) is in git yet.** All of the search bar,
  map/clustering/monuments work, and the `festivalsOnly`/`is_flagship` backend changes
  are sitting uncommitted in the working tree. Worth committing in sensible chunks
  before this goes further.
- **The `design-taste-frontend` skill isn't cleanly installed.** Its content was read
  directly rather than installed via a working `npx skills add` — not blocking, but it
  won't auto-trigger correctly in a fresh session until that's resolved.
- **PostGIS `geography` envelopes misbehave on wide-longitude bounding boxes.**
  Confirmed empirically: a bbox cast to `::geography` starts returning *fewer* results
  as its longitude span widens past roughly ±130°, and goes fully degenerate (zero
  results) near a full ±180° span — a ring-winding ambiguity when a wide planar
  rectangle is interpreted on a sphere. The monuments feature works around this by
  tiling its global query into three 120°-wide bands instead of one world-spanning
  bbox (see `fetchFlagshipEvents` in `frontend/app/_lib/events.ts`). Worth knowing
  about before any future feature tries a single very-wide-area bbox query.

## Next step: the on-map filter bar

`GET /events` already supports date range, `eventsPerVenue`, `minAge`, and `artistIds`
server-side, but only `artistIds` (via the landing page search) and the bbox are
actually wired up from the frontend today. The next piece is the on-map filter bar —
a Google Maps-style overlay with four controls:

1. **Artist search/tags** — same autocomplete/tagging pattern already built for the
   landing page (`ArtistSearch`), reused here so filters can be changed after arriving
   on the map, not just at initial search.
2. **Date range** — a custom date picker feeding `startDate`/`endDate`.
3. **Event count per venue** — controls `eventsPerVenue` (currently fixed at the
   backend's default of 10).
4. **Age restriction** — a toggle for `minAge` (18+/21+/other).

All four should re-trigger the current viewport's `GET /events` fetch (the existing
debounced `moveend` fetch path) rather than needing a new data-fetching mechanism.
