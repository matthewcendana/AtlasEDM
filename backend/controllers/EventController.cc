#include "EventController.h"
#include "../utils/ErrorResponse.h"
#include <drogon/orm/DbClient.h>
#include <drogon/nosql/RedisClient.h>
#include <algorithm>
#include <array>
#include <chrono>
#include <ctime>
#include <iomanip>
#include <regex>
#include <sstream>

using namespace drogon::orm;
using namespace drogon::nosql;
using namespace atlasedm;

namespace
{
bool parseDouble(const std::string& text, double& out)
{
    if (text.empty())
    {
        return false;
    }
    try
    {
        size_t charsConsumed = 0;
        out = std::stod(text, &charsConsumed);
        // std::stod stops at the first invalid character instead of throwing
        // (e.g. "12.3abc" silently becomes 12.3) so we have to check that the
        // whole string was actually consumed.
        return charsConsumed == text.size();
    }
    catch (const std::exception&)
    {
        return false;
    }
}

// Validates format AND the obvious range violations (month 13, day 45) so a clearly
// malformed date fails cleanly with a 400 instead of reaching Postgres and 500ing on
// the ::date cast. This does not catch every calendar edge case (e.g. "2026-02-30" —
// Feb only has 28/29 days — passes this regex since day 30 is in-range for *a* month),
// full calendar validation would need actual date parsing; those rarer cases still
// return a safe, generic 500 (see makeInternalErrorResponse) rather than leaking
// anything, they just don't get the nicer 400 treatment. Flagged as a known gap rather
// than fixed, since closing it needs more machinery than this pass called for.
bool isValidIsoDate(const std::string& text)
{
    static const std::regex isoDatePattern(R"(^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$)");
    return std::regex_match(text, isoDatePattern);
}

bool parseNonNegativeInt(const std::string& text, long& out)
{
    if (text.empty())
    {
        return false;
    }
    try
    {
        size_t charsConsumed = 0;
        const long value = std::stol(text, &charsConsumed);
        if (charsConsumed != text.size() || value < 0)
        {
            return false;
        }
        out = value;
        return true;
    }
    catch (const std::exception&)
    {
        return false;
    }
}

// age_category is always exactly "21+", "18+", or "Other" (see migrations/003), so we
// can filter with a plain IN(...) rather than parsing anything at query time. This
// always binds exactly 3 slots regardless of how many buckets were requested, padding
// unused slots with "" (a value age_category can never hold) — Drogon's execSqlAsync
// resolves its parameter list at compile time via templates, so the *number* of bound
// parameters has to be fixed in the C++ source; it can't vary per request.
//
// ageCategories is a direct multi-select — a comma-separated subset of "18", "21",
// "other" (mapping to the DB's exact "18+"/"21+"/"Other" values) — rather than the
// ordered "at least this restrictive" threshold this used to be (minAge=18 used to
// mean "18+ or stricter"). A checkbox-per-bucket UI needs to be able to ask for e.g.
// just "18+ and Other" while excluding "21+", which no single threshold value could
// express. Absent/empty means no filter — every category matches — so a
// fully-checked checkbox group and an unfiltered request are indistinguishable, both
// server-side and in the cache key. The parsed set is deduplicated and sorted before
// filling the slots so two requests naming the same buckets in a different order (or
// with accidental repeats) resolve to the same slots — and therefore the same cache
// key, mirroring how artistIds is deduplicated/sorted below for the same reason.
bool resolveAgeCategoryFilter(const std::string& raw, std::array<std::string, 3>& slots)
{
    slots = {"", "", ""};
    if (raw.empty())
    {
        slots = {"18+", "21+", "Other"};
        return true;
    }

    std::vector<std::string> categories;
    std::stringstream stream(raw);
    std::string token;
    while (std::getline(stream, token, ','))
    {
        std::string category;
        if (token == "18") category = "18+";
        else if (token == "21") category = "21+";
        else if (token == "other") category = "Other";
        else return false;

        if (std::find(categories.begin(), categories.end(), category) == categories.end())
        {
            categories.push_back(category);
        }
    }
    if (categories.empty() || categories.size() > slots.size())
    {
        return false;
    }

    std::sort(categories.begin(), categories.end());
    std::copy(categories.begin(), categories.end(), slots.begin());
    return true;
}

// eventTypes: optional, comma-separated subset of "festival", "single" — maps
// directly onto events.festival_ind (true/false). Mirrors resolveAgeCategoryFilter's
// multi-select shape but collapses to a single output value since there are only
// two buckets and the query only ever needs "no filter" or "exactly one side":
// absent, empty, or both selected all mean "no filter" (out = ""), matching the
// checkbox UI's own "both checked = fully inclusive default" and "neither checked =
// same as both, don't return zero results" behavior — there's no server-side
// difference between those two states worth encoding separately.
bool resolveEventTypeFilter(const std::string& raw, std::string& out)
{
    out = "";
    if (raw.empty())
    {
        return true;
    }

    std::vector<std::string> types;
    std::stringstream stream(raw);
    std::string token;
    while (std::getline(stream, token, ','))
    {
        if (token != "festival" && token != "single") return false;
        if (std::find(types.begin(), types.end(), token) == types.end())
        {
            types.push_back(token);
        }
    }
    if (types.empty() || types.size() >= 2)
    {
        return true;  // neither or both selected => unfiltered, out stays ""
    }
    out = types[0];
    return true;
}

constexpr size_t kMaxArtistIds = 5;

// Parses "artistIds=4401,225,111" into up to kMaxArtistIds non-negative integers.
// An absent/empty param is valid and means "no artist filter" (ids left empty).
bool parseArtistIds(const std::string& raw, std::vector<long>& ids, std::string& errorMessage)
{
    if (raw.empty())
    {
        return true;
    }

    std::stringstream stream(raw);
    std::string token;
    while (std::getline(stream, token, ','))
    {
        const auto start = token.find_first_not_of(" \t");
        const auto end = token.find_last_not_of(" \t");
        if (start == std::string::npos)
        {
            errorMessage = "artistIds must not contain empty values";
            return false;
        }
        token = token.substr(start, end - start + 1);

        long id;
        if (!parseNonNegativeInt(token, id))
        {
            errorMessage = "artistIds must be a comma-separated list of non-negative integers";
            return false;
        }
        ids.push_back(id);
    }

    if (ids.size() > kMaxArtistIds)
    {
        errorMessage = "at most " + std::to_string(kMaxArtistIds) + " artistIds are allowed";
        return false;
    }
    return true;
}

// The sync job runs once daily, so cached results are already "stale" for up to 24h
// relative to the live API regardless of this TTL. ~20 minutes (the default in .env)
// is a point within a 15-30 min range: long enough that a user panning/filtering a map
// during one browsing session mostly hits cache instead of re-querying Postgres for
// viewports they've already seen, short enough that if the sync job runs mid-day (not
// just once overnight) or errors get corrected, the correction shows up within one TTL
// window instead of lingering until the next full day passes. Configurable via
// EVENTS_CACHE_TTL_SECONDS (see custom_config in config.json) rather than hardcoded,
// so it can be tuned without a rebuild. Read once via a function-local static — cheap
// either way since it's just a lookup into an already-parsed Json::Value, but this
// avoids repeating even that on every request.
int eventsCacheTtlSeconds()
{
    static const int ttl = drogon::app().getCustomConfig()["events_cache_ttl_seconds"].asInt();
    return ttl;
}

// Bbox coordinates are rounded to this many decimal places before going into the
// cache key (never used to round what's actually sent to Postgres — the DB query
// always uses the caller's exact bbox). This is a pure cache-bucketing tradeoff: 3
// decimal places is about 111m of latitude per 0.001 degree at the equator. 2 decimals
// (~1.1km buckets) would be too coarse — panning across a mid-size neighborhood could
// still land in the same bucket and serve venues for a visibly different viewport near
// the bucket's edges. 4 decimals (~11m buckets) would be too fine — a map viewport
// changes by more than 11m on almost any pan or zoom, so nearly every request would
// still miss the cache, defeating the point. 3 decimals is a reasonable middle ground
// for a viewport-sized bounding box; adjust if real traffic shows a different hit rate.
constexpr int kBboxCacheKeyPrecision = 3;

// Builds a single Redis key that captures every filter affecting the result, so two
// requests with the same effective filters always hit the same entry and two requests
// that differ in any filter never collide. artistIds is sorted and de-duplicated first
// so the same set of artists in a different order (or with accidental repeats) still
// maps to the same key. The "v1" segment is a cheap invalidation escape hatch: bumping
// it on a future change to the response shape or filter semantics makes every old
// cache entry simply a permanent miss, without needing to touch Redis directly.
std::string buildEventsCacheKey(double minLat,
                                double minLng,
                                double maxLat,
                                double maxLng,
                                const std::string& startDate,
                                const std::string& endDate,
                                const std::string& festivalEndDate,
                                long eventsPerVenue,
                                const std::array<std::string, 3>& ageCategoryFilter,
                                std::vector<long> artistIds,
                                bool festivalsOnly,
                                const std::string& eventTypeFilter)
{
    std::sort(artistIds.begin(), artistIds.end());
    artistIds.erase(std::unique(artistIds.begin(), artistIds.end()), artistIds.end());

    // "v2": startDate/endDate alone no longer fully determine the query result —
    // two requests can share identical startDate/endDate after defaulting (one from
    // an explicit ?endDate=... that happens to match the computed default, one from
    // omitting it entirely) while getting different festival-row widening. Folding
    // festivalEndDate into the key (and bumping v1->v2, per this function's own
    // "cheap invalidation escape hatch" comment above) keeps those cases from
    // colliding on a stale/wrong cached response.
    // "v3": each event's JSON gained a `festivalInd` field (frontend needs it to tell
    // a festival event apart from a regular show for card rendering) — bumping again
    // so pre-existing v2 cache entries, which lack the field, aren't served as-is.
    // "v4": added the eventTypeFilter ("", "festival", or "single") segment below —
    // bumping once more so a pre-existing v3 entry for an unfiltered request doesn't
    // get served back for a request that's now asking for just one event type.
    std::ostringstream key;
    key << "events:v4:" << std::fixed << std::setprecision(kBboxCacheKeyPrecision) << minLat << ':' << minLng
        << ':' << maxLat << ':' << maxLng << ':' << startDate << ':' << endDate << ':' << festivalEndDate << ':'
        << eventsPerVenue << ':';
    // Already deduplicated and sorted by resolveAgeCategoryFilter, so this just joins
    // whichever of the 3 fixed slots are populated — no further normalization needed.
    for (const auto& category : ageCategoryFilter)
    {
        if (!category.empty()) key << category << ',';
    }
    key << ':';
    for (size_t i = 0; i < artistIds.size(); ++i)
    {
        if (i > 0)
        {
            key << ',';
        }
        key << artistIds[i];
    }
    key << ':' << (festivalsOnly ? "festivalsOnly" : "all");
    key << ':' << (eventTypeFilter.empty() ? "allTypes" : eventTypeFilter);
    return key.str();
}

std::string formatDate(std::time_t time)
{
    std::tm tmValue{};
    gmtime_r(&time, &tmValue);
    char buf[11];
    std::strftime(buf, sizeof(buf), "%Y-%m-%d", &tmValue);
    return std::string(buf);
}

// Multi-day festivals (events.festival_ind, synced straight from Edmtrain's own
// festivalInd flag) are frequently announced with their later days further out than
// the 90-day default window below — e.g. a 3-day festival whose day 1 falls just
// inside the window but whose days 2-3 fall just past it, which used to make those
// later days silently vanish from a venue's event list with no indication they
// existed. Only applied when the caller didn't ask for a specific end date (see
// endDateWasDefaulted in asyncHandleHttpRequest) — an explicit ?endDate=... from the
// caller is respected exactly as given, for festival rows same as any other, since
// widening past a date the caller deliberately chose would be a surprise, not a fix.
// Mirrors the frontend's own festivalsOnly widening (fetchFlagshipEvents in
// events.ts), just applied here for the *default-range* case instead.
const std::string kFestivalDateCeiling = "2030-01-01";

// Default window: today through 90 days out. Computed in UTC so it doesn't
// drift with the server's local timezone.
std::pair<std::string, std::string> defaultDateRange()
{
    const std::time_t now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
    const std::time_t ninetyDaysOut = now + (90 * 24 * 60 * 60);
    return {formatDate(now), formatDate(ninetyDaysOut)};
}

// Wraps a field access so a NULL database value becomes a JSON null instead
// of an empty string (Field::as<std::string>() returns "" for NULL, which
// would silently hide missing data rather than representing it honestly).
Json::Value fieldToJson(const Field& field)
{
    if (field.isNull())
    {
        return Json::Value(Json::nullValue);
    }
    return Json::Value(field.as<std::string>());
}

// --- Plain aggregation structs -------------------------------------------
// We collect the flat SQL rows into these first, then build the Json::Value
// tree in a single second pass (see below). Building Json::Value directly
// while looping over rows would mean holding pointers into a Json::Value
// array's internal storage across further append() calls to that same
// array — jsoncpp doesn't document that those stay valid, so that's exactly
// the kind of "probably works, occasionally corrupts memory" bug worth
// avoiding. std::vector's reallocation rules are well-specified and we never
// hold a reference across a push_back, so this is safe.
struct ArtistAgg
{
    std::string name;
    bool b2bInd;
};

struct EventAgg
{
    int64_t id;
    Json::Value name;
    Json::Value date;
    Json::Value startTime;
    Json::Value link;
    Json::Value ages;
    bool isFlagship = false;
    bool festivalInd = false;
    std::vector<ArtistAgg> artists;
};

struct VenueAgg
{
    int64_t id;
    Json::Value name;
    double latitude;
    double longitude;
    int64_t totalEventCount = 0;  // true count of matching events, even ones truncated out
    std::vector<EventAgg> events;
};

// Turns the flat SQL result into the final {"venues": [...]} response. Pulled out of
// the query callback so it can be reused as-is regardless of whether the Postgres
// query actually ran (cache miss) — the caching wrapper only needs to decide whether
// to call this at all, not duplicate what it does.
HttpResponsePtr buildEventsResponse(const Result& result, long eventsPerVenue)
{
    // --- Phase 1: flat rows -> nested structs ---
    std::vector<VenueAgg> venueAggs;
    int64_t currentVenueId = -1;
    int64_t currentEventId = -1;
    bool currentEventIncluded = false;  // false while the current event is past the per-venue cap

    for (const auto& row : result)
    {
        const auto venueId = row["venue_id"].as<int64_t>();
        const auto eventId = row["event_id"].as<int64_t>();

        if (venueId != currentVenueId)
        {
            VenueAgg venue;
            venue.id = venueId;
            venue.name = fieldToJson(row["venue_name"]);
            venue.latitude = row["venue_lat"].as<double>();
            venue.longitude = row["venue_lng"].as<double>();
            venueAggs.push_back(std::move(venue));
            currentVenueId = venueId;
            currentEventId = -1;  // force the event block below to run too
        }
        VenueAgg& venue = venueAggs.back();

        if (eventId != currentEventId)
        {
            venue.totalEventCount++;
            // SQL already orders rows by event_date ascending within each
            // venue, so the first eventsPerVenue events encountered here are
            // exactly the soonest ones — no extra sorting needed.
            currentEventIncluded = static_cast<long>(venue.events.size()) < eventsPerVenue;
            if (currentEventIncluded)
            {
                EventAgg event;
                event.id = eventId;
                event.name = fieldToJson(row["event_name"]);
                event.date = fieldToJson(row["event_date"]);
                event.startTime = fieldToJson(row["event_start_time"]);
                event.link = fieldToJson(row["event_link"]);
                event.ages = fieldToJson(row["event_ages"]);
                event.isFlagship = row["event_is_flagship"].as<bool>();
                event.festivalInd = row["event_festival_ind"].as<bool>();
                venue.events.push_back(std::move(event));
            }
            currentEventId = eventId;
        }

        // LEFT JOIN means an event with no artists yields one row with
        // artist_name NULL — skip adding an artist for that row. Also skip
        // entirely if this event was truncated out by the venue's cap: it
        // was never pushed to venue.events, so venue.events.back() would
        // refer to a different (previous) event.
        if (currentEventIncluded && !row["artist_name"].isNull())
        {
            EventAgg& event = venue.events.back();
            ArtistAgg artist;
            artist.name = row["artist_name"].as<std::string>();
            artist.b2bInd = !row["artist_b2b_ind"].isNull() && row["artist_b2b_ind"].as<bool>();
            event.artists.push_back(std::move(artist));
        }
    }

    // --- Phase 2: structs -> Json::Value tree, built bottom-up ---
    Json::Value venuesJson(Json::arrayValue);
    for (auto& venue : venueAggs)
    {
        Json::Value eventsJson(Json::arrayValue);
        for (auto& event : venue.events)
        {
            Json::Value artistsJson(Json::arrayValue);
            for (auto& artist : event.artists)
            {
                Json::Value artistJson;
                artistJson["name"] = artist.name;
                artistJson["b2bInd"] = artist.b2bInd;
                artistsJson.append(std::move(artistJson));
            }

            Json::Value eventJson;
            eventJson["id"] = static_cast<Json::Int64>(event.id);
            eventJson["name"] = std::move(event.name);
            eventJson["date"] = std::move(event.date);
            eventJson["startTime"] = std::move(event.startTime);
            eventJson["link"] = std::move(event.link);
            eventJson["ages"] = std::move(event.ages);
            eventJson["isFlagship"] = event.isFlagship;
            eventJson["festivalInd"] = event.festivalInd;
            eventJson["artists"] = std::move(artistsJson);
            eventsJson.append(std::move(eventJson));
        }

        Json::Value venueJson;
        venueJson["id"] = static_cast<Json::Int64>(venue.id);
        venueJson["name"] = std::move(venue.name);
        venueJson["latitude"] = venue.latitude;
        venueJson["longitude"] = venue.longitude;
        venueJson["totalEventCount"] = static_cast<Json::Int64>(venue.totalEventCount);
        venueJson["events"] = std::move(eventsJson);
        venuesJson.append(std::move(venueJson));
    }

    Json::Value json;
    json["venues"] = std::move(venuesJson);
    return HttpResponse::newHttpJsonResponse(json);
}
}  // namespace

void EventController::asyncHandleHttpRequest(const HttpRequestPtr& req, std::function<void (const HttpResponsePtr &)> &&callback)
{
    // --- Bounding box: required, numeric, sane ---
    double minLat, minLng, maxLat, maxLng;
    const std::vector<std::pair<std::string, double*>> bboxParams = {
        {"minLat", &minLat}, {"minLng", &minLng}, {"maxLat", &maxLat}, {"maxLng", &maxLng}};

    for (const auto& [name, target] : bboxParams)
    {
        const auto raw = req->getParameter(name);
        if (!parseDouble(raw, *target))
        {
            callback(makeErrorResponse(k400BadRequest,
                                        name + " is required and must be a valid number"));
            return;
        }
    }

    if (minLat < -90.0 || maxLat > 90.0 || minLng < -180.0 || maxLng > 180.0)
    {
        callback(makeErrorResponse(
            k400BadRequest, "latitude must be within [-90, 90] and longitude within [-180, 180]"));
        return;
    }
    if (minLat > maxLat || minLng > maxLng)
    {
        callback(makeErrorResponse(k400BadRequest, "minLat/minLng must not be greater than maxLat/maxLng"));
        return;
    }

    // --- Date range: optional, defaults to today through 90 days out ---
    std::string startDate = req->getParameter("startDate");
    std::string endDate = req->getParameter("endDate");
    // Captured before defaulting fills endDate in below — this is what distinguishes
    // "caller explicitly asked for this end date" from "caller asked for no end date
    // in particular, so this is just where we happened to draw the line" for the
    // festival-widening logic further down (see kFestivalDateCeiling).
    const bool endDateWasDefaulted = endDate.empty();

    if (startDate.empty() || endDate.empty())
    {
        const auto [defaultStart, defaultEnd] = defaultDateRange();
        if (startDate.empty()) startDate = defaultStart;
        if (endDate.empty()) endDate = defaultEnd;
    }
    if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate))
    {
        callback(makeErrorResponse(k400BadRequest, "startDate and endDate must be ISO dates (YYYY-MM-DD)"));
        return;
    }
    // ISO YYYY-MM-DD strings sort lexicographically the same as chronologically, so a
    // plain string comparison is a correct ordering check with no date parsing needed.
    // Without this, startDate > endDate previously fell through to Postgres, where
    // BETWEEN with reversed bounds is valid SQL that always matches zero rows — a
    // silent empty result instead of the clear error a backwards range should be.
    if (startDate > endDate)
    {
        callback(makeErrorResponse(k400BadRequest, "startDate must not be after endDate"));
        return;
    }

    // The upper bound actually used for festival_ind=true rows: the caller's own
    // endDate when they set one explicitly, otherwise a far-future ceiling instead
    // of the (unrelated-to-festivals) 90-day default — see kFestivalDateCeiling.
    const std::string festivalEndDate = endDateWasDefaulted ? kFestivalDateCeiling : endDate;

    // --- eventsPerVenue: optional, defaults to 10 ---
    long eventsPerVenue = 10;
    {
        const auto raw = req->getParameter("eventsPerVenue");
        if (!raw.empty() && !parseNonNegativeInt(raw, eventsPerVenue))
        {
            callback(makeErrorResponse(k400BadRequest, "eventsPerVenue must be a non-negative integer"));
            return;
        }
    }

    // --- ageCategories: optional, comma-separated subset of "18", "21", "other" ---
    const std::string ageCategoriesRaw = req->getParameter("ageCategories");
    std::array<std::string, 3> ageCategoryFilter;
    if (!resolveAgeCategoryFilter(ageCategoriesRaw, ageCategoryFilter))
    {
        callback(makeErrorResponse(
            k400BadRequest, R"(ageCategories must be a comma-separated list of "18", "21", and/or "other")"));
        return;
    }

    // --- artistIds: optional, comma-separated list of artists.id, max 5, OR logic ---
    std::vector<long> artistIds;
    {
        std::string errorMessage;
        if (!parseArtistIds(req->getParameter("artistIds"), artistIds, errorMessage))
        {
            callback(makeErrorResponse(k400BadRequest, errorMessage));
            return;
        }
    }
    // Bound the same way as ageCategoryFilter: a fixed number of slots (the max we
    // allow), padded with a sentinel ("-1") that artists.id — a SERIAL starting at 1 —
    // can never equal. The leading flag slot lets the whole EXISTS clause become a
    // no-op via "$10 = ''" when no artist filter was requested, without needing a
    // second SQL string or a boolean bind (see the query comment below for why).
    const std::string artistFilterActive = artistIds.empty() ? "" : "x";
    std::array<std::string, kMaxArtistIds> artistIdSlots = {"-1", "-1", "-1", "-1", "-1"};
    for (size_t i = 0; i < artistIds.size(); ++i)
    {
        artistIdSlots[i] = std::to_string(artistIds[i]);
    }

    // --- festivalsOnly: optional, restricts to events.is_flagship = true ---
    // Powers the map's low-zoom "monuments" view (only flagship-festival pins, no
    // regular venues) — same "$N = '' means no-op" trick as artistFilterActive above,
    // for the same reason: one static SQL string, fixed parameter count.
    const bool festivalsOnly = req->getParameter("festivalsOnly") == "true";
    const std::string festivalsOnlyFlag = festivalsOnly ? "x" : "";

    // --- eventTypes: optional, comma-separated subset of "festival", "single" ---
    // Powers the on-map filter bar's Festival/Single Artist checkboxes, filtering on
    // events.festival_ind directly.
    std::string eventTypeFilter;
    if (!resolveEventTypeFilter(req->getParameter("eventTypes"), eventTypeFilter))
    {
        callback(makeErrorResponse(
            k400BadRequest, R"(eventTypes must be a comma-separated list of "festival" and/or "single")"));
        return;
    }

    // venues.geom is GEOGRAPHY(POINT). The `&&` operator compares bounding
    // boxes and uses the GiST index on geom directly. ST_Within would need
    // an exact polygon-containment check via ST_MakeEnvelope + a cast to
    // geometry, which is more expensive and, for POINT data specifically, no
    // more correct: a point's own bounding box *is* the point, so there's
    // none of the false-positive risk `&&` would normally carry for larger
    // shapes. Since both approaches give identical results here, we use the
    // cheaper, index-friendly one.
    static const std::string sql = R"(
        SELECT
            v.id AS venue_id,
            v.name AS venue_name,
            ST_Y(v.geom::geometry) AS venue_lat,
            ST_X(v.geom::geometry) AS venue_lng,
            e.id AS event_id,
            e.name AS event_name,
            e.event_date AS event_date,
            e.start_time AS event_start_time,
            e.link AS event_link,
            e.ages AS event_ages,
            e.is_flagship AS event_is_flagship,
            e.festival_ind AS event_festival_ind,
            a.name AS artist_name,
            ea.b2b_ind AS artist_b2b_ind
        FROM venues v
        JOIN events e ON e.venue_id = v.id
        LEFT JOIN event_artists ea ON ea.event_id = e.id
        LEFT JOIN artists a ON a.id = ea.artist_id
        WHERE v.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography
          AND (
              e.event_date BETWEEN $5::date AND $6::date
              OR (e.festival_ind IS TRUE AND e.event_date BETWEEN $5::date AND $17::date)
          )
          AND e.age_category IN ($7, $8, $9)
          AND (
              $10 = ''
              OR EXISTS (
                  SELECT 1 FROM event_artists eaf
                  WHERE eaf.event_id = e.id
                    AND eaf.artist_id IN ($11::integer, $12::integer, $13::integer, $14::integer, $15::integer)
              )
          )
          AND ($16 = '' OR e.is_flagship = true)
          AND ($18 = '' OR e.festival_ind = ($18 = 'festival'))
        ORDER BY v.id, e.event_date, e.start_time NULLS LAST, e.id, ea.position NULLS LAST
    )";
    // The artist filter uses its own event_artists join (aliased eaf) rather than
    // reusing the ea/a join above. Those two joins serve different purposes: ea/a
    // fetches the FULL artist lineup to display for every matching event, one row per
    // artist. If the artist filter reused that same join — e.g. by adding
    // "ea.artist_id IN (...)" straight to the WHERE clause — it would also silently
    // drop the *other* rows for a matching event's other artists, since a LEFT JOIN row
    // only survives a WHERE filter on its own joined columns. A show with Martin Garrix
    // b2b Justin Mylo, filtered by artistIds=[Martin Garrix], would then only show
    // Martin Garrix in the response — the wrong lineup for a real event.
    //
    // EXISTS(...) instead asks a yes/no question per event ("does at least one of its
    // artists match?") via a separate, independently-aliased join that never touches
    // the SELECT list. It returns at most one true/false per event regardless of how
    // many of the up to 5 artistIds match, so it can't multiply or filter the eaf/a
    // display rows the way joining it into the main FROM clause would. It also reuses
    // event_artists' existing composite primary key (event_id, artist_id) as an index —
    // no new index was needed for this.
    //
    // The "$10 = ''" prefix is what makes the whole clause a no-op when no artistIds
    // were given: $10 is bound to "" when the filter is inactive (short-circuiting
    // before the EXISTS ever runs) or a non-empty marker when it's active. This keeps
    // the query to a single static string with a fixed parameter count, rather than
    // needing two near-duplicate SQL strings selected at runtime or a boolean bind
    // (Drogon's parameter binder has no confirmed-safe explicit overload for bool, only
    // for double/std::string, which is why every value bound in this file — including
    // this flag — goes in as a string).

    const std::string cacheKey = buildEventsCacheKey(
        minLat, minLng, maxLat, maxLng, startDate, endDate, festivalEndDate, eventsPerVenue, ageCategoryFilter,
        artistIds, festivalsOnly, eventTypeFilter);

    auto dbClient = drogon::app().getDbClient();
    auto redisClient = drogon::app().getRedisClient();

    // Runs the actual Postgres query (the cache-miss path), then writes the result to
    // Redis before responding. Kept as a lambda rather than an early-exit so it can be
    // invoked from either "definite miss" (cache returned nil) or "couldn't tell"
    // (Redis itself errored) — in both cases the right move is the same: fall back to
    // Postgres rather than fail the request over a cache problem.
    auto runDbQuery = [dbClient, redisClient, cacheKey, eventsPerVenue, callback, minLng, minLat, maxLng, maxLat,
                       startDate, endDate, festivalEndDate, ageCategoryFilter, artistFilterActive, artistIdSlots,
                       festivalsOnlyFlag, eventTypeFilter]() {
        // `sql` is a static local (declared above), so it doesn't need to be captured.
        dbClient->execSqlAsync(
            sql,
            [redisClient, cacheKey, eventsPerVenue, callback](const Result& result) {
                // Drogon invokes this callback with no try/catch of its own (verified
                // against its source — an uncaught exception here would propagate out
                // of library internals rather than staying contained to this request),
                // so an unexpected row shape has to be caught here, not left to escape.
                HttpResponsePtr resp;
                try
                {
                    resp = buildEventsResponse(result, eventsPerVenue);
                }
                catch (const std::exception& e)
                {
                    callback(makeInternalErrorResponse("EventController response building", e.what()));
                    return;
                }

                // Fire-and-forget: a failed cache write shouldn't fail the request that
                // already has a good answer, just means the next request re-queries.
                redisClient->execCommandAsync(
                    [](const RedisResult&) {},
                    [cacheKey](const RedisException& e) {
                        LOG_WARN << "Failed to write events cache key " << cacheKey << ": " << e.what();
                    },
                    "SETEX %s %d %s",
                    cacheKey.c_str(),
                    eventsCacheTtlSeconds(),
                    std::string(resp->getBody()).c_str());

                callback(resp);
            },
            [callback](const DrogonDbException& e) {
                callback(makeInternalErrorResponse("EventController DB query", e.base().what()));
            },
            minLng, minLat, maxLng, maxLat, startDate, endDate,
            ageCategoryFilter[0], ageCategoryFilter[1], ageCategoryFilter[2],
            artistFilterActive, artistIdSlots[0], artistIdSlots[1], artistIdSlots[2],
            artistIdSlots[3], artistIdSlots[4], festivalsOnlyFlag, festivalEndDate, eventTypeFilter);
    };

    redisClient->execCommandAsync(
        [callback, cacheKey, runDbQuery](const RedisResult& cached) {
            if (cached.type() == RedisResultType::kNil)
            {
                LOG_INFO << "Cache miss for " << cacheKey;
                runDbQuery();
                return;
            }
            LOG_INFO << "Cache hit for " << cacheKey;
            try
            {
                auto resp = HttpResponse::newHttpResponse();
                resp->setContentTypeCode(CT_APPLICATION_JSON);
                resp->setBody(cached.asString());
                callback(resp);
            }
            catch (const std::exception& e)
            {
                // RedisResult::asString() throws if the stored value isn't actually a
                // string (shouldn't happen — we only ever SETEX strings under this key
                // prefix — but a differently-typed value under the same key isn't
                // impossible if Redis is ever shared with something else).
                callback(makeInternalErrorResponse("EventController cache read", e.what()));
            }
        },
        [runDbQuery, cacheKey](const RedisException& e) {
            LOG_WARN << "Redis GET failed for " << cacheKey << ": " << e.what() << " — querying Postgres instead";
            runDbQuery();
        },
        "GET %s",
        cacheKey.c_str());
}
