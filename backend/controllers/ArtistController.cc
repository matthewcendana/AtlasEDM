#include "ArtistController.h"
#include "../utils/ErrorResponse.h"
#include <drogon/orm/DbClient.h>

using namespace drogon::orm;
using namespace atlasedm;

namespace
{
constexpr size_t kMinQueryLength = 2;
}  // namespace

void ArtistController::asyncHandleHttpRequest(const HttpRequestPtr& req, std::function<void (const HttpResponsePtr &)> &&callback)
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

    // ILIKE with a leading wildcard can't use a plain btree index, but the artists
    // table is small (a few thousand rows) so a sequential scan is fine for now. If it
    // grows large enough to matter, a pg_trgm GIN index on name would be the fix.
    static const std::string sql =
        "SELECT id, name FROM artists WHERE name ILIKE $1 ORDER BY name LIMIT 10";

    auto dbClient = drogon::app().getDbClient();
    dbClient->execSqlAsync(
        sql,
        [callback](const Result& result) {
            // Drogon invokes this callback with no try/catch of its own, so an
            // unexpected row shape has to be caught here rather than left to escape
            // as an uncaught exception out of library internals.
            try
            {
                Json::Value artists(Json::arrayValue);
                for (const auto& row : result)
                {
                    Json::Value artist;
                    artist["id"] = static_cast<Json::Int64>(row["id"].as<int64_t>());
                    artist["name"] = row["name"].as<std::string>();
                    artists.append(std::move(artist));
                }

                Json::Value json;
                json["artists"] = std::move(artists);
                callback(HttpResponse::newHttpJsonResponse(json));
            }
            catch (const std::exception& e)
            {
                callback(makeInternalErrorResponse("ArtistController response building", e.what()));
            }
        },
        [callback](const DrogonDbException& e) {
            callback(makeInternalErrorResponse("ArtistController DB query", e.base().what()));
        },
        "%" + query + "%");
}
