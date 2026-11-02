// How a pledge looks wherever it appears. The colours follow the goal bar:
// hatched gold is promised, solid gold is money received; the badge says
// where the pledge stands (sage once it is fully received).

import { clsx } from "clsx";
import { Check, CircleDashed, HandHeart } from "lucide-react";
import type { CSSProperties } from "react";
import type { PledgeStatus, PledgedBy } from "@/lib/types";
import { useTr } from "@/public/i18n";

export const STATUS_LABEL: Record<PledgeStatus, string> = {
  pledged: "Pledged",
  part_received: "Part received",
  received: "Received",
};

const STATUS_STYLE: Record<PledgeStatus, string> = {
  pledged: "bg-white text-ochre-900 ring-ochre-300",
  part_received: "bg-ochre-100 text-ochre-900 ring-ochre-200",
  received: "bg-sage-100 text-sage-800 ring-sage-200",
};

const STATUS_LABEL_SW: Record<PledgeStatus, string> = {
  pledged: "Ahadi",
  part_received: "Imepokelewa kiasi",
  received: "Imepokelewa",
};

/** The status in the visitor's language (English in management). */
export function useStatusLabel(): (status: PledgeStatus) => string {
  const tr = useTr();
  return (status) => tr(STATUS_LABEL[status], STATUS_LABEL_SW[status]);
}

export function PledgeStatusBadge({ status, className }: { status: PledgeStatus; className?: string }) {
  const label = useStatusLabel();
  const Icon = status === "received" ? Check : status === "part_received" ? CircleDashed : HandHeart;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold whitespace-nowrap ring-1 ring-inset", STATUS_STYLE[status], className)}>
      <Icon className="size-3.5" aria-hidden />
      {label(status)}
    </span>
  );
}

export function PledgeGroupTag({ by, className }: { by: PledgedBy; className?: string }) {
  const tr = useTr();
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-semibold tracking-wide whitespace-nowrap uppercase",
        by === "family" ? "bg-plum-100 text-plum-800" : "bg-stone-100 text-stone-600",
        className,
      )}
    >
      {by === "family" ? tr("Family share", "Sehemu ya familia") : tr("Well-wisher", "Mhisani")}
    </span>
  );
}

/** The promise as a hatched track that fills with gold as money comes in. */
export function PledgeProgressBar({ received, amount, delay = 0, className }: { received: number; amount: number; delay?: number; className?: string }) {
  const filled = amount > 0 ? Math.min(100, (received * 100) / amount) : 0;
  return (
    <div className={clsx("goal-pledged relative h-2 overflow-hidden rounded-full", className)} aria-hidden>
      <div
        className={clsx("bar-grow h-full rounded-full", filled >= 100 ? "bg-sage-600" : "bg-[var(--color-data-in)]")}
        style={{ "--d": `${delay}ms`, width: `${filled}%`, minWidth: received > 0 ? "0.4rem" : 0 } as CSSProperties}
      />
    </div>
  );
}
