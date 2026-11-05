import { describe, expect, it } from "vitest";
import { ENGLISH_TEMPLATE, STARTER_TEMPLATE, SWAHILI_INVITATION_TEMPLATE, buildChallengeUpdate, fillTemplate } from "./challengeShare";
import type { PublicPage } from "./types";

const challenge = {
  name: "Cousins' 1,000 challenge",
  name_sw: "Changamoto ya binamu ya 1,000",
  description: "",
  description_sw: null,
  target_minor: 50_000_00,
  status: "active" as const,
  totals: { raised_minor: 12_000_00, contributions_count: 3, pledged_outstanding_minor: 0 },
};
const base = {
  challenge,
  entries: [{ label: "Zawadi", amount_minor: 1_000_00 }],
  memorialName: "Dr. Joseph Karisa Gonzi",
  giving: { method: "phone" as const, number: "0711672840", account: null, name: "Michael Kitsao" },
  publicUrl: "https://rip-daktari.netlify.app",
  includeList: true,
  includeGiving: true,
  now: new Date("2026-11-03T08:00:00Z"), // 11:00 in Nairobi
};

describe("challenge update", () => {
  it("gives the challenge's own figures, in English", () => {
    const text = buildChallengeUpdate({ ...base, lang: "en" });
    expect(text).toContain("_As at 3 November 2026, 11:00 am_");
    expect(text).toContain("*Raised so far: KES 12,000* (3 contributions)");
    // Only what has come in: no target, nothing still to reach.
    expect(text).not.toMatch(/target|Still to reach/i);
    expect(text).toContain("1. Zawadi – KES 1,000");
    expect(text).toContain("M-Pesa, Send Money: *0711 672 840* (Michael Kitsao)");
  });

  it("writes the clock time in Kiswahili, not Swahili hours", () => {
    const text = buildChallengeUpdate({ ...base, lang: "sw" });
    expect(text).toContain("*Changamoto: Changamoto ya binamu ya 1,000*");
    expect(text).toContain("_Hadi 3 Novemba 2026, saa 11:00_");
    expect(text).toContain("https://rip-daktari.netlify.app/challenges?lang=sw");
  });

  it("says what a challenge with its own money has handed over, and how to give to it", () => {
    const own = { ...challenge, totals: { ...challenge.totals, held_minor: 2_000_00, handed_over_minor: 10_000_00 } };
    const giving = { method: "phone" as const, number: "0722000000", account: null, name: "Jane Organiser" };
    const text = buildChallengeUpdate({ ...base, challenge: own, giving, ownGiving: true, lang: "en" });
    expect(text).toContain("Handed over to the main fund: KES 10,000");
    expect(text).toContain("Still with the challenge, to be handed over: KES 2,000");
    expect(text).toContain("M-Pesa, Send Money: *0722 000 000* (Jane Organiser)");
    expect(text).not.toContain("Let us know");
  });

  it("fills the family's own message with the live figures", () => {
    const entries = [
      { label: "Samuel Mashanga", amount_minor: 500_00 },
      { label: "Hon. Phillister Sauti", amount_minor: 100_00 },
    ];
    const giving = { method: "phone" as const, number: "0706608654", account: null, name: "Samuel Isaac" };
    const own = { ...challenge, name: "❤️ DAY 1 CHALLENGE ❤️", totals: { ...challenge.totals, raised_minor: 1_000_00 } };
    const text = fillTemplate(STARTER_TEMPLATE, { ...base, challenge: own, entries, giving });
    expect(text).toContain("❤️ DAY 1 CHALLENGE ❤️");
    expect(text).toContain("1. Samuel Mashanga – KSh 500\n2. Hon. Phillister Sauti – KSh 100");
    expect(text).toContain("🎯 TAARIFA ZA MCHANGO\n\n•  Iliyopatikana: KSh 1,000\n\n💳");
    expect(text).toContain("📱 0706608654");
    expect(text).toContain("👤 Jina: Samuel Isaac");
    expect(fillTemplate("Hadi {date_sw}, {time_sw} {unknown}", { ...base, entries })).toBe("Hadi 3 Novemba 2026, saa 11:00 {unknown}");
  });

  it("fits a ready-made message to a challenge without a target, with the clock time after noon", () => {
    const jeneza = { ...challenge, name: "Jeneza", target_minor: null };
    const giving = { method: "phone" as const, number: "0706608654", account: null, name: "Samuel Isaac" };
    const afternoon = new Date("2026-11-04T11:30:00Z"); // 14:30 in Nairobi
    const text = fillTemplate(SWAHILI_INVITATION_TEMPLATE, { ...base, challenge: jeneza, giving, now: afternoon });
    expect(text).toContain("✅ Iliyopatikana hadi sasa: KSh 12,000 (michango 3)\n\n💳 *Jinsi ya kuchangia*\nM-Pesa, Tuma Pesa: 0706 608 654 (Samuel Isaac)");
    expect(text).not.toContain("Lengo");
    expect(fillTemplate("Hadi {time_sw}", { ...base, now: afternoon })).toBe("Hadi saa 14:30");
  });

  it("leaves no gap when a placeholder is empty, and drops what is still needed from the family's own messages", () => {
    const text = fillTemplate("{name}\n\n{list}\n\nSalio : KSh {remaining}\nStill needed: KES {still_needed}\nLengo: KSh {target}", { ...base, entries: [] });
    expect(text.trimEnd()).toBe("Cousins' 1,000 challenge");
  });

  it("fills the fundraiser's general update from the public view", () => {
    const entry = (label: string, amount: number, hour: number) => ({ label, amount_minor: amount, date: "2026-11-03", at: `2026-11-03T0${hour}:00:00Z`, kind: "contribution" as const, direction: "in" as const, reference_hint: null, matched_to_statement: false, receipts: [] });
    const group = (pledged: number, received: number, outstanding: number) => ({ count: 1, pledged_minor: pledged, received_minor: received, outstanding_minor: outstanding });
    const page = {
      fundraiser: {
        name: "Funeral", memorial_name: "Dr. Joseph Karisa Gonzi", memorial_dates: "22 October 1952 – 1 November 2026", memorial_tribute: "Kalale Pehoni Daktari",
        target_minor: 1_100_000_00, pledges: { family: group(570_000_00, 0, 570_000_00), friends: group(100_000_00, 0, 100_000_00) },
      },
      totals: { contributions_minor: 12_300_00, contributions_count: 4, expenses_minor: 0, remaining_minor: 12_300_00 },
      // Newest first, as the public page lists them.
      contributions: [entry("Rose Otieno", 1_000_00, 8), entry("Peter Katana", 10_000_00, 7), entry("Japhet Kalume", 300_00, 6), entry("Edward Chai", 1_000_00, 5)],
    } as unknown as PublicPage;
    // The whole fundraiser's figures, when a message asks for them by name.
    const whole = `In loving memory of {memorial_name}\n{memorial_dates}\n{tribute}\n\nAs of {today}\n\n{all_list}\n\nReceived: KES {total_received} ({total_count} contributions)\nFuneral expenses paid: KES {expenses}\nFunds remaining: KES {funds_remaining}\n\nThe goal: KES {goal}\nReceived from {family}: KES {family_received}\nFrom family, friends and well-wishers: KES {others_received} of KES {others_share}\nPledged by family, friends and well-wishers, not yet received: KES {others_pledged}\nStill needed: KES {still_needed}\n\nFull record of contributions and expenses: {site}\n`;
    const text = fillTemplate(whole, { ...base, entries: [], fundraiser: page });
    expect(text).toContain("In loving memory of Dr. Joseph Karisa Gonzi\n22 October 1952 – 1 November 2026\nKalale Pehoni Daktari");
    expect(text).toContain("As of Tue, 3 Nov 2026");
    expect(text).toContain("1. Edward Chai – KES 1,000\n2. Japhet Kalume – KES 300\n3. Peter Katana – KES 10,000\n4. Rose Otieno – KES 1,000");
    expect(text).toContain("Received: KES 12,300 (4 contributions)\nFuneral expenses paid: KES 0\nFunds remaining: KES 12,300");
    // Only what has come in, been spent and remains: the goal lines of an older message drop out.
    expect(text).toContain("Funds remaining: KES 12,300\n\nFull record of contributions and expenses: https://rip-daktari.netlify.app\n");
    expect(text).not.toMatch(/goal|Still needed|not yet received|Received from the family|530,000|570,000/);
  });

  it("reports the challenge's own contributions in the English update", () => {
    const entries = [
      { label: "Philister Kahindi", amount_minor: 100_00 },
      { label: "Joseph Mwaduna", amount_minor: 200_00 },
      { label: "Lorraine Katana", amount_minor: 200_00 },
    ];
    const day1 = { ...challenge, name: "❤️ DAY 1 CHALLENGE ❤️", totals: { ...challenge.totals, raised_minor: 500_00, contributions_count: 3 } };
    const page = { fundraiser: { name: "Funeral", memorial_name: "Dr. Joseph Karisa Gonzi", memorial_dates: "22 October 1952 – 1 November 2026", memorial_tribute: "Kalale Pehoni Daktari", target_minor: 1_100_000_00, pledges: null }, totals: { contributions_minor: 15_000_00 }, contributions: [] } as unknown as PublicPage;
    const text = fillTemplate(ENGLISH_TEMPLATE, { ...base, challenge: day1, entries, fundraiser: page });
    expect(text).toContain("In loving memory of Dr. Joseph Karisa Gonzi\n22 October 1952 – 1 November 2026\nKalale Pehoni Daktari\n\n❤️ DAY 1 CHALLENGE ❤️");
    expect(text).toContain("Contributions received\n1. Philister Kahindi – KES 100\n2. Joseph Mwaduna – KES 200\n3. Lorraine Katana – KES 200\n");
    expect(text).toContain("Received: KES 500 (3 contributions)\n\nFull record of contributions and expenses:");
    expect(text).not.toMatch(/goal|Still needed|50,000/);
    expect(text).not.toContain("15,000");
  });
});
