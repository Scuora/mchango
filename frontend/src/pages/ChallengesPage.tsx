import { ChevronRight, Pencil, Plus, Trophy } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { LoadState } from "@/components/LoadState";
import { Button } from "@/components/ui/button";
import { Card, CardBody, EmptyState, Notice } from "@/components/ui/misc";
import {
  ChallengeBadges,
  ChallengeEditor,
  ChallengeProgress,
  CopyUpdateButton,
  challengeDates,
  challengeInput,
  emptyChallenge,
  shareText,
  useShareContext,
} from "@/features/challenges";
import { useResource } from "@/lib/api";
import { formatKesShort } from "@/lib/money";
import type { ChallengeInput, ChallengeSummary } from "@/lib/types";

/** Fun games and dares that raise money. Each keeps its own kitty inside the main fund. */
export function ChallengesPage() {
  const list = useResource<ChallengeSummary[]>("/api/manage/challenges");
  const share = useShareContext();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [editing, setEditing] = useState<{ id: number | null; input: ChallengeInput } | null>(() =>
    params.get("new") === "1" ? { id: null, input: emptyChallenge } : null,
  );

  if (!list.data) return <LoadState loading={list.loading} error={list.error} onRetry={list.reload} />;
  const active = list.data.filter((c) => c.status === "active");
  const raised = list.data.reduce((sum, c) => sum + c.totals.raised_minor, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Challenges</h1>
          <p className="mt-1 max-w-2xl text-stone-600">
            Fun games and dares that keep the fundraiser going. Each challenge keeps its own kitty so you can see what it brought in, but the money is in the main
            account and counts once in the totals.
          </p>
        </div>
        {!editing && (
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing({ id: null, input: emptyChallenge })}>
            New challenge
          </Button>
        )}
      </div>

      {editing && (
        <ChallengeEditor
          key={editing.id ?? "new"}
          id={editing.id}
          initial={editing.input}
          onCancel={() => setEditing(null)}
          onDone={(saved) => {
            setEditing(null);
            if (editing.id === null) navigate(`/manage/challenges/${saved.id}`);
            else list.reload();
          }}
        />
      )}

      {list.data.length > 0 && (
        <Notice tone="info">
          {formatKesShort(raised)} has come in through {list.data.length === 1 ? "the challenge" : `${list.data.length} challenges`} so far ({active.length} still
          on). It is already part of the fundraiser&rsquo;s totals.
        </Notice>
      )}

      {list.data.length === 0 && !editing ? (
        <Card>
          <EmptyState icon={<Trophy className="size-8" />} title="No challenges yet">
            Start one, such as a cousins&rsquo; 1,000-shilling challenge or a sponsored walk. Then record money as usual and choose the challenge it came in
            through.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.data.map((c) => (
            <Card key={c.id}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ChallengeBadges challenge={c} />
                  {challengeDates(c) && <span className="text-sm text-stone-500">{challengeDates(c)}</span>}
                </div>
                <Link to={`/manage/challenges/${c.id}`} className="group flex items-start justify-between gap-2 text-stone-900 no-underline hover:no-underline">
                  <h2 className="challenge-name text-[1.3rem] leading-snug group-hover:text-plum-800">{c.name}</h2>
                  <ChevronRight className="mt-1.5 size-5 shrink-0 text-stone-400 group-hover:text-plum-700" aria-hidden />
                </Link>
                {c.description && <p className="line-clamp-3 leading-relaxed whitespace-pre-line text-stone-700">{c.description}</p>}
                <ChallengeProgress challenge={c} />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="secondary" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing({ id: c.id, input: challengeInput(c) })}>
                    Edit
                  </Button>
                  <CopyUpdateButton label="Copy update" text={() => shareText(c, share, { lang: "en" })} />
                  <CopyUpdateButton label="Copy in Kiswahili" text={() => shareText(c, share, { lang: "sw" })} />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
