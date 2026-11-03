import { ArrowLeft, ArrowRightLeft, Check, Copy, HandCoins, Link2, MessageCircle, Pencil, Search, Trash2, Unlink, Wallet } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { LoadState, SaveError } from "@/components/LoadState";
import { Amount, KindBadge, itemLabel } from "@/components/money";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Input, RadioGroup, Textarea } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader, EmptyState, Notice } from "@/components/ui/misc";
import {
  ChallengeBadges,
  ChallengeEditor,
  ChallengeProgress,
  challengeDates,
  challengeInput,
  publicEntries,
  shareText,
  useShareContext,
} from "@/features/challenges";
import { api, useResource } from "@/lib/api";
import type { ShareLang } from "@/lib/challengeShare";
import { formatNairobi } from "@/lib/time";
import type { ChallengeSummary, ListItem, ListResponse } from "@/lib/types";
import { copyText } from "@/public/share";

/** One challenge: its kitty, an update to share, and the records that came in through it. */
export function ChallengeDetailPage() {
  const id = Number(useParams().id);
  const summary = useResource<ChallengeSummary>(`/api/manage/challenges/${id}`);
  const records = useResource<ListResponse>(`/api/manage/transactions?challenge_id=${id}&limit=500`);
  const share = useShareContext();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const challenge = summary.data;
  if (!challenge) return <LoadState loading={summary.loading} error={summary.error} onRetry={summary.reload} />;
  const items = records.data?.items ?? [];
  const refresh = () => {
    summary.reload();
    records.reload();
  };

  async function remove() {
    if (!window.confirm(`Delete the challenge “${challenge!.name}”? This cannot be undone.`)) return;
    await api.delete(`/api/manage/challenges/${id}`);
    navigate("/manage/challenges");
  }

  return (
    <div className="space-y-4">
      <Link to="/manage/challenges" className="inline-flex items-center gap-1.5 text-sm text-stone-600">
        <ArrowLeft className="size-4" aria-hidden /> All challenges
      </Link>

      {editing ? (
        <ChallengeEditor
          id={id}
          initial={challengeInput(challenge)}
          onCancel={() => setEditing(false)}
          onDone={(saved) => {
            summary.setData(saved);
            setEditing(false);
          }}
        />
      ) : (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <ChallengeBadges challenge={challenge} />
              {challengeDates(challenge) && <span className="text-sm text-stone-500">{challengeDates(challenge)}</span>}
            </div>
            <h1 className="page-title">{challenge.name}</h1>
            {challenge.name_sw && (
              <p lang="sw" className="-mt-2 text-stone-600">
                {challenge.name_sw}
              </p>
            )}
            {challenge.description && <p className="max-w-3xl leading-relaxed whitespace-pre-line text-stone-700">{challenge.description}</p>}
            <ChallengeProgress challenge={challenge} large />
            {challenge.account_id ? (
              <p className="flex items-start gap-2 text-sm text-stone-600">
                <Wallet className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden />
                <span>
                  Keeps its own money in <strong className="font-semibold text-stone-800">{challenge.account_name}</strong>. Money received there belongs to the
                  challenge and counts in the fundraiser&rsquo;s totals; what it still holds is owed to the main fund until it is handed over.
                </span>
              </p>
            ) : (
              <p className="text-sm text-stone-500">
                Its money goes to the fundraiser&rsquo;s main account and counts once in the totals; the challenge keeps its own tally.
              </p>
            )}
            {challenge.giving_method && (
              <p className="text-sm text-stone-600">
                <span className="font-medium text-stone-800">Givers send to: </span>
                {challenge.giving_method === "phone" ? "Send Money" : challenge.giving_method === "paybill" ? "Paybill" : "Till"} {challenge.giving_number}
                {challenge.giving_method === "paybill" && challenge.giving_account ? `, account ${challenge.giving_account}` : ""} ({challenge.giving_name})
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {challenge.status === "active" && (
                <ButtonLink to={`/manage/add?challenge=${id}`} size="sm" icon={<HandCoins className="size-4" aria-hidden />}>
                  Record money for this challenge
                </ButtonLink>
              )}
              {challenge.account_id && (
                <ButtonLink to={`/manage/add?handover=${id}`} size="sm" variant="secondary" icon={<ArrowRightLeft className="size-4" aria-hidden />}>
                  Record a hand-over to the main account
                </ButtonLink>
              )}
              <Button variant="secondary" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing(true)}>
                Edit
              </Button>
              {records.data?.total === 0 && (
                <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => void remove()}>
                  Delete
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      <ShareCard challenge={challenge} items={items} share={share} />

      <Card>
        <CardHeader title={`Records in this challenge (${records.data?.total ?? "…"})`} description="Money received and pledges that came in through it." />
        {!records.data ? (
          <CardBody>
            <LoadState loading={records.loading} error={records.error} onRetry={records.reload} />
          </CardBody>
        ) : items.length === 0 ? (
          <EmptyState title="Nothing linked yet">Record money with this challenge chosen, or add records that are already saved below.</EmptyState>
        ) : (
          <ul className="divide-y divide-stone-100">
            {items.map((item) => (
              <LinkedRow key={item.id} item={item} onChanged={refresh} />
            ))}
          </ul>
        )}
      </Card>

      <AddRecords challengeId={id} onAdded={refresh} />
    </div>
  );
}

function ShareCard({ challenge, items, share }: { challenge: ChallengeSummary; items: ListItem[]; share: ReturnType<typeof useShareContext> }) {
  const [lang, setLang] = useState<ShareLang>("en");
  const [includeList, setIncludeList] = useState(true);
  const [includeGiving, setIncludeGiving] = useState(true);
  const [includeLink, setIncludeLink] = useState(true);
  const [text, setText] = useState("");
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const entries = useMemo(() => publicEntries(items, share.settings), [items, share.settings]);

  useEffect(() => {
    if (!edited) setText(shareText(challenge, share, { lang, entries, includeList, includeGiving, includeLink }));
  }, [challenge, share, lang, entries, includeList, includeGiving, includeLink, edited]);

  const regenerate = <T,>(apply: (v: T) => void) => (v: T) => {
    apply(v);
    setEdited(false);
  };

  return (
    <Card>
      <CardHeader
        title="Update for this challenge"
        description="Public names and amounts only, never M-Pesa names or phone numbers. You can edit the text before copying."
        actions={
          edited && (
            <Button variant="ghost" size="sm" onClick={() => setEdited(false)}>
              Undo my edits
            </Button>
          )
        }
      />
      <CardBody className="space-y-4">
        <RadioGroup<ShareLang>
          name="challenge-lang"
          legend="Language"
          value={lang}
          onChange={regenerate(setLang)}
          options={[
            { value: "en", label: "English" },
            { value: "sw", label: "Kiswahili" },
          ]}
        />
        <div>
          <Checkbox checked={includeList} onChange={(e) => regenerate(setIncludeList)(e.target.checked)} label="List the contributions" />
          <Checkbox checked={includeGiving} onChange={(e) => regenerate(setIncludeGiving)(e.target.checked)} label="How to take part (M-Pesa details)" />
          {share.publicUrl && <Checkbox checked={includeLink} onChange={(e) => regenerate(setIncludeLink)(e.target.checked)} label="Link to the challenges on the public page" />}
        </div>
        {!challenge.published && includeLink && share.publicUrl && (
          <Notice tone="warning">This challenge is not on the public page, so the link will not show it. Tick &ldquo;Show on the public page&rdquo; under Edit.</Notice>
        )}
        <Textarea
          aria-label="Challenge update"
          rows={14}
          className="font-mono text-sm"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setEdited(true);
          }}
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            icon={copied ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
            onClick={() => void copyText(text).then((ok) => ok && (setCopied(true), window.setTimeout(() => setCopied(false), 2500)))}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-13 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-5 font-medium text-stone-900 no-underline hover:bg-stone-50 hover:no-underline"
          >
            <MessageCircle className="size-5" aria-hidden /> Open WhatsApp
          </a>
        </div>
        <p className="sr-only" aria-live="polite">
          {copied ? "Update copied" : ""}
        </p>
      </CardBody>
    </Card>
  );
}

function LinkedRow({ item, onChanged }: { item: ListItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function takeOut() {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/api/manage/transactions/${item.id}/challenge`, { challenge_id: null });
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-start gap-3">
        <Link to={`/manage/transactions/${item.id}`} className="min-w-0 flex-1 text-stone-900 no-underline hover:no-underline">
          <span className="font-medium">{itemLabel(item)}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-600">
            {formatNairobi(item.occurred_at)} <KindBadge kind={item.kind} />
          </span>
        </Link>
        <Amount minor={item.amount_minor} direction={item.direction} kind={item.kind} className="pt-0.5" />
        <Button variant="ghost" size="sm" busy={busy} icon={<Unlink className="size-4" aria-hidden />} onClick={() => void takeOut()} aria-label={`Take ${itemLabel(item)} out of the challenge`}>
          <span className="hidden sm:inline">Take out</span>
        </Button>
      </div>
      <SaveError error={error} />
    </li>
  );
}

/** Find saved money or pledges and add them to the challenge. */
function AddRecords({ challengeId, onAdded }: { challengeId: number; onAdded: () => void }) {
  const [kind, setKind] = useState<"contribution" | "pledge">("contribution");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const params = new URLSearchParams({ kind, limit: "40" });
  if (query) params.set("q", query);
  const results = useResource<ListResponse>(`/api/manage/transactions?${params}`);
  const candidates = (results.data?.items ?? []).filter((i) => i.challenge_id !== challengeId && !i.is_fee);

  function find(event: FormEvent) {
    event.preventDefault();
    setQuery(search.trim());
  }

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/manage/challenges/${challengeId}/transactions`, { transaction_ids: [...selected] });
      setSelected(new Set());
      results.reload();
      onAdded();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Add records already saved" description="Money received or pledges recorded before the challenge was chosen. Nothing moves: they only join the challenge." />
      <CardBody className="space-y-3 border-b border-stone-100">
        <RadioGroup<"contribution" | "pledge">
          name="add-kind"
          legend="Show"
          value={kind}
          onChange={(v) => (setKind(v), setSelected(new Set()))}
          options={[
            { value: "contribution", label: "Money received" },
            { value: "pledge", label: "Pledges" },
          ]}
        />
        <form onSubmit={find} className="flex gap-2">
          <Input aria-label="Search by name, description or reference" placeholder="Search by name, description or reference" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button type="submit" variant="secondary" icon={<Search className="size-4" aria-hidden />}>
            Find
          </Button>
        </form>
      </CardBody>
      {!results.data ? (
        <CardBody>
          <LoadState loading={results.loading} error={results.error} onRetry={results.reload} />
        </CardBody>
      ) : candidates.length === 0 ? (
        <EmptyState title="Nothing to add">{query ? "No other records match that search." : "Every recent record is already in this challenge."}</EmptyState>
      ) : (
        <ul className="divide-y divide-stone-100">
          {candidates.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-stone-50 sm:px-5">
                <input type="checkbox" className="mt-1 size-5 accent-plum-700" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-stone-900">{itemLabel(item)}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-600">
                    {formatNairobi(item.occurred_at)}
                    {item.challenge_name && <Badge tone="warning">In “{item.challenge_name}”: will move</Badge>}
                  </span>
                </span>
                <Amount minor={item.amount_minor} direction={item.direction} kind={item.kind} className="pt-0.5" />
              </label>
            </li>
          ))}
        </ul>
      )}
      <CardBody className="space-y-2 border-t border-stone-100">
        <SaveError error={error} />
        <Button disabled={selected.size === 0} busy={busy} icon={<Link2 className="size-4" aria-hidden />} onClick={() => void add()}>
          {selected.size === 0 ? "Choose records to add" : `Add ${selected.size} to the challenge`}
        </Button>
      </CardBody>
    </Card>
  );
}
