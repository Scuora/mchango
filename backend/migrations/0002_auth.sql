-- Management accounts and sessions. Passwords are stored only as Argon2id
-- hashes; session cookies only as SHA-256 hashes.

CREATE TABLE users (
    id                   INTEGER PRIMARY KEY,
    username             TEXT    NOT NULL UNIQUE
                         CHECK (username = lower(username) AND length(username) BETWEEN 3 AND 32),
    password_hash        TEXT    NOT NULL,
    created_at           TEXT    NOT NULL,
    password_changed_at  TEXT    NOT NULL
);

CREATE TABLE sessions (
    token_hash    TEXT    PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at    TEXT    NOT NULL,
    expires_at    TEXT    NOT NULL,
    last_seen_at  TEXT    NOT NULL
);

CREATE INDEX sessions_user ON sessions (user_id);

-- Who made each change: a username, or 'system' for background processing.
ALTER TABLE change_log ADD COLUMN actor TEXT;
