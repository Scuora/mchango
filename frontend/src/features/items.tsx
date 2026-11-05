// A payment out that covered several things (10,000 for shoes and clothing): each
// thing with its part. The parts must add up to the payment; the money counts once
// and public lists show each thing.

import { clsx } from "clsx";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { formatKesShort, parseKes, toInput } from "@/lib/money";
import type { ExpenseItem } from "@/lib/types";

export interface ItemDraft {
  description: string;
  /** KES as typed. */
  amount: string;
}

export const blankItems = (): ItemDraft[] => [
  { description: "", amount: "" },
  { description: "", amount: "" },
];

export function itemDraftsFrom(items: ExpenseItem[]): ItemDraft[] {
  return items.length ? items.map((i) => ({ description: i.description, amount: toInput(i.amount_minor) })) : blankItems();
}

/** The items to send, or the first problem found. */
export function buildItems(drafts: ItemDraft[], totalMinor: number | null): { items: ExpenseItem[] } | { error: string } {
  const rows = drafts.filter((d) => d.description.trim() || d.amount.trim());
  if (rows.length < 2) return { error: "Add at least two items, or describe the payment as one thing." };
  const items: ExpenseItem[] = [];
  for (const [i, d] of rows.entries()) {
    if (!d.description.trim()) return { error: `Item ${i + 1}: say what it was for.` };
    const parsed = parseKes(d.amount);
    if (!parsed.ok) return { error: `Item ${i + 1} (${d.description.trim()}): ${parsed.error}` };
    items.push({ description: d.description.trim(), amount_minor: parsed.minor });
  }
  const sum = items.reduce((s, x) => s + x.amount_minor, 0);
  if (totalMinor !== null && sum !== totalMinor) {
    return { error: `The items add up to ${formatKesShort(sum)}, but the payment is ${formatKesShort(totalMinor)}.` };
  }
  return { items };
}

export function ItemsEditor({
  total,
  value,
  onChange,
  error,
}: {
  /** The payment, in cents; null while the amount is not filled in. */
  total: number | null;
  value: ItemDraft[];
  onChange: (next: ItemDraft[]) => void;
  error?: string;
}) {
  const sum = value.reduce((s, d) => {
    const parsed = parseKes(d.amount);
    return s + (parsed.ok ? parsed.minor : 0);
  }, 0);
  const left = total === null ? null : total - sum;
  const set = (i: number, patch: Partial<ItemDraft>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  // The last empty amount can take whatever is left.
  const fillable = left !== null && left > 0 ? value.findIndex((d) => !d.amount.trim()) : -1;

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {value.map((d, i) => (
          <li key={i} className="grid grid-cols-[1.25rem_1fr_5.5rem_2.5rem] items-center gap-1.5 sm:grid-cols-[1.75rem_1fr_7.5rem_2.5rem] sm:gap-2">
            <span className="text-right text-sm text-stone-500 tabular-nums">{i + 1}.</span>
            <Input aria-label={`Item ${i + 1}`} value={d.description} maxLength={200} placeholder={i === 0 ? "Shoes" : i === 1 ? "Clothing" : "What it was for"} onChange={(e) => set(i, { description: e.target.value })} />
            <Input aria-label={`Amount ${i + 1} (KES)`} inputMode="decimal" className="text-right tabular-nums" value={d.amount} onChange={(e) => set(i, { amount: e.target.value })} />
            <button
              type="button"
              aria-label={`Remove ${d.description || `item ${i + 1}`}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="grid size-10 cursor-pointer place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange([...value, { description: "", amount: "" }])}>
          Add an item
        </Button>
        {fillable >= 0 && left !== null && (
          <Button type="button" variant="ghost" size="sm" onClick={() => set(fillable, { amount: toInput(left) })}>
            Put the remaining {formatKesShort(left)} on item {fillable + 1}
          </Button>
        )}
      </div>
      {left !== null && (
        <p className={clsx("text-sm font-medium", left === 0 ? "text-sage-800" : left > 0 ? "text-ochre-800" : "text-brick-700")} aria-live="polite">
          {left === 0
            ? `${formatKesShort(sum)} across ${value.length} items: it adds up.`
            : left > 0
              ? `${formatKesShort(left)} still to assign (${formatKesShort(sum)} of ${formatKesShort(total ?? 0)}).`
              : `${formatKesShort(-left)} more than the payment.`}
        </p>
      )}
      {error && (
        <p className="text-sm font-medium text-brick-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
