// KES amounts as integer minor units (cents). Same rules as backend/src/money.rs.
// No floating-point arithmetic: digits are parsed as integers and combined.

export const MAX_AMOUNT_MINOR = 10_000_000_000;

export type ParseResult = { ok: true; minor: number } | { ok: false; error: string };

const MESSAGES = {
  empty: "Enter an amount.",
  malformed: "Use digits with an optional decimal point, e.g. 1,250.50.",
  decimals: "Use at most two decimal places.",
  notPositive: "The amount must be more than zero.",
  tooLarge: "The amount is larger than KES 100,000,000.00.",
};

const PREFIXES = ["KSHS", "Kshs", "KES", "Kes", "kes", "KSH", "Ksh", "ksh"];
const DIGITS = /^[0-9]+$/;

const fail = (error: string): ParseResult => ({ ok: false, error });

/** Parses a non-negative decimal such as `1,250.50`, `1250.5` or `KES 20`. */
export function parseDecimal(input: string): ParseResult {
  let s = input.trim();
  for (const prefix of PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length).replace(/^\.+/, "").trimStart();
      break;
    }
  }
  if (s === "") return fail(MESSAGES.empty);

  const dot = s.indexOf(".");
  const whole = dot === -1 ? s : s.slice(0, dot);
  const fraction = dot === -1 ? null : s.slice(dot + 1);
  if (whole === "") return fail(MESSAGES.malformed);

  let digits: string;
  if (whole.includes(",")) {
    const [first, ...rest] = whole.split(",");
    if (!first || first.length > 3 || !DIGITS.test(first)) return fail(MESSAGES.malformed);
    if (rest.some((group) => group.length !== 3 || !DIGITS.test(group))) return fail(MESSAGES.malformed);
    digits = first + rest.join("");
  } else {
    if (!DIGITS.test(whole)) return fail(MESSAGES.malformed);
    digits = whole;
  }

  digits = digits.replace(/^0+/, "");
  if (digits.length > 12) return fail(MESSAGES.tooLarge);
  const shillings = digits === "" ? 0 : Number.parseInt(digits, 10);

  let cents = 0;
  if (fraction !== null) {
    if (fraction === "" || !DIGITS.test(fraction)) return fail(MESSAGES.malformed);
    if (fraction.length > 2) return fail(MESSAGES.decimals);
    cents = Number.parseInt(fraction, 10) * (fraction.length === 1 ? 10 : 1);
  }
  return { ok: true, minor: shillings * 100 + cents };
}

/** Parses user input into a valid amount (more than zero, within the limit). */
export function parseKes(input: string): ParseResult {
  const result = parseDecimal(input);
  if (!result.ok) return result;
  if (result.minor <= 0) return fail(MESSAGES.notPositive);
  if (result.minor > MAX_AMOUNT_MINOR) return fail(MESSAGES.tooLarge);
  return result;
}

function group(whole: number): string {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** `KES 1,250.50`; negative values as `-KES 23.50`. */
export function formatKes(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}KES ${group(whole)}.${String(cents).padStart(2, "0")}`;
}

/** `KES 2,000` for whole amounts, `KES 2,000.50` otherwise (for messages). */
export function formatKesShort(minor: number): string {
  return minor % 100 === 0 ? formatKes(minor).slice(0, -3) : formatKes(minor);
}

/** A value for an editable amount field, e.g. `1250.50` or `1250`. */
export function toInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  return cents === 0 ? String(whole) : `${whole}.${String(cents).padStart(2, "0")}`;
}
