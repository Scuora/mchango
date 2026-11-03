-- A challenge can keep its own money: one of the fundraiser's accounts used only
-- for it, such as the organiser's M-Pesa line or a cash box. Money received there
-- belongs to the challenge and counts in the fundraiser's totals; what the account
-- still holds is owed to the main fund (a receivable) until it is handed over with
-- a transfer.
ALTER TABLE challenges ADD COLUMN account_id INTEGER REFERENCES accounts (id);
CREATE UNIQUE INDEX challenges_account ON challenges (account_id) WHERE account_id IS NOT NULL;

-- Optionally, where givers send money for the challenge (another phone number,
-- Paybill or till), shown publicly. Without a method, the fundraiser's own
-- giving details are used.
ALTER TABLE challenges ADD COLUMN giving_method TEXT
    CHECK (giving_method IS NULL OR giving_method IN ('paybill', 'till', 'phone'));
ALTER TABLE challenges ADD COLUMN giving_number TEXT NOT NULL DEFAULT '';
ALTER TABLE challenges ADD COLUMN giving_account TEXT NOT NULL DEFAULT '';
ALTER TABLE challenges ADD COLUMN giving_name TEXT NOT NULL DEFAULT '';
