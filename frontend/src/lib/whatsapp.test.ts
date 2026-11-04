import { describe, expect, it } from "vitest";
import type { PublicPage, StatementReport } from "./types";
import { buildAccountsUpdate, type AccountStatement } from "./whatsapp";

type Entry = StatementReport["entries"][number];
const entry = (at: string, kind: Entry["kind"], direction: Entry["direction"], amount: number, label: string): Entry => ({
  at,
  kind,
  direction,
  amount_minor: amount,
  label,
  mpesa_name: "PRIVATE NAME",
  reference: "TK3AB12CD4",
  matched: false,
  has_receipt: false,
});
const totals = (received: number, count: number, extra: Partial<StatementReport["totals"]> = {}): StatementReport["totals"] => ({
  received_minor: received,
  received_count: count,
  expenses_minor: 0,
  expenses_count: 0,
  charges_minor: 0,
  refunds_paid_minor: 0,
  refunds_received_minor: 0,
  reversals_in_minor: 0,
  reversals_out_minor: 0,
  transfers_in_minor: 0,
  transfers_out_minor: 0,
  ...extra,
});

const page = {
  fundraiser: {
    name: "Funeral",
    memorial_name: "Dr. Joseph Karisa Gonzi",
    memorial_dates: null,
    memorial_tribute: null,
    target_minor: 1_100_000_00,
    show_contribution_amounts: true,
    pledges: { family: { count: 0, pledged_minor: 0, received_minor: 0, outstanding_minor: 0 }, friends: { count: 0, pledged_minor: 0, received_minor: 0, outstanding_minor: 0 } },
  },
  totals: { contributions_minor: 1_700_00 },
  challenges: [{ name: "Day 1 challenge" }],
} as unknown as PublicPage;

// The main M-Pesa account, and a challenge's own line that has handed 300 over to it.
const mpesa: AccountStatement = {
  account: { id: 1, name: "M-Pesa", kind: "mpesa", challenge_name: null },
  entries: [
    entry("2026-11-02T08:00:00Z", "contribution", "in", 1_000_00, "Edward Chai"),
    entry("2026-11-03T16:11:00Z", "transfer", "in", 300_00, "Moved in from Samuel Isaac's M-Pesa"),
  ],
  totals: totals(1_000_00, 1, { transfers_in_minor: 300_00 }),
  brought_forward_minor: 0,
  closing_minor: 1_300_00,
};
const kitty: AccountStatement = {
  account: { id: 3, name: "Samuel Isaac's M-Pesa", kind: "mpesa", challenge_name: "Day 1 challenge" },
  entries: [
    entry("2026-11-03T06:05:00Z", "contribution", "in", 200_00, "Patrick Kalama Masha (Chief)"),
    entry("2026-11-03T06:05:00Z", "contribution", "in", 500_00, "Kadzovu (Chief)"),
    entry("2026-11-03T16:11:00Z", "transfer", "out", 300_00, "Moved to M-Pesa"),
  ],
  totals: totals(700_00, 2, { transfers_out_minor: 300_00 }),
  brought_forward_minor: 0,
  closing_minor: 400_00,
};

describe("WhatsApp update account by account", () => {
  it("lists each account on its own and adds them up without counting a hand-over twice", () => {
    const text = buildAccountsUpdate(page, [mpesa, kitty], { range: { kind: "all" }, includeSpending: false, includeTotals: true, link: null, allAccounts: true });
    expect(text).toContain("*1. M-Pesa*\n_Contributions received_\n1. Edward Chai – KES 1,000\nReceived: KES 1,000 (1 contribution)");
    expect(text).toContain("*2. Samuel Isaac's M-Pesa*\n_Day 1 challenge_\n_Contributions received_\n1. Patrick Kalama Masha (Chief) – KES 200\n2. Kadzovu (Chief) – KES 500");
    expect(text).toContain("Moved to other accounts: KES 300\n*Held in Samuel Isaac's M-Pesa: KES 400*");
    expect(text).toContain("*Summary*\n1. M-Pesa: KES 1,000 (1 contribution)\n2. Samuel Isaac's M-Pesa: KES 700 (2 contributions)\n*Total received: KES 1,700 (3 contributions)*\n*Held across these accounts: KES 1,700*");
    expect(text).toContain("*The goal: KES 1,100,000*");
    expect(text).not.toContain("PRIVATE NAME");
    expect(text).not.toContain("TK3AB12CD4");
  });

  it("lists only the period's entries but keeps the balance, and leaves the goal out for some accounts", () => {
    const text = buildAccountsUpdate(page, [mpesa], { range: { kind: "since", date: "2026-11-03" }, includeSpending: false, includeTotals: true, link: null, allAccounts: false });
    expect(text).toContain("_Account: M-Pesa_\n\n*Contributions received since 3 Nov 2026*\nNo new contributions in this period.\n\n*Totals so far*\nReceived: KES 1,000 (1 contribution)");
    expect(text).toContain("*Held in M-Pesa: KES 1,300*");
    expect(text).not.toContain("*Summary");
    expect(text).not.toContain("The goal");
  });
});
