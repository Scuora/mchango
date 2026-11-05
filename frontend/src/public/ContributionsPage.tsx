// Contributions, made for a long list. A summary up top; a search and sort bar
// that stays in reach; days (or letters) as headings that stay pinned while
// their rows scroll past, each with its own count and total; and rows drawn in
// chunks as the visitor scrolls, so a thousand names stay quick on a phone.

import { clsx } from "clsx";
import { ArrowUp, HandHeart, Search, Trophy, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { CountUp } from "@/components/CountUp";
import { formatKesShort } from "@/lib/money";
import { daysAgoNairobi, formatDayHeading, formatNairobiTime, formatShortDateTime, todayNairobi } from "@/lib/time";
import type { PublicEntry } from "@/lib/types";
import { localiseName, useLang, useTr } from "./i18n";
import { PageHeader } from "./parts";
import { Sparkline, dailySeries } from "./Sparkline";
import { usePublicPage } from "./PublicLayout";

const CHUNK = 60;
const kes = formatKesShort;
const count = (n: number) => n.toLocaleString("en-GB");
const plural = (n: number, word: string) => `${count(n)} ${word}${n === 1 ? "" : "s"}`;
/** Kiswahili puts the number after the noun, with its own plural: "michango 12", "mchango 1". */
const pluralSw = (n: number, one: string, many: string) => (n === 1 ? `${one} 1` : `${many} ${count(n)}`);

/** "12 contributions" / "michango 12", in the visitor's language. */
function useCounts() {
  const tr = useTr();
  return {
    contributions: (n: number) => tr(plural(n, "contribution"), pluralSw(n, "mchango", "michango")),
    pledges: (n: number) => tr(plural(n, "pledge"), pluralSw(n, "ahadi", "ahadi")),
    word: (n: number) => tr(n === 1 ? "contribution" : "contributions", n === 1 ? "mchango" : "michango"),
  };
}

type Sort = "newest" | "oldest" | "largest" | "name";

interface Row extends PublicEntry {
  /** Position in the published list, stable across searches. */
  key: number;
  folded: string;
  anonymous: boolean;
}

interface Group {
  key: string;
  title: ReactNode;
  subtitle?: string;
  rows: Row[];
  count: number;
  sum: number | null;
}

/** Lower case without accents, so "wanjiru" finds "Wanjirũ". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function initials(name: string): string {
  const letters = name.split(/\s+/).map((w) => w.match(/\p{L}/u)?.[0]);
  return letters.filter(Boolean).slice(0, 2).join("").toUpperCase() || "•";
}

const TONES = [
  "bg-plum-100 text-plum-800",
  "bg-ochre-100 text-ochre-900",
  "bg-sage-100 text-sage-800",
  "bg-brick-100 text-brick-800",
  "bg-stone-200 text-stone-700",
];

function tone(name: string): string {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

function Avatar({ row }: { row: Row }) {
  if (row.anonymous) {
    return (
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-500" aria-hidden>
        <HandHeart className="size-5" />
      </span>
    );
  }
  return (
    <span className={clsx("grid size-10 shrink-0 place-items-center rounded-full text-[14px] font-semibold tracking-wide", tone(row.label))} aria-hidden>
      {initials(row.label)}
    </span>
  );
}

/** The name with the searched part marked. */
function Highlight({ text, folded, query }: { text: string; folded: string; query: string }) {
  const at = query ? folded.indexOf(query) : -1;
  if (at < 0 || folded.length !== text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded bg-ochre-100 px-0.5 text-inherit">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}

/** A figure with a small "KES" before it, so large sums fit a narrow tile. */
function Money({ minor, sign = "" }: { minor: number; sign?: string }) {
  return (
    <>
      {sign}
      <span className="mr-1 text-[0.6em] font-medium text-stone-500">KES</span>
      {kes(minor).replace(/^KES\s/, "")}
    </>
  );
}

function Tile({ label, value, note, chart, className }: { label: string; value: ReactNode; note?: ReactNode; chart?: ReactNode; className?: string }) {
  return (
    <div data-reveal className={clsx("rounded-2xl border border-stone-200 bg-white p-4", className)}>
      <div className="flex min-h-8 items-start justify-between gap-2">
        <p className="text-[15px] text-stone-600">{label}</p>
        {chart}
      </div>
      <p className="mt-0.5 text-[clamp(1.2rem,5.4vw,1.6rem)] leading-tight font-semibold whitespace-nowrap text-stone-900 tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-[14px] text-stone-500">{note}</p>}
    </div>
  );
}

function SortControl({ sort, options, onChange }: { sort: Sort; options: (readonly [Sort, string])[]; onChange: (s: Sort) => void }) {
  const tr = useTr();
  const index = Math.max(0, options.findIndex(([value]) => value === sort));
  return (
    <div
      role="radiogroup"
      aria-label={tr("Sort contributions", "Panga michango")}
      className="relative grid shrink-0 rounded-xl bg-stone-200/70 p-1 text-[15px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-lg bg-white shadow-[0_2px_8px_-3px_rgb(46_35_56/0.35)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={sort === value}
          onClick={() => onChange(value)}
          className={clsx(
            "press relative z-10 min-h-10 cursor-pointer rounded-lg px-3 font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-plum-600",
            sort === value ? "text-plum-800" : "text-stone-600 hover:text-stone-900",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function BackToTop() {
  const tr = useTr();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 1400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Rendered on <body>: the page's entrance animation leaves a transform on an
  // ancestor, which would otherwise pin this "fixed" button to the page.
  return createPortal(
    <button
      type="button"
      aria-label={tr("Back to the top", "Rudi juu")}
      tabIndex={show ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
      className={clsx(
        "press fixed right-4 bottom-24 z-40 grid size-12 cursor-pointer place-items-center rounded-full bg-plum-800 text-white shadow-[0_12px_28px_-10px_rgb(46_35_56/0.6)] transition-all duration-300 hover:bg-plum-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-600 md:right-8 md:bottom-8",
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <ArrowUp className="size-5" aria-hidden />
    </button>,
    document.body,
  );
}

export function ContributionsPage() {
  const page = usePublicPage();
  const tr = useTr();
  const lang = useLang();
  const n = useCounts();
  const t = page.totals;
  const showAmounts = page.fundraiser.show_contribution_amounts;
  const anonymousLabel = page.fundraiser.anonymous_label;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [limit, setLimit] = useState(CHUNK);
  const [barHeight, setBarHeight] = useState(0);
  const deferred = fold(useDeferredValue(query).trim());
  const bar = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const challengeNames = new Map((page.challenges ?? []).map((c) => [c.id, tr(c.name, c.name_sw || c.name)]));
  const rows = useMemo<Row[]>(
    () => page.contributions.map((e, key) => ({ ...e, key, folded: fold(e.label), anonymous: e.label === anonymousLabel })),
    [page.contributions, anonymousLabel],
  );

  // The summary: today, the last seven days and a fortnight's line.
  const summary = useMemo(() => {
    const today = todayNairobi();
    const weekStart = daysAgoNairobi(6);
    const byDay = new Map<string, { count: number; sum: number }>();
    for (const r of rows) {
      const day = byDay.get(r.date) ?? { count: 0, sum: 0 };
      day.count += 1;
      day.sum += r.amount_minor ?? 0;
      byDay.set(r.date, day);
    }
    const first = rows.length ? rows[rows.length - 1].date : today;
    const line = dailySeries(rows, [first, daysAgoNairobi(13)].sort()[1], today);
    const week = rows.filter((r) => r.date >= weekStart);
    return {
      today: byDay.get(today) ?? { count: 0, sum: 0 },
      week: { count: week.length, sum: week.reduce((s, r) => s + (r.amount_minor ?? 0), 0) },
      latest: rows[0] ?? null,
      line,
    };
  }, [rows]);

  const filtered = useMemo(() => (deferred ? rows.filter((r) => r.folded.includes(deferred)) : rows), [rows, deferred]);
  const sorted = useMemo(() => {
    switch (sort) {
      case "newest":
        return filtered;
      case "oldest":
        return [...filtered].reverse();
      case "largest":
        return [...filtered].sort((a, b) => (b.amount_minor ?? 0) - (a.amount_minor ?? 0) || b.at.localeCompare(a.at));
      case "name":
        return [...filtered].sort((a, b) => Number(a.anonymous) - Number(b.anonymous) || a.label.localeCompare(b.label, "en-GB", { sensitivity: "base" }));
    }
  }, [filtered, sort]);
  const visible = sorted.slice(0, limit);

  // Days (or first letters) as groups; counts and totals cover the whole group, not just the rows drawn so far.
  const groups = useMemo<Group[]>(() => {
    if (sort === "largest") return [{ key: "all", title: null, rows: visible, count: sorted.length, sum: null }];
    const today = todayNairobi();
    const yesterday = daysAgoNairobi(1);
    const keyOf = (r: Row) => (sort === "name" ? (r.anonymous ? "~" : (r.folded.match(/\p{L}/u)?.[0]?.toUpperCase() ?? "#")) : r.date);
    const stats = new Map<string, { count: number; sum: number }>();
    for (const r of sorted) {
      const s = stats.get(keyOf(r)) ?? { count: 0, sum: 0 };
      s.count += 1;
      s.sum += r.amount_minor ?? 0;
      stats.set(keyOf(r), s);
    }
    const out: Group[] = [];
    for (const r of visible) {
      const key = keyOf(r);
      if (out[out.length - 1]?.key !== key) {
        const s = stats.get(key) ?? { count: 0, sum: 0 };
        const title =
          sort === "name"
            ? key === "~"
              ? localiseName(anonymousLabel, lang)
              : key
            : key === today
              ? tr("Today", "Leo")
              : key === yesterday
                ? tr("Yesterday", "Jana")
                : formatDayHeading(key);
        const subtitle = sort !== "name" && (key === today || key === yesterday) ? formatDayHeading(key) : undefined;
        out.push({ key, title, subtitle, rows: [], count: s.count, sum: showAmounts ? s.sum : null });
      }
      out[out.length - 1].rows.push(r);
    }
    return out;
  }, [sort, sorted, visible, anonymousLabel, showAmounts, lang]);

  // A new search or order starts from its first rows, with the list's top in view.
  useEffect(() => {
    setLimit(CHUNK);
    const top = list.current?.getBoundingClientRect().top;
    const offset = (window.innerWidth >= 768 ? 64 : 56) + (bar.current?.offsetHeight ?? 0);
    if (top !== undefined && top < offset) window.scrollTo({ top: window.scrollY + top - offset - 8 });
  }, [deferred, sort]);

  // The pinned day headings sit just under the pinned search bar.
  useEffect(() => {
    const node = bar.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setBarHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // More rows as the visitor nears the end of what is drawn.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || limit >= sorted.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setLimit((l) => l + CHUNK), { rootMargin: "900px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [limit, sorted.length]);

  const sortOptions: (readonly [Sort, string])[] = [
    ["newest", tr("Newest", "Mipya")],
    ["oldest", tr("Oldest", "Ya zamani")],
    ...(showAmounts ? [["largest", tr("Largest", "Mikubwa")] as const] : []),
    ["name", "A–Z"],
  ];
  const timeOnly = sort === "newest" || sort === "oldest";
  let drawn = 0;

  return (
    <>
      <PageHeader title={tr("Contributions", "Michango")}>
        {tr(
          "Thank you to everyone who has given. Every contribution is listed here as it is recorded.",
          "Asanteni nyote mliochangia. Kila mchango huorodheshwa hapa unaporekodiwa.",
        )}
      </PageHeader>
      <div
        className="mx-auto max-w-3xl px-4 pt-4 [--nav-h:3.5rem] md:px-6 md:[--nav-h:4rem]"
        style={{ "--bar-h": `${barHeight}px` } as CSSProperties}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile
            className="col-span-2 sm:col-span-1"
            label={tr("Received", "Zilizopokelewa")}
            value={
              <>
                <span className="mr-1 text-[0.6em] font-medium text-stone-500">KES</span>
                <CountUp value={t.contributions_minor} format={(minor) => kes(minor).replace(/^KES\s/, "")} />
              </>
            }
            note={tr(`from ${plural(t.contributions_count, "contribution")}`, `kutoka kwa ${n.contributions(t.contributions_count)}`)}
            chart={rows.length > 0 && <Sparkline values={summary.line} width={96} height={32} className="-mt-1 shrink-0" />}
          />
          <Tile
            label={tr("Today", "Leo")}
            value={summary.today.count === 0 ? "—" : showAmounts ? <Money minor={summary.today.sum} sign="+" /> : count(summary.today.count)}
            note={
              summary.today.count === 0
                ? summary.latest
                  ? `${tr("Latest", "Wa mwisho")} ${formatShortDateTime(summary.latest.at)}`
                  : tr("None yet", "Bado hakuna")
                : showAmounts
                  ? n.contributions(summary.today.count)
                  : n.word(summary.today.count)
            }
          />
          <Tile
            label={tr("Last 7 days", "Siku 7 zilizopita")}
            value={showAmounts ? <Money minor={summary.week.sum} /> : count(summary.week.count)}
            note={showAmounts ? n.contributions(summary.week.count) : n.word(summary.week.count)}
          />
        </div>

        <div ref={bar} className="sticky top-[var(--nav-h)] z-30 -mx-4 mt-4 bg-stone-50/90 px-4 py-3 backdrop-blur-md md:-mx-6 md:px-6">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <label htmlFor="c-search" className="sr-only">
                {tr("Search by name", "Tafuta kwa jina")}
              </label>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-stone-400" aria-hidden />
              <input
                id="c-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr(`Search ${plural(rows.length, "name")}`, `Tafuta kati ya ${pluralSw(rows.length, "jina", "majina")}`)}
                autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-stone-300 bg-white pr-28 pl-11 text-[17px] shadow-sm transition-shadow focus-visible:shadow-[0_0_0_4px_rgb(132_105_154/0.15)] focus-visible:outline-2 focus-visible:outline-plum-600 [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <>
                  <span className="pointer-events-none absolute top-1/2 right-12 -translate-y-1/2 text-[14px] text-stone-500 tabular-nums" aria-live="polite">
                    {tr(`${count(filtered.length)} found`, `${count(filtered.length)} yamepatikana`)}
                  </span>
                  <button
                    type="button"
                    aria-label={tr("Clear the search", "Futa utafutaji")}
                    onClick={() => setQuery("")}
                    className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </>
              )}
            </div>
            <SortControl sort={sort} options={sortOptions} onChange={setSort} />
          </div>
        </div>

        <section ref={list} aria-label={tr("Contributions", "Michango")} className="page-enter mt-1 overflow-clip rounded-[20px] border border-[rgb(27_25_23/0.09)] bg-white">
          {sorted.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-display text-[1.4rem] font-semibold text-stone-900">
                {rows.length === 0
                  ? tr("No contributions recorded yet", "Bado hakuna michango iliyorekodiwa")
                  : tr(`No names match “${query.trim()}”`, `Hakuna jina linalolingana na “${query.trim()}”`)}
              </p>
              {rows.length > 0 && (
                <p className="mt-2 text-stone-600">
                  {tr("Try part of a name, or", "Jaribu sehemu ya jina, au")}{" "}
                  <Link to="/check">{tr("check with your M-Pesa code", "hakiki kwa namba yako ya M-Pesa")}</Link>.
                </p>
              )}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                {group.title !== null && (
                  <div className="sticky top-[calc(var(--nav-h)+var(--bar-h))] z-20 flex items-center justify-between gap-3 border-y border-stone-100 bg-white/95 px-5 py-2.5 backdrop-blur first:border-t-0">
                    <h2 className="min-w-0 truncate">
                      <span className="font-display text-[1.25rem] font-semibold text-stone-900">{group.title}</span>
                      {group.subtitle && <span className="ml-2 text-[14px] text-stone-500">{group.subtitle}</span>}
                    </h2>
                    <p className="shrink-0 text-[14px] text-stone-500 tabular-nums">
                      {count(group.count)}
                      <span className="hidden sm:inline"> {n.word(group.count)}</span>
                      {group.sum !== null && <span className="font-semibold text-stone-700"> · {kes(group.sum)}</span>}
                    </p>
                  </div>
                )}
                <ul className="divide-y divide-stone-100">
                  {group.rows.map((row) => {
                    const position = drawn++;
                    return (
                      <li
                        key={row.key}
                        className="row-in flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-stone-50/80"
                        style={{ "--d": `${Math.min(position % CHUNK, 14) * 28}ms` } as CSSProperties}
                      >
                        <Avatar row={row} />
                        <div className="min-w-0 flex-1">
                          <p className={clsx("truncate font-medium", row.anonymous ? "text-stone-600" : "text-stone-900")}>
                            {row.anonymous ? localiseName(row.label, lang) : <Highlight text={row.label} folded={row.folded} query={deferred} />}
                          </p>
                          <p className="flex flex-wrap items-center gap-x-2 text-[14px] text-stone-500">
                            <span>{timeOnly ? formatNairobiTime(row.at) : formatShortDateTime(row.at)}</span>
                            {row.challenge_id && challengeNames.has(row.challenge_id) && (
                              <Link to="/challenges" className="inline-flex items-center gap-1 text-ochre-800 no-underline hover:underline">
                                <Trophy className="size-3.5" aria-hidden />
                                {challengeNames.get(row.challenge_id)}
                              </Link>
                            )}
                          </p>
                        </div>
                        {row.amount_minor !== null && (
                          <p className="shrink-0 text-right font-semibold text-stone-900 tabular-nums">
                            <span className="mr-1 text-[12px] font-medium text-stone-400">KES</span>
                            {kes(row.amount_minor).replace(/^KES\s/, "")}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          <div ref={sentinel} aria-hidden />
          {sorted.length > 0 && (
            <div className="flex flex-col items-center gap-3 border-t border-stone-100 px-5 py-5 text-center text-[15px] text-stone-500">
              {visible.length < sorted.length ? (
                <>
                  <p className="tabular-nums">
                    {tr(`Showing ${count(visible.length)} of ${count(sorted.length)}`, `Inaonyesha ${count(visible.length)} kati ya ${count(sorted.length)}`)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setLimit((l) => l + CHUNK * 2)}
                    className="press min-h-11 cursor-pointer rounded-xl border border-stone-300 bg-white px-5 font-semibold text-stone-800 hover:bg-stone-50"
                  >
                    {tr("Show more", "Onyesha zaidi")}
                  </button>
                </>
              ) : (
                <p>
                  {deferred
                    ? tr(`${plural(sorted.length, "contribution")} found. Thank you.`, `${n.contributions(sorted.length)} imepatikana. Asante.`)
                    : tr(`That is everyone: ${plural(sorted.length, "contribution")}. Thank you.`, `Hao ndio wote: ${n.contributions(sorted.length)}. Asanteni.`)}
                </p>
              )}
            </div>
          )}
        </section>

        {!showAmounts && (
          <p className="mt-3 text-center text-[15px] text-stone-500">
            {tr(
              "The family has chosen to show names only. The total above includes every contribution.",
              "Familia imeamua kuonyesha majina pekee. Jumla iliyo juu inajumuisha kila mchango.",
            )}
          </p>
        )}
        <p className="mt-4 text-center text-stone-600">
          {tr("Don’t see yours?", "Huoni mchango wako?")} <Link to="/check">{tr("Check with your M-Pesa code", "Hakiki kwa namba yako ya M-Pesa")}</Link>
        </p>
      </div>
      <BackToTop />
    </>
  );
}
