// A WhatsApp update about one challenge, in English or Kiswahili. Like the main
// update it uses public fields only: public names (or the anonymous label),
// amounts the family has chosen to show, and the giving details already on the
// public page. WhatsApp formatting: *bold*, _italic_, plain lines.

import { formatKesShort } from "./money";
import type { ChallengeStatus, ChallengeTotals, GivingMethod } from "./types";

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
  /** The public page address, without a trailing slash. */
  publicUrl: string | null;
  lang: ShareLang;
  includeList: boolean;
  includeGiving: boolean;
  now?: Date;
}

const MONTHS_SW = ["Januari", "Februari", "Machi", "Aprili", "Mei", "Juni", "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba"];

/** "3 November 2026, 11:00 am" or, in Kiswahili, "3 Novemba 2026, saa 11:00" (clock time, as on the clock). */
export function asAt(now: Date, lang: ShareLang): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const [day, hour] = [Number(parts.day), Number(parts.hour)];
  const clock = `${hour % 12 || 12}:${parts.minute}`;
  if (lang === "sw") return `${day} ${MONTHS_SW[Number(parts.month) - 1]} ${parts.year}, saa ${clock}`;
  const month = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", month: "long" }).format(now);
  return `${day} ${month} ${parts.year}, ${clock} ${hour < 12 ? "am" : "pm"}`;
}

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
