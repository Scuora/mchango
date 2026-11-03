-- Challenges: fun games and dares that keep the fundraiser going. Each is a
-- kitty tracked on its own, like a sub-account, but its money is ordinary
-- fundraiser money in the main accounts and is counted once in the totals.
-- A challenge only groups the records that came in through it.
CREATE TABLE challenges (
    id              INTEGER PRIMARY KEY,
    name            TEXT    NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
    -- Optional Kiswahili versions; empty means the English is shown in both languages.
    name_sw         TEXT    NOT NULL DEFAULT '',
    description     TEXT    NOT NULL DEFAULT '',
    description_sw  TEXT    NOT NULL DEFAULT '',
    target_minor    INTEGER CHECK (target_minor IS NULL OR target_minor > 0),
    starts_on       TEXT,
    ends_on         TEXT,
    status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
    -- Shown on the public page with what it has raised.
    published       INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
);

-- The challenge a contribution or pledge came in through, if any.
ALTER TABLE transactions ADD COLUMN challenge_id INTEGER REFERENCES challenges (id);
CREATE INDEX transactions_challenge ON transactions (challenge_id) WHERE challenge_id IS NOT NULL;
