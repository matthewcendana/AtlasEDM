"""
Generates backend/config.json from config.json.template, filling in DB connection
details read from the repo root .env file.

Drogon's config file loader has no built-in environment-variable substitution, so this
script is the bridge: it keeps real credentials out of the template (which is committed
to git) and out of any hardcoded C++ source, while still letting the backend run off the
same .env file the Python sync script already uses.

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
    "__POSTGRES_HOST__": os.environ.get("POSTGRES_HOST", "localhost"),
    "__POSTGRES_PORT__": os.environ.get("POSTGRES_PORT", "5432"),
    "__POSTGRES_DB__": os.environ["POSTGRES_DB"],
    "__POSTGRES_USER__": os.environ["POSTGRES_USER"],
    "__POSTGRES_PASSWORD__": os.environ["POSTGRES_PASSWORD"],
}


def main():
    template = (BACKEND_DIR / "config.json.template").read_text()

    for placeholder, value in REPLACEMENTS.items():
        template = template.replace(placeholder, value)

    (BACKEND_DIR / "config.json").write_text(template)
    print(f"Wrote {BACKEND_DIR / 'config.json'}")


if __name__ == "__main__":
    main()
