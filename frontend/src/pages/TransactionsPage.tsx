import { ListFilter, Merge, PlusCircle, Search, Share2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { LoadState, SaveError } from "@/components/LoadState";
import { TransactionRow, itemLabel } from "@/components/money";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Choice, DateField } from "@/components/ui/pickers";
import { Card, EmptyState, Notice } from "@/components/ui/misc";
import { api, useResource } from "@/lib/api";
import { KIND_LABELS, STATUS_FILTER_LABELS } from "@/lib/labels";
import { formatKes } from "@/lib/money";
import type { Account, Kind, ListItem, ListResponse, StatusFilter } from "@/lib/types";

const PAGE_SIZE = 50;
const FILTER_KEYS = ["q", "kind", "from", "to", "status", "account_id"] as const;

export function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const accounts = useResource<Account[]>("/api/manage/accounts");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const offset = Number(params.get("offset") ?? "0") || 0;

  const query = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  // Merged payments are listed once, as their entry.
  query.set("combine", "true");
  query.set("limit", String(PAGE_SIZE));
  query.set("offset", String(offset));
  const list = useResource<ListResponse>(`/api/manage/transactions?${query.toString()}`);

  // Debounced search keeps typing responsive.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (search === current) return;
    const timer = window.setTimeout(() => update("q", search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("offset");
    setParams(next, { replace: true });
  }

  const activeFilters = FILTER_KEYS.filter((k) => k !== "q" && params.get(k)).length;
  const [showFilters, setShowFilters] = useState(activeFilters > 0);

  // Choosing payments to merge into one public entry.
  const [merging, setMerging] = useState(false);
  const [chosen, setChosen] = useState<Map<number, ListItem>>(new Map());
  const [mergedNote, setMergedNote] = useState<string | null>(null);
  const canMerge = (item: ListItem) => item.kind === "contribution" && !item.removed && !(item.shares?.length);
  function choose(item: ListItem, on: boolean) {
    setChosen((current) => {
      const next = new Map(current);
      if (on) next.set(item.id, item);
      else next.delete(item.id);
      return next;
    });
  }
  function stopMerging() {
    setMerging(false);
    setChosen(new Map());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Transactions</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Merge className="size-4" aria-hidden />} aria-pressed={merging} onClick={() => (merging ? stopMerging() : (setMerging(true), setMergedNote(null)))}>
            {merging ? "Stop merging" : "Merge payments"}
          </Button>
          <ButtonLink to="/manage/share" variant="secondary" icon={<Share2 className="size-4" aria-hidden />}>
            Share on WhatsApp
          </ButtonLink>
          <ButtonLink to="/manage/add" icon={<PlusCircle className="size-4" aria-hidden />}>
            Add transaction
          </ButtonLink>
        </div>
      </div>

      <Card>
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-3 left-3 size-5 text-stone-400" aria-hidden />
              <Input
                aria-label="Search transactions"
                type="search"
                placeholder="Search names, purposes, references…"
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters}
              icon={<ListFilter className="size-4" aria-hidden />}
            >
              Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
            </Button>
          </div>
          {showFilters && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Type" htmlFor="f-kind">
                <Choice
                  id="f-kind"
                  value={params.get("kind") ?? ""}
                  options={(Object.keys(KIND_LABELS) as Kind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }))}
                  placeholder="All types"
                  clearable
                  onChange={(v) => update("kind", v)}
                />
              </Field>
              <Field label="Status" htmlFor="f-status">
                <Choice
                  id="f-status"
                  value={params.get("status") ?? ""}
                  options={(Object.keys(STATUS_FILTER_LABELS) as StatusFilter[]).map((s) => ({ value: s, label: STATUS_FILTER_LABELS[s] }))}
                  placeholder="Any status"
                  clearable
                  onChange={(v) => update("status", v)}
                />
              </Field>
              <Field label="Account" htmlFor="f-account">
                <Choice
                  id="f-account"
                  value={params.get("account_id") ?? ""}
                  options={(accounts.data ?? []).map((a) => ({ value: String(a.id), label: a.name }))}
                  placeholder="All accounts"
                  clearable
                  onChange={(v) => update("account_id", v)}
                />
              </Field>
              <Field label="From date" htmlFor="f-from">
                <DateField id="f-from" value={params.get("from") ?? ""} placeholder="Any date" onChange={(v) => update("from", v)} />
              </Field>
              <Field label="To date" htmlFor="f-to">
                <DateField id="f-to" value={params.get("to") ?? ""} placeholder="Any date" onChange={(v) => update("to", v)} />
              </Field>
              {activeFilters > 0 && (
                <div className="sm:col-span-2 lg:col-span-5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setParams(new URLSearchParams(), { replace: true });
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {merging && (
        <Notice tone="info" title="Merge payments from the same giver">
          <p>
            Tick two or more payments, say from a family that gave several times, and they are listed publicly as one entry under one name. Each payment keeps its
            M-Pesa message, statement match and history, and the money is counted once as before. You can separate them again at any time.
          </p>
        </Notice>
      )}
      {mergedNote && <Notice tone="success">{mergedNote}</Notice>}

      <Card>
        {!list.data ? (
          <div className="px-4">
            <LoadState loading={list.loading} error={list.error} onRetry={list.reload} />
          </div>
        ) : list.data.items.length === 0 ? (
          <EmptyState title="No transactions match">
            {activeFilters > 0 || params.get("q") ? "Try clearing the filters." : "Paste an M-Pesa message to add the first one."}
          </EmptyState>
        ) : (
          <>
            <p className="border-b border-stone-100 px-4 py-2 text-sm text-stone-600 sm:px-5" aria-live="polite">
              {list.data.total} record{list.data.total === 1 ? "" : "s"}
              {list.loading && " · updating…"}
            </p>
            <ul className="stagger divide-y divide-stone-100">
              {list.data.items.map((item) => (
                <TransactionRow
                  key={item.id}
                  item={item}
                  combined
                  select={merging ? { checked: chosen.has(item.id), disabled: !canMerge(item), onChange: (on) => choose(item, on) } : undefined}
                />
              ))}
            </ul>
            {list.data.total > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-4 py-3 text-sm sm:px-5">
                <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffsetParam(Math.max(0, offset - PAGE_SIZE))}>
                  Newer
                </Button>
                <span className="text-stone-600">
                  {offset + 1}–{Math.min(offset + PAGE_SIZE, list.data.total)} of {list.data.total}
                </span>
                <Button variant="secondary" size="sm" disabled={offset + PAGE_SIZE >= list.data.total} onClick={() => setOffsetParam(offset + PAGE_SIZE)}>
                  Older
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {merging && chosen.size > 0 && (
        <MergeBar
          chosen={[...chosen.values()]}
          onCancel={stopMerging}
          onMerged={(name, count) => {
            stopMerging();
            setMergedNote(`${count} payments are now listed as “${name}”. Open any of them to rename the entry or separate a payment.`);
            list.reload();
          }}
        />
      )}
    </div>
  );

  function setOffsetParam(value: number) {
    const next = new URLSearchParams(params);
    if (value) next.set("offset", String(value));
    else next.delete("offset");
    setParams(next);
    window.scrollTo({ top: 0 });
  }
}

/** Names the merged entry and merges the chosen payments (and any entries they are already in). */
function MergeBar({ chosen, onCancel, onMerged }: { chosen: ListItem[]; onCancel: () => void; onMerged: (name: string, count: number) => void }) {
  const suggestion = chosen.map((c) => c.group?.public_name ?? c.public_name).find(Boolean) ?? "";
  const [name, setName] = useState(suggestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const payments = chosen.reduce((n, c) => n + (c.group && c.group.count > 1 ? c.group.count : 1), 0);
  const total = chosen.reduce((sum, c) => sum + (c.group && c.group.count > 1 ? c.group.total_minor : c.amount_minor), 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/manage/merged", { transaction_ids: chosen.map((c) => c.id), public_name: name.trim() || null });
      onMerged(name.trim() || "Anonymous", payments);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="sticky bottom-3 z-20 space-y-3 rounded-xl border border-plum-200 bg-white p-4 shadow-lg sm:p-5">
      <p className="text-sm text-stone-700">
        <span className="font-semibold text-stone-900">{payments} payment{payments === 1 ? "" : "s"}</span> chosen, {formatKes(total)} in all:{" "}
        {chosen.map((c) => (c.group && c.group.count > 1 ? c.group.public_name ?? "Anonymous" : itemLabel(c))).join(", ")}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="List them publicly as" htmlFor="merge-name" hint="Left empty, the entry shows the anonymous label." className="flex-1">
          <Input id="merge-name" value={name} maxLength={80} placeholder="Family of …" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" busy={busy} disabled={payments < 2} icon={<Merge className="size-4" aria-hidden />}>
            Merge {payments > 1 ? payments : ""} payments
          </Button>
          <Button type="button" variant="ghost" icon={<X className="size-4" aria-hidden />} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
      {payments < 2 && <p className="text-sm text-stone-500">Choose at least two payments.</p>}
      <SaveError error={error} />
    </form>
  );
}
