// All times are shown in Africa/Nairobi. Nairobi has been UTC+03:00 with no
// daylight saving since 1960, so a fixed offset is exact for form inputs.

const TZ = "Africa/Nairobi";
const OFFSET_MS = 3 * 60 * 60 * 1000;

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const longDateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function toDate(value: string): Date {
  // A bare calendar date is a Nairobi date; anchor it at Nairobi midday.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+03:00`) : new Date(value);
}

/** e.g. `2 Jun 2024, 10:15 am` (Nairobi). */
export function formatNairobi(value: string | null | undefined): string {
  if (!value) return "—";
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormat.format(date);
}

/** e.g. `2 Jun 2024` (Nairobi). Accepts an instant or a `YYYY-MM-DD` date. */
export function formatNairobiDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

export function formatNairobiLongDate(value: string | Date): string {
  return longDateFormat.format(typeof value === "string" ? toDate(value) : value);
}

/** A UTC instant as the value of `<input type="datetime-local">` in Nairobi time. */
export function toNairobiInputValue(utc: string | null | undefined): string {
  if (!utc) return "";
  const time = new Date(utc).getTime();
  if (Number.isNaN(time)) return "";
  return new Date(time + OFFSET_MS).toISOString().slice(0, 16);
}

/** `<input type="datetime-local">` value (Nairobi) as RFC 3339 with offset. */
export function fromNairobiInput(value: string): string {
  return value.length === 16 ? `${value}:00+03:00` : `${value}+03:00`;
}

export function nowNairobiInput(): string {
  return toNairobiInputValue(new Date().toISOString());
}

/** Today's Nairobi date as `YYYY-MM-DD`. */
export function todayNairobi(): string {
  return nowNairobiInput().slice(0, 10);
}

/** The Nairobi date `days` before today, as `YYYY-MM-DD`. */
export function daysAgoNairobi(days: number): string {
  return new Date(Date.now() + OFFSET_MS - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const shortFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const shortTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** e.g. `5 Nov` (Nairobi). */
export function formatShortDate(value: string): string {
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? value : shortFormat.format(date);
}

/** e.g. `5 Nov, 2:10 pm` (Nairobi). */
export function formatShortDateTime(value: string): string {
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? value : shortTimeFormat.format(date).replace(" am", " am").replace(" pm", " pm");
}

const timeOnlyFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const dayHeadingFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

/** e.g. `2:36 pm` (Nairobi). */
export function formatNairobiTime(value: string): string {
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? value : timeOnlyFormat.format(date);
}

/** e.g. `Monday 2 November` for a Nairobi `YYYY-MM-DD` date. */
export function formatDayHeading(value: string): string {
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? value : dayHeadingFormat.format(date).replace(",", "");
}
