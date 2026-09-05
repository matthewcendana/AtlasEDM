# syntax=docker/dockerfile:1

# Runs sync_events.py inside the Compose network so it reaches Postgres by service
# name (see docker-compose.yml's `sync` service) instead of needing a host-published
# Postgres port. Built with `context: .` (repo root) — see docker-compose.yml — since
# requirements.txt lives there, not under sync/.
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY sync/sync_events.py ./sync_events.py

ENTRYPOINT ["python", "sync_events.py"]
