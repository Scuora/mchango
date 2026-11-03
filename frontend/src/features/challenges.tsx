// Shared pieces for challenges: the editor, status badges, progress and the
// "copy update" button used on the list and on each challenge's page.

import { Check, Copy, Save, Trophy } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { SaveError } from "@/components/LoadState";
import { PledgeProgressBar } from "@/components/pledges";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/misc";
import { Choice, DateField } from "@/components/ui/pickers";
import { api, fieldError, useResource } from "@/lib/api";
import { buildChallengeUpdate, type ChallengeEntry, type ShareLang } from "@/lib/challengeShare";
import { formatKesShort, parseKes } from "@/lib/money";
import { formatNairobiDate } from "@/lib/time";
import type { ChallengeInput, ChallengeSummary, Fundraiser, Kind, ListItem, PublicPreview } from "@/lib/types";
import { copyText } from "@/public/share";

/** Only money received and pledges come in through a challenge. */
export function canJoinChallenge(kind: Kind | ""): boolean {
  return kind === "contribution" || kind === "pledge";
}

/** Choose the challenge a record came in through: active ones, plus the current choice. */
export function ChallengePicker({ id, value, onChange }: { id: string; value: string; onChange: (id: string) => void }) {
  const challenges = useResource<ChallengeSummary[]>("/api/manage/challenges");
  const options = (challenges.data ?? [])
    .filter((c) => c.status === "active" || String(c.id) === value)
    .map((c) => ({ value: String(c.id), label: c.status === "closed" ? `${c.name} (closed)` : c.name }));
  return (
    <Choice
      id={id}
      value={value}
      options={options}
      onChange={onChange}
      clearable
      disabled={options.length === 0 && !value}
      placeholder={challenges.loading ? "Loading challenges…" : options.length ? "Not part of a challenge" : "No active challenges"}
    />
  );
}

export const emptyChallenge: ChallengeInput = {
  name: "",
  name_sw: "",
  description: "",
  description_sw: "",
  target_minor: null,
  starts_on: null,
  ends_on: null,
  status: "active",
  published: true,
};

export function challengeInput(c: ChallengeSummary): ChallengeInput {
  const { name, name_sw, description, description_sw, target_minor, starts_on, ends_on, status, published } = c;
  return { name, name_sw, description, description_sw, target_minor, starts_on, ends_on, status, published };
}

export function ChallengeBadges({ challenge }: { challenge: ChallengeSummary }) {
  return (
    <>
      <Badge tone={challenge.status === "active" ? "success" : "neutral"}>{challenge.status === "active" ? "Active" : "Closed"}</Badge>
      {!challenge.published && <Badge tone="neutral">Not on the public page</Badge>}
    </>
  );
}

/** "1 Nov – 7 Nov 2026", "From 1 Nov 2026", or nothing. */
export function challengeDates(c: { starts_on: string | null; ends_on: string | null }): string | null {
  if (c.starts_on && c.ends_on) return `${formatNairobiDate(c.starts_on)} – ${formatNairobiDate(c.ends_on)}`;
  if (c.starts_on) return `From ${formatNairobiDate(c.starts_on)}`;
  if (c.ends_on) return `Until ${formatNairobiDate(c.ends_on)}`;
  return null;
}

/** Raised so far, and the way to its own target when it has one. */
export function ChallengeProgress({ challenge, large = false }: { challenge: ChallengeSummary; large?: boolean }) {
  const t = challenge.totals;
  return (
    <div>
      <p className={large ? "text-3xl font-semibold tabular-nums" : "text-2xl font-semibold tabular-nums"}>{formatKesShort(t.raised_minor)}</p>
      <p className="text-sm text-stone-600">
        raised from {t.contributions_count} contribution{t.contributions_count === 1 ? "" : "s"}
        {challenge.target_minor ? ` · target ${formatKesShort(challenge.target_minor)}` : ""}
        {t.pledged_outstanding_minor > 0 ? ` · ${formatKesShort(t.pledged_outstanding_minor)} pledged, not yet received` : ""}
      </p>
      {challenge.target_minor ? <PledgeProgressBar received={t.raised_minor} amount={challenge.target_minor} className="mt-2.5 h-2.5" /> : null}
    </div>
  );
}

/** What the update message needs beyond the challenge itself: public settings and the page address. */
export function useShareContext() {
  const settings = useResource<Fundraiser>("/api/manage/settings");
  const preview = useResource<PublicPreview>("/api/manage/public-preview");
  const publicUrl = preview.data?.public_url ?? null;
  return useMemo(() => ({ settings: settings.data, publicUrl }), [settings.data, publicUrl]);
}

/** Money received through the challenge, as it may be shown publicly: public names (or the anonymous label), oldest first. */
export function publicEntries(items: ListItem[], settings: Fundraiser | null | undefined): ChallengeEntry[] {
  return items
    .filter((i) => i.kind === "contribution" && !i.removed)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id - b.id)
    .map((i) => ({
      label: i.public_name ?? settings?.anonymous_label ?? "Anonymous contributor",
      amount_minor: settings?.show_contribution_amounts === false ? null : i.amount_minor,
    }));
}

export function shareText(
  challenge: ChallengeSummary,
  ctx: ReturnType<typeof useShareContext>,
  options: { lang: ShareLang; entries?: ChallengeEntry[]; includeList?: boolean; includeGiving?: boolean; includeLink?: boolean },
): string {
  const s = ctx.settings;
  return buildChallengeUpdate({
    challenge,
    entries: options.entries ?? [],
    memorialName: s?.memorial_name || null,
    giving: s?.giving_method ? { method: s.giving_method, number: s.giving_number, account: s.giving_account || null, name: s.giving_name } : null,
    publicUrl: options.includeLink === false ? null : ctx.publicUrl,
    lang: options.lang,
    includeList: options.includeList ?? false,
    includeGiving: options.includeGiving ?? true,
  });
}

/** Copies a ready-made update; the label says which language. */
export function CopyUpdateButton({ text, label }: { text: () => string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      onClick={() => void copyText(text()).then((ok) => ok && (setCopied(true), window.setTimeout(() => setCopied(false), 2000)))}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function ChallengeEditor({ id, initial, onDone, onCancel }: { id: number | null; initial: ChallengeInput; onDone: (saved: ChallengeSummary) => void; onCancel: () => void }) {
  const [input, setInput] = useState(initial);
  const [target, setTarget] = useState(initial.target_minor ? String(initial.target_minor / 100) : "");
  const [targetError, setTargetError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = <K extends keyof ChallengeInput>(key: K, value: ChallengeInput[K]) => setInput((i) => ({ ...i, [key]: value }));
  const fields = ["name", "name_sw", "description", "description_sw", "starts_on", "ends_on", "target_minor"];

  async function save(event: FormEvent) {
    event.preventDefault();
    let target_minor: number | null = null;
    if (target.trim()) {
      const parsed = parseKes(target);
      if (!parsed.ok) {
        setTargetError(parsed.error);
        return;
      }
      target_minor = parsed.minor;
    }
    setTargetError(undefined);
    setBusy(true);
    setError(null);
    try {
      const body = { ...input, target_minor };
      const saved = id === null ? await api.post<ChallengeSummary>("/api/manage/challenges", body) : await api.put<ChallengeSummary>(`/api/manage/challenges/${id}`, body);
      onDone(saved);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <Card>
        <CardHeader title={id === null ? "New challenge" : "Edit challenge"} />
        <CardBody className="space-y-4">
          <Field label="Name" htmlFor="ch-name" error={fieldError(error, "name")}>
            <Input id="ch-name" value={input.name} maxLength={80} placeholder="e.g. 1,000 shilling cousins' challenge" onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="How it works" htmlFor="ch-description" optional error={fieldError(error, "description")} hint="The rules or the dare, in a few lines. Shown in updates and on the public page.">
            <Textarea id="ch-description" rows={4} value={input.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Challenge target (KES)" htmlFor="ch-target" optional error={targetError ?? fieldError(error, "target_minor")}>
              <Input id="ch-target" inputMode="decimal" value={target} placeholder="e.g. 50,000" tone={targetError ? "invalid" : "normal"} onChange={(e) => setTarget(e.target.value)} />
            </Field>
            <Field label="Starts" htmlFor="ch-start" optional error={fieldError(error, "starts_on")}>
              <DateField id="ch-start" value={input.starts_on ?? ""} onChange={(v) => set("starts_on", v || null)} />
            </Field>
            <Field label="Ends" htmlFor="ch-end" optional error={fieldError(error, "ends_on")}>
              <DateField id="ch-end" value={input.ends_on ?? ""} onChange={(v) => set("ends_on", v || null)} />
            </Field>
          </div>
          <fieldset className="space-y-4 rounded-xl border border-stone-200 p-4">
            <legend className="px-1 font-semibold text-stone-800">In Kiswahili (optional)</legend>
            <p className="-mt-1 text-sm text-stone-600">Used in Kiswahili updates and on the public page in Kiswahili. Left empty, the English is used.</p>
            <Field label="Name in Kiswahili" htmlFor="ch-name-sw" optional error={fieldError(error, "name_sw")}>
              <Input id="ch-name-sw" lang="sw" value={input.name_sw} maxLength={80} onChange={(e) => set("name_sw", e.target.value)} />
            </Field>
            <Field label="How it works, in Kiswahili" htmlFor="ch-description-sw" optional error={fieldError(error, "description_sw")}>
              <Textarea id="ch-description-sw" lang="sw" rows={4} value={input.description_sw} onChange={(e) => set("description_sw", e.target.value)} />
            </Field>
          </fieldset>
          <Checkbox checked={input.published} onChange={(e) => set("published", e.target.checked)} label="Show on the public page" hint="Visitors see the challenge and what it has raised. Contributions stay listed as usual." />
          {id !== null && (
            <Checkbox
              checked={input.status === "closed"}
              onChange={(e) => set("status", e.target.checked ? "closed" : "active")}
              label="The challenge is over"
              hint="Closed challenges keep their records and total; they are no longer offered when recording money."
            />
          )}
          <SaveError error={error && !fields.some((f) => fieldError(error, f)) ? error : null} />
          <div className="flex gap-3">
            <Button type="submit" busy={busy} icon={id === null ? <Trophy className="size-4" aria-hidden /> : <Save className="size-4" aria-hidden />}>
              {id === null ? "Create challenge" : "Save"}
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </CardBody>
      </Card>
    </form>
  );
}
