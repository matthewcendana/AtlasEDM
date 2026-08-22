#pragma once

#include <drogon/HttpSimpleController.h>

using namespace drogon;

class HealthController : public drogon::HttpSimpleController<HealthController>
{
  public:
    void asyncHandleHttpRequest(const HttpRequestPtr& req, std::function<void (const HttpResponsePtr &)> &&callback) override;
    PATH_LIST_BEGIN
    PATH_ADD("/health", Get);
    PATH_LIST_END
};
