-- Curated list of major festivals used to decide which events get "landmark pin"
-- treatment at low (world/continent) zoom levels on the map. name_pattern is matched
-- with ILIKE '%pattern%' against events.name rather than an exact match, since
-- Edmtrain's event names vary in capitalization and often append extra detail
-- (e.g. a specific stage or year) around the festival name itself.
CREATE TABLE flagship_festivals (
    id SERIAL PRIMARY KEY,
    name_pattern TEXT NOT NULL,
    location_hint TEXT
);

INSERT INTO flagship_festivals (name_pattern, location_hint) VALUES
    ('Tomorrowland', 'Boom Belgium'),
    ('EDC Las Vegas', 'Las Vegas USA'),
    ('Untold Festival', 'Cluj-Napoca Romania'),
    ('Ultra Music Festival', 'Miami USA'),
    ('Defqon.1', 'Sydney Australia'),
    ('Sunburn Festival', 'Mumbai India'),
    ('Creamfields', 'England UK'),
    ('Kappa FuturFestival', 'Turin Italy'),
    ('Boomtown Fair', 'England UK'),
    ('Parookaville', 'Weeze Germany'),
    ('Electric Love', 'Salzburg Austria'),
    ('Beyond Wonderland at The Gorge', 'George Washington USA'),
    ('Escape Halloween', 'San Bernardino California USA'),
    ('Niteharts', 'San Diego California USA'),
    ('Electric Daisy Carnival Japan', 'Tokyo Japan'),
    ('Tomorrowland Brasil', 'Itu São Paulo Brazil'),
    ('Electric Forest', 'Rothbury Michigan USA'),
    ('Sziget Festival', 'Budapest Hungary'),
    ('Awakenings Festival', 'Netherlands'),
    ('Mawazine', 'Rabat Morocco');

ALTER TABLE events ADD COLUMN is_flagship BOOLEAN NOT NULL DEFAULT FALSE;

-- One-time backfill for rows synced before this column existed. sync_events.py
-- applies the same ILIKE matching going forward at upsert time, so this is only
-- needed once, here.
UPDATE events e
SET is_flagship = TRUE
WHERE EXISTS (
    SELECT 1 FROM flagship_festivals fp
    WHERE e.name ILIKE '%' || fp.name_pattern || '%'
);

-- Partial index: every query against this column will be "give me the flagship
-- events" (the low-zoom landmark pins), never "give me the non-flagship ones", so
-- only the TRUE rows are worth indexing.
CREATE INDEX idx_events_is_flagship ON events (is_flagship) WHERE is_flagship = TRUE;
