"""
Generates backend/config.json from config.json.template, filling in DB connection
details read from the repo root .env file.

Drogon's config file loader has no built-in environment-variable substitution, so this
script is the bridge for running the backend directly on the host: it keeps real
credentials out of the template (which is committed to git) and out of any hardcoded
C++ source, while still letting the backend run off the same .env file the Python sync
script already uses. The containerized backend (see backend/docker-entrypoint.sh) fills
the same ${VAR}-style template with `envsubst` instead, since Docker Compose already
injects .env as real environment variables inside the container — this script isn't
part of that path and isn't shipped in the runtime image.

Usage:
    python3 backend/generate_config.py
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent

load_dotenv(REPO_ROOT / ".env")

REPLACEMENTS = {
    "${POSTGRES_HOST}": os.environ.get("POSTGRES_HOST", "localhost"),
    "${POSTGRES_PORT}": os.environ.get("POSTGRES_PORT", "5432"),
    "${POSTGRES_DB}": os.environ["POSTGRES_DB"],
    "${POSTGRES_USER}": os.environ["POSTGRES_USER"],
    "${POSTGRES_PASSWORD}": os.environ["POSTGRES_PASSWORD"],
    "${REDIS_HOST}": os.environ.get("REDIS_HOST", "localhost"),
    "${REDIS_PORT}": os.environ.get("REDIS_PORT", "6379"),
    "${BACKEND_PORT}": os.environ.get("BACKEND_PORT", "8080"),
    "${ALLOWED_ORIGIN}": os.environ["ALLOWED_ORIGIN"],
    "${EVENTS_CACHE_TTL_SECONDS}": os.environ.get("EVENTS_CACHE_TTL_SECONDS", "1200"),
}


def main():
    template = (BACKEND_DIR / "config.json.template").read_text()

    for placeholder, value in REPLACEMENTS.items():
        template = template.replace(placeholder, value)

    (BACKEND_DIR / "config.json").write_text(template)
    print(f"Wrote {BACKEND_DIR / 'config.json'}")


if __name__ == "__main__":
    main()
