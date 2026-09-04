-- A bare name_pattern match (see migrations/004_flagship_festivals.sql) can't tell a
-- flagship festival apart from an unrelated event that merely shares its name — e.g.
-- "Niteharts" (San Diego) matched not just the real festival at Snapdragon Stadium but
-- also "BURNOUT - UNOFFICIAL NITEHARTS AFTERS" (an unofficial afterparty at a
-- different, generic "San Diego" venue) and a same-named "NITEHARTS" show at Pechanga
-- Arena San Diego — neither of which is the actual flagship festival. venue_pattern
-- adds an optional second ILIKE constraint, matched against the event's own venue name
-- rather than its own name, so a pattern can require *both* to disambiguate cases like
-- this. NULL (every existing row) means "no venue constraint" — identical behavior to
-- before this migration.
ALTER TABLE flagship_festivals ADD COLUMN venue_pattern TEXT;

UPDATE flagship_festivals SET venue_pattern = 'Snapdragon' WHERE name_pattern = 'Niteharts';

-- Recompute is_flagship for every existing row under the (now venue-aware) rule, the
-- same way 004's own backfill did when is_flagship was first introduced — otherwise
-- already-synced rows would keep their stale answer until the next daily sync.
UPDATE events e
SET is_flagship = EXISTS (
    SELECT 1
    FROM flagship_festivals fp
    LEFT JOIN venues v ON v.id = e.venue_id
    WHERE e.name ILIKE '%' || fp.name_pattern || '%'
      AND (fp.venue_pattern IS NULL OR v.name ILIKE '%' || fp.venue_pattern || '%')
);
