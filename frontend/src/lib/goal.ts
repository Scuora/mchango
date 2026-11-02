// The funeral budget as the family presents it: the family pledges its own
// share first, and friends and well-wishers are asked for the rest. Pledges
// are promises; money received is linked to the pledge it fulfils, so it is
// never counted twice and each side shows what is promised and what is in.

import type { PledgeTotals } from "./types";

export interface Goal {
  target: number | null;
  /** What the family has pledged in all. */
  familyPledged: number;
  /** Money received against the family's pledges. */
  familyReceived: number;
  /** The family's pledges not yet received. */
  familyOutstanding: number;
  /** Every other contribution: friends and well-wishers, pledged or not. */
  othersReceived: number;
  /** Friends' pledges not yet received. */
  othersOutstanding: number;
  /** The part of the target asked of friends and well-wishers. */
  othersShare: number | null;
  /** What is still needed once every pledge is paid, never below zero. */
  stillNeeded: number | null;
}

export function goalOf(target: number | null, pledges: PledgeTotals | null, contributions: number): Goal | null {
  const family = pledges?.family;
  const friends = pledges?.friends;
  if (!target && !family?.count && !friends?.count) return null;
  const familyPledged = family?.pledged_minor ?? 0;
  const familyReceived = family?.received_minor ?? 0;
  const familyOutstanding = family?.outstanding_minor ?? 0;
  const othersReceived = Math.max(0, contributions - familyReceived);
  const othersOutstanding = friends?.outstanding_minor ?? 0;
  const covered = familyReceived + familyOutstanding + othersReceived + othersOutstanding;
  return {
    target,
    familyPledged,
    familyReceived,
    familyOutstanding,
    othersReceived,
    othersOutstanding,
    othersShare: target ? Math.max(0, target - familyPledged) : null,
    stillNeeded: target ? Math.max(0, target - covered) : null,
  };
}
