// Pieces of the funeral programme shared by the programme pages, the navbar and
// the home page: the live clock, the status wording and the day cards.

import "@fontsource-variable/montserrat";
import { clsx } from "clsx";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useLang, useTr, type Lang } from "./i18n";
import { PROGRAMME, dayStatus, nairobiDate, untilText, type DayStatus, type Pair, type ProgrammeDay } from "./programme";

/** The current time, refreshed every half minute and whenever the tab is shown again. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = window.setInterval(tick, intervalMs);
    const onShow = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [intervalMs]);
  return now;
}

export const pick = (pair: Pair, lang: Lang) => (lang === "sw" && pair[1] ? pair[1] : pair[0]);

export const isToday = (day: ProgrammeDay, now: Date) => nairobiDate(now) === day.date;

/** The end of a part's time, e.g. "1:30 p.m." from "10:35 a.m. – 1:30 p.m."; null when it has none. */
function endOf(time: Pair, lang: Lang): string | null {
  const end = pick(time, lang).split(" – ")[1];
  return end ? (lang === "sw" ? `saa ${end}` : end) : null;
}

/** What to say about a day right now: a heading and a detail line. */
export function statusWords(day: ProgrammeDay, status: DayStatus, now: Date, lang: Lang): { tone: "now" | "soon" | "ended"; title: string; detail: string | null } {
  const sw = lang === "sw";
  const k = sw ? 1 : 0;
  if (status.kind === "now") {
    const part = day.parts[status.part];
    const end = endOf(part.time, lang);
    const next = status.next === null ? null : day.parts[status.next];
    return {
      tone: "now",
      title: part.title[k],
      detail: [end ? (sw ? `Hadi ${end}` : `Until ${end}`) : null, next ? `${sw ? "Kinachofuata" : "Next"}: ${next.title[k]} (${pick(next.time, lang)})` : null].filter(Boolean).join(" · ") || null,
    };
  }
  if (status.kind === "between") {
    const next = day.parts[status.next];
    return { tone: "soon", title: `${sw ? "Kinachofuata" : "Next"}: ${next.title[k]}`, detail: `${pick(next.time, lang)} · ${untilText(now, status.startsAt, lang)}` };
  }
  if (status.kind === "upcoming") {
    const from = `${sw ? "kuanzia" : "from"} ${day.begins[k]}${status.tentative ? (sw ? " (muda utathibitishwa)" : " (time to be confirmed)") : ""}`;
    const begins = `${sw ? "Inaanza" : "Begins"} ${untilText(now, status.startsAt, lang)}`;
    return isToday(day, now)
      ? { tone: "soon", title: `${sw ? "Leo" : "Today"}, ${from}`, detail: begins }
      : { tone: "soon", title: begins, detail: `${day.weekday[k]}, ${day.dateLong[k]} · ${from}` };
  }
  return { tone: "ended", title: sw ? `Ratiba hii ilifanyika ${day.weekday[1]}, ${day.dateLong[1]}.` : `This programme took place on ${day.weekday[0]}, ${day.dateLong[0]}.`, detail: null };
}

/** A small calendar tile: "FRI" over "6". */
export function DayBadge({ day, lang, dark, className }: { day: ProgrammeDay; lang: Lang; dark?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "grid w-12 shrink-0 place-items-center rounded-xl py-1.5 leading-none",
        dark ? "bg-white/[0.08] text-white ring-1 ring-[#e2c88f]/45" : "bg-white text-[#14152b] ring-1 ring-[#e7e1d6]",
        className,
      )}
    >
      <span className={clsx("font-bold uppercase", lang === "sw" ? "text-[8.5px] tracking-[0.04em]" : "text-[10px] tracking-[0.14em]", dark ? "text-[#e2c88f]" : "text-[#876628]")}>{pick(day.tile.weekday, lang)}</span>
      <span className="mt-0.5 text-[22px] font-extrabold tracking-[-0.02em]">{day.tile.day}</span>
    </span>
  );
}

/** "Today", or "Now" with a live dot; `inverted` for gold backgrounds. */
export function TodayPill({ live, inverted, className }: { live?: boolean; inverted?: boolean; className?: string }) {
  const tr = useTr();
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold tracking-[0.12em] uppercase",
        inverted ? "bg-[#14152b] text-[#e2c88f]" : "bg-[#e2c88f] text-[#14152b]",
        className,
      )}
    >
      {live && <span className={clsx("prog-live size-1.5 rounded-full", inverted ? "bg-[#e2c88f]" : "bg-[#14152b]")} />}
      {live ? tr("Now", "Sasa") : tr("Today", "Leo")}
    </span>
  );
}

/** On the home page: the two days, a tap away, with what is on now. */
export function ProgrammeCard() {
  const lang = useLang();
  const tr = useTr();
  const now = useNow();
  const live = PROGRAMME.map((day) => ({ day, status: dayStatus(day, now) }));
  const current = live.find(({ day, status }) => status.kind === "now" || (status.kind !== "ended" && isToday(day, now)));
  const words = current ? statusWords(current.day, current.status, now, lang) : null;
  return (
    <section aria-labelledby="programme-card" className="prog overflow-hidden rounded-2xl bg-[#0f1027] text-white shadow-[0_18px_44px_-22px_rgb(15_16_39/0.75)]">
      <div className="flex items-end justify-between gap-3 px-5 pt-5 pb-4">
        <div>
          <p className="text-[12px] font-semibold tracking-[0.26em] text-[#e2c88f] uppercase">{tr("Funeral programme", "Ratiba ya mazishi")}</p>
          <h2 id="programme-card" className="mt-1 text-[1.25rem] leading-tight font-semibold tracking-[-0.01em]">
            {tr("Friday and Saturday", "Ijumaa na Jumamosi")}
          </h2>
        </div>
        <Link to="/programme" className="shrink-0 text-[14px] font-semibold text-[#e2c88f] no-underline hover:text-white hover:no-underline">
          {tr("Open", "Fungua")}
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-px bg-white/10">
        {live.map(({ day, status }) => (
          <Link
            key={day.id}
            to={`/programme/${day.id}`}
            className="group relative flex min-h-44 flex-col justify-end overflow-hidden p-4 text-white no-underline hover:no-underline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[#e2c88f]"
          >
            <span className="prog-duo absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]">
              <img src={day.cover} alt="" loading="lazy" style={{ objectPosition: day.id === "friday" ? "62% 30%" : "42% 25%" }} />
            </span>
            <span aria-hidden className="absolute inset-0 z-[2] bg-[linear-gradient(0deg,rgb(15_16_39/0.95)_0%,rgb(15_16_39/0.55)_55%,rgb(15_16_39/0.15)_100%)]" />
            <span className="relative z-[3] flex items-center gap-2">
              <span className="text-[12px] font-bold tracking-[0.16em] text-[#e2c88f] uppercase">
                {pick(day.tile.weekday, lang)} {day.tile.day} {pick(day.tile.month, lang)}
              </span>
              {(status.kind === "now" || isToday(day, now)) && status.kind !== "ended" && <TodayPill live={status.kind === "now"} />}
            </span>
            <span className="relative z-[3] mt-1 text-[1.05rem] leading-snug font-semibold">{pick(day.summary, lang)}</span>
            <span className="relative z-[3] mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-white/80 group-hover:text-white">
              {tr("View", "Tazama")} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
      {words && current && (
        <Link
          to={`/programme/${current.day.id}`}
          className="flex items-start gap-3 px-5 py-3.5 text-white no-underline hover:bg-white/[0.04] hover:no-underline"
        >
          <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", words.tone === "now" ? "prog-live bg-[#e2c88f]" : "bg-white/40")} aria-hidden />
          <span className="min-w-0 text-[14px] leading-snug">
            {words.tone === "now" && <span className="font-semibold text-[#e2c88f]">{tr("Now: ", "Sasa: ")}</span>}
            <span className="font-medium">{words.title}</span>
            {words.detail && <span className="block text-white/65">{words.detail}</span>}
          </span>
        </Link>
      )}
    </section>
  );
}
