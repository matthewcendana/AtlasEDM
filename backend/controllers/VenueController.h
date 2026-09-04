#pragma once

#include <drogon/HttpSimpleController.h>

using namespace drogon;

class VenueController : public drogon::HttpSimpleController<VenueController>
{
  public:
    void asyncHandleHttpRequest(const HttpRequestPtr& req, std::function<void (const HttpResponsePtr &)> &&callback) override;
    PATH_LIST_BEGIN
    PATH_ADD("/venues/search", Get);
    PATH_LIST_END
};
