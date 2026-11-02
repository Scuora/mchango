-- A photo of the person being remembered, stored in private storage and shown
-- on the public page once it is published.
ALTER TABLE fundraiser ADD COLUMN memorial_photo TEXT;
ALTER TABLE fundraiser ADD COLUMN memorial_photo_type TEXT;
ALTER TABLE fundraiser ADD COLUMN memorial_photo_updated_at TEXT;
