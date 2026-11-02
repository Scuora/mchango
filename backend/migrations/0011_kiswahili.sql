-- Optional Kiswahili versions of what the family writes for the public page.
-- Empty means the English is shown in both languages.
ALTER TABLE announcements ADD COLUMN title_sw TEXT NOT NULL DEFAULT '';
ALTER TABLE announcements ADD COLUMN body_sw TEXT NOT NULL DEFAULT '';
ALTER TABLE fundraiser ADD COLUMN description_sw TEXT NOT NULL DEFAULT '';
