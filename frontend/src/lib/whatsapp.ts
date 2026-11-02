// Builds a WhatsApp-friendly update from the PUBLIC page data only, so a
// shared message can never contain phone numbers, M-Pesa names or other
// private details. WhatsApp formatting: *bold*, _italic_, plain lines.

import { goalOf } from "./goal";
import { formatKesShort } from "./money";
import { formatNairobiDate, formatNairobiLongDate } from "./time";
import type { PublicEntry, PublicPage } from "./types";

export type Range = { kind: "all" } | { kind: "since"; date: string };

export interface ShareOptions {
  range: Range;
  includeSpending: boolean;
  includeTotals: boolean;
  link: string | null;
}

function inRange(entry: PublicEntry, range: Range): boolean {
  return range.kind === "all" || entry.date >= range.date;
}

function numbered(entries: PublicEntry[]): string[] {
  // Oldest first reads naturally as a running list.
  // Amounts are left out when the family has chosen not to show them.
  return [...entries]
    .reverse()
    .map((e, i) => `${i + 1}. ${e.label}${e.amount_minor === null ? "" : ` – ${formatKesShort(e.amount_minor)}`}`);
}

function sum(entries: PublicEntry[]): number | null {
  if (entries.some((e) => e.amount_minor === null)) return null;
  return entries.reduce((total, e) => total + (e.amount_minor ?? 0), 0);
}

export function buildWhatsAppUpdate(page: PublicPage, options: ShareOptions, today: Date = new Date()): string {
  const { fundraiser, totals } = page;
  const lines: string[] = [];
  if (fundraiser.memorial_name) {
    lines.push(`*In loving memory of ${fundraiser.memorial_name}*`);
    if (fundraiser.memorial_dates) lines.push(`_${fundraiser.memorial_dates}_`);
    if (fundraiser.memorial_tribute) lines.push(`_${fundraiser.memorial_tribute}_`);
    lines.push("");
    lines.push(`*Funeral contributions update*`);
  } else {
    lines.push(`*${fundraiser.name}*`);
  }
  lines.push(`_As of ${formatNairobiLongDate(today)}_`);
  lines.push("");

  const contributions = page.contributions.filter((e) => inRange(e, options.range));
  const heading =
    options.range.kind === "all"
      ? "*Contributions received*"
      : `*Contributions since ${formatNairobiDate(options.range.date)}*`;
  lines.push(heading);
  if (contributions.length === 0) {
    lines.push("No new contributions in this period.");
  } else {
    lines.push(...numbered(contributions));
    if (options.range.kind !== "all") {
      const subtotal = sum(contributions);
      lines.push(subtotal === null ? `${contributions.length} contributions` : `Subtotal: ${formatKesShort(subtotal)} (${contributions.length})`);
    }
  }

  if (options.includeSpending) {
    const spending = page.spending.filter((e) => inRange(e, options.range));
    lines.push("");
    lines.push(options.range.kind === "all" ? "*Funeral expenses*" : `*Funeral expenses since ${formatNairobiDate(options.range.date)}*`);
    if (spending.length === 0) {
      lines.push("No spending in this period.");
    } else {
      lines.push(...numbered(spending));
    }
  }

  if (options.includeTotals) {
    lines.push("");
    lines.push("*Totals so far*");
    lines.push(`Received: ${formatKesShort(totals.contributions_minor)} (${totals.contributions_count} contributions)`);
    lines.push(`Funeral expenses paid: ${formatKesShort(totals.expenses_minor)}`);
    if (totals.charges_minor > 0) lines.push(`Charges: ${formatKesShort(totals.charges_minor)}`);
    const refunds = totals.refunds_paid_minor - totals.refunds_received_minor;
    if (refunds !== 0) lines.push(`Refunds (net): ${formatKesShort(refunds)}`);
    if (totals.opening_funds_minor > 0) lines.push(`Opening funds: ${formatKesShort(totals.opening_funds_minor)}`);
    lines.push(`*Funds remaining: ${formatKesShort(totals.remaining_minor)}*`);
    const goal = goalOf(fundraiser.target_minor, fundraiser.pledges, totals.contributions_minor);
    if (goal) {
      lines.push("");
      if (goal.target !== null) lines.push(`*The goal: ${formatKesShort(goal.target)}*`);
      if (goal.familyPledged > 0) {
        const received = goal.familyReceived > 0 ? ` (${formatKesShort(Math.min(goal.familyReceived, goal.familyPledged))} received)` : "";
        lines.push(`Pledged by the family: ${formatKesShort(goal.familyPledged)}${received}`);
        const share = goal.othersShare !== null ? ` of ${formatKesShort(goal.othersShare)}` : "";
        lines.push(`From friends and well-wishers: ${formatKesShort(goal.othersReceived)}${share}`);
      }
      if (goal.othersOutstanding > 0) lines.push(`Pledged by friends, not yet received: ${formatKesShort(goal.othersOutstanding)}`);
      if (goal.stillNeeded !== null) lines.push(goal.stillNeeded > 0 ? `*Still needed: ${formatKesShort(goal.stillNeeded)}*` : "*The target has been reached. Thank you.*");
    }
  }

  if (options.link) {
    lines.push("");
    lines.push(`Full record of contributions and expenses: ${options.link}`);
  }
  lines.push("");
  lines.push("Thank you for standing with the family.");
  return lines.join("\n");
}
