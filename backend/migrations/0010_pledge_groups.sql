-- Who made a pledge: the family, or friends and well-wishers. The family's
-- pledges are its share of the target; the rest is asked of friends. Money
-- received is linked to the pledge it fulfils, so each pledge shows whether
-- it is still promised, part received or received.
ALTER TABLE transactions ADD COLUMN pledged_by TEXT CHECK (pledged_by IN ('family', 'friends'));

-- The single family pledge kept from Settings becomes an ordinary family pledge.
UPDATE transactions SET pledged_by = 'family'
 WHERE id = (SELECT family_pledge_id FROM fundraiser WHERE id = 1);
UPDATE transactions SET pledged_by = 'friends'
 WHERE pledged_by IS NULL
   AND id IN (SELECT transaction_id FROM transaction_versions WHERE is_current = 1 AND kind = 'pledge');
-- No longer used: the family's share is the sum of its pledges.
UPDATE fundraiser SET family_pledge_id = NULL;
