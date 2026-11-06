import { Archive, ArchiveRestore, ArrowLeft, Eye, EyeOff, FilePlus2, FileText, HandCoins, ListTree, Merge, PencilLine, Save, Undo2, Unlink, Users, Wallet } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { LoadState, SaveError } from "@/components/LoadState";
import { Amount, ChallengeTag, KindBadge, ReconciliationBadge, TransactionRow, isPaidTogether, itemLabel } from "@/components/money";
import { PledgeGroupTag, PledgeProgressBar, PledgeStatusBadge } from "@/components/pledges";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Card, CardBody, CardHeader, Detail, Notice } from "@/components/ui/misc";
import { ChangeList, actorName } from "@/features/audit";
import { ChallengePicker, canJoinChallenge } from "@/features/challenges";
import { SharesEditor, buildShares, draftsFrom, type ShareDraft } from "@/features/shares";
import { ItemsEditor, buildItems, itemDraftsFrom, type ItemDraft } from "@/features/items";
import { BillStatusBadge, billStatus } from "@/features/bills";
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
  const [restoring, setRestoring] = useState(false);

  if (!detail.data) return <LoadState loading={detail.loading} error={detail.error} onRetry={detail.reload} />;
  const d = detail.data;
  const t = d.transaction;
  const sms = d.documents.filter((doc) => doc.kind === "sms");
  const receipts = d.documents.filter((doc) => doc.kind === "receipt");
  // A pledge's progress: the money received and linked to it.
  const pledgeReceived = d.linked.filter((l) => l.kind === "contribution" && !l.removed).reduce((s, l) => s + l.amount_minor, 0);
  const pledgeStatus: PledgeStatus = pledgeReceived === 0 ? "pledged" : pledgeReceived < t.amount_minor ? "part_received" : "received";
  // A bill's progress: the money paid and linked to it.
  const billPaid = d.linked.filter((l) => l.kind === "expense" && !l.removed).reduce((s, l) => s + l.amount_minor, 0);

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
            {t.removed && <Badge tone="neutral">Archived</Badge>}
            {d.group && isPaidTogether(t) && (
              <Badge tone="info">
                <Wallet className="size-3.5" aria-hidden />
                Paid from {d.group.members.filter((m) => !m.removed).length} accounts
              </Badge>
            )}
            {d.group && !isPaidTogether(t) && (
              <Badge tone="info">
                <Merge className="size-3.5" aria-hidden />
                Merged as {d.group.public_name ?? settings.data?.anonymous_label ?? "Anonymous"}
              </Badge>
            )}
            {t.kind === "personal" && <Badge>Not counted in fundraiser totals</Badge>}
            {t.kind === "pledge" && t.pledged_by && <PledgeGroupTag by={t.pledged_by} />}
            {t.kind === "pledge" && !t.removed && <PledgeStatusBadge status={pledgeStatus} />}
            {t.kind === "commitment" && !t.removed && <BillStatusBadge status={billStatus(t.amount_minor, billPaid)} />}
            {t.challenge_id && t.challenge_name && (
              <Link to={`/manage/challenges/${t.challenge_id}`} className="inline-flex max-w-full min-w-0 no-underline hover:no-underline">
                <ChallengeTag name={t.challenge_name} />
              </Link>
            )}
          </div>
          <p className="mt-2 text-sm text-stone-600">
            Recorded by <span className="font-medium text-stone-800">{actorName(t.created_by)}</span> on {formatNairobi(t.recorded_at)}
            {t.last_changed_at && d.history.length > 1 && (
              <>
                {" "}
                · last changed by <span className="font-medium text-stone-800">{actorName(t.last_changed_by)}</span> on {formatNairobi(t.last_changed_at)}
              </>
            )}
          </p>
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

      {t.kind === "commitment" && !t.removed && (
        <Card>
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-stone-600">
                <span className="font-semibold text-stone-900">{formatKes(billPaid)}</span> of {formatKes(t.amount_minor)} paid
                {billPaid < t.amount_minor && ` · ${formatKes(t.amount_minor - billPaid)} left to pay`}
                {billPaid > t.amount_minor && ` · ${formatKes(billPaid - t.amount_minor)} more than the bill`}
              </p>
              <PledgeProgressBar received={billPaid} amount={t.amount_minor} className="mt-2 h-2.5" />
            </div>
            {billPaid < t.amount_minor && (
              <ButtonLink to={`/manage/add?bill=${t.id}`} variant="secondary" icon={<HandCoins className="size-4" aria-hidden />}>
                Record a payment
              </ButtonLink>
            )}
          </CardBody>
        </Card>
      )}

      {t.removed && (
        <Notice tone="warning" title="This record is archived">
          <p>It does not count in any total or appear publicly. Everything about it is kept; the reason is in the history below.</p>
          <Button variant="secondary" size="sm" className="mt-3" icon={<ArchiveRestore className="size-4" aria-hidden />} onClick={() => setRestoring(true)}>
            Restore it
          </Button>
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
                    <Button variant="ghost" size="sm" icon={<Archive className="size-4" aria-hidden />} onClick={() => setRemoving(true)}>
                      Archive
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
          {d.group && isPaidTogether(t) && <PaidFromCard detail={d} onSaved={detail.setData} />}
          {d.group && !isPaidTogether(t) && <MergedCard detail={d} anonymousLabel={settings.data?.anonymous_label} onSaved={detail.setData} onChanged={detail.reload} />}
          {!t.removed && t.kind === "contribution" && !d.group && <SharesCard detail={d} anonymousLabel={settings.data?.anonymous_label} onSaved={detail.setData} />}
          {!t.removed && t.kind === "expense" && !d.group && <ItemsCard detail={d} onSaved={detail.setData} />}
          {!t.removed && canJoinChallenge(t.kind) && <ChallengeCard detail={d} onSaved={detail.setData} />}

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
                  {t.reconciliation === "not_applicable" ? "Cash, pledges and bills have no statement." : "Not yet matched to an uploaded statement."}
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
                      {v.removed && <Badge tone="neutral">Archived</Badge>}
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
            <CardHeader title="Change history" description="Who did what, and what changed." />
            <CardBody>
              <ChangeList entries={d.history} />
            </CardBody>
          </Card>
        </div>
      </div>

      {accounts.data && (
        <CorrectDialog open={correcting} onClose={() => setCorrecting(false)} detail={d} accounts={accounts.data} onSaved={detail.setData} />
      )}
      <RemoveDialog open={removing} onClose={() => setRemoving(false)} detail={d} onSaved={detail.setData} />
      <RestoreDialog open={restoring} onClose={() => setRestoring(false)} detail={d} onSaved={detail.setData} />
    </div>
  );
}

/** Who a payment is from: one person, or several, each with their part. No money moves when it changes. */
function SharesCard({ detail, anonymousLabel, onSaved }: { detail: DetailData; anonymousLabel?: string; onSaved: (d: DetailData) => void }) {
  const t = detail.transaction;
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<ShareDraft[]>(() => draftsFrom(t.shares));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function save(shares: { public_name: string | null; amount_minor: number }[]) {
    setBusy(true);
    setError(undefined);
    try {
      onSaved(await api.put<DetailData>(`/api/manage/transactions/${t.id}/shares`, { shares }));
      setEditing(false);
    } catch (e) {
      setError(fieldError(e, "shares") ?? (e instanceof Error ? e.message : "The shares could not be saved."));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const built = buildShares(rows, t.amount_minor);
    if ("error" in built) setError(built.error);
    else void save(built.shares);
  }

  return (
    <Card>
      <CardHeader
        title="Who it's from"
        description="One payment can be from several people. Each is listed on their own publicly; the money counts once."
        actions={
          !editing && (
            <Button variant="secondary" size="sm" icon={<Users className="size-4" aria-hidden />} onClick={() => (setRows(draftsFrom(t.shares)), setEditing(true))}>
              {t.shares.length ? "Change the shares" : "Share among several people"}
            </Button>
          )
        }
      />
      <CardBody>
        {editing ? (
          <form onSubmit={submit} className="space-y-3">
            <SharesEditor total={t.amount_minor} value={rows} onChange={setRows} anonymousLabel={anonymousLabel} error={error} idPrefix="tx-sh" />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" busy={busy} icon={<Save className="size-4" aria-hidden />}>
                Save shares
              </Button>
              {t.shares.length > 0 && (
                <Button type="button" variant="ghost" size="sm" busy={busy} onClick={() => void save([])}>
                  Make it one person&rsquo;s again
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => (setEditing(false), setError(undefined))}>
                Cancel
              </Button>
            </div>
          </form>
        ) : t.shares.length ? (
          <ol className="divide-y divide-stone-100 text-[15px]">
            {t.shares.map((s, i) => (
              <li key={i} className="flex justify-between gap-3 py-1.5">
                <span className="text-stone-800">
                  <span className="mr-2 text-stone-400 tabular-nums">{i + 1}.</span>
                  {s.public_name ?? anonymousLabel ?? "Anonymous contributor"}
                </span>
                <span className="font-semibold tabular-nums">{formatKes(s.amount_minor)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-stone-600">From one person, listed under the public name above.</p>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Several payments from one giver, listed publicly as one entry. Every payment
 * keeps its message and history; separating them changes no money.
 */
/** A payment out made from several accounts: each account's part, kept in that account. */
function PaidFromCard({ detail, onSaved }: { detail: DetailData; onSaved: (d: DetailData) => void }) {
  const group = detail.group!;
  const t = detail.transaction;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const live = group.members.filter((m) => !m.removed);

  async function separate() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.post<DetailData>(`/api/manage/transactions/${t.id}/separate`, {}));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Paid from several accounts"
        description={`One payment of ${formatKes(group.total_minor)} from ${live.length} accounts, listed once. Each part counts in its own account and keeps its own M-Pesa code, charge and statement match. Changes to the description apply to every part.`}
      />
      <CardBody className="space-y-4">
        <ol className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {group.members.map((m) => (
            <li key={m.id} className={m.id === t.id ? "bg-plum-50/60" : undefined}>
              <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-900">
                    {m.id === t.id ? (
                      <>
                        #{m.id} · {m.account_name ?? "?"} · this part
                      </>
                    ) : (
                      <Link to={`/manage/transactions/${m.id}`}>
                        #{m.id} · {m.account_name ?? "?"}
                      </Link>
                    )}
                    {m.removed && <Badge tone="neutral" className="ml-2">Archived</Badge>}
                  </p>
                  <p className="text-sm text-stone-600">
                    {formatNairobi(m.occurred_at)}
                    {m.reference && ` · ${m.reference}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Amount minor={m.amount_minor} direction={m.direction} kind={m.kind} className={m.removed ? "line-through" : undefined} />
                  <ReconciliationBadge status={m.reconciliation} />
                </div>
              </div>
            </li>
          ))}
        </ol>
        <Button variant="secondary" size="sm" busy={busy} icon={<Unlink className="size-4" aria-hidden />} onClick={() => void separate()}>
          Take this part out
        </Button>
        <SaveError error={error} />
      </CardBody>
    </Card>
  );
}

function MergedCard({
  detail,
  anonymousLabel,
  onSaved,
  onChanged,
}: {
  detail: DetailData;
  anonymousLabel?: string;
  onSaved: (d: DetailData) => void;
  onChanged: () => void;
}) {
  const group = detail.group!;
  const t = detail.transaction;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.public_name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [undoing, setUndoing] = useState(false);
  const live = group.members.filter((m) => !m.removed);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const rename = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api.put(`/api/manage/merged/${group.id}`, { public_name: name.trim() || null });
      setRenaming(false);
      onChanged();
    });
  };
  const separate = () => run(async () => onSaved(await api.post<DetailData>(`/api/manage/transactions/${t.id}/separate`, {})));
  const undo = () =>
    run(async () => {
      await api.delete(`/api/manage/merged/${group.id}`);
      setUndoing(false);
      onChanged();
    });

  return (
    <Card>
      <CardHeader
        title="Merged entry"
        description={`Listed publicly as one entry: ${live.length} payments, ${formatKes(group.total_minor)} in all. Each payment keeps its message and history.`}
        actions={
          !renaming && (
            <Button variant="secondary" size="sm" icon={<PencilLine className="size-4" aria-hidden />} onClick={() => (setName(group.public_name ?? ""), setRenaming(true))}>
              Rename
            </Button>
          )
        }
      />
      <CardBody className="space-y-4">
        {renaming ? (
          <form onSubmit={rename} className="space-y-3">
            <Field label="Listed publicly as" htmlFor="merged-name" hint="Left empty, the entry shows the anonymous label.">
              <Input id="merged-name" value={name} maxLength={80} placeholder={anonymousLabel} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" busy={busy} icon={<Save className="size-4" aria-hidden />}>
                Save name
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-[15px]">
            <Merge className="mr-1.5 inline size-4 text-plum-700" aria-hidden />
            <span className="font-semibold text-stone-900">{group.public_name ?? anonymousLabel ?? "Anonymous contributor"}</span>
          </p>
        )}

        <ol className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {group.members.map((m) => {
            const messages = group.messages.filter((g) => g.transaction_id === m.id);
            return (
              <li key={m.id} className={m.id === t.id ? "bg-plum-50/60" : undefined}>
                <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900">
                      {m.id === t.id ? (
                        <>#{m.id} · this payment</>
                      ) : (
                        <Link to={`/manage/transactions/${m.id}`}>#{m.id} · {itemLabel(m)}</Link>
                      )}
                      {m.removed && <Badge tone="neutral" className="ml-2">Archived</Badge>}
                    </p>
                    <p className="text-sm text-stone-600">
                      {formatNairobi(m.occurred_at)}
                      {m.reference && ` · ${m.reference}`}
                    </p>
                  </div>
                  <Amount minor={m.amount_minor} direction={m.direction} kind={m.kind} className={m.removed ? "line-through" : undefined} />
                </div>
                {messages.map((msg, i) => (
                  <details key={i} className="px-3 pb-2.5">
                    <summary className="cursor-pointer text-sm text-plum-800">Original message</summary>
                    <p className="mt-1.5 rounded-md bg-stone-50 p-2.5 font-mono text-[13px] break-words whitespace-pre-wrap text-stone-700">{msg.text_content}</p>
                  </details>
                ))}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" busy={busy} icon={<Unlink className="size-4" aria-hidden />} onClick={() => void separate()}>
            Take this payment out
          </Button>
          <Button variant="ghost" size="sm" icon={<Undo2 className="size-4" aria-hidden />} onClick={() => setUndoing(true)}>
            Undo the merge
          </Button>
        </div>
        <SaveError error={error} />
      </CardBody>
      <Dialog open={undoing} onClose={() => setUndoing(false)} title="Undo the merge?">
        <p className="text-[15px] text-stone-700">
          The {group.members.length} payments are listed on their own again, each under its own public name. No money changes and nothing is deleted.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button busy={busy} icon={<Undo2 className="size-4" aria-hidden />} onClick={() => void undo()}>
            Undo the merge
          </Button>
          <Button variant="ghost" onClick={() => setUndoing(false)}>
            Keep it merged
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}

/** What a payment out covered: one thing, or several, each with its part. No money moves when it changes. */
function ItemsCard({ detail, onSaved }: { detail: DetailData; onSaved: (d: DetailData) => void }) {
  const t = detail.transaction;
  const items = t.items ?? [];
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<ItemDraft[]>(() => itemDraftsFrom(items));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function save(next: { description: string; amount_minor: number }[]) {
    setBusy(true);
    setError(undefined);
    try {
      onSaved(await api.put<DetailData>(`/api/manage/transactions/${t.id}/items`, { items: next }));
      setEditing(false);
    } catch (e) {
      setError(fieldError(e, "items") ?? (e instanceof Error ? e.message : "The items could not be saved."));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const built = buildItems(rows, t.amount_minor);
    if ("error" in built) setError(built.error);
    else void save(built.items);
  }

  return (
    <Card>
      <CardHeader
        title="What it paid for"
        description="One payment can cover several things. Each is listed on its own publicly; the money counts once."
        actions={
          !editing && (
            <Button variant="secondary" size="sm" icon={<ListTree className="size-4" aria-hidden />} onClick={() => (setRows(itemDraftsFrom(items)), setEditing(true))}>
              {items.length ? "Change the items" : "Break it down"}
            </Button>
          )
        }
      />
      <CardBody>
        {editing ? (
          <form onSubmit={submit} className="space-y-3">
            <ItemsEditor total={t.amount_minor} value={rows} onChange={setRows} error={error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" busy={busy} icon={<Save className="size-4" aria-hidden />}>
                Save items
              </Button>
              {items.length > 0 && (
                <Button type="button" variant="ghost" size="sm" busy={busy} onClick={() => void save([])}>
                  Make it one payment again
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => (setEditing(false), setError(undefined))}>
                Cancel
              </Button>
            </div>
          </form>
        ) : items.length ? (
          <ol className="divide-y divide-stone-100 text-[15px]">
            {items.map((item, i) => (
              <li key={i} className="flex justify-between gap-3 py-1.5">
                <span className="text-stone-800">
                  <span className="mr-2 text-stone-400 tabular-nums">{i + 1}.</span>
                  {item.description}
                </span>
                <span className="font-semibold tabular-nums">{formatKes(item.amount_minor)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-stone-600">One thing, listed under the description above.</p>
        )}
      </CardBody>
    </Card>
  );
}

/** Which challenge a contribution or pledge came in through. No money moves when it changes. */
function ChallengeCard({ detail, onSaved }: { detail: DetailData; onSaved: (d: DetailData) => void }) {
  const t = detail.transaction;
  const current = t.challenge_id ? String(t.challenge_id) : "";
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => setValue(current), [current]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.put<DetailData>(`/api/manage/transactions/${t.id}/challenge`, { challenge_id: value ? Number(value) : null }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Challenge" description="Did this come in through a challenge? It counts once in the main totals either way." />
      <form onSubmit={save}>
        <CardBody className="space-y-3">
          <Field label="Came in through" htmlFor="tx-challenge" optional error={fieldError(error, "challenge_id")}>
            <ChallengePicker id="tx-challenge" value={value} onChange={setValue} />
          </Field>
          <SaveError error={error && !fieldError(error, "challenge_id") ? error : null} />
          <Button type="submit" variant="secondary" size="sm" busy={busy} disabled={value === current} icon={<Save className="size-4" aria-hidden />}>
            {value ? "Save challenge" : current ? "Take out of the challenge" : "Save"}
          </Button>
        </CardBody>
      </form>
    </Card>
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
    <Dialog open={open} onClose={onClose} title="Archive this record">
      <form onSubmit={remove} className="space-y-4">
        <p className="text-[15px]">
          For duplicates or entries made by mistake. It stops counting in the totals and leaves the public page, but nothing is deleted: it stays under
          &ldquo;Archived records&rdquo; with its history, and can be restored.
        </p>
        {feeLines.length > 0 && (
          <Notice tone="warning">Its charge line{feeLines.length > 1 ? "s are" : " is"} archived with it.</Notice>
        )}
        <Field label="Why archive it?" htmlFor="remove-reason" error={fieldError(error, "reason")}>
          <Textarea id="remove-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" />
        </Field>
        {error !== null && !fieldError(error, "reason") ? <SaveError error={error} /> : null}
        <div className="flex gap-3">
          <Button type="submit" variant="danger" busy={busy} disabled={reason.trim().length < 3}>
            Archive record
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RestoreDialog({ open, onClose, detail, onSaved }: { open: boolean; onClose: () => void; detail: DetailData; onSaved: (d: DetailData) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function restore(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.post<DetailData>(`/api/manage/transactions/${detail.transaction.id}/restore`, { reason }));
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Restore this record">
      <form onSubmit={restore} className="space-y-4">
        <p className="text-[15px]">It counts again with the values it had, together with any charge line archived with it. The archive and the restore stay in the history.</p>
        <Field label="Why restore it?" htmlFor="restore-reason" error={fieldError(error, "reason")}>
          <Textarea id="restore-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. It was not a duplicate" />
        </Field>
        {error !== null && !fieldError(error, "reason") ? <SaveError error={error} /> : null}
        <div className="flex gap-3">
          <Button type="submit" busy={busy} disabled={reason.trim().length < 3} icon={<ArchiveRestore className="size-4" aria-hidden />}>
            Restore record
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
