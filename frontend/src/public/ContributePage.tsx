// "How do I contribute?": the giving details with copy buttons, the M-Pesa
// steps one by one, and what happens after sending. The navbar, the phone's
// bottom bar and the memorial header all lead here.

import { MessageSquareText, ListChecks, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { PublicPage } from "@/lib/types";
import { langPath, useLang, useTr, type Lang } from "./i18n";
import { CopyForWhatsApp } from "./pages";
import { CardTitle, CopyRow, PageHeader, PublicCard } from "./parts";
import { usePublicPage } from "./PublicLayout";
import { publicLink } from "./share";

type Giving = NonNullable<PublicPage["fundraiser"]["giving"]>;

/** 0711672840 as 0711 672 840, easier to read aloud and check. */
function spaced(number: string): string {
  return /^0\d{9}$/.test(number) ? `${number.slice(0, 4)} ${number.slice(4, 7)} ${number.slice(7)}` : number;
}

const strong = (text: string) => <strong className="font-semibold text-stone-900">{text}</strong>;

function steps(g: Giving, lang: Lang): ReactNode[] {
  if (lang === "sw") {
    const open = <>Fungua {strong("M-PESA")} kwenye simu yako: programu ya M-PESA, au menyu ya SIM.</>;
    const amount = <>Weka {strong("kiasi")} unachotaka kuchangia.</>;
    const check = <>Kabla ya kuweka PIN yako, hakikisha M-Pesa inaonyesha jina {strong(g.name)}.</>;
    const pin = <>Weka {strong("PIN yako ya M-PESA")} kisha utume. Utapokea ujumbe wa uthibitisho wenye namba ya muamala.</>;
    if (g.method === "paybill") {
      return [open, <>Chagua {strong("Lipa na M-PESA")}, kisha {strong("Pay Bill")}.</>, <>Weka namba ya biashara {strong(g.number)}.</>, <>Weka namba ya akaunti {strong(g.account ?? "")}.</>, amount, check, pin];
    }
    if (g.method === "till") {
      return [open, <>Chagua {strong("Lipa na M-PESA")}, kisha {strong("Buy Goods and Services")}.</>, <>Weka namba ya till {strong(g.number)}.</>, amount, check, pin];
    }
    return [open, <>Chagua {strong("Tuma Pesa")}.</>, <>Weka namba {strong(spaced(g.number))}.</>, amount, check, pin];
  }
  const open = <>Open {strong("M-PESA")} on your phone: the M-PESA app, or the SIM menu.</>;
  const amount = <>Enter the {strong("amount")} you wish to give.</>;
  const check = (
    <>
      Before you enter your PIN, check that M-Pesa shows the name {strong(g.name)}.
    </>
  );
  const pin = <>Enter your {strong("M-PESA PIN")} and send. You will get a confirmation message with a code.</>;
  if (g.method === "paybill") {
    return [open, <>Choose {strong("Lipa na M-PESA")}, then {strong("Pay Bill")}.</>, <>Enter business number {strong(g.number)}.</>, <>Enter account number {strong(g.account ?? "")}.</>, amount, check, pin];
  }
  if (g.method === "till") {
    return [open, <>Choose {strong("Lipa na M-PESA")}, then {strong("Buy Goods and Services")}.</>, <>Enter till number {strong(g.number)}.</>, amount, check, pin];
  }
  return [open, <>Choose {strong("Send Money")}.</>, <>Enter the number {strong(spaced(g.number))}.</>, amount, check, pin];
}

function whatsAppText(page: PublicPage, g: Giving, lang: Lang): string {
  const name = page.fundraiser.memorial_name || page.fundraiser.name;
  const link = publicLink(langPath("/contribute", lang));
  if (lang === "sw") {
    const how =
      g.method === "paybill"
        ? [`M-Pesa → Lipa na M-PESA → Pay Bill`, `Namba ya biashara: ${g.number}`, `Akaunti: ${g.account ?? ""}`]
        : g.method === "till"
          ? [`M-Pesa → Lipa na M-PESA → Buy Goods`, `Namba ya till: ${g.number}`]
          : [`M-Pesa → Tuma Pesa`, `Namba: ${g.number}`];
    return [`*Jinsi ya kuchangia: mazishi ya ${name}*`, "", ...how, `Jina litakaloonyeshwa: ${g.name}`, "_Hakikisha jina kabla ya kuweka PIN yako._", "", link].join("\n");
  }
  const how =
    g.method === "paybill"
      ? [`M-Pesa → Lipa na M-PESA → Pay Bill`, `Business number: ${g.number}`, `Account: ${g.account ?? ""}`]
      : g.method === "till"
        ? [`M-Pesa → Lipa na M-PESA → Buy Goods`, `Till number: ${g.number}`]
        : [`M-Pesa → Send Money`, `Number: ${g.number}`];
  return [`*How to contribute: funeral of ${name}*`, "", ...how, `Name shown: ${g.name}`, "_Check the name before entering your PIN._", "", link].join("\n");
}

export function ContributePage() {
  const page = usePublicPage();
  const tr = useTr();
  const lang = useLang();
  const f = page.fundraiser;
  const g = f.giving;

  if (!g) {
    return (
      <PageHeader title={tr("How do I contribute?", "Nitachangiaje?")}>
        {tr("The family will share how to give here soon.", "Familia itaweka hapa maelezo ya jinsi ya kuchangia hivi karibuni.")}
      </PageHeader>
    );
  }
  const list = steps(g, lang);
  const checkStep = list.length - 2;
  return (
    <>
      <PageHeader title={tr("How do I contribute?", "Nitachangiaje?")}>
        {tr(
          `Through M-Pesa, in a few steps. Every contribution goes to the funeral of ${f.memorial_name || f.name} and is listed on this site once it is recorded.`,
          `Kupitia M-Pesa, kwa hatua chache. Kila mchango unaenda kwenye mazishi ya ${f.memorial_name || f.name} na huorodheshwa kwenye tovuti hii ukisharekodiwa.`,
        )}
      </PageHeader>
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 md:px-6">
        <PublicCard className="relative overflow-hidden">
          <div aria-hidden className="card-glow pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-ochre-200/45 blur-3xl" />
          <div className="relative space-y-3">
            <p className="text-[13px] font-semibold tracking-[0.14em] text-ochre-800 uppercase">
              M-Pesa · {g.method === "paybill" ? "Pay Bill" : g.method === "till" ? "Buy Goods" : tr("Send Money", "Tuma Pesa")}
            </p>
            <CopyRow
              label={
                g.method === "paybill"
                  ? tr("Business number", "Namba ya biashara")
                  : g.method === "till"
                    ? tr("Till number", "Namba ya till")
                    : tr("Send money to", "Tuma pesa kwa")
              }
              value={g.number}
              display={spaced(g.number)}
            />
            {g.account && <CopyRow label={tr("Account number", "Namba ya akaunti")} value={g.account} />}
            <p className="flex gap-3 rounded-xl bg-ochre-50 px-4 py-3 text-[16px] leading-relaxed text-ochre-950">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ochre-700" aria-hidden />
              <span>
                {tr("Before you enter your PIN, check that M-Pesa shows the name", "Kabla ya kuweka PIN yako, hakikisha M-Pesa inaonyesha jina")}{" "}
                <strong className="font-semibold">{g.name}</strong>.
              </span>
            </p>
          </div>
        </PublicCard>

        <PublicCard>
          <CardTitle>{tr("Step by step", "Hatua kwa hatua")}</CardTitle>
          <ol className="stagger">
            {list.map((step, i) => (
              <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                {i < list.length - 1 && <span aria-hidden className="absolute top-10 bottom-1 left-[17px] w-px bg-ochre-200" />}
                <span
                  className={
                    i === checkStep
                      ? "grid size-9 shrink-0 place-items-center rounded-full bg-ochre-400 font-semibold text-white"
                      : "grid size-9 shrink-0 place-items-center rounded-full bg-ochre-100 font-semibold text-ochre-900 ring-1 ring-ochre-300"
                  }
                >
                  {i + 1}
                </span>
                <p className={i === checkStep ? "pt-1 text-[17px] leading-relaxed text-ochre-950" : "pt-1 text-[17px] leading-relaxed text-stone-800"}>{step}</p>
              </li>
            ))}
          </ol>
        </PublicCard>

        <PublicCard>
          <CardTitle>{tr("After you send", "Baada ya kutuma")}</CardTitle>
          <ul className="space-y-3 text-[16px] leading-relaxed text-stone-700">
            <li className="flex gap-3">
              <MessageSquareText className="mt-1 size-5 shrink-0 text-plum-600" aria-hidden />
              <span>
                {tr(
                  "Keep the M-Pesa message. Its code (for example TK3AB12CD4) lets you check your contribution here.",
                  "Hifadhi ujumbe wa M-Pesa. Namba yake ya muamala (kwa mfano TK3AB12CD4) itakuwezesha kuhakiki mchango wako hapa.",
                )}
              </span>
            </li>
            <li className="flex gap-3">
              <ListChecks className="mt-1 size-5 shrink-0 text-plum-600" aria-hidden />
              <span>
                {tr(
                  "Once the family records it, your contribution appears on the list under your name as M-Pesa shows it. You can ask the family to list you differently, or anonymously.",
                  "Familia ikisharekodi, mchango wako utaonekana kwenye orodha kwa jina lako kama M-Pesa inavyolionyesha. Unaweza kuiomba familia ikuorodheshe kwa jina tofauti, au bila jina.",
                )}
              </span>
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              to="/check"
              className="press inline-flex min-h-12 items-center gap-2 rounded-xl bg-plum-800 px-5 text-[16px] font-semibold text-white no-underline hover:bg-plum-700 hover:no-underline"
            >
              {tr("Check my contribution", "Hakiki mchango wangu")}
            </Link>
            <Link
              to="/contributions"
              className="press inline-flex min-h-12 items-center gap-2 rounded-xl border border-stone-300 bg-white px-5 text-[16px] font-semibold text-stone-900 no-underline hover:bg-stone-50 hover:no-underline"
            >
              {tr("See all contributions", "Tazama michango yote")}
            </Link>
          </div>
        </PublicCard>


        <PublicCard>
          <p className="font-semibold text-stone-900">{tr("Share how to give", "Shiriki jinsi ya kuchangia")}</p>
          <p className="mt-1 text-[15px] text-stone-600">{tr("Send these details to family and friends on WhatsApp.", "Tuma maelezo haya kwa familia na marafiki kwenye WhatsApp.")}</p>
          <CopyForWhatsApp text={whatsAppText(page, g, lang)} />
        </PublicCard>
      </div>
    </>
  );
}
