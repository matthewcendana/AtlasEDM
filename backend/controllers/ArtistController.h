#pragma once

#include <drogon/HttpSimpleController.h>

using namespace drogon;

class ArtistController : public drogon::HttpSimpleController<ArtistController>
{
  public:
    void asyncHandleHttpRequest(const HttpRequestPtr& req, std::function<void (const HttpResponsePtr &)> &&callback) override;
    PATH_LIST_BEGIN
    PATH_ADD("/artists/search", Get);
    PATH_LIST_END
};
