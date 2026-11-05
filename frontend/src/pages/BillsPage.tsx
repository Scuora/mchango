import { clsx } from "clsx";
import { HandCoins, Plus, Save, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { LoadState, SaveError } from "@/components/LoadState";
import { PledgeProgressBar } from "@/components/pledges";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Choice, DateTimeField } from "@/components/ui/pickers";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/misc";
import { BILL_STATUS_LABELS, BillStatusBadge } from "@/features/bills";
import { api, fieldError, useResource } from "@/lib/api";
import { formatKesShort, parseKes } from "@/lib/money";
import { formatNairobi, formatNairobiDate, fromNairobiInput, nowNairobiInput } from "@/lib/time";
import type { Account, Bill, BillStatus, BillsResponse } from "@/lib/types";

const kes = formatKesShort;
type StatusFilter = "all" | BillStatus;

/**
 * Bills: what each costs, what has been paid towards it, and where it stands, so
 * the committee knows exactly what is fully paid and what is part paid. Internal
 * only: the public page lists money paid, never what is still owed.
 */
export function BillsPage() {
  const bills = useResource<BillsResponse>("/api/manage/bills");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [adding, setAdding] = useState(false);
  const list = useMemo(() => bills.data?.bills ?? [], [bills.data]);
  const shown = list.filter((b) => status === "all" || b.status === status);

  if (!bills.data) return <LoadState loading={bills.loading} error={bills.error} onRetry={bills.reload} />;
  const t = bills.data.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Bills</h1>
          <p className="mt-1 max-w-2xl text-stone-600">
            Record a bill with its full cost, then each payment towards it as it is made, until it is fully paid. Only the payments appear publicly.
          </p>
        </div>
        {!adding && (
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
            New bill
          </Button>
        )}
      </div>

      {adding && <NewBill onCancel={() => setAdding(false)} />}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-sm text-stone-600">All bills</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{kes(t.total_minor)}</p>
            <p className="text-sm text-stone-500">
              {t.count} bill{t.count === 1 ? "" : "s"}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-stone-600">Paid so far</p>
            <p className="mt-1 text-2xl font-semibold text-sage-800 tabular-nums">{kes(t.paid_minor)}</p>
            <PledgeProgressBar received={t.paid_minor} amount={t.total_minor} className="mt-2 h-2.5" />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-stone-600">Left to pay</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{kes(t.balance_minor)}</p>
            <p className="text-sm text-stone-500">
              {t.fully_paid} fully paid · {t.part_paid} part paid · {t.not_paid} not paid
              {t.overpaid > 0 && ` · ${t.overpaid} paid more than the bill`}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={`${shown.length} of ${list.length} bills`} />
        <CardBody className="border-b border-stone-100">
          <div role="radiogroup" aria-label="Where it stands" className="flex flex-wrap gap-2">
            {(["all", "part_paid", "not_paid", "fully_paid", ...(t.overpaid > 0 ? (["overpaid"] as const) : [])] as StatusFilter[]).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={status === v}
                onClick={() => setStatus(v)}
                className={clsx(
                  "press min-h-9 cursor-pointer rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition-colors",
                  status === v ? "bg-plum-800 text-white ring-plum-800" : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50",
                )}
              >
                {v === "all" ? "Any status" : BILL_STATUS_LABELS[v]}{" "}
                <span className={status === v ? "text-plum-200" : "text-stone-400"}>{v === "all" ? list.length : list.filter((b) => b.status === v).length}</span>
              </button>
            ))}
          </div>
        </CardBody>
        {shown.length === 0 ? (
          <EmptyState title={list.length === 0 ? "No bills yet" : "No bills match"}>
            {list.length === 0 ? "Add a bill with its full cost; record payments towards it as they are made." : "Try another filter."}
          </EmptyState>
        ) : (
          <ul className="stagger divide-y divide-stone-100">
            {shown.map((b, i) => (
              <BillRow key={b.id} bill={b} index={i} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function BillRow({ bill: b, index }: { bill: Bill; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link to={`/manage/transactions/${b.id}`} className="min-w-0 flex-1 text-stone-900 no-underline hover:no-underline">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{b.description || `Bill #${b.id}`}</span>
            <BillStatusBadge status={b.status} />
          </span>
          <span className="mt-1 block text-sm text-stone-500">Recorded for {formatNairobiDate(b.occurred_at)}</span>
          <PledgeProgressBar received={b.paid_minor} amount={b.total_minor} delay={Math.min(index, 12) * 40} className="mt-2 max-w-md" />
        </Link>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <p className="text-right text-sm text-stone-600 tabular-nums">
            <span className="font-semibold text-stone-900">{kes(b.paid_minor)}</span> of {kes(b.total_minor)}
            {b.balance_minor > 0 && <span className="block text-stone-500">{kes(b.balance_minor)} left</span>}
          </p>
          {(b.status === "not_paid" || b.status === "part_paid") && (
            <ButtonLink to={`/manage/add?bill=${b.id}`} size="sm" variant="secondary" icon={<HandCoins className="size-4" aria-hidden />}>
              Record a payment
            </ButtonLink>
          )}
        </div>
      </div>
      {b.payments.length > 0 && (
        <div className="mt-2">
          <button type="button" className="min-h-9 cursor-pointer text-sm font-medium text-plum-800" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Show"} {b.payments.length} payment{b.payments.length === 1 ? "" : "s"}
          </button>
          {open && (
            <ol className="mt-1 divide-y divide-stone-100 rounded-lg border border-stone-200 text-sm">
              {b.payments.map((p) => (
                <li key={p.id}>
                  <Link to={`/manage/transactions/${p.id}`} className="flex justify-between gap-3 px-3 py-2 text-stone-800 no-underline hover:bg-stone-50">
                    <span>
                      {formatNairobi(p.occurred_at)}
                      <span className="text-stone-500">
                        {p.account_name && ` · ${p.account_name}`}
                        {p.reference && ` · ${p.reference}`}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{kes(p.amount_minor)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

/** A bill with its full cost and, if anything has been paid already, that payment. */
function NewBill({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const accounts = useResource<Account[]>("/api/manage/accounts");
  const [form, setForm] = useState({ description: "", total: "", occurredAt: nowNairobiInput(), counterparty: "", notes: "" });
  const [paidNow, setPaidNow] = useState(false);
  const [paid, setPaid] = useState({ amount: "", accountId: "", occurredAt: nowNairobiInput(), reference: "", charge: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const account = (accounts.data ?? []).find((a) => String(a.id) === paid.accountId);
  const fromMpesa = account?.kind === "mpesa";

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!form.description.trim()) found.description = "Say what the bill is for.";
    const total = parseKes(form.total);
    if (!total.ok) found.total = total.error;
    let payment = null;
    if (paidNow) {
      const amount = parseKes(paid.amount);
      if (!amount.ok) found.amount = amount.error;
      if (!paid.accountId) found.accountId = "Choose the account it was paid from.";
      let charge: number | null = null;
      if (fromMpesa) {
        if (!paid.charge.trim()) found.charge = "Enter the M-Pesa transaction cost, or 0 if there was none.";
        else {
          const parsed = parseKes(paid.charge);
          if (parsed.ok) charge = parsed.minor;
          else if (!/^0+(\.0+)?$/.test(paid.charge.trim())) found.charge = parsed.error;
        }
      }
      if (amount.ok) {
        payment = {
          amount_minor: amount.minor,
          account_id: Number(paid.accountId),
          occurred_at: fromNairobiInput(paid.occurredAt),
          reference: paid.reference.trim() || null,
          charge_minor: charge && charge > 0 ? charge : null,
          confirm_possible_duplicate: true,
        };
      }
    }
    setProblems(found);
    if (Object.keys(found).length > 0 || !total.ok) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<{ id: number }>("/api/manage/bills", {
        description: form.description.trim(),
        total_minor: total.minor,
        occurred_at: fromNairobiInput(form.occurredAt),
        counterparty: form.counterparty.trim() || null,
        notes: form.notes.trim(),
        paid: payment,
      });
      navigate(`/manage/transactions/${created.id}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="New bill"
        description="The full cost, and what has been paid so far if anything. Paid by M-Pesa? Save the bill, then use “Record a payment” to paste the message."
      />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What it is for" htmlFor="bill-what" error={problems.description ?? fieldError(error, "description")} hint="Shown publicly next to each payment.">
              <Input id="bill-what" value={form.description} maxLength={500} placeholder="Coffin" onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Full cost (KES)" htmlFor="bill-total" error={problems.total ?? fieldError(error, "amount_minor")}>
              <Input id="bill-total" inputMode="decimal" className="tabular-nums" value={form.total} placeholder="45,000" onChange={(e) => setForm({ ...form, total: e.target.value })} />
            </Field>
            <Field label="Agreed on" htmlFor="bill-when" error={fieldError(error, "occurred_at")}>
              <DateTimeField id="bill-when" value={form.occurredAt} onChange={(v) => setForm({ ...form, occurredAt: v })} />
            </Field>
            <Field label="Who is owed" htmlFor="bill-who" optional hint="Private.">
              <Input id="bill-who" value={form.counterparty} maxLength={200} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
            </Field>
          </div>
          <Field label="Private notes" htmlFor="bill-notes" optional>
            <Textarea id="bill-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>

          <div className="space-y-3 rounded-xl border border-stone-200 p-4">
            <Checkbox checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} label="Something has been paid already" hint="Recorded as a payment towards this bill. Add more payments later, until it is fully paid." />
            {paidNow && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Amount paid (KES)" htmlFor="bill-paid" error={problems.amount}>
                  <Input id="bill-paid" inputMode="decimal" className="tabular-nums" value={paid.amount} onChange={(e) => setPaid({ ...paid, amount: e.target.value })} />
                </Field>
                <Field label="Paid from" htmlFor="bill-account" error={problems.accountId ?? fieldError(error, "account_id")}>
                  <Choice
                    id="bill-account"
                    value={paid.accountId}
                    options={(accounts.data ?? []).map((a) => ({ value: String(a.id), label: a.name }))}
                    placeholder="Choose the account"
                    onChange={(v) => setPaid({ ...paid, accountId: v })}
                  />
                </Field>
                <Field label="Paid on" htmlFor="bill-paid-when">
                  <DateTimeField id="bill-paid-when" value={paid.occurredAt} onChange={(v) => setPaid({ ...paid, occurredAt: v })} />
                </Field>
                <Field label="M-Pesa code" htmlFor="bill-ref" optional error={fieldError(error, "reference")}>
                  <Input id="bill-ref" value={paid.reference} maxLength={20} placeholder="TK3AB12CD4" onChange={(e) => setPaid({ ...paid, reference: e.target.value })} />
                </Field>
                {fromMpesa && (
                  <Field label="M-Pesa transaction cost (KES)" htmlFor="bill-charge" error={problems.charge ?? fieldError(error, "charge_minor")} hint="0 if there was none.">
                    <Input id="bill-charge" inputMode="decimal" className="tabular-nums" value={paid.charge} onChange={(e) => setPaid({ ...paid, charge: e.target.value })} />
                  </Field>
                )}
              </div>
            )}
          </div>
          <SaveError error={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={busy} icon={<Save className="size-4" aria-hidden />}>
              Save bill
            </Button>
            <Button type="button" variant="ghost" icon={<X className="size-4" aria-hidden />} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </CardBody>
      </form>
    </Card>
  );
}
