-- The person being remembered, shown at the top of the public page and in
-- shared updates. Both are optional.
ALTER TABLE fundraiser ADD COLUMN memorial_name TEXT NOT NULL DEFAULT '';
ALTER TABLE fundraiser ADD COLUMN memorial_dates TEXT NOT NULL DEFAULT '';

UPDATE fundraiser SET name = 'Funeral fundraiser' WHERE id = 1 AND name = 'Our fundraiser';
