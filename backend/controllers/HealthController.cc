#include "HealthController.h"
#include <drogon/orm/DbClient.h>

using namespace drogon::orm;

void HealthController::asyncHandleHttpRequest(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback)
{
    auto dbClient = drogon::app().getDbClient();

    dbClient->execSqlAsync(
        "SELECT COUNT(*) AS count FROM events",
        [callback](const Result &result)
        {
            auto count = result[0]["count"].as<int64_t>();

            Json::Value json;
            json["status"] = "ok";
            json["events_count"] = static_cast<Json::Int64>(count);

            callback(HttpResponse::newHttpJsonResponse(json));
        },
        [callback](const DrogonDbException &e)
        {
            Json::Value json;
            json["status"] = "error";
            json["message"] = e.base().what();

            auto resp = HttpResponse::newHttpJsonResponse(json);
            resp->setStatusCode(k500InternalServerError);
            callback(resp);
        });
}
