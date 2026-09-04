#include "VenueController.h"
#include "../utils/ErrorResponse.h"
#include <drogon/orm/DbClient.h>

using namespace drogon::orm;
using namespace atlasedm;

namespace
{
constexpr size_t kMinQueryLength = 2;

// Mirrors EventController.cc's own fieldToJson: a NULL city/state (both nullable
// columns — see migrations/001_init.sql) becomes a JSON null instead of Field::as's
// silent ""-for-NULL, so the frontend can tell "no city on file" apart from "city is
// the empty string".
Json::Value fieldToJson(const Field& field)
{
    if (field.isNull())
    {
        return Json::Value(Json::nullValue);
    }
    return Json::Value(field.as<std::string>());
}
}  // namespace

void VenueController::asyncHandleHttpRequest(const HttpRequestPtr& req, std::function<void (const HttpResponsePtr &)> &&callback)
{
    const auto query = req->getParameter("query");
    if (query.empty())
    {
        callback(makeErrorResponse(k400BadRequest, "query is required"));
        return;
    }
    if (query.size() < kMinQueryLength)
    {
        callback(makeErrorResponse(
            k400BadRequest, "query must be at least " + std::to_string(kMinQueryLength) + " characters"));
        return;
    }

    // ILIKE with a leading wildcard can't use a plain btree index, but the venues
    // table is small enough (a few thousand rows) for a sequential scan to be fine
    // here too — same tradeoff ArtistController.cc already makes, see its own comment.
    // geom IS NOT NULL excludes venues Edmtrain never gave coordinates for (see
    // sync_events.py — geom is only set `WHEN longitude IS NOT NULL AND latitude IS
    // NOT NULL`); a venue with no coordinates can't be flown to, so it's not a useful
    // search result here.
    static const std::string sql =
        "SELECT id, name, city, state, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng "
        "FROM venues WHERE name ILIKE $1 AND geom IS NOT NULL ORDER BY name LIMIT 10";

    auto dbClient = drogon::app().getDbClient();
    dbClient->execSqlAsync(
        sql,
        [callback](const Result& result) {
            // Drogon invokes this callback with no try/catch of its own, so an
            // unexpected row shape has to be caught here rather than left to escape
            // as an uncaught exception out of library internals.
            try
            {
                Json::Value venues(Json::arrayValue);
                for (const auto& row : result)
                {
                    Json::Value venue;
                    venue["id"] = static_cast<Json::Int64>(row["id"].as<int64_t>());
                    venue["name"] = row["name"].as<std::string>();
                    venue["city"] = fieldToJson(row["city"]);
                    venue["state"] = fieldToJson(row["state"]);
                    venue["latitude"] = row["lat"].as<double>();
                    venue["longitude"] = row["lng"].as<double>();
                    venues.append(std::move(venue));
                }

                Json::Value json;
                json["venues"] = std::move(venues);
                callback(HttpResponse::newHttpJsonResponse(json));
            }
            catch (const std::exception& e)
            {
                callback(makeInternalErrorResponse("VenueController response building", e.what()));
            }
        },
        [callback](const DrogonDbException& e) {
            callback(makeInternalErrorResponse("VenueController DB query", e.base().what()));
        },
        "%" + query + "%");
}
