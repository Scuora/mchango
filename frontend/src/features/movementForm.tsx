import type { ReactNode } from "react";
import { fieldError } from "@/lib/api";
import { KIND_OPTIONS, fixedDirection, movesMoney, needsDirection } from "@/lib/labels";
import { parseKes, toInput } from "@/lib/money";
import { fromNairobiInput, toNairobiInputValue } from "@/lib/time";
import type { Account, Direction, Kind, ListItem, MovementInput } from "@/lib/types";
import { Field, Input, RadioGroup } from "@/components/ui/form";
import { Choice, DateTimeField } from "@/components/ui/pickers";
import { BillPicker } from "./bills";
import { PledgePicker } from "./pledgePicker";

/** Editable financial details. Text fields hold exactly what the person typed. */
export interface MovementDraft {
  kind: Kind | "";
  direction: Direction | "";
  amount: string;
  /** Nairobi wall-clock time from <input type="datetime-local">. */
  occurredAt: string;
  accountId: string;
  toAccountId: string;
  reference: string;
  relatedId: string;
  isFee: boolean;
  counterparty: string;
}

export type Uncertain = Partial<Record<"kind" | "direction" | "amount" | "occurredAt" | "reference", string>>;

export function emptyDraft(accounts: Account[]): MovementDraft {
  const mpesa = accounts.find((a) => a.kind === "mpesa") ?? accounts[0];
  return {
    kind: "",
    direction: "",
    amount: "",
    occurredAt: "",
    accountId: mpesa ? String(mpesa.id) : "",
    toAccountId: "",
    reference: "",
    relatedId: "",
    isFee: false,
    counterparty: "",
  };
}

export function draftFromItem(item: ListItem): MovementDraft {
  return {
    kind: item.kind,
    direction: item.direction ?? "",
    amount: toInput(item.amount_minor),
    occurredAt: toNairobiInputValue(item.occurred_at),
    accountId: item.account_id ? String(item.account_id) : "",
    toAccountId: item.to_account_id ? String(item.to_account_id) : "",
    reference: item.reference ?? "",
    relatedId: item.related_transaction_id ? String(item.related_transaction_id) : "",
    isFee: item.is_fee,
    counterparty: item.counterparty ?? "",
  };
}

export type DraftErrors = Partial<Record<"kind" | "direction" | "amount" | "occurredAt" | "accountId" | "toAccountId" | "relatedId", string>>;

/** Checks a draft and turns it into the API's MovementInput. */
export function buildMovement(draft: MovementDraft): { movement: MovementInput } | { errors: DraftErrors } {
  const errors: DraftErrors = {};
  if (!draft.kind) errors.kind = "Choose what kind of record this is.";
  const amount = parseKes(draft.amount);
  if (!amount.ok) errors.amount = amount.error;
  if (!draft.occurredAt) errors.occurredAt = "Enter the date and time of the transaction.";
  const kind = draft.kind;
  const money = movesMoney(kind);
  if (kind && needsDirection(kind) && !draft.direction) errors.direction = "Choose whether the money came in or went out.";
  if (kind && money && !draft.accountId) errors.accountId = "Choose the account.";
  if (kind === "transfer") {
    if (!draft.toAccountId) errors.toAccountId = "Choose where the money went.";
    else if (draft.toAccountId === draft.accountId) errors.toAccountId = "Choose a different account.";
  }
  if (draft.relatedId && !/^\d+$/.test(draft.relatedId.trim())) errors.relatedId = "Enter a record number, e.g. 12.";
  if (Object.keys(errors).length > 0 || !kind || !amount.ok) return { errors };

  const direction = fixedDirection(kind) ?? (needsDirection(kind) ? (draft.direction as Direction) : null);
  return {
    movement: {
      kind,
      direction,
      amount_minor: amount.minor,
      occurred_at: fromNairobiInput(draft.occurredAt),
      account_id: money ? Number(draft.accountId) : null,
      to_account_id: kind === "transfer" ? Number(draft.toAccountId) : null,
      reference: money && draft.reference.trim() ? draft.reference.trim().toUpperCase() : null,
      is_fee: kind === "charge" || ((kind === "personal" || kind === "reversal") && draft.isFee),
      related_transaction_id: draft.relatedId.trim() ? Number(draft.relatedId.trim()) : null,
      counterparty: draft.counterparty.trim() || null,
    },
  };
}

const API_FIELDS: Record<string, keyof DraftErrors> = {
  kind: "kind",
  direction: "direction",
  amount_minor: "amount",
  occurred_at: "occurredAt",
  account_id: "accountId",
  to_account_id: "toAccountId",
  related_transaction_id: "relatedId",
};

/** Field errors from the API mapped onto the draft's fields. */
export function apiDraftErrors(error: unknown): DraftErrors {
  const out: DraftErrors = {};
  for (const [apiField, draftField] of Object.entries(API_FIELDS)) {
    const message = fieldError(error, apiField);
    if (message) out[draftField] = message;
  }
  return out;
}

interface Props {
  draft: MovementDraft;
  onChange: (draft: MovementDraft) => void;
  accounts: Account[];
  errors: DraftErrors;
  uncertain?: Uncertain;
  /** Extra content after the amount (e.g. the charge field). */
  afterAmount?: ReactNode;
  idPrefix?: string;
}

/** The financial fields of a transaction, adapting to the chosen type. */
export function MovementFields({ draft, onChange, accounts, errors, uncertain = {}, afterAmount, idPrefix = "m" }: Props) {
  const set = <K extends keyof MovementDraft>(key: K, value: MovementDraft[K]) => onChange({ ...draft, [key]: value });
  const id = (name: string) => `${idPrefix}-${name}`;
  const kind = draft.kind;
  const money = movesMoney(kind);
  const accountOptions = accounts.map((a) => ({ value: String(a.id), label: a.name }));
  const tone = (field: keyof Uncertain & keyof DraftErrors) => (errors[field] ? "invalid" : uncertain[field] ? "uncertain" : "normal");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Type" htmlFor={id("kind")} error={errors.kind} uncertain={uncertain.kind} className="sm:col-span-2">
        <Choice id={id("kind")} value={kind} options={KIND_OPTIONS} placeholder="Choose the type…" tone={tone("kind")} onChange={(v) => set("kind", v as Kind | "")} />
      </Field>

      {needsDirection(kind) && (
        <div className="sm:col-span-2">
          <RadioGroup<Direction | "">
            name={id("direction")}
            legend="Money came in or went out?"
            value={draft.direction}
            onChange={(v) => set("direction", v)}
            options={[
              { value: "in", label: "Money came in" },
              { value: "out", label: "Money went out" },
            ]}
          />
          {(errors.direction || uncertain.direction) && (
            <p className={errors.direction ? "mt-1 text-sm font-medium text-brick-700" : "mt-1 text-sm text-ochre-800"}>
              {errors.direction ?? uncertain.direction}
            </p>
          )}
        </div>
      )}

      <Field
        label={kind === "pledge" ? "Amount promised (KES)" : kind === "commitment" ? "Amount owed (KES)" : "Amount (KES)"}
        htmlFor={id("amount")}
        error={errors.amount}
        uncertain={uncertain.amount}
        hint={kind && money ? "Without the charge; charges are recorded on their own line." : undefined}
      >
        <Input
          id={id("amount")}
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 1,250.50"
          value={draft.amount}
          tone={tone("amount")}
          onChange={(e) => set("amount", e.target.value)}
        />
      </Field>

      <Field
        label={kind === "pledge" ? "Date promised" : kind === "commitment" ? "Date of the bill" : "Transaction time (Nairobi)"}
        htmlFor={id("time")}
        error={errors.occurredAt}
        uncertain={uncertain.occurredAt}
      >
        <DateTimeField id={id("time")} value={draft.occurredAt} tone={tone("occurredAt")} onChange={(v) => set("occurredAt", v)} />
      </Field>

      {afterAmount}

      {money && kind !== "" && (
        <>
          <Field label={kind === "transfer" ? "Moved from" : "Account"} htmlFor={id("account")} error={errors.accountId}>
            <Choice id={id("account")} value={draft.accountId} options={accountOptions} tone={errors.accountId ? "invalid" : "normal"} onChange={(v) => set("accountId", v)} />
          </Field>
          {kind === "transfer" && (
            <Field label="Moved to" htmlFor={id("to")} error={errors.toAccountId} hint="A withdrawal at an agent moves money to cash held.">
              <Choice id={id("to")} value={draft.toAccountId} options={accountOptions} tone={errors.toAccountId ? "invalid" : "normal"} onChange={(v) => set("toAccountId", v)} />
            </Field>
          )}
          <Field label="M-Pesa reference" htmlFor={id("reference")} uncertain={uncertain.reference} optional hint={!uncertain.reference ? "e.g. SFK7ABC123" : undefined}>
            <Input
              id={id("reference")}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={draft.reference}
              tone={uncertain.reference ? "uncertain" : "normal"}
              onChange={(e) => set("reference", e.target.value.toUpperCase())}
            />
          </Field>
        </>
      )}

      {(kind === "refund" || kind === "reversal" || kind === "contribution" || kind === "expense" || kind === "charge") && (
        <Field
          label={kind === "contribution" ? "Fulfils a pledge" : kind === "expense" ? "Pays towards a bill" : "Linked record number"}
          htmlFor={id("related")}
          optional
          error={errors.relatedId}
          hint={
            kind === "contribution"
              ? "If this person pledged, choose their pledge so it shows as received."
              : kind === "expense"
                ? "The bill this payment goes towards, when a bill is paid in parts or was recorded first."
                : kind === "charge"
                  ? "The payment this charge was taken on."
                  : "The original movement being refunded or reversed."
          }
        >
          {kind === "contribution" ? (
            <PledgePicker id={id("related")} value={draft.relatedId} onChange={(v) => set("relatedId", v)} senderName={draft.counterparty} />
          ) : kind === "expense" ? (
            <BillPicker id={id("related")} value={draft.relatedId} onChange={(v) => set("relatedId", v)} />
          ) : (
            <Input id={id("related")} inputMode="numeric" value={draft.relatedId} tone={errors.relatedId ? "invalid" : "normal"} onChange={(e) => set("relatedId", e.target.value)} />
          )}
        </Field>
      )}

      {(kind === "personal" || kind === "reversal") && (
        <label className="flex min-h-11 items-center gap-3 text-[15px] sm:col-span-2">
          <input type="checkbox" className="size-5 accent-plum-700" checked={draft.isFee} onChange={(e) => set("isFee", e.target.checked)} />
          This line is a transaction charge
        </label>
      )}
    </div>
  );
}
