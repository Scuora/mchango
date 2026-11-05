// The "At a glance" charts of the statement PDF, drawn as vector shapes with
// jsPDF. They use the public page's colours: gold is money received (or held),
// hatched gold is pledged but not yet in, the pale track is what is still
// needed, plum is money spent and green is money handed over to another account.

import { GState, type jsPDF } from "jspdf";
import cormorantMedium from "@/assets/pdf-fonts/CormorantGaramond-Medium.ttf?url";
import cormorantMediumItalic from "@/assets/pdf-fonts/CormorantGaramond-MediumItalic.ttf?url";
import cormorantSemiBold from "@/assets/pdf-fonts/CormorantGaramond-SemiBold.ttf?url";
import sansRegular from "@/assets/pdf-fonts/SourceSans3-Regular.ttf?url";
import sansSemiBold from "@/assets/pdf-fonts/SourceSans3-SemiBold.ttf?url";
import { formatKesShort } from "@/lib/money";
import { formatShortDate, formatShortDateTime, toNairobiInputValue } from "@/lib/time";
import type { StatementReport } from "@/lib/types";

type RGB = [number, number, number];
const RECEIVED: RGB = [184, 134, 42];
const SPENT: RGB = [111, 76, 148];
const MOVED: RGB = [26, 143, 102];
const INK: RGB = [31, 29, 27];
const MUTED: RGB = [111, 104, 95];
const GRID: RGB = [231, 226, 220];
const WHITE: RGB = [255, 255, 255];
const PLUM_TEXT: RGB = [75, 58, 90];
const GOLD: RGB = [201, 162, 77];

/** The 2px gap between touching marks, in mm. */
const GAP = 0.55;

// ---------------------------------------------------------------------------
// Fonts: the site's own, Source Sans 3 and Cormorant Garamond (src/assets/pdf-fonts,
// SIL Open Font License), embedded in the PDF. Without them the PDF falls back to
// the standard Helvetica and Times.

const FONT_FILES: Record<string, Record<string, string>> = {
  SourceSans: { normal: sansRegular, bold: sansSemiBold },
  Cormorant: { normal: cormorantMedium, bold: cormorantSemiBold, italic: cormorantMediumItalic },
};

/** Font files by URL, base64-encoded for jsPDF. */
export type PdfFonts = Record<string, string>;

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** Fetches the fonts (the browser caches them); null if any is missing. */
export async function loadPdfFonts(): Promise<PdfFonts | null> {
  try {
    const files = Object.values(FONT_FILES).flatMap((styles) => Object.values(styles));
    const loaded = await Promise.all(
      files.map(async (file) => {
        const response = await fetch(file);
        const data = response.ok ? await response.arrayBuffer() : new ArrayBuffer(0);
        // A TrueType file starts 00 01 00 00; anything else (a page, an error) is not a font.
        if (new DataView(data).byteLength < 4 || new DataView(data).getUint32(0) !== 0x00010000) throw new Error(file);
        return [file, base64(data)] as const;
      }),
    );
    return Object.fromEntries(loaded);
  } catch {
    return null;
  }
}

/** The faces in use: set by `useFonts` for each PDF. */
export const face = { sans: "helvetica", serif: "times", unicode: false };

export function useFonts(doc: jsPDF, fonts: PdfFonts | null) {
  if (!fonts) {
    Object.assign(face, { sans: "helvetica", serif: "times", unicode: false });
    return;
  }
  for (const [family, styles] of Object.entries(FONT_FILES)) {
    for (const [style, file] of Object.entries(styles)) {
      const name = `${family}-${style}.ttf`;
      doc.addFileToVFS(name, fonts[file]);
      doc.addFont(name, family, style);
    }
  }
  Object.assign(face, { sans: "SourceSans", serif: "Cormorant", unicode: true });
}

/**
 * Text the fonts can draw. The embedded fonts have proper dashes, quotes and
 * ellipses; the standard ones cover Latin-1 only. Neither has emoji.
 */
export function plain(text: string): string {
  if (face.unicode) return text.replace(/[^\x20-\x7e\xa0-\xff\n\u2010-\u2027]/g, "");
  return text
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "");
}

/** Plain text with the gaps left by dropped characters (such as emoji) closed up. */
export function tidy(text: string): string {
  return plain(text).replace(/\s+/g, " ").replace(/\(\s/g, "(").replace(/\s\)/g, ")").trim();
}

const kes = (minor: number) => formatKesShort(minor);

/** Shortens text to fit a width, ending it with "...". */
function fit(doc: jsPDF, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text;
  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}...`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

function font(doc: jsPDF, size: number, style: "normal" | "bold" = "normal", color: RGB = INK) {
  doc.setFont(face.sans, style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function translucent(doc: jsPDF, opacity: number, draw: () => void) {
  doc.saveGraphicsState();
  doc.setGState(new GState({ opacity }));
  draw();
  doc.restoreGraphicsState();
}

/** A bar with a rounded data end and a square base, growing right from x. */
function hbar(doc: jsPDF, x: number, y: number, length: number, thickness: number, color: RGB) {
  if (length <= 0) return;
  const r = Math.min(1, length / 2, thickness / 2);
  doc.setFillColor(...color);
  doc.roundedRect(x, y, length, thickness, r, r, "F");
  if (length > r) doc.rect(x, y, Math.min(r, length), thickness, "F");
}

/** A section title with a gold rule, and an optional line under it. Returns where the content starts. */
export function sectionTitle(doc: jsPDF, x: number, y: number, w: number, title: string, note?: string): number {
  doc.setFont(face.serif, "bold");
  doc.setFontSize(17);
  doc.setTextColor(...PLUM_TEXT);
  doc.text(plain(title), x, y + 5.4);
  const end = x + doc.getTextWidth(plain(title)) + 4;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.line(end, y + 3.6, x + w, y + 3.6);
  if (!note) return y + 10;
  font(doc, 8.5, "normal", MUTED);
  doc.text(plain(note), x, y + 11.2);
  return y + 15;
}

// ---------------------------------------------------------------------------
// Axes

/** A round step for about `count` ticks up to `max`. */
function niceStep(max: number, count = 4): number {
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const f = rough / power;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * power;
}

/** Tick labels in shillings: in full under 10,000, compact on an axis that reaches it. */
function tickLabel(minor: number, compact: boolean): string {
  const v = minor / 100;
  if (!compact) return v.toLocaleString("en-GB");
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${+(v / 1_000).toFixed(1)}K`;
  return String(v);
}

interface Plot {
  left: number;
  right: number;
  top: number;
  bottom: number;
  max: number;
  y: (v: number) => number;
}

/** Hairline gridlines and value ticks; returns the plot's geometry. */
function valueAxis(doc: jsPDF, x: number, y: number, w: number, h: number, maxValue: number): Plot {
  const step = niceStep(Math.max(maxValue, 100));
  const max = Math.ceil(Math.max(maxValue, 1) / step) * step;
  const compact = max >= 10_000_00;
  font(doc, 6.8, "normal", MUTED);
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(v);
  const labelWidth = Math.max(...ticks.map((v) => doc.getTextWidth(tickLabel(v, compact))));
  const plot = { left: x + labelWidth + 2.5, right: x + w, top: y + 5, bottom: y + h - 6, max };
  const scale = (v: number) => plot.bottom - (v / max) * (plot.bottom - plot.top);
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.15);
  for (const v of ticks) {
    const ty = scale(v);
    doc.line(plot.left, ty, plot.right, ty);
    doc.text(tickLabel(v, compact), plot.left - 2, ty + 1, { align: "right" });
  }
  return { ...plot, y: scale };
}

/** Labels along the bottom; the first and last keep inside the plot. */
function timeLabels(doc: jsPDF, plot: Plot, labels: { x: number; text: string }[]) {
  font(doc, 6.8, "normal", MUTED);
  labels.forEach((l, i) => {
    const align = labels.length > 1 && i === 0 ? "left" : labels.length > 1 && i === labels.length - 1 ? "right" : "center";
    doc.text(plain(l.text), l.x, plot.bottom + 4.5, { align });
  });
}

// ---------------------------------------------------------------------------
// The charts

const nairobiDay = (at: string) => toNairobiInputValue(at).slice(0, 10);
const dayTime = (day: string) => new Date(`${day}T12:00:00+03:00`).getTime();

/** Every Nairobi date from the first to the last, inclusive. */
function daysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let t = dayTime(first); t <= dayTime(last); t += 86_400_000) out.push(new Date(t + 3 * 3_600_000).toISOString().slice(0, 10));
  return out;
}

/** Money received, adding up over the period: one line with its latest figure at the end. */
function cumulative(doc: jsPDF, received: StatementReport["entries"], x: number, y: number, w: number, h: number): number {
  let total = 0;
  const points = received.map((e) => ({ t: new Date(e.at).getTime(), v: (total += e.amount_minor), at: e.at }));
  const plot = valueAxis(doc, x, y, w - 4, h, total);
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const span = Math.max(t1 - t0, 1);
  const px = (t: number) => plot.left + ((t - t0) / span) * (plot.right - plot.left);
  const xy = points.map((p) => [px(p.t), plot.y(p.v)] as [number, number]);

  // A wash under the line, then the line, then the end dot with a surface ring.
  translucent(doc, 0.12, () => {
    doc.setFillColor(...RECEIVED);
    doc.moveTo(xy[0][0], plot.bottom);
    for (const [px2, py] of xy) doc.lineTo(px2, py);
    doc.lineTo(xy[xy.length - 1][0], plot.bottom);
    doc.close();
    doc.fill();
  });
  doc.setDrawColor(...RECEIVED);
  doc.setLineWidth(0.55);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  doc.moveTo(...xy[0]);
  for (const p of xy.slice(1)) doc.lineTo(...p);
  doc.stroke();
  const [ex, ey] = xy[xy.length - 1];
  doc.setFillColor(...WHITE);
  doc.circle(ex, ey, 1.7, "F");
  doc.setFillColor(...RECEIVED);
  doc.circle(ex, ey, 1.15, "F");
  font(doc, 8, "bold", INK);
  doc.text(kes(total), ex - 2.5, Math.max(plot.top + 1, ey - 2.6), { align: "right" });

  // Dates (and times, over a short span) along the bottom.
  const short = t1 - t0 < 3 * 86_400_000;
  const count = Math.min(5, points.length);
  const labels = Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? t0 : t0 + (span * i) / (count - 1);
    const iso = new Date(t).toISOString();
    return { x: px(t), text: short ? formatShortDateTime(iso) : formatShortDate(iso) };
  });
  timeLabels(doc, plot, labels);
  return y + h;
}

/** Money received each day: one column a day, the best day labelled. */
function daily(doc: jsPDF, received: StatementReport["entries"], x: number, y: number, w: number, h: number): number {
  const byDay = new Map<string, number>();
  for (const e of received) byDay.set(nairobiDay(e.at), (byDay.get(nairobiDay(e.at)) ?? 0) + e.amount_minor);
  const days = daysBetween(nairobiDay(received[0].at), nairobiDay(received[received.length - 1].at));
  const values = days.map((d) => byDay.get(d) ?? 0);
  const best = Math.max(...values);
  const plot = valueAxis(doc, x, y, w, h, best);
  const slot = (plot.right - plot.left) / days.length;
  const width = Math.min(slot * 0.62, 6);
  doc.setFillColor(...RECEIVED);
  values.forEach((v, i) => {
    if (v <= 0) return;
    const top = plot.y(v);
    const height = plot.bottom - top;
    const bx = plot.left + slot * i + (slot - width) / 2;
    const radius = Math.min(1, width / 2, height);
    doc.roundedRect(bx, top, width, height, radius, radius, "F");
    if (height > radius) doc.rect(bx, top + height - radius, width, radius, "F");
  });
  const peak = values.indexOf(best);
  font(doc, 7.5, "bold", INK);
  doc.text(kes(best), plot.left + slot * peak + slot / 2, plot.y(best) - 1.5, { align: "center" });
  const every = Math.max(1, Math.ceil(days.length / 6));
  const labels = days.flatMap((d, i) => (i % every === 0 || i === days.length - 1 ? [{ x: plot.left + slot * i + slot / 2, text: formatShortDate(d) }] : []));
  // Keep the last label clear of the one before it.
  if (labels.length > 2 && labels[labels.length - 1].x - labels[labels.length - 2].x < slot * every * 0.75) labels.splice(labels.length - 2, 1);
  timeLabels(doc, plot, labels);
  return y + h;
}

interface Part {
  label: string;
  value: number;
  color: RGB;
}

/** One whole split into parts: a thin segmented bar above a list of the parts with their figures. */
function split(doc: jsPDF, parts: Part[], x: number, y: number, w: number): number {
  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((s, p) => s + p.value, 0);
  const h = 2.4;
  let at = x;
  const room = w - GAP * (shown.length - 1);
  shown.forEach((p, i) => {
    const width = (p.value / total) * room;
    doc.setFillColor(...p.color);
    const first = i === 0;
    const last = i === shown.length - 1;
    doc.roundedRect(at, y, width, h, first || last ? Math.min(h / 2, width / 2) : 0, first || last ? h / 2 : 0, "F");
    // Only the bar's two ends are rounded.
    if (!first) doc.rect(at, y, Math.min(width, h / 2), h, "F");
    if (!last) doc.rect(at + Math.max(0, width - h / 2), y, Math.min(width, h / 2), h, "F");
    at += width + GAP;
  });
  let ry = y + h + 6;
  for (const p of shown) {
    doc.setFillColor(...p.color);
    doc.roundedRect(x, ry - 2.6, 3.2, 3.2, 0.7, 0.7, "F");
    font(doc, 8.5, "normal", INK);
    doc.text(plain(p.label), x + 5.5, ry);
    font(doc, 8.5, "normal", MUTED);
    doc.text(`${Math.round((p.value / total) * 100)}%`, x + w - 34, ry, { align: "right" });
    font(doc, 8.5, "bold", INK);
    doc.text(kes(p.value), x + w, ry, { align: "right" });
    ry += 6;
  }
  return ry - 2;
}

/** Ranked horizontal bars, largest first, with each value at the bar's tip. */
function ranked(doc: jsPDF, rows: { label: string; sub?: string; value: number }[], color: RGB, x: number, y: number, w: number): number {
  const labelWidth = 68;
  const valueRoom = 26;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const barLeft = x + labelWidth + 3;
  const barRoom = w - labelWidth - 3 - valueRoom;
  let ry = y;
  for (const row of rows) {
    const height = row.sub ? 9 : 7;
    font(doc, 8.5, "normal", INK);
    doc.text(fit(doc, plain(row.label), labelWidth), x, ry + 3.6);
    if (row.sub) {
      font(doc, 7, "normal", MUTED);
      doc.text(fit(doc, tidy(row.sub), labelWidth), x, ry + 7);
    }
    const length = row.value > 0 ? Math.max(0.8, (row.value / max) * barRoom) : 0;
    hbar(doc, barLeft, ry + 1, length, 4, color);
    font(doc, 8, "bold", INK);
    doc.text(row.value < 0 ? `-${kes(-row.value)}` : kes(row.value), barLeft + length + 2, ry + 4.1);
    ry += height;
  }
  return ry;
}

/** What each challenge has brought in (no targets: statements report what came in, not what is left). */
function challengeMeters(doc: jsPDF, list: StatementReport["challenges"], x: number, y: number, w: number): number {
  let ry = y;
  for (const c of list) {
    font(doc, 8, "normal", MUTED);
    const figure = `${kes(c.raised_minor)} received`;
    const figureWidth = doc.getTextWidth(figure);
    doc.text(figure, x + w, ry + 3.5, { align: "right" });
    font(doc, 8.5, "bold", INK);
    doc.text(fit(doc, tidy(c.name), w - figureWidth - 4), x, ry + 3.5);
    ry += 7;
  }
  return ry;
}

// ---------------------------------------------------------------------------
// The page

/** Where the next block goes, with a new page when the current one is full. */
export interface Flow {
  y: number;
  /** The lowest the content may reach on a page. */
  bottom: number;
  /** Starts a block of this height, on a new page if it does not fit. */
  need: (height: number) => number;
}

/**
 * The statement's charts, in order: progress to the goal (or the challenge's
 * target), money received over time and by day, where the money went, the
 * largest expenses, where the money is, and each challenge's progress. A chart
 * appears only when there is enough to show.
 */
export function drawCharts(doc: jsPDF, r: StatementReport, kind: "full" | "received" | "spent", flow: Flow, x: number, w: number) {
  const t = r.totals;
  const received = r.entries.filter((e) => e.kind === "contribution");
  const expenses = r.entries.filter((e) => e.kind === "expense");
  const challenge = r.account?.challenge_name;

  // Statements report what has come in, been spent and remains: no goal, target or pending figures.

  // A chart can give up a little height to stay on the page it starts on.
  const fitted = (full: number, least: number, chrome: number) => Math.max(least, Math.min(full, flow.bottom - flow.y - chrome));

  if (kind !== "spent" && received.length >= 2) {
    const height = fitted(56, 40, 25);
    const y = flow.need(height + 25);
    const top = sectionTitle(doc, x, y, w, "Money received, adding up", r.period_from ? "Within the period of this statement." : "From the first contribution to the end of the statement.");
    flow.y = cumulative(doc, received, x, top + 2, w, height) + 8;
  }

  const days = new Set(received.map((e) => nairobiDay(e.at)));
  if (kind !== "spent" && days.size >= 3) {
    const height = fitted(46, 34, 20);
    const y = flow.need(height + 20);
    const top = sectionTitle(doc, x, y, w, "Received each day");
    flow.y = daily(doc, received, x, top + 2, w, height) + 8;
  }

  // The whole account only: on the expenses statement, "spent" means expenses and charges alone.
  if (kind === "full") {
    const spent = t.expenses_minor + t.charges_minor + t.refunds_paid_minor + t.reversals_out_minor;
    const parts: Part[] = [
      { label: challenge ? "Handed over to the fundraiser's other accounts" : "Moved to the fundraiser's other accounts", value: t.transfers_out_minor, color: MOVED },
      { label: t.charges_minor || t.refunds_paid_minor || t.reversals_out_minor ? "Spent: expenses, charges and refunds" : "Spent on expenses", value: spent, color: SPENT },
      { label: r.account ? `Still in ${r.account.name}` : "Funds remaining", value: Math.max(0, r.closing_minor), color: RECEIVED },
    ];
    const available = r.brought_forward_minor + t.received_minor + t.refunds_received_minor + t.reversals_in_minor + t.transfers_in_minor;
    if (r.closing_minor >= 0 && parts.filter((p) => p.value > 0).length >= 2) {
      const y = flow.need(48);
      const top = sectionTitle(doc, x, y, w, "Where the money went", `Of ${kes(available)}: brought forward and money in during the period.`);
      flow.y = split(doc, parts, x, top + 1, w) + 8;
    }
  }

  if (kind !== "received" && expenses.length >= 2) {
    const sorted = [...expenses].sort((a, b) => b.amount_minor - a.amount_minor);
    const top6 = sorted.slice(0, sorted.length > 7 ? 6 : 7);
    const rest = sorted.slice(top6.length);
    const rows = top6.map((e) => ({ label: e.label, value: e.amount_minor }));
    if (rest.length) rows.push({ label: `Other expenses (${rest.length})`, value: rest.reduce((s, e) => s + e.amount_minor, 0) });
    const y = flow.need(18 + rows.length * 7);
    const top = sectionTitle(doc, x, y, w, "Largest expenses", "In this period, largest first.");
    flow.y = ranked(doc, rows, SPENT, x, top + 1, w) + 8;
  }

  if (kind === "full" && r.balances.length >= 2) {
    const rows = [...r.balances]
      .sort((a, b) => b.amount_minor - a.amount_minor)
      .map((b) => ({ label: b.name, sub: b.challenge_name ? `Held for ${tidy(b.challenge_name)}` : undefined, value: b.amount_minor }));
    const y = flow.need(18 + rows.reduce((s, row) => s + (row.sub ? 9 : 7), 0));
    const held = r.balances.some((b) => b.challenge_name);
    const note = `At the end of the period: ${kes(rows.reduce((s, row) => s + row.value, 0))} in all.${held ? " Money held for a challenge is owed to the main fund until handed over." : ""}`;
    const top = sectionTitle(doc, x, y, w, "Where the money is", note);
    flow.y = ranked(doc, rows, RECEIVED, x, top + 1, w) + 8;
  }

  if (kind !== "spent" && r.challenges.length > 0) {
    const y = flow.need(18 + r.challenges.length * 7);
    const top = sectionTitle(doc, x, y, w, "Challenges", "What each challenge has brought in; it is part of the money received above.");
    flow.y = challengeMeters(doc, r.challenges, x, top + 1, w) + 6;
  }
}
