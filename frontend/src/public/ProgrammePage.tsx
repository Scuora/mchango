import { clsx } from "clsx";
import { ArrowRight, CalendarPlus, Check, Download, MapPin, Navigation, Share2 } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Link, Navigate, NavLink, useLocation, useParams } from "react-router";
import { coordinatesIn, directionsLink } from "@/lib/maps";
import type { PublicPage } from "@/lib/types";
import { localiseDates, useLang, useTr, type Lang } from "./i18n";
import { usePublicPage } from "./PublicLayout";
import { PROGRAMME, calendarFile, dayStatus, defaultDay, programmeDay, programmeShareText, type DayStatus, type NumeralPhoto, type ProgrammeDay, type ProgrammePart } from "./programme";
import { DayBadge, TodayPill, isToday, pick, statusWords, useNow } from "./programmeParts";
import { copyText, publicLink } from "./share";

/** `/programme` opens the day that is on (Friday until Saturday comes). */
export function ProgrammeIndex() {
  const { search } = useLocation();
  return <Navigate to={`/programme/${defaultDay(new Date())}${search}`} replace />;
}

/**
 * A day of the funeral programme, in the memorial's warm black, ivory and gold: Friday's parts
 * with his photos seen through large numerals, Saturday's timed service beside a
 * photo mosaic. It says what is on now, and offers directions, a calendar entry,
 * sharing and the printed programme.
 */
export function ProgrammePage() {
  const { day: id } = useParams();
  const { search } = useLocation();
  const page = usePublicPage();
  const lang = useLang();
  const now = useNow();
  const day = programmeDay(id);
  if (!day) return <Navigate to={`/programme${search}`} replace />;
  const status = dayStatus(day, now);
  const other = PROGRAMME.find((d) => d.id !== day.id)!;
  return (
    <div className="prog bg-[#f6f4f0] text-[#1b1917]">
      <Hero day={day} page={page} lang={lang} />
      <DaySwitch current={day.id} now={now} lang={lang} />
      <div className="mx-auto max-w-6xl px-4 pt-4 md:px-6 md:pt-6">
        <StatusCard day={day} status={status} now={now} lang={lang} />
        <Actions day={day} page={page} lang={lang} />
      </div>
      {day.id === "friday" ? <FridayParts day={day} status={status} lang={lang} /> : <SaturdayService day={day} status={status} lang={lang} />}
      <OtherDay day={other} lang={lang} before={other.date < day.date} />
      {page.fundraiser.memorial_tribute && (
        <p className="px-4 pt-0 pb-3 text-center text-[1rem] font-semibold tracking-[-0.01em] md:text-[1.1rem]">
          <span className="italic text-[#7c6128]">{page.fundraiser.memorial_tribute}</span>
        </p>
      )}
    </div>
  );
}

function Hero({ day, page, lang }: { day: ProgrammeDay; page: PublicPage; lang: Lang }) {
  const tr = useTr();
  const f = page.fundraiser;
  return (
    <header className="relative -mt-14 overflow-hidden bg-[#0b0a09] pt-[4.5rem] pb-7 text-white md:-mt-16 md:pt-24 md:pb-12">
      <div aria-hidden className="absolute inset-y-0 right-0 w-[86%] sm:w-[70%] md:w-[52%]">
        <img src="/img/programme/portrait.jpg" alt="" className="h-full w-full object-cover object-[60%_32%] opacity-60 grayscale contrast-[1.08] md:opacity-95" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#0b0a09_0%,rgb(11_10_9/0.82)_32%,rgb(11_10_9/0.3)_72%,rgb(11_10_9/0.12)_100%),linear-gradient(0deg,#0b0a09_0%,rgb(11_10_9/0)_42%),linear-gradient(180deg,rgb(11_10_9/0.92)_0%,rgb(11_10_9/0)_30%)]" />
      </div>
      <div className="relative mx-auto max-w-6xl px-4 md:px-6">
        <p className="hero-line flex items-center gap-3 text-[11px] font-semibold tracking-[0.3em] text-[#e6bd72] uppercase md:text-[12px]">
          {tr("Funeral programme", "Ratiba ya mazishi")}
          <span className="h-px w-12 bg-[#e6bd72]/70" />
        </p>
        {f.memorial_name && (
          <>
            <p className="hero-line mt-4 text-[13px] text-white/70 italic md:mt-6 md:text-[14px]" style={{ "--d": "100ms" } as CSSProperties}>
              {tr("In loving memory of", "Kwa kumbukumbu ya")}
            </p>
            <p className="hero-line mt-1 max-w-[18ch] font-display text-[1.65rem] leading-[1.05] font-medium tracking-[-0.01em] text-balance sm:text-[2rem] md:text-[2.75rem]" style={{ "--d": "180ms" } as CSSProperties}>
              {f.memorial_name}
            </p>
          </>
        )}
        {f.memorial_dates && (
          <p className="hero-line mt-2 text-[12.5px] tracking-[0.03em] text-white/75 md:text-[14px]" style={{ "--d": "260ms" } as CSSProperties}>
            {localiseDates(f.memorial_dates, lang)}
          </p>
        )}
        <span className="hero-line mt-5 block h-[3px] w-10 bg-[#c29f5d] md:mt-7 md:w-12" style={{ "--d": "320ms" } as CSSProperties} />
        <h1 className="hero-line mt-3 font-display text-[clamp(3.4rem,8vw,6rem)] leading-[0.98] font-medium tracking-[-0.012em]" style={{ "--d": "380ms" } as CSSProperties}>
          <span className="sr-only">{tr("Funeral programme: ", "Ratiba ya mazishi: ")}</span>
          {pick(day.weekday, lang)}
        </h1>
        <p className="hero-line mt-2 text-[1rem] font-light tracking-[0.05em] text-[#e6bd72] md:text-[1.25rem]" style={{ "--d": "440ms" } as CSSProperties}>
          {pick(day.dateLong, lang)}
        </p>
        <p className="hero-line mt-3.5 max-w-[34ch] text-[0.92rem] leading-snug font-semibold md:text-[1.05rem]" style={{ "--d": "500ms" } as CSSProperties}>
          {pick(day.title, lang)}
        </p>
        {day.venue && (
          <p className="hero-line mt-2 flex items-center gap-2 text-[13px] text-white/80 md:text-[14px]" style={{ "--d": "560ms" } as CSSProperties}>
            <MapPin className="size-4 shrink-0 text-[#e6bd72]" aria-hidden /> {pick(day.venue, lang)}
          </p>
        )}
      </div>
    </header>
  );
}

/** Friday | Saturday, kept in reach below the navbar while scrolling. */
function DaySwitch({ current, now, lang }: { current: string; now: Date; lang: Lang }) {
  const tr = useTr();
  return (
    <div className="sticky top-14 z-30 border-b border-[#e6e2db] bg-[#f6f4f0]/92 backdrop-blur-md md:top-16">
      <nav aria-label={tr("Programme days", "Siku za ratiba")} className="mx-auto grid max-w-6xl grid-cols-2 gap-2 px-4 py-2 sm:flex sm:py-2.5 md:px-6">
        {PROGRAMME.map((d) => {
          const status = dayStatus(d, now);
          const today = isToday(d, now) && status.kind !== "ended";
          return (
            <NavLink
              key={d.id}
              to={`/programme/${d.id}`}
              replace
              className={({ isActive }) =>
                clsx(
                  "press flex min-h-11 items-center gap-2.5 rounded-xl px-2 py-1.5 no-underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c29f5d] sm:min-h-12 sm:min-w-56 sm:px-2.5",
                  isActive ? "bg-[#0b0a09] text-white shadow-[0_10px_24px_-14px_rgb(11_10_9/0.8)]" : "bg-white text-[#1b1917] ring-1 ring-[#e6e2db] hover:ring-[#c29f5d]/60",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* The smallest phones keep the room for the day's name. */}
                  <span className="hidden min-[360px]:block">
                    <DayBadge day={d} lang={lang} dark={isActive} className="w-9 rounded-lg py-1 sm:w-10 [&>span:last-child]:text-[16px] sm:[&>span:last-child]:text-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1.5 text-[13.5px] leading-tight font-bold sm:text-[14px]">
                      {pick(d.weekday, lang)}
                      {current !== d.id && today && <TodayPill live={status.kind === "now"} className="hidden min-[400px]:inline-flex" />}
                    </span>
                    <span className={clsx("hidden text-[12px] leading-tight sm:line-clamp-1 sm:block", isActive ? "text-white/70" : "text-[#5d5850]")}>{pick(d.summary, lang)}</span>
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

/** What is on now, what is next, or when the day begins. */
function StatusCard({ day, status, now, lang }: { day: ProgrammeDay; status: DayStatus; now: Date; lang: Lang }) {
  const tr = useTr();
  const words = statusWords(day, status, now, lang);
  if (words.tone === "ended") {
    return <p className="flex items-center gap-2 text-[13px] text-[#5d5850] md:text-[14px]"><Check className="size-4 text-[#7c6128]" aria-hidden /> {words.title}</p>;
  }
  const live = words.tone === "now";
  return (
    <div
      role="status"
      className={clsx(
        "relative overflow-hidden rounded-xl px-4 py-3 md:px-5 md:py-3.5",
        live ? "bg-[#0b0a09] text-white shadow-[0_18px_40px_-22px_rgb(11_10_9/0.8)]" : "bg-white ring-1 ring-[#e6e2db]",
      )}
    >
      <p className={clsx("flex items-center gap-2 text-[10.5px] font-bold tracking-[0.18em] uppercase md:text-[11px]", live ? "text-[#e6bd72]" : "text-[#7c6128]")}>
        <span className={clsx("size-2 rounded-full", live ? "prog-live bg-[#e6bd72]" : "bg-[#c29f5d]")} aria-hidden />
        {live ? tr("Happening now", "Kinaendelea sasa") : isToday(day, now) ? tr("Today", "Leo") : tr("Coming up", "Kinakuja")}
      </p>
      <p className="mt-1 text-[0.95rem] leading-snug font-semibold md:text-[1.05rem]">{words.title}</p>
      {words.detail && <p className={clsx("mt-0.5 text-[12.5px] leading-snug md:text-[13.5px]", live ? "text-white/70" : "text-[#5d5850]")}>{words.detail}</p>}
      {status.kind === "now" && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
          <span className="block h-full bg-[#e6bd72] transition-[width] duration-700" style={{ width: `${Math.round(status.progress * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

function Chip({ children, onClick, href, download, primary, external }: { children: ReactNode; onClick?: () => void; href?: string; download?: string; primary?: boolean; external?: boolean }) {
  const className = clsx(
    "press inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap no-underline hover:no-underline sm:min-h-10 sm:px-3.5 sm:text-[13.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c29f5d]",
    primary ? "bg-[#0b0a09] text-white hover:bg-[#2a2724]" : "bg-white text-[#1b1917] ring-1 ring-[#e6e2db] hover:ring-[#c29f5d]/70",
  );
  if (href) {
    return (
      <a href={href} download={download} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className={className}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={clsx(className, "cursor-pointer")}>
      {children}
    </button>
  );
}

/** Directions, a calendar entry, sharing and the printed programme. Scrolls sideways on phones. */
function Actions({ day, page, lang }: { day: ProgrammeDay; page: PublicPage; lang: Lang }) {
  const tr = useTr();
  const [copied, setCopied] = useState(false);
  const { place, map_url } = page.fundraiser.funeral;
  const coords = coordinatesIn(map_url);
  const directions = day.venue ? (coords ? directionsLink(coords) : map_url) : null;
  const url = publicLink(`/programme/${day.id}${lang === "sw" ? "?lang=sw" : ""}`);
  const name = page.fundraiser.memorial_name ?? page.fundraiser.name;
  const k = lang === "sw" ? 1 : 0;

  function addToCalendar() {
    const file = new Blob([calendarFile(day, name, publicLink(`/programme/${day.id}`), place)], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = `${day.weekday[0]} programme - ${day.dateLong[0]}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }

  async function share() {
    const text = programmeShareText(day, page.fundraiser.memorial_name, url, lang);
    if (navigator.share) {
      try {
        await navigator.share({ title: `${tr("Funeral programme", "Ratiba ya mazishi")}: ${day.weekday[k]}`, text });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    if (await copyText(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  return (
    <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 py-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
      {directions && (
        <Chip href={directions} external primary>
          <Navigation className="size-4" aria-hidden /> {tr("Directions", "Maelekezo")}
        </Chip>
      )}
      <Chip onClick={addToCalendar} primary={!directions}>
        <CalendarPlus className="size-4" aria-hidden /> {tr("Add to calendar", "Weka kwenye kalenda")}
      </Chip>
      <Chip onClick={() => void share()}>
        {copied ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />} {copied ? tr("Copied", "Imenakiliwa") : tr("Share", "Shiriki")}
      </Chip>
      <Chip href={day.poster} download={`Funeral programme - ${day.weekday[0]} ${day.dateLong[0]}.jpg`}>
        <Download className="size-4" aria-hidden /> {tr("Printed programme", "Ratiba ya kuchapisha")}
      </Chip>
    </div>
  );
}

/** A photo seen through a large numeral, with the fine gold outline behind it. */
function Numeral({ n, photo, className }: { n: string; photo: NumeralPhoto; className?: string }) {
  const style: CSSProperties = {
    backgroundImage: `linear-gradient(180deg, rgb(11 10 9 / 0.3) 0%, rgb(11 10 9 / 0.1) 45%, rgb(11 10 9 / 0) 75%), url("${photo.src}")`,
    backgroundSize: `100% 100%, ${photo.size}em auto`,
    backgroundPosition: `0 0, ${photo.x}em ${photo.y}em`,
  };
  return (
    <div aria-hidden className={clsx("prog-numeral", className)} data-n={n}>
      <span style={style}>{n}</span>
    </div>
  );
}

const Now = () => <TodayPill live />;

function FridayParts({ day, status, lang }: { day: ProgrammeDay; status: DayStatus; lang: Lang }) {
  const current = status.kind === "now" ? status.part : status.kind === "between" ? status.next - 0.5 : -1;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 md:px-6 md:pt-6">
      {day.parts.map((part, i) => (
        <FridayPart key={part.start} part={part} index={i} lang={lang} live={status.kind === "now" && status.part === i} done={current > i} />
      ))}
    </div>
  );
}

function FridayPart({ part, index, lang, live, done }: { part: ProgrammePart; index: number; lang: Lang; live: boolean; done: boolean }) {
  const flip = index % 2 === 1;
  const n = String(index + 1).padStart(2, "0");
  // No fallback to English: Kiswahili has no time-of-day labels (see programme.ts).
  const label = part.label?.[lang === "sw" ? 1 : 0] ?? "";
  return (
    <section
      data-reveal
      aria-labelledby={`part-${n}`}
      className={clsx(
        "grid items-center gap-3 border-t border-[#e6e2db] py-6 md:gap-10 md:py-10",
        flip ? "md:grid-cols-[auto_minmax(0,1fr)]" : "md:grid-cols-[minmax(0,1fr)_auto]",
        done && "[&>*]:opacity-55",
      )}
    >
      <div className={clsx("min-w-0", flip && "md:order-2")}>
        <div className="flex min-h-6 flex-wrap items-center gap-3">
          {label && <p className="text-[10.5px] font-semibold tracking-[0.26em] text-[#7c6128] uppercase md:text-[11px]">{label}</p>}
          <p className="text-[10.5px] font-semibold tracking-[0.1em] text-[#5d5850] uppercase md:text-[11px]">{pick(part.time, lang)}</p>
          {live && <Now />}
        </div>
        <h2 id={`part-${n}`} className="mt-1 font-display text-[1.65rem] leading-[1.08] font-medium tracking-[-0.01em] text-balance md:text-[2.1rem]">
          {pick(part.title, lang)}
        </h2>
        <span className="mt-2.5 block h-[3px] w-10 bg-[#c29f5d] md:mt-3" />
        <ol className="relative mt-4 space-y-2.5 md:mt-5 md:space-y-3 before:absolute before:top-3 before:bottom-3 before:left-[5px] before:w-px before:bg-gradient-to-b before:from-[#e6bd72] before:to-[#e6bd72]/20">
          {part.items.map((item) => (
            <li key={item.text[0]} className="relative pl-6">
              <span className="absolute top-[0.4em] left-0 size-[10px] rounded-full border-2 border-[#c29f5d] bg-[#f6f4f0]" aria-hidden />
              <span className="block text-[0.9rem] leading-snug font-medium text-[#2a2724] md:text-[0.98rem]">{pick(item.text, lang)}</span>
              {item.note && <span className="mt-0.5 block text-[10.5px] font-semibold tracking-[0.08em] text-[#7c6128] uppercase md:text-[11px]">{pick(item.note, lang)}</span>}
            </li>
          ))}
        </ol>
      </div>
      {part.numeral && (
        <Numeral
          n={n}
          photo={part.numeral}
          className={clsx("order-first justify-self-start text-[7.5rem] min-[400px]:text-[8.25rem] sm:text-[9.5rem] md:text-[10rem] lg:text-[11.5rem]", !flip && "md:order-none md:justify-self-end")}
        />
      )}
    </section>
  );
}

// The Saturday mosaic, after the printed programme: [left, top, width, height] in % of a 750 x 790 frame,
// and where to centre each photo (with how far to zoom in).
const MOSAIC: { src: string; box: [number, number, number, number]; focus: [number, number]; zoom: number; strip?: boolean }[] = [
  { src: "/img/programme/fez.jpg", box: [0, 0, 200, 790], focus: [0.415, 0.42], zoom: 1, strip: true },
  { src: "/img/programme/road.jpg", box: [216, 0, 300, 570], focus: [0.63, 0.47], zoom: 1.12 },
  { src: "/img/programme/portrait.jpg", box: [532, 0, 218, 218], focus: [0.55, 0.47], zoom: 1.25 },
  { src: "/img/programme/home.jpg", box: [532, 234, 218, 336], focus: [0.55, 0.36], zoom: 1.25 },
  { src: "/img/programme/desk.jpg", box: [216, 586, 534, 204], focus: [0.52, 0.215], zoom: 1 },
];

function Mosaic({ lang, className }: { lang: Lang; className?: string }) {
  return (
    <div aria-hidden className={clsx("@container relative aspect-[750/790] w-full", className)}>
      {MOSAIC.map(({ src, box: [x, y, w, h], focus: [fx, fy], zoom, strip }) => (
        <div
          key={src}
          className={clsx("prog-duo absolute", strip ? "rounded-none" : "rounded-[1.9cqw]")}
          style={{ left: `${(x / 750) * 100}%`, top: `${(y / 790) * 100}%`, width: `${(w / 750) * 100}%`, height: `${(h / 790) * 100}%` }}
        >
          <img src={src} alt="" loading="lazy" style={{ objectPosition: `${fx * 100}% ${fy * 100}%`, transform: `scale(${zoom})`, transformOrigin: `${fx * 100}% ${fy * 100}%` }} />
          {strip && (
            <>
              <span className="absolute inset-0 z-[2] bg-[linear-gradient(0deg,rgb(11_10_9/0.85)_0%,rgb(11_10_9/0.4)_26%,rgb(11_10_9/0)_46%)]" />
              <span className="absolute inset-x-0 bottom-[4.5cqw] z-[3] text-center text-white">
                <span className="block text-[21.6cqw] leading-[0.8] font-extralight tracking-[-0.05em]">07</span>
                <span className="mt-[2cqw] block text-[1.75cqw] font-semibold tracking-[0.34em] text-[#e6bd72] uppercase">{lang === "sw" ? "Novemba" : "November"}</span>
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function SaturdayService({ day, status, lang }: { day: ProgrammeDay; status: DayStatus; lang: Lang }) {
  const tr = useTr();
  const current = status.kind === "now" ? status.part : status.kind === "between" ? status.next - 0.5 : -1;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-5 pb-4 md:px-6 md:pt-8 lg:grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:gap-12">
      <Mosaic lang={lang} className="mx-auto max-w-[460px] lg:sticky lg:top-36 lg:max-w-none lg:self-start" />
      <div className="mt-6 lg:mt-0">
        <h2 className="text-[10.5px] font-semibold tracking-[0.26em] text-[#7c6128] uppercase md:text-[11px]">{tr("Order of service", "Mpangilio wa ibada")}</h2>
        <ol className="mt-3">
          {day.parts.map((part, i) => {
            const live = status.kind === "now" && status.part === i;
            return (
              <li
                key={part.start}
                data-reveal
                className={clsx(
                  "relative flex items-end gap-3 border-t border-[#e6e2db] py-3 md:py-3.5",
                  live && "-mx-4 rounded-2xl border-transparent bg-[#0b0a09] px-4 text-white shadow-[0_18px_40px_-22px_rgb(11_10_9/0.8)] md:-mx-5 md:px-5",
                  current > i && "[&>*]:opacity-50",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className={clsx("flex flex-wrap items-center gap-2 text-[10.5px] font-semibold tracking-[0.08em] uppercase md:text-[11px]", live ? "text-[#e6bd72]" : "text-[#7c6128]")}>
                    {pick(part.time, lang)}
                    {live && <Now />}
                  </p>
                  <p className="mt-0.5 text-[0.92rem] leading-snug font-medium text-balance md:text-[1rem]">{pick(part.title, lang)}</p>
                  {live && status.kind === "now" && (
                    <span aria-hidden className="mt-3 block h-1 overflow-hidden rounded-full bg-white/15">
                      <span className="block h-full rounded-full bg-[#e6bd72]" style={{ width: `${Math.round(status.progress * 100)}%` }} />
                    </span>
                  )}
                </div>
                <span aria-hidden className={clsx("text-[1.6rem] leading-[0.8] font-extralight tracking-[-0.02em] md:text-[1.9rem]", live ? "text-[#e6bd72]" : "text-[#1b1917]")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** The other day, as a large card with his photo. */
function OtherDay({ day, lang, before }: { day: ProgrammeDay; lang: Lang; before: boolean }) {
  const tr = useTr();
  return (
    <div className="mx-auto max-w-6xl px-4 py-7 md:px-6 md:py-10">
      <Link
        to={`/programme/${day.id}`}
        className="group lift relative block overflow-hidden rounded-3xl text-white no-underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c29f5d]"
      >
        <span className="prog-duo absolute inset-0">
          <img src={day.cover} alt="" loading="lazy" style={{ objectPosition: day.id === "friday" ? "50% 11%" : "50% 20%" }} className="transition-transform duration-700 group-hover:scale-[1.03]" />
        </span>
        <span aria-hidden className="absolute inset-0 z-[2] bg-[linear-gradient(90deg,rgb(11_10_9/0.96)_0%,rgb(11_10_9/0.8)_45%,rgb(11_10_9/0.25)_100%)]" />
        <span className="relative z-[3] block px-5 py-6 md:px-8 md:py-9">
          <span className="block text-[10.5px] font-semibold tracking-[0.28em] text-[#e6bd72] uppercase md:text-[11px]">{before ? tr("The day before", "Siku iliyotangulia") : tr("The next day", "Siku inayofuata")}</span>
          <span className="mt-2 block font-display text-[2.3rem] leading-none font-medium tracking-[-0.012em] md:text-[3.1rem]">{pick(day.weekday, lang)}</span>
          <span className="mt-1.5 block text-[0.95rem] font-light tracking-[0.05em] text-[#e6bd72] md:text-[1.05rem]">{pick(day.dateLong, lang)}</span>
          <span className="mt-2 block max-w-[30ch] text-[0.9rem] leading-snug font-semibold md:text-[1rem]">{pick(day.title, lang)}</span>
          <span className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#f7f3ea] px-4 text-[13.5px] font-semibold text-[#0b0a09] md:mt-5 md:min-h-12 md:text-[14.5px]">
            {tr("See the programme", "Tazama ratiba")} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </span>
      </Link>
    </div>
  );
}
