// A payment from several people: who it is from, split equally or with an amount
// against each name. The parts must add up to the payment; the money counts once
// and public lists show each person.

import { clsx } from "clsx";
import { Divide, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { formatKesShort, parseKes, toInput } from "@/lib/money";
import type { Share } from "@/lib/types";

export interface ShareDraft {
  name: string;
  /** KES as typed. */
  amount: string;
}

/**
 * Splits an amount equally among `count` people, in whole shillings when the
 * amount is whole shillings. Any remainder goes one unit at a time to the first
 * names, so the parts always add up exactly: 1,000 among 3 is 334, 333, 333.
 */
export function splitEqually(totalMinor: number, count: number): number[] {
  if (count <= 0) return [];
  const unit = totalMinor % 100 === 0 ? 100 : 1;
  const units = Math.round(totalMinor / unit);
  const base = Math.floor(units / count);
  const extra = units - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < extra ? 1 : 0)) * unit);
}

export function draftsFrom(shares: Share[]): ShareDraft[] {
  return shares.map((s) => ({ name: s.public_name ?? "", amount: toInput(s.amount_minor) }));
}

/** The shares to send, or the first problem found. */
export function buildShares(drafts: ShareDraft[], totalMinor: number | null): { shares: Share[] } | { error: string } {
  if (drafts.length < 2) return { error: "Add at least two names, or untick “From several people”." };
  const shares: Share[] = [];
  for (const [i, d] of drafts.entries()) {
    const parsed = parseKes(d.amount);
    if (!parsed.ok) return { error: `Line ${i + 1}${d.name.trim() ? ` (${d.name.trim()})` : ""}: ${parsed.error}` };
    shares.push({ public_name: d.name.trim() || null, amount_minor: parsed.minor });
  }
  const sum = shares.reduce((s, x) => s + x.amount_minor, 0);
  if (totalMinor !== null && sum !== totalMinor) {
    return { error: `The shares add up to ${formatKesShort(sum)}, but the payment is ${formatKesShort(totalMinor)}.` };
  }
  return { shares };
}

export function SharesEditor({
  total,
  value,
  onChange,
  anonymousLabel = "Anonymous contributor",
  error,
  idPrefix = "sh",
}: {
  /** The payment, in cents; null while the amount is not filled in. */
  total: number | null;
  value: ShareDraft[];
  onChange: (next: ShareDraft[]) => void;
  anonymousLabel?: string;
  error?: string;
  idPrefix?: string;
}) {
  const [names, setNames] = useState("");
  const sum = value.reduce((s, d) => {
    const parsed = parseKes(d.amount);
    return s + (parsed.ok ? parsed.minor : 0);
  }, 0);
  const left = total === null ? null : total - sum;

  function splitAmong(rows: ShareDraft[]) {
    if (total === null || rows.length === 0) return onChange(rows);
    const parts = splitEqually(total, rows.length);
    onChange(rows.map((r, i) => ({ ...r, amount: toInput(parts[i]) })));
  }
  function fromNames() {
    const rows = names
      .split(/\n|,/)
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name) => ({ name, amount: "" }));
    splitAmong(rows);
    setNames("");
  }
  const set = (i: number, patch: Partial<ShareDraft>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  if (value.length === 0) {
    return (
      <div className="space-y-2">
        <Field label="Names, one per line" htmlFor={`${idPrefix}-names`} hint="Then split the payment equally; you can change any amount afterwards." error={error}>
          <Textarea id={`${idPrefix}-names`} rows={5} value={names} placeholder={"Samuel Mashanga\nPato Dishes\nKadenge"} onChange={(e) => setNames(e.target.value)} />
        </Field>
        <Button type="button" variant="secondary" size="sm" disabled={!names.trim()} icon={<Divide className="size-4" aria-hidden />} onClick={fromNames}>
          {total === null ? "Add these names" : `Split ${formatKesShort(total)} among them`}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {value.map((d, i) => (
          <li key={i} className="grid grid-cols-[1.25rem_1fr_5.5rem_2.5rem] items-center gap-1.5 sm:grid-cols-[1.75rem_1fr_7.5rem_2.5rem] sm:gap-2">
            <span className="text-right text-sm text-stone-500 tabular-nums">{i + 1}.</span>
            <Input aria-label={`Name ${i + 1}`} value={d.name} placeholder={anonymousLabel} onChange={(e) => set(i, { name: e.target.value })} />
            <Input aria-label={`Amount ${i + 1} (KES)`} inputMode="decimal" className="text-right tabular-nums" value={d.amount} onChange={(e) => set(i, { amount: e.target.value })} />
            <button
              type="button"
              aria-label={`Remove ${d.name || `name ${i + 1}`}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="grid size-10 cursor-pointer place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange([...value, { name: "", amount: "" }])}>
          Add a name
        </Button>
        {total !== null && (
          <Button type="button" variant="ghost" size="sm" icon={<Divide className="size-4" aria-hidden />} onClick={() => splitAmong(value)}>
            Split {formatKesShort(total)} equally
          </Button>
        )}
      </div>
      {left !== null && (
        <p className={clsx("text-sm font-medium", left === 0 ? "text-sage-800" : left > 0 ? "text-ochre-800" : "text-brick-700")} aria-live="polite">
          {left === 0
            ? `${formatKesShort(sum)} shared among ${value.length}: it adds up.`
            : left > 0
              ? `${formatKesShort(left)} still to share (${formatKesShort(sum)} of ${formatKesShort(total ?? 0)}).`
              : `${formatKesShort(-left)} more than the payment.`}
        </p>
      )}
      {error && (
        <p className="text-sm font-medium text-brick-700" role="alert">
          {error}
        </p>
      )}
      <p className="text-sm text-stone-500">A name left empty is listed as &ldquo;{anonymousLabel}&rdquo;.</p>
    </div>
  );
}
