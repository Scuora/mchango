import { BookOpen, CalendarDays } from "lucide-react";
import { Link } from "react-router";
import { GALLERY } from "./gallery";
import { localiseDates, useLang, useTr } from "./i18n";
import { usePublicPage } from "./PublicLayout";

/** The photographs from his eulogy booklet, in a grid under his photograph; a tap opens each one large. */
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
            {tr(
              `${GALLERY.length} photographs of Daktari, with his family, friends and community. Tap a photograph to see it larger.`,
              `Picha ${GALLERY.length} za Daktari pamoja na familia, marafiki na jamii yake. Gusa picha uione kwa ukubwa.`,
            )}
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
        <div className="mt-8 columns-2 gap-3 sm:columns-3 md:gap-4">
          {GALLERY.map((p, i) => (
            <a key={p.src} href={p.full} target="_blank" rel="noopener noreferrer" className="mb-3 block break-inside-avoid md:mb-4">
              <img
                src={p.src}
                width={p.width}
                height={p.height}
                loading={i < 6 ? "eager" : "lazy"}
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
