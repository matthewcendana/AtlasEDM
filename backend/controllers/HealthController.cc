#include "HealthController.h"
#include "../utils/ErrorResponse.h"
#include <drogon/orm/DbClient.h>

using namespace drogon::orm;
using namespace atlasedm;

void HealthController::asyncHandleHttpRequest(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback)
{
    auto dbClient = drogon::app().getDbClient();

    dbClient->execSqlAsync(
        "SELECT COUNT(*) AS count FROM events",
        [callback](const Result &result)
        {
            // Drogon invokes this callback with no try/catch of its own, so an
            // unexpected result shape has to be caught here rather than left to escape
            // as an uncaught exception out of library internals.
            try
            {
                auto count = result[0]["count"].as<int64_t>();

                Json::Value json;
                json["status"] = "ok";
                json["events_count"] = static_cast<Json::Int64>(count);

                callback(HttpResponse::newHttpJsonResponse(json));
            }
            catch (const std::exception &e)
            {
                callback(makeInternalErrorResponse("HealthController response building", e.what()));
            }
        },
        [callback](const DrogonDbException &e)
        {
            callback(makeInternalErrorResponse("HealthController DB query", e.base().what()));
        });
}
