import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, CircleDashed, FileWarning, GitCompareArrows, ListTree, Merge, Trophy, Wallet } from "lucide-react";
import { Link } from "react-router";
import { formatKes } from "@/lib/money";
import { ATTENTION_LABELS, KIND_LABELS, RECONCILIATION_LABELS } from "@/lib/labels";
import { formatNairobi } from "@/lib/time";
import type { Direction, Kind, ListItem, ReconciliationStatus } from "@/lib/types";
import { Badge, type Tone } from "./ui/misc";
import { PledgeGroupTag } from "./pledges";

/** An amount with its direction: + for money in, − for money out. */
export function Amount({ minor, direction, kind, className }: { minor: number; direction?: Direction | null; kind?: Kind; className?: string }) {
  const promise = kind === "pledge" || kind === "commitment";
  const sign = promise || !direction ? "" : direction === "in" ? "+" : "−";
  return (
    <span
      className={clsx(
        "font-semibold whitespace-nowrap tabular-nums",
        promise ? "text-stone-500" : direction === "in" ? "text-sage-800" : direction === "out" ? "text-brick-800" : "text-stone-900",
        className,
      )}
    >
      {sign}
      {formatKes(minor)}
    </span>
  );
}

const kindTones: Partial<Record<Kind, Tone>> = {
  contribution: "success",
  expense: "danger",
  charge: "warning",
  personal: "neutral",
  transfer: "info",
};

export function KindBadge({ kind }: { kind: Kind }) {
  return <Badge tone={kindTones[kind] ?? "neutral"}>{KIND_LABELS[kind]}</Badge>;
}

export function ReconciliationBadge({ status }: { status: ReconciliationStatus }) {
  if (status === "not_applicable") return null;
  const tone: Tone = status === "matched" ? "success" : status === "conflict" ? "danger" : "neutral";
  const Icon = status === "matched" ? CheckCircle2 : status === "conflict" ? GitCompareArrows : CircleDashed;
  return (
    <Badge tone={tone}>
      <Icon className="size-3.5" aria-hidden />
      {RECONCILIATION_LABELS[status]}
    </Badge>
  );
}

/** The most useful short name for a record in a management list. */
/** A payment out made from several accounts: one of its parts. */
export function isPaidTogether(item: ListItem): boolean {
  return item.kind === "expense" && item.group !== null;
}

/** The badge that says a record belongs with others: merged with other payments, or paid from several accounts. */
export function GroupBadge({ item, asEntry }: { item: ListItem; asEntry: boolean }) {
  if (!item.group) return null;
  const count = item.group.count;
  return (
    <Badge tone="info">
      {isPaidTogether(item) ? <Wallet className="size-3.5" aria-hidden /> : <Merge className="size-3.5" aria-hidden />}
      {isPaidTogether(item)
        ? asEntry
          ? `Paid from ${count} accounts`
          : "Part of a payment from several accounts"
        : asEntry
          ? `${count} payments merged`
          : `Merged as ${item.group.public_name ?? "Anonymous"}`}
    </Badge>
  );
}

export function itemLabel(item: ListItem): string {
  if (item.kind === "contribution" && item.shares?.length) {
    const names = item.shares.map((s) => s.public_name ?? "Anonymous");
    return names.length <= 2 ? names.join(" & ") : `${names[0]}, ${names[1]} +${names.length - 2}`;
  }
  if (item.kind === "contribution" || item.kind === "pledge") {
    return item.public_name ?? item.counterparty ?? "Anonymous";
  }
  if (item.kind === "transfer") {
    return `${item.account_name ?? "?"} → ${item.to_account_name ?? "?"}`;
  }
  return item.description || item.counterparty || item.public_name || KIND_LABELS[item.kind];
}

/** The challenge a record came in through. */
export function ChallengeTag({ name }: { name: string }) {
  return (
    <Badge tone="info" className="max-w-full min-w-0">
      <Trophy className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate" title={name}>
        {name}
      </span>
    </Badge>
  );
}

/**
 * One record in a list. `combined` shows a merged entry as one line (its name and
 * total); `select` adds a tick box beside it for choosing payments to merge (a
 * blank space of the same width when it cannot be merged, so rows stay aligned).
 */
export function TransactionRow({
  item,
  combined = false,
  select,
}: {
  item: ListItem;
  combined?: boolean;
  select?: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean };
}) {
  const asGroup = combined && item.group && item.group.count > 1 ? item.group : null;
  return (
    <li className={clsx(select && "flex items-start", select?.checked && "bg-plum-50/60")}>
      {select &&
        (select.disabled ? (
          <span className="w-9 shrink-0 sm:w-10" aria-hidden />
        ) : (
          <label className="grid min-h-11 w-9 shrink-0 cursor-pointer place-items-center self-stretch pl-4 sm:w-10 sm:pl-5">
            <input
              type="checkbox"
              aria-label={`Choose ${itemLabel(item)} to merge`}
              className="size-5 rounded border-stone-400 accent-plum-700"
              checked={select.checked}
              onChange={(e) => select.onChange(e.target.checked)}
            />
          </label>
        ))}
      <Link
        to={`/manage/transactions/${item.id}`}
        className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 hover:bg-stone-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-plum-600 sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={clsx("font-medium text-stone-900", item.removed && "line-through decoration-stone-400")}>
              {asGroup && !isPaidTogether(item) ? (asGroup.public_name ?? "Anonymous") : itemLabel(item)}
            </span>
            {item.removed && <Badge tone="neutral">Archived</Badge>}
            <GroupBadge item={item} asEntry={asGroup !== null} />
            {(item.items?.length ?? 0) > 0 && (
              <Badge tone="neutral">
                <ListTree className="size-3.5" aria-hidden />
                {item.items?.length} items
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-600">
            <span>{asGroup && !isPaidTogether(item) ? `Latest ${formatNairobi(item.occurred_at)}` : formatNairobi(item.occurred_at)}</span>
            <KindBadge kind={item.kind} />
            {item.kind === "pledge" && item.pledged_by && <PledgeGroupTag by={item.pledged_by} />}
            {item.kind === "personal" && <span className="text-xs text-stone-500">not counted</span>}
            {item.challenge_name && <ChallengeTag name={item.challenge_name} />}
            <span className="text-xs text-stone-500">by {item.created_by ?? "system"}</span>
            <ReconciliationBadge status={item.reconciliation} />
            {item.attention.map((a) => (
              <Badge key={a} tone="warning">
                {a === "missing_receipt" ? <FileWarning className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
                {ATTENTION_LABELS[a] ?? a}
              </Badge>
            ))}
          </div>
        </div>
        <Amount minor={asGroup ? asGroup.total_minor : item.amount_minor} direction={item.direction} kind={item.kind} className="pt-0.5 text-right" />
      </Link>
    </li>
  );
}
