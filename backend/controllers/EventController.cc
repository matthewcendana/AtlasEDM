#include "EventController.h"
#include <drogon/orm/DbClient.h>
#include <array>
#include <chrono>
#include <ctime>
#include <regex>

using namespace drogon::orm;

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

bool isValidIsoDate(const std::string& text)
{
    static const std::regex isoDatePattern(R"(^\d{4}-\d{2}-\d{2}$)");
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
// always binds exactly 3 slots regardless of which bucket was requested, padding unused
// slots with "" (a value age_category can never hold) — Drogon's execSqlAsync resolves
// its parameter list at compile time via templates, so the *number* of bound
// parameters has to be fixed in the C++ source; it can't vary per request. Buckets are
// treated as an ordered threshold (Other < 18+ < 21+), so minAge is inclusive upward:
// minAge=18 matches 18+ and 21+ (21 satisfies "at least 18"), minAge=21 matches only
// 21+ (nothing stricter exists), and minAge=other matches all three (Other is the
// bottom of the scale, so "at least Other" is every event).
bool resolveAgeCategoryFilter(const std::string& minAge, std::array<std::string, 3>& slots)
{
    if (minAge.empty())
    {
        slots = {"21+", "18+", "Other"};
    }
    else if (minAge == "21")
    {
        slots = {"21+", "", ""};
    }
    else if (minAge == "18")
    {
        slots = {"21+", "18+", ""};
    }
    else if (minAge == "other")
    {
        slots = {"21+", "18+", "Other"};
    }
    else
    {
        return false;
    }
    return true;
}

std::string formatDate(std::time_t time)
{
    std::tm tmValue{};
    gmtime_r(&time, &tmValue);
    char buf[11];
    std::strftime(buf, sizeof(buf), "%Y-%m-%d", &tmValue);
    return std::string(buf);
}

// Default window: today through 90 days out. Computed in UTC so it doesn't
// drift with the server's local timezone.
std::pair<std::string, std::string> defaultDateRange()
{
    const std::time_t now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
    const std::time_t ninetyDaysOut = now + (90 * 24 * 60 * 60);
    return {formatDate(now), formatDate(ninetyDaysOut)};
}

HttpResponsePtr makeErrorResponse(HttpStatusCode statusCode, const std::string& message)
{
    Json::Value json;
    json["status"] = "error";
    json["message"] = message;

    auto resp = HttpResponse::newHttpJsonResponse(json);
    resp->setStatusCode(statusCode);
    return resp;
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

    // --- minAge: optional, one of "18", "21", "other" ---
    std::array<std::string, 3> ageCategoryFilter;
    if (!resolveAgeCategoryFilter(req->getParameter("minAge"), ageCategoryFilter))
    {
        callback(makeErrorResponse(k400BadRequest, R"(minAge must be one of "18", "21", or "other")"));
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
            a.name AS artist_name,
            ea.b2b_ind AS artist_b2b_ind
        FROM venues v
        JOIN events e ON e.venue_id = v.id
        LEFT JOIN event_artists ea ON ea.event_id = e.id
        LEFT JOIN artists a ON a.id = ea.artist_id
        WHERE v.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography
          AND e.event_date BETWEEN $5::date AND $6::date
          AND e.age_category IN ($7, $8, $9)
        ORDER BY v.id, e.event_date, e.start_time NULLS LAST, e.id, ea.position NULLS LAST
    )";

    auto dbClient = drogon::app().getDbClient();
    dbClient->execSqlAsync(
        sql,
        [callback, eventsPerVenue](const Result& result) {
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
            callback(HttpResponse::newHttpJsonResponse(json));
        },
        [callback](const DrogonDbException& e) {
            callback(makeErrorResponse(k500InternalServerError, e.base().what()));
        },
        minLng, minLat, maxLng, maxLat, startDate, endDate,
        ageCategoryFilter[0], ageCategoryFilter[1], ageCategoryFilter[2]);
}
