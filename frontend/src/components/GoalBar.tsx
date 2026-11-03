// The target as two bars side by side, sized by their share of it: the part
// received from the family of the deceased, then the part asked of family,
// friends and well-wishers. Gold is money received; hatched gold is pledged
// but not yet in; the pale track is what is still needed.

import type { CSSProperties, ReactNode } from "react";
import { CountUp } from "@/components/CountUp";
import type { Goal } from "@/lib/goal";
import { formatKesShort } from "@/lib/money";
import { useTr } from "@/public/i18n";

const kes = formatKesShort;
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const share = (part: number, whole: number) => (whole > 0 ? Math.min(100, (part * 100) / whole) : 0);

type Swatch = "pledged" | "received" | "needed";

function Row({ swatch, label, value, note }: { swatch: Swatch; label: ReactNode; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className={`goal-swatch goal-${swatch} mt-1.5 size-3 shrink-0 rounded-[4px]`} aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-stone-700">{label}</dt>
        {note && <p className="text-[14px] text-stone-500">{note}</p>}
      </div>
      <dd className="shrink-0 text-right font-semibold text-stone-900 tabular-nums">{value}</dd>
    </div>
  );
}

/** One bar: received (solid), then pledged but not yet in (hatched), then the track. */
function Bar({ received, pledged, whole, wait }: { received: number; pledged: number; whole: number; wait: number }) {
  const r = share(received, whole);
  const p = Math.min(100 - r, share(pledged, whole));
  return (
    <div className="goal-needed relative h-4 overflow-hidden rounded-full">
      {p > 0 && (
        <div className="bar-grow goal-pledged hatch-drift absolute inset-y-0 rounded-r-full" style={{ ...delay(wait + 300), left: `${r}%`, width: `${p}%` }} />
      )}
      <div className="bar-grow bar-sheen relative h-full rounded-full bg-[var(--color-data-in)]" style={{ ...delay(wait), width: `${r}%`, minWidth: received > 0 ? "0.5rem" : 0 }} />
    </div>
  );
}

/** `family` is how the deceased's family is named, e.g. "the family of Karisa Gonzi" (see familyOf). */
export function GoalBar({ goal, family, className }: { goal: Goal; family: string; className?: string }) {
  const tr = useTr();
  const { target, familyPledged, familyReceived, familyOutstanding, othersReceived, othersOutstanding, othersShare, stillNeeded } = goal;
  const twoParts = target !== null && familyPledged > 0 && othersShare !== null && othersShare > 0;
  const label = [
    familyPledged > 0 && `${tr("Received from", "Kutoka kwa")} ${family} ${kes(familyPledged)}`,
    `${tr("from family, friends and well-wishers", "kutoka kwa familia, marafiki na wahisani")} ${kes(othersReceived)}${othersShare !== null ? ` ${tr("of", "kati ya")} ${kes(othersShare)}` : ""}`,
    othersOutstanding > 0 && `${tr("pledged, not yet received", "ahadi ambazo bado hazijapokelewa")} ${kes(othersOutstanding)}`,
    stillNeeded !== null && `${tr("still needed", "bado kinahitajika")} ${kes(stillNeeded)}`,
  ]
    .filter(Boolean)
    .join("; ");

  return (
    <div className={className}>
      {target !== null && (
        <div
          role="img"
          aria-label={label}
          className="grid items-end gap-x-1.5 gap-y-1.5"
          style={{ gridTemplateColumns: twoParts ? `minmax(1.5rem, ${familyPledged}fr) minmax(1.5rem, ${othersShare}fr)` : "1fr" }}
        >
          {twoParts && (
            <>
              {/* One row for both labels, so a narrow side never cuts its label short. */}
              <p className="col-span-2 flex flex-wrap justify-between gap-x-3 text-[13px] font-semibold tracking-[0.08em] text-stone-500 uppercase">
                <span>{family.replace(/^the /, "")}</span>
                <span className="text-right">
                  <span className="sm:hidden">{tr("Well-wishers", "Wahisani")}</span>
                  <span className="hidden sm:inline">{tr("Family, friends & well-wishers", "Familia, marafiki na wahisani")}</span>
                </span>
              </p>
              {/* The family's share is counted as received from the family, so it is shown in full. */}
              <Bar received={familyPledged} pledged={0} whole={familyPledged} wait={250} />
              <Bar received={othersReceived} pledged={othersOutstanding} whole={othersShare ?? 0} wait={650} />
            </>
          )}
          {!twoParts && (
            <Bar received={othersReceived + familyReceived} pledged={othersOutstanding + familyOutstanding} whole={target} wait={250} />
          )}
        </div>
      )}

      <dl className="mt-3 divide-y divide-stone-100 text-[16px]">
        {familyPledged > 0 && (
          <Row swatch="received" label={`${tr("Received from", "Kutoka kwa")} ${family}`} value={<CountUp value={familyPledged} format={kes} />} />
        )}
        <Row
          swatch="received"
          label={familyPledged > 0 ? tr("From family, friends and well-wishers", "Kutoka kwa familia, marafiki na wahisani") : tr("Received so far", "Zilizopokelewa hadi sasa")}
          note={othersShare !== null ? tr(`of ${kes(othersShare)} asked for`, `kati ya ${kes(othersShare)} zilizoombwa`) : undefined}
          value={<CountUp value={familyPledged > 0 ? othersReceived : othersReceived + familyReceived} format={kes} />}
        />
        {othersOutstanding > 0 && (
          <Row
            swatch="pledged"
            label={tr("Pledged by family, friends and well-wishers, not yet received", "Ahadi za familia, marafiki na wahisani ambazo bado hazijapokelewa")}
            value={<CountUp value={othersOutstanding} format={kes} />}
          />
        )}
        {stillNeeded !== null && (
          <Row
            swatch="needed"
            label={tr("Still needed", "Bado kinahitajika")}
            note={
              othersOutstanding > 0 && stillNeeded > 0
                ? tr(`${kes(Math.min(othersOutstanding, stillNeeded))} of it is pledged`, `${kes(Math.min(othersOutstanding, stillNeeded))} kati yake zimeahidiwa`)
                : undefined
            }
            value={stillNeeded === 0 ? tr("Reached", "Limefikiwa") : <CountUp value={stillNeeded} format={kes} />}
          />
        )}
      </dl>
    </div>
  );
}
