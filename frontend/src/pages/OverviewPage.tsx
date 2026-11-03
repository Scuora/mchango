import { AlertTriangle, ArrowRight, FileUp, GitCompareArrows, Loader2, Megaphone, PlusCircle, Receipt, Share2, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { CountUp } from "@/components/CountUp";
import { GoalBar } from "@/components/GoalBar";
import { LoadState } from "@/components/LoadState";
import { TransactionRow } from "@/components/money";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/misc";
import { useResource } from "@/lib/api";
import { familyOf, goalOf } from "@/lib/goal";
import { formatKes, formatKesShort } from "@/lib/money";
import { formatNairobiDate } from "@/lib/time";
import type { Overview } from "@/lib/types";

function Stat({ label, value, amount, note, strong }: { label: string; value: string; amount?: number; note?: ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "lift rounded-xl bg-plum-700 p-4 text-white" : "lift rounded-xl border border-stone-200 bg-white p-4"}>
      <p className={strong ? "text-sm text-plum-100" : "text-sm text-stone-600"}>{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{amount === undefined ? value : <CountUp value={amount} format={formatKes} />}</p>
      {note && <p className={strong ? "mt-1 text-xs text-plum-100" : "mt-1 text-xs text-stone-500"}>{note}</p>}
    </div>
  );
}

function AttentionLink({ to, icon, count, children }: { to: string; icon: ReactNode; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <li>
      <Link to={to} className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-stone-800 no-underline hover:bg-stone-50 hover:no-underline">
        <span className="text-ochre-700">{icon}</span>
        <span className="flex-1">{children}</span>
        <span className="rounded-full bg-ochre-100 px-2 text-sm font-semibold text-ochre-900 tabular-nums">{count}</span>
        <ArrowRight className="size-4 text-stone-400" aria-hidden />
      </Link>
    </li>
  );
}

export function OverviewPage() {
  const overview = useResource<Overview>("/api/manage/overview");
  if (!overview.data) return <LoadState loading={overview.loading} error={overview.error} onRetry={overview.reload} />;
  const { fundraiser, totals } = overview.data;
  const o = overview.data;
  const refundsNet = totals.refunds_paid_minor - totals.refunds_received_minor;
  const goal = goalOf(fundraiser.target_minor, o.pledges, totals.contributions_minor);
  const latest = o.reconciled_periods[0];
  const attentionCount = o.needs_review + o.missing_receipts + o.statement_rows_to_resolve + o.imports_in_progress;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="page-title">{fundraiser.name}</h1>
        {fundraiser.description && <p className="max-w-3xl text-stone-700">{fundraiser.description}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ButtonLink to="/manage/add" size="lg" icon={<PlusCircle className="size-5" aria-hidden />}>
          Add transaction
        </ButtonLink>
        <ButtonLink to="/manage/statements" size="lg" variant="secondary" icon={<FileUp className="size-5" aria-hidden />}>
          Upload statement
        </ButtonLink>
        <ButtonLink to="/manage/announcements?new=1" size="lg" variant="secondary" icon={<Megaphone className="size-5" aria-hidden />}>
          Post an update
        </ButtonLink>
      </div>

      {goal && (
        <Card>
          <CardHeader
            title={goal.target !== null ? `Goal: ${formatKes(goal.target)}` : "Pledges"}
            description="The part received from the family, then what family, friends and well-wishers are asked for. Link money received to its pledge so it is counted on the right side."
            actions={
              <ButtonLink to="/manage/pledges" variant="secondary" size="sm">
                Pledges
              </ButtonLink>
            }
          />
          <CardBody>
            <GoalBar goal={goal} family={familyOf(fundraiser.memorial_name)} />
          </CardBody>
        </Card>
      )}

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Contributions received" value={formatKes(totals.contributions_minor)} amount={totals.contributions_minor} note={`${totals.contributions_count} contributions`} />
        <Stat label="Expenses paid" value={formatKes(totals.expenses_minor)} amount={totals.expenses_minor} note={`${totals.expenses_count} payments`} />
        <Stat label="Charges" value={formatKes(totals.charges_minor)} amount={totals.charges_minor} />
        <Stat
          label="Refunds"
          value={formatKes(refundsNet)} amount={refundsNet}
          note={totals.refunds_received_minor > 0 ? `${formatKes(totals.refunds_paid_minor)} paid, ${formatKes(totals.refunds_received_minor)} received` : "paid out"}
        />
        <div className="col-span-2 lg:col-span-1">
          <Stat
            strong
            label="Remaining funds"
            value={formatKes(totals.remaining_minor)} amount={totals.remaining_minor}
            note={totals.opening_funds_minor > 0 ? `Includes ${formatKes(totals.opening_funds_minor)} opening funds` : "Derived from the records"}
          />
        </div>
      </div>
      {(totals.reversals_in_minor > 0 || totals.reversals_out_minor > 0) && (
        <p className="text-sm text-stone-600">
          Reversals: {formatKes(totals.reversals_in_minor)} back in, {formatKes(totals.reversals_out_minor)} out.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Needs attention" />
          <CardBody className="px-2 sm:px-2">
            {attentionCount === 0 ? (
              <p className="px-3 text-sm text-stone-600">Nothing needs attention right now.</p>
            ) : (
              <ul className="space-y-1">
                <AttentionLink to="/manage/transactions?status=needs_review" icon={<AlertTriangle className="size-5" />} count={o.needs_review}>
                  Needs review
                </AttentionLink>
                <AttentionLink to="/manage/transactions?status=missing_receipt" icon={<Receipt className="size-5" />} count={o.missing_receipts}>
                  Expenses without a receipt
                </AttentionLink>
                <AttentionLink to="/manage/statements" icon={<GitCompareArrows className="size-5" />} count={o.statement_rows_to_resolve}>
                  Statement rows to resolve
                </AttentionLink>
                <AttentionLink to="/manage/statements" icon={<Loader2 className="size-5" />} count={o.imports_in_progress}>
                  Statements being read
                </AttentionLink>
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Statement checks" />
          <CardBody className="space-y-3 text-sm">
            <p>
              <Link to="/manage/transactions?status=not_matched" className="font-semibold">
                {o.awaiting_reconciliation} transaction{o.awaiting_reconciliation === 1 ? "" : "s"}
              </Link>{" "}
              awaiting reconciliation.
            </p>
            <p className="text-stone-700">
              {latest ? (
                <>
                  Last reconciled period:{" "}
                  <Link to={`/manage/statements/${latest.import_id}`}>
                    {formatNairobiDate(latest.period_start)} – {formatNairobiDate(latest.period_end)}
                  </Link>{" "}
                  ({latest.account_name})
                </>
              ) : (
                "No period has been fully reconciled yet."
              )}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Where the money is" description="Fundraiser money only; personal activity is excluded." />
          <CardBody>
            <dl className="divide-y divide-stone-100 text-[15px]">
              {o.funds_by_account.map((a) => (
                <div key={a.account_id} className="flex justify-between gap-3 py-2">
                  <dt className="text-stone-700">{a.name}</dt>
                  <dd className="font-semibold tabular-nums">{formatKes(a.amount_minor)}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        {o.challenges.length > 0 && (
          <Card>
            <CardHeader
              title="Challenges"
              description="What each challenge has brought in. Already part of the contributions above."
              actions={
                <ButtonLink to="/manage/challenges" variant="secondary" size="sm" icon={<Trophy className="size-4" aria-hidden />}>
                  Challenges
                </ButtonLink>
              }
            />
            <CardBody>
              <dl className="divide-y divide-stone-100 text-[15px]">
                {o.challenges
                  .filter((c) => c.status === "active" || c.totals.raised_minor > 0)
                  .slice(0, 6)
                  .map((c) => (
                    <div key={c.id} className="flex justify-between gap-3 py-2">
                      <dt className="min-w-0 text-stone-700">
                        <Link to={`/manage/challenges/${c.id}`}>{c.name}</Link>
                        {c.status === "closed" && <span className="ml-1.5 text-sm text-stone-500">(closed)</span>}
                      </dt>
                      <dd className="text-right font-semibold whitespace-nowrap tabular-nums">
                        {formatKes(c.totals.raised_minor)}
                        {c.target_minor ? <span className="block text-xs font-normal text-stone-500">of {formatKesShort(c.target_minor)}</span> : null}
                      </dd>
                    </div>
                  ))}
              </dl>
            </CardBody>
          </Card>
        )}

        {(totals.pledged_outstanding_minor > 0 || totals.unpaid_bills_minor > 0) && (
          <Card>
            <CardHeader title="Promises" description="Not money yet; not in the totals above." />
            <CardBody>
              <dl className="divide-y divide-stone-100 text-[15px]">
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-stone-700">Pledged, not yet received</dt>
                  <dd className="font-semibold tabular-nums">{formatKes(totals.pledged_outstanding_minor)}</dd>
                </div>
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-stone-700">Unpaid bills</dt>
                  <dd className="font-semibold tabular-nums">{formatKes(totals.unpaid_bills_minor)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader
          title="Recent transactions"
          actions={
            <ButtonLink to="/manage/share" variant="secondary" size="sm" icon={<Share2 className="size-4" aria-hidden />}>
              Share on WhatsApp
            </ButtonLink>
          }
        />
        {o.recent.length === 0 ? (
          <EmptyState title="No transactions yet">Paste your first M-Pesa message to get started.</EmptyState>
        ) : (
          <ul className="stagger divide-y divide-stone-100">
            {o.recent.map((item) => (
              <TransactionRow key={item.id} item={item} />
            ))}
          </ul>
        )}
        <div className="border-t border-stone-100 px-4 py-3 text-sm sm:px-5">
          <Link to="/manage/transactions">See all transactions</Link>
        </div>
      </Card>
    </div>
  );
}
