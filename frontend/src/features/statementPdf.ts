// Builds a statement of account as a PDF in the browser. The server supplies
// every figure; this only lays them out. Loaded only on the Reports page.
//
// Layout, in the manner of an order of service: a plum arch with a fine gold
// frame, his candle-lit portrait and name centred, a details strip, the title
// with a gold ornament, a summary panel with a gold "Funds remaining" bar, the
// tables, and a footer of kind words.

import { GState, jsPDF } from "jspdf";
import { autoTable, type CellHookData, type RowInput } from "jspdf-autotable";
import { formatKes } from "@/lib/money";
import { formatNairobiDate, formatNairobiTime } from "@/lib/time";
import type { StatementReport } from "@/lib/types";
import { drawCharts, face, plain, sectionTitle, tidy, useFonts, type Flow, type PdfFonts } from "./statementCharts";
import { accountText } from "./statementText";

export { loadPdfFonts } from "./statementCharts";

export type ReportKind = "full" | "received" | "spent";

export interface StatementOptions {
  kind: ReportKind;
  /** "public": names as on the public page. "mpesa": names as M-Pesa wrote them (committee only). */
  names: "public" | "mpesa";
  includeCodes: boolean;
  /** The memorial photo as a JPEG data URL, if there is one. */
  photo: string | null;
  /** The site's fonts (see loadPdfFonts); null falls back to Helvetica and Times. */
  fonts: PdfFonts | null;
}

type RGB = [number, number, number];
const PLUM: RGB = [36, 26, 45];
const PLUM_TEXT: RGB = [75, 58, 90];
const GOLD: RGB = [201, 162, 77];
const GOLD_LIGHT: RGB = [222, 189, 122];
const GOLD_DARK: RGB = [138, 104, 38];
const IVORY: RGB = [246, 239, 228];
const INK: RGB = [31, 29, 27];
const MUTED: RGB = [111, 104, 95];
const ROW_ALT: RGB = [250, 248, 251];
const PANEL: RGB = [252, 250, 247];
const GOLD_TINT: RGB = [248, 240, 222];
const SAGE: RGB = [62, 110, 82];
const LINE: RGB = [231, 226, 220];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const TOTAL_PAGES = "{total_pages}";
/** Below the slim header on continuation pages, and above the footer. */
const CONTENT_TOP = 26;
const CONTENT_BOTTOM = PAGE_H - 32;

const TITLES: Record<ReportKind, string> = {
  full: "Full account (money in and out)",
  received: "Contributions received",
  spent: "Expenses (money spent)",
};

const money = (minor: number) => formatKes(minor).replace("KES ", "");

function periodText(r: StatementReport): string {
  return r.period_from ? `${formatNairobiDate(r.period_from)} - ${formatNairobiDate(r.period_to)}` : `Everything to ${formatNairobiDate(r.period_to)}`;
}

function contactLines(r: StatementReport): { give: string[]; contact: string[] } {
  const f = r.fundraiser;
  const give =
    f.giving_method === "paybill"
      ? [`Paybill ${f.giving_number}`, `Account ${f.giving_account}`]
      : f.giving_method === "till"
        ? [`Till number ${f.giving_number}`]
        : f.giving_method === "phone"
          ? [`Send money to ${f.giving_number}`]
          : [];
  const person = f.organisers.find((o) => o.phone) ?? f.organisers[0];
  const contact = person ? [person.name, person.phone || person.role].filter(Boolean) : [];
  return { give, contact };
}

/** A small gold diamond: the ornament used through the statement. */
function diamond(doc: jsPDF, x: number, y: number, size = 1.3) {
  doc.moveTo(x, y - size).lineTo(x + size, y).lineTo(x, y + size).lineTo(x - size, y).close().fill();
}

/** Centred text with letter spacing (jsPDF measures the spacing in mm). */
function spacedCentre(doc: jsPDF, text: string, y: number, spacing: number) {
  const width = doc.getTextWidth(text) + spacing * (text.length - 1);
  doc.text(text, PAGE_W / 2 - width / 2, y, { charSpace: spacing });
  doc.setCharSpace(0);
}

/** Right-aligned text with letter spacing. */
function spacedRight(doc: jsPDF, text: string, right: number, y: number, spacing: number) {
  const width = doc.getTextWidth(text) + spacing * (text.length - 1);
  doc.text(text, right - width, y, { charSpace: spacing });
  doc.setCharSpace(0);
}

function translucent(doc: jsPDF, opacity: number, draw: () => void) {
  doc.saveGraphicsState();
  doc.setGState(new GState({ opacity }));
  draw();
  doc.restoreGraphicsState();
}

/** The portrait in a gold ring; the clip keeps the photo round. */
function portrait(doc: jsPDF, photo: string, cx: number, cy: number, r: number, ring: number) {
  doc.saveGraphicsState();
  doc.circle(cx, cy, r, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(photo, "JPEG", cx - r, cy - r, r * 2, r * 2);
  doc.restoreGraphicsState();
  doc.setLineWidth(ring);
  doc.setDrawColor(...GOLD_LIGHT);
  doc.circle(cx, cy, r + ring / 2, "S");
}

const BAND_SIDE = 80;
const BAND_DIP = 92;

/**
 * The memorial band, in the manner of an order of service: a plum arch that
 * dips beneath the portrait, a fine gold frame, the candle-lit portrait and
 * his name, then a details strip and the title. Returns where the page continues.
 */
function header(doc: jsPDF, r: StatementReport, options: StatementOptions): number {
  const f = r.fundraiser;
  const cx = PAGE_W / 2;

  // The plum arch and the gold line that follows its edge.
  doc.setFillColor(...PLUM);
  doc
    .moveTo(0, 0)
    .lineTo(PAGE_W, 0)
    .lineTo(PAGE_W, BAND_SIDE)
    .curveTo(165, BAND_SIDE, 140, BAND_DIP, cx, BAND_DIP)
    .curveTo(70, BAND_DIP, 45, BAND_SIDE, 0, BAND_SIDE)
    .close()
    .fill();
  const edge = 2;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc
    .moveTo(0, BAND_SIDE + edge)
    .curveTo(45, BAND_SIDE + edge, 70, BAND_DIP + edge, cx, BAND_DIP + edge)
    .curveTo(140, BAND_DIP + edge, 165, BAND_SIDE + edge, PAGE_W, BAND_SIDE + edge)
    .stroke();
  doc.setFillColor(...GOLD);
  diamond(doc, cx, BAND_DIP + edge, 1.6);

  // A fine gold frame inside the band, with diamonds at its corners.
  translucent(doc, 0.7, () => {
    doc.setDrawColor(...GOLD_LIGHT);
    doc.setLineWidth(0.25);
    doc.moveTo(9, BAND_SIDE - 10).lineTo(9, 9).lineTo(PAGE_W - 9, 9).lineTo(PAGE_W - 9, BAND_SIDE - 10).stroke();
    doc.setFillColor(...GOLD_LIGHT);
    diamond(doc, 9, 9, 1.2);
    diamond(doc, PAGE_W - 9, 9, 1.2);
    diamond(doc, 9, BAND_SIDE - 10, 0.8);
    diamond(doc, PAGE_W - 9, BAND_SIDE - 10, 0.8);
  });

  // The portrait, centred, with a soft candle glow built from translucent gold.
  const cy = 35;
  const radius = 15.5;
  let y = 28;
  if (options.photo) {
    doc.setFillColor(...GOLD_LIGHT);
    for (let i = 7; i >= 0; i--) {
      translucent(doc, 0.045, () => doc.circle(cx, cy + 1, radius + 2.5 + i * 2.4, "F"));
    }
    translucent(doc, 0.55, () => {
      doc.setDrawColor(...GOLD_LIGHT);
      doc.setLineWidth(0.3);
      doc.circle(cx, cy, radius + 3, "S");
    });
    portrait(doc, options.photo, cx, cy, radius, 0.9);
    y = cy + radius + 8.5;
  }

  const name = f.memorial_name || f.name;
  if (f.memorial_name) {
    doc.setFont(face.sans, "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...GOLD_LIGHT);
    spacedCentre(doc, "IN LOVING MEMORY OF", y, 0.9);
    y += 8.5;
  }
  doc.setFont(face.serif, "bold");
  doc.setFontSize(26);
  doc.setTextColor(...IVORY);
  for (const line of doc.splitTextToSize(plain(name), 150) as string[]) {
    doc.text(line, cx, y, { align: "center", charSpace: 0 });
    y += 8;
  }
  y -= 2;
  if (f.memorial_dates) {
    doc.setFont(face.serif, "normal");
    doc.setFontSize(12.5);
    doc.text(plain(f.memorial_dates), cx, y, { align: "center" });
    y += 5.6;
  }
  if (f.memorial_tribute) {
    doc.setFont(face.serif, "italic");
    doc.setFontSize(12.5);
    doc.setTextColor(...GOLD_LIGHT);
    doc.text(plain(f.memorial_tribute), cx, y, { align: "center" });
  }

  // Details strip: gold-labelled columns divided by fine gold rules.
  const { give, contact } = contactLines(r);
  const blocks: [string, string[]][] = [];
  if (give.length) blocks.push(["CONTRIBUTE", give]);
  if (contact.length) blocks.push(["CONTACT", contact]);
  if (r.public_url) blocks.push(["ONLINE", [r.public_url.replace(/^https?:\/\//, "")]]);
  let top = BAND_DIP + 12;
  if (blocks.length) {
    const width = (PAGE_W - MARGIN * 2) / blocks.length;
    const tallest = Math.max(...blocks.map(([, lines]) => lines.length));
    blocks.forEach(([label, lines], i) => {
      const mid = MARGIN + width * i + width / 2;
      doc.setFont(face.sans, "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...GOLD_DARK);
      const labelWidth = doc.getTextWidth(label) + 0.6 * (label.length - 1);
      doc.text(label, mid - labelWidth / 2, top, { charSpace: 0.6 });
      doc.setCharSpace(0);
      doc.setFont(face.sans, "normal");
      doc.setFontSize(9.2);
      doc.setTextColor(...INK);
      lines.forEach((line, j) => doc.text(plain(line), mid, top + 4.8 + j * 4.2, { align: "center" }));
      if (i > 0) {
        doc.setDrawColor(...GOLD_LIGHT);
        doc.setLineWidth(0.25);
        doc.line(MARGIN + width * i, top - 3.5, MARGIN + width * i, top + 2 + tallest * 4.2);
      }
    });
    top += 6 + tallest * 4.2;
  }

  // Title, a gold rule with a diamond, and one centred line of details.
  const titleY = top + 11;
  doc.setFont(face.serif, "normal");
  doc.setFontSize(27);
  doc.setTextColor(...PLUM_TEXT);
  doc.text("Statement of Account", cx, titleY, { align: "center" });
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(cx - 36, titleY + 4.5, cx - 3.5, titleY + 4.5);
  doc.line(cx + 3.5, titleY + 4.5, cx + 36, titleY + 4.5);
  doc.setFillColor(...GOLD);
  diamond(doc, cx, titleY + 4.5, 1.2);
  doc.setFont(face.sans, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.setFontSize(9.5);
  doc.text(plain(`${TITLES[options.kind]}  \u00b7  ${periodText(r)}`), cx, titleY + 11.5, { align: "center" });
  const account = accountText(r);
  if (!account) return titleY + 19;
  // The account (a kitty) the statement covers, on its own line.
  doc.setFont(face.sans, "bold");
  doc.setTextColor(...PLUM_TEXT);
  const lines = doc.splitTextToSize(tidy(account), 170) as string[];
  lines.forEach((line, i) => doc.text(line, cx, titleY + 17 + i * 4.6, { align: "center" }));
  return titleY + 20 + lines.length * 4.6;
}


/** The band on continuation pages: a slim plum strip with a small portrait. */
function slimHeader(doc: jsPDF, r: StatementReport, photo: string | null) {
  doc.setFillColor(...PLUM);
  doc.rect(0, 0, PAGE_W, 15, "F");
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(0, 15.8, PAGE_W, 15.8);
  if (photo) portrait(doc, photo, MARGIN + 4.5, 7.5, 4.6, 0.5);
  doc.setFont(face.serif, "normal");
  doc.setFontSize(13.5);
  doc.setTextColor(...IVORY);
  doc.text(plain(r.fundraiser.memorial_name || r.fundraiser.name), PAGE_W / 2, 9.4, { align: "center" });
  doc.setFont(face.sans, "bold");
  doc.setFontSize(6.3);
  doc.setTextColor(...GOLD_LIGHT);
  spacedRight(doc, "STATEMENT OF ACCOUNT", PAGE_W - MARGIN, 9, 0.5);
}

function footer(doc: jsPDF, r: StatementReport, page: number) {
  const top = PAGE_H - 24;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, top, PAGE_W - MARGIN, top);
  doc.setFont(face.serif, "italic");
  doc.setFontSize(12.5);
  doc.setTextColor(...PLUM_TEXT);
  doc.text("Thank you for standing with the family.", MARGIN, top + 6);
  if (r.fundraiser.memorial_tribute) {
    doc.setFontSize(11);
    doc.setTextColor(...GOLD_DARK);
    doc.text(plain(r.fundraiser.memorial_tribute), MARGIN, top + 10.5);
  }
  doc.setFont(face.sans, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`Page ${page} of ${TOTAL_PAGES}`, PAGE_W - MARGIN, top + 6, { align: "right" });
  doc.setFontSize(6.6);
  doc.text(
    plain(
      "From the fundraiser records. Entries marked \"Matched\" were checked against M-Pesa statements. This is not a Safaricom document.",
    ),
    MARGIN,
    top + 15.5,
    { maxWidth: PAGE_W - MARGIN * 2 },
  );
}

/** The figures that matter for this statement, in one framed row, then short notes. */
function summary(doc: jsPDF, r: StatementReport, options: StatementOptions, top: number): number {
  const t = r.totals;
  const received = r.entries.filter((e) => e.kind === "contribution");
  const expenses = r.entries.filter((e) => e.kind === "expense");
  const moneyIn = t.received_minor + t.refunds_received_minor + t.reversals_in_minor + t.transfers_in_minor;
  const moneyOut = t.expenses_minor + t.charges_minor + t.refunds_paid_minor + t.reversals_out_minor + t.transfers_out_minor;
  const figures: { label: string; value: string; strong?: boolean }[] =
    options.kind === "received"
      ? [
          { label: "Total received", value: `KES ${money(t.received_minor)}`, strong: true },
          { label: "Contributions", value: String(t.received_count) },
          { label: "Checked against M-Pesa", value: `${received.filter((e) => e.matched).length} of ${received.length}` },
        ]
      : options.kind === "spent"
        ? [
            { label: "Total spent", value: `KES ${money(t.expenses_minor + t.charges_minor)}`, strong: true },
            { label: "Funeral expenses", value: money(t.expenses_minor) },
            ...(t.charges_minor ? [{ label: "M-Pesa charges", value: money(t.charges_minor) }] : []),
            { label: "With receipts", value: `${expenses.filter((e) => e.has_receipt).length} of ${expenses.length}` },
          ]
        : [
            { label: "Brought forward", value: money(r.brought_forward_minor) },
            { label: "Money in", value: money(moneyIn) },
            { label: "Money out", value: money(moneyOut) },
            { label: "Funds remaining", value: `KES ${money(r.closing_minor)}`, strong: true },
          ];

  const width = PAGE_W - MARGIN * 2;
  const height = 21;
  const cell = width / figures.length;
  doc.setFillColor(...PANEL);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, top, width, height, "FD");
  figures.forEach((f, i) => {
    const x = MARGIN + i * cell;
    if (f.strong) {
      doc.setFillColor(...GOLD_TINT);
      doc.rect(x, top, cell, height, "F");
      doc.setFillColor(...GOLD);
      doc.rect(x, top + height - 1.1, cell, 1.1, "F");
    }
    if (i > 0) {
      doc.setDrawColor(...LINE);
      doc.line(x, top + 4, x, top + height - 4);
    }
    doc.setFont(face.sans, "bold");
    doc.setFontSize(6.4);
    doc.setTextColor(...GOLD_DARK);
    doc.text(f.label.toUpperCase(), x + 5, top + 7.5, { charSpace: 0.35 });
    doc.setCharSpace(0);
    doc.setFontSize(f.strong ? 13.5 : 12.5);
    doc.setTextColor(...(f.strong ? PLUM : INK));
    doc.text(plain(f.value), x + 5, top + 15.2);
  });
  doc.setDrawColor(...LINE);
  doc.rect(MARGIN, top, width, height, "S");

  const notes: string[] = [];
  if (options.kind !== "spent" || r.reconciled_through) notes.push(
    r.reconciled_through
      ? `Every entry up to ${formatNairobiDate(r.reconciled_through)} was checked against M-Pesa statements.`
      : r.entries.some((e) => e.matched)
        ? "Entries marked \"Matched\" have been checked against an M-Pesa statement; the rest are still to be checked."
        : "Not yet checked against an M-Pesa statement.",
  );
  const moved = movedText(r);
  if (options.kind === "full" && moved) notes.push(moved);
  if (r.fundraiser.giving_name) notes.push(`When giving, check that M-Pesa shows: ${r.fundraiser.giving_name}.`);
  doc.setFont(face.sans, "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(...MUTED);
  let y = top + height + 5.5;
  for (const note of notes) {
    doc.setFillColor(...GOLD);
    diamond(doc, MARGIN + 1.2, y - 1.1, 0.9);
    doc.text(plain(note), MARGIN + 4, y);
    y += 4.2;
  }
  return y + 3;
}

/** Money moved between the fundraiser's own accounts, on a one-account statement. */
function movedText(r: StatementReport): string | null {
  const t = r.totals;
  const parts = [
    t.transfers_in_minor ? `KES ${money(t.transfers_in_minor)} moved in from other accounts` : null,
    t.transfers_out_minor
      ? `KES ${money(t.transfers_out_minor)} ${r.account?.challenge_name ? "handed over" : "moved out"} to other accounts`
      : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join("; ")}. This changes no fundraiser total.` : null;
}

function nameFor(e: StatementReport["entries"][number], options: StatementOptions): string {
  if (options.names === "mpesa" && e.mpesa_name && e.kind === "contribution") return `${e.mpesa_name} (${e.label})`;
  return e.label;
}

interface Table {
  head: string[];
  body: RowInput[];
  foot: RowInput[];
  /** Columns from here on hold figures (right aligned). */
  numericFrom: number;
  /** The column holding "Matched" / receipt status, if any. */
  statusColumn: number | null;
}

function tableRows(r: StatementReport, options: StatementOptions): Table {
  const code = (c: string | null) => (options.includeCodes ? [c ?? "\u2013"] : []);
  const codeHead = options.includeCodes ? ["M-Pesa code"] : [];
  // The date, and below it the exact time the money moved (Nairobi).
  const when = (at: string) => `${formatNairobiDate(at)}\n${formatNairobiTime(at)}`;

  if (options.kind === "full") {
    let balance = r.brought_forward_minor;
    const body: RowInput[] = [["", "", { content: "Balance brought forward", styles: { textColor: MUTED } }, ...code(null).map(() => ""), "", "", money(balance)]];
    let moneyIn = 0;
    let moneyOut = 0;
    r.entries.forEach((e, i) => {
      const into = e.direction === "in";
      balance += into ? e.amount_minor : -e.amount_minor;
      if (into) moneyIn += e.amount_minor;
      else moneyOut += e.amount_minor;
      body.push([String(i + 1), when(e.at), plain(nameFor(e, options)), ...code(e.reference), into ? money(e.amount_minor) : "", into ? "" : money(e.amount_minor), money(balance)]);
    });
    const foot: RowInput[] = [["", "", `Totals (${r.entries.length} entries)`, ...code(null).map(() => ""), money(moneyIn), money(moneyOut), money(balance)]];
    return { head: ["No.", "Date & time", "Details", ...codeHead, "In", "Out", "Balance"], body, foot, numericFrom: 3 + codeHead.length, statusColumn: null };
  }
  // Expenses means funeral expenses and their charges, so the total matches "Total spent".
  const wanted = r.entries.filter((e) => (options.kind === "received" ? e.kind === "contribution" : e.kind === "expense" || e.kind === "charge"));
  const body: RowInput[] = wanted.map((e, i) => [
    String(i + 1),
    when(e.at),
    plain(nameFor(e, options)),
    ...code(e.reference),
    options.kind === "spent" ? (e.kind === "expense" ? (e.has_receipt ? "Receipt" : "\u2013") : "\u2013") : e.matched ? "Matched" : "\u2013",
    money(e.amount_minor),
  ]);
  const total = wanted.reduce((sum, e) => sum + e.amount_minor, 0);
  const foot: RowInput[] = [["", "", `Total (${wanted.length})`, ...code(null).map(() => ""), "", money(total)]];
  const middle = options.kind === "spent" ? "Receipt" : "M-Pesa check";
  return {
    head: ["No.", "Date & time", options.kind === "spent" ? "What it was for" : "Name", ...codeHead, middle, "Amount (KES)"],
    body,
    foot,
    numericFrom: 4 + codeHead.length,
    statusColumn: 3 + codeHead.length,
  };
}

function closing(doc: jsPDF, startY: number) {
  let y = startY + 12;
  if (y > PAGE_H - 60) {
    doc.addPage();
    y = CONTENT_TOP + 4;
  }
  doc.setFont(face.serif, "italic");
  doc.setFontSize(15);
  doc.setTextColor(...PLUM_TEXT);
  doc.text("With gratitude to everyone who has given, prayed and stood with us.", MARGIN, y);
  doc.setFont(face.sans, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(
    doc.splitTextToSize(
      plain("Every contribution and every expense is recorded and can be checked by the family. Please contact the organisers with any question about this statement."),
      PAGE_W - MARGIN * 2,
    ) as string[],
    MARGIN,
    y + 6,
  );
}

export function buildStatementPdf(r: StatementReport, options: StatementOptions): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  useFonts(doc, options.fonts);
  doc.setProperties({
    title: plain(`Statement of account - ${r.fundraiser.memorial_name || r.fundraiser.name}`),
    subject: r.account ? `${TITLES[options.kind]} - ${tidy(r.account.name)}` : TITLES[options.kind],
    creator: "Mchango",
  });
  const flow: Flow = {
    y: summary(doc, r, options, header(doc, r, options)) + 4,
    bottom: CONTENT_BOTTOM,
    need(height) {
      if (this.y + height > CONTENT_BOTTOM) {
        doc.addPage();
        this.y = CONTENT_TOP;
      }
      return this.y;
    },
  };
  drawCharts(doc, r, options.kind, flow, MARGIN, PAGE_W - MARGIN * 2);
  // The entries, under their own title; on a new page if little room is left.
  const startY = sectionTitle(doc, MARGIN, flow.need(60), PAGE_W - MARGIN * 2, "All entries") + 1;
  const { head, body, foot, numericFrom, statusColumn } = tableRows(r, options);

  autoTable(doc, {
    head: [head],
    body,
    foot,
    startY,
    theme: "plain",
    showHead: "everyPage",
    showFoot: "lastPage",
    margin: { top: 22, bottom: PAGE_H - CONTENT_BOTTOM, left: MARGIN, right: MARGIN },
    styles: {
      font: face.sans,
      fontSize: 9.2,
      textColor: INK,
      cellPadding: { top: 2.7, bottom: 2.7, left: 3, right: 3 },
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: { fillColor: PLUM, textColor: IVORY, fontStyle: "bold", fontSize: 7, cellPadding: { top: 3.4, bottom: 3.4, left: 3, right: 3 } },
    footStyles: { fillColor: GOLD_TINT, textColor: PLUM, fontStyle: "bold", fontSize: 9, cellPadding: { top: 3.4, bottom: 3.4, left: 3, right: 3 } },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: Object.fromEntries(
      head.map((_, i) => [
        i,
        i === 0
          ? { cellWidth: 11, halign: "right", textColor: MUTED }
          : i === 1
            ? { cellWidth: 24 }
            : i === statusColumn
              ? { cellWidth: 25 }
              : i >= numericFrom
                ? { halign: "right", cellWidth: i === head.length - 1 ? 30 : 25 }
                : {},
      ]),
    ),
    didParseCell: (data: CellHookData) => {
      if (data.section !== "body") {
        data.cell.styles.lineWidth = 0.15;
        data.cell.styles.lineColor = (data.cell.styles.fillColor as RGB | false) || [255, 255, 255];
      }
      if (data.section === "head") {
        data.cell.text = data.cell.text.map((t) => t.toUpperCase());
        if (data.column.index >= numericFrom || data.column.index === 0) data.cell.styles.halign = "right";
      }
      if (data.section === "foot" && data.column.index >= numericFrom) data.cell.styles.halign = "right";
      if (data.section === "body" && data.column.index === statusColumn) {
        const matched = data.cell.text.join("") !== "\u2013";
        data.cell.styles.textColor = matched ? SAGE : MUTED;
        data.cell.styles.fontStyle = matched ? "bold" : "normal";
      }
    },
    willDrawCell: (data: CellHookData) => {
      // One strip under the header and total rows, so their cells read as a single band.
      if (data.section !== "body" && data.column.index === 0) {
        doc.setFillColor(...(data.section === "head" ? PLUM : GOLD_TINT));
        doc.rect(MARGIN, data.cell.y, PAGE_W - MARGIN * 2, data.cell.height, "F");
      }
    },
    didDrawCell: (data: CellHookData) => {
      // Hairlines between rows, and a gold rule over the total.
      const { x, y, width, height } = data.cell;
      if (data.section === "body") {
        doc.setDrawColor(...LINE);
        doc.setLineWidth(0.2);
        doc.line(x, y + height, x + width, y + height);
      } else if (data.section === "foot") {
        doc.setDrawColor(...GOLD);
        doc.setLineWidth(0.6);
        doc.line(x, y, x + width, y);
      }
    },
  });
  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;
  closing(doc, finalY);
  // Every page's header and footer, once the pages are all there.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    if (page > 1) slimHeader(doc, r, options.photo);
    footer(doc, r, page);
  }
  doc.putTotalPages(TOTAL_PAGES);
  return doc.output("blob");
}

export function statementFileName(r: StatementReport, kind: ReportKind, extension = "pdf"): string {
  const slug = (text: string) => text.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  const who = slug(r.fundraiser.memorial_name || r.fundraiser.name);
  const account = r.account ? `-${slug(r.account.name)}` : "";
  return `Statement-${kind}${account}-${who}-${r.period_to}.${extension}`;
}
