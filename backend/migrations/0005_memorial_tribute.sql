-- An optional line of tribute shown under the dates, e.g. a farewell in the
-- family's language.
ALTER TABLE fundraiser ADD COLUMN memorial_tribute TEXT NOT NULL DEFAULT '';
