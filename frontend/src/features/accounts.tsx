// Where the fundraiser keeps money: adding an account, renaming it, and the last
// digits that let the app warn when a statement belongs to another line.

import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { SaveError } from "@/components/LoadState";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Card, CardBody, CardHeader, Notice } from "@/components/ui/misc";
import { Choice } from "@/components/ui/pickers";
import { api, fieldError } from "@/lib/api";
import type { Account, AccountInput, AccountKind } from "@/lib/types";

export const ACCOUNT_KINDS: { value: AccountKind; label: string }[] = [
  { value: "mpesa", label: "M-Pesa" },
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
];

export function AccountsCard({ accounts, onChanged }: { accounts: Account[]; onChanged: () => void }) {
  const [adding, setAdding] = useState<AccountInput>({ name: "", kind: "mpesa", number_hint: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post<Account>("/api/manage/accounts", { ...adding, number_hint: adding.number_hint || null });
      setAdding({ name: "", kind: "mpesa", number_hint: "" });
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Add or rename accounts" description="Accounts used in records and statements. Transfers between them do not change totals." />
      <CardBody className="space-y-4">
        <ul className="space-y-3">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} onChanged={onChanged} />
          ))}
        </ul>
        <form onSubmit={add} className="grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end">
          <Field label="New account name" htmlFor="acc-new-name" error={fieldError(error, "name")}>
            <Input id="acc-new-name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
          </Field>
          <Field label="Type" htmlFor="acc-new-kind">
            <Choice id="acc-new-kind" value={adding.kind} options={ACCOUNT_KINDS} onChange={(v) => setAdding({ ...adding, kind: v as AccountKind })} />
          </Field>
          <Field label="Last digits" htmlFor="acc-new-hint" optional error={fieldError(error, "number_hint")}>
            <Input id="acc-new-hint" inputMode="numeric" value={adding.number_hint ?? ""} onChange={(e) => setAdding({ ...adding, number_hint: e.target.value })} />
          </Field>
          <Button type="submit" variant="secondary" busy={busy} disabled={!adding.name.trim()} icon={<Plus className="size-4" aria-hidden />}>
            Add
          </Button>
        </form>
        {error !== null && !fieldError(error, "name") && !fieldError(error, "number_hint") ? <SaveError error={error} /> : null}
        <Notice tone="info">The last digits of an M-Pesa number let the app warn you if a statement belongs to a different line.</Notice>
      </CardBody>
    </Card>
  );
}

function AccountRow({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const [name, setName] = useState(account.name);
  const [hint, setHint] = useState(account.number_hint ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const changed = name !== account.name || hint !== (account.number_hint ?? "");

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put<Account>(`/api/manage/accounts/${account.id}`, { name, kind: account.kind, number_hint: hint || null });
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end">
        <Field label="Name" htmlFor={`acc-${account.id}-name`} error={fieldError(error, "name")}>
          <Input id={`acc-${account.id}-name`} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type" htmlFor={`acc-${account.id}-kind`}>
          <Input id={`acc-${account.id}-kind`} value={ACCOUNT_KINDS.find((k) => k.value === account.kind)?.label ?? account.kind} disabled />
        </Field>
        <Field label="Last digits" htmlFor={`acc-${account.id}-hint`} optional error={fieldError(error, "number_hint")}>
          <Input id={`acc-${account.id}-hint`} inputMode="numeric" value={hint} onChange={(e) => setHint(e.target.value)} disabled={account.kind !== "mpesa"} />
        </Field>
        <Button type="submit" variant="secondary" busy={busy} disabled={!changed}>
          Save
        </Button>
      </form>
      {error !== null && !fieldError(error, "name") && !fieldError(error, "number_hint") ? <SaveError error={error} /> : null}
    </li>
  );
}
