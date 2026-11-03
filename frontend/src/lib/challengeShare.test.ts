import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATE, buildChallengeUpdate, fillTemplate } from "./challengeShare";

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
    expect(text).toContain("Still to reach the target: KES 38,000");
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
    expect(text).toContain("•  Target Amount : KSh 50,000\n•  Iliyopatikana: KSh 1,000\n•  Salio : KSh 49,000");
    expect(text).toContain("📱 0706608654");
    expect(text).toContain("👤 Jina: Samuel Isaac");
    expect(fillTemplate("Hadi {date_sw}, {time_sw} {unknown}", { ...base, entries })).toBe("Hadi 3 Novemba 2026, saa 11:00 {unknown}");
  });

  it("leaves no gap when a placeholder is empty", () => {
    const text = fillTemplate("{name}\n\n{list}\n\nSalio : KSh {remaining}", { ...base, entries: [] });
    expect(text).toBe("Cousins' 1,000 challenge\n\nSalio : KSh 38,000");
  });
});
