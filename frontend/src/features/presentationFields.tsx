import { UserRound } from "lucide-react";
import { fieldError } from "@/lib/api";
import type { Kind, PledgedBy, Presentation } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, RadioGroup, Textarea } from "@/components/ui/form";

export interface PresentationDraft {
  nameMode: "anonymous" | "named";
  publicName: string;
  description: string;
  notes: string;
  /** Pledges only. */
  pledgedBy: PledgedBy;
}

export function emptyPresentation(): PresentationDraft {
  return { nameMode: "anonymous", publicName: "", description: "", notes: "", pledgedBy: "friends" };
}

/** Shows the sender's name by default (e.g. "JOHN KAMAU" as "John Kamau"); it can be changed or made anonymous. */
export function presentationFromSender(name: string | null | undefined): PresentationDraft {
  const clean = name?.trim();
  return clean ? { ...emptyPresentation(), nameMode: "named", publicName: titleCase(clean) } : emptyPresentation();
}

/** The name in statement details such as "Funds received from - 0711***777 SAMUEL KIPROTICH", without numbers. */
export function nameFromDetails(details: string): string | null {
  const text = details.replace(/\([^)]*\)/g, " ").split(" - ").pop() ?? "";
  const name = text
    .split(/\s+/)
    .filter((word) => word && !/[\d*]/.test(word))
    .join(" ")
    .trim();
  return name || null;
}

export function presentationDraftFrom(p: { public_name: string | null; description: string; notes: string; pledged_by?: PledgedBy | null }): PresentationDraft {
  return {
    nameMode: p.public_name ? "named" : "anonymous",
    publicName: p.public_name ?? "",
    description: p.description,
    notes: p.notes,
    pledgedBy: p.pledged_by ?? "friends",
  };
}

function takesPublicName(kind: Kind | ""): boolean {
  return kind === "contribution" || kind === "pledge";
}

export function toPresentation(draft: PresentationDraft, kind: Kind | ""): Presentation {
  const named = takesPublicName(kind) && draft.nameMode === "named" && draft.publicName.trim() !== "";
  return {
    public_name: named ? draft.publicName.trim() : null,
    description: kind === "personal" ? "" : draft.description.trim(),
    notes: draft.notes.trim(),
    pledged_by: kind === "pledge" ? draft.pledgedBy : null,
  };
}

export function titleCase(name: string): string {
  return name.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

interface Props {
  kind: Kind | "";
  draft: PresentationDraft;
  onChange: (draft: PresentationDraft) => void;
  /** The sender's name from the message (already the default; offered again if it is changed). */
  senderName?: string | null;
  anonymousLabel?: string;
  error?: unknown;
  idPrefix?: string;
}

/** Public name, public description / purpose, and private notes. */
export function PresentationFields({ kind, draft, onChange, senderName, anonymousLabel = "Anonymous contributor", error, idPrefix = "p" }: Props) {
  const set = <K extends keyof PresentationDraft>(key: K, value: PresentationDraft[K]) => onChange({ ...draft, [key]: value });
  const id = (name: string) => `${idPrefix}-${name}`;
  const isSpending = kind === "expense" || kind === "commitment";
  const descriptionMissing = isSpending && draft.description.trim() === "";

  return (
    <div className="grid gap-4">
      {kind === "pledge" && (
        <RadioGroup
          name={id("pledged-by")}
          legend="Pledged by"
          value={draft.pledgedBy}
          onChange={(v) => set("pledgedBy", v)}
          options={[
            { value: "friends", label: "Friends & well-wishers" },
            { value: "family", label: "The family (counts towards the family’s share)" },
          ]}
        />
      )}
      {takesPublicName(kind) && (
        <div className="space-y-3">
          <RadioGroup
            name={id("name-mode")}
            legend="Public name"
            value={draft.nameMode}
            onChange={(v) => set("nameMode", v)}
            options={[
              { value: "anonymous", label: `Anonymous (“${anonymousLabel}”)` },
              { value: "named", label: "Use a name" },
            ]}
          />
          {draft.nameMode === "named" && (
            <Field
              label="Name shown publicly"
              htmlFor={id("public-name")}
              error={fieldError(error, "public_name")}
              hint="Change it to how the family knows them, such as “Mama Brian” or “Class of 2015”. Phone numbers are never shown."
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input id={id("public-name")} className="flex-1" value={draft.publicName} maxLength={80} onChange={(e) => set("publicName", e.target.value)} />
                {/* Offered only once the name has been changed away from the sender's. */}
                {senderName && draft.publicName.trim() !== titleCase(senderName) && (
                  <Button
                    variant="secondary"
                    className="shrink-0 whitespace-nowrap"
                    icon={<UserRound className="size-4" aria-hidden />}
                    onClick={() => set("publicName", titleCase(senderName))}
                  >
                    Use {titleCase(senderName)}
                  </Button>
                )}
              </div>
            </Field>
          )}
        </div>
      )}

      {kind !== "personal" && kind !== "" && (
        <Field
          label={isSpending ? "What was this for?" : kind === "contribution" || kind === "pledge" ? "Public note" : "Public description"}
          htmlFor={id("description")}
          optional={!isSpending}
          error={fieldError(error, "description")}
          uncertain={descriptionMissing ? "Shown publicly as “Purpose to be confirmed” until you add it. It still counts in the totals." : false}
          hint={!descriptionMissing ? "Shown on the public page." : undefined}
        >
          <Input
            id={id("description")}
            value={draft.description}
            maxLength={500}
            tone={descriptionMissing ? "uncertain" : "normal"}
            placeholder={isSpending ? "e.g. Story books for lower primary" : undefined}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
      )}

      <Field label="Private notes" htmlFor={id("notes")} optional hint="Only visible here in management." error={fieldError(error, "notes")}>
        <Textarea id={id("notes")} rows={2} value={draft.notes} maxLength={4000} onChange={(e) => set("notes", e.target.value)} />
      </Field>
    </div>
  );
}
