ALTER TABLE events ADD COLUMN age_category TEXT;

UPDATE events SET age_category = CASE
    WHEN ages = '21+' THEN '21+'
    WHEN ages IN ('18+', '19+') THEN '18+'
    ELSE 'Other'
END;

ALTER TABLE events ALTER COLUMN age_category SET NOT NULL;
ALTER TABLE events ALTER COLUMN age_category SET DEFAULT 'Other';

CREATE INDEX idx_events_age_category ON events (age_category);
