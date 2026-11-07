import { CalendarDays, Download, House, Images } from "lucide-react";
import { Link } from "react-router";
import { BOOKLET, EULOGY } from "./eulogy";
import { localiseDates, useLang, useTr } from "./i18n";
import { usePublicPage } from "./PublicLayout";

/** His eulogy, under his photograph: the booklet page by page with a download, or the text, or a note that it will appear here. */
export function EulogyPage() {
  const page = usePublicPage();
  const tr = useTr();
  const lang = useLang();
  const f = page.fundraiser;
  const name = f.memorial_name ?? f.name;
  // Kiswahili readers see the English eulogy until a Kiswahili one is added.
  const paragraphs = lang === "sw" && EULOGY.sw.length > 0 ? EULOGY.sw : EULOGY.en;
  return (
    <div className="bg-[#f6f4f0]">
      <header className="relative -mt-14 overflow-hidden bg-[#0b0a09] pt-[5.5rem] pb-10 text-[#f7f3ea] md:-mt-16 md:pt-28 md:pb-14">
        <div aria-hidden className="absolute inset-y-0 right-0 w-[82%] sm:w-[62%] md:w-[48%]">
          <img src="/img/programme/portrait.jpg" alt="" className="h-full w-full object-cover object-[60%_30%] opacity-55 grayscale contrast-[1.08] md:opacity-90" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#0b0a09_0%,rgb(11_10_9/0.8)_35%,rgb(11_10_9/0.2)_75%),linear-gradient(0deg,#0b0a09_0%,rgb(11_10_9/0)_45%),linear-gradient(180deg,rgb(11_10_9/0.9)_0%,rgb(11_10_9/0)_30%)]" />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 md:px-6">
          {f.memorial_name && <p className="hero-line text-[15px] text-[#cfc8bc]">{tr("In loving memory of", "Kwa kumbukumbu ya")}</p>}
          <p className="hero-line mt-1 max-w-[16ch] font-display text-[1.9rem] leading-[1.05] font-medium text-balance md:text-[2.6rem]">{name}</p>
          {f.memorial_dates && <p className="hero-line mt-2 font-display text-[1.15rem] text-[#cfc8bc] md:text-[1.3rem]">{localiseDates(f.memorial_dates, lang)}</p>}
          <h1 className="hero-line mt-7 font-display text-[clamp(3rem,9vw,5rem)] leading-none font-medium tracking-[-0.012em]">{tr("Eulogy", "Wasifu")}</h1>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
        {BOOKLET.pages > 0 ? (
          <>
            <div className="rounded-[20px] border border-[rgb(27_25_23/0.09)] bg-white p-6 md:p-8">
              <p className="font-display text-[1.6rem] leading-snug text-stone-900">{tr("The eulogy booklet", "Kitabu cha wasifu")}</p>
              <p className="mt-2 text-stone-600">
                {tr(`${BOOKLET.pages} pages. Read it below, or download it to keep.`, `Kurasa ${BOOKLET.pages}. Kisome hapa chini, au kipakue ukihifadhi.`)}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={BOOKLET.pdf}
                  download
                  className="press inline-flex min-h-12 items-center gap-2 rounded-full bg-[#0b0a09] px-5 font-semibold text-white no-underline hover:bg-[#2a2724] hover:no-underline"
                >
                  <Download className="size-5" aria-hidden /> {tr(`Download the booklet (PDF, ${BOOKLET.pdfSize.en})`, `Pakua kitabu (PDF, ${BOOKLET.pdfSize.sw})`)}
                </a>
                <Link
                  to="/gallery"
                  className="press inline-flex min-h-12 items-center gap-2 rounded-full border border-stone-300 px-5 font-semibold text-stone-900 no-underline hover:bg-stone-100 hover:no-underline"
                >
                  <Images className="size-5" aria-hidden /> {tr("Photo gallery", "Picha")}
                </Link>
                <Link
                  to="/programme"
                  className="press inline-flex min-h-12 items-center gap-2 rounded-full border border-stone-300 px-5 font-semibold text-stone-900 no-underline hover:bg-stone-100 hover:no-underline"
                >
                  <CalendarDays className="size-5" aria-hidden /> {tr("Funeral programme", "Ratiba ya mazishi")}
                </Link>
              </div>
            </div>
            <div className="mt-8 space-y-4 md:space-y-6">
              {Array.from({ length: BOOKLET.pages }, (_, i) => i + 1).map((n) => (
                <img
                  key={n}
                  src={BOOKLET.page(n)}
                  width={BOOKLET.width}
                  height={BOOKLET.height}
                  loading={n <= 2 ? "eager" : "lazy"}
                  decoding="async"
                  alt={tr(`Eulogy booklet, page ${n} of ${BOOKLET.pages}`, `Kitabu cha wasifu, ukurasa ${n} kati ya ${BOOKLET.pages}`)}
                  className="block h-auto w-full rounded-[6px] bg-white shadow-[0_10px_30px_rgb(27_25_23/0.18)]"
                />
              ))}
            </div>
          </>
        ) : paragraphs.length > 0 ? (
          <div className="space-y-5 text-[18px] leading-[1.75] text-stone-800">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <div className="rounded-[20px] border border-[rgb(27_25_23/0.09)] bg-white p-6 md:p-8">
            <p className="font-display text-[1.6rem] leading-snug text-stone-900">{tr(`The eulogy for ${name} will be shared here.`, `Wasifu wa ${name} utawekwa hapa.`)}</p>
            <p className="mt-2 text-stone-600">{tr("Please check this page again later.", "Tafadhali rudi kwenye ukurasa huu baadaye.")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/programme"
                className="press inline-flex min-h-12 items-center gap-2 rounded-full bg-[#0b0a09] px-5 font-semibold text-white no-underline hover:bg-[#2a2724] hover:no-underline"
              >
                <CalendarDays className="size-5" aria-hidden /> {tr("Funeral programme", "Ratiba ya mazishi")}
              </Link>
              <Link
                to="/"
                className="press inline-flex min-h-12 items-center gap-2 rounded-full border border-stone-300 px-5 font-semibold text-stone-900 no-underline hover:bg-stone-100 hover:no-underline"
              >
                <House className="size-5" aria-hidden /> {tr("Home", "Nyumbani")}
              </Link>
            </div>
          </div>
        )}
        {f.memorial_tribute && <p className="mt-10 text-center font-display text-[1.45rem] text-[#7c6128] italic">{f.memorial_tribute}</p>}
      </article>
    </div>
  );
}
