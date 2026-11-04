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
    // The 24-hour clock: "saa 2:30" would read as Swahili hours (8:30 am).
    timeSw: `saa ${hour}:${parts.minute}`,
  };
}

/** "3 November 2026, 11:00 am" or, in Kiswahili, "3 Novemba 2026, saa 11:00" (clock time; "saa 14:30" after noon). */
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
      ["list", "this challenge's contributions: “1. Samuel – KSh 500”"],
      ["list_kes", "the same, in KES: “1. Samuel – KES 500”"],
      ["count", "how many contributions"],
      ["raised", "amount raised, e.g. 1,000"],
      ["target", "the challenge's target"],
      ["remaining", "still to reach the target"],
      ["pledged", "pledged, not yet received"],
      ["held", "still held by the challenge"],
      ["handed_over", "handed over to the main fund"],
      ["number", "the number to send to"],
      ["giving_name", "the name M-Pesa shows"],
      ["give", "how to give: “M-Pesa, Send Money: 0706 608 654 (Samuel Isaac)”"],
      ["give_sw", "the same in Kiswahili: “M-Pesa, Tuma Pesa: …”"],
      ["link", "the challenges page"],
    ],
  },
  {
    label: "The whole fundraiser (all contributions, not just this challenge)",
    fields: [
      ["memorial_name", "e.g. Dr. Joseph Karisa Gonzi"],
      ["memorial_dates", "e.g. 22 October 1952 – 1 November 2026"],
      ["tribute", "the tribute line"],
      ["all_list", "every contribution, numbered: “1. Edward Chai – KES 1,000”"],
      ["total_received", "all money received"],
      ["total_count", "how many contributions"],
      ["expenses", "funeral expenses paid, M-Pesa transaction costs included"],
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
      ["time_sw", "e.g. saa 11:00, or saa 14:30 after noon"],
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
    list_kes: input.entries.map((e, i) => `${i + 1}. ${e.label}${e.amount_minor === null ? "" : ` – KES ${bare(e.amount_minor)}`}`).join("\n"),
    count: String(t.contributions_count),
    raised: bare(t.raised_minor),
    target: c.target_minor ? bare(c.target_minor) : "",
    remaining: c.target_minor ? bare(Math.max(0, c.target_minor - t.raised_minor)) : "",
    pledged: bare(t.pledged_outstanding_minor),
    held: bare(t.held_minor ?? 0),
    handed_over: bare(t.handed_over_minor ?? 0),
    number: input.giving?.number ?? "",
    giving_name: input.giving?.name ?? "",
    give: input.giving ? howToGive(input.giving, "en").replace(/\*/g, "") : "",
    give_sw: input.giving ? howToGive(input.giving, "sw").replace(/\*/g, "") : "",
    date: n.date,
    date_sw: n.dateSw,
    time: n.time,
    time_sw: n.timeSw,
    today: formatNairobiLongDate(input.now ?? new Date()),
    link: input.publicUrl ? `${input.publicUrl}/challenges` : "",
    site: input.publicUrl ?? "",
    memorial_name: input.memorialName ?? "",
    ...fundraiserValues(input.fundraiser ?? null),
  };
  // A line whose figures are all empty (such as {list} before any contributions, or
  // "Lengo: KSh {target}" for a challenge without a target) is left out, so the same
  // message suits every challenge and never has a gap of blank lines.
  const known = (line: string) => [...line.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((key) => key in values);
  return template
    .split("\n")
    .filter((line) => {
      const keys = known(line);
      return keys.length === 0 || keys.some((key) => values[key].trim() !== "");
    })
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
    expenses: bare(t.expenses_minor + (t.charges_minor ?? 0)), // transaction costs count as spending
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

/** The family's update in English, reporting on the challenge's own contributions. */
export const ENGLISH_TEMPLATE = `In loving memory of {memorial_name}
{memorial_dates}
{tribute}

{name}
Contributions update
As of {today}

Contributions received
{list_kes}

Totals so far
Received: KES {raised} ({count} contributions)

The goal: KES {target}
Still needed: KES {remaining}

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

// Ready-made messages for any challenge. Lines whose figures a challenge does not have
// (a target, a number to send to) drop out, so none of them needs editing to fit.

/** The English update, in Kiswahili. */
export const SWAHILI_UPDATE_TEMPLATE = `Kwa kumbukumbu ya {memorial_name}
{memorial_dates}
{tribute}

*{name}*
Taarifa ya michango
Hadi {date_sw}, {time_sw}

Michango iliyopokelewa
{list}

Jumla hadi sasa
Iliyopatikana: KSh {raised} (michango {count})

Lengo: KSh {target}
Salio: KSh {remaining}

Rekodi kamili ya michango na matumizi: {site}

Asanteni kwa kusimama pamoja na familia.`;

/** Asking people to give: what the challenge is, where it stands and how to take part. */
export const INVITATION_TEMPLATE = `*{name}*

{description}

In loving memory of {memorial_name}

🎯 Target: KES {target}
✅ Raised so far: KES {raised} ({count} contributions)

💳 *How to contribute*
{give}

Follow the contributions: {link}

Every shilling counts. Thank you. ❤️`;

export const SWAHILI_INVITATION_TEMPLATE = `*{name}*

{description}

Kwa kumbukumbu ya {memorial_name}

🎯 Lengo: KSh {target}
✅ Iliyopatikana hadi sasa: KSh {raised} (michango {count})

💳 *Jinsi ya kuchangia*
{give_sw}

Fuatilia michango: {link}

Kila shilingi ina maana. Asanteni. ❤️`;

/** Closing a challenge: the total, everyone who gave, and thanks. */
export const THANKS_TEMPLATE = `🙏 *Thank you!*

*{name}*

Together we raised *KES {raised}* from {count} contributions, in loving memory of {memorial_name}.

{list_kes}

Every contribution is recorded: {link}

Thank you for your love and generosity. ❤️`;

export const SWAHILI_THANKS_TEMPLATE = `🙏 *Asanteni sana!*

*{name}*

Kwa pamoja tumechangia *KSh {raised}* kupitia michango {count}, kwa kumbukumbu ya {memorial_name}.

{list}

Kila mchango umerekodiwa: {link}

Asanteni kwa upendo na ukarimu wenu. ❤️`;

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
  { title: "Update in English", body: ENGLISH_TEMPLATE },
  { title: "Taarifa kwa Kiswahili", body: SWAHILI_UPDATE_TEMPLATE },
  { title: "Invitation to give", body: INVITATION_TEMPLATE },
  { title: "Mwaliko wa kuchangia", body: SWAHILI_INVITATION_TEMPLATE },
  { title: "Thank you", body: THANKS_TEMPLATE },
  { title: "Shukrani", body: SWAHILI_THANKS_TEMPLATE },
];
