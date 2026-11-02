// "How do I contribute?": the giving details with copy buttons, the M-Pesa
// steps one by one, and what happens after sending. The navbar, the phone's
// bottom bar and the memorial header all lead here.

import { ArrowRight, MessageSquareText, ListChecks, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { goalOf } from "@/lib/goal";
import type { PublicPage } from "@/lib/types";
import { CopyForWhatsApp } from "./pages";
import { CardTitle, CopyRow, PageHeader, PublicCard, kes } from "./parts";
import { usePublicPage } from "./PublicLayout";
import { publicLink } from "./share";

type Giving = NonNullable<PublicPage["fundraiser"]["giving"]>;

/** 0711672840 as 0711 672 840, easier to read aloud and check. */
function spaced(number: string): string {
  return /^0\d{9}$/.test(number) ? `${number.slice(0, 4)} ${number.slice(4, 7)} ${number.slice(7)}` : number;
}

const strong = (text: string) => <strong className="font-semibold text-stone-900">{text}</strong>;

function steps(g: Giving): ReactNode[] {
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

function whatsAppText(page: PublicPage, g: Giving): string {
  const name = page.fundraiser.memorial_name || page.fundraiser.name;
  const how =
    g.method === "paybill"
      ? [`M-Pesa → Lipa na M-PESA → Pay Bill`, `Business number: ${g.number}`, `Account: ${g.account ?? ""}`]
      : g.method === "till"
        ? [`M-Pesa → Lipa na M-PESA → Buy Goods`, `Till number: ${g.number}`]
        : [`M-Pesa → Send Money`, `Number: ${g.number}`];
  return [`*How to contribute: funeral of ${name}*`, "", ...how, `Name shown: ${g.name}`, "_Check the name before entering your PIN._", "", publicLink("/contribute")].join("\n");
}

export function ContributePage() {
  const page = usePublicPage();
  const f = page.fundraiser;
  const g = f.giving;
  const goal = goalOf(f.target_minor, f.pledges, page.totals.contributions_minor);

  if (!g) {
    return <PageHeader title="How do I contribute?">The family will share how to give here soon.</PageHeader>;
  }
  const list = steps(g);
  const checkStep = list.length - 2;
  return (
    <>
      <PageHeader title="How do I contribute?">
        Through M-Pesa, in a few steps. Every contribution goes to the funeral of {f.memorial_name || f.name} and is listed on this site once it is recorded.
      </PageHeader>
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 md:px-6">
        <PublicCard className="relative overflow-hidden border-ochre-200 shadow-lg">
          <div aria-hidden className="card-glow pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-ochre-200/45 blur-3xl" />
          <div className="relative space-y-3">
            <p className="text-[13px] font-semibold tracking-[0.14em] text-ochre-800 uppercase">
              M-Pesa · {g.method === "paybill" ? "Pay Bill" : g.method === "till" ? "Buy Goods" : "Send Money"}
            </p>
            <CopyRow
              label={g.method === "paybill" ? "Business number" : g.method === "till" ? "Till number" : "Send money to"}
              value={g.number}
              display={spaced(g.number)}
            />
            {g.account && <CopyRow label="Account number" value={g.account} />}
            <p className="flex gap-3 rounded-xl bg-ochre-50 px-4 py-3 text-[16px] leading-relaxed text-ochre-950">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ochre-700" aria-hidden />
              <span>
                Before you enter your PIN, check that M-Pesa shows the name <strong className="font-semibold">{g.name}</strong>.
              </span>
            </p>
          </div>
        </PublicCard>

        <PublicCard>
          <CardTitle>Step by step</CardTitle>
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
          <CardTitle>After you send</CardTitle>
          <ul className="space-y-3 text-[16px] leading-relaxed text-stone-700">
            <li className="flex gap-3">
              <MessageSquareText className="mt-1 size-5 shrink-0 text-plum-600" aria-hidden />
              <span>Keep the M-Pesa message. Its code (for example TK3AB12CD4) lets you check your contribution here.</span>
            </li>
            <li className="flex gap-3">
              <ListChecks className="mt-1 size-5 shrink-0 text-plum-600" aria-hidden />
              <span>
                Once the family records it, your contribution appears on the list under your name as M-Pesa shows it. You can ask the family to list you
                differently, or anonymously.
              </span>
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              to="/check"
              className="press inline-flex min-h-12 items-center gap-2 rounded-xl bg-plum-800 px-5 text-[16px] font-semibold text-white no-underline hover:bg-plum-700 hover:no-underline"
            >
              Check my contribution
            </Link>
            <Link
              to="/contributions"
              className="press inline-flex min-h-12 items-center gap-2 rounded-xl border border-stone-300 bg-white px-5 text-[16px] font-semibold text-stone-900 no-underline hover:bg-stone-50 hover:no-underline"
            >
              See all contributions
            </Link>
          </div>
        </PublicCard>

        {goal?.stillNeeded ? (
          <Link
            to="/"
            className="group lift flex items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white px-5 py-4 text-stone-900 no-underline shadow-sm hover:no-underline"
          >
            <span>
              <span className="block text-[15px] text-stone-600">Still needed</span>
              <span className="block font-display text-[1.6rem] leading-tight font-semibold">{kes(goal.stillNeeded)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-[15px] font-semibold text-plum-700">
              See the goal <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </span>
          </Link>
        ) : null}

        <PublicCard>
          <p className="font-semibold text-stone-900">Share how to give</p>
          <p className="mt-1 text-[15px] text-stone-600">Send these details to family and friends on WhatsApp.</p>
          <CopyForWhatsApp text={whatsAppText(page, g)} />
        </PublicCard>
      </div>
    </>
  );
}
