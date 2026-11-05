-- Merged contributions: several payments from the same giver (a family that gave
-- three times) are listed publicly as one entry under one name. Each payment stays
-- a record of its own, with its M-Pesa message, statement match and history, and
-- separating them puts everything back as it was.
CREATE TABLE contribution_groups (
    id           INTEGER PRIMARY KEY,
    public_name  TEXT,                  -- NULL shows the anonymous label
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
ALTER TABLE transactions ADD COLUMN group_id INTEGER REFERENCES contribution_groups (id);
CREATE INDEX transactions_group ON transactions (group_id) WHERE group_id IS NOT NULL;

-- One payment out can cover several things (10,000 for shoes and clothing). The
-- items always add up to the payment, the money is counted once, and public lists
-- show each item.
CREATE TABLE expense_items (
    id              INTEGER PRIMARY KEY,
    transaction_id  INTEGER NOT NULL REFERENCES transactions (id),
    position        INTEGER NOT NULL,
    description     TEXT NOT NULL CHECK (length(description) > 0),
    amount_minor    INTEGER NOT NULL CHECK (amount_minor > 0),
    UNIQUE (transaction_id, position)
);
CREATE INDEX expense_items_transaction ON expense_items (transaction_id);
