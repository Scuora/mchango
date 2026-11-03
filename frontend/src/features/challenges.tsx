// Shared pieces for challenges: the editor, status badges, progress and the
// "copy update" button used on the list and on each challenge's page.

import { Check, Copy, Plus, Save, Trophy } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { SaveError } from "@/components/LoadState";
import { PledgeProgressBar } from "@/components/pledges";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/misc";
import { Choice, DateField } from "@/components/ui/pickers";
import { api, fieldError, useResource } from "@/lib/api";
import { STARTER_TEMPLATE, TEMPLATE_FIELDS, buildChallengeUpdate, fillTemplate, type ChallengeEntry, type ShareLang } from "@/lib/challengeShare";
import { formatKesShort, parseKes } from "@/lib/money";
import { formatNairobiDate } from "@/lib/time";
import type { Account, AccountKind, ChallengeInput, ChallengeSummary, Fundraiser, GivingMethod, Kind, ListItem, PublicPreview } from "@/lib/types";
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
  account_id: null,
  giving_method: null,
  giving_number: "",
  giving_account: "",
  giving_name: "",
  message_template: "",
};

export function challengeInput(c: ChallengeSummary): ChallengeInput {
  const { name, name_sw, description, description_sw, target_minor, starts_on, ends_on, status, published, account_id } = c;
  const { giving_method, giving_number, giving_account, giving_name, message_template } = c;
  return { name, name_sw, description, description_sw, target_minor, starts_on, ends_on, status, published, account_id, giving_method, giving_number, giving_account, giving_name, message_template };
}

/** Where givers send money for a challenge: its own details when set, else the fundraiser's. */
export function challengeGiving(c: ChallengeSummary, fundraiser: Fundraiser | null | undefined) {
  if (c.giving_method) return { own: true, giving: { method: c.giving_method, number: c.giving_number, account: c.giving_account || null, name: c.giving_name } };
  const f = fundraiser;
  return { own: false, giving: f?.giving_method ? { method: f.giving_method, number: f.giving_number, account: f.giving_account || null, name: f.giving_name } : null };
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
      {t.held_minor !== null && (
        <p className="mt-2 text-sm text-stone-600">
          <span className="font-semibold text-stone-800">{formatKesShort(t.held_minor)}</span> held in {challenge.account_name ?? "its account"}, to be handed over ·{" "}
          {formatKesShort(t.handed_over_minor ?? 0)} handed over
        </p>
      )}
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

/** The message to share: the family's own template when it has one ("template"), or the standard update. */
export type ShareMode = "template" | ShareLang;

export function shareText(
  challenge: ChallengeSummary,
  ctx: ReturnType<typeof useShareContext>,
  options: { lang: ShareMode; entries?: ChallengeEntry[]; includeList?: boolean; includeGiving?: boolean; includeLink?: boolean },
): string {
  const s = ctx.settings;
  if (options.lang === "template") {
    return fillTemplate(challenge.message_template, {
      challenge,
      entries: options.entries ?? [],
      memorialName: s?.memorial_name || null,
      giving: challengeGiving(challenge, s).giving,
      publicUrl: ctx.publicUrl,
    });
  }
  return buildChallengeUpdate({
    challenge,
    entries: options.entries ?? [],
    memorialName: s?.memorial_name || null,
    giving: challengeGiving(challenge, s).giving,
    ownGiving: challengeGiving(challenge, s).own,
    publicUrl: options.includeLink === false ? null : ctx.publicUrl,
    lang: options.lang,
    includeList: options.includeList ?? false,
    includeGiving: options.includeGiving ?? true,
  });
}

/** The family's own WhatsApp message: written their way, with {placeholders} for the live figures. */
function TemplateField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const box = useRef<HTMLTextAreaElement>(null);
  function insert(key: string) {
    const area = box.current;
    const token = `{${key}}`;
    if (!area) return onChange(value + token);
    const [start, end] = [area.selectionStart, area.selectionEnd];
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(start + token.length, start + token.length);
    });
  }
  return (
    <fieldset className="space-y-3 rounded-xl border border-stone-200 p-4">
      <legend className="px-1 font-semibold text-stone-800">WhatsApp message (optional)</legend>
      <p className="-mt-1 text-sm text-stone-600">
        Write the message the way you share it. Words in braces are filled in with the latest figures each time you copy it; tap one to add it. Left empty, the standard update is used.
      </p>
      <Field label="Message template" htmlFor="ch-template" optional error={error}>
        <Textarea ref={box} id="ch-template" rows={12} className="font-mono text-sm" value={value} placeholder={STARTER_TEMPLATE} onChange={(e) => onChange(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {TEMPLATE_FIELDS.map(([key, meaning]) => (
          <button
            key={key}
            type="button"
            title={meaning}
            onClick={() => insert(key)}
            className="press min-h-8 cursor-pointer rounded-full bg-stone-100 px-2.5 font-mono text-[13px] text-stone-700 ring-1 ring-stone-200 hover:bg-plum-50 hover:text-plum-900"
          >
            {`{${key}}`}
          </button>
        ))}
      </div>
      {!value && (
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange(STARTER_TEMPLATE)}>
          Start from an example
        </Button>
      )}
    </fieldset>
  );
}

/** Choose the account a challenge keeps its own money in, or add one for it. */
function OwnAccount({ challengeId, value, onChange, error }: { challengeId: number | null; value: number | null; onChange: (id: number | null) => void; error?: string }) {
  const accounts = useResource<Account[]>("/api/manage/accounts");
  const challenges = useResource<ChallengeSummary[]>("/api/manage/challenges");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("mpesa");
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<unknown>(null);
  const taken = new Map((challenges.data ?? []).filter((c) => c.account_id !== null && c.id !== challengeId).map((c) => [c.account_id, c.name]));
  const options = (accounts.data ?? []).filter((a) => !taken.has(a.id)).map((a) => ({ value: String(a.id), label: a.name }));

  async function add() {
    setBusy(true);
    setAddError(null);
    try {
      const created = await api.post<Account>("/api/manage/accounts", { name, kind });
      accounts.reload();
      onChange(created.id);
      setAdding(false);
      setName("");
    } catch (e) {
      setAddError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Field
        label="Its own account"
        htmlFor="ch-account"
        optional
        error={error}
        hint="For a challenge that collects its own money, such as the organiser's M-Pesa line or a cash box. Money received there belongs to the challenge, and the fundraiser counts it as owed to the main fund until it is handed over. Leave empty when the money goes straight to the main account."
      >
        <Choice id="ch-account" value={value === null ? "" : String(value)} options={options} onChange={(v) => onChange(v ? Number(v) : null)} clearable placeholder="None: the money goes to the main account" />
      </Field>
      {adding ? (
        <div className="grid gap-3 rounded-lg bg-stone-50 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <Field label="Account name" htmlFor="ch-new-account" error={fieldError(addError, "name")}>
            <Input
              id="ch-new-account"
              value={name}
              placeholder="e.g. Walk organiser's M-Pesa"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                // Inside the challenge form: Enter adds the account, not the challenge.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (name.trim()) void add();
                }
              }}
            />
          </Field>
          <Field label="Type" htmlFor="ch-new-kind">
            <Choice
              id="ch-new-kind"
              value={kind}
              onChange={(v) => setKind((v || "mpesa") as AccountKind)}
              options={[
                { value: "mpesa", label: "M-Pesa" },
                { value: "cash", label: "Cash" },
                { value: "bank", label: "Bank" },
              ]}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" busy={busy} disabled={!name.trim()} onClick={() => void add()}>
              Add
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
          <SaveError error={addError && !fieldError(addError, "name") ? addError : null} />
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
          Add an account for it
        </Button>
      )}
    </div>
  );
}

/** Copies a ready-made update; the label says which language. */
export function CopyUpdateButton({ text, label, disabled }: { text: () => string; label: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled}
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
  const fields = ["name", "name_sw", "description", "description_sw", "starts_on", "ends_on", "target_minor", "account_id", "giving_number", "giving_account", "giving_name"];
  const method = input.giving_method;

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
            <legend className="px-1 font-semibold text-stone-800">Its own money (optional)</legend>
            <OwnAccount challengeId={id} value={input.account_id} onChange={(v) => set("account_id", v)} error={fieldError(error, "account_id")} />
            <Field
              label="Where givers send money"
              htmlFor="ch-giving"
              hint="Shown on the public page and in the challenge's updates. Choose another number only when the challenge collects to its own phone, Paybill or till."
            >
              <Choice
                id="ch-giving"
                value={method ?? ""}
                options={[
                  { value: "", label: "The fundraiser's own giving details" },
                  { value: "phone", label: "Send Money to another phone number" },
                  { value: "paybill", label: "Another Paybill (business number + account)" },
                  { value: "till", label: "Another till number (Buy Goods)" },
                ]}
                onChange={(v) => set("giving_method", (v || null) as GivingMethod | null)}
              />
            </Field>
            {method && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={method === "paybill" ? "Business number" : method === "till" ? "Till number" : "Phone number"} htmlFor="ch-giving-number" error={fieldError(error, "giving_number")}>
                  <Input id="ch-giving-number" inputMode={method === "phone" ? "tel" : "numeric"} value={input.giving_number} onChange={(e) => set("giving_number", e.target.value)} />
                </Field>
                {method === "paybill" && (
                  <Field label="Account number" htmlFor="ch-giving-account" error={fieldError(error, "giving_account")}>
                    <Input id="ch-giving-account" value={input.giving_account} onChange={(e) => set("giving_account", e.target.value)} />
                  </Field>
                )}
                <Field
                  label="Name M-Pesa shows before the PIN"
                  htmlFor="ch-giving-name"
                  error={fieldError(error, "giving_name")}
                  hint="Exactly as M-Pesa displays it, so givers can check they have the right account."
                  className="sm:col-span-2"
                >
                  <Input id="ch-giving-name" value={input.giving_name} onChange={(e) => set("giving_name", e.target.value)} />
                </Field>
              </div>
            )}
          </fieldset>
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
          <TemplateField value={input.message_template} onChange={(v) => set("message_template", v)} error={fieldError(error, "message_template")} />
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
