// Building blocks of the public pages. Everything here reads the public page
// data only, so nothing private can appear.

import { clsx } from "clsx";
import { ArrowRight, CalendarDays, Check, ChevronDown, Copy, FileText, HandCoins, MapPin, Megaphone, Phone, Share2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { formatKesShort } from "@/lib/money";
import { CountUp } from "@/components/CountUp";
import { GoalBar } from "@/components/GoalBar";
import { capitalise, familyOf, goalOf, listedAsPledge } from "@/lib/goal";
import { formatNairobiLongDate, formatShortDate, formatShortDateTime } from "@/lib/time";
import type { PublicEntry, PublicPage } from "@/lib/types";
import { localiseDates, localiseName, useLang, useTr } from "./i18n";
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
  const tr = useTr();
  const lang = useLang();
  const f = page.fundraiser;
  const name = f.memorial_name ?? f.name;
  const portrait = useParallax<HTMLDivElement>();
  return (
    <header className="hero-breathe bg-[radial-gradient(120%_100%_at_50%_20%,#3b2c47_0%,#241a2d_55%,#140f18_100%)] -mt-14 px-4 pt-[5.5rem] pb-20 text-[#f6efe4] md:-mt-16 md:pt-[6.5rem] md:pb-16">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-x-12 gap-y-14 text-center md:flex-row md:justify-center md:text-left">
        {f.photo_url && (
          <div ref={portrait} className="hero-portrait relative">
            <MemorialPortrait src={f.photo_url} alt={tr(`Portrait of ${name}`, `Picha ya ${name}`)} large />
            <Embers />
          </div>
        )}
        <div className="space-y-1.5 md:pb-6">
          {f.memorial_name && (
            <p className="hero-line text-[13px] font-semibold tracking-[0.28em] text-[#f6efe4]/75 uppercase" style={delay(150)}>
              {tr("In loving memory of", "Kwa kumbukumbu ya")}
            </p>
          )}
          <h1 className="hero-line font-display text-[2.4rem] leading-[1.08] font-semibold md:text-[3.2rem]" style={delay(300)}>
            {name}
          </h1>
          {f.memorial_dates && (
            <p className="hero-line font-display text-xl text-[#f6efe4]/85 md:text-2xl" style={delay(450)}>
              {localiseDates(f.memorial_dates, lang)}
            </p>
          )}
          {f.memorial_tribute && (
            <p className="hero-line pt-1 font-display text-xl italic md:text-2xl" style={delay(650)}>
              <span className="gold-sheen">{f.memorial_tribute}</span>
            </p>
          )}
          <div className="hero-line flex flex-wrap justify-center gap-3 pt-6 md:justify-start" style={delay(850)}>
            {f.giving && (
              <Link
                to="/contribute"
                className="press glow-pulse inline-flex min-h-12 items-center gap-2 rounded-full bg-[#e8c27a] px-6 text-[17px] font-semibold text-[#1e1625] no-underline shadow-[0_10px_30px_-10px_rgb(232_194_122/0.8)] hover:bg-[#f0cf8e] hover:no-underline"
              >
                <HandCoins className="size-5" aria-hidden /> {tr("How do I contribute?", "Nitachangiaje?")}
              </Link>
            )}
            <Link
              to="/programme"
              className="press inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-[17px] font-semibold text-[#f6efe4] no-underline ring-1 ring-[#e8c27a]/60 hover:bg-white/10 hover:text-white hover:no-underline"
            >
              <CalendarDays className="size-5 text-[#e8c27a]" aria-hidden /> {tr("Funeral programme", "Ratiba ya mazishi")}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/** `display` is shown (e.g. 0711 672 840); `value` is what is copied (0711672840). */
export function CopyRow({ label, value, display }: { label: string; value: string; display?: string }) {
  const tr = useTr();
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
        aria-label={tr(`Copy ${label}`, `Nakili ${label}`)}
      >
        {copied ? <Check className="pop size-4 text-sage-700" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? tr("Copied", "Imenakiliwa") : tr("Copy", "Nakili")}
      </button>
    </div>
  );
}

/** How to give: the M-Pesa details with copy buttons and the name to check. */
export function GiveCard({ page }: { page: PublicPage }) {
  const tr = useTr();
  const g = page.fundraiser.giving;
  if (!g) return null;
  const numberLabel =
    g.method === "paybill"
      ? tr("Paybill / business no.", "Paybill / namba ya biashara")
      : g.method === "till"
        ? tr("Till number (Buy Goods)", "Namba ya till (Buy Goods)")
        : tr("Send money to", "Tuma pesa kwa");
  const open = tr("Open M-PESA on your phone (the M-PESA app or the SIM menu).", "Fungua M-PESA kwenye simu yako (programu ya M-PESA au menyu ya SIM).");
  const amount = tr("Enter the amount, then your M-PESA PIN.", "Weka kiasi, kisha PIN yako ya M-PESA.");
  const steps =
    g.method === "paybill"
      ? [open, tr("Choose Lipa na M-PESA, then Pay Bill.", "Chagua Lipa na M-PESA, kisha Pay Bill."), tr(`Enter business number ${g.number}.`, `Weka namba ya biashara ${g.number}.`), tr(`Enter account number ${g.account ?? ""}.`, `Weka namba ya akaunti ${g.account ?? ""}.`), amount]
      : g.method === "till"
        ? [open, tr("Choose Lipa na M-PESA, then Buy Goods and Services.", "Chagua Lipa na M-PESA, kisha Buy Goods and Services."), tr(`Enter till number ${g.number}.`, `Weka namba ya till ${g.number}.`), amount]
        : [open, tr("Choose Send Money.", "Chagua Tuma Pesa."), tr(`Enter the number ${g.number}.`, `Weka namba ${g.number}.`), amount];
  return (
    <PublicCard id="give" className="scroll-mt-16 shadow-lg">
      <CardTitle>{tr("Contribute through M-Pesa", "Changia kupitia M-Pesa")}</CardTitle>
      {page.fundraiser.description && (
        <p className="-mt-1 mb-4 text-[15px] leading-relaxed text-stone-600">{tr(page.fundraiser.description, page.fundraiser.description_sw || page.fundraiser.description)}</p>
      )}
      <div className="space-y-2.5">
        <CopyRow label={numberLabel} value={g.number} />
        {g.account && <CopyRow label={tr("Account", "Akaunti")} value={g.account} />}
      </div>
      <p className="mt-3 rounded-xl bg-ochre-50 px-4 py-3 text-[15px] leading-relaxed text-ochre-900">
        {tr("Before you enter your PIN, check that M-Pesa shows this name:", "Kabla ya kuweka PIN yako, hakikisha M-Pesa inaonyesha jina hili:")}{" "}
        <strong className="font-semibold">{g.name}</strong>
      </p>
      <details className="group mt-3">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 text-[16px] font-semibold text-stone-900 hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
          {tr("How to send, step by step", "Jinsi ya kutuma, hatua kwa hatua")}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-6 text-[16px] leading-relaxed text-stone-700">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
          <li>
            {tr("Before confirming, check the name shown is", "Kabla ya kuthibitisha, hakikisha jina linaloonyeshwa ni")} <strong>{g.name}</strong>.
          </li>
          <li>
            {tr(
              "You will get an M-Pesa message with a code. Once it is recorded you can look it up on",
              "Utapokea ujumbe wa M-Pesa wenye namba ya muamala. Ukisharekodiwa, unaweza kuuhakiki kwenye",
            )}{" "}
            <Link to="/check">{tr("Check my contribution", "Hakiki mchango wangu")}</Link>.
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
  const tr = useTr();
  const lang = useLang();
  const { when, place, map_url } = page.fundraiser.funeral;
  const contact = page.fundraiser.organisers.find((o) => o.phone) ?? page.fundraiser.organisers[0];
  if (!when && !place && !contact) return null;
  const map = map_url ?? (place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null);
  return (
    <PublicCard>
      <CardTitle>{tr("Funeral details", "Taarifa za mazishi")}</CardTitle>
      <dl className="text-[16px]">
        {when && <Row label={tr("When", "Lini")}>{localiseDates(when, lang)}</Row>}
        {place && <Row label={tr("Where", "Wapi")}>{place}</Row>}
        {contact && (
          <Row label={tr("Family contact", "Mawasiliano ya familia")}>
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
          <MapPin className="size-4" aria-hidden /> {tr("Open in Maps", "Fungua kwenye ramani")}
        </a>
      )}
    </PublicCard>
  );
}

/** The pinned (or newest) announcement, near the top of the home page. */
export function LatestUpdate({ page }: { page: PublicPage }) {
  const tr = useTr();
  const latest = page.announcements[0];
  if (!latest) return null;
  const title = tr(latest.title, latest.title_sw || latest.title);
  const body = tr(latest.body, latest.body_sw || latest.body);
  return (
    <PublicCard className={clsx("border-ochre-200 bg-[#fffaf0]", latest.pinned && "glow-pulse")}>
      <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold tracking-[0.14em] text-ochre-800 uppercase">
        <Megaphone className="size-4" aria-hidden />
        {latest.pinned ? tr("Important", "Muhimu") : tr("Latest update", "Taarifa mpya")} · {formatShortDate(latest.published_at)}
      </p>
      <h2 className="font-display text-[1.6rem] leading-tight font-semibold text-stone-900">{title}</h2>
      {body && <p className="mt-2 line-clamp-5 leading-relaxed whitespace-pre-line text-stone-700">{body}</p>}
      <div className="mt-3 flex flex-wrap gap-x-5">
        <Link to={`/updates/${latest.id}`} className="inline-flex min-h-11 items-center text-[16px] font-semibold">
          {latest.pinned && (page.fundraiser.funeral.place || page.fundraiser.funeral.map_url)
            ? tr("Place of burial and directions", "Mahali pa mazishi na maelekezo")
            : tr("Read the full update", "Soma taarifa kamili")}
        </Link>
        {page.announcements.length > 1 && (
          <Link to="/updates" className="inline-flex min-h-11 items-center text-[16px] font-semibold">
            {tr(`All ${page.announcements.length} updates`, `Taarifa zote ${page.announcements.length}`)}
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
  const tr = useTr();
  const lang = useLang();
  const f = page.fundraiser;
  const goal = goalOf(f.target_minor, f.pledges, page.totals.contributions_minor);
  if (!goal) return null;
  const { target, familyPledged, othersShare, stillNeeded } = goal;
  const family = familyOf(f.memorial_name, lang);
  return (
    <PublicCard className="relative overflow-hidden">
      <div aria-hidden className="card-glow pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-ochre-200/40 blur-3xl" />
      <div className="relative">
        <p className="mb-1 text-[13px] font-semibold tracking-[0.14em] text-stone-500 uppercase">{tr("The goal", "Lengo")}</p>
        {target !== null ? (
          <>
            <p className="font-display text-[2.6rem] leading-none font-semibold text-stone-900">
              <CountUp value={target} format={kes} />
            </p>
            <p className="mt-1.5 text-[15px] text-stone-600">{tr("needed in all", "kinachohitajika kwa jumla")}</p>
          </>
        ) : (
          <h2 className="font-display text-[1.65rem] leading-tight font-semibold text-stone-900">{capitalise(family)}</h2>
        )}
        <p className="mt-3 text-[16px] leading-relaxed text-stone-700">
          {familyPledged > 0 && target !== null && othersShare !== null ? (
            <>
              <strong className="font-semibold text-stone-900">{kes(familyPledged)}</strong>
              {tr(` has been received from ${family}. Family, friends and well-wishers are kindly asked to help with the remaining `, ` zimepokelewa kutoka kwa ${family}. Familia, marafiki na wahisani wanaombwa kwa upole kusaidia kiasi kilichobaki cha `)}
              <strong className="font-semibold text-stone-900">{kes(othersShare)}</strong>.
            </>
          ) : familyPledged > 0 ? (
            <>
              <strong className="font-semibold text-stone-900">{kes(familyPledged)}</strong>
              {tr(` has been received from ${family} towards the funeral.`, ` zimepokelewa kutoka kwa ${family} kwa ajili ya mazishi.`)}
            </>
          ) : (
            tr("Every contribution, large or small, helps the family give him a dignified send-off.", "Kila mchango, mkubwa au mdogo, unaisaidia familia kumpa mazishi ya heshima.")
          )}
        </p>
        <GoalBar goal={goal} family={family} className="mt-5" />
        {page.promises?.pledges.some(listedAsPledge) && (
          <Link to="/contributions?view=pledges" className="group mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold">
            {tr("See every pledge", "Tazama ahadi zote")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        )}
        {stillNeeded === 0 && (
          <p className="mt-3 rounded-xl bg-sage-50 px-4 py-3 text-[15px] text-sage-800">{tr("The target has been reached. Thank you, all of you.", "Lengo limefikiwa. Asanteni nyote.")}</p>
        )}
      </div>
    </PublicCard>
  );
}

/** One large total and a single bar showing where the money went. */
export function FundsCard({ page }: { page: PublicPage }) {
  const tr = useTr();
  const t = page.totals;
  const available = t.opening_funds_minor + t.contributions_minor + t.refunds_received_minor + t.reversals_in_minor;
  const otherOut = t.refunds_paid_minor + t.reversals_out_minor;
  const parts = [
    { key: "spent", label: tr("Spent", "Imetumika"), value: t.expenses_minor, color: "var(--color-data-out)" },
    { key: "charges", label: tr("Charges", "Gharama"), value: t.charges_minor, color: "var(--color-data-charge)" },
    ...(otherOut > 0 ? [{ key: "refunds", label: tr("Refunds", "Marejesho"), value: otherOut, color: "var(--color-stone-500)" }] : []),
  ];
  const latest = page.statement_checks.reconciled_periods[0];
  return (
    <PublicCard>
      <CardTitle>{tr("Funds so far", "Fedha hadi sasa")}</CardTitle>
      <p className="text-[15px] text-stone-600">
        {tr(
          `Received from ${t.contributions_count} contribution${t.contributions_count === 1 ? "" : "s"}`,
          `Kutoka kwa ${t.contributions_count === 1 ? "mchango 1" : `michango ${t.contributions_count}`}`,
        )}
      </p>
      <p className="font-display text-[2.9rem] leading-none font-semibold text-stone-900" aria-label={kes(t.contributions_minor)}>
        <CountUp value={t.contributions_minor} />
      </p>
      {available > 0 && (
        <>
          <div
            className="bar-grow mt-4 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-[var(--color-data-track)]"
            role="img"
            aria-label={`${parts.map((p) => `${p.label} ${kes(p.value)}`).join(", ")}, ${tr("remaining", "iliyobaki")} ${kes(t.remaining_minor)}`}
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
                {tr("Remaining", "Iliyobaki")}
              </dt>
              <dd className="text-[1.05rem] font-semibold tabular-nums">{kes(t.remaining_minor).replace("KES ", "")}</dd>
            </div>
          </dl>
        </>
      )}
      {(t.held_by_challenges_minor ?? 0) > 0 && (
        <p className="mt-3 text-[15px] text-stone-600">
          {tr(
            `Of what remains, ${kes(t.held_by_challenges_minor ?? 0)} is still held by challenges and will be handed over to the main fund.`,
            `Kati ya iliyobaki, ${kes(t.held_by_challenges_minor ?? 0)} bado ziko kwenye changamoto na zitakabidhiwa kwa mfuko mkuu.`,
          )}{" "}
          <Link to="/challenges">{tr("Challenges", "Changamoto")}</Link>
        </p>
      )}
      {page.opening_funds && (
        <p className="mt-3 text-[15px] text-stone-600">
          {tr(`Includes ${kes(page.opening_funds.amount_minor)} held before contributions opened:`, `Inajumuisha ${kes(page.opening_funds.amount_minor)} zilizokuwepo kabla ya michango kufunguliwa:`)}{" "}
          {page.opening_funds.explanation}
        </p>
      )}
      <p className="mt-3 text-[15px] text-stone-500">
        {page.last_updated && (
          <>
            {tr("Updated", "Imesasishwa")} {formatShortDateTime(page.last_updated)}
          </>
        )}
        {latest && (
          <>
            {" · "}
            <span className="font-medium text-sage-700">
              {tr("Checked to", "Imehakikiwa hadi")} {formatShortDate(latest.end)}
            </span>
          </>
        )}
      </p>
    </PublicCard>
  );
}

export function EntryRows({ entries, showTime = true }: { entries: PublicEntry[]; showTime?: boolean }) {
  const tr = useTr();
  const lang = useLang();
  return (
    <ul className="stagger divide-y divide-stone-100">
      {entries.map((e, i) => (
        <li key={`${e.at}-${i}`} className="flex items-start justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="font-medium break-words text-stone-900">{localiseName(e.label, lang)}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[15px] text-stone-500">
              <span>{showTime ? formatShortDateTime(e.at) : formatShortDate(e.at)}</span>
              {e.receipts.map((r, n) => (
                <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1">
                  <FileText className="size-4" aria-hidden />
                  {tr("Receipt", "Risiti")}
                  {e.receipts.length > 1 ? ` ${n + 1}` : ""}
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
  const tr = useTr();
  const [tab, setTab] = useState<"in" | "out">("in");
  const expenses = page.spending;
  const list = tab === "in" ? page.contributions : expenses;
  const shown = list.slice(0, 10);
  return (
    <PublicCard className="pb-3">
      <div role="tablist" aria-label={tr("Ledger", "Daftari")} className="relative mb-1 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-lg bg-white shadow-sm transition-transform duration-300 ease-out"
          style={{ transform: tab === "in" ? "translateX(0)" : "translateX(calc(100% + 4px))" }}
        />
        {(
          [
            ["in", tr("Contributions", "Michango"), page.contributions.length],
            ["out", tr("Expenses", "Matumizi"), expenses.length],
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
        <p className="py-6 text-center text-stone-600">
          {tab === "in" ? tr("No contributions recorded yet.", "Bado hakuna michango iliyorekodiwa.") : tr("Nothing has been spent yet.", "Bado hakuna kilichotumika.")}
        </p>
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
          {tr(`See all ${list.length}`, `Tazama zote ${list.length}`)}
        </Link>
      )}
      {!page.fundraiser.show_contribution_amounts && tab === "in" && (
        <p className="pb-2 text-[15px] text-stone-500">
          {tr("The family has chosen to show names only. The total above includes every contribution.", "Familia imeamua kuonyesha majina pekee. Jumla iliyo juu inajumuisha kila mchango.")}
        </p>
      )}
    </PublicCard>
  );
}

/** The calm first state, before anything has been recorded. */
export function DayOneCard({ page }: { page: PublicPage }) {
  const tr = useTr();
  const start = page.fundraiser.start_date;
  return (
    <PublicCard>
      <CardTitle>
        {start
          ? tr(`Contributions opened on ${formatNairobiLongDate(start).replace(/^\w+, /, "")}`, `Michango ilifunguliwa tarehe ${formatNairobiLongDate(start).replace(/^\w+, /, "")}`)
          : tr("Contributions are open", "Michango imefunguliwa")}
      </CardTitle>
      <p className="leading-relaxed text-stone-700">
        {tr(
          "Every contribution and every expense will be listed here, so you can see where the money goes. Statement checks will be marked as they are completed.",
          "Kila mchango na kila matumizi yataorodheshwa hapa, ili uone jinsi pesa zinavyotumika. Uhakiki wa taarifa za M-Pesa utaonyeshwa ukikamilika.",
        )}
      </p>
      <ShareButton page={page} className="mt-4" label={tr("Share with family on WhatsApp", "Shiriki na familia kwenye WhatsApp")} />
    </PublicCard>
  );
}

export function ShareButton({ page, className, label }: { page: PublicPage; className?: string; label?: string }) {
  const tr = useTr();
  const lang = useLang();
  return (
    <button
      type="button"
      onClick={() => void sharePage(page, lang)}
      className={clsx(
        "press flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2e2338] px-4 text-[16px] font-semibold text-white hover:bg-[#1e1625] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-600",
        className,
      )}
    >
      <Share2 className="size-5" aria-hidden />
      {label ?? tr("Share on WhatsApp", "Shiriki kwenye WhatsApp")}
    </button>
  );
}

/** How the money is checked, in plain words, with a status pill. */
export function ChecksCard({ page }: { page: PublicPage }) {
  const tr = useTr();
  const latest = page.statement_checks.reconciled_periods[0];
  const { matched_count, not_matched_count } = page.statement_checks;
  return (
    <PublicCard>
      <CardTitle>{tr("How the money is checked", "Jinsi pesa zinavyohakikiwa")}</CardTitle>
      <span
        className={clsx(
          "inline-flex rounded-full px-3 py-1 text-[15px] font-medium",
          latest ? "bg-sage-50 text-sage-800 ring-1 ring-sage-200" : "bg-stone-100 text-stone-700 ring-1 ring-stone-200",
        )}
      >
        {latest
          ? tr(`Checked up to ${formatShortDate(latest.end)}`, `Imehakikiwa hadi ${formatShortDate(latest.end)}`)
          : tr("Checks will be marked here as they are completed", "Uhakiki utaonyeshwa hapa ukikamilika")}
      </span>
      <p className="mt-3 leading-relaxed text-stone-700">
        {tr(
          "The organisers compare this page against the M-Pesa statement and mark each period once it matches.",
          "Waandalizi hulinganisha ukurasa huu na taarifa ya M-Pesa, na kuweka alama kila kipindi kinapolingana.",
        )}
        {matched_count + not_matched_count > 0 &&
          tr(
            ` So far ${matched_count} of ${matched_count + not_matched_count} M-Pesa entries are matched.`,
            ` Hadi sasa, rekodi ${matched_count} kati ya ${matched_count + not_matched_count} za M-Pesa zimelingana.`,
          )}
      </p>
      <p className="mt-2 text-[15px] text-stone-500">
        {tr("This check is done by the organisers. It is not a confirmation from Safaricom.", "Uhakiki huu hufanywa na waandalizi. Si uthibitisho kutoka Safaricom.")}
      </p>
    </PublicCard>
  );
}

export function OrganisersCard({ page }: { page: PublicPage }) {
  const tr = useTr();
  const organisers = page.fundraiser.organisers;
  if (organisers.length === 0) return null;
  return (
    <PublicCard>
      <CardTitle>{tr("Organised by", "Waandalizi")}</CardTitle>
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
                aria-label={tr(`Call ${o.name}`, `Piga simu ${o.name}`)}
              >
                <Phone className="size-4" aria-hidden /> {tr("Call", "Piga simu")}
              </a>
            )}
          </li>
        ))}
      </ul>
    </PublicCard>
  );
}

export function SpreadCard({ page }: { page: PublicPage }) {
  const tr = useTr();
  return (
    <PublicCard>
      <CardTitle>{tr("Help spread the word", "Saidia kueneza habari")}</CardTitle>
      <ShareButton page={page} />
      <p className="mt-3 text-center text-[15px] text-stone-600">
        {tr("Already contributed?", "Umeshachangia?")} <Link to="/check">{tr("Check that it arrived", "Hakiki kama umefika")}</Link>
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
