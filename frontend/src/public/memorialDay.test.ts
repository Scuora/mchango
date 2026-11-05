import { describe, expect, it } from "vitest";
import { STOPS, WORDS, dayCard, heroActions, heroStatus, memorialPhase, nairobi, type Phase } from "./memorialDay";

const en = (t: number) => {
  const s = heroStatus(memorialPhase(t), t);
  return [memorialPhase(t), s.label?.[0] ?? null, s.main[0], s.sub?.[0] ?? null];
};

describe("the memorial day", () => {
  it("follows the programme at every boundary, in Nairobi time", () => {
    const rows: [number, Phase, string | null, string, string | null][] = [
      [nairobi(5, 23, 59), "eve", "Tomorrow", "Procession and night vigil", "Friday, 6 November, from 6:00 a.m. (time to be confirmed)"],
      [nairobi(6, 0), "eve", "Today", "Procession and night vigil", "Friday, 6 November, from 6:00 a.m. (time to be confirmed)"],
      [nairobi(6, 6), "fri", "Today", "At the funeral home", "Next: Procession in Bamba, 11:00 a.m. to noon, expected"],
      [nairobi(6, 11), "fri", "Today", "Procession in Bamba", "Next: At the family home, 4:00 p.m."],
      [nairobi(6, 15, 59), "fri", "Today", "Procession in Bamba", "Next: At the family home, 4:00 p.m."],
      [nairobi(6, 16), "vigil", "Tonight", "Night vigil at the family home", "Tomorrow from 9:00 a.m.: funeral and burial service"],
      [nairobi(7, 0), "vigil", "Tonight", "Night vigil at the family home", "Today from 9:00 a.m.: funeral and burial service"],
      [nairobi(7, 6), "sat", "Today", "Funeral and burial service", "Next: Family, friends and the community gather, 9:00 a.m."],
      [nairobi(7, 9), "sat", "Today", "Family, friends and the community gather", "Next: Opening prayer, worship and welcome, 10:00 a.m."],
      [nairobi(7, 10, 35), "sat", "Today", "Speeches, tributes and the eulogy", "Next: Sermon and reflection, 2:00 p.m."],
      // Nothing is scheduled from 1:30 to 2:00 p.m.: no invented break, just what comes next.
      [nairobi(7, 13, 30), "sat", "Today", "Funeral and burial service", "Next: Sermon and reflection, 2:00 p.m."],
      [nairobi(7, 14), "sat", "Today", "Sermon and reflection", "Next: Burial service, 3:00 p.m."],
      [nairobi(7, 15), "burial", "Now", "Burial service", "At his homestead, Bamba, Kibomu Ni Mvula"],
      [nairobi(7, 16), "after", null, "Thank you for standing with the family.", null],
    ];
    for (const [t, ...expected] of rows) expect(en(t)).toEqual(expected);
    expect(heroStatus("after", nairobi(7, 16)).flame).toBe(false);
  });

  it("is the same for a visitor outside Kenya", () => {
    // 10:30 p.m. Thursday in New York is 6:30 a.m. Friday in Nairobi.
    expect(memorialPhase(Date.parse("2026-11-05T22:30:00-05:00"))).toBe("fri");
    // Saturday morning in Auckland is still Friday night in Nairobi: Saturday is tomorrow, not today.
    const auckland = Date.parse("2026-11-07T07:00:00+13:00");
    expect(memorialPhase(auckland)).toBe("vigil");
    expect(dayCard("sat", "vigil", auckland).chip).toEqual(WORDS.tomorrow);
  });

  it("offers the buttons for each phase, with a way to contribute before and after", () => {
    const routes = (p: Phase) => heroActions(p, "/updates/1").map((a) => a.to);
    expect(routes("eve")).toEqual(["/programme", "/contribute"]);
    expect(routes("fri")).toEqual(["/programme/friday", "/contribute"]);
    expect(routes("vigil")).toEqual(["/programme/saturday", "/updates/1"]);
    expect(routes("sat")).toEqual(["/updates/1", "/programme/saturday"]);
    expect(routes("burial")).toEqual(["/updates/1", "/programme/saturday"]);
    expect(routes("after")).toEqual(["/contribute", "/updates"]);
  });

  it("marks the item on now and dims finished ones, never an untimed item", () => {
    const states = (day: "fri" | "sat", t: number) => dayCard(day, memorialPhase(t), t).stops.map((s) => s.state);
    expect(states("fri", nairobi(6, 20))).toEqual(["done", "done", "now", null]);
    expect(states("sat", nairobi(7, 13, 45))).toEqual(["done", "done", "done", null, null]);
    expect(states("fri", nairobi(7, 10))).toEqual(["done", "done", "done", "done"]);
    const friday = dayCard("fri", "vigil", nairobi(6, 20));
    expect([friday.chip, friday.current]).toEqual([WORDS.tonight, true]);
    expect(dayCard("sat", "eve", nairobi(5, 14)).chip).toBeNull();
    expect(dayCard("sat", "after", nairobi(7, 17))).toMatchObject({ chip: null, past: true });
  });

  it("writes Kiswahili times as the clock shows them", () => {
    const swahili = JSON.stringify([STOPS, WORDS].map((x) => JSON.stringify(x)));
    expect(swahili).not.toMatch(/asubuhi|mchana|jioni/i);
    expect(heroStatus("sat", nairobi(7, 13, 45)).sub?.[1]).toBe("Kinachofuata: Mahubiri na tafakari, 14:00");
  });
});
