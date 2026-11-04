// The funeral programme for Friday and Saturday, in English and Kiswahili, with
// the clock times that let the pages say what is happening now and what is next.
//
// Times are Nairobi clock times ("HH:MM"; "24:00" is the end of the day). In
// Kiswahili the time is written as the clock shows it ("saa 9:00", "saa 14:00"),
// never in Swahili hours and never beside asubuhi/mchana/jioni, which would turn
// it into Swahili hours.

export type DayId = "friday" | "saturday";
/** English, then Kiswahili. */
export type Pair = readonly [en: string, sw: string];

/** A photo seen through a large numeral: its size and offset, in em of the numeral's font size. */
export interface NumeralPhoto {
  src: string;
  size: number;
  x: number;
  y: number;
}

export interface ProgrammeItem {
  text: Pair;
  /** A time or duration shown under the line. */
  note?: Pair;
}

export interface ProgrammePart {
  start: string;
  end: string;
  /** The start time is still to be confirmed. */
  tentative?: boolean;
  /** "Morning" and the like; Kiswahili has none, so no time-of-day word sits near a clock time. */
  label?: Pair;
  title: Pair;
  /** The time as shown, e.g. "9:00 a.m. – 10:00 a.m." / "Saa 9:00 – 10:00". */
  time: Pair;
  items: ProgrammeItem[];
  numeral?: NumeralPhoto;
}

export interface ProgrammeDay {
  id: DayId;
  /** Nairobi date, YYYY-MM-DD. */
  date: string;
  weekday: Pair;
  /** "6 November 2026". */
  dateLong: Pair;
  /** "Fri" / "Ijumaa" ("J'mosi" for Jumamosi) and the day of the month, for small tiles. */
  tile: { weekday: Pair; day: string; month: Pair };
  title: Pair;
  /** One line for menus. */
  summary: Pair;
  /** When the day begins: "6:00 a.m." / "saa 6:00". */
  begins: Pair;
  venue?: Pair;
  /** The printed programme, for downloading. */
  poster: string;
  /** The photo for cards that link to this day. */
  cover: string;
  parts: ProgrammePart[];
}

const IMG = "/img/programme";

export const PROGRAMME: readonly ProgrammeDay[] = [
  {
    id: "friday",
    date: "2026-11-06",
    weekday: ["Friday", "Ijumaa"],
    dateLong: ["6 November 2026", "6 Novemba 2026"],
    tile: { weekday: ["Fri", "Ijumaa"], day: "6", month: ["Nov", "Nov"] },
    title: ["Procession, Family Gathering and Night Vigil", "Msafara, Mkusanyiko wa Familia na Mkesha"],
    summary: ["Procession and night vigil", "Msafara na mkesha"],
    begins: ["6:00 a.m.", "saa 6:00"],
    poster: `${IMG}/friday-programme.jpg`,
    cover: `${IMG}/road.jpg`,
    parts: [
      {
        start: "06:00",
        end: "11:00",
        tentative: true,
        label: ["Morning", ""],
        title: ["At the Funeral Home", "Katika Nyumba ya Mazishi"],
        time: ["From 6:00 a.m.", "Kuanzia saa 6:00"],
        numeral: { src: `${IMG}/road.jpg`, size: 1.8667, x: -0.5, y: -0.1333 },
        items: [
          { text: ["Departure from Bamba for the funeral home", "Kuondoka Bamba kuelekea nyumba ya mazishi"], note: ["6:00 a.m. · time to be confirmed", "Saa 6:00 · muda utathibitishwa"] },
          { text: ["The family gathers to receive Daktari", "Familia inakusanyika kumpokea Daktari"] },
          { text: ["Prayers and words of comfort", "Maombi na maneno ya faraja"] },
          { text: ["A moment to pay our respects and say goodbye to Daktari", "Wakati wa kutoa heshima zetu na kumuaga Daktari"] },
          { text: ["Departure for Bamba", "Kuondoka kuelekea Bamba"] },
        ],
      },
      {
        start: "11:00",
        end: "16:00",
        label: ["Midday", ""],
        title: ["Procession in Bamba", "Msafara Mjini Bamba"],
        time: ["From 11:00 a.m.", "Kuanzia saa 11:00"],
        numeral: { src: `${IMG}/desk.jpg`, size: 1.8667, x: -0.1333, y: -0.2 },
        items: [
          { text: ["Arrival in Bamba", "Kuwasili Bamba"], note: ["Expected between 11:00 a.m. and noon", "Inatarajiwa kati ya saa 11:00 na 12:00"] },
          { text: ["Procession through Mgandamwani", "Msafara kupitia Mgandamwani"], note: ["30 minutes", "Dakika 30"] },
          { text: ["Procession to Bamba Maternity and Nursing Home", "Msafara hadi Bamba Maternity and Nursing Home"], note: ["30 minutes", "Dakika 30"] },
        ],
      },
      {
        start: "16:00",
        end: "24:00",
        label: ["Afternoon & Evening", ""],
        title: ["At the Family Home", "Nyumbani kwa Familia"],
        time: ["From 4:00 p.m.", "Kuanzia saa 16:00"],
        numeral: { src: `${IMG}/home.jpg`, size: 2, x: -0.2, y: -0.1333 },
        items: [
          { text: ["Arrival at the family home", "Kuwasili nyumbani kwa familia"], note: ["4:00 p.m.", "Saa 16:00"] },
          { text: ["The family welcomes visitors and their messages of comfort", "Familia inawakaribisha wageni na salamu zao za faraja"] },
          { text: ["Praise and worship", "Sifa na kuabudu"] },
          { text: ["Sermon and prayers", "Mahubiri na maombi"] },
          { text: ["Tea and refreshments", "Chai na viburudisho"] },
          { text: ["Night vigil", "Mkesha"] },
        ],
      },
    ],
  },
  {
    id: "saturday",
    date: "2026-11-07",
    weekday: ["Saturday", "Jumamosi"],
    dateLong: ["7 November 2026", "7 Novemba 2026"],
    tile: { weekday: ["Sat", "J'mosi"], day: "7", month: ["Nov", "Nov"] },
    title: ["Funeral and Burial Service", "Ibada ya Mazishi na Maziko"],
    summary: ["Funeral and burial service", "Ibada ya mazishi na maziko"],
    begins: ["9:00 a.m.", "saa 9:00"],
    venue: ["At his homestead, Kibomu Ni Mvula", "Boma la mwendazake, Kibomu Ni Mvula"],
    poster: `${IMG}/saturday-programme.jpg`,
    cover: `${IMG}/fez.jpg`,
    parts: [
      { start: "09:00", end: "10:00", title: ["Family, friends and the community gather to receive Daktari", "Familia, marafiki na jamii wanakusanyika kumpokea Daktari"], time: ["9:00 a.m. – 10:00 a.m.", "Saa 9:00 – 10:00"], items: [] },
      { start: "10:00", end: "10:30", title: ["Opening prayer and worship", "Maombi ya ufunguzi na kuabudu"], time: ["10:00 a.m. – 10:30 a.m.", "Saa 10:00 – 10:30"], items: [] },
      { start: "10:30", end: "10:35", title: ["Words of welcome from the family representative", "Maneno ya ukaribisho kutoka kwa mwakilishi wa familia"], time: ["10:30 a.m. – 10:35 a.m.", "Saa 10:30 – 10:35"], items: [] },
      { start: "10:35", end: "13:30", title: ["Speeches, tributes and the eulogy in honour of Daktari", "Hotuba, salamu za heshima na wasifu wa Daktari"], time: ["10:35 a.m. – 1:30 p.m.", "Saa 10:35 – 13:30"], items: [] },
      { start: "14:00", end: "15:00", title: ["Sermon and reflection on the Word of God", "Mahubiri na tafakari ya Neno la Mungu"], time: ["2:00 p.m. – 3:00 p.m.", "Saa 14:00 – 15:00"], items: [] },
      { start: "15:00", end: "16:00", title: ["Burial service as we lay Daktari to rest", "Ibada ya maziko tunapompumzisha Daktari"], time: ["3:00 p.m. – 4:00 p.m.", "Saa 15:00 – 16:00"], items: [] },
    ],
  },
];

export function programmeDay(id: string | undefined): ProgrammeDay | undefined {
  return PROGRAMME.find((d) => d.id === id);
}

/** A clock time on a day, as an instant (Nairobi is UTC+3 all year). */
export function at(date: string, clock: string): Date {
  const [h, m] = clock.split(":").map(Number);
  return new Date(Date.parse(`${date}T00:00:00+03:00`) + (h * 60 + m) * 60_000);
}

/** Today's date in Nairobi, YYYY-MM-DD. */
export function nairobiDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The day to open on: Saturday once Saturday has come, Friday until then. */
export function defaultDay(now: Date): DayId {
  return nairobiDate(now) >= PROGRAMME[1].date ? "saturday" : "friday";
}

export type DayStatus =
  | { kind: "upcoming"; startsAt: Date; tentative: boolean }
  | { kind: "now"; part: number; endsAt: Date; progress: number; next: number | null }
  | { kind: "between"; next: number; startsAt: Date }
  | { kind: "ended" };

/** Where the day stands at `now`: not begun, a part under way, between parts, or over. */
export function dayStatus(day: ProgrammeDay, now: Date): DayStatus {
  const t = now.getTime();
  const spans = day.parts.map((p) => [at(day.date, p.start).getTime(), at(day.date, p.end).getTime()] as const);
  if (t < spans[0][0]) return { kind: "upcoming", startsAt: new Date(spans[0][0]), tentative: Boolean(day.parts[0].tentative) };
  const i = spans.findIndex(([s, e]) => t >= s && t < e);
  if (i >= 0) {
    const [s, e] = spans[i];
    return { kind: "now", part: i, endsAt: new Date(e), progress: (t - s) / (e - s), next: i + 1 < spans.length ? i + 1 : null };
  }
  const next = spans.findIndex(([s]) => s > t);
  return next >= 0 ? { kind: "between", next, startsAt: new Date(spans[next][0]) } : { kind: "ended" };
}

/** "in 1 day and 14 hours", "in 3 hours and 20 minutes", "in 12 minutes". */
export function untilText(from: Date, to: Date, lang: "en" | "sw"): string {
  const minutes = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const sw = lang === "sw";
  // Kiswahili hours as "masaa 3", since "saa 3" would read as three o'clock.
  const unit = (n: number, en: [string, string], swahili: [string, string]) =>
    sw ? (n === 1 ? swahili[0] : `${swahili[1]} ${n}`) : `${n} ${n === 1 ? en[0] : en[1]}`;
  const days = (n: number) => unit(n, ["day", "days"], ["siku moja", "siku"]);
  const hours = (n: number) => unit(n, ["hour", "hours"], ["saa moja", "masaa"]);
  const mins = (n: number) => unit(n, ["minute", "minutes"], ["dakika moja", "dakika"]);
  const parts = d > 0 ? [days(d), h > 0 ? hours(h) : ""] : h > 0 ? [hours(h), m > 0 ? mins(m) : ""] : [mins(m)];
  const joined = parts.filter(Boolean).join(sw ? " na " : " and ");
  return sw ? `baada ya ${joined}` : `in ${joined}`;
}

const escapeIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
// Lines longer than 75 octets continue on the next line after a space (RFC 5545).
const fold = (line: string) => line.match(/.{1,70}/gu)?.join("\r\n ") ?? line;
const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** A calendar file for the day: Friday as an all-day event (its end is open), Saturday 9:00–16:00 at the homestead. */
export function calendarFile(day: ProgrammeDay, memorialName: string, url: string, place: string | null): string {
  const lines = day.parts.flatMap((p) => (p.items.length ? [`${p.time[0]}: ${p.title[0]}`, ...p.items.map((i) => `· ${i.text[0]}${i.note ? ` (${i.note[0]})` : ""}`)] : [`${p.time[0]}: ${p.title[0]}`]));
  const description = [`${day.title[0]}, in loving memory of ${memorialName}.`, "", ...lines, "", url].join("\n");
  const next = new Date(Date.parse(`${day.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const when =
    day.id === "friday"
      ? [`DTSTART;VALUE=DATE:${day.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${next}`]
      : [`DTSTART:${icsStamp(at(day.date, day.parts[0].start))}`, `DTEND:${icsStamp(at(day.date, day.parts[day.parts.length - 1].end))}`];
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//mchango//funeral programme//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:programme-${day.id}-${day.date}@rip-daktari`,
    `DTSTAMP:${icsStamp(new Date())}`,
    ...when,
    `SUMMARY:${escapeIcs(`${memorialName}: ${day.title[0]}`)}`,
    ...(place && day.venue ? [`LOCATION:${escapeIcs(place)}`] : []),
    `DESCRIPTION:${escapeIcs(description)}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n");
}

/** The WhatsApp-ready message for sharing a day's programme. */
export function programmeShareText(day: ProgrammeDay, memorialName: string | null, url: string, lang: "en" | "sw"): string {
  const sw = lang === "sw";
  const k = sw ? 1 : 0;
  return [
    `*${sw ? "Ratiba ya mazishi" : "Funeral programme"}: ${day.weekday[k]}, ${day.dateLong[k]}*`,
    memorialName ? (sw ? `Kwa kumbukumbu ya ${memorialName}` : `In loving memory of ${memorialName}`) : "",
    day.title[k],
    day.venue ? day.venue[k] : "",
    "",
    ...day.parts.map((p) => `${p.time[k]}: ${p.title[k]}`),
    "",
    url,
  ]
    .filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n");
}
