#include <drogon/drogon.h>

using namespace drogon;

namespace
{
const std::string kAllowedOrigin = "http://localhost:3000";

// Only the Next.js dev server origin is allowed for now; there's no production
// frontend yet. Drogon has no built-in CORS config, so this follows the framework's
// own recommended pattern: a pre-routing advice answers OPTIONS preflight requests,
// and a post-handling advice adds the CORS headers to every real response.
void setupCors()
{
    app().registerSyncAdvice(
        [](const HttpRequestPtr& req) -> HttpResponsePtr {
            if (req->method() == HttpMethod::Options &&
                req->getHeader("Origin") == kAllowedOrigin)
            {
                auto resp = HttpResponse::newHttpResponse();
                resp->addHeader("Access-Control-Allow-Origin", kAllowedOrigin);
                resp->addHeader("Access-Control-Allow-Methods",
                                 "GET, POST, PUT, DELETE, OPTIONS");
                resp->addHeader("Access-Control-Allow-Headers", "Content-Type");
                return resp;
            }
            return {};
        });

    app().registerPostHandlingAdvice(
        [](const HttpRequestPtr& req, const HttpResponsePtr& resp) {
            if (req->getHeader("Origin") == kAllowedOrigin)
            {
                resp->addHeader("Access-Control-Allow-Origin", kAllowedOrigin);
            }
        });
}
}  // namespace

int main()
{
    app().loadConfigFile("config.json");
    setupCors();
    app().run();
    return 0;
}
