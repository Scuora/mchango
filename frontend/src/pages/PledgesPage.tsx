import { clsx } from "clsx";
import { HandCoins, Plus, Users } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { LoadState } from "@/components/LoadState";
import { PledgeGroupTag, PledgeProgressBar, PledgeStatusBadge, STATUS_LABEL } from "@/components/pledges";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/misc";
import { pledgeName } from "@/features/pledgePicker";
import { useResource } from "@/lib/api";
import { formatKesShort } from "@/lib/money";
import { formatNairobiDate } from "@/lib/time";
import type { ManagedPledge, PledgeStatus, PledgedBy } from "@/lib/types";
import { useUrlState } from "@/lib/places";

const kes = formatKesShort;
type GroupFilter = "all" | PledgedBy;
type StatusFilter = "all" | PledgeStatus;

function GroupSummary({ title, pledges, by }: { title: string; pledges: ManagedPledge[]; by: PledgedBy }) {
  const mine = pledges.filter((p) => p.pledged_by === by);
  const pledged = mine.reduce((s, p) => s + p.amount_minor, 0);
  const received = mine.reduce((s, p) => s + Math.min(p.received_minor, p.amount_minor), 0);
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-stone-900">{title}</p>
          <PledgeGroupTag by={by} />
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{kes(pledged)}</p>
        <p className="text-sm text-stone-600">
          pledged by {mine.length} · {kes(received)} received · {kes(pledged - received)} still to come
        </p>
        <PledgeProgressBar received={received} amount={pledged} className="mt-3 h-2.5" />
      </CardBody>
    </Card>
  );
}

function Filter<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string, number][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(([v, text, count]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={clsx(
            "press min-h-9 cursor-pointer rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition-colors",
            value === v ? "bg-plum-800 text-white ring-plum-800" : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50",
          )}
        >
          {text} <span className={value === v ? "text-plum-200" : "text-stone-400"}>{count}</span>
        </button>
      ))}
    </div>
  );
}

/** Pledges by the family and by friends, and how much of each has come in. */
export function PledgesPage() {
  const pledges = useResource<ManagedPledge[]>("/api/manage/pledges");
  // In the address, so coming back to the page keeps them.
  const [group, setGroup] = useUrlState<GroupFilter>("group", "all");
  const [status, setStatus] = useUrlState<StatusFilter>("status", "all");
  const list = useMemo(() => pledges.data ?? [], [pledges.data]);
  const inGroup = list.filter((p) => group === "all" || p.pledged_by === group);
  const shown = inGroup.filter((p) => status === "all" || p.status === status);

  if (!pledges.data) return <LoadState loading={pledges.loading} error={pledges.error} onRetry={pledges.reload} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Pledges</h1>
          <p className="mt-1 max-w-2xl text-stone-600">
            Promises from the family and from friends. When the money arrives, record it and choose the pledge in &ldquo;Fulfils a pledge&rdquo;; it then shows as received here and on the public page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/manage/add?kind=pledge&by=family" icon={<Users className="size-4" aria-hidden />}>
            Family share
          </ButtonLink>
          <ButtonLink to="/manage/add?kind=pledge" variant="secondary" icon={<Plus className="size-4" aria-hidden />}>
            Well-wisher&rsquo;s pledge
          </ButtonLink>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <GroupSummary title="The family&rsquo;s share" pledges={list} by="family" />
        <GroupSummary title="Family, friends & well-wishers" pledges={list} by="friends" />
      </div>

      <Card>
        <CardHeader title={`${shown.length} of ${list.length} pledges`} />
        <CardBody className="space-y-3 border-b border-stone-100">
          <Filter
            label="Who pledged"
            value={group}
            onChange={setGroup}
            options={[
              ["all", "Everyone", list.length],
              ["family", "Family share", list.filter((p) => p.pledged_by === "family").length],
              ["friends", "Well-wishers", list.filter((p) => p.pledged_by === "friends").length],
            ]}
          />
          <Filter
            label="Where it stands"
            value={status}
            onChange={setStatus}
            options={[
              ["all", "Any status", inGroup.length],
              ...(["pledged", "part_received", "received"] as const).map(
                (s) => [s, STATUS_LABEL[s], inGroup.filter((p) => p.status === s).length] as [PledgeStatus, string, number],
              ),
            ]}
          />
        </CardBody>
        {shown.length === 0 ? (
          <EmptyState title={list.length === 0 ? "No pledges yet" : "No pledges match"}>
            {list.length === 0 ? "Record the family's pledge first, then friends' pledges as they come in." : "Try another filter."}
          </EmptyState>
        ) : (
          <ul className="stagger divide-y divide-stone-100">
            {shown.map((p, i) => (
              <li key={p.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
                <Link to={`/manage/transactions/${p.id}`} className="min-w-0 flex-1 text-stone-900 no-underline hover:no-underline">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{pledgeName(p)}</span>
                    <PledgeGroupTag by={p.pledged_by} />
                    <PledgeStatusBadge status={p.status} />
                  </span>
                  <span className="mt-1 block text-sm text-stone-500">
                    Pledged {formatNairobiDate(p.occurred_at)}
                    {p.description && ` · ${p.description}`}
                  </span>
                  <PledgeProgressBar received={p.received_minor} amount={p.amount_minor} delay={Math.min(i, 12) * 40} className="mt-2 max-w-md" />
                </Link>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <p className="text-right text-sm text-stone-600 tabular-nums">
                    <span className="font-semibold text-stone-900">{kes(p.received_minor)}</span> of {kes(p.amount_minor)}
                  </p>
                  {p.status !== "received" && (
                    <ButtonLink to={`/manage/add?pledge=${p.id}`} size="sm" variant="secondary" icon={<HandCoins className="size-4" aria-hidden />}>
                      Record payment
                    </ButtonLink>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
