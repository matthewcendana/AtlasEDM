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

At this stage, only the very first screen — the landing page — is visually built. The
actual map experience (search, pins, event details) does not exist as a UI yet, though
the backend that will power it is fully built and tested.

## Tech stack

**Data source:** [Edmtrain's API](https://edmtrain.com/api-documentation) — the
upstream source of truth for events, venues, and artists.

**Database:** PostgreSQL + PostGIS (for geographic queries — bounding-box searches
against venue coordinates), running in Docker. Schema lives in `migrations/` as
sequential `.sql` files, applied automatically on first container start.

**Sync job:** a Python script (`sync/sync_events.py`) that calls the Edmtrain API and
upserts venues, events, artists, and artist-event relationships into Postgres. Designed
to run on a recurring schedule (a cron wrapper already exists at `sync/run_sync.sh`, not
yet installed as an actual scheduled job anywhere).

**Cache:** Redis, sitting in front of the backend's event-query endpoint to reduce
repeated database load for identical map queries (same bounding box, filters, etc.).

**Backend API:** C++ using the [Drogon](https://github.com/drogonframework/drogon)
framework, in `backend/`. Talks to Postgres and Redis directly. Fully containerized
(`backend/Dockerfile`) alongside Postgres and Redis in `docker-compose.yml`, so the
whole stack comes up with one `docker compose up`.

**Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS, in `frontend/`. Meant to
deploy on Vercel. Currently just the landing page.

**Design/dev tooling:** a custom Claude skill (`vercel-deployable`) encoding Next.js/
Vercel deployment best practices, used while building the frontend. Two third-party
skills (`design-taste-frontend`, `image-to-code-skill`) were used for the landing page's
visual direction but are not cleanly installed — see "Known loose ends" below.

## Current state of the code

### Backend — functionally complete for this phase

Three REST endpoints, all tested against real data:

- `GET /health` — DB connectivity check, returns a live row count.
- `GET /events` — the core map query. Filters: bounding box (`minLat`/`minLng`/
  `maxLat`/`maxLng`, required), date range (optional, defaults to today through 90
  days out), `eventsPerVenue` cap (default 10, with a `totalEventCount` per venue so
  the frontend knows when more exist), `minAge` (18/21/other, inclusive threshold
  semantics), `artistIds` (up to 5, OR logic). Results are grouped by venue, each
  with its nested list of events and each event's full artist lineup. Responses are
  cached in Redis (~20 min TTL, configurable) and gracefully fall back to Postgres if
  Redis is unavailable.
- `GET /artists/search?query=` — autocomplete lookup against the artists table, for
  the search bar's future artist-filter tags.

Consistent error shape everywhere (`{ "error": true, "message": "..." }`), no internal
exception details ever leak to the client (logged server-side instead), and CORS
origins are configured via an env var (`ALLOWED_ORIGIN`, comma-separated) rather than
hardcoded, so the production frontend domain can be added later with zero backend code
changes.

The whole stack — Postgres, Redis, and the backend — has been verified to come up
correctly from a completely clean `docker compose down -v && docker compose up -d`,
including migrations auto-applying and the sync script populating real data into the
freshly-built containers.

### Frontend — landing page only

`frontend/app/page.tsx` is the one real page: "AtlasEDM" title, subheading, and a
location search input (visually complete, not yet functional — see below). Split-screen
layout, dark panel with a world map graphic on the right. Built from a Figma reference,
verified with `npm run build` (clean, zero errors) and checked at both desktop and
mobile widths.

No other pages exist yet. No frontend code currently calls the backend API at all.

### Known loose ends worth flagging

- **Nothing from this session is committed to git yet.** `git log` still only shows
  the original 3 commits from before this work started; everything since (the whole
  backend, the whole frontend, all migrations past the first one) is sitting
  uncommitted in the working tree. Worth committing in sensible chunks before this
  goes much further, both for safety and so history is legible.
- **The sync script isn't actually scheduled anywhere yet.** The cron wrapper exists
  (`sync/run_sync.sh`) but hasn't been installed as a real recurring job — event data
  will go stale until it's run manually or a schedule is set up.
- **Two of the three frontend design skills aren't cleanly installed.**
  `design-taste-frontend` and `image-to-code-skill` were used by reading their source
  content directly rather than through a working install — an `npx skills add` to fix
  this properly was blocked by a permission prompt mid-session. Not blocking, but the
  skills won't auto-trigger correctly in a fresh session until this is resolved.

## Next step: a functional search bar

The search input on the landing page currently just looks right — no logic behind it.
Making it functional means:

1. Wiring it to `GET /artists/search` for artist-name autocomplete, and to some
   location lookup (city/state/country — not yet built on the backend; will likely
   need either a new endpoint or a third-party geocoding source) for the location
   half of the search.
2. Turning selections into the actual filter state (a chosen location becomes a
   bounding box, chosen artists become `artistIds`) that the map view will eventually
   query `GET /events` with.
3. Deciding how search submission transitions the user forward — most likely into the
   loading screen described below, carrying the chosen filters with it.

## Upcoming pages

**Loading screen** — a brief transitional screen shown right after the user submits a
search, while the first `GET /events` request for their chosen area is in flight. Mostly
about not leaving the user looking at a blank screen during that fetch; unlikely to need
much logic beyond a loading state tied to the request.

**Main map view** — the actual product. An interactive map (region depending on the
user's search) with event pins plotted from `GET /events`, using the bounding box of the
visible map area as the query filters. Clicking a pin with multiple events at that venue
should show a scrollable list (the backend's `eventsPerVenue` cap and `totalEventCount`
field exist specifically to support this — showing a capped list with a clear signal
that more events exist at that venue). This is where the `minAge` and `artistIds`
filters from the search bar, and any additional in-map filtering, actually get applied.
