#pragma once

#include <drogon/HttpResponse.h>
#include <trantor/utils/Logger.h>

namespace atlasedm
{
// Every endpoint's error responses share this shape: { "error": true, "message": "..." }
// — used for both client-input problems (400s, where `message` is safe to show as-is
// since it only describes what's wrong with the caller's own request) and unexpected
// failures (500s, via makeInternalErrorResponse below).
inline drogon::HttpResponsePtr makeErrorResponse(drogon::HttpStatusCode statusCode, const std::string& message)
{
    Json::Value json;
    json["error"] = true;
    json["message"] = message;

    auto resp = drogon::HttpResponse::newHttpJsonResponse(json);
    resp->setStatusCode(statusCode);
    return resp;
}

// For 500s specifically: `internalDetail` (a DB driver message, Redis error, etc.) is
// logged server-side via LOG_ERROR — it's the thing an operator needs to actually debug
// the failure — but never put in the response body. The client only ever sees a generic
// message; internal schema/query/infra details never leak to a caller over the network.
inline drogon::HttpResponsePtr makeInternalErrorResponse(const std::string& context,
                                                          const std::string& internalDetail)
{
    LOG_ERROR << context << ": " << internalDetail;
    return makeErrorResponse(drogon::k500InternalServerError, "An unexpected error occurred. Please try again.");
}
}  // namespace atlasedm
