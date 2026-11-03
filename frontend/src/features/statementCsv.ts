// The statement as a spreadsheet (CSV), from the same data as the PDF: one row
// per entry, with plain numbers so the columns add up in Excel or Sheets.

import { toNairobiInputValue } from "@/lib/time";
import type { Kind, StatementReport } from "@/lib/types";
import type { ReportKind } from "./statementPdf";
import type { TextOptions } from "./statementText";

type Entry = StatementReport["entries"][number];

const TYPES: Partial<Record<Kind, string>> = {
  contribution: "Received",
  expense: "Expense",
  charge: "M-Pesa charge",
  refund: "Refund",
  reversal: "Reversal",
  transfer: "Moved between accounts",
};

/** Quotes a field and keeps spreadsheets from reading it as a formula. */
function field(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** KES as a plain number: 1500 or 1500.50. */
function kes(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

/** The entries a statement of this kind lists, as in the PDF. */
export function statementEntries(r: StatementReport, kind: ReportKind): Entry[] {
  if (kind === "received") return r.entries.filter((e) => e.kind === "contribution");
  if (kind === "spent") return r.entries.filter((e) => e.kind === "expense" || e.kind === "charge");
  return r.entries;
}

export function buildStatementCsv(r: StatementReport, options: TextOptions): string {
  const full = options.kind === "full";
  const mpesa = options.names === "mpesa";
  const head = [
    "No.",
    "Date",
    "Time",
    "Type",
    "Details",
    ...(mpesa ? ["M-Pesa name"] : []),
    ...(options.includeCodes ? ["M-Pesa code"] : []),
    "In (KES)",
    "Out (KES)",
    ...(full ? ["Balance (KES)"] : []),
    "Checked against M-Pesa",
    "Receipt",
  ];
  const row = (cells: Record<string, string>) => head.map((h) => field(cells[h] ?? ""));
  const rows: string[][] = [head.map(field)];

  let balance = r.brought_forward_minor;
  if (full) rows.push(row({ Details: "Balance brought forward", "Balance (KES)": kes(balance) }));
  let moneyIn = 0;
  let moneyOut = 0;
  const entries = statementEntries(r, options.kind);
  entries.forEach((e, i) => {
    const into = e.direction === "in";
    balance += into ? e.amount_minor : -e.amount_minor;
    if (into) moneyIn += e.amount_minor;
    else moneyOut += e.amount_minor;
    const local = toNairobiInputValue(e.at);
    rows.push(
      row({
        "No.": String(i + 1),
        Date: local.slice(0, 10),
        Time: local.slice(11, 16),
        Type: TYPES[e.kind] ?? e.kind,
        Details: e.label,
        "M-Pesa name": e.kind === "contribution" ? (e.mpesa_name ?? "") : "",
        "M-Pesa code": e.reference ?? "",
        "In (KES)": into ? kes(e.amount_minor) : "",
        "Out (KES)": into ? "" : kes(e.amount_minor),
        "Balance (KES)": kes(balance),
        "Checked against M-Pesa": e.matched ? "Yes" : "No",
        Receipt: e.kind === "expense" ? (e.has_receipt ? "Yes" : "No") : "",
      }),
    );
  });
  rows.push(
    row({
      Details: `Totals (${entries.length} entries)`,
      "In (KES)": moneyIn ? kes(moneyIn) : "",
      "Out (KES)": moneyOut ? kes(moneyOut) : "",
      "Balance (KES)": kes(balance),
    }),
  );
  // The byte-order mark lets Excel read names with accents correctly.
  return `﻿${rows.map((cells) => cells.join(",")).join("\r\n")}\r\n`;
}
