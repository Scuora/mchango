import { ArrowLeft, CheckCircle2, CircleCheckBig, Link2, PlusCircle, RefreshCw, Unlink } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { LoadState, SaveError } from "@/components/LoadState";
import { Amount, KindBadge, TransactionRow, itemLabel } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Choice } from "@/components/ui/pickers";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Card, CardBody, CardHeader, EmptyState, Notice, Spinner, Tabs, type Tone } from "@/components/ui/misc";
import {
  PresentationFields,
  emptyPresentation,
  nameFromDetails,
  presentationFromSender,
  toPresentation,
  type PresentationDraft,
} from "@/features/presentationFields";
import { api, fieldError, useResource } from "@/lib/api";
import { IMPORT_STATUS_LABELS, KIND_OPTIONS, MATCH_LABELS } from "@/lib/labels";
import { formatKes } from "@/lib/money";
import { formatNairobi, formatNairobiDate } from "@/lib/time";
import type { Account, CreateFromRow, Fundraiser, ImportDetail, Kind, ListItem, MatchStatus, RowView } from "@/lib/types";
import { STATUS_TONES } from "./StatementsPage";

type Tab = "decide" | "matched" | "no_effect" | "not_on_statement";

const MATCH_TONES: Record<MatchStatus, Tone> = {
  matched: "success",
  missing: "warning",
  conflict: "danger",
  review: "warning",
  no_effect: "neutral",
};

export function StatementDetailPage() {
  const { id } = useParams();
  const detail = useResource<ImportDetail>(`/api/manage/statements/${id}`);
  const accounts = useResource<Account[]>("/api/manage/accounts");
  const settings = useResource<Fundraiser>("/api/manage/settings");
  const [tab, setTab] = useState<Tab>("decide");
  const status = detail.data?.import.status;

  // Poll while the statement is being read.
  useEffect(() => {
    if (status !== "queued" && status !== "processing") return;
    const timer = window.setInterval(detail.reload, 2000);
    return () => window.clearInterval(timer);
  }, [status, detail.reload]);

  if (!detail.data) return <LoadState loading={detail.loading} error={detail.error} onRetry={detail.reload} />;
  const d = detail.data;
  const imp = d.import;
  const related = new Map(d.related.map((item) => [item.id, item]));
  const decide = d.rows.filter((r) => r.match_status === "missing" || r.match_status === "conflict" || r.match_status === "review");
  const matched = d.rows.filter((r) => r.match_status === "matched");
  const noEffect = d.rows.filter((r) => r.match_status === "no_effect");
  const apply = (next: ImportDetail) => detail.setData(next);

  return (
    <div className="space-y-4">
      <Link to="/manage/statements" className="inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeft className="size-4" aria-hidden /> All statements
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">
            {imp.account_name} · Import #{imp.id}
          </p>
          <h1 className="page-title">
            {imp.period_start ? `${formatNairobiDate(imp.period_start)} – ${formatNairobiDate(imp.period_end)}` : "Statement"}
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {imp.original_name ?? "PDF"} · uploaded {formatNairobi(imp.created_at)}
            {imp.status === "ready" && ` · ${imp.row_count} rows read`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={STATUS_TONES[imp.status]}>{IMPORT_STATUS_LABELS[imp.status]}</Badge>
          {d.reconciled && (
            <Badge tone="success">
              <CircleCheckBig className="size-3.5" aria-hidden /> Reconciled
            </Badge>
          )}
          {imp.completed_at && !d.reconciled && <Badge tone="warning">Completed earlier, needs attention again</Badge>}
        </div>
      </div>

      {(imp.status === "queued" || imp.status === "processing") && (
        <Card>
          <CardBody>
            <Spinner label="Reading the statement… This usually takes a few seconds." />
          </CardBody>
        </Card>
      )}

      {imp.status === "failed" && <FailedImport detail={d} onChanged={detail.reload} />}
      {imp.status === "discarded" && <Notice tone="info" title="This import was discarded">Its rows no longer count as statement evidence. Records created from it are kept.</Notice>}

      {d.number_warning && <Notice tone="warning">{d.number_warning}</Notice>}

      {imp.status === "ready" && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <BalanceCard detail={d} />
            <CompletionCard detail={d} onDone={apply} />
          </div>

          <Tabs<Tab>
            label="Statement rows"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "decide", label: "Needs a decision", count: decide.length },
              { value: "matched", label: "Matched", count: matched.length },
              { value: "no_effect", label: "No money moved", count: noEffect.length },
              { value: "not_on_statement", label: "Recorded but not on statement", count: d.ledger_only.length },
            ]}
          />

          {tab === "decide" && (
            <RowList
              rows={decide}
              empty="Every row has been decided."
              render={(row) => (
                <DecisionRow
                  importId={imp.id}
                  row={row}
                  candidate={row.candidate_transaction_id ? related.get(row.candidate_transaction_id) : undefined}
                  accounts={accounts.data ?? []}
                  statementAccountId={imp.account_id}
                  anonymousLabel={settings.data?.anonymous_label}
                  onDone={apply}
                />
              )}
            />
          )}
          {tab === "matched" && (
            <RowList
              rows={matched}
              empty="No rows are matched yet."
              render={(row) => <MatchedRow importId={imp.id} row={row} record={row.transaction_id ? related.get(row.transaction_id) : undefined} onDone={apply} />}
            />
          )}
          {tab === "no_effect" && <RowList rows={noEffect} empty="No zero-amount rows." render={(row) => <RowSummary row={row} />} />}
          {tab === "not_on_statement" && (
            <Card>
              {d.ledger_only.length === 0 ? (
                <EmptyState title="Every record in this period is on the statement" />
              ) : (
                <>
                  <p className="border-b border-stone-100 px-4 py-3 text-sm text-stone-700 sm:px-5">
                    These records are on this account and in this period but not on the statement. Open each one: correct its date or account, or remove it if it
                    is a duplicate.
                  </p>
                  <ul className="stagger divide-y divide-stone-100">
                    {d.ledger_only.map((item) => (
                      <TransactionRow key={item.id} item={item} />
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function RowList({ rows, empty, render }: { rows: RowView[]; empty: string; render: (row: RowView) => ReactNode }) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title={empty} />
      </Card>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id}>
          <Card>{render(row)}</Card>
        </li>
      ))}
    </ul>
  );
}

/** The statement's own view of a row (private details included). */
function RowSummary({ row, children }: { row: RowView; children?: ReactNode }) {
  return (
    <div className="space-y-3 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={MATCH_TONES[row.match_status]}>{MATCH_LABELS[row.match_status]}</Badge>
            {row.is_fee && <Badge>Charge line</Badge>}
            <span className="font-mono text-sm text-stone-700">{row.receipt ?? "—"}</span>
          </div>
          <p className="text-[15px] break-words text-stone-900">{row.details}</p>
          <p className="text-sm text-stone-600">
            {formatNairobi(row.completed_at)}
            {row.page ? ` · page ${row.page}` : ""}
            {row.row_status && row.row_status !== "Completed" ? ` · ${row.row_status}` : ""}
            {row.balance_minor !== null ? ` · balance after ${formatKes(row.balance_minor)}` : ""}
          </p>
        </div>
        {row.amount_minor !== null ? (
          <Amount minor={row.amount_minor} direction={row.direction} />
        ) : (
          <span className="text-sm text-ochre-900">Amount unreadable</span>
        )}
      </div>
      {row.parse_note && <p className="text-sm text-ochre-900">{row.parse_note}</p>}
      {row.match_note && <p className="text-sm text-stone-800">{row.match_note}</p>}
      {children}
    </div>
  );
}

function RecordSummary({ item, label }: { item: ListItem; label: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
      <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">{label}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <Link to={`/manage/transactions/${item.id}`} className="font-medium">
          #{item.id} {itemLabel(item)}
        </Link>
        <Amount minor={item.amount_minor} direction={item.direction} kind={item.kind} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-stone-600">
        <KindBadge kind={item.kind} />
        <span>{formatNairobi(item.occurred_at)}</span>
        {item.reference && <span className="font-mono">{item.reference}</span>}
        {item.account_name && <span>{item.account_name}</span>}
      </div>
    </div>
  );
}

function MatchedRow({ importId, row, record, onDone }: { importId: number; row: RowView; record?: ListItem; onDone: (d: ImportDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function unmatch() {
    setBusy(true);
    try {
      onDone(await api.post<ImportDetail>(`/api/manage/statements/${importId}/rows/${row.id}/unlink`));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <RowSummary row={row}>
      {record && <RecordSummary item={record} label={row.match_method === "reference" ? "Matched by reference" : "Matched to"} />}
      <SaveError error={error} />
      <Button variant="ghost" size="sm" busy={busy} icon={<Unlink className="size-4" aria-hidden />} onClick={() => void unmatch()}>
        Unmatch
      </Button>
    </RowSummary>
  );
}

function DecisionRow({
  importId,
  row,
  candidate,
  accounts,
  statementAccountId,
  anonymousLabel,
  onDone,
}: {
  importId: number;
  row: RowView;
  candidate?: ListItem;
  accounts: Account[];
  statementAccountId: number;
  anonymousLabel?: string;
  onDone: (d: ImportDetail) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [linkId, setLinkId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const readable = row.amount_minor !== null && row.direction !== null;

  async function run(label: string, path: string, body?: unknown) {
    setBusy(label);
    setError(null);
    try {
      onDone(await api.post<ImportDetail>(path, body));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  const base = `/api/manage/statements/${importId}`;
  return (
    <RowSummary row={row}>
      {candidate && (
        <RecordSummary item={candidate} label={row.match_status === "review" ? "Possible match in your records" : "Record that disagrees"} />
      )}
      <SaveError error={error} />
      <div className="flex flex-wrap gap-2">
        {row.match_status === "review" && candidate && (
          <Button
            busy={busy === "link"}
            icon={<CheckCircle2 className="size-4" aria-hidden />}
            onClick={() => void run("link", `${base}/rows/${row.id}/link`, { transaction_id: candidate.id })}
          >
            Yes, same transaction
          </Button>
        )}
        {row.match_status === "conflict" && candidate && (
          <Link to={`/manage/transactions/${candidate.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-4 text-[15px] font-medium text-stone-900 no-underline hover:bg-stone-50 hover:no-underline">
            Open the record to correct it
          </Link>
        )}
        {readable && row.match_status !== "conflict" && (
          <Button variant={candidate ? "secondary" : "primary"} icon={<PlusCircle className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
            {candidate ? "No, add as new" : "Add to records"}
          </Button>
        )}
        <Button variant="ghost" busy={busy === "rematch"} icon={<RefreshCw className="size-4" aria-hidden />} onClick={() => void run("rematch", `${base}/rematch`)}>
          Check again
        </Button>
      </div>
      {readable && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2 text-stone-700">Match to a different record…</summary>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (/^\d+$/.test(linkId.trim())) void run("manual", `${base}/rows/${row.id}/link`, { transaction_id: Number(linkId.trim()) });
            }}
          >
            <Field label="Record number" htmlFor={`link-${row.id}`} hint="Shown on the record's page, e.g. #12.">
              <Input id={`link-${row.id}`} inputMode="numeric" className="w-32" value={linkId} onChange={(e) => setLinkId(e.target.value)} />
            </Field>
            <Button type="submit" variant="secondary" busy={busy === "manual"} icon={<Link2 className="size-4" aria-hidden />} disabled={!/^\d+$/.test(linkId.trim())}>
              Match
            </Button>
          </form>
        </details>
      )}
      {!readable && <p className="text-sm text-stone-700">This row could not be read fully. Download the statement again and retry, or record it by hand from the M-Pesa message.</p>}
      <CreateFromRowDialog
        open={adding}
        onClose={() => setAdding(false)}
        importId={importId}
        row={row}
        accounts={accounts}
        statementAccountId={statementAccountId}
        anonymousLabel={anonymousLabel}
        onDone={(next) => {
          setAdding(false);
          onDone(next);
        }}
      />
    </RowSummary>
  );
}

function CreateFromRowDialog({
  open,
  onClose,
  importId,
  row,
  accounts,
  statementAccountId,
  anonymousLabel,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  importId: number;
  row: RowView;
  accounts: Account[];
  statementAccountId: number;
  anonymousLabel?: string;
  onDone: (d: ImportDetail) => void;
}) {
  const others = accounts.filter((a) => a.id !== statementAccountId);
  const defaultOther = others.find((a) => a.kind === "cash") ?? others[0];
  const [kind, setKind] = useState<Kind>(row.suggestion?.kind ?? (row.direction === "in" ? "contribution" : "expense"));
  const [otherId, setOtherId] = useState(defaultOther ? String(defaultOther.id) : "");
  const [relatedId, setRelatedId] = useState(row.suggestion?.related_transaction_id ? String(row.suggestion.related_transaction_id) : "");
  const [presentation, setPresentation] = useState<PresentationDraft>(() =>
    row.direction === "in" ? presentationFromSender(nameFromDetails(row.details)) : emptyPresentation(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Only types that fit what the statement shows.
  const options = KIND_OPTIONS.filter((o) => {
    if (o.value === "pledge" || o.value === "commitment") return false;
    if (row.is_fee) return o.value === "charge" || o.value === "personal" || o.value === "reversal";
    if (o.value === "charge") return false;
    if (row.direction === "in") return o.value !== "expense";
    return o.value !== "contribution";
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body: CreateFromRow = {
      kind,
      other_account_id: kind === "transfer" && otherId ? Number(otherId) : null,
      related_transaction_id: /^\d+$/.test(relatedId.trim()) ? Number(relatedId.trim()) : null,
      presentation: toPresentation(presentation, kind),
    };
    setBusy(true);
    setError(null);
    try {
      onDone(await api.post<ImportDetail>(`/api/manage/statements/${importId}/rows/${row.id}/create`, body));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add this row to the records" wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-stone-50 p-3 text-sm">
          <p className="font-medium text-stone-900">
            {row.amount_minor !== null && <Amount minor={row.amount_minor} direction={row.direction} />} · {formatNairobi(row.completed_at)}
          </p>
          <p className="mt-1 text-stone-700">{row.details}</p>
          <p className="mt-1 font-mono text-stone-600">{row.receipt}</p>
          <p className="mt-2 text-xs text-stone-500">Amount, time, account and reference come from the statement and cannot be changed here.</p>
        </div>
        <Field label="What was this?" htmlFor={`cr-kind-${row.id}`} error={fieldError(error, "kind")}>
          <Choice id={`cr-kind-${row.id}`} value={kind} options={options} onChange={(v) => setKind(v as Kind)} />
        </Field>
        {kind === "transfer" && (
          <Field label={row.direction === "out" ? "Moved to" : "Came from"} htmlFor={`cr-other-${row.id}`} error={fieldError(error, "other_account_id")}>
            <Choice id={`cr-other-${row.id}`} value={otherId} options={others.map((a) => ({ value: String(a.id), label: a.name }))} onChange={setOtherId} />
          </Field>
        )}
        {(kind === "charge" || kind === "refund" || kind === "reversal" || kind === "contribution") && (
          <Field
            label="Linked record number"
            htmlFor={`cr-related-${row.id}`}
            optional
            error={fieldError(error, "related_transaction_id")}
            hint={kind === "charge" ? "The payment this charge belongs to." : kind === "contribution" ? "The pledge this fulfils." : "The original movement."}
          >
            <Input id={`cr-related-${row.id}`} inputMode="numeric" value={relatedId} onChange={(e) => setRelatedId(e.target.value)} />
          </Field>
        )}
        <PresentationFields kind={kind} draft={presentation} onChange={setPresentation} anonymousLabel={anonymousLabel} error={error} idPrefix={`cr-p-${row.id}`} />
        {error !== null && !fieldError(error, "kind") && !fieldError(error, "related_transaction_id") ? <SaveError error={error} /> : null}
        <div className="flex gap-3">
          <Button type="submit" busy={busy}>
            Save and match
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function BalanceCard({ detail }: { detail: ImportDetail }) {
  const b = detail.balance;
  if (!b) return null;
  const difference = b.unexplained_difference_minor;
  const line = (label: string, value: ReactNode, strong?: boolean) => (
    <div className={`flex justify-between gap-3 py-1.5 ${strong ? "font-semibold" : ""}`}>
      <dt className="text-stone-700">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
  return (
    <Card>
      <CardHeader title="Balances" description="Opening balance + money in − money out = closing balance." />
      <CardBody className="space-y-4 text-[15px]">
        <dl>
          {line("Opening balance", b.opening_balance_minor !== null ? formatKes(b.opening_balance_minor) : "Unknown")}
          {line("+ Money in (statement)", formatKes(b.statement_in_minor))}
          {line("− Money out (statement)", formatKes(b.statement_out_minor))}
          {line("= Closing balance", b.closing_balance_minor !== null ? formatKes(b.closing_balance_minor) : "Unknown", true)}
        </dl>
        <p className={b.statement_adds_up ? "text-sm text-sage-800" : "text-sm text-brick-800"}>
          {b.statement_adds_up ? "The statement adds up." : "The statement's own figures do not add up; a row may be missing or misread."}
          {b.balance_breaks > 0 && ` The running balance breaks on ${b.balance_breaks} row${b.balance_breaks === 1 ? "" : "s"}.`}
          {b.unreadable_rows > 0 && ` ${b.unreadable_rows} row${b.unreadable_rows === 1 ? " is" : "s are"} unreadable.`}
        </p>
        <dl className="border-t border-stone-100 pt-3">
          {line("Your records: money in", formatKes(b.ledger_in_minor))}
          {line("Your records: money out", formatKes(b.ledger_out_minor))}
          {line(
            "Unexplained difference",
            difference === null ? "Unknown" : difference === 0 ? "None" : <span className="text-brick-800">{formatKes(difference)}</span>,
            true,
          )}
        </dl>
        <p className="text-xs text-stone-500">
          This checks the whole account, including personal activity, which is kept private and never counted in fundraiser totals.
        </p>
      </CardBody>
    </Card>
  );
}

function CompletionCard({ detail, onDone }: { detail: ImportDetail; onDone: (d: ImportDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const r = detail.readiness;
  async function complete() {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.post<ImportDetail>(`/api/manage/statements/${detail.import.id}/complete`));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const c = detail.counts;
  return (
    <Card>
      <CardHeader title="Completion" />
      <CardBody className="space-y-3 text-[15px]">
        <p className="text-stone-700">
          {c.matched} matched · {c.missing} missing · {c.conflict} conflicts · {c.review} to review
          {c.no_effect > 0 ? ` · ${c.no_effect} with no money` : ""}
        </p>
        {detail.reconciled ? (
          <Notice tone="success" title="Reconciliation complete">
            Every row is accounted for and the balances agree. Matched records show “Matched to uploaded statement” publicly.
          </Notice>
        ) : r.can_complete ? (
          <Notice tone="success">Everything is accounted for. You can mark this period complete.</Notice>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-stone-800">
            {r.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {detail.expenses_missing_receipts > 0 && (
          <p className="text-sm text-ochre-900">
            <Link to="/manage/transactions?status=missing_receipt">
              {detail.expenses_missing_receipts} expense{detail.expenses_missing_receipts === 1 ? "" : "s"} in this period
            </Link>{" "}
            {detail.expenses_missing_receipts === 1 ? "has" : "have"} no receipt yet. This does not block completion.
          </p>
        )}
        <SaveError error={error} />
        {!detail.reconciled && (
          <Button busy={busy} disabled={!r.can_complete} icon={<CircleCheckBig className="size-4" aria-hidden />} onClick={() => void complete()}>
            Mark reconciliation complete
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

function FailedImport({ detail, onChanged }: { detail: ImportDetail; onChanged: () => void }) {
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const imp = detail.import;
  const needsPassword = imp.error_code === "password_required" || imp.error_code === "wrong_password";

  async function retry(event: FormEvent) {
    event.preventDefault();
    setBusy("retry");
    setError(null);
    try {
      await api.post(`/api/manage/statements/${imp.id}/retry`, { password: password || null });
      setPassword("");
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function discard(event: FormEvent) {
    event.preventDefault();
    setBusy("discard");
    setError(null);
    try {
      await api.post(`/api/manage/statements/${imp.id}/discard`, { reason });
      setDiscarding(false);
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <Notice tone="danger" title="This statement could not be read">
          {imp.error_message}
        </Notice>
        <form onSubmit={retry} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field
            label="Statement password"
            htmlFor="retry-password"
            optional={!needsPassword}
            className="flex-1"
            hint="From the M-Pesa SMS. Used once and never stored."
          >
            <Input id="retry-password" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" busy={busy === "retry"} disabled={needsPassword && !password} icon={<RefreshCw className="size-4" aria-hidden />}>
            Try again
          </Button>
        </form>
        <SaveError error={error} />
        <Button variant="ghost" onClick={() => setDiscarding(true)}>
          Discard this import
        </Button>
        <Dialog open={discarding} onClose={() => setDiscarding(false)} title="Discard this import?">
          <form onSubmit={discard} className="space-y-4">
            <p className="text-[15px]">Use this for a wrong file or the wrong account. The file and its history are kept.</p>
            <Field label="Reason" htmlFor="discard-reason">
              <Textarea id="discard-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="flex gap-3">
              <Button type="submit" variant="danger" busy={busy === "discard"} disabled={reason.trim().length < 3}>
                Discard
              </Button>
              <Button variant="secondary" onClick={() => setDiscarding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Dialog>
      </CardBody>
    </Card>
  );
}
