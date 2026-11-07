import { BookOpen, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router";
import { GALLERY } from "./gallery";
import { localiseDates, useLang, useTr } from "./i18n";
import { usePublicPage } from "./PublicLayout";

/** The photographs from his eulogy booklet under his photograph: a swipeable carousel on phones, a grid on larger screens; a tap opens each one large. */
export function GalleryPage() {
  const page = usePublicPage();
  const tr = useTr();
  const lang = useLang();
  const f = page.fundraiser;
  const name = f.memorial_name ?? f.name;
  return (
    <div className="bg-[#f6f4f0]">
      <header className="relative -mt-14 overflow-hidden bg-[#0b0a09] pt-[5.5rem] pb-10 text-[#f7f3ea] md:-mt-16 md:pt-28 md:pb-14">
        <div aria-hidden className="absolute inset-y-0 right-0 w-[82%] sm:w-[62%] md:w-[48%]">
          <img src="/img/programme/portrait.jpg" alt="" className="h-full w-full object-cover object-[60%_30%] opacity-55 grayscale contrast-[1.08] md:opacity-90" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#0b0a09_0%,rgb(11_10_9/0.8)_35%,rgb(11_10_9/0.2)_75%),linear-gradient(0deg,#0b0a09_0%,rgb(11_10_9/0)_45%),linear-gradient(180deg,rgb(11_10_9/0.9)_0%,rgb(11_10_9/0)_30%)]" />
        </div>
        <div className="relative mx-auto max-w-5xl px-4 md:px-6">
          {f.memorial_name && <p className="hero-line text-[15px] text-[#cfc8bc]">{tr("In loving memory of", "Kwa kumbukumbu ya")}</p>}
          <p className="hero-line mt-1 max-w-[16ch] font-display text-[1.9rem] leading-[1.05] font-medium text-balance md:text-[2.6rem]">{name}</p>
          {f.memorial_dates && <p className="hero-line mt-2 font-display text-[1.15rem] text-[#cfc8bc] md:text-[1.3rem]">{localiseDates(f.memorial_dates, lang)}</p>}
          <h1 className="hero-line mt-7 font-display text-[clamp(3rem,9vw,5rem)] leading-none font-medium tracking-[-0.012em]">{tr("Gallery", "Picha")}</h1>
        </div>
      </header>
      <article className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-xl text-[17px] leading-relaxed text-stone-700">
            {tr(`${GALLERY.length} photographs of Daktari, with his family, friends and community.`, `Picha ${GALLERY.length} za Daktari pamoja na familia, marafiki na jamii yake.`)}{" "}
            <span className="md:hidden">{tr("Swipe for the next; tap one to see it larger.", "Telezesha kuona inayofuata; gusa picha uione kwa ukubwa.")}</span>
            <span className="hidden md:inline">{tr("Tap a photograph to see it larger.", "Gusa picha uione kwa ukubwa.")}</span>
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/eulogy"
              className="press inline-flex min-h-12 items-center gap-2 rounded-full bg-[#0b0a09] px-5 font-semibold text-white no-underline hover:bg-[#2a2724] hover:no-underline"
            >
              <BookOpen className="size-5" aria-hidden /> {tr("Read the eulogy", "Soma wasifu")}
            </Link>
            <Link
              to="/programme"
              className="press inline-flex min-h-12 items-center gap-2 rounded-full border border-stone-300 px-5 font-semibold text-stone-900 no-underline hover:bg-stone-100 hover:no-underline"
            >
              <CalendarDays className="size-5" aria-hidden /> {tr("Funeral programme", "Ratiba ya mazishi")}
            </Link>
          </div>
        </div>
        <Carousel />
        <div className="mt-8 hidden columns-3 gap-4 md:block">
          {GALLERY.map((p, i) => (
            <a key={p.src} href={p.full} target="_blank" rel="noopener noreferrer" className="mb-4 block break-inside-avoid">
              <img
                src={p.src}
                width={p.width}
                height={p.height}
                loading="lazy"
                decoding="async"
                alt={tr(`Photograph ${i + 1} of ${GALLERY.length}`, `Picha ${i + 1} kati ya ${GALLERY.length}`)}
                className="block h-auto w-full rounded-[12px] bg-stone-200 shadow-[0_8px_24px_rgb(27_25_23/0.14)]"
              />
            </a>
          ))}
        </div>
        {f.memorial_tribute && <p className="mt-10 text-center font-display text-[1.45rem] text-[#7c6128] italic">{f.memorial_tribute}</p>}
      </article>
    </div>
  );
}

/** Phones: one photograph at a time on a dark stage, swiped sideways (scroll snap), with a counter and arrows. */
function Carousel() {
  const tr = useTr();
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const onScroll = () => {
    const el = track.current;
    if (el) setAt(Math.min(GALLERY.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  };
  const go = (to: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: Math.min(GALLERY.length - 1, Math.max(0, to)) * el.clientWidth, behavior: "smooth" });
  };
  const arrow = "press grid size-12 place-items-center rounded-full border border-stone-300 bg-white text-stone-900 disabled:opacity-35";
  return (
    <section className="-mx-4 mt-6 md:hidden" aria-roledescription="carousel" aria-label={tr("Photographs", "Picha")}>
      <div
        ref={track}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {GALLERY.map((p, i) => (
          <a
            key={p.src}
            href={p.full}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full shrink-0 snap-center px-4"
            aria-label={tr(`Photograph ${i + 1} of ${GALLERY.length}, open larger`, `Picha ${i + 1} kati ya ${GALLERY.length}, fungua kwa ukubwa`)}
          >
            <div className="flex h-[min(68vh,560px)] items-center justify-center overflow-hidden rounded-[18px] bg-[#0b0a09] shadow-[0_12px_30px_rgb(27_25_23/0.22)]">
              <img
                src={p.src}
                srcSet={`${p.src} 720w, ${p.full} 1400w`}
                sizes="100vw"
                width={p.width}
                height={p.height}
                loading={i < 2 ? "eager" : "lazy"}
                decoding="async"
                alt=""
                className="h-auto max-h-full w-auto max-w-full"
              />
            </div>
          </a>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between px-4">
        <button type="button" className={arrow} onClick={() => go(at - 1)} disabled={at === 0} aria-label={tr("Previous photograph", "Picha iliyotangulia")}>
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <p className="font-display text-[1.3rem] text-stone-800 tabular-nums" aria-live="polite">
          {at + 1} <span className="text-stone-400">/ {GALLERY.length}</span>
        </p>
        <button type="button" className={arrow} onClick={() => go(at + 1)} disabled={at === GALLERY.length - 1} aria-label={tr("Next photograph", "Picha inayofuata")}>
          <ChevronRight className="size-6" aria-hidden />
        </button>
      </div>
    </section>
  );
}
