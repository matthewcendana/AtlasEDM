CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE venues (
    id SERIAL PRIMARY KEY,
    edmtrain_id INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    geom GEOGRAPHY(POINT, 4326)
);

CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    edmtrain_id INTEGER UNIQUE NOT NULL,
    name TEXT,
    link TEXT,
    ages TEXT,
    festival_ind BOOLEAN DEFAULT FALSE,
    livestream_ind BOOLEAN DEFAULT FALSE,
    electronic_genre_ind BOOLEAN DEFAULT FALSE,
    other_genre_ind BOOLEAN DEFAULT FALSE,
    event_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    created_date TIMESTAMPTZ,
    venue_id INTEGER REFERENCES venues(id)
);

CREATE TABLE artists (
    id SERIAL PRIMARY KEY,
    edmtrain_id INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    link TEXT
);

CREATE TABLE event_artists (
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
    b2b_ind BOOLEAN DEFAULT FALSE,
    position INTEGER,
    PRIMARY KEY (event_id, artist_id)
);

CREATE INDEX idx_venues_geom ON venues USING GIST (geom);
CREATE INDEX idx_events_date ON events (event_date);