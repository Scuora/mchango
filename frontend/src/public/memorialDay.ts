// The home page follows the funeral in Nairobi time: the light on his photograph,
// the lines under his name, the two buttons and the day cards change with the
// programme. Every boundary is an absolute instant, so a visitor in any timezone
// sees the same thing as someone in Nairobi.
//
// The card times are the home page's short form of the programme; the programme
// pages keep the full order of service (programme.ts).

import type { Pair } from "./programme";

export type Phase = "eve" | "fri" | "vigil" | "sat" | "burial" | "after";
export type DayKey = "fri" | "sat";

/** A Nairobi clock time in November 2026, as an instant (Nairobi is UTC+3 all year). */
export const nairobi = (day: number, hour: number, minute = 0) => Date.UTC(2026, 10, day, hour - 3, minute);

const FRIDAY = nairobi(6, 0);
const SATURDAY = nairobi(7, 0);

/** Where each phase begins; "eve" is everything before Friday 6:00. */
const STARTS: readonly [Phase, number][] = [
  ["fri", nairobi(6, 6)],
  ["vigil", nairobi(6, 16)],
  ["sat", nairobi(7, 6)],
  ["burial", nairobi(7, 15)],
  ["after", nairobi(7, 16)],
];

export function memorialPhase(t: number): Phase {
  let phase: Phase = "eve";
  for (const [p, from] of STARTS) if (t >= from) phase = p;
  return phase;
}

export interface Stop {
  /** When the item is on. Items without a published time have neither, and are never "now". */
  from?: number;
  until?: number;
  time: Pair;
  text: Pair;
}

export const STOPS: Record<DayKey, readonly Stop[]> = {
  fri: [
    { from: nairobi(6, 6), until: nairobi(6, 11), time: ["6:00 a.m. (to be confirmed)", "6:00 (muda utathibitishwa)"], text: ["At the funeral home", "Katika nyumba ya mazishi"] },
    { from: nairobi(6, 11), until: nairobi(6, 16), time: ["11:00 a.m. to noon, expected", "11:00 – 12:00, inatarajiwa"], text: ["Procession in Bamba", "Msafara mjini Bamba"] },
    { from: nairobi(6, 16), until: nairobi(7, 6), time: ["4:00 p.m.", "16:00"], text: ["At the family home", "Nyumbani kwa familia"] },
    { time: ["Night", "Usiku"], text: ["Night vigil", "Mkesha"] },
  ],
  // Nothing is scheduled from 1:30 to 2:00 p.m.: the status shows what comes next.
  sat: [
    { from: nairobi(7, 9), until: nairobi(7, 10), time: ["9:00 a.m.", "9:00"], text: ["Family, friends and the community gather", "Familia, marafiki na jamii wanakusanyika"] },
    { from: nairobi(7, 10), until: nairobi(7, 10, 35), time: ["10:00 a.m.", "10:00"], text: ["Opening prayer, worship and welcome", "Maombi ya ufunguzi, kuabudu na ukaribisho"] },
    { from: nairobi(7, 10, 35), until: nairobi(7, 13, 30), time: ["10:35 a.m.", "10:35"], text: ["Speeches, tributes and the eulogy", "Hotuba, salamu za heshima na wasifu"] },
    { from: nairobi(7, 14), until: nairobi(7, 15), time: ["2:00 p.m.", "14:00"], text: ["Sermon and reflection", "Mahubiri na tafakari"] },
    { from: nairobi(7, 15), until: nairobi(7, 16), time: ["3:00 p.m.", "15:00"], text: ["Burial service", "Ibada ya maziko"] },
  ],
};

export const WORDS = {
  today: ["Today", "Leo"],
  tomorrow: ["Tomorrow", "Kesho"],
  tonight: ["Tonight", "Leo usiku"],
  now: ["Now", "Sasa"],
  friDay: ["Friday, 6 November", "Ijumaa, 6 Novemba"],
  satDay: ["Saturday, 7 November", "Jumamosi, 7 Novemba"],
  friTitle: ["Procession and night vigil", "Msafara na mkesha"],
  satTitle: ["Funeral and burial service", "Ibada ya mazishi na maziko"],
  friWhere: ["Funeral home, Bamba and the family home", "Nyumba ya mazishi, Bamba na nyumbani kwa familia"],
  satWhere: ["At his homestead, Bamba, Kibomu Ni Mvula", "Boma la mwendazake, Bamba, Kibomu Ni Mvula"],
  eveSub: ["Friday, 6 November, from 6:00 a.m. (time to be confirmed)", "Ijumaa, 6 Novemba, kuanzia saa 6:00 (muda utathibitishwa)"],
  vigilMain: ["Night vigil at the family home", "Mkesha nyumbani kwa familia"],
  vigilSub: ["Tomorrow from 9:00 a.m.: funeral and burial service", "Kesho kuanzia saa 9:00: ibada ya mazishi na maziko"],
  // After midnight the service is no longer "tomorrow".
  vigilSubToday: ["Today from 9:00 a.m.: funeral and burial service", "Leo kuanzia saa 9:00: ibada ya mazishi na maziko"],
  thanks: ["Thank you for standing with the family.", "Asanteni kwa kusimama pamoja na familia."],
} as const satisfies Record<string, Pair>;

export type StopState = "done" | "now" | null;

export function stopState(stop: Stop, t: number): StopState {
  if (stop.from === undefined || stop.until === undefined) return null;
  return t >= stop.until ? "done" : t >= stop.from ? "now" : null;
}

/** The item on now and the next one with a time; either can be missing (before, between or after items). */
export function currentAndNext(day: DayKey, t: number): { current: Stop | null; next: Stop | null } {
  const timed = STOPS[day].filter((s) => s.from !== undefined);
  return {
    current: timed.find((s) => stopState(s, t) === "now") ?? null,
    next: timed.find((s) => t < s.from!) ?? null,
  };
}

export interface HeroStatus {
  label: Pair | null;
  main: Pair;
  sub: Pair | null;
  flame: boolean;
}

/** The three lines under his name. */
export function heroStatus(phase: Phase, t: number): HeroStatus {
  if (phase === "eve") {
    const label = t >= FRIDAY ? WORDS.today : t >= nairobi(5, 0) ? WORDS.tomorrow : null;
    return { label, main: WORDS.friTitle, sub: WORDS.eveSub, flame: true };
  }
  if (phase === "vigil") return { label: WORDS.tonight, main: WORDS.vigilMain, sub: t >= SATURDAY ? WORDS.vigilSubToday : WORDS.vigilSub, flame: true };
  if (phase === "after") return { label: null, main: WORDS.thanks, sub: null, flame: false };
  const friday = phase === "fri";
  const { current, next } = currentAndNext(friday ? "fri" : "sat", t);
  return {
    label: current && phase === "burial" ? WORDS.now : WORDS.today,
    main: current ? current.text : friday ? WORDS.friTitle : WORDS.satTitle,
    sub: next ? [`Next: ${next.text[0]}, ${next.time[0]}`, `Kinachofuata: ${next.text[1]}, ${next.time[1]}`] : friday ? WORDS.friWhere : WORDS.satWhere,
    flame: true,
  };
}

export interface HeroAction {
  to: string;
  label: Pair;
}

const PROGRAMME: HeroAction = { to: "/programme", label: ["Funeral programme", "Ratiba ya mazishi"] };
const CONTRIBUTE: HeroAction = { to: "/contribute", label: ["How do I contribute?", "Nitachangiaje?"] };
const todayAt = (to: string): HeroAction => ({ to, label: ["Today's programme", "Ratiba ya leo"] });

/** The two buttons under the status; `directions` is the update with the place of burial. */
export function heroActions(phase: Phase, directions: string): [HeroAction, HeroAction] {
  const toDirections: HeroAction = { to: directions, label: ["Directions", "Maelekezo"] };
  switch (phase) {
    case "eve":
      return [PROGRAMME, CONTRIBUTE];
    case "fri":
      return [todayAt("/programme/friday"), CONTRIBUTE];
    case "vigil":
      return [{ to: "/programme/saturday", label: ["Saturday's programme", "Ratiba ya Jumamosi"] }, toDirections];
    case "after":
      return [{ to: "/contribute", label: ["See the contributions", "Tazama michango"] }, { to: "/updates", label: ["Updates", "Taarifa"] }];
    default:
      return [toDirections, todayAt("/programme/saturday")];
  }
}

export interface DayCardState {
  /** Today, Tomorrow or Tonight, by the Nairobi calendar. */
  chip: Pair | null;
  /** The day that is on now. */
  current: boolean;
  past: boolean;
  stops: { stop: Stop; state: StopState }[];
}

export function dayCard(day: DayKey, phase: Phase, t: number): DayCardState {
  const friday = day === "fri";
  const date = t >= SATURDAY ? 7 : t >= FRIDAY ? 6 : t >= nairobi(5, 0) ? 5 : 0;
  const chip = friday
    ? phase === "vigil"
      ? WORDS.tonight
      : date === 5
        ? WORDS.tomorrow
        : date === 6
          ? WORDS.today
          : null
    : date === 6
      ? WORDS.tomorrow
      : date === 7 && phase !== "after"
        ? WORDS.today
        : null;
  const past = friday ? phase === "sat" || phase === "burial" || phase === "after" : phase === "after";
  return {
    chip,
    current: friday ? phase === "fri" || phase === "vigil" : phase === "sat" || phase === "burial",
    past,
    // Once the day is over, its untimed items are over too.
    stops: STOPS[day].map((stop) => ({ stop, state: past ? "done" : stopState(stop, t) })),
  };
}

/** A moment in each phase, for reviewing the page with #day-preview. */
export const PREVIEW_AT: Record<Phase, number> = {
  eve: nairobi(5, 14),
  fri: nairobi(6, 11, 20),
  vigil: nairobi(6, 20),
  sat: nairobi(7, 10, 40),
  burial: nairobi(7, 15, 10),
  after: nairobi(7, 17),
};
