// Pieces of the funeral programme shared by the programme pages, the navbar and
// the home page: the live clock, the status wording and the day badges.

import { clsx } from "clsx";
import { useEffect, useMemo, useState } from "react";
import { usePreviewTime } from "./dayPreview";
import { useTr, type Lang } from "./i18n";
import { nairobiDate, untilText, type DayStatus, type Pair, type ProgrammeDay } from "./programme";

/** The current time (or the moment chosen with #day-preview), refreshed every half minute and whenever the tab is shown again. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  const preview = usePreviewTime();
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
  const previewed = useMemo(() => (preview === null ? null : new Date(preview)), [preview]);
  return previewed ?? now;
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
        dark ? "bg-white/[0.08] text-white ring-1 ring-[#e6bd72]/45" : "bg-white text-[#0b0a09] ring-1 ring-[#e6e2db]",
        className,
      )}
    >
      <span className={clsx("font-bold uppercase", lang === "sw" ? "text-[8.5px] tracking-[0.04em]" : "text-[10px] tracking-[0.14em]", dark ? "text-[#e6bd72]" : "text-[#7c6128]")}>{pick(day.tile.weekday, lang)}</span>
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
        inverted ? "bg-[#0b0a09] text-[#e6bd72]" : "bg-[#e6bd72] text-[#0b0a09]",
        className,
      )}
    >
      {live && <span className={clsx("prog-live size-1.5 rounded-full", inverted ? "bg-[#e6bd72]" : "bg-[#0b0a09]")} />}
      {live ? tr("Now", "Sasa") : tr("Today", "Leo")}
    </span>
  );
}
