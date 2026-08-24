#!/bin/sh
set -e

# Docker Compose's `env_file: .env` already injects these as real environment
# variables inside the container, so unlike generate_config.py (used for host runs)
# there's no .env file to read here — just substitute what the environment already
# has. The explicit variable list keeps envsubst from touching anything else that
# happens to look like ${...} in the template (there isn't anything else right now,
# but this is what makes that an invariant rather than an accident).
envsubst \
    '${POSTGRES_HOST} ${POSTGRES_PORT} ${POSTGRES_DB} ${POSTGRES_USER} ${POSTGRES_PASSWORD} ${REDIS_HOST} ${REDIS_PORT} ${BACKEND_PORT} ${ALLOWED_ORIGIN} ${EVENTS_CACHE_TTL_SECONDS}' \
    < config.json.template > config.json

exec ./backend
