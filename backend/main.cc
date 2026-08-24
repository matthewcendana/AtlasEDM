#include <drogon/drogon.h>
#include <algorithm>
#include <cstdlib>
#include <iostream>
#include <sstream>
#include <vector>

using namespace drogon;

namespace
{
// Splits "http://localhost:3000, https://atlasedm.vercel.app" into trimmed origins.
// Reused by both advice callbacks below (registerSyncAdvice/registerPostHandlingAdvice
// are both global — they apply to every controller/route in the app, not something
// each controller opts into, so this one setup covers /health, /events, and
// /artists/search identically, including any endpoints added later).
std::vector<std::string> parseAllowedOrigins(const std::string& raw)
{
    std::vector<std::string> origins;
    std::stringstream stream(raw);
    std::string token;
    while (std::getline(stream, token, ','))
    {
        const auto start = token.find_first_not_of(" \t");
        const auto end = token.find_last_not_of(" \t");
        if (start != std::string::npos)
        {
            origins.push_back(token.substr(start, end - start + 1));
        }
    }
    return origins;
}

bool isAllowedOrigin(const std::vector<std::string>& allowedOrigins, const std::string& origin)
{
    return std::find(allowedOrigins.begin(), allowedOrigins.end(), origin) != allowedOrigins.end();
}

// Drogon has no built-in CORS config, so this follows the framework's own recommended
// pattern: a pre-routing advice answers OPTIONS preflight requests, and a post-handling
// advice adds the CORS headers to every real response.
void setupCors(const std::vector<std::string>& allowedOrigins)
{
    app().registerSyncAdvice(
        [allowedOrigins](const HttpRequestPtr& req) -> HttpResponsePtr {
            const auto& origin = req->getHeader("Origin");
            if (req->method() == HttpMethod::Options && isAllowedOrigin(allowedOrigins, origin))
            {
                auto resp = HttpResponse::newHttpResponse();
                resp->addHeader("Access-Control-Allow-Origin", origin);
                resp->addHeader("Access-Control-Allow-Methods",
                                 "GET, POST, PUT, DELETE, OPTIONS");
                resp->addHeader("Access-Control-Allow-Headers", "Content-Type");
                return resp;
            }
            return {};
        });

    app().registerPostHandlingAdvice(
        [allowedOrigins](const HttpRequestPtr& req, const HttpResponsePtr& resp) {
            const auto& origin = req->getHeader("Origin");
            if (isAllowedOrigin(allowedOrigins, origin))
            {
                resp->addHeader("Access-Control-Allow-Origin", origin);
            }
        });
}

// Fails fast with a clear message on missing/malformed required config, rather than
// letting it surface confusingly on whatever request happens to touch it first (e.g.
// CORS headers silently missing because allowed_origins came back empty, or the cache
// TTL silently becoming 0 and every /events request refusing to cache). This only
// checks config *presence*, not live connectivity to Postgres/Redis — a service being
// briefly unreachable while docker-compose starts everything up is a normal, transient
// condition Drogon's own DB/Redis clients already retry through, not a config error.
void requireConfig(const std::vector<std::string>& allowedOrigins)
{
    if (allowedOrigins.empty())
    {
        std::cerr << "FATAL: ALLOWED_ORIGIN is not configured (empty after parsing). "
                  << "Set it in .env and re-run backend/generate_config.py." << std::endl;
        std::exit(1);
    }
    if (app().getCustomConfig()["events_cache_ttl_seconds"].asInt() <= 0)
    {
        std::cerr << "FATAL: events_cache_ttl_seconds is missing or not a positive integer "
                  << "in config.json. Set EVENTS_CACHE_TTL_SECONDS in .env and re-run "
                  << "backend/generate_config.py." << std::endl;
        std::exit(1);
    }
}
}  // namespace

int main()
{
    app().loadConfigFile("config.json");

    const auto allowedOrigins = parseAllowedOrigins(app().getCustomConfig()["allowed_origins"].asString());
    requireConfig(allowedOrigins);
    setupCors(allowedOrigins);

    app().run();
    return 0;
}
