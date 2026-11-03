import { describe, expect, it } from "vitest";
import { buildChallengeUpdate } from "./challengeShare";

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
});
