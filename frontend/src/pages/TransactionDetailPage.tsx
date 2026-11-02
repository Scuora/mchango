import { ArrowLeft, Eye, EyeOff, FilePlus2, FileText, HandCoins, History, PencilLine, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { LoadState, SaveError } from "@/components/LoadState";
import { Amount, KindBadge, ReconciliationBadge, TransactionRow, itemLabel } from "@/components/money";
import { PledgeGroupTag, PledgeProgressBar, PledgeStatusBadge } from "@/components/pledges";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Card, CardBody, CardHeader, Detail, EmptyState, Notice } from "@/components/ui/misc";
import { MovementFields, apiDraftErrors, buildMovement, draftFromItem, type DraftErrors, type MovementDraft } from "@/features/movementForm";
import { PresentationFields, presentationDraftFrom, toPresentation, type PresentationDraft } from "@/features/presentationFields";
import { api, fieldError, useResource } from "@/lib/api";
import { KIND_LABELS, MATCH_LABELS } from "@/lib/labels";
import { formatKes } from "@/lib/money";
import { formatNairobi, formatNairobiDate } from "@/lib/time";
import type { Account, CorrectionRequest, Detail as DetailData, DocumentView, Fundraiser, PledgeStatus } from "@/lib/types";

export function TransactionDetailPage() {
  const { id } = useParams();
  const detail = useResource<DetailData>(`/api/manage/transactions/${id}`);
  const accounts = useResource<Account[]>("/api/manage/accounts");
  const settings = useResource<Fundraiser>("/api/manage/settings");
  const [correcting, setCorrecting] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (!detail.data) return <LoadState loading={detail.loading} error={detail.error} onRetry={detail.reload} />;
  const d = detail.data;
  const t = d.transaction;
  const sms = d.documents.filter((doc) => doc.kind === "sms");
  const receipts = d.documents.filter((doc) => doc.kind === "receipt");
  // A pledge's progress: the money received and linked to it.
  const pledgeReceived = d.linked.filter((l) => l.kind === "contribution" && !l.removed).reduce((s, l) => s + l.amount_minor, 0);
  const pledgeStatus: PledgeStatus = pledgeReceived === 0 ? "pledged" : pledgeReceived < t.amount_minor ? "part_received" : "received";

  return (
    <div className="space-y-4">
      <Link to="/manage/transactions" className="inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeft className="size-4" aria-hidden /> All transactions
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-stone-500">Record #{t.id}</p>
          <h1 className="page-title break-words">{itemLabel(t)}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <KindBadge kind={t.kind} />
            <ReconciliationBadge status={t.reconciliation} />
            {t.removed && <Badge tone="danger">Removed</Badge>}
            {t.kind === "personal" && <Badge>Not counted in fundraiser totals</Badge>}
            {t.kind === "pledge" && t.pledged_by && <PledgeGroupTag by={t.pledged_by} />}
            {t.kind === "pledge" && !t.removed && <PledgeStatusBadge status={pledgeStatus} />}
          </div>
        </div>
        <Amount minor={t.amount_minor} direction={t.direction} kind={t.kind} className="text-2xl" />
      </div>

      {t.kind === "pledge" && !t.removed && (
        <Card>
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-stone-600">
                <span className="font-semibold text-stone-900">{formatKes(pledgeReceived)}</span> of {formatKes(t.amount_minor)} received
                {pledgeStatus !== "received" && ` · ${formatKes(t.amount_minor - pledgeReceived)} still to come`}
              </p>
              <PledgeProgressBar received={pledgeReceived} amount={t.amount_minor} className="mt-2 h-2.5" />
            </div>
            {pledgeStatus !== "received" && (
              <ButtonLink to={`/manage/add?pledge=${t.id}`} variant="secondary" icon={<HandCoins className="size-4" aria-hidden />}>
                Record payment
              </ButtonLink>
            )}
          </CardBody>
        </Card>
      )}

      {t.removed && (
        <Notice tone="danger" title="This record was removed">
          It no longer counts in any total. The reason is in the correction history below.
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Money details"
              description="Changing these needs a correction with a reason; the old values stay in the history."
              actions={
                !t.removed && (
                  <>
                    <Button variant="secondary" size="sm" icon={<PencilLine className="size-4" aria-hidden />} onClick={() => setCorrecting(true)}>
                      Correct this record
                    </Button>
                    <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setRemoving(true)}>
                      Remove
                    </Button>
                  </>
                )
              }
            />
            <CardBody>
              <dl className="divide-y divide-stone-100">
                <Detail label="Type">{KIND_LABELS[t.kind]}{t.is_fee && t.kind !== "charge" ? " (charge line)" : ""}</Detail>
                <Detail label="Amount">{formatKes(t.amount_minor)}</Detail>
                <Detail label="Transaction time">{formatNairobi(t.occurred_at)}</Detail>
                <Detail label="Recorded">{formatNairobi(t.recorded_at)}</Detail>
                {t.account_name && <Detail label={t.kind === "transfer" ? "Moved from" : "Account"}>{t.account_name}</Detail>}
                {t.to_account_name && <Detail label="Moved to">{t.to_account_name}</Detail>}
                {t.reference && <Detail label="Reference (private)">{t.reference}</Detail>}
                {t.counterparty && <Detail label="Counterparty (private)">{t.counterparty}</Detail>}
                <Detail label="Version">{t.version}</Detail>
              </dl>
            </CardBody>
          </Card>

          {t.kind !== "personal" && (
            <PresentationCard detail={d} anonymousLabel={settings.data?.anonymous_label} onSaved={detail.setData} />
          )}
          {t.kind === "personal" && <PresentationCard detail={d} onSaved={detail.setData} notesOnly />}

          {(t.kind === "expense" || receipts.length > 0) && <ReceiptsCard detail={d} receipts={receipts} onChanged={detail.reload} onSaved={detail.setData} />}

          {(d.related || d.linked.length > 0) && (
            <Card>
              <CardHeader title="Linked records" />
              <ul className="stagger divide-y divide-stone-100">
                {d.related && <TransactionRow item={d.related} />}
                {d.linked.map((item) => (
                  <TransactionRow key={item.id} item={item} />
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Statement" />
            <CardBody>
              {d.statement_links.length === 0 ? (
                <p className="text-sm text-stone-600">
                  {t.reconciliation === "not_applicable" ? "Cash, pledges and unpaid bills have no statement." : "Not yet matched to an uploaded statement."}
                </p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {d.statement_links.map((link) => (
                    <li key={link.row_id} className="space-y-1">
                      <Link to={`/manage/statements/${link.import_id}`} className="font-medium">
                        {link.account_name}, {formatNairobiDate(link.period_start)} – {formatNairobiDate(link.period_end)}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={link.match_status === "matched" ? "success" : "warning"}>
                          {link.match_status === "matched" ? "Matched to uploaded statement" : MATCH_LABELS[link.match_status]}
                        </Badge>
                        {link.amount_minor !== null && <span className="text-stone-600">{formatKes(link.amount_minor)} on statement</span>}
                      </div>
                      {link.match_note && <p className="text-ochre-900">{link.match_note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {sms.length > 0 && (
            <Card>
              <CardHeader title="Original message" description="Private. Never shown publicly." />
              <CardBody>
                {sms.map((doc) => (
                  <details key={doc.id} className="text-sm">
                    <summary className="min-h-11 cursor-pointer py-2 font-medium text-stone-800">Show message</summary>
                    <p className="rounded-lg bg-stone-50 p-3 whitespace-pre-wrap text-stone-700">{doc.text_content}</p>
                  </details>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Correction history" />
            <CardBody>
              <ol className="space-y-3 text-sm">
                {d.versions.map((v) => (
                  <li key={v.version} className="rounded-lg border border-stone-100 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">Version {v.version}</span>
                      {v.is_current && <Badge tone="info">Current</Badge>}
                      {v.removed && <Badge tone="danger">Removed</Badge>}
                    </div>
                    <p className="mt-1 text-stone-700">
                      {KIND_LABELS[v.kind]} · {formatKes(v.amount_minor)} · {formatNairobi(v.occurred_at)}
                      {v.reference ? ` · ${v.reference}` : ""}
                    </p>
                    {v.reason && <p className="mt-1 text-stone-800">Reason: {v.reason}</p>}
                    <p className="mt-1 text-xs text-stone-500">Recorded {formatNairobi(v.created_at)}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Change history" />
            <CardBody>
              {d.history.length === 0 ? (
                <EmptyState icon={<History className="size-6" />} title="No changes yet" />
              ) : (
                <ol className="space-y-2 text-sm">
                  {d.history.map((h) => (
                    <li key={h.id}>
                      <p className="text-stone-800">{h.summary}</p>
                      {h.reason && <p className="text-stone-600">Reason: {h.reason}</p>}
                      <p className="text-xs text-stone-500">
                        {formatNairobi(h.at)}
                        {h.actor ? ` · by ${h.actor}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {accounts.data && (
        <CorrectDialog open={correcting} onClose={() => setCorrecting(false)} detail={d} accounts={accounts.data} onSaved={detail.setData} />
      )}
      <RemoveDialog open={removing} onClose={() => setRemoving(false)} detail={d} onSaved={detail.setData} />
    </div>
  );
}

function PresentationCard({
  detail,
  anonymousLabel,
  onSaved,
  notesOnly,
}: {
  detail: DetailData;
  anonymousLabel?: string;
  onSaved: (d: DetailData) => void;
  notesOnly?: boolean;
}) {
  const t = detail.transaction;
  const [draft, setDraft] = useState<PresentationDraft>(presentationDraftFrom(t));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(presentationDraftFrom(t)), [t]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      onSaved(await api.put<DetailData>(`/api/manage/transactions/${t.id}/presentation`, toPresentation(draft, t.kind)));
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={notesOnly ? "Private notes" : "What people see"}
        description={notesOnly ? undefined : "Editing these never changes the amount or statement evidence."}
      />
      <form onSubmit={save}>
        <CardBody className="space-y-4">
          <PresentationFields kind={t.kind} draft={draft} onChange={setDraft} anonymousLabel={anonymousLabel} error={error} idPrefix="edit" />
          {error !== null && !fieldError(error, "public_name") && !fieldError(error, "description") ? <SaveError error={error} /> : null}
          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary" busy={busy}>
              Save changes
            </Button>
            {saved && <span className="text-sm text-sage-800" role="status">Saved</span>}
          </div>
        </CardBody>
      </form>
    </Card>
  );
}

function ReceiptsCard({
  detail,
  receipts,
  onChanged,
  onSaved,
}: {
  detail: DetailData;
  receipts: DocumentView[];
  onChanged: () => void;
  onSaved: (d: DetailData) => void;
}) {
  const t = detail.transaction;
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [publishing, setPublishing] = useState<DocumentView | null>(null);
  const [inputKey, setInputKey] = useState(0);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.upload<DetailData>(`/api/manage/transactions/${t.id}/receipts`, form));
      setFile(null);
      setInputKey((k) => k + 1);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function unpublish(doc: DocumentView) {
    try {
      await api.post(`/api/manage/documents/${doc.id}/publish`, { publish: false });
      onChanged();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <Card>
      <CardHeader title="Receipts" description="Private unless you publish one. Publish only a copy with personal details removed." />
      <CardBody className="space-y-4">
        {receipts.length === 0 ? (
          <p className="text-sm text-ochre-900">No receipt attached yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {receipts.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <a href={`/api/manage/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2">
                  <FileText className="size-4" aria-hidden />
                  {doc.original_name ?? `Receipt ${doc.id}`}
                </a>
                <div className="flex items-center gap-2">
                  {doc.published_at ? <Badge tone="success">Public</Badge> : <Badge>Private</Badge>}
                  {doc.published_at ? (
                    <Button variant="ghost" size="sm" icon={<EyeOff className="size-4" aria-hidden />} onClick={() => void unpublish(doc)}>
                      Unpublish
                    </Button>
                  ) : (
                    t.kind !== "personal" &&
                    !t.removed && (
                      <Button variant="ghost" size="sm" icon={<Eye className="size-4" aria-hidden />} onClick={() => setPublishing(doc)}>
                        Publish
                      </Button>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!t.removed && (
          <form onSubmit={upload} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Attach a receipt" htmlFor="receipt-file" hint="PDF, JPEG, PNG or WebP, up to 10 MB." className="flex-1" error={fieldError(error, "file")}>
              <input
                key={inputKey}
                id="receipt-file"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="block min-h-11 w-full text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:font-medium"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            <Button type="submit" variant="secondary" busy={busy} disabled={!file} icon={<FilePlus2 className="size-4" aria-hidden />}>
              Upload
            </Button>
          </form>
        )}
        {error !== null && !fieldError(error, "file") ? <SaveError error={error} /> : null}
      </CardBody>
      <PublishDialog doc={publishing} onClose={() => setPublishing(null)} onDone={onChanged} />
    </Card>
  );
}

function PublishDialog({ doc, onClose, onDone }: { doc: DocumentView | null; onClose: () => void; onDone: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    setConfirmed(false);
    setError(null);
  }, [doc]);

  async function publish() {
    if (!doc) return;
    setBusy(true);
    try {
      await api.post(`/api/manage/documents/${doc.id}/publish`, { publish: true, confirm_redacted: confirmed });
      onDone();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={doc !== null} onClose={onClose} title="Publish this receipt?">
      <div className="space-y-4 text-[15px]">
        <p>Anyone with the public page will be able to open this file.</p>
        <a href={doc ? `/api/manage/documents/${doc.id}/file` : undefined} target="_blank" rel="noreferrer">
          Open the file to check it first
        </a>
        <Checkbox
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          label="This receipt shows no phone numbers, ID numbers or other private details"
        />
        <SaveError error={error} />
        <div className="flex gap-3">
          <Button onClick={() => void publish()} busy={busy} disabled={!confirmed}>
            Publish receipt
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CorrectDialog({
  open,
  onClose,
  detail,
  accounts,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  detail: DetailData;
  accounts: Account[];
  onSaved: (d: DetailData) => void;
}) {
  const [draft, setDraft] = useState<MovementDraft>(draftFromItem(detail.transaction));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (open) {
      setDraft(draftFromItem(detail.transaction));
      setReason("");
      setErrors({});
      setError(null);
    }
  }, [open, detail.transaction]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const built = buildMovement(draft);
    if ("errors" in built) {
      setErrors(built.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    setError(null);
    try {
      const body: CorrectionRequest = { reason, replacement: built.movement };
      onSaved(await api.post<DetailData>(`/api/manage/transactions/${detail.transaction.id}/corrections`, body));
      onClose();
    } catch (e) {
      setError(e);
      setErrors(apiDraftErrors(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Correct this record" wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Notice tone="info">The current values are kept in the history. Only the corrected version counts in totals.</Notice>
        <MovementFields draft={draft} onChange={setDraft} accounts={accounts} errors={errors} idPrefix="fix" />
        <Field label="Why is this being corrected?" htmlFor="fix-reason" error={fieldError(error, "reason")}>
          <Textarea id="fix-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Typed 1,800 instead of 1,500" />
        </Field>
        {error !== null && !fieldError(error, "reason") && Object.keys(apiDraftErrors(error)).length === 0 ? <SaveError error={error} /> : null}
        <div className="flex gap-3">
          <Button type="submit" busy={busy} disabled={reason.trim().length < 3}>
            Save correction
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RemoveDialog({ open, onClose, detail, onSaved }: { open: boolean; onClose: () => void; detail: DetailData; onSaved: (d: DetailData) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const feeLines = detail.linked.filter((l) => l.is_fee && !l.removed);

  async function remove(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: CorrectionRequest = { reason, replacement: null };
      onSaved(await api.post<DetailData>(`/api/manage/transactions/${detail.transaction.id}/corrections`, body));
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Remove this record">
      <form onSubmit={remove} className="space-y-4">
        <p className="text-[15px]">
          Use this for duplicates or entries made by mistake. The record stays in the history, marked removed, and stops counting.
        </p>
        {feeLines.length > 0 && (
          <Notice tone="warning">Its charge line{feeLines.length > 1 ? "s are" : " is"} removed with it.</Notice>
        )}
        <Field label="Reason" htmlFor="remove-reason" error={fieldError(error, "reason")}>
          <Textarea id="remove-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" />
        </Field>
        {error !== null && !fieldError(error, "reason") ? <SaveError error={error} /> : null}
        <div className="flex gap-3">
          <Button type="submit" variant="danger" busy={busy} disabled={reason.trim().length < 3}>
            Remove record
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
