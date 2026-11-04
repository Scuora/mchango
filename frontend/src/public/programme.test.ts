import { describe, expect, it } from "vitest";
import { PROGRAMME, dayStatus, defaultDay, programmeShareText, untilText } from "./programme";

const [friday, saturday] = PROGRAMME;
const nairobi = (iso: string) => new Date(`${iso}+03:00`);

describe("funeral programme", () => {
  it("says what is on now, what is next, and when the day begins or has ended", () => {
    expect(dayStatus(friday, nairobi("2026-11-04T16:30:00"))).toMatchObject({ kind: "upcoming", tentative: true });
    const now = dayStatus(saturday, nairobi("2026-11-07T11:20:00"));
    expect(now).toMatchObject({ kind: "now", part: 3, next: 4 });
    expect(now.kind === "now" && Math.round(now.progress * 100)).toBe(26); // 45 of the 175 minutes of speeches
    expect(dayStatus(saturday, nairobi("2026-11-07T13:45:00"))).toMatchObject({ kind: "between", next: 4 });
    expect(dayStatus(saturday, nairobi("2026-11-07T16:00:00"))).toEqual({ kind: "ended" });
    expect(defaultDay(nairobi("2026-11-06T23:59:00"))).toBe("friday");
    expect(defaultDay(nairobi("2026-11-07T00:01:00"))).toBe("saturday");
  });

  it("writes Kiswahili times as the clock shows them, never beside asubuhi, mchana or jioni", () => {
    const text = programmeShareText(saturday, "Dr. Joseph Karisa Gonzi", "https://example.org/programme/saturday", "sw");
    expect(text).toContain("Saa 14:00 – 15:00: Mahubiri na tafakari ya Neno la Mungu");
    const swahili = JSON.stringify(PROGRAMME.map((d) => d.parts.map((p) => [p.label?.[1], p.title[1], p.time[1], p.items.map((i) => [i.text[1], i.note?.[1]])])));
    expect(swahili).not.toMatch(/asubuhi|mchana|jioni/i);
    expect(untilText(nairobi("2026-11-05T15:00:00"), nairobi("2026-11-06T06:00:00"), "sw")).toBe("baada ya masaa 15");
    expect(untilText(nairobi("2026-11-04T16:00:00"), nairobi("2026-11-06T06:00:00"), "en")).toBe("in 1 day and 14 hours");
  });
});
