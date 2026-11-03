// Mirrors the backend's JSON (serde) structures. Money is always an integer
// number of KES minor units (cents) in fields ending in `_minor`.
// Instants are UTC RFC 3339 strings; plain dates are `YYYY-MM-DD` (Nairobi).

export type Kind =
  | "contribution"
  | "expense"
  | "charge"
  | "refund"
  | "reversal"
  | "transfer"
  | "personal"
  | "pledge"
  | "commitment";

export type Direction = "in" | "out";
export type AccountKind = "mpesa" | "bank" | "cash";
export type ReconciliationStatus = "matched" | "conflict" | "not_matched" | "not_applicable";
export type Attention = "missing_purpose" | "missing_receipt" | "statement_conflict";
export type StatusFilter = "needs_review" | "matched" | "not_matched" | "missing_receipt" | "removed";

export interface Account {
  id: number;
  name: string;
  kind: AccountKind;
  number_hint: string | null;
  created_at: string;
}

export interface AccountInput {
  name: string;
  kind: AccountKind;
  number_hint: string | null;
}

export interface Fundraiser {
  name: string;
  description: string;
  /** Kiswahili version of `description`; empty shows the English in both languages. */
  description_sw: string;
  memorial_name: string;
  memorial_dates: string;
  memorial_tribute: string;
  target_minor: number | null;
  start_date: string | null;
  opening_funds_minor: number;
  opening_funds_date: string | null;
  opening_funds_note: string;
  opening_funds_account_id: number | null;
  anonymous_label: string;
  show_reference_hint: boolean;
  show_promises: boolean;
  public_page_enabled: boolean;
  is_demo: boolean;
  updated_at: string;
  memorial_photo_updated_at: string | null;
  giving_method: GivingMethod | null;
  giving_number: string;
  giving_account: string;
  giving_name: string;
  funeral_when: string;
  funeral_where: string;
  funeral_map_url: string;
  show_contribution_amounts: boolean;
  share_image_updated_at: string | null;
  organisers: Organiser[];
}

export type GivingMethod = "paybill" | "till" | "phone";

export interface Organiser {
  name: string;
  role: string;
  phone: string;
}

export interface PublicDetailsUpdate {
  giving_method: GivingMethod | null;
  giving_number: string;
  giving_account: string;
  giving_name: string;
  funeral_when: string;
  funeral_where: string;
  funeral_map_url: string;
  organisers: Organiser[];
  show_contribution_amounts: boolean;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  /** Kiswahili versions; empty when not added. */
  title_sw: string;
  body_sw: string;
  pinned: boolean;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  title_sw: string;
  body_sw: string;
  pinned: boolean;
  published: boolean;
}

export interface FundraiserUpdate {
  name: string;
  description: string;
  description_sw: string;
  memorial_name: string;
  memorial_dates: string;
  memorial_tribute: string;
  target_minor: number | null;
  start_date: string | null;
  opening_funds_minor: number | null;
  opening_funds_date: string | null;
  opening_funds_note: string;
  opening_funds_account_id: number | null;
  anonymous_label: string;
  show_reference_hint: boolean;
  show_promises: boolean;
  public_page_enabled: boolean;
}

export interface Totals {
  opening_funds_minor: number;
  contributions_minor: number;
  contributions_count: number;
  expenses_minor: number;
  expenses_count: number;
  charges_minor: number;
  charges_count: number;
  refunds_paid_minor: number;
  refunds_received_minor: number;
  reversals_in_minor: number;
  reversals_out_minor: number;
  remaining_minor: number;
  pledged_outstanding_minor: number;
  unpaid_bills_minor: number;
}

export interface ListItem {
  id: number;
  version: number;
  kind: Kind;
  direction: Direction | null;
  amount_minor: number;
  occurred_at: string;
  recorded_at: string;
  account_id: number | null;
  account_name: string | null;
  to_account_id: number | null;
  to_account_name: string | null;
  reference: string | null;
  is_fee: boolean;
  removed: boolean;
  counterparty: string | null;
  related_transaction_id: number | null;
  public_name: string | null;
  description: string;
  notes: string;
  pledged_by: PledgedBy | null;
  /** The challenge it came in through, if any. */
  challenge_id: number | null;
  challenge_name: string | null;
  /** For a payment from several people: who it is from, each with their part. */
  shares: Share[];
  receipt_count: number;
  reconciliation: ReconciliationStatus;
  attention: Attention[];
}

export interface ListResponse {
  items: ListItem[];
  total: number;
}

export interface VersionView {
  version: number;
  is_current: boolean;
  removed: boolean;
  kind: Kind;
  direction: Direction | null;
  amount_minor: number;
  occurred_at: string;
  account_name: string | null;
  to_account_name: string | null;
  reference: string | null;
  reason: string | null;
  created_at: string;
}

export interface DocumentView {
  id: number;
  kind: "sms" | "receipt" | "statement";
  text_content: string | null;
  original_name: string | null;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
  published_at: string | null;
}

export interface StatementLink {
  import_id: number;
  row_id: number;
  position: number;
  period_start: string | null;
  period_end: string | null;
  account_name: string;
  match_status: MatchStatus;
  match_method: string | null;
  match_note: string | null;
  amount_minor: number | null;
  completed_at: string | null;
  details: string;
}

export interface ChangeEntry {
  id: number;
  at: string;
  action: string;
  summary: string;
  reason: string | null;
  /** Username, or "system" for background processing. */
  actor: string | null;
}

export interface SessionUser {
  username: string;
}

export interface Detail {
  transaction: ListItem;
  versions: VersionView[];
  documents: DocumentView[];
  statement_links: StatementLink[];
  related: ListItem | null;
  linked: ListItem[];
  history: ChangeEntry[];
}

export interface MovementInput {
  kind: Kind;
  direction: Direction | null;
  amount_minor: number;
  occurred_at: string;
  account_id: number | null;
  to_account_id: number | null;
  reference: string | null;
  is_fee: boolean;
  related_transaction_id: number | null;
  counterparty: string | null;
}

export interface Presentation {
  public_name: string | null;
  description: string;
  notes: string;
  /** Pledges only. */
  pledged_by?: PledgedBy | null;
}

export interface CreateRequest {
  movement: MovementInput;
  presentation: Presentation;
  source_message: string | null;
  charge_minor: number | null;
  /** One per form: resubmitting returns the record already saved. */
  client_key: string | null;
  /** Sent after the person confirms a possible-duplicate warning. */
  confirm_possible_duplicate: boolean;
  /** The challenge it came in through. Money for a pledge made in a challenge joins it unless set. */
  challenge_id?: number | null;
  /** For a payment from several people: who it is from. The parts must add up to the amount. */
  shares?: Share[] | null;
}

/** One person's part of a payment shared by several people. */
export interface Share {
  /** Null shows the anonymous label. */
  public_name: string | null;
  amount_minor: number;
}

export interface Created {
  id: number;
  charge_id: number | null;
}

export interface CorrectionRequest {
  reason: string;
  replacement: MovementInput | null;
}

export interface Field<T> {
  value: T | null;
  certain: boolean;
  note?: string;
}

export type MessageFormat =
  | "received"
  | "sent"
  | "pay_bill"
  | "buy_goods"
  | "withdrawal"
  | "deposit"
  | "airtime"
  | "reversal";

export interface ParsedMessage {
  recognised: boolean;
  format: MessageFormat | null;
  format_label: string;
  reference: Field<string>;
  occurred_at: Field<string>;
  amount_minor: Field<number>;
  direction: Field<Direction>;
  charge_minor: Field<number>;
  suggested_kind: Kind | null;
  counterparty: string | null;
  counterparty_name: string | null;
  original_reference: string | null;
  warnings: string[];
}

export interface ParseResponse {
  parsed: ParsedMessage;
  already_recorded_id: number | null;
}

// Statements and reconciliation

export type ImportStatus = "queued" | "processing" | "ready" | "failed" | "discarded";
export type MatchStatus = "matched" | "missing" | "conflict" | "review" | "no_effect";

export interface ImportSummary {
  id: number;
  account_id: number;
  account_name: string;
  status: ImportStatus;
  attempts: number;
  error_code: string | null;
  error_message: string | null;
  layout: string | null;
  holder_name: string | null;
  holder_number: string | null;
  period_start: string | null;
  period_end: string | null;
  opening_balance_minor: number | null;
  closing_balance_minor: number | null;
  balance_breaks: number | null;
  created_at: string;
  processed_at: string | null;
  completed_at: string | null;
  discarded_at: string | null;
  original_name: string | null;
  file_sha256: string;
  row_count: number;
  unresolved_count: number;
}

export interface Suggestion {
  kind: Kind;
  related_transaction_id: number | null;
}

export interface RowView {
  id: number;
  position: number;
  page: number | null;
  receipt: string | null;
  completed_at: string | null;
  details: string;
  row_status: string | null;
  direction: Direction | null;
  amount_minor: number | null;
  balance_minor: number | null;
  is_fee: boolean;
  parse_note: string | null;
  match_status: MatchStatus;
  transaction_id: number | null;
  candidate_transaction_id: number | null;
  match_method: string | null;
  match_note: string | null;
  decided_at: string | null;
  suggestion: Suggestion | null;
}

export interface RowCounts {
  matched: number;
  missing: number;
  conflict: number;
  review: number;
  no_effect: number;
}

export interface BalanceCheck {
  opening_balance_minor: number | null;
  closing_balance_minor: number | null;
  statement_in_minor: number;
  statement_out_minor: number;
  unreadable_rows: number;
  balance_breaks: number;
  statement_adds_up: boolean;
  ledger_in_minor: number;
  ledger_out_minor: number;
  unexplained_difference_minor: number | null;
}

export interface Readiness {
  can_complete: boolean;
  blockers: string[];
}

export interface ImportDetail {
  import: ImportSummary;
  rows: RowView[];
  counts: RowCounts;
  related: ListItem[];
  ledger_only: ListItem[];
  balance: BalanceCheck | null;
  readiness: Readiness;
  reconciled: boolean;
  expenses_missing_receipts: number;
  number_warning: string | null;
}

export interface CreateFromRow {
  kind: Kind;
  other_account_id: number | null;
  related_transaction_id: number | null;
  presentation: Presentation;
}

export interface ReconciledPeriod {
  account_id: number;
  account_name: string;
  import_id: number;
  period_start: string;
  period_end: string;
  completed_at: string;
}

export interface AccountFunds {
  account_id: number;
  name: string;
  kind: AccountKind;
  amount_minor: number;
  /** Set when the account keeps a challenge's own money: owed to the main fund. */
  challenge_id: number | null;
}

export interface Overview {
  fundraiser: Fundraiser;
  totals: Totals;
  funds_by_account: AccountFunds[];
  awaiting_reconciliation: number;
  needs_review: number;
  missing_receipts: number;
  statement_rows_to_resolve: number;
  imports_in_progress: number;
  reconciled_periods: ReconciledPeriod[];
  recent: ListItem[];
  pledges: PledgeTotals;
  /** Every challenge with what it has brought in (already part of the totals). */
  challenges: ChallengeSummary[];
  /** Part of the remaining funds still held in challenges' own accounts: a receivable until handed over. */
  held_by_challenges_minor: number;
}

export type ChallengeStatus = "active" | "closed";

/** A fun game or dare that raises money. Its money is ordinary fundraiser money, counted once in the totals. */
export interface Challenge {
  id: number;
  name: string;
  /** Kiswahili versions; empty shows the English in both languages. */
  name_sw: string;
  description: string;
  description_sw: string;
  target_minor: number | null;
  /** Nairobi dates. */
  starts_on: string | null;
  ends_on: string | null;
  status: ChallengeStatus;
  published: boolean;
  /** The account it keeps its own money in, if any. */
  account_id: number | null;
  account_name: string | null;
  /** Where givers send money for it, when not the fundraiser's own number. Null uses the fundraiser's details. */
  giving_method: GivingMethod | null;
  giving_number: string;
  giving_account: string;
  giving_name: string;
  /** The family's own WhatsApp message with placeholders such as {list}; empty uses the standard update. */
  message_template: string;
  created_at: string;
  updated_at: string;
}

export interface ChallengeTotals {
  raised_minor: number;
  contributions_count: number;
  pledged_minor: number;
  /** Pledged through the challenge, not yet received. */
  pledged_outstanding_minor: number;
  last_received_at: string | null;
  /** With its own account: what it still holds, owed to the main fund until handed over. */
  held_minor: number | null;
  /** With its own account: what it has handed over to the main account. */
  handed_over_minor: number | null;
}

export interface ChallengeSummary extends Challenge {
  totals: ChallengeTotals;
}

export interface ChallengeInput {
  name: string;
  name_sw: string;
  description: string;
  description_sw: string;
  target_minor: number | null;
  starts_on: string | null;
  ends_on: string | null;
  status: ChallengeStatus;
  published: boolean;
  account_id: number | null;
  giving_method: GivingMethod | null;
  giving_number: string;
  giving_account: string;
  giving_name: string;
  message_template: string;
}

export interface PublicChallenge {
  id: number;
  name: string;
  name_sw: string | null;
  description: string;
  description_sw: string | null;
  target_minor: number | null;
  starts_on: string | null;
  ends_on: string | null;
  status: ChallengeStatus;
  raised_minor: number;
  contributions_count: number;
  pledged_outstanding_minor: number;
  /** When it keeps its own money: what it still holds and what it has handed over. */
  held_minor?: number | null;
  handed_over_minor?: number | null;
  /** Where to send money for it, when not the fundraiser's own number. */
  giving?: { method: GivingMethod; number: string; account: string | null; name: string } | null;
}

/** Who made a pledge: the family's pledges are its share of the target. */
export type PledgedBy = "family" | "friends";
export type PledgeStatus = "pledged" | "part_received" | "received";

/** Pledges by one group, added up. */
export interface PledgeGroup {
  count: number;
  pledged_minor: number;
  /** Money received against these pledges (linked contributions). */
  received_minor: number;
  /** Still promised: each pledge's unpaid part. */
  outstanding_minor: number;
}

export interface PledgeTotals {
  family: PledgeGroup;
  friends: PledgeGroup;
}

/** A pledge as management sees it, with what has come in against it. */
export interface ManagedPledge {
  id: number;
  pledged_by: PledgedBy;
  amount_minor: number;
  received_minor: number;
  status: PledgeStatus;
  public_name: string | null;
  description: string;
  occurred_at: string;
}

export interface PublicPledge {
  date: string;
  label: string;
  pledged_by: PledgedBy;
  /** Null when the family chose not to show individual amounts. */
  amount_minor: number | null;
  received_minor: number | null;
  status: PledgeStatus;
}

// Public page (allowlisted fields only)

export interface PublicReceipt {
  url: string;
  content_type: string;
}

export interface PublicEntry {
  /** Nairobi calendar date. */
  date: string;
  /** UTC instant of the transaction. */
  at: string;
  kind: Kind;
  direction: Direction | null;
  /** Null for contributions when the family chose not to show amounts. */
  amount_minor: number | null;
  label: string;
  reference_hint: string | null;
  matched_to_statement: boolean;
  receipts: PublicReceipt[];
  /** The published challenge it came in through. */
  challenge_id?: number | null;
}

export interface PublicTotals {
  contributions_minor: number;
  contributions_count: number;
  expenses_minor: number;
  charges_minor: number;
  refunds_paid_minor: number;
  refunds_received_minor: number;
  reversals_in_minor: number;
  reversals_out_minor: number;
  opening_funds_minor: number;
  remaining_minor: number;
  /** Part of the remaining funds still held by challenges, to be handed over to the main account. */
  held_by_challenges_minor?: number;
}

export interface PublicPage {
  fundraiser: {
    name: string;
    description: string;
    memorial_name: string | null;
    memorial_dates: string | null;
    memorial_tribute: string | null;
    photo_url: string | null;
    /** Kiswahili version of `description`, when the family has added it. */
    description_sw?: string | null;
    target_minor: number | null;
    start_date: string | null;
    anonymous_label: string;
    giving: { method: GivingMethod; number: string; account: string | null; name: string } | null;
    funeral: { when: string | null; place: string | null; map_url: string | null };
    organisers: Organiser[];
    show_contribution_amounts: boolean;
    pledges: PledgeTotals;
  };
  is_demo: boolean;
  totals: PublicTotals;
  opening_funds: { amount_minor: number; date: string | null; explanation: string } | null;
  contributions: PublicEntry[];
  spending: PublicEntry[];
  charges: PublicEntry[];
  refunds_and_reversals: PublicEntry[];
  promises: {
    pledged_outstanding_minor: number;
    unpaid_bills_minor: number;
    unpaid_bills: PublicEntry[];
    pledges: PublicPledge[];
  } | null;
  statement_checks: {
    reconciled_periods: { start: string; end: string }[];
    matched_count: number;
    not_matched_count: number;
  };
  announcements: PublicAnnouncement[];
  /** Published challenges, active first. Their money is part of the totals already. */
  challenges?: PublicChallenge[];
  last_updated: string | null;
}

export interface PublicAnnouncement {
  id: number;
  title: string;
  body: string;
  /** Kiswahili versions, when the family has added them. */
  title_sw?: string | null;
  body_sw?: string | null;
  pinned: boolean;
  published_at: string;
}

export interface CheckResult {
  found: boolean;
  contribution: { at: string; amount_minor: number; listed_as: string; matched_to_statement: boolean } | null;
}

export interface PublicPreview {
  page: PublicPage;
  published: boolean;
  public_url: string | null;
}

export interface StatementReport {
  fundraiser: {
    name: string;
    memorial_name: string;
    memorial_dates: string;
    memorial_tribute: string;
    giving_method: GivingMethod | null;
    giving_number: string;
    giving_account: string;
    giving_name: string;
    organisers: Organiser[];
    has_photo: boolean;
  };
  period_from: string | null;
  period_to: string;
  generated_at: string;
  generated_by: string;
  brought_forward_minor: number;
  closing_minor: number;
  totals: {
    received_minor: number;
    received_count: number;
    expenses_minor: number;
    expenses_count: number;
    charges_minor: number;
    refunds_paid_minor: number;
    refunds_received_minor: number;
    reversals_in_minor: number;
    reversals_out_minor: number;
  };
  entries: {
    at: string;
    kind: Kind;
    direction: Direction;
    amount_minor: number;
    label: string;
    mpesa_name: string | null;
    reference: string | null;
    matched: boolean;
    has_receipt: boolean;
  }[];
  pledged_outstanding_minor: number;
  unpaid_bills_minor: number;
  reconciled_through: string | null;
  public_url: string | null;
}
