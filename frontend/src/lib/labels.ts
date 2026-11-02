import type { Direction, ImportStatus, Kind, MatchStatus, ReconciliationStatus, StatusFilter } from "./types";

export const KIND_LABELS: Record<Kind, string> = {
  contribution: "Money received",
  expense: "Money spent",
  charge: "Charges",
  refund: "Refund",
  reversal: "Reversal",
  transfer: "Transfer between accounts",
  personal: "Personal",
  pledge: "Pledge",
  commitment: "Unpaid bill",
};

/** Choices for a type picker, with a short explanation each. */
export const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "contribution", label: "Money received" },
  { value: "expense", label: "Money spent" },
  { value: "charge", label: "Charges (transaction cost)" },
  { value: "refund", label: "Refund" },
  { value: "reversal", label: "Reversal" },
  { value: "transfer", label: "Transfer between accounts (e.g. withdrawal to cash)" },
  { value: "personal", label: "Personal (not fundraiser money)" },
  { value: "pledge", label: "Pledge (promise, no money yet)" },
  { value: "commitment", label: "Unpaid bill" },
];

export const RECONCILIATION_LABELS: Record<ReconciliationStatus, string> = {
  matched: "Matched to statement",
  conflict: "Statement disagrees",
  not_matched: "Not yet matched",
  not_applicable: "No statement",
};

export const MATCH_LABELS: Record<MatchStatus, string> = {
  matched: "Matched",
  missing: "Missing from records",
  conflict: "Conflict",
  review: "Needs review",
  no_effect: "No money moved",
};

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  queued: "Waiting to be read",
  processing: "Reading",
  ready: "Ready",
  failed: "Could not be read",
  discarded: "Discarded",
};

export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  needs_review: "Needs review",
  matched: "Matched to statement",
  not_matched: "Not yet matched",
  missing_receipt: "Missing receipt",
  removed: "Removed records",
};

export const ATTENTION_LABELS: Record<string, string> = {
  missing_purpose: "Purpose missing",
  missing_receipt: "No receipt",
  statement_conflict: "Statement disagrees",
};

export function needsDirection(kind: Kind | ""): boolean {
  return kind === "refund" || kind === "reversal" || kind === "personal";
}

export function movesMoney(kind: Kind | ""): boolean {
  return kind !== "pledge" && kind !== "commitment";
}

/** The direction implied by a kind, when it has only one. */
export function fixedDirection(kind: Kind | ""): Direction | null {
  if (kind === "contribution") return "in";
  if (kind === "expense" || kind === "charge" || kind === "transfer") return "out";
  return null;
}
