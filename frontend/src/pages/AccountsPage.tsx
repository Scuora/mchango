import { ArrowRightLeft, FileText, List, Trophy, Wallet } from "lucide-react";
import { Link } from "react-router";
import { LoadState } from "@/components/LoadState";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/misc";
import { ACCOUNT_KINDS, AccountsCard } from "@/features/accounts";
import { useResource } from "@/lib/api";
import { formatKes } from "@/lib/money";
import type { Account, AccountFunds, Overview } from "@/lib/types";

/**
 * Where the fundraiser's money is, account by account: the main accounts, and
 * what challenges still hold in their own accounts (owed to the main fund until
 * handed over). Below, accounts are added and renamed.
 */
export function AccountsPage() {
  const overview = useResource<Overview>("/api/manage/overview");
  const accounts = useResource<Account[]>("/api/manage/accounts");
  if (!overview.data || !accounts.data) {
    return <LoadState loading={overview.loading || accounts.loading} error={overview.error ?? accounts.error} onRetry={() => (overview.reload(), accounts.reload())} />;
  }
  const o = overview.data;
  const hints = new Map(accounts.data.map((a) => [a.id, a.number_hint]));
  const main = o.funds_by_account.filter((a) => a.challenge_id === null);
  const held = o.funds_by_account.filter((a) => a.challenge_id !== null);
  const challengeName = (id: number | null) => o.challenges.find((c) => c.id === id)?.name ?? "a challenge";
  const refresh = () => (overview.reload(), accounts.reload());

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Accounts</h1>
        <p className="mt-1 max-w-2xl text-stone-600">
          Where the fundraiser&rsquo;s money is, account by account. Moving money between accounts (a withdrawal, a hand-over) does not change the totals.
        </p>
      </div>

      <Card>
        <CardHeader title="Balances" description="Fundraiser money only; personal activity is excluded." />
        <ul className="divide-y divide-stone-100">
          {main.map((a) => (
            <AccountLine key={a.account_id} account={a} hint={hints.get(a.account_id) ?? null} />
          ))}
        </ul>
        {held.length > 0 && (
          <div className="border-t border-stone-100 bg-ochre-50/60">
            <div className="flex items-baseline justify-between gap-3 px-4 pt-3 sm:px-5">
              <p className="font-semibold text-ochre-900">Held by challenges, to be handed over</p>
              <p className="font-semibold whitespace-nowrap text-ochre-900 tabular-nums">{formatKes(o.held_by_challenges_minor)}</p>
            </div>
            <p className="px-4 text-sm text-stone-600 sm:px-5">Counted in the totals; owed to the main fund until each challenge hands its money over.</p>
            <ul className="divide-y divide-ochre-100">
              {held.map((a) => (
                <AccountLine key={a.account_id} account={a} hint={hints.get(a.account_id) ?? null} challenge={challengeName(a.challenge_id)} />
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3 border-t border-stone-200 px-4 py-3 sm:px-5">
          <p className="font-semibold text-stone-900">All fundraiser money</p>
          <p className="text-lg font-semibold whitespace-nowrap tabular-nums">{formatKes(o.totals.remaining_minor)}</p>
        </div>
      </Card>

      <AccountsCard accounts={accounts.data} onChanged={refresh} />
    </div>
  );
}

function AccountLine({ account: a, hint, challenge }: { account: AccountFunds; hint: string | null; challenge?: string }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <Wallet className="size-4 shrink-0 text-stone-500" aria-hidden />
          <span className="font-medium text-stone-900">{a.name}</span>
          <Badge>{ACCOUNT_KINDS.find((k) => k.value === a.kind)?.label ?? a.kind}</Badge>
          {hint && <span className="text-sm text-stone-500">…{hint}</span>}
        </p>
        {challenge && a.challenge_id !== null && (
          <p className="mt-1 text-sm text-stone-600">
            <Trophy className="mr-1 inline size-3.5 align-[-2px] text-ochre-700" aria-hidden />
            Keeps the money of <Link to={`/manage/challenges/${a.challenge_id}`}>{challenge}</Link>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="mr-2 font-semibold whitespace-nowrap tabular-nums">{formatKes(a.amount_minor)}</span>
        <ButtonLink to={`/manage/transactions?account_id=${a.account_id}`} size="sm" variant="secondary" icon={<List className="size-4" aria-hidden />}>
          Records
        </ButtonLink>
        <ButtonLink to={`/manage/reports?account=${a.account_id}`} size="sm" variant="secondary" icon={<FileText className="size-4" aria-hidden />}>
          Statement
        </ButtonLink>
        {a.challenge_id !== null && (
          <ButtonLink to={`/manage/add?handover=${a.challenge_id}`} size="sm" variant="secondary" icon={<ArrowRightLeft className="size-4" aria-hidden />}>
            Hand over
          </ButtonLink>
        )}
      </div>
    </li>
  );
}
