-- A key sent once per "add transaction" form. Repeating the same submission
-- (a double tap, or a retry on a poor connection) returns the record already
-- saved instead of creating a second one.
ALTER TABLE transactions ADD COLUMN client_key TEXT;
CREATE UNIQUE INDEX transactions_client_key ON transactions (client_key) WHERE client_key IS NOT NULL;
