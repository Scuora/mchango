// One announcement on its own page, linked from the home page and the updates
// list. A pinned update (such as the burial date) also shows the place of
// burial, with the map pin and directions from where the visitor is.

import { ArrowLeft, Calendar, Check, Copy, MapPin, Navigation } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { coordinatesIn, directionsLink } from "@/lib/maps";
import { formatNairobiLongDate } from "@/lib/time";
import { Linked } from "./linked";
import { localiseDates, useLang, useTr } from "./i18n";
import { CopyForWhatsApp, announcementText } from "./pages";
import { PageHeader, PublicCard } from "./parts";
import { usePublicPage } from "./PublicLayout";
import { copyText } from "./share";

export function BurialPlace({ when, place, mapUrl }: { when: string | null; place: string | null; mapUrl: string | null }) {
  const tr = useTr();
  const lang = useLang();
  const [copied, setCopied] = useState(false);
  const coords = coordinatesIn(mapUrl);
  const directions = coords ? directionsLink(coords) : null;
  const location = [place, mapUrl].filter(Boolean).join(" – ");
  return (
    <PublicCard className="relative overflow-hidden">
      <div aria-hidden className="card-glow pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-ochre-200/50 blur-3xl" />
      <div className="relative">
        <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold tracking-[0.14em] text-ochre-800 uppercase">
          <MapPin className="size-4" aria-hidden /> {tr("Place of burial", "Mahali pa mazishi")}
        </p>
        <h2 className="font-display text-[2.1rem] leading-tight font-semibold text-stone-900">{place ?? tr("See the map pin", "Tazama alama ya ramani")}</h2>
        {when && (
          <p className="mt-1.5 flex items-center gap-2 text-[17px] text-stone-700">
            <Calendar className="size-4 text-ochre-700" aria-hidden /> {localiseDates(when, lang)}
          </p>
        )}
        {coords && (
          <p className="mt-1 text-[14px] text-stone-500 tabular-nums">
            {tr("Map pin", "Alama ya ramani")} {coords.lat}, {coords.lng}
          </p>
        )}
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {directions && (
            <a
              href={directions}
              target="_blank"
              rel="noreferrer"
              className="press flex min-h-12 items-center justify-center gap-2 rounded-xl bg-plum-800 px-4 text-[16px] font-semibold text-white no-underline hover:bg-plum-700 hover:no-underline"
            >
              <Navigation className="size-4" aria-hidden /> {tr("Get directions", "Pata maelekezo")}
            </a>
          )}
          {mapUrl && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              className="press flex min-h-12 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-[16px] font-semibold text-stone-900 no-underline hover:bg-stone-50 hover:no-underline"
            >
              <MapPin className="size-4" aria-hidden /> {tr("Open the map pin", "Fungua alama ya ramani")}
            </a>
          )}
        </div>
        {location && (
          <button
            type="button"
            onClick={() => void copyText(location).then((ok) => ok && (setCopied(true), window.setTimeout(() => setCopied(false), 2000)))}
            className="mt-2.5 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-[15px] font-medium text-stone-700 hover:bg-white/70"
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? tr("Copied", "Imenakiliwa") : tr("Copy the place and map link", "Nakili mahali na kiungo cha ramani")}
          </button>
        )}
        {directions && (
          <p className="mt-2 text-center text-[14px] text-stone-500">
            {tr("“Get directions” opens Google Maps with the route from where you are.", "“Pata maelekezo” hufungua Google Maps ikionyesha njia kutoka ulipo.")}
          </p>
        )}
      </div>
    </PublicCard>
  );
}

export function UpdatePage() {
  const page = usePublicPage();
  const tr = useTr();
  const lang = useLang();
  const { id } = useParams();
  const update = page.announcements.find((a) => String(a.id) === id);
  const { when, place, map_url } = page.fundraiser.funeral;

  if (!update) {
    return (
      <PageHeader title={tr("Update not found", "Taarifa haijapatikana")}>
        {tr("It may have been taken down.", "Huenda imeondolewa.")} <Link to="/updates">{tr("See all updates", "Tazama taarifa zote")}</Link>
      </PageHeader>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 md:px-6">
      <Link to="/updates" className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold">
        <ArrowLeft className="size-4" aria-hidden /> {tr("All updates", "Taarifa zote")}
      </Link>
      <article>
        <p className="mb-1 text-[13px] font-semibold tracking-[0.14em] text-stone-500 uppercase">
          {update.pinned ? tr("Important · ", "Muhimu · ") : ""}
          {formatNairobiLongDate(update.published_at)}
        </p>
        <h1 className="font-display text-[2.4rem] leading-tight font-semibold text-stone-900">{tr(update.title, update.title_sw || update.title)}</h1>
        {update.body && (
          <p className="mt-3 text-[18px] leading-relaxed whitespace-pre-line text-stone-800">
            <Linked text={tr(update.body, update.body_sw || update.body)} />
          </p>
        )}
      </article>
      {update.pinned && (place || map_url) && <BurialPlace when={when} place={place} mapUrl={map_url} />}
      <PublicCard>
        <p className="font-semibold text-stone-900">{tr("Share this update", "Shiriki taarifa hii")}</p>
        <CopyForWhatsApp text={announcementText(page, update, lang)} />
      </PublicCard>
    </div>
  );
}
