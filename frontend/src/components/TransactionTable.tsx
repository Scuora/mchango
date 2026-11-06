import { clsx } from "clsx";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, FileWarning, ListTree } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { ATTENTION_LABELS } from "@/lib/labels";
import { formatNairobiDate, formatNairobiTime } from "@/lib/time";
import type { ListItem } from "@/lib/types";
import { PledgeGroupTag } from "./pledges";
import { Amount, ChallengeTag, GroupBadge, KindBadge, ReconciliationBadge, isPaidTogether, itemLabel } from "./money";
import { Badge } from "./ui/misc";

/** The server's list orders; each sortable column switches between its two. */
export type SortKey = "newest" | "oldest" | "name_asc" | "name_desc" | "amount_desc" | "amount_asc";

const COLUMNS = {
  date: ["newest", "oldest"],
  name: ["name_asc", "name_desc"],
  amount: ["amount_desc", "amount_asc"],
} as const satisfies Record<string, readonly [SortKey, SortKey]>;

/** True on screens wide enough for the table (the list is used below that). */
export function useWideScreen(query = "(min-width: 1024px)"): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return wide;
}

export interface RowSelect {
  checked: boolean;
  /** Records that cannot be merged get no tick box. */
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * Records as a table: a column each for the date, name, type, account, status
 * and amount. Merged entries and payments from several accounts are one row
 * (their name and total). Date, name and amount sort when their heading is clicked.
 */
export function TransactionTable({
  items,
  sort,
  onSort,
  select,
}: {
  items: ListItem[];
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  select: (item: ListItem) => RowSelect;
}) {
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs tracking-wide text-stone-600 uppercase">
          <tr>
            <th scope="col" className="w-10 px-3 py-2">
              <span className="sr-only">Choose to merge</span>
            </th>
            <SortHeading sort={sort} onSort={onSort} column="date" className="w-28">
              Date
            </SortHeading>
            <SortHeading sort={sort} onSort={onSort} column="name">Name</SortHeading>
            <th scope="col" className="w-28 px-3 py-2 font-medium">
              Type
            </th>
            <th scope="col" className="w-28 px-3 py-2 font-medium">
              Account
            </th>
            <th scope="col" className="w-40 px-3 py-2 font-medium">
              Status
            </th>
            <SortHeading sort={sort} onSort={onSort} column="amount" className="w-32 text-right">
              Amount
            </SortHeading>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {items.map((item) => {
            const choose = select(item);
            const asEntry = item.group && item.group.count > 1 ? item.group : null;
            const together = isPaidTogether(item);
            const href = `/manage/transactions/${item.id}`;
            return (
              <tr
                key={item.id}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest("a, input, label, button")) navigate(href);
                }}
                className={clsx("cursor-pointer align-top hover:bg-stone-50", choose.checked && "bg-plum-50/60 hover:bg-plum-50")}
              >
                <td className="px-3 py-2.5">
                  {!choose.disabled && (
                    <input
                      type="checkbox"
                      aria-label={`Choose ${itemLabel(item)} to merge`}
                      className="mt-0.5 size-5 cursor-pointer rounded border-stone-400 accent-plum-700"
                      checked={choose.checked}
                      onChange={(e) => choose.onChange(e.target.checked)}
                    />
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-stone-700 tabular-nums">
                  {asEntry && !together && <span className="block text-xs text-stone-500">Latest</span>}
                  {formatNairobiDate(item.occurred_at)}
                  <span className="block text-xs text-stone-500">{formatNairobiTime(item.occurred_at)}</span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link to={href} className={clsx("font-medium text-stone-900 no-underline hover:underline", item.removed && "line-through decoration-stone-400")}>
                      {asEntry && !together ? (asEntry.public_name ?? "Anonymous") : itemLabel(item)}
                    </Link>
                    {item.removed && <Badge tone="neutral">Archived</Badge>}
                    <GroupBadge item={item} asEntry={asEntry !== null} />
                    {(item.items?.length ?? 0) > 0 && (
                      <Badge tone="neutral">
                        <ListTree className="size-3.5" aria-hidden />
                        {item.items?.length} items
                      </Badge>
                    )}
                    {item.kind === "pledge" && item.pledged_by && <PledgeGroupTag by={item.pledged_by} />}
                    {item.challenge_name && <ChallengeTag name={item.challenge_name} />}
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {item.reference && !(asEntry && !together) && <span className="font-mono">{item.reference} · </span>}
                    by {item.created_by ?? "system"}
                    {item.kind === "personal" && " · not counted"}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <KindBadge kind={item.kind} />
                </td>
                <td className="px-3 py-2.5 text-stone-700">{accountText(item, asEntry !== null && together)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <ReconciliationBadge status={item.reconciliation} />
                    {item.attention.map((a) => (
                      <Badge key={a} tone="warning">
                        {a === "missing_receipt" ? <FileWarning className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
                        {ATTENTION_LABELS[a] ?? a}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <Amount minor={asEntry ? asEntry.total_minor : item.amount_minor} direction={item.direction} kind={item.kind} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A column heading that sorts by it: first click biggest (or A) first, then the other way. */
function SortHeading({
  sort,
  onSort,
  column,
  children,
  className,
}: {
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  column: keyof typeof COLUMNS;
  children: ReactNode;
  className?: string;
}) {
  const [first, second] = COLUMNS[column];
  const active = sort === first || sort === second;
  const ascending = sort === "oldest" || sort === "name_asc" || sort === "amount_asc";
  const Icon = !active ? ArrowUpDown : ascending ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (ascending ? "ascending" : "descending") : "none"} className={clsx("px-3 py-2 font-medium", className)}>
      <button
        type="button"
        onClick={() => onSort(sort === first ? second : first)}
        className={clsx("inline-flex cursor-pointer items-center gap-1 rounded hover:text-stone-900", active && "text-stone-900")}
      >
        {children}
        <Icon className={clsx("size-3.5", !active && "opacity-50")} aria-hidden />
      </button>
    </th>
  );
}

function accountText(item: ListItem, severalAccounts: boolean): string {
  if (severalAccounts) return `${item.group?.count} accounts`;
  if (item.kind === "transfer") return `${item.account_name ?? "?"} → ${item.to_account_name ?? "?"}`;
  return item.account_name ?? "—";
}
