import { CheckCircle2, ClipboardPaste, PencilLine, RotateCcw } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { LoadState, SaveError } from "@/components/LoadState";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader, Notice } from "@/components/ui/misc";
import { ChallengePicker, canJoinChallenge } from "@/features/challenges";
import { SharesEditor, buildShares, type ShareDraft } from "@/features/shares";
import {
  MovementFields,
  apiDraftErrors,
  buildMovement,
  emptyDraft,
  type DraftErrors,
  type MovementDraft,
  type Uncertain,
} from "@/features/movementForm";
import { PresentationFields, emptyPresentation, presentationFromSender, toPresentation, type PresentationDraft } from "@/features/presentationFields";
import { ApiError, api, fieldError, useResource } from "@/lib/api";
import { movesMoney } from "@/lib/labels";
import { parseKes, toInput } from "@/lib/money";
import { nowNairobiInput, toNairobiInputValue } from "@/lib/time";
import type { Account, ChallengeSummary, Created, CreateRequest, Fundraiser, ListResponse, ParseResponse } from "@/lib/types";

type Step = { name: "paste" } | { name: "confirm"; parse: ParseResponse | null; message: string | null } | { name: "done"; created: Created };

export function AddTransactionPage() {
  const accounts = useResource<Account[]>("/api/manage/accounts");
  const settings = useResource<Fundraiser>("/api/manage/settings");
  const [step, setStep] = useState<Step>({ name: "paste" });
  const [message, setMessage] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<unknown>(null);

  const [draft, setDraft] = useState<MovementDraft | null>(null);
  const [uncertain, setUncertain] = useState<Uncertain>({});
  const [presentation, setPresentation] = useState<PresentationDraft>(emptyPresentation());
  const [charge, setCharge] = useState("");
  const [chargeNote, setChargeNote] = useState<string | undefined>();
  const [errors, setErrors] = useState<DraftErrors>({});
  const [chargeError, setChargeError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [formKey, setFormKey] = useState(newFormKey);
  // A payment from several people: who it is from, each with their part.
  const [shared, setShared] = useState(false);
  const [shareRows, setShareRows] = useState<ShareDraft[]>([]);
  const [sharesError, setSharesError] = useState<string | undefined>();
  // From the Pledges page: `?kind=pledge&by=family` starts a new pledge; `?pledge=12` records money for pledge 12.
  const [params] = useSearchParams();
  const pledgeFor = params.get("pledge");
  // From a challenge's page: `?challenge=3` records money that came in through challenge 3;
  // `?handover=3` records challenge 3 handing its money over to the main account.
  const challengeFor = params.get("challenge");
  const handoverFor = params.get("handover");
  const [challenge, setChallenge] = useState(challengeFor ?? "");
  const challenges = useResource<ChallengeSummary[]>("/api/manage/challenges");
  const owner = (challenges.data ?? []).find((c) => String(c.id) === (challengeFor ?? handoverFor));
  // Money received into a challenge's own account belongs to that challenge.
  const kittyOwner = (challenges.data ?? []).find((c) => c.account_id !== null && String(c.account_id) === draft?.accountId);
  const receivedIntoKitty = draft?.kind === "contribution" && kittyOwner !== undefined;
  useEffect(() => {
    if (receivedIntoKitty && kittyOwner) setChallenge(String(kittyOwner.id));
  }, [receivedIntoKitty, kittyOwner]);
  useEffect(() => {
    if (!accounts.data || !handoverFor || !owner?.account_id) return;
    const kitty = owner.account_id;
    const main = accounts.data.find((a) => a.kind === "mpesa" && a.id !== kitty) ?? accounts.data.find((a) => a.id !== kitty);
    setDraft({ ...emptyDraft(accounts.data), kind: "transfer", accountId: String(kitty), toAccountId: main ? String(main.id) : "", occurredAt: nowNairobiInput() });
    setPresentation({ ...emptyPresentation(), description: `Hand-over from the challenge “${owner.name}”` });
    setFormKey(newFormKey());
    setStep({ name: "confirm", parse: null, message: null });
  }, [accounts.data, handoverFor, owner]);
  const newPledgeBy = params.get("kind") === "pledge" ? (params.get("by") === "family" ? "family" : "friends") : null;
  useEffect(() => {
    if (!accounts.data || !newPledgeBy) return;
    setDraft({ ...emptyDraft(accounts.data), kind: "pledge", occurredAt: nowNairobiInput() });
    setPresentation({ ...emptyPresentation(), nameMode: "named", pledgedBy: newPledgeBy });
    setFormKey(newFormKey());
    setStep({ name: "confirm", parse: null, message: null });
  }, [accounts.data, newPledgeBy]);

  if (!accounts.data) {
    return <LoadState loading={accounts.loading} error={accounts.error} onRetry={accounts.reload} />;
  }
  const accountList = accounts.data;
  const duplicate = saveError instanceof ApiError && saveError.code === "possible_duplicate" ? saveError : null;

  function reset() {
    setStep({ name: "paste" });
    setMessage("");
    setDraft(null);
    setUncertain({});
    setPresentation(emptyPresentation());
    setCharge("");
    setChargeNote(undefined);
    setErrors({});
    setChargeError(undefined);
    setSaveError(null);
    setReadError(null);
    setChallenge(challengeFor ?? "");
    setShared(false);
    setShareRows([]);
    setSharesError(undefined);
  }

  async function readMessage(event: FormEvent) {
    event.preventDefault();
    setReading(true);
    setReadError(null);
    try {
      const response = await api.post<ParseResponse>("/api/manage/capture/parse", { message });
      const p = response.parsed;
      const mpesa = accountList.find((a) => a.kind === "mpesa") ?? accountList[0];
      const cash = accountList.find((a) => a.kind === "cash");
      const next: MovementDraft = {
        ...emptyDraft(accountList),
        kind: p.suggested_kind ?? "",
        direction: p.direction.value ?? "",
        amount: toInput(p.amount_minor.value),
        occurredAt: toNairobiInputValue(p.occurred_at.value),
        reference: p.reference.value ?? "",
        counterparty: p.counterparty ?? "",
      };
      if (p.format === "deposit" && cash && mpesa) {
        next.accountId = String(cash.id);
        next.toAccountId = String(mpesa.id);
      } else if (p.suggested_kind === "transfer" && cash) {
        next.toAccountId = String(cash.id);
      }
      if (p.original_reference) {
        const found = await api
          .get<ListResponse>(`/api/manage/transactions?q=${encodeURIComponent(p.original_reference)}&limit=5`)
          .catch(() => null);
        const original = found?.items.find((i) => i.reference === p.original_reference && !i.is_fee);
        if (original) next.relatedId = String(original.id);
      }
      if (pledgeFor && next.kind === "contribution") next.relatedId = pledgeFor;
      if (owner?.account_id && next.kind === "contribution") next.accountId = String(owner.account_id);
      const notes: Uncertain = {};
      if (!p.suggested_kind) notes.kind = "The message does not say what this was. Choose the type.";
      if (!p.amount_minor.certain) notes.amount = p.amount_minor.note ?? "Check the amount.";
      if (!p.occurred_at.certain) notes.occurredAt = p.occurred_at.note ?? "Check the date and time.";
      if (!p.direction.certain) notes.direction = p.direction.note ?? "Choose money in or out.";
      if (!p.reference.certain) notes.reference = p.reference.note ?? "Check the reference.";
      setDraft(next);
      setUncertain(notes);
      setCharge(toInput(p.charge_minor.value));
      setChargeNote(p.charge_minor.certain ? undefined : (p.charge_minor.note ?? "Check the charge."));
      setPresentation(presentationFromSender(p.counterparty_name));
      setFormKey(newFormKey());
      setStep({ name: "confirm", parse: response, message });
    } catch (e) {
      setReadError(e);
    } finally {
      setReading(false);
    }
  }

  function enterManually() {
    setDraft({
      ...emptyDraft(accountList),
      occurredAt: nowNairobiInput(),
      ...(pledgeFor ? { kind: "contribution" as const, relatedId: pledgeFor } : {}),
      ...(challengeFor ? { kind: "contribution" as const, ...(owner?.account_id ? { accountId: String(owner.account_id) } : {}) } : {}),
    });
    setUncertain({});
    setCharge("");
    setChargeNote(undefined);
    setPresentation(emptyPresentation());
    setFormKey(newFormKey());
    setStep({ name: "confirm", parse: null, message: null });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await submit(false);
  }

  async function submit(confirmPossibleDuplicate: boolean) {
    if (!draft || step.name !== "confirm") return;
    setSaveError(null);
    const built = buildMovement(draft);
    let chargeMinor: number | null = null;
    let chargeProblem: string | undefined;
    if (charge.trim() && movesMoney(draft.kind) && draft.kind !== "charge") {
      const parsed = parseKes(charge);
      if (parsed.ok) chargeMinor = parsed.minor;
      else chargeProblem = parsed.error;
    }
    setChargeError(chargeProblem);
    if ("errors" in built) {
      setErrors(built.errors);
      return;
    }
    if (chargeProblem) return;
    let shares = null;
    if (shared && draft.kind === "contribution") {
      const parsedTotal = parseKes(draft.amount);
      const builtShares = buildShares(shareRows, parsedTotal.ok ? parsedTotal.minor : null);
      if ("error" in builtShares) {
        setSharesError(builtShares.error);
        return;
      }
      shares = builtShares.shares;
    }
    setSharesError(undefined);
    setErrors({});
    const body: CreateRequest = {
      movement: built.movement,
      presentation: toPresentation(presentation, draft.kind),
      source_message: step.message,
      charge_minor: chargeMinor,
      client_key: formKey,
      confirm_possible_duplicate: confirmPossibleDuplicate,
      challenge_id: canJoinChallenge(draft.kind) && challenge ? Number(challenge) : null,
      shares,
    };
    setSaving(true);
    try {
      const created = await api.post<Created>("/api/manage/transactions", body);
      setStep({ name: "done", created });
    } catch (e) {
      setSaveError(e);
      setErrors(apiDraftErrors(e));
      setChargeError(fieldError(e, "charge_minor"));
      setSharesError(fieldError(e, "shares"));
    } finally {
      setSaving(false);
    }
  }

  if (step.name === "done") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Notice tone="success" title="Transaction saved">
          {step.created.charge_id ? "The charge was saved as its own line, so it is counted once." : "It now counts in the totals."}
        </Notice>
        <div className="flex flex-wrap gap-3">
          <ButtonLink to={`/manage/transactions/${step.created.id}`} variant="secondary">
            View transaction
          </ButtonLink>
          {(challengeFor ?? handoverFor) && (
            <ButtonLink to={`/manage/challenges/${challengeFor ?? handoverFor}`} variant="secondary">
              Back to the challenge
            </ButtonLink>
          )}
          <Button onClick={reset} icon={<ClipboardPaste className="size-4" aria-hidden />}>
            Add another
          </Button>
        </div>
      </div>
    );
  }

  if (step.name === "paste" || !draft) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="page-title">Add transaction</h1>
        <Card>
          <form onSubmit={readMessage}>
            <CardBody className="space-y-4">
              <Field
                label="Paste M-Pesa message"
                htmlFor="sms"
                error={fieldError(readError, "message")}
                hint="Long-press the M-Pesa SMS, copy it, and paste it here. Nothing is saved until you confirm."
              >
                <Textarea
                  id="sms"
                  rows={6}
                  autoFocus
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="SFK7ABC123 Confirmed. You have received Ksh1,500.00 from …"
                />
              </Field>
              {readError !== null && !fieldError(readError, "message") ? <SaveError error={readError} /> : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="submit" size="lg" busy={reading} disabled={!message.trim()} icon={<ClipboardPaste className="size-5" aria-hidden />}>
                  Read message
                </Button>
                <Button variant="ghost" size="lg" onClick={enterManually} icon={<PencilLine className="size-5" aria-hidden />}>
                  Enter details manually instead
                </Button>
              </div>
            </CardBody>
          </form>
        </Card>
      </div>
    );
  }

  const parse = step.parse;
  const showCharge = movesMoney(draft.kind) && draft.kind !== "charge" && draft.kind !== "";

  return (
    <form onSubmit={save} className="mx-auto max-w-2xl space-y-4" noValidate>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">Check and save</h1>
        <Button variant="ghost" onClick={reset} icon={<RotateCcw className="size-4" aria-hidden />}>
          Start again
        </Button>
      </div>

      {parse && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-stone-700">
            Read as <Badge tone={parse.parsed.recognised ? "info" : "warning"}>{parse.parsed.format_label}</Badge>
          </div>
          {parse.already_recorded_id && (
            <Notice tone="warning" title="This may already be recorded">
              A saved record uses this message or reference:{" "}
              <Link to={`/manage/transactions/${parse.already_recorded_id}`}>transaction #{parse.already_recorded_id}</Link>. Saving again will be
              refused if it is the same movement.
            </Notice>
          )}
          {parse.parsed.warnings.map((w) => (
            <Notice key={w} tone="warning">
              {w}
            </Notice>
          ))}
          {Object.keys(uncertain).length > 0 && (
            <p className="text-sm text-ochre-900">Fields marked in amber could not be read with certainty. Check them against the message.</p>
          )}
        </div>
      )}

      <Card>
        <CardHeader title="Money details" description="Amounts and times exactly as on the message." />
        <CardBody>
          <MovementFields
            draft={draft}
            onChange={setDraft}
            accounts={accountList}
            errors={errors}
            uncertain={uncertain}
            idPrefix="add"
            afterAmount={
              showCharge ? (
                <Field
                  label="Charge (transaction cost, KES)"
                  htmlFor="add-charge"
                  optional
                  error={chargeError}
                  uncertain={chargeNote}
                  hint={charge.trim() ? "Saved as a separate charge line so it is counted once." : "Leave empty if there was no charge."}
                >
                  <Input id="add-charge" inputMode="decimal" value={charge} tone={chargeError ? "invalid" : chargeNote ? "uncertain" : "normal"} onChange={(e) => setCharge(e.target.value)} />
                </Field>
              ) : null
            }
          />
        </CardBody>
      </Card>

      {draft.kind !== "" && (
        <Card>
          <CardHeader
            title={draft.kind === "personal" ? "Private notes" : "What people will see"}
            description={draft.kind === "personal" ? "Personal activity never appears publicly and does not count in fundraiser totals." : undefined}
          />
          <CardBody>
            <PresentationFields
              kind={draft.kind}
              draft={presentation}
              onChange={setPresentation}
              senderName={parse?.parsed.counterparty_name}
              anonymousLabel={settings.data?.anonymous_label}
              error={saveError}
              idPrefix="add-p"
            />
            {draft.kind === "contribution" && (
              <div className="mt-4 space-y-3 rounded-xl border border-stone-200 p-4">
                <Checkbox
                  checked={shared}
                  onChange={(e) => setShared(e.target.checked)}
                  label="From several people"
                  hint="One payment for several names, e.g. KES 1,000 for five people. Each person is listed on their own; the money counts once."
                />
                {shared && (
                  <SharesEditor
                    total={(() => {
                      const parsed = parseKes(draft.amount);
                      return parsed.ok ? parsed.minor : null;
                    })()}
                    value={shareRows}
                    onChange={setShareRows}
                    anonymousLabel={settings.data?.anonymous_label}
                    error={sharesError}
                    idPrefix="add-sh"
                  />
                )}
              </div>
            )}
            {canJoinChallenge(draft.kind) && (
              <Field
                label="Came in through a challenge"
                htmlFor="add-challenge"
                optional
                className="mt-4"
                error={fieldError(saveError, "challenge_id")}
                hint={
                  receivedIntoKitty
                    ? `Received into ${kittyOwner.account_name}, so it belongs to “${kittyOwner.name}”. It counts in the totals and is owed to the main fund until handed over.`
                    : draft.kind === "contribution" && draft.relatedId && !challenge
                      ? "Money for a pledge made in a challenge joins that challenge on its own."
                      : "It still counts once in the main totals; the challenge just keeps its own tally."
                }
              >
                <ChallengePicker id="add-challenge" value={challenge} onChange={setChallenge} />
              </Field>
            )}
          </CardBody>
        </Card>
      )}

      {step.message && (
        <details className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-stone-800">Original message (saved privately with this record)</summary>
          <p className="mt-2 whitespace-pre-wrap text-stone-700">{step.message}</p>
        </details>
      )}

      {duplicate ? (
        <Notice tone="warning" title="This may already be recorded">
          <p>{duplicate.message}</p>
          <ul className="mt-1 flex flex-wrap gap-x-3">
            {duplicate.matches.map((id) => (
              <li key={id}>
                <Link to={`/manage/transactions/${id}`} target="_blank" rel="noreferrer">
                  Open transaction #{id}
                </Link>
              </li>
            ))}
          </ul>
          <Button variant="secondary" size="sm" className="mt-3" busy={saving} onClick={() => void submit(true)}>
            It's a different transaction, save anyway
          </Button>
        </Notice>
      ) : (
        <SaveError error={saveError && Object.keys(apiDraftErrors(saveError)).length === 0 ? saveError : null} />
      )}
      {/* Pinned to the bottom of the scrolling area so Save is always in reach. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex gap-3 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-lg">
        <Button type="submit" size="lg" className="flex-1 sm:flex-none" busy={saving} icon={<CheckCircle2 className="size-5" aria-hidden />}>
          Save transaction
        </Button>
        <Button variant="secondary" size="lg" onClick={reset}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** A random key for one form. Works without HTTPS, unlike crypto.randomUUID. */
function newFormKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
