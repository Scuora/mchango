import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { LoadState } from "@/components/LoadState";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui/misc";
import { Choice } from "@/components/ui/pickers";
import { ChangeDiff, actorName } from "@/features/audit";
import { useResource } from "@/lib/api";
import { formatDayHeading, formatNairobiTime } from "@/lib/time";
import type { ActivityEntry, ActivityPage as ActivityData } from "@/lib/types";
import { useSearchParams } from "react-router";

const ENTITIES: { value: string; label: string }[] = [
  { value: "transaction", label: "Transactions" },
  { value: "challenge", label: "Challenges" },
  { value: "account", label: "Accounts" },
  { value: "announcement", label: "Announcements" },
  { value: "statement_import", label: "Statements" },
  { value: "fundraiser", label: "Settings" },
];

const PAGE = 100;

/** Where a change points: the record it was made to, when there is a page for it. */
function target(e: ActivityEntry): { label: string; to: string | null } {
  switch (e.entity) {
    case "transaction":
      return { label: `Record #${e.entity_id}`, to: `/manage/transactions/${e.entity_id}` };
    case "challenge":
      return { label: "Challenge", to: e.action === "deleted" ? null : `/manage/challenges/${e.entity_id}` };
    case "account":
      return { label: "Account", to: "/manage/accounts" };
    case "announcement":
      return { label: "Announcement", to: "/manage/announcements" };
    case "statement_import":
      return { label: "Statement", to: `/manage/statements/${e.entity_id}` };
    case "fundraiser":
      return { label: "Settings", to: "/manage/settings" };
    default:
      return { label: e.entity.replace(/_/g, " "), to: null };
  }
}

/** Every change made to the fundraiser: who did what, when, and why. */
export function ActivityPage() {
  // Who, what, the search and how many are shown live in the address, so coming back keeps them.
  const [url, setUrl] = useSearchParams();
  const actor = url.get("who") ?? "";
  const entity = url.get("what") ?? "";
  const query = url.get("q") ?? "";
  const limit = Math.max(PAGE, Number(url.get("shown")) || PAGE);
  const [search, setSearch] = useState(query);
  function update(patch: Record<string, string | number | null>) {
    const next = new URLSearchParams(url);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "" || (key === "shown" && value === PAGE)) next.delete(key);
      else next.set(key, String(value));
    }
    setUrl(next, { replace: true });
  }
  const params = new URLSearchParams({ limit: String(limit) });
  if (actor) params.set("actor", actor);
  if (entity) params.set("entity", entity);
  if (query) params.set("q", query);
  const activity = useResource<ActivityData>(`/api/manage/activity?${params}`);

  function find(event: FormEvent) {
    event.preventDefault();
    update({ q: search.trim(), shown: null });
  }

  const data = activity.data;
  const days = new Map<string, ActivityEntry[]>();
  for (const e of data?.entries ?? []) {
    // Grouped by the Nairobi day, not the UTC date.
    const day = formatDayHeading(e.at);
    days.set(day, [...(days.get(day) ?? []), e]);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Activity</h1>
        <p className="mt-1 max-w-2xl text-stone-600">
          Every change made here, newest first: who recorded, corrected, archived or restored what, and why. Nothing on this page can be edited or deleted.
        </p>
      </div>

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-[12rem_12rem_1fr] sm:items-end">
          <Field label="Who" htmlFor="act-actor">
            <Choice
              id="act-actor"
              value={actor}
              options={[...(data?.actors ?? []).map((a) => ({ value: a, label: a })), { value: "system", label: "The app (system)" }]}
              onChange={(v) => update({ who: v, shown: null })}
              placeholder="Everyone"
              clearable
            />
          </Field>
          <Field label="What" htmlFor="act-entity">
            <Choice id="act-entity" value={entity} options={ENTITIES} onChange={(v) => update({ what: v, shown: null })} placeholder="Everything" clearable />
          </Field>
          <form onSubmit={find} className="flex gap-2">
            <Input aria-label="Search the changes" placeholder="Search, e.g. a name, an amount or a reason" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button type="submit" variant="secondary" icon={<Search className="size-4" aria-hidden />}>
              Find
            </Button>
          </form>
        </CardBody>
      </Card>

      {!data ? (
        <LoadState loading={activity.loading} error={activity.error} onRetry={activity.reload} />
      ) : data.entries.length === 0 ? (
        <Card>
          <EmptyState title="No changes match">Try another person, kind of record or search.</EmptyState>
        </Card>
      ) : (
        <>
          {[...days.entries()].map(([day, entries]) => (
            <Card key={day}>
              <div className="border-b border-stone-100 px-4 py-2.5 font-semibold text-stone-800 sm:px-5">{day}</div>
              <ol className="divide-y divide-stone-100">
                {entries.map((e) => {
                  const where = target(e);
                  return (
                    <li key={e.id} className="flex gap-3 px-4 py-3 sm:px-5">
                      <span className="w-16 shrink-0 pt-0.5 text-sm text-stone-500 tabular-nums">{formatNairobiTime(e.at)}</span>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold text-stone-900">{actorName(e.actor)}</span>
                          {where.to ? (
                            <Link to={where.to}>
                              <Badge>{where.label}</Badge>
                            </Link>
                          ) : (
                            <Badge>{where.label}</Badge>
                          )}
                        </p>
                        <p className="mt-1 text-stone-800">{e.summary}</p>
                        <ChangeDiff details={e.details} />
                        {e.reason && <p className="mt-0.5 text-stone-600">Reason: {e.reason}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          ))}
          <div className="flex items-center justify-between gap-3 text-sm text-stone-600">
            <span>
              Showing {data.entries.length} of {data.total}
            </span>
            {data.entries.length < data.total && (
              <Button variant="secondary" size="sm" busy={activity.loading} onClick={() => update({ shown: limit + PAGE })}>
                Show more
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
