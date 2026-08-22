#pragma once

#include <drogon/HttpSimpleController.h>

using namespace drogon;

class EventController : public drogon::HttpSimpleController<EventController>
{
  public:
    void asyncHandleHttpRequest(const HttpRequestPtr& req, std::function<void (const HttpResponsePtr &)> &&callback) override;
    PATH_LIST_BEGIN
    PATH_ADD("/events", Get);
    PATH_LIST_END
};
