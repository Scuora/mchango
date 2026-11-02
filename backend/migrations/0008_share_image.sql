-- A 1200 x 630 image for link previews (WhatsApp, Facebook and others),
-- created in the browser from the memorial photo, name and dates.
ALTER TABLE fundraiser ADD COLUMN share_image TEXT;
ALTER TABLE fundraiser ADD COLUMN share_image_updated_at TEXT;
