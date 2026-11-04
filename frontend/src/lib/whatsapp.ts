// Builds a WhatsApp-friendly update from the PUBLIC page data only, so a
// shared message can never contain phone numbers, M-Pesa names or other
// private details. WhatsApp formatting: *bold*, _italic_, plain lines.

import { familyOf, goalOf } from "./goal";
import { formatKesShort } from "./money";
import { formatNairobiDate, formatNairobiLongDate, toNairobiInputValue } from "./time";
import type { PublicEntry, PublicPage, StatementReport } from "./types";

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

/**
 * The public list (newest first) turned oldest first. Sorted by time rather than
 * reversed, so the people sharing one payment keep their order.
 */
export function oldestFirst<T extends { at: string }>(entries: T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.at.localeCompare(b.entry.at) || a.index - b.index)
    .map(({ entry }) => entry);
}

function numbered(entries: PublicEntry[]): string[] {
  // Oldest first reads naturally as a running list.
  // Amounts are left out when the family has chosen not to show them.
  return oldestFirst(entries)
    .map((e, i) => `${i + 1}. ${e.label}${e.amount_minor === null ? "" : ` – ${formatKesShort(e.amount_minor)}`}`);
}

function sum(entries: PublicEntry[]): number | null {
  if (entries.some((e) => e.amount_minor === null)) return null;
  return entries.reduce((total, e) => total + (e.amount_minor ?? 0), 0);
}

function masthead(page: PublicPage, today: Date): string[] {
  const { fundraiser } = page;
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
  return lines;
}

/** The fundraiser's goal: the target, the family's share, and what is still needed. */
function goalLines(page: PublicPage): string[] {
  const { fundraiser, totals } = page;
  const goal = goalOf(fundraiser.target_minor, fundraiser.pledges, totals.contributions_minor);
  if (!goal) return [];
  const lines = [""];
  if (goal.target !== null) lines.push(`*The goal: ${formatKesShort(goal.target)}*`);
  if (goal.familyPledged > 0) {
    lines.push(`Received from ${familyOf(fundraiser.memorial_name)}: ${formatKesShort(goal.familyPledged)}`);
    const share = goal.othersShare !== null ? ` of ${formatKesShort(goal.othersShare)}` : "";
    lines.push(`From family, friends and well-wishers: ${formatKesShort(goal.othersReceived)}${share}`);
  }
  if (goal.othersOutstanding > 0) lines.push(`Pledged by family, friends and well-wishers, not yet received: ${formatKesShort(goal.othersOutstanding)}`);
  if (goal.stillNeeded !== null) lines.push(goal.stillNeeded > 0 ? `*Still needed: ${formatKesShort(goal.stillNeeded)}*` : "*The target has been reached. Thank you.*");
  return lines;
}

function closing(options: ShareOptions): string[] {
  const lines: string[] = [];
  if (options.link) {
    lines.push("");
    lines.push(`Full record of contributions and expenses: ${options.link}`);
  }
  lines.push("");
  lines.push("Thank you for standing with the family.");
  return lines;
}


/** Money spent, with the M-Pesa transaction costs counted in it. */
function spentLine(expensesMinor: number, chargesMinor: number): string {
  const costs = chargesMinor > 0 ? ` (incl. ${formatKesShort(chargesMinor)} transaction costs)` : "";
  return `Funeral expenses paid: ${formatKesShort(expensesMinor + chargesMinor)}${costs}`;
}

type Spent = { at: string; label: string; amount_minor: number | null };

/**
 * The expense breakdown: each expense with its amount (oldest first), then the
 * transaction costs on them as one last item, so the items add up to `total`.
 * Expense amounts are always public; only contribution amounts can be hidden.
 */
function breakdown(expenses: Spent[], charges: Spent[]): { items: string[]; total: number } {
  const sumOf = (list: Spent[]) => list.reduce((total, e) => total + (e.amount_minor ?? 0), 0);
  const items = oldestFirst(expenses).map((e, i) => `${i + 1}. ${e.label} – ${formatKesShort(e.amount_minor ?? 0)}`);
  const costs = sumOf(charges);
  if (charges.length > 0) items.push(`${items.length + 1}. Transaction costs on ${charges.length} payment${charges.length === 1 ? "" : "s"} – ${formatKesShort(costs)}`);
  return { items, total: sumOf(expenses) + costs };
}
export function buildWhatsAppUpdate(page: PublicPage, options: ShareOptions, today: Date = new Date()): string {
  const { totals } = page;
  const lines = masthead(page, today);
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
    const when = options.range.kind === "all" ? "" : ` since ${formatNairobiDate(options.range.date)}`;
    const spent = breakdown(
      page.spending.filter((e) => inRange(e, options.range)),
      page.charges.filter((e) => inRange(e, options.range)),
    );
    lines.push("");
    lines.push(`*Funeral expenses${when}*`);
    if (spent.items.length === 0) lines.push("No spending in this period.");
    else lines.push(...spent.items, `*Total spent${when}: ${formatKesShort(spent.total)}*`);
  }

  if (options.includeTotals) {
    lines.push("");
    lines.push("*Totals so far*");
    lines.push(`Received: ${formatKesShort(totals.contributions_minor)} (${totals.contributions_count} contributions)`);
    lines.push(spentLine(totals.expenses_minor, totals.charges_minor));
    const refunds = totals.refunds_paid_minor - totals.refunds_received_minor;
    if (refunds !== 0) lines.push(`Refunds (net): ${formatKesShort(refunds)}`);
    if (totals.opening_funds_minor > 0) lines.push(`Opening funds: ${formatKesShort(totals.opening_funds_minor)}`);
    lines.push(`*Funds remaining: ${formatKesShort(totals.remaining_minor)}*`);
    lines.push(...goalLines(page));
  }

  lines.push(...closing(options));
  return lines.join("\n");
}

/**
 * One account's statement, as far as a shared message uses it: public names (or the
 * anonymous label), amounts and balances. M-Pesa names and codes are never read.
 */
export type AccountStatement = Pick<StatementReport, "account" | "entries" | "totals" | "brought_forward_minor" | "closing_minor">;

export interface AccountShareOptions extends ShareOptions {
  /** Every account is in the message, so the fundraiser's goal adds up with it. */
  allAccounts: boolean;
}

const plural = (count: number) => `${count} contribution${count === 1 ? "" : "s"}`;

/**
 * The update account by account, for reporting each kitty on its own: each account's
 * contributions (and expenses), what it received and what it holds, then, for more
 * than one account, a summary that adds them up. `statements` cover all time; the
 * range picks which entries are listed.
 */
export function buildAccountsUpdate(page: PublicPage, statements: AccountStatement[], options: AccountShareOptions, today: Date = new Date()): string {
  const showAmounts = page.fundraiser.show_contribution_amounts;
  const published = new Set((page.challenges ?? []).map((c) => c.name));
  const since = options.range.kind === "since" ? options.range.date : null;
  const listed = (e: AccountStatement["entries"][number]) => since === null || toNairobiInputValue(e.at).slice(0, 10) >= since;
  const several = statements.length > 1;
  const name = (s: AccountStatement) => s.account?.name ?? "All accounts";
  const total = (entries: AccountStatement["entries"]) => entries.reduce((sum, e) => sum + e.amount_minor, 0);
  const received = (s: AccountStatement) => s.entries.filter((e) => e.kind === "contribution" && listed(e));
  const when = since ? ` since ${formatNairobiDate(since)}` : "";
  const list = (entries: AccountStatement["entries"], amounts: boolean) =>
    oldestFirst(entries).map((e, i) => `${i + 1}. ${e.label}${amounts ? ` – ${formatKesShort(e.amount_minor)}` : ""}`);

  const lines = masthead(page, today);
  lines.push(several ? `_By account: ${statements.length} accounts_` : `_Account: ${name(statements[0])}_`);

  statements.forEach((s, index) => {
    const t = s.totals;
    const challenge = s.account?.challenge_name?.trim();
    lines.push("");
    if (several) lines.push(`*${index + 1}. ${name(s)}*`);
    if (challenge && published.has(s.account?.challenge_name ?? "")) lines.push(`_${challenge}_`);

    const got = received(s);
    lines.push(several ? `_Contributions received${when}_` : `*Contributions received${when}*`);
    if (got.length === 0) lines.push(since ? "No new contributions in this period." : "No contributions yet.");
    else lines.push(...list(got, showAmounts), showAmounts ? `Received${when}: ${formatKesShort(total(got))} (${plural(got.length)})` : plural(got.length));

    if (options.includeSpending) {
      const spent = breakdown(
        s.entries.filter((e) => e.kind === "expense" && listed(e)),
        s.entries.filter((e) => e.kind === "charge" && listed(e)),
      );
      lines.push("");
      lines.push(several ? `_Funeral expenses${when}_` : `*Funeral expenses${when}*`);
      if (spent.items.length === 0) lines.push("No spending in this period.");
      else lines.push(...spent.items, `Spent${when}: ${formatKesShort(spent.total)}`);
    }

    if (options.includeTotals) {
      lines.push("");
      lines.push(several ? "_Totals so far_" : "*Totals so far*");
      if (s.brought_forward_minor > 0) lines.push(`Opening funds: ${formatKesShort(s.brought_forward_minor)}`);
      if (since) lines.push(`Received: ${formatKesShort(t.received_minor)} (${plural(t.received_count)})`);
      lines.push(spentLine(t.expenses_minor, t.charges_minor));
      const refunds = t.refunds_paid_minor - t.refunds_received_minor;
      if (refunds !== 0) lines.push(`Refunds (net): ${formatKesShort(refunds)}`);
      if (t.transfers_in_minor > 0) lines.push(`Moved in from other accounts: ${formatKesShort(t.transfers_in_minor)}`);
      if (t.transfers_out_minor > 0) lines.push(`Moved to other accounts: ${formatKesShort(t.transfers_out_minor)}`);
      lines.push(`*Held in ${name(s)}: ${formatKesShort(s.closing_minor)}*`);
    }
  });

  if (several) {
    lines.push("");
    lines.push(`*Summary${when}*`);
    statements.forEach((s, index) => {
      const got = received(s);
      lines.push(`${index + 1}. ${name(s)}: ${showAmounts ? `${formatKesShort(total(got))} (${plural(got.length)})` : plural(got.length)}`);
    });
    const all = statements.flatMap(received);
    lines.push(showAmounts ? `*Total received${when}: ${formatKesShort(total(all))} (${plural(all.length)})*` : `*${plural(all.length)}${when}*`);
    if (options.includeTotals) lines.push(`*Held across these accounts: ${formatKesShort(statements.reduce((sum, s) => sum + s.closing_minor, 0))}*`);
  }

  // The goal is the whole fundraiser's, so it adds up only when every account is in the message.
  if (options.includeTotals && options.allAccounts) lines.push(...goalLines(page));

  lines.push(...closing(options));
  return lines.join("\n");
}
