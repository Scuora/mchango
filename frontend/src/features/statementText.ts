// The statement as WhatsApp-ready text, from the same data as the PDF, for
// people who cannot open a PDF. WhatsApp formatting: *bold*, _italic_.

import { formatKesShort } from "@/lib/money";
import { formatNairobiDate, formatShortDate } from "@/lib/time";
import type { StatementReport } from "@/lib/types";
import type { ReportKind } from "./statementPdf";

export interface TextOptions {
  kind: ReportKind;
  names: "public" | "mpesa";
  includeCodes: boolean;
}

const TITLES: Record<ReportKind, string> = {
  full: "Full account of money received and spent",
  received: "Contributions received",
  spent: "Expenses (money spent)",
};

type Entry = StatementReport["entries"][number];

export function periodText(r: StatementReport): string {
  return r.period_from ? `${formatNairobiDate(r.period_from)} to ${formatNairobiDate(r.period_to)}` : `Everything to ${formatNairobiDate(r.period_to)}`;
}

function name(e: Entry, options: TextOptions): string {
  return options.names === "mpesa" && e.mpesa_name && e.kind === "contribution" ? `${e.mpesa_name} (${e.label})` : e.label;
}

function lines(entries: Entry[], options: TextOptions, receipt: boolean): string[] {
  return entries.map((e, i) => {
    const code = options.includeCodes && e.reference ? ` [${e.reference}]` : "";
    const note = receipt && e.kind === "expense" ? (e.has_receipt ? " (receipt)" : "") : "";
    return `${i + 1}. ${formatShortDate(e.at)} · ${name(e, options)} – ${formatKesShort(e.amount_minor)}${note}${code}`;
  });
}

export function buildStatementText(r: StatementReport, options: TextOptions): string {
  const t = r.totals;
  const out: string[] = [];
  const memorial = r.fundraiser.memorial_name || r.fundraiser.name;
  out.push(r.fundraiser.memorial_name ? `*In loving memory of ${memorial}*` : `*${memorial}*`);
  if (r.fundraiser.memorial_dates) out.push(`_${r.fundraiser.memorial_dates}_`);
  out.push("", `*Statement: ${TITLES[options.kind]}*`, `_${periodText(r)}_`);

  const received = r.entries.filter((e) => e.kind === "contribution");
  // The expenses statement lists funeral expenses and their charges; the full account lists all money out.
  const spent = r.entries.filter((e) => (options.kind === "spent" ? e.kind === "expense" || e.kind === "charge" : e.direction === "out"));
  const sum = (list: Entry[]) => list.reduce((s, e) => s + e.amount_minor, 0);

  if (options.kind !== "spent") {
    out.push("", "*Contributions received*");
    out.push(...(received.length ? lines(received, options, false) : ["None in this period."]));
    out.push(`*Total received: ${formatKesShort(sum(received))} (${received.length})*`);
  }
  if (options.kind !== "received") {
    out.push("", options.kind === "spent" ? "*Money spent*" : "*Money out*");
    out.push(...(spent.length ? lines(spent, options, true) : ["Nothing spent in this period."]));
    out.push(`*Total ${options.kind === "spent" ? "spent" : "out"}: ${formatKesShort(sum(spent))} (${spent.length})*`);
  }
  if (options.kind === "full") {
    const moneyIn = t.received_minor + t.refunds_received_minor + t.reversals_in_minor;
    const moneyOut = t.expenses_minor + t.charges_minor + t.refunds_paid_minor + t.reversals_out_minor;
    out.push("", "*Summary*");
    out.push(`Brought forward: ${formatKesShort(r.brought_forward_minor)}`);
    out.push(`Money in: ${formatKesShort(moneyIn)}`);
    out.push(`Money out: ${formatKesShort(moneyOut)}`);
    out.push(`*Funds remaining: ${formatKesShort(r.closing_minor)}*`);
  }

  out.push("");
  out.push(
    r.reconciled_through
      ? `_Every entry up to ${formatNairobiDate(r.reconciled_through)} was checked against M-Pesa statements._`
      : r.entries.some((e) => e.matched)
        ? "_Some entries have been checked against an M-Pesa statement; the rest are still to be checked._"
        : "_Not yet checked against an M-Pesa statement._",
  );
  out.push("", "Thank you for standing with the family.");
  if (r.fundraiser.memorial_tribute) out.push(`_${r.fundraiser.memorial_tribute}_`);
  return out.join("\n");
}
