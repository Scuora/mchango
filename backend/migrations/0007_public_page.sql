-- What the public page needs so people can act on it: how to give, the funeral
-- details, the organisers who stand behind the page, and announcements.

ALTER TABLE fundraiser ADD COLUMN giving_method TEXT
    CHECK (giving_method IS NULL OR giving_method IN ('paybill', 'till', 'phone'));
ALTER TABLE fundraiser ADD COLUMN giving_number TEXT NOT NULL DEFAULT '';
ALTER TABLE fundraiser ADD COLUMN giving_account TEXT NOT NULL DEFAULT '';
-- The name M-Pesa shows before the PIN, so givers can check they have the right account.
ALTER TABLE fundraiser ADD COLUMN giving_name TEXT NOT NULL DEFAULT '';
ALTER TABLE fundraiser ADD COLUMN funeral_when TEXT NOT NULL DEFAULT '';
ALTER TABLE fundraiser ADD COLUMN funeral_where TEXT NOT NULL DEFAULT '';
ALTER TABLE fundraiser ADD COLUMN funeral_map_url TEXT NOT NULL DEFAULT '';
-- JSON array of {name, role, phone}, shown publicly by the family's choice.
ALTER TABLE fundraiser ADD COLUMN organisers TEXT NOT NULL DEFAULT '[]';
ALTER TABLE fundraiser ADD COLUMN show_contribution_amounts INTEGER NOT NULL DEFAULT 1
    CHECK (show_contribution_amounts IN (0, 1));

CREATE TABLE announcements (
    id          INTEGER PRIMARY KEY,
    title       TEXT    NOT NULL CHECK (length(trim(title)) > 0),
    body        TEXT    NOT NULL DEFAULT '',
    pinned      INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    published   INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

CREATE INDEX announcements_listing ON announcements (published, pinned, created_at);
