// Building blocks of the public pages. Everything here reads the public page
// data only, so nothing private can appear.

import { clsx } from "clsx";
import { ArrowRight, Check, ChevronDown, Copy, FileText, HandCoins, MapPin, Megaphone, Phone, Share2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { formatKesShort } from "@/lib/money";
import { CountUp } from "@/components/CountUp";
import { GoalBar } from "@/components/GoalBar";
import { capitalise, familyOf, goalOf } from "@/lib/goal";
import { formatNairobiLongDate, formatShortDate, formatShortDateTime } from "@/lib/time";
import type { PublicEntry, PublicPage } from "@/lib/types";
import { copyText, sharePage } from "./share";

export function PublicCard({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} data-reveal className={clsx("lift rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6", className)}>
      {children}
    </section>
  );
}

export function CardTitle({ children, eyebrow }: { children: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-3">
      {eyebrow && <p className="mb-1 text-[13px] font-semibold tracking-[0.14em] text-stone-500 uppercase">{eyebrow}</p>}
      <h2 className="font-display text-[1.65rem] leading-tight font-semibold text-stone-900">{children}</h2>
    </div>
  );
}

/** Whole shillings where possible: `KES 184,500`. */
export const kes = formatKesShort;

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/** The circular, candle-lit portrait. */
export function MemorialPortrait({ src, alt, large }: { src: string; alt: string; large?: boolean }) {
  return (
    <div className={clsx("memorial-frame", large && "memorial-frame--lg")}>
      <div className="memorial-glow" aria-hidden />
      <div className="memorial-photo">
        <img src={src} alt={alt} />
        <span className="memorial-light" aria-hidden />
      </div>
      <div className="memorial-candle" aria-hidden>
        <span className="flame" />
        <span className="wax" />
      </div>
    </div>
  );
}

// Embers rising from the candle: fixed positions, so every visit looks the same.
const EMBERS = [
  { x: 46, s: 4, t: 6.2, delay: 0, drift: -14 },
  { x: 52, s: 3, t: 7.4, delay: 1.1, drift: 18 },
  { x: 49, s: 5, t: 5.6, delay: 2.3, drift: 6 },
  { x: 55, s: 3, t: 8.1, delay: 0.6, drift: 26 },
  { x: 43, s: 4, t: 6.9, delay: 3.2, drift: -24 },
  { x: 50, s: 2, t: 7.7, delay: 4.1, drift: -4 },
  { x: 58, s: 3, t: 6.4, delay: 2.8, drift: 30 },
  { x: 40, s: 2, t: 7.2, delay: 1.7, drift: -30 },
  { x: 51, s: 4, t: 5.9, delay: 5.0, drift: 12 },
  { x: 47, s: 3, t: 8.4, delay: 3.8, drift: -10 },
];

function Embers() {
  return (
    <div className="embers" aria-hidden>
      {EMBERS.map((e, i) => (
        <span
          key={i}
          style={{ "--x": `${e.x}%`, "--s": `${e.s}px`, "--t": `${e.t}s`, "--delay": `${e.delay}s`, "--drift": `${e.drift}px` } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** The portrait drifts a little slower than the page as you scroll. */
function useParallax<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (ref.current) ref.current.style.translate = `0 ${Math.min(window.scrollY * 0.18, 80)}px`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return ref;
}

/** The memorial header: compact, portrait beside the name on larger screens. */
export function Hero({ page }: { page: PublicPage }) {
  const f = page.fundraiser;
  const name = f.memorial_name ?? f.name;
  const portrait = useParallax<HTMLDivElement>();
  return (
    <header className="hero-breathe bg-[radial-gradient(120%_100%_at_50%_20%,#3b2c47_0%,#241a2d_55%,#140f18_100%)] -mt-14 px-4 pt-[5.5rem] pb-20 text-[#f6efe4] md:-mt-16 md:pt-[6.5rem] md:pb-16">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-x-12 gap-y-14 text-center md:flex-row md:justify-center md:text-left">
        {f.photo_url && (
          <div ref={portrait} className="hero-portrait relative">
            <MemorialPortrait src={f.photo_url} alt={`Portrait of ${name}`} large />
            <Embers />
          </div>
        )}
        <div className="space-y-1.5 md:pb-6">
          {f.memorial_name && (
            <p className="hero-line text-[13px] font-semibold tracking-[0.28em] text-[#f6efe4]/75 uppercase" style={delay(150)}>
              In loving memory of
            </p>
          )}
          <h1 className="hero-line font-display text-[2.4rem] leading-[1.08] font-semibold md:text-[3.2rem]" style={delay(300)}>
            {name}
          </h1>
          {f.memorial_dates && (
            <p className="hero-line font-display text-xl text-[#f6efe4]/85 md:text-2xl" style={delay(450)}>
              {f.memorial_dates}
            </p>
          )}
          {f.memorial_tribute && (
            <p className="hero-line pt-1 font-display text-xl italic md:text-2xl" style={delay(650)}>
              <span className="gold-sheen">{f.memorial_tribute}</span>
            </p>
          )}
          {f.giving && (
            <div className="hero-line pt-6" style={delay(850)}>
              <Link
                to="/contribute"
                className="press glow-pulse inline-flex min-h-12 items-center gap-2 rounded-full bg-[#e8c27a] px-6 text-[17px] font-semibold text-[#1e1625] no-underline shadow-[0_10px_30px_-10px_rgb(232_194_122/0.8)] hover:bg-[#f0cf8e] hover:no-underline"
              >
                <HandCoins className="size-5" aria-hidden /> How do I contribute?
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** `display` is shown (e.g. 0711 672 840); `value` is what is copied (0711672840). */
export function CopyRow({ label, value, display }: { label: string; value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (await copyText(value)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] text-stone-500">{label}</p>
        <p className="text-[1.45rem] leading-snug font-semibold tracking-wide break-all text-stone-900 tabular-nums">{display ?? value}</p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        className="press flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-[15px] font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-plum-600"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="pop size-4 text-sage-700" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** How to give: the M-Pesa details with copy buttons and the name to check. */
export function GiveCard({ page }: { page: PublicPage }) {
  const g = page.fundraiser.giving;
  if (!g) return null;
  const numberLabel = g.method === "paybill" ? "Paybill / business no." : g.method === "till" ? "Till number (Buy Goods)" : "Send money to";
  const steps =
    g.method === "paybill"
      ? ["Open M-PESA on your phone (the M-PESA app or the SIM menu).", "Choose Lipa na M-PESA, then Pay Bill.", `Enter business number ${g.number}.`, `Enter account number ${g.account ?? ""}.`, "Enter the amount, then your M-PESA PIN."]
      : g.method === "till"
        ? ["Open M-PESA on your phone (the M-PESA app or the SIM menu).", "Choose Lipa na M-PESA, then Buy Goods and Services.", `Enter till number ${g.number}.`, "Enter the amount, then your M-PESA PIN."]
        : ["Open M-PESA on your phone (the M-PESA app or the SIM menu).", "Choose Send Money.", `Enter the number ${g.number}.`, "Enter the amount, then your M-PESA PIN."];
  return (
    <PublicCard id="give" className="scroll-mt-16 shadow-lg">
      <CardTitle>Contribute through M-Pesa</CardTitle>
      {page.fundraiser.description && <p className="-mt-1 mb-4 text-[15px] leading-relaxed text-stone-600">{page.fundraiser.description}</p>}
      <div className="space-y-2.5">
        <CopyRow label={numberLabel} value={g.number} />
        {g.account && <CopyRow label="Account" value={g.account} />}
      </div>
      <p className="mt-3 rounded-xl bg-ochre-50 px-4 py-3 text-[15px] leading-relaxed text-ochre-900">
        Before you enter your PIN, check that M-Pesa shows this name: <strong className="font-semibold">{g.name}</strong>
      </p>
      <details className="group mt-3">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 text-[16px] font-semibold text-stone-900 hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
          How to send, step by step
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-6 text-[16px] leading-relaxed text-stone-700">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
          <li>
            Before confirming, check the name shown is <strong>{g.name}</strong>.
          </li>
          <li>
            You will get an M-Pesa message with a code. Once it is recorded you can look it up on{" "}
            <Link to="/check">Check my contribution</Link>.
          </li>
        </ol>
      </details>
    </PublicCard>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-stone-100 py-2.5 last:border-0">
      <dt className="text-stone-600">{label}</dt>
      <dd className="text-right font-medium text-stone-900">{children}</dd>
    </div>
  );
}

function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** When and where; any detail that isn't set is left out. */
export function FuneralCard({ page }: { page: PublicPage }) {
  const { when, place, map_url } = page.fundraiser.funeral;
  const contact = page.fundraiser.organisers.find((o) => o.phone) ?? page.fundraiser.organisers[0];
  if (!when && !place && !contact) return null;
  const map = map_url ?? (place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null);
  return (
    <PublicCard>
      <CardTitle>Funeral details</CardTitle>
      <dl className="text-[16px]">
        {when && <Row label="When">{when}</Row>}
        {place && <Row label="Where">{place}</Row>}
        {contact && (
          <Row label="Family contact">
            {contact.name}
            {contact.phone && (
              <>
                {" · "}
                <a href={telLink(contact.phone)}>{contact.phone}</a>
              </>
            )}
          </Row>
        )}
      </dl>
      {map && place && (
        <a
          href={map}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-stone-300 text-[16px] font-semibold text-stone-900 no-underline hover:bg-stone-50 hover:no-underline"
        >
          <MapPin className="size-4" aria-hidden /> Open in Maps
        </a>
      )}
    </PublicCard>
  );
}

/** The pinned (or newest) announcement, near the top of the home page. */
export function LatestUpdate({ page }: { page: PublicPage }) {
  const latest = page.announcements[0];
  if (!latest) return null;
  return (
    <PublicCard className={clsx("border-ochre-200 bg-[#fffaf0]", latest.pinned && "glow-pulse")}>
      <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold tracking-[0.14em] text-ochre-800 uppercase">
        <Megaphone className="size-4" aria-hidden />
        {latest.pinned ? "Important" : "Latest update"} · {formatShortDate(latest.published_at)}
      </p>
      <h2 className="font-display text-[1.6rem] leading-tight font-semibold text-stone-900">{latest.title}</h2>
      {latest.body && <p className="mt-2 line-clamp-5 leading-relaxed whitespace-pre-line text-stone-700">{latest.body}</p>}
      <div className="mt-3 flex flex-wrap gap-x-5">
        <Link to={`/updates/${latest.id}`} className="inline-flex min-h-11 items-center text-[16px] font-semibold">
          {latest.pinned && (page.fundraiser.funeral.place || page.fundraiser.funeral.map_url) ? "Place of burial and directions" : "Read the full update"}
        </Link>
        {page.announcements.length > 1 && (
          <Link to="/updates" className="inline-flex min-h-11 items-center text-[16px] font-semibold">
            All {page.announcements.length} updates
          </Link>
        )}
      </div>
    </PublicCard>
  );
}

function Swatch({ color, hollow }: { color: string; hollow?: boolean }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={hollow ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : { background: color }}
      aria-hidden
    />
  );
}

/** The target: the part paid by the deceased's family, then what family, friends and well-wishers are asked to raise. */
export function GoalCard({ page }: { page: PublicPage }) {
  const f = page.fundraiser;
  const goal = goalOf(f.target_minor, f.pledges, page.totals.contributions_minor);
  if (!goal) return null;
  const { target, familyPledged, othersShare, stillNeeded } = goal;
  const family = familyOf(f.memorial_name);
  return (
    <PublicCard className="relative overflow-hidden">
      <div aria-hidden className="card-glow pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-ochre-200/40 blur-3xl" />
      <div className="relative">
        <p className="mb-1 text-[13px] font-semibold tracking-[0.14em] text-stone-500 uppercase">The goal</p>
        {target !== null ? (
          <>
            <p className="font-display text-[2.6rem] leading-none font-semibold text-stone-900">
              <CountUp value={target} format={kes} />
            </p>
            <p className="mt-1.5 text-[15px] text-stone-600">needed in all</p>
          </>
        ) : (
          <h2 className="font-display text-[1.65rem] leading-tight font-semibold text-stone-900">{capitalise(family)}</h2>
        )}
        <p className="mt-3 text-[16px] leading-relaxed text-stone-700">
          {familyPledged > 0 && target !== null && othersShare !== null ? (
            <>
              <strong className="font-semibold text-stone-900">{kes(familyPledged)}</strong> has been received from {family}. Family, friends and
              well-wishers are kindly asked to help with the remaining <strong className="font-semibold text-stone-900">{kes(othersShare)}</strong>.
            </>
          ) : familyPledged > 0 ? (
            <>
              <strong className="font-semibold text-stone-900">{kes(familyPledged)}</strong> has been received from {family} towards the funeral.
            </>
          ) : (
            "Every contribution, large or small, helps the family give him a dignified send-off."
          )}
        </p>
        <GoalBar goal={goal} family={family} className="mt-5" />
        {(page.promises?.pledges.length ?? 0) > 0 && (
          <Link to="/contributions?view=pledges" className="group mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold">
            See every pledge
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        )}
        {stillNeeded === 0 && (
          <p className="mt-3 rounded-xl bg-sage-50 px-4 py-3 text-[15px] text-sage-800">The target has been reached. Thank you, all of you.</p>
        )}
      </div>
    </PublicCard>
  );
}

/** One large total and a single bar showing where the money went. */
export function FundsCard({ page }: { page: PublicPage }) {
  const t = page.totals;
  const available = t.opening_funds_minor + t.contributions_minor + t.refunds_received_minor + t.reversals_in_minor;
  const otherOut = t.refunds_paid_minor + t.reversals_out_minor;
  const parts = [
    { key: "spent", label: "Spent", value: t.expenses_minor, color: "var(--color-data-out)" },
    { key: "charges", label: "Charges", value: t.charges_minor, color: "var(--color-data-charge)" },
    ...(otherOut > 0 ? [{ key: "refunds", label: "Refunds", value: otherOut, color: "var(--color-stone-500)" }] : []),
  ];
  const latest = page.statement_checks.reconciled_periods[0];
  return (
    <PublicCard>
      <CardTitle>Funds so far</CardTitle>
      <p className="text-[15px] text-stone-600">
        Received from {t.contributions_count} contribution{t.contributions_count === 1 ? "" : "s"}
      </p>
      <p className="font-display text-[2.9rem] leading-none font-semibold text-stone-900" aria-label={kes(t.contributions_minor)}>
        <CountUp value={t.contributions_minor} />
      </p>
      {available > 0 && (
        <>
          <div
            className="bar-grow mt-4 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-[var(--color-data-track)]"
            role="img"
            aria-label={`${parts.map((p) => `${p.label} ${kes(p.value)}`).join(", ")}, remaining ${kes(t.remaining_minor)}`}
          >
            {parts
              .filter((p) => p.value > 0)
              .map((p) => (
                <span key={p.key} className="h-full first:rounded-l-full" style={{ width: `${(p.value * 100) / available}%`, background: p.color }} />
              ))}
          </div>
          <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2 text-[15px]">
            {parts.map((p) => (
              <div key={p.key}>
                <dt className="flex items-center gap-1.5 text-stone-600">
                  <Swatch color={p.color} />
                  {p.label}
                </dt>
                <dd className="text-[1.05rem] font-semibold tabular-nums">{kes(p.value).replace("KES ", "")}</dd>
              </div>
            ))}
            <div>
              <dt className="flex items-center gap-1.5 text-stone-600">
                <Swatch color="var(--color-plum-300)" hollow />
                Remaining
              </dt>
              <dd className="text-[1.05rem] font-semibold tabular-nums">{kes(t.remaining_minor).replace("KES ", "")}</dd>
            </div>
          </dl>
        </>
      )}
      {page.opening_funds && (
        <p className="mt-3 text-[15px] text-stone-600">
          Includes {kes(page.opening_funds.amount_minor)} held before contributions opened: {page.opening_funds.explanation}
        </p>
      )}
      <p className="mt-3 text-[15px] text-stone-500">
        {page.last_updated && <>Updated {formatShortDateTime(page.last_updated)}</>}
        {latest && (
          <>
            {" · "}
            <span className="font-medium text-sage-700">Checked to {formatShortDate(latest.end)}</span>
          </>
        )}
      </p>
    </PublicCard>
  );
}

export function EntryRows({ entries, showTime = true }: { entries: PublicEntry[]; showTime?: boolean }) {
  return (
    <ul className="stagger divide-y divide-stone-100">
      {entries.map((e, i) => (
        <li key={`${e.at}-${i}`} className="flex items-start justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="font-medium break-words text-stone-900">{e.label}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[15px] text-stone-500">
              <span>{showTime ? formatShortDateTime(e.at) : formatShortDate(e.at)}</span>
              {e.receipts.map((r, n) => (
                <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1">
                  <FileText className="size-4" aria-hidden />
                  Receipt{e.receipts.length > 1 ? ` ${n + 1}` : ""}
                </a>
              ))}
            </p>
          </div>
          {e.amount_minor !== null && <span className="shrink-0 pt-0.5 font-semibold text-stone-900 tabular-nums">{kes(e.amount_minor).replace("KES ", "")}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Contributions and expenses as two tabs of one card, latest ten each. */
export function LedgerCard({ page }: { page: PublicPage }) {
  const [tab, setTab] = useState<"in" | "out">("in");
  const expenses = page.spending;
  const list = tab === "in" ? page.contributions : expenses;
  const shown = list.slice(0, 10);
  return (
    <PublicCard className="pb-3">
      <div role="tablist" aria-label="Ledger" className="relative mb-1 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-lg bg-white shadow-sm transition-transform duration-300 ease-out"
          style={{ transform: tab === "in" ? "translateX(0)" : "translateX(calc(100% + 4px))" }}
        />
        {(
          [
            ["in", "Contributions", page.contributions.length],
            ["out", "Expenses", expenses.length],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={clsx(
              "press relative z-10 min-h-11 rounded-lg text-[16px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-plum-600",
              tab === value ? "text-stone-900" : "text-stone-600",
            )}
          >
            {label} <span className="font-normal text-stone-500">{count}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-stone-600">{tab === "in" ? "No contributions recorded yet." : "Nothing has been spent yet."}</p>
      ) : (
        <div key={tab} className="page-enter">
          <EntryRows entries={shown} />
        </div>
      )}
      {list.length > shown.length && (
        <Link
          to={tab === "in" ? "/contributions" : "/expenses"}
          className="mt-1 mb-2 flex min-h-12 items-center justify-center rounded-xl border border-stone-300 text-[16px] font-semibold text-stone-900 no-underline hover:bg-stone-50 hover:no-underline"
        >
          See all {list.length}
        </Link>
      )}
      {!page.fundraiser.show_contribution_amounts && tab === "in" && (
        <p className="pb-2 text-[15px] text-stone-500">The family has chosen to show names only. The total above includes every contribution.</p>
      )}
    </PublicCard>
  );
}

/** The calm first state, before anything has been recorded. */
export function DayOneCard({ page }: { page: PublicPage }) {
  const start = page.fundraiser.start_date;
  return (
    <PublicCard>
      <CardTitle>{start ? `Contributions opened on ${formatNairobiLongDate(start).replace(/^\w+, /, "")}` : "Contributions are open"}</CardTitle>
      <p className="leading-relaxed text-stone-700">
        Every contribution and every expense will be listed here, so you can see where the money goes. Statement checks will be marked as they are
        completed.
      </p>
      <ShareButton page={page} className="mt-4" label="Share with family on WhatsApp" />
    </PublicCard>
  );
}

export function ShareButton({ page, className, label = "Share on WhatsApp" }: { page: PublicPage; className?: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => void sharePage(page)}
      className={clsx(
        "press flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2e2338] px-4 text-[16px] font-semibold text-white hover:bg-[#1e1625] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-600",
        className,
      )}
    >
      <Share2 className="size-5" aria-hidden />
      {label}
    </button>
  );
}

/** How the money is checked, in plain words, with a status pill. */
export function ChecksCard({ page }: { page: PublicPage }) {
  const latest = page.statement_checks.reconciled_periods[0];
  const { matched_count, not_matched_count } = page.statement_checks;
  return (
    <PublicCard>
      <CardTitle>How the money is checked</CardTitle>
      <span
        className={clsx(
          "inline-flex rounded-full px-3 py-1 text-[15px] font-medium",
          latest ? "bg-sage-50 text-sage-800 ring-1 ring-sage-200" : "bg-stone-100 text-stone-700 ring-1 ring-stone-200",
        )}
      >
        {latest ? `Checked up to ${formatShortDate(latest.end)}` : "Checks will be marked here as they are completed"}
      </span>
      <p className="mt-3 leading-relaxed text-stone-700">
        The organisers compare this page against the M-Pesa statement and mark each period once it matches.
        {matched_count + not_matched_count > 0 && ` So far ${matched_count} of ${matched_count + not_matched_count} M-Pesa entries are matched.`}
      </p>
      <p className="mt-2 text-[15px] text-stone-500">This check is done by the organisers. It is not a confirmation from Safaricom.</p>
    </PublicCard>
  );
}

export function OrganisersCard({ page }: { page: PublicPage }) {
  const organisers = page.fundraiser.organisers;
  if (organisers.length === 0) return null;
  return (
    <PublicCard>
      <CardTitle>Organised by</CardTitle>
      <ul className="divide-y divide-stone-100">
        {organisers.map((o) => (
          <li key={`${o.name}-${o.phone}`} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-medium text-stone-900">{o.name}</p>
              {o.role && <p className="text-[15px] text-stone-500">{o.role}</p>}
            </div>
            {o.phone && (
              <a
                href={telLink(o.phone)}
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-stone-300 px-4 font-semibold text-stone-900 no-underline hover:bg-stone-50 hover:no-underline"
                aria-label={`Call ${o.name}`}
              >
                <Phone className="size-4" aria-hidden /> Call
              </a>
            )}
          </li>
        ))}
      </ul>
    </PublicCard>
  );
}

export function SpreadCard({ page }: { page: PublicPage }) {
  return (
    <PublicCard>
      <CardTitle>Help spread the word</CardTitle>
      <ShareButton page={page} />
      <p className="mt-3 text-center text-[15px] text-stone-600">
        Already contributed? <Link to="/check">Check that it arrived</Link>
      </p>
    </PublicCard>
  );
}

/** The heading of a page other than home. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 pb-2 md:px-6">
      <h1 className="font-display text-[2.4rem] leading-tight font-semibold text-stone-900">{title}</h1>
      {children && <div className="mt-2 leading-relaxed text-stone-600">{children}</div>}
    </div>
  );
}
