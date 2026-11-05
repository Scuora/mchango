import { ArrowRight, CircleHelp, Copy, MapPin, Share2, TrendingUp, Trophy } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { ApiError, api } from "@/lib/api";
import { coordinatesIn, directionsLink } from "@/lib/maps";
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
  LatestUpdate,
  LedgerCard,
  OrganisersCard,
  PageHeader,
  PublicCard,
  CardTitle,
  SpreadCard,
  kes,
} from "./parts";
import { MemorialHero } from "./MemorialHero";
import { usePublicPage } from "./PublicLayout";
import { langPath, localiseName, useLang, useTr, type Lang } from "./i18n";
import { Linked } from "./linked";
import { Sparkline, dailySeries } from "./Sparkline";
import { copyText, publicLink } from "./share";

/** A way into the Trends page, with a glance at the running total. */
function TrendsLink({ page }: { page: PublicPage }) {
  const tr = useTr();
  const today = todayNairobi();
  const first = page.contributions[page.contributions.length - 1]?.date ?? page.fundraiser.start_date ?? today;
  const values = useMemo(() => dailySeries(page.contributions, [first, daysAgoNairobi(29)].sort()[1], today, { running: true }), [page.contributions, first, today]);
  return (
    <Link
      to="/trends"
      data-reveal
      className="group flex items-center gap-4 rounded-[20px] border border-[rgb(27_25_23/0.09)] bg-white px-5 py-4 text-stone-900 no-underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-600"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ochre-100 text-ochre-800 transition-transform duration-300 group-hover:scale-105">
        <TrendingUp className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[1.35rem] leading-tight font-semibold">{tr("See the trends", "Tazama mwenendo")}</span>
        <span className="mt-0.5 block text-[15px] text-stone-600">{tr("How giving and spending have moved, day by day", "Jinsi michango na matumizi yalivyokwenda, siku kwa siku")}</span>
      </span>
      {page.contributions.length > 0 && <Sparkline values={values} width={110} height={40} className="hidden shrink-0 sm:block" />}
      <ArrowRight className="size-5 shrink-0 text-stone-400 transition-all duration-300 group-hover:translate-x-1 group-hover:text-plum-700" aria-hidden />
    </Link>
  );
}

/** A way into the Challenges page while any are open. */
function ChallengesLink({ page }: { page: PublicPage }) {
  const tr = useTr();
  const open = (page.challenges ?? []).filter((c) => c.status === "active");
  if (open.length === 0) return null;
  const raised = (page.challenges ?? []).reduce((sum, c) => sum + c.raised_minor, 0);
  const title = open.length === 1 ? tr(open[0].name, open[0].name_sw || open[0].name) : tr(`${open.length} challenges are on`, `Changamoto ${open.length} zinaendelea`);
  return (
    <Link
      to="/challenges"
      data-reveal
      className="group flex items-center gap-4 rounded-[20px] border border-[rgb(27_25_23/0.09)] bg-white px-5 py-4 text-stone-900 no-underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-600"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ochre-100 text-ochre-800 transition-transform duration-300 group-hover:scale-105">
        <Trophy className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold tracking-[0.14em] text-ochre-800 uppercase">{tr("Challenge", "Changamoto")}</span>
        <span className="challenge-name block text-[1.15rem] leading-snug">{title}</span>
        <span className="mt-0.5 block text-[15px] text-stone-600">
          {tr(`${kes(raised)} raised through challenges so far. Join in!`, `${kes(raised)} zimechangwa kupitia changamoto hadi sasa. Jiunge!`)}
        </span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-stone-400 transition-all duration-300 group-hover:translate-x-1 group-hover:text-plum-700" aria-hidden />
    </Link>
  );
}

/** Remember him and the two funeral days, give, then see where the money went. */
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
      <ChallengesLink page={page} />
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
      <MemorialHero page={page} />
      {hasAside ? (
        <div className="mx-auto max-w-6xl px-4 md:grid md:grid-cols-[minmax(320px,380px)_1fr] md:items-start md:gap-6 md:px-6">
          <aside className="mt-6 space-y-4 md:sticky md:top-16">
            <GiveCard page={page} />
            <FuneralCard page={page} />
          </aside>
          <div className="mt-4 space-y-4 md:mt-6">{main}</div>
        </div>
      ) : (
        <div className="mx-auto mt-6 max-w-3xl space-y-4 px-4 md:px-6">
          {main}
        </div>
      )}
    </>
  );
}

export function announcementText(page: PublicPage, a: PublicAnnouncement, lang: Lang = "en"): string {
  const sw = lang === "sw";
  const name = page.fundraiser.memorial_name;
  const { place, map_url } = page.fundraiser.funeral;
  const coords = coordinatesIn(map_url);
  const where = place ? (sw ? ` ya kufika ${place}` : ` to ${place}`) : "";
  const directions = a.pinned && (coords || map_url) ? `${sw ? "Maelekezo" : "Directions"}${where}: ${coords ? directionsLink(coords) : map_url}` : "";
  const title = (sw && a.title_sw) || a.title;
  const body = (sw && a.body_sw) || a.body;
  const heading = name ? `*${sw ? "Kwa kumbukumbu ya" : "In loving memory of"} ${name}*` : `*${page.fundraiser.name}*`;
  return [heading, "", `*${title}*`, body, directions, "", publicLink(langPath(`/updates/${a.id}`, lang))]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
}

export function UpdatesPage() {
  const page = usePublicPage();
  const tr = useTr();
  const lang = useLang();
  return (
    <>
      <PageHeader title={tr("Updates", "Taarifa")}>{tr("Funeral arrangements and news from the family meetings.", "Mipango ya mazishi na habari kutoka kwenye vikao vya familia.")}</PageHeader>
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 md:px-6">
        {page.announcements.length === 0 && (
          <PublicCard>
            <p className="text-stone-700">
              {tr("There are no updates yet. Arrangements will be posted here as they are agreed.", "Bado hakuna taarifa. Mipango itawekwa hapa itakapokubaliwa.")}
            </p>
          </PublicCard>
        )}
        {page.announcements.map((a) => {
          const title = tr(a.title, a.title_sw || a.title);
          const body = tr(a.body, a.body_sw || a.body);
          return (
          <PublicCard key={a.id}>
            <p className="mb-1 text-[13px] font-semibold tracking-[0.14em] text-stone-500 uppercase">
              {a.pinned ? tr("Important · ", "Muhimu · ") : ""}
              {formatNairobiLongDate(a.published_at)}
            </p>
            <h2 className="font-display text-[1.7rem] leading-tight font-semibold text-stone-900">
              <Link to={`/updates/${a.id}`} className="text-stone-900 no-underline hover:underline">
                {title}
              </Link>
            </h2>
            {body && (
              <p className="mt-3 leading-relaxed whitespace-pre-line text-stone-800">
                <Linked text={body} />
              </p>
            )}
            {a.pinned && (page.fundraiser.funeral.place || page.fundraiser.funeral.map_url) && (
              <Link to={`/updates/${a.id}`} className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold">
                <MapPin className="size-4" aria-hidden /> {tr("Place of burial and directions", "Mahali pa mazishi na maelekezo")}
              </Link>
            )}
            <CopyForWhatsApp text={announcementText(page, a, lang)} />
          </PublicCard>
          );
        })}
      </div>
    </>
  );
}

export function CopyForWhatsApp({ text }: { text: string }) {
  const tr = useTr();
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => void copyText(text).then((ok) => ok && (setCopied(true), window.setTimeout(() => setCopied(false), 2000)))}
        className="flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-[15px] font-medium text-stone-800 hover:bg-stone-50"
      >
        <Copy className="size-4" aria-hidden />
        {copied ? tr("Copied", "Imenakiliwa") : tr("Copy for WhatsApp", "Nakili kwa WhatsApp")}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-[15px] font-medium text-stone-800 no-underline hover:bg-stone-50 hover:no-underline"
      >
        <Share2 className="size-4" aria-hidden /> {tr("Open WhatsApp", "Fungua WhatsApp")}
      </a>
    </div>
  );
}

export function ExpensesPage() {
  const page = usePublicPage();
  const tr = useTr();
  const t = page.totals;
  const otherOut = [...page.refunds_and_reversals];
  // The family's share counts as received from the family, so only other pledges are "not yet received".
  const pledgedOutstanding = page.fundraiser.pledges.friends.outstanding_minor;
  return (
    <>
      <PageHeader title={tr("Expenses", "Matumizi")}>
        {tr(
          `Every shilling spent, with receipts where they have been published. ${kes(t.expenses_minor + t.charges_minor)} spent so far`,
          `Kila shilingi iliyotumika, pamoja na risiti zilipochapishwa. ${kes(t.expenses_minor + t.charges_minor)} zimetumika hadi sasa`,
        )}
        {t.charges_minor > 0 && tr(`, including ${kes(t.charges_minor)} in M-Pesa transaction costs`, `, zikiwemo ${kes(t.charges_minor)} za gharama za miamala ya M-Pesa`)}.
      </PageHeader>
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 md:px-6">
        <PublicCard>
          <CardTitle>{tr("Funeral expenses", "Matumizi ya mazishi")}</CardTitle>
          {page.spending.length === 0 ? (
            <p className="text-stone-600">{tr("Nothing has been spent yet.", "Bado hakuna kilichotumika.")}</p>
          ) : (
            <EntryRows entries={page.spending} showTime={false} />
          )}
        </PublicCard>
        {page.charges.length > 0 && (
          <PublicCard>
            <CardTitle>{tr("M-Pesa transaction costs", "Gharama za miamala ya M-Pesa")}</CardTitle>
            <p className="-mt-1 mb-2 text-[15px] text-stone-600">
              {tr("What M-Pesa charged to send the money above. They count as spending.", "Kile M-Pesa ilitoza kutuma pesa zilizo hapo juu. Zinahesabiwa kama matumizi.")}
            </p>
            <EntryRows entries={page.charges} showTime={false} />
          </PublicCard>
        )}
        {otherOut.length > 0 && (
          <PublicCard>
            <CardTitle>{tr("Refunds and reversals", "Marejesho na miamala iliyobatilishwa")}</CardTitle>
            <EntryRows entries={otherOut} showTime={false} />
          </PublicCard>
        )}
        {page.promises && (page.promises.unpaid_bills.length > 0 || pledgedOutstanding > 0) && (
          <PublicCard>
            <CardTitle>{tr("Not yet money", "Bado si pesa")}</CardTitle>
            {page.promises.unpaid_bills.length > 0 && (
              <>
                <p className="text-stone-700">
                  {tr(
                    `Bills agreed but not yet paid (${kes(page.promises.unpaid_bills_minor)}). They are not counted as spent.`,
                    `Bili zilizokubaliwa lakini bado hazijalipwa (${kes(page.promises.unpaid_bills_minor)}). Hazihesabiwi kama zimetumika.`,
                  )}
                </p>
                <EntryRows entries={page.promises.unpaid_bills} showTime={false} />
              </>
            )}
            {pledgedOutstanding > 0 && (
              <p className="mt-2 text-stone-700">
                {tr(
                  `${kes(pledgedOutstanding)} has been pledged but not yet received. It is not counted as received.`,
                  `${kes(pledgedOutstanding)} zimeahidiwa lakini bado hazijapokelewa. Hazihesabiwi kama zimepokelewa.`,
                )}
              </p>
            )}
          </PublicCard>
        )}
      </div>
    </>
  );
}

/** The check's error messages come from the server in English; these are the Kiswahili ones. */
function checkErrorSw(e: unknown): string {
  if (e instanceof ApiError && e.status === 429) return "Umehakiki namba kadhaa kwa muda mfupi. Tafadhali subiri dakika chache kisha ujaribu tena.";
  if (e instanceof ApiError && e.field === "code")
    return e.message.startsWith("Paste only")
      ? "Bandika namba ya M-Pesa au ujumbe wa uthibitisho pekee."
      : "Weka namba ya muamala kutoka kwenye ujumbe wako wa M-Pesa, kwa mfano TK3AB12CD4.";
  return "Imeshindikana kuhakiki kwa sasa. Tafadhali jaribu tena.";
}

export function CheckPage() {
  const page = usePublicPage();
  const tr = useTr();
  const lang = useLang();
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
      setError(lang === "sw" ? checkErrorSw(e) : e instanceof ApiError ? e.message : "Could not check right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const found = result?.contribution;
  return (
    <>
      <PageHeader title={tr("Check my contribution", "Hakiki mchango wangu")}>
        {tr("Enter the code from your M-Pesa confirmation message (for example", "Weka namba ya muamala kutoka kwenye ujumbe wa M-Pesa (kwa mfano")}{" "}
        <span className="font-medium">TK3AB12CD4</span>
        {tr("), or paste the whole message.", "), au bandika ujumbe wote.")}
      </PageHeader>
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 md:px-6">
        <PublicCard>
          <form onSubmit={check} className="space-y-3" noValidate>
            <label htmlFor="check-code" className="block font-medium text-stone-800">
              {tr("M-Pesa code or message", "Namba ya M-Pesa au ujumbe")}
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
              placeholder={tr("e.g. TK3AB12CD4", "mf. TK3AB12CD4")}
            />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="press flex min-h-12 w-full items-center justify-center rounded-full bg-[#0b0a09] px-6 text-[16px] font-semibold text-white hover:bg-[#2a2724] disabled:opacity-55 sm:w-auto"
            >
              {busy ? tr("Checking…", "Inahakiki…") : tr("Check", "Hakiki")}
            </button>
            <p className="text-[15px] text-stone-500">
              {tr("Your code is only used for this check. Codes are never shown on this site.", "Namba yako inatumika kwa uhakiki huu pekee. Namba za muamala haziwekwi wazi kwenye tovuti hii.")}
            </p>
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
              {tr("Received, thank you", "Umepokelewa, asante")}
            </p>
            <dl className="mt-3 space-y-1.5 text-[16px]">
              <div className="flex justify-between gap-4">
                <dt className="text-stone-600">{tr("Amount", "Kiasi")}</dt>
                <dd className="font-semibold">{formatKes(found.amount_minor)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-stone-600">{tr("When", "Lini")}</dt>
                <dd>{formatNairobi(found.at)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-stone-600">{tr("Listed as", "Imeorodheshwa kama")}</dt>
                <dd className="text-right">{localiseName(found.listed_as, lang)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-stone-600">{tr("Statement check", "Uhakiki wa taarifa")}</dt>
                <dd className="text-right">
                  {found.matched_to_statement
                    ? tr("Matched to uploaded statement", "Imelingana na taarifa ya M-Pesa iliyopakiwa")
                    : tr("Recorded; will be checked against the next statement", "Imerekodiwa; itahakikiwa kwenye taarifa ijayo")}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[15px] text-stone-600">
              {tr("Would you like to be listed differently? Contact one of the organisers", "Ungependa kuorodheshwa kwa jina tofauti? Wasiliana na mmoja wa waandalizi")}
              {page.fundraiser.organisers[0] ? ` (${page.fundraiser.organisers[0].name})` : ""}.
            </p>
          </PublicCard>
        )}

        {result && !found && (
          <PublicCard>
            <p className="flex items-center gap-2 font-display text-[1.6rem] font-semibold text-stone-900">
              <CircleHelp className="size-6 text-stone-500" aria-hidden /> {tr("Not found yet", "Bado haujapatikana")}
            </p>
            <p className="mt-2 leading-relaxed text-stone-700">
              {tr(
                "Contributions are recorded by the treasurer as the M-Pesa messages arrive, so a recent one may not be listed yet. Please check again later. If it has been more than a day, contact the organisers",
                "Michango hurekodiwa na mweka hazina kadri jumbe za M-Pesa zinavyofika, kwa hivyo mchango wa hivi karibuni huenda bado haujaorodheshwa. Tafadhali hakiki tena baadaye. Ikiwa imepita zaidi ya siku moja, wasiliana na waandalizi",
              )}
              {page.fundraiser.organisers[0]?.phone ? tr(` on ${page.fundraiser.organisers[0].phone}`, ` kupitia ${page.fundraiser.organisers[0].phone}`) : ""}.
            </p>
            <p className="mt-2 text-[15px] text-stone-500">
              {tr("Checked on", "Imehakikiwa tarehe")} {formatShortDate(new Date().toISOString())}.
            </p>
          </PublicCard>
        )}
      </div>
    </>
  );
}
