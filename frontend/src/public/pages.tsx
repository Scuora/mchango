import { ArrowRight, CircleHelp, Copy, Share2, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { ApiError, api } from "@/lib/api";
import { formatKes } from "@/lib/money";
import { daysAgoNairobi, formatNairobi, formatNairobiLongDate, formatShortDate, todayNairobi } from "@/lib/time";
import type { CheckResult, PublicAnnouncement, PublicPage } from "@/lib/types";
import {
  ChecksCard,
  DayOneCard,
  EntryRows,
  FuneralCard,
  FundsCard,
  GiveCard,
  GoalCard,
  Hero,
  LatestUpdate,
  LedgerCard,
  OrganisersCard,
  PageHeader,
  PublicCard,
  CardTitle,
  SpreadCard,
  kes,
} from "./parts";
import { usePublicPage } from "./PublicLayout";
import { Sparkline, dailySeries } from "./Sparkline";
import { copyText, publicLink } from "./share";

/** A way into the Trends page, with a glance at the running total. */
function TrendsLink({ page }: { page: PublicPage }) {
  const today = todayNairobi();
  const first = page.contributions[page.contributions.length - 1]?.date ?? page.fundraiser.start_date ?? today;
  const values = useMemo(() => dailySeries(page.contributions, [first, daysAgoNairobi(29)].sort()[1], today, { running: true }), [page.contributions, first, today]);
  return (
    <Link
      to="/trends"
      data-reveal
      className="group lift flex items-center gap-4 rounded-2xl border border-stone-200 bg-white px-5 py-4 text-stone-900 no-underline shadow-sm hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-600"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ochre-100 text-ochre-800 transition-transform duration-300 group-hover:scale-105">
        <TrendingUp className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[1.35rem] leading-tight font-semibold">See the trends</span>
        <span className="mt-0.5 block text-[15px] text-stone-600">How giving and spending have moved, day by day</span>
      </span>
      {page.contributions.length > 0 && <Sparkline values={values} width={110} height={40} className="hidden shrink-0 sm:block" />}
      <ArrowRight className="size-5 shrink-0 text-stone-400 transition-all duration-300 group-hover:translate-x-1 group-hover:text-plum-700" aria-hidden />
    </Link>
  );
}

/** Remember him, give, then see where the money went. */
export function HomePage() {
  const page = usePublicPage();
  const { hash } = useLocation();
  const nothingYet = page.contributions.length === 0 && page.spending.length === 0 && page.charges.length === 0;
  const f = page.fundraiser;
  // The side column holds giving and funeral details; without them the page is one centred column.
  const hasAside = Boolean(f.giving || f.funeral.when || f.funeral.place || f.organisers.length > 0);

  useEffect(() => {
    if (hash === "#give") document.getElementById("give")?.scrollIntoView({ block: "start" });
  }, [hash]);

  const main = (
    <>
      <LatestUpdate page={page} />
      <TrendsLink page={page} />
      <GoalCard page={page} />
      {nothingYet ? (
        <DayOneCard page={page} />
      ) : (
        <>
          <FundsCard page={page} />
          <LedgerCard page={page} />
        </>
      )}
      <ChecksCard page={page} />
      <OrganisersCard page={page} />
      <SpreadCard page={page} />
    </>
  );

  return (
    <>
      <Hero page={page} />
      {hasAside ? (
        <div className="mx-auto max-w-6xl px-4 md:grid md:grid-cols-[minmax(320px,380px)_1fr] md:items-start md:gap-6 md:px-6">
          <aside className="relative z-10 -mt-12 space-y-4 md:sticky md:top-16 md:mt-6">
            <GiveCard page={page} />
            <FuneralCard page={page} />
          </aside>
          <div className="mt-4 space-y-4 md:mt-6">{main}</div>
        </div>
      ) : (
        <div className="relative z-10 mx-auto -mt-12 max-w-3xl space-y-4 px-4 md:mt-6 md:px-6">{main}</div>
      )}
    </>
  );
}

function announcementText(page: PublicPage, a: PublicAnnouncement): string {
  const name = page.fundraiser.memorial_name;
  return [name ? `*In loving memory of ${name}*` : `*${page.fundraiser.name}*`, "", `*${a.title}*`, a.body, "", publicLink("/updates")]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
}

export function UpdatesPage() {
  const page = usePublicPage();
  return (
    <>
      <PageHeader title="Updates">Funeral arrangements and news from the family meetings.</PageHeader>
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 md:px-6">
        {page.announcements.length === 0 && (
          <PublicCard>
            <p className="text-stone-700">There are no updates yet. Arrangements will be posted here as they are agreed.</p>
          </PublicCard>
        )}
        {page.announcements.map((a) => (
          <PublicCard key={a.id} className={a.pinned ? "glow-pulse border-ochre-200 bg-[#fffaf0]" : undefined}>
            <p className="mb-1 text-[13px] font-semibold tracking-[0.14em] text-stone-500 uppercase">
              {a.pinned ? "Important · " : ""}
              {formatNairobiLongDate(a.published_at)}
            </p>
            <h2 className="font-display text-[1.7rem] leading-tight font-semibold text-stone-900">{a.title}</h2>
            {a.body && <p className="mt-3 leading-relaxed whitespace-pre-line text-stone-800">{a.body}</p>}
            <CopyForWhatsApp text={announcementText(page, a)} />
          </PublicCard>
        ))}
      </div>
    </>
  );
}

function CopyForWhatsApp({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => void copyText(text).then((ok) => ok && (setCopied(true), window.setTimeout(() => setCopied(false), 2000)))}
        className="flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-[15px] font-medium text-stone-800 hover:bg-stone-50"
      >
        <Copy className="size-4" aria-hidden />
        {copied ? "Copied" : "Copy for WhatsApp"}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-[15px] font-medium text-stone-800 no-underline hover:bg-stone-50 hover:no-underline"
      >
        <Share2 className="size-4" aria-hidden /> Open WhatsApp
      </a>
    </div>
  );
}

export function ExpensesPage() {
  const page = usePublicPage();
  const t = page.totals;
  const otherOut = [...page.refunds_and_reversals];
  return (
    <>
      <PageHeader title="Expenses">
        Every shilling spent, with receipts where they have been published. {kes(t.expenses_minor)} spent so far
        {t.charges_minor > 0 && <>, plus {kes(t.charges_minor)} in M-Pesa charges</>}.
      </PageHeader>
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 md:px-6">
        <PublicCard>
          <CardTitle>Funeral expenses</CardTitle>
          {page.spending.length === 0 ? <p className="text-stone-600">Nothing has been spent yet.</p> : <EntryRows entries={page.spending} showTime={false} />}
        </PublicCard>
        {page.charges.length > 0 && (
          <PublicCard>
            <CardTitle>M-Pesa charges</CardTitle>
            <EntryRows entries={page.charges} showTime={false} />
          </PublicCard>
        )}
        {otherOut.length > 0 && (
          <PublicCard>
            <CardTitle>Refunds and reversals</CardTitle>
            <EntryRows entries={otherOut} showTime={false} />
          </PublicCard>
        )}
        {page.promises && (page.promises.unpaid_bills.length > 0 || page.promises.pledged_outstanding_minor > 0) && (
          <PublicCard>
            <CardTitle>Not yet money</CardTitle>
            {page.promises.unpaid_bills.length > 0 && (
              <>
                <p className="text-stone-700">Bills agreed but not yet paid ({kes(page.promises.unpaid_bills_minor)}). They are not counted as spent.</p>
                <EntryRows entries={page.promises.unpaid_bills} showTime={false} />
              </>
            )}
            {page.promises.pledged_outstanding_minor > 0 && (
              <p className="mt-2 text-stone-700">{kes(page.promises.pledged_outstanding_minor)} has been pledged but not yet received. It is not counted as received.</p>
            )}
          </PublicCard>
        )}
      </div>
    </>
  );
}

export function CheckPage() {
  const page = usePublicPage();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.post<CheckResult>("/api/public/check", { code }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not check right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const found = result?.contribution;
  return (
    <>
      <PageHeader title="Check my contribution">
        Enter the code from your M-Pesa confirmation message (for example <span className="font-medium">TK3AB12CD4</span>), or paste the whole message.
      </PageHeader>
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 md:px-6">
        <PublicCard>
          <form onSubmit={check} className="space-y-3" noValidate>
            <label htmlFor="check-code" className="block font-medium text-stone-800">
              M-Pesa code or message
            </label>
            <textarea
              id="check-code"
              rows={2}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-[18px] tracking-wide focus-visible:outline-2 focus-visible:outline-plum-600"
              placeholder="e.g. TK3AB12CD4"
            />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="press flex min-h-12 w-full items-center justify-center rounded-xl bg-[#2e2338] px-4 text-[16px] font-semibold text-white hover:bg-[#1e1625] disabled:opacity-55 sm:w-auto"
            >
              {busy ? "Checking…" : "Check"}
            </button>
            <p className="text-[15px] text-stone-500">Your code is only used for this check. Codes are never shown on this site.</p>
          </form>
        </PublicCard>

        {error && <p className="rounded-xl border border-brick-200 bg-brick-50 px-4 py-3 text-brick-900" role="alert">{error}</p>}

        {result && found && (
          <PublicCard className="border-sage-200 bg-sage-50/60" >
            <p className="flex items-center gap-2 font-display text-[1.7rem] font-semibold text-sage-900">
              <svg viewBox="0 0 24 24" className="draw-check size-8 text-sage-700" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" pathLength={1} />
                <path d="m7.5 12.5 3 3 6-6.5" pathLength={1} />
              </svg>
              Received, thank you
            </p>
            <dl className="mt-3 space-y-1.5 text-[16px]">
              <div className="flex justify-between gap-4">
                <dt className="text-stone-600">Amount</dt>
                <dd className="font-semibold">{formatKes(found.amount_minor)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-stone-600">When</dt>
                <dd>{formatNairobi(found.at)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-stone-600">Listed as</dt>
                <dd className="text-right">{found.listed_as}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-stone-600">Statement check</dt>
                <dd className="text-right">{found.matched_to_statement ? "Matched to uploaded statement" : "Recorded; will be checked against the next statement"}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[15px] text-stone-600">
              Would you like to be listed differently? Contact one of the organisers{page.fundraiser.organisers[0] ? ` (${page.fundraiser.organisers[0].name})` : ""}.
            </p>
          </PublicCard>
        )}

        {result && !found && (
          <PublicCard>
            <p className="flex items-center gap-2 font-display text-[1.6rem] font-semibold text-stone-900">
              <CircleHelp className="size-6 text-stone-500" aria-hidden /> Not found yet
            </p>
            <p className="mt-2 leading-relaxed text-stone-700">
              Contributions are recorded by the treasurer as the M-Pesa messages arrive, so a recent one may not be listed yet. Please check again later. If it
              has been more than a day, contact the organisers{page.fundraiser.organisers[0]?.phone ? ` on ${page.fundraiser.organisers[0].phone}` : ""}.
            </p>
            <p className="mt-2 text-[15px] text-stone-500">Checked on {formatShortDate(new Date().toISOString())}.</p>
          </PublicCard>
        )}
      </div>
    </>
  );
}
