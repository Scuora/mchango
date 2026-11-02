-- The family's own pledge towards the target. It is an ordinary pledge record
-- (so changes keep their history and family payments can be linked to it);
-- this column says which one it is. Settings creates and corrects it.
ALTER TABLE fundraiser ADD COLUMN family_pledge_id INTEGER REFERENCES transactions(id);
