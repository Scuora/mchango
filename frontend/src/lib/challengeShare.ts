// A WhatsApp update about one challenge, in English or Kiswahili. Like the main
// update it uses public fields only: public names (or the anonymous label),
// amounts the family has chosen to show, and the giving details already on the
// public page. WhatsApp formatting: *bold*, _italic_, plain lines.

import { familyOf, goalOf } from "./goal";
import { formatKesShort } from "./money";
import { formatNairobiLongDate } from "./time";
import { oldestFirst } from "./whatsapp";
import type { ChallengeStatus, ChallengeTotals, GivingMethod, PublicPage } from "./types";

export type ShareLang = "en" | "sw";

export interface ChallengeEntry {
  /** Public name, or the anonymous label. */
  label: string;
  /** Null when the family has chosen not to show individual amounts. */
  amount_minor: number | null;
}

/** What the message needs of a challenge: a managed one, or the public view of it. */
export interface ShareableChallenge {
  name: string;
  name_sw: string | null;
  description: string;
  description_sw: string | null;
  target_minor: number | null;
  status: ChallengeStatus;
  totals: Pick<ChallengeTotals, "raised_minor" | "contributions_count" | "pledged_outstanding_minor"> & {
    held_minor?: number | null;
    handed_over_minor?: number | null;
  };
}

export interface ChallengeShareInput {
  challenge: ShareableChallenge;
  /** Money received through the challenge, oldest first. */
  entries: ChallengeEntry[];
  memorialName: string | null;
  /** Where to send money: the challenge's own details when it has them, else the fundraiser's. */
  giving: { method: GivingMethod; number: string; account: string | null; name: string } | null;
  /** True when `giving` is the challenge's own: the money is known to be for it. */
  ownGiving?: boolean;
  /** The fundraiser's public view, for messages that report on the whole fundraiser. */
  fundraiser?: PublicPage | null;
  /** The public page address, without a trailing slash. */
  publicUrl: string | null;
  lang: ShareLang;
  includeList: boolean;
  includeGiving: boolean;
  now?: Date;
}

const MONTHS_SW = ["Januari", "Februari", "Machi", "Aprili", "Mei", "Juni", "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba"];

/** The date and the time in Nairobi, in both languages; the time as the clock shows it. */
function nairobi(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const [day, hour] = [Number(parts.day), Number(parts.hour)];
  const clock = `${hour % 12 || 12}:${parts.minute}`;
  const month = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", month: "long" }).format(now);
  return {
    date: `${day} ${month} ${parts.year}`,
    dateSw: `${day} ${MONTHS_SW[Number(parts.month) - 1]} ${parts.year}`,
    time: `${clock} ${hour < 12 ? "am" : "pm"}`,
    timeSw: `saa ${clock}`,
  };
}

/** "3 November 2026, 11:00 am" or, in Kiswahili, "3 Novemba 2026, saa 11:00" (clock time, as on the clock). */
export function asAt(now: Date, lang: ShareLang): string {
  const n = nairobi(now);
  return lang === "sw" ? `${n.dateSw}, ${n.timeSw}` : `${n.date}, ${n.time}`;
}

/** An amount without the currency, e.g. "50,000", so a template can say "KSh {raised}". */
function bare(minor: number): string {
  return formatKesShort(minor).replace(/^KES\s*/, "");
}

/** The placeholders a challenge's own messages can use, with what each becomes. */
export const TEMPLATE_GROUPS: { label: string; fields: [string, string][] }[] = [
  {
    label: "This challenge",
    fields: [
      ["name", "the challenge's name"],
      ["description", "how it works"],
      ["list", "the contributions, numbered: “1. Samuel – KSh 500”"],
      ["count", "how many contributions"],
      ["raised", "amount raised, e.g. 1,000"],
      ["target", "the challenge's target"],
      ["remaining", "still to reach the target"],
      ["pledged", "pledged, not yet received"],
      ["held", "still held by the challenge"],
      ["handed_over", "handed over to the main fund"],
      ["number", "the number to send to"],
      ["giving_name", "the name M-Pesa shows"],
      ["link", "the challenges page"],
    ],
  },
  {
    label: "The whole fundraiser",
    fields: [
      ["memorial_name", "e.g. Dr. Joseph Karisa Gonzi"],
      ["memorial_dates", "e.g. 22 October 1952 – 1 November 2026"],
      ["tribute", "the tribute line"],
      ["all_list", "every contribution, numbered: “1. Edward Chai – KES 1,000”"],
      ["total_received", "all money received"],
      ["total_count", "how many contributions"],
      ["expenses", "funeral expenses paid"],
      ["funds_remaining", "funds remaining"],
      ["goal", "the fundraiser's target"],
      ["family", "e.g. the family of Karisa Gonzi"],
      ["family_received", "received from the family"],
      ["others_received", "from family, friends and well-wishers"],
      ["others_share", "the part asked of friends and well-wishers"],
      ["others_pledged", "pledged by them, not yet received"],
      ["still_needed", "still needed"],
      ["site", "the public page"],
    ],
  },
  {
    label: "Date and time",
    fields: [
      ["today", "e.g. Tue, 3 Nov 2026"],
      ["date", "e.g. 3 November 2026"],
      ["date_sw", "e.g. 3 Novemba 2026"],
      ["time", "e.g. 11:00 am"],
      ["time_sw", "e.g. saa 11:00"],
    ],
  },
];

/** Fills the family's own message with the challenge's live figures. Unknown {words} are left as written. */
export function fillTemplate(template: string, input: Omit<ChallengeShareInput, "lang" | "includeList" | "includeGiving">): string {
  const { challenge: c } = input;
  const t = c.totals;
  const n = nairobi(input.now ?? new Date());
  const values: Record<string, string> = {
    name: c.name,
    description: c.description,
    list: input.entries.map((e, i) => `${i + 1}. ${e.label}${e.amount_minor === null ? "" : ` – KSh ${bare(e.amount_minor)}`}`).join("\n"),
    count: String(t.contributions_count),
    raised: bare(t.raised_minor),
    target: c.target_minor ? bare(c.target_minor) : "",
    remaining: c.target_minor ? bare(Math.max(0, c.target_minor - t.raised_minor)) : "",
    pledged: bare(t.pledged_outstanding_minor),
    held: bare(t.held_minor ?? 0),
    handed_over: bare(t.handed_over_minor ?? 0),
    number: input.giving?.number ?? "",
    giving_name: input.giving?.name ?? "",
    date: n.date,
    date_sw: n.dateSw,
    time: n.time,
    time_sw: n.timeSw,
    today: formatNairobiLongDate(input.now ?? new Date()),
    link: input.publicUrl ? `${input.publicUrl}/challenges` : "",
    site: input.publicUrl ?? "",
    ...fundraiserValues(input.fundraiser ?? null),
  };
  // A placeholder with nothing to show (such as {list} before any contributions)
  // takes its line with it, so the message never has a gap of blank lines.
  return template
    .split("\n")
    .filter((line) => !/^\s*(\{[a-z_]+\}\s*)+$/.test(line) || line.replace(/\{([a-z_]+)\}/g, (whole, key: string) => values[key] ?? whole).trim() !== "")
    .join("\n")
    .replace(/\{([a-z_]+)\}/g, (whole, key: string) => values[key] ?? whole)
    .replace(/\n{3,}/g, "\n\n");
}

/** Placeholders about the whole fundraiser, from its public view; empty until it has loaded. */
function fundraiserValues(page: PublicPage | null): Record<string, string> {
  if (!page) return {};
  const f = page.fundraiser;
  const t = page.totals;
  const goal = goalOf(f.target_minor, f.pledges, t.contributions_minor);
  const maybe = (minor: number | null | undefined) => (minor === null || minor === undefined ? "" : bare(minor));
  return {
    memorial_name: f.memorial_name ?? f.name,
    memorial_dates: f.memorial_dates ?? "",
    tribute: f.memorial_tribute ?? "",
    // Oldest first reads naturally as a running list, as in the main update.
    all_list: oldestFirst(page.contributions)
      .map((e, i) => `${i + 1}. ${e.label}${e.amount_minor === null ? "" : ` – KES ${bare(e.amount_minor)}`}`)
      .join("\n"),
    total_received: bare(t.contributions_minor),
    total_count: String(t.contributions_count),
    expenses: bare(t.expenses_minor),
    funds_remaining: bare(t.remaining_minor),
    goal: maybe(goal?.target),
    family: familyOf(f.memorial_name),
    family_received: maybe(goal?.familyPledged),
    others_received: maybe(goal?.othersReceived),
    others_share: maybe(goal?.othersShare),
    others_pledged: maybe(goal?.othersOutstanding),
    still_needed: maybe(goal?.stillNeeded),
  };
}

/** The family's general update, as a message any challenge can share. */
export const FUNDRAISER_TEMPLATE = `In loving memory of {memorial_name}
{memorial_dates}
{tribute}

Funeral contributions update
As of {today}

Contributions received
{all_list}

Totals so far
Received: KES {total_received} ({total_count} contributions)
Funeral expenses paid: KES {expenses}
Funds remaining: KES {funds_remaining}

The goal: KES {goal}
Received from {family}: KES {family_received}
From family, friends and well-wishers: KES {others_received} of KES {others_share}
Pledged by family, friends and well-wishers, not yet received: KES {others_pledged}
Still needed: KES {still_needed}

Full record of contributions and expenses: {site}

Thank you for standing with the family.`;

/** A starting point in the style of the family's first challenge message. */
export const STARTER_TEMPLATE = `{name}

{description}

{list}

🎯 TAARIFA ZA MCHANGO

•  Target Amount : KSh {target}
•  Iliyopatikana: KSh {raised}
•  Salio : KSh {remaining}

💳 NAMBA YA MWEKA HAZINA

📱 {number}

👤 Jina: {giving_name}

🕊️ TUKUMBUKE WEMA WAKE, TUENDELEZE UPENDO WAKE. ❤️`;

function spaced(number: string): string {
  const digits = number.replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : number;
}

function howToGive(g: NonNullable<ChallengeShareInput["giving"]>, lang: ShareLang): string {
  const sw = lang === "sw";
  if (g.method === "paybill") {
    return sw
      ? `M-Pesa: Lipa na M-PESA → Pay Bill ${g.number}, akaunti ${g.account ?? ""} (${g.name})`
      : `M-Pesa: Lipa na M-PESA → Pay Bill ${g.number}, account ${g.account ?? ""} (${g.name})`;
  }
  if (g.method === "till") return `M-Pesa: Lipa na M-PESA → Buy Goods, till ${g.number} (${g.name})`;
  return sw ? `M-Pesa, Tuma Pesa: *${spaced(g.number)}* (${g.name})` : `M-Pesa, Send Money: *${spaced(g.number)}* (${g.name})`;
}

export function buildChallengeUpdate(input: ChallengeShareInput): string {
  const { challenge: c, lang } = input;
  const t = c.totals;
  const sw = lang === "sw";
  const tr = (en: string, swahili: string) => (sw ? swahili : en);
  const name = sw && c.name_sw ? c.name_sw : c.name;
  const description = sw && c.description_sw ? c.description_sw : c.description;
  const lines: string[] = [];

  if (input.memorialName) lines.push(tr(`*In loving memory of ${input.memorialName}*`, `*Kwa kumbukumbu ya ${input.memorialName}*`));
  lines.push(tr(`*Challenge: ${name}*`, `*Changamoto: ${name}*`));
  if (c.status === "closed") lines.push(tr("_This challenge has closed. Thank you to everyone who took part._", "_Changamoto hii imefungwa. Asanteni wote mlioshiriki._"));
  if (description) {
    lines.push("");
    lines.push(description);
  }
  lines.push("");
  lines.push(tr(`_As at ${asAt(input.now ?? new Date(), lang)}_`, `_Hadi ${asAt(input.now ?? new Date(), lang)}_`));
  lines.push(
    tr(
      `*Raised so far: ${formatKesShort(t.raised_minor)}* (${t.contributions_count} contribution${t.contributions_count === 1 ? "" : "s"})`,
      `*Zilizochangwa hadi sasa: ${formatKesShort(t.raised_minor)}* (michango ${t.contributions_count})`,
    ),
  );
  if (c.target_minor) {
    const percent = Math.floor((t.raised_minor / c.target_minor) * 100);
    lines.push(tr(`Challenge target: ${formatKesShort(c.target_minor)} (${percent}% reached)`, `Lengo la changamoto: ${formatKesShort(c.target_minor)} (asilimia ${percent} imefikiwa)`));
    const left = c.target_minor - t.raised_minor;
    lines.push(
      left > 0
        ? tr(`Still to reach the target: ${formatKesShort(left)}`, `Kiasi kilichobaki kufikia lengo: ${formatKesShort(left)}`)
        : tr("*The challenge target has been reached. Thank you!*", "*Lengo la changamoto limefikiwa. Asanteni!*"),
    );
  }
  if (t.held_minor !== null && t.held_minor !== undefined && t.raised_minor > 0) {
    lines.push(tr(`Handed over to the main fund: ${formatKesShort(t.handed_over_minor ?? 0)}`, `Zimekabidhiwa kwa mfuko mkuu: ${formatKesShort(t.handed_over_minor ?? 0)}`));
    if (t.held_minor > 0) lines.push(tr(`Still with the challenge, to be handed over: ${formatKesShort(t.held_minor)}`, `Bado ziko kwenye changamoto, zitakabidhiwa: ${formatKesShort(t.held_minor)}`));
  }
  if (t.pledged_outstanding_minor > 0) {
    lines.push(tr(`Pledged, not yet received: ${formatKesShort(t.pledged_outstanding_minor)}`, `Ahadi ambazo bado hazijapokelewa: ${formatKesShort(t.pledged_outstanding_minor)}`));
  }

  if (input.includeList) {
    lines.push("");
    lines.push(tr("*Contributions through the challenge*", "*Michango kupitia changamoto*"));
    if (input.entries.length === 0) lines.push(tr("None yet. Be the first!", "Bado hakuna. Kuwa wa kwanza!"));
    input.entries.forEach((e, i) => lines.push(`${i + 1}. ${e.label}${e.amount_minor === null ? "" : ` – ${formatKesShort(e.amount_minor)}`}`));
  }

  lines.push("");
  lines.push(
    tr(
      "Every shilling goes to the funeral fund and counts towards the main target.",
      "Kila shilingi inaingia kwenye mfuko wa mazishi na inahesabiwa kwenye lengo kuu.",
    ),
  );
  if (input.includeGiving && c.status === "active" && input.giving) {
    lines.push("");
    lines.push(tr("*To take part*", "*Kushiriki*"));
    lines.push(howToGive(input.giving, lang));
    if (!input.ownGiving) {
      lines.push(tr(`Let us know it is for “${name}” so we add it to the challenge.`, `Tujulishe ni kwa ajili ya “${name}” ili tuuongeze kwenye changamoto.`));
    }
  }
  if (input.publicUrl) {
    lines.push("");
    lines.push(tr(`Follow the challenges: ${input.publicUrl}/challenges`, `Fuatilia changamoto: ${input.publicUrl}/challenges?lang=sw`));
  }
  lines.push("");
  lines.push(tr("Thank you for keeping the fundraiser going.", "Asanteni kwa kuendeleza mchango."));
  return lines.join("\n");
}

/** Starting points for a challenge's own messages. */
export const STARTERS: { title: string; body: string }[] = [
  { title: "Challenge message", body: STARTER_TEMPLATE },
  { title: "Fundraiser update", body: FUNDRAISER_TEMPLATE },
];
