-- One payment can come from several people: a contribution can be shared out
-- among names, equally or with an amount against each. The shares always add up
-- to the payment, the money is counted once, and public lists show each person.
CREATE TABLE contribution_shares (
    id              INTEGER PRIMARY KEY,
    transaction_id  INTEGER NOT NULL REFERENCES transactions (id),
    position        INTEGER NOT NULL,
    public_name     TEXT,               -- NULL shows the anonymous label
    amount_minor    INTEGER NOT NULL CHECK (amount_minor > 0),
    UNIQUE (transaction_id, position)
);
CREATE INDEX contribution_shares_transaction ON contribution_shares (transaction_id);
