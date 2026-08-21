CREATE TABLE sync_log (
    id SERIAL PRIMARY KEY,
    run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    events_upserted INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
    error_message TEXT
);

CREATE INDEX idx_sync_log_status_run_at ON sync_log (status, run_at DESC);
