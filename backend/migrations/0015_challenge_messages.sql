-- A challenge can keep several WhatsApp messages of the family's own (its own
-- appeal, the fundraiser's general update, ...), each filled in with the latest
-- figures when copied. They replace the single message_template.
CREATE TABLE challenge_messages (
    id            INTEGER PRIMARY KEY,
    challenge_id  INTEGER NOT NULL REFERENCES challenges (id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    title         TEXT    NOT NULL CHECK (length(trim(title)) > 0),
    body          TEXT    NOT NULL CHECK (length(trim(body)) > 0),
    UNIQUE (challenge_id, position)
);

INSERT INTO challenge_messages (challenge_id, position, title, body)
SELECT id, 0, 'Challenge message', message_template FROM challenges WHERE length(trim(message_template)) > 0;

ALTER TABLE challenges DROP COLUMN message_template;
