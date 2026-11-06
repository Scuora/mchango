// A payment out made from several accounts, e.g. 30,000 by M-Pesa and 20,000 in
// cash. Each account's part is saved as a record of its own (so balances, codes
// and statement matches stay per account) and the payment is listed once.

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Choice } from "@/components/ui/pickers";
import { formatKesShort, parseKes } from "@/lib/money";
import type { Account, Source } from "@/lib/types";

export interface SourceDraft {
  accountId: string;
  /** KES as typed. */
  amount: string;
  reference: string;
}

/** The parts typed so far, added up (lines not yet valid count as nothing). */
export function sourcesTotal(drafts: SourceDraft[]): number {
  return drafts.reduce((sum, d) => {
    const parsed = parseKes(d.amount);
    return sum + (parsed.ok ? parsed.minor : 0);
  }, 0);
}

/**
 * The parts to send, or the first problem found. The charge goes with the first
 * M-Pesa account: that is where Safaricom takes it.
 */
export function buildSources(drafts: SourceDraft[], accounts: Account[], chargeMinor: number | null): { sources: Source[] } | { error: string } {
  if (drafts.length < 2) return { error: "Add a second account, or untick “Paid from more than one account”." };
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const [i, d] of drafts.entries()) {
    const account = accounts.find((a) => String(a.id) === d.accountId);
    if (!account) return { error: `Line ${i + 1}: choose the account.` };
    if (seen.has(d.accountId)) return { error: `${account.name} is chosen twice. Put its whole part on one line.` };
    seen.add(d.accountId);
    const parsed = parseKes(d.amount);
    if (!parsed.ok) return { error: `Line ${i + 1} (${account.name}): ${parsed.error}` };
    sources.push({ account_id: account.id, amount_minor: parsed.minor, reference: d.reference.trim().toUpperCase() || null, charge_minor: null });
  }
  if (chargeMinor !== null) {
    const mpesa = sources.findIndex((s) => accounts.find((a) => a.id === s.account_id)?.kind === "mpesa");
    sources[mpesa >= 0 ? mpesa : 0].charge_minor = chargeMinor;
  }
  return { sources };
}

export function SourcesEditor({
  accounts,
  value,
  onChange,
  error,
}: {
  accounts: Account[];
  value: SourceDraft[];
  onChange: (next: SourceDraft[]) => void;
  error?: string;
}) {
  const options = accounts.map((a) => ({ value: String(a.id), label: a.name }));
  const set = (i: number, patch: Partial<SourceDraft>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const unused = accounts.find((a) => !value.some((d) => d.accountId === String(a.id)));
  const total = sourcesTotal(value);

  return (
    <div className="space-y-2">
      <ol className="space-y-3 sm:space-y-2">
        {value.map((d, i) => (
          <li key={i} className="grid grid-cols-[1fr_7rem] gap-1.5 sm:grid-cols-[1fr_8rem_10rem_2.5rem] sm:items-center sm:gap-2">
            <Choice id={`src-account-${i}`} value={d.accountId} options={options} placeholder="Account…" onChange={(v) => set(i, { accountId: v })} />
            <Input aria-label={`Amount from account ${i + 1} (KES)`} inputMode="decimal" placeholder="Amount" className="text-right tabular-nums" value={d.amount} onChange={(e) => set(i, { amount: e.target.value })} />
            <Input
              aria-label={`M-Pesa code for account ${i + 1}`}
              placeholder="M-Pesa code (optional)"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={d.reference}
              onChange={(e) => set(i, { reference: e.target.value.toUpperCase() })}
            />
            <button
              type="button"
              aria-label={`Remove account ${i + 1}`}
              disabled={value.length <= 2}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="grid size-10 cursor-pointer place-items-center justify-self-end rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:invisible"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      {unused && (
        <Button type="button" variant="ghost" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange([...value, { accountId: String(unused.id), amount: "", reference: "" }])}>
          Add an account
        </Button>
      )}
      <p className="text-sm font-medium text-stone-700" aria-live="polite">
        {formatKesShort(total)} in all from {value.length} accounts. Each part counts in its own account&rsquo;s balance; the payment is listed once.
      </p>
      {error && (
        <p className="text-sm font-medium text-brick-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
