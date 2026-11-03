import { HandCoins, Trophy } from "lucide-react";
import { Link } from "react-router";
import { PledgeProgressBar } from "@/components/pledges";
import { buildChallengeUpdate } from "@/lib/challengeShare";
import { formatNairobiDate } from "@/lib/time";
import type { PublicChallenge, PublicPage } from "@/lib/types";
import { localiseName, useLang, useTr, type Lang } from "./i18n";
import { CopyForWhatsApp } from "./pages";
import { PageHeader, PublicCard, kes } from "./parts";
import { usePublicPage } from "./PublicLayout";
import { publicLink } from "./share";

/** A published challenge's update, from public data only. */
function challengeText(page: PublicPage, c: PublicChallenge, lang: Lang): string {
  const entries = page.contributions
    .filter((e) => e.challenge_id === c.id)
    .reverse()
    .map((e) => ({ label: localiseName(e.label, lang), amount_minor: e.amount_minor }));
  return buildChallengeUpdate({
    challenge: { ...c, totals: c },
    entries,
    memorialName: page.fundraiser.memorial_name,
    giving: page.fundraiser.giving,
    publicUrl: publicLink(""),
    lang,
    includeList: true,
    includeGiving: true,
  });
}

/** Fun games and dares that keep the fundraiser going, and what each has raised. */
export function ChallengesPage() {
  const page = usePublicPage();
  const tr = useTr();
  const lang = useLang();
  const challenges = page.challenges ?? [];

  return (
    <>
      <PageHeader title={tr("Challenges", "Changamoto")}>
        {tr(
          "Games and dares from family and friends to keep the fundraiser going. Every shilling goes to the same funeral fund and counts towards the main target.",
          "Michezo na changamoto kutoka kwa familia na marafiki ili kuendeleza mchango. Kila shilingi inaingia kwenye mfuko uleule wa mazishi na inahesabiwa kwenye lengo kuu.",
        )}
      </PageHeader>
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 md:px-6">
        {challenges.length === 0 && (
          <PublicCard>
            <p className="text-stone-700">{tr("There are no challenges yet.", "Bado hakuna changamoto.")}</p>
          </PublicCard>
        )}
        {challenges.map((c) => {
          const name = tr(c.name, c.name_sw || c.name);
          const description = tr(c.description, c.description_sw || c.description);
          const supporters = page.contributions.filter((e) => e.challenge_id === c.id);
          const dates =
            c.starts_on && c.ends_on
              ? `${formatNairobiDate(c.starts_on)} – ${formatNairobiDate(c.ends_on)}`
              : c.ends_on
                ? tr(`Until ${formatNairobiDate(c.ends_on)}`, `Hadi ${formatNairobiDate(c.ends_on)}`)
                : c.starts_on
                  ? tr(`From ${formatNairobiDate(c.starts_on)}`, `Kuanzia ${formatNairobiDate(c.starts_on)}`)
                  : null;
          return (
            <PublicCard key={c.id} id={`challenge-${c.id}`}>
              <p className="mb-1 flex flex-wrap items-center gap-x-2 text-[13px] font-semibold tracking-[0.14em] text-stone-500 uppercase">
                <Trophy className="size-4 text-ochre-700" aria-hidden />
                {c.status === "active" ? tr("Open", "Inaendelea") : tr("Closed", "Imefungwa")}
                {dates && <span>· {dates}</span>}
              </p>
              <h2 className="font-display text-[1.7rem] leading-tight font-semibold text-stone-900">{name}</h2>
              {description && <p className="mt-2 leading-relaxed whitespace-pre-line text-stone-800">{description}</p>}

              <div className="mt-4 rounded-xl bg-stone-50 p-4">
                <p className="font-display text-[2rem] leading-none font-semibold text-stone-900 tabular-nums">{kes(c.raised_minor)}</p>
                <p className="mt-1 text-[15px] text-stone-600">
                  {tr(
                    `raised from ${c.contributions_count} contribution${c.contributions_count === 1 ? "" : "s"}`,
                    `zimechangwa kutoka michango ${c.contributions_count}`,
                  )}
                  {c.target_minor ? tr(` · target ${kes(c.target_minor)}`, ` · lengo ${kes(c.target_minor)}`) : ""}
                </p>
                {c.target_minor ? <PledgeProgressBar received={c.raised_minor} amount={c.target_minor} className="mt-3 h-2.5" /> : null}
                {c.pledged_outstanding_minor > 0 && (
                  <p className="mt-2 text-[15px] text-stone-600">
                    {tr(`${kes(c.pledged_outstanding_minor)} pledged, not yet received`, `${kes(c.pledged_outstanding_minor)} zimeahidiwa, bado hazijapokelewa`)}
                  </p>
                )}
              </div>

              {supporters.length > 0 && (
                <p className="mt-3 text-[15px] text-stone-600">
                  {tr("Latest: ", "Wa karibuni: ")}
                  {supporters
                    .slice(0, 6)
                    .map((e) => localiseName(e.label, lang))
                    .join(" · ")}
                  {supporters.length > 6 ? tr(" and others", " na wengine") : ""}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {c.status === "active" && page.fundraiser.giving && (
                  <Link
                    to="/contribute"
                    className="press inline-flex min-h-11 items-center gap-2 rounded-full bg-plum-900 px-5 font-semibold text-white no-underline hover:bg-plum-800 hover:no-underline"
                  >
                    <HandCoins className="size-4" aria-hidden />
                    {tr("Take part", "Shiriki")}
                  </Link>
                )}
              </div>
              <CopyForWhatsApp text={challengeText(page, c, lang)} />
            </PublicCard>
          );
        })}
      </div>
    </>
  );
}
