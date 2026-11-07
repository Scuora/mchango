// The top of the home page: his photograph, in black and white, with the light
// on it changing through the funeral days; his name; what is on; and the two days
// of the programme as photo cards. The wording and timing come from memorialDay.ts.

import { clsx } from "clsx";
import { Images } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { PublicPage } from "@/lib/types";
import { localiseDates, useLang, useTr, type Lang } from "./i18n";
import { WORDS, dayCard, heroActions, heroStatus, memorialPhase, type DayKey, type Phase } from "./memorialDay";
import { PROGRAMME } from "./programme";
import { pick, useNow } from "./programmeParts";

// The photo settles and the text rises once per visit, not on every return to the home page.
let played = false;

/** "Daktari Joseph Karisa Gonzi" on two lines: "Daktari Joseph" over "Karisa Gonzi". */
function nameLines(name: string): string[] {
  const words = name.split(" ");
  if (words.length < 2) return [name];
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(" "), words.slice(half).join(" ")];
}

export function MemorialHero({ page }: { page: PublicPage }) {
  const tr = useTr();
  const lang = useLang();
  const t = useNow().getTime();
  const [first] = useState(() => !played);
  useEffect(() => {
    played = true;
  }, []);
  const f = page.fundraiser;
  const name = f.memorial_name ?? f.name;
  const phase = memorialPhase(t);
  const status = heroStatus(phase, t);
  const pinned = page.announcements.find((a) => a.pinned);
  const actions = heroActions(phase, pinned ? `/updates/${pinned.id}` : "/updates").filter((a) => a.to !== "/contribute" || f.giving);
  const lines = nameLines(name);

  return (
    <div className="mh -mt-14 md:-mt-16" data-phase={phase}>
      <section className={clsx("mh-stage", first && "mh-first")} aria-labelledby="memorial-name">
        <img
          className="mh-photo"
          src="/img/programme/portrait.jpg"
          srcSet="/img/programme/portrait-800.jpg 800w, /img/programme/portrait.jpg 1400w"
          sizes="(max-width: 760px) 100vw, min(70vw, 1100px)"
          width={1400}
          height={1400}
          alt={tr(`Portrait of ${name}`, `Picha ya ${name}`)}
          fetchPriority="high"
        />
        <div className="mh-light" aria-hidden />
        <div className="mh-inner">
          {f.memorial_name && <p className="mh-eye">{tr("In loving memory of", "Kwa kumbukumbu ya")}</p>}
          <h1 id="memorial-name" className="mh-name">
            {lines.map((line, i) => (
              <span key={line} className="block">
                {line}
                {i < lines.length - 1 && " "}
              </span>
            ))}
          </h1>
          {f.memorial_dates && <p className="mh-dates">{localiseDates(f.memorial_dates, lang)}</p>}
          {f.memorial_tribute && <p className="mh-epi">{f.memorial_tribute}</p>}
          {/* Not a live region: it changes a few times a day and should not interrupt anyone. */}
          <div className={clsx("mh-status", !status.flame && "no-flame")}>
            {status.flame && <span className="mh-flame" aria-hidden />}
            {status.label && <p className="mh-sl">{pick(status.label, lang)}</p>}
            <p className="mh-sm">{pick(status.main, lang)}</p>
            {status.sub && <p className="mh-ss">{pick(status.sub, lang)}</p>}
          </div>
          <div className="mh-acts">
            {actions.map((action, i) => (
              <Link key={action.to + i} to={action.to} className={clsx("mh-btn", i === 0 ? "mh-primary" : "mh-secondary")}>
                {pick(action.label, lang)}
              </Link>
            ))}
            {/* The photographs from his eulogy booklet, on every day of the funeral and after. */}
            <Link to="/gallery" className="mh-btn mh-secondary gap-2">
              <Images className="size-[18px]" aria-hidden />
              {tr("Photo gallery", "Picha")}
            </Link>
          </div>
        </div>
      </section>
      <section className="mh-days" aria-label={tr("Funeral programme", "Ratiba ya mazishi")}>
        <DayCard day="fri" phase={phase} t={t} lang={lang} />
        <DayCard day="sat" phase={phase} t={t} lang={lang} />
      </section>
    </div>
  );
}

function DayCard({ day, phase, t, lang }: { day: DayKey; phase: Phase; t: number; lang: Lang }) {
  const tr = useTr();
  const friday = day === "fri";
  const programme = PROGRAMME[friday ? 0 : 1];
  const card = dayCard(day, phase, t);
  return (
    <article className={clsx("mh-card", card.current && "is-today", card.past && "is-past")}>
      <img src={programme.cover} alt="" loading="lazy" decoding="async" />
      {card.chip && <span className="mh-chip">{pick(card.chip, lang)}</span>}
      <p className="mh-cd">{pick(friday ? WORDS.friDay : WORDS.satDay, lang)}</p>
      <h2 className="mh-ct">
        <Link to={`/programme/${programme.id}`} className="mh-link">
          {pick(friday ? WORDS.friTitle : WORDS.satTitle, lang)}
        </Link>
      </h2>
      <p className="mh-cw">{pick(friday ? WORDS.friWhere : WORDS.satWhere, lang)}</p>
      <ol className="mh-stops">
        {card.stops.map(({ stop, state }) => (
          <li key={stop.text[0]} className={state ? `is-${state}` : undefined}>
            <span className="mh-time">{pick(stop.time, lang)}</span>
            <span>
              {state === "now" && <span className="sr-only">{tr("Now: ", "Sasa: ")}</span>}
              {pick(stop.text, lang)}
            </span>
          </li>
        ))}
      </ol>
      <span className="mh-more" aria-hidden>
        {tr("See the programme", "Tazama ratiba")}
      </span>
    </article>
  );
}
