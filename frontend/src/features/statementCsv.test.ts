import { describe, expect, it } from "vitest";
import type { StatementReport } from "@/lib/types";
import { buildStatementCsv } from "./statementCsv";
import { accountText, buildStatementText } from "./statementText";

type Entry = StatementReport["entries"][number];
const entry = (at: string, kind: Entry["kind"], direction: Entry["direction"], amount: number, label: string, extra: Partial<Entry> = {}): Entry => ({
  at,
  kind,
  direction,
  amount_minor: amount,
  label,
  mpesa_name: null,
  reference: null,
  matched: false,
  has_receipt: false,
  ...extra,
});

// The Day 1 challenge's own M-Pesa line: two contributions, then a hand-over to the main account.
const report = {
  fundraiser: { name: "Funeral", memorial_name: "Dr. Joseph Karisa Gonzi", memorial_dates: "", memorial_tribute: "", organisers: [], has_photo: false },
  account: { id: 3, name: "Samuel Isaac's M-Pesa", kind: "mpesa", challenge_name: "❤️ DAY 1 CHALLENGE ❤️" },
  period_from: null,
  period_to: "2026-11-03",
  brought_forward_minor: 0,
  closing_minor: 100_00,
  totals: {
    received_minor: 500_00, received_count: 2, expenses_minor: 0, expenses_count: 0, charges_minor: 0, refunds_paid_minor: 0, refunds_received_minor: 0,
    reversals_in_minor: 0, reversals_out_minor: 0, transfers_in_minor: 0, transfers_out_minor: 400_00,
  },
  entries: [
    entry("2026-11-03T06:05:00Z", "contribution", "in", 200_00, "Joseph Mwaduna", { mpesa_name: "JOSEPH MWADUNA", reference: "TK3AB12CD4", matched: true }),
    entry("2026-11-03T07:40:00Z", "contribution", "in", 300_00, "=Lorraine, Katana"),
    entry("2026-11-03T09:00:00Z", "transfer", "out", 400_00, "Moved to M-Pesa"),
  ],
} as unknown as StatementReport;

describe("statement spreadsheet", () => {
  it("lists one account's money with a running balance that ends where the account stands", () => {
    const csv = buildStatementCsv(report, { kind: "full", names: "public", includeCodes: false });
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("No.,Date,Time,Type,Details,In (KES),Out (KES),Balance (KES),Checked against M-Pesa,Receipt");
    expect(lines[1]).toBe(",,,,Balance brought forward,,,0,,");
    expect(lines[2]).toBe("1,2026-11-03,09:05,Received,Joseph Mwaduna,200,,200,Yes,");
    expect(lines[3]).toBe(`2,2026-11-03,10:40,Received,"'=Lorraine, Katana",300,,500,No,`);
    expect(lines[4]).toBe("3,2026-11-03,12:00,Moved between accounts,Moved to M-Pesa,,400,100,No,");
    expect(lines[5]).toBe(",,,,Totals (3 entries),500,400,100,,");
  });

  it("adds M-Pesa names and codes only when asked, and lists only what the statement covers", () => {
    const csv = buildStatementCsv(report, { kind: "received", names: "mpesa", includeCodes: true });
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("No.,Date,Time,Type,Details,M-Pesa name,M-Pesa code,In (KES),Out (KES),Checked against M-Pesa,Receipt");
    expect(lines[1]).toBe("1,2026-11-03,09:05,Received,Joseph Mwaduna,JOSEPH MWADUNA,TK3AB12CD4,200,,Yes,");
    expect(lines).toHaveLength(4);
  });

  it("names the account on the WhatsApp text", () => {
    expect(accountText(report)).toBe("Account: Samuel Isaac's M-Pesa (❤️ DAY 1 CHALLENGE ❤️)");
    const text = buildStatementText(report, { kind: "full", names: "public", includeCodes: false });
    expect(text).toContain("*Statement: Full account of money received and spent*\n_Account: Samuel Isaac's M-Pesa (❤️ DAY 1 CHALLENGE ❤️)_");
    expect(text).toContain("Money out: KES 400");
  });
});
