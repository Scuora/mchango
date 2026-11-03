// Who did what to a record, and what changed: shown on a record's page and on
// the Activity page.

import { History } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { formatNairobi } from "@/lib/time";
import type { ChangeDetails, ChangeEntry } from "@/lib/types";

const FIELD_LABELS: Record<string, string> = {
  public_name: "Public name",
  description: "Description",
  notes: "Private notes",
  pledged_by: "Pledged by",
};

const shown = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (value === "family") return "the family";
  if (value === "friends") return "friends and well-wishers";
  return String(value);
};

/** The fields a change altered, before → after. */
export function changedFields(details: ChangeDetails | null): { field: string; before: string; after: string }[] {
  if (!details) return [];
  if (Array.isArray(details.changes)) return details.changes;
  if (details.before && details.after) {
    return Object.keys(FIELD_LABELS)
      .filter((key) => key in details.after! && JSON.stringify(details.before![key] ?? null) !== JSON.stringify(details.after![key] ?? null))
      .map((key) => ({ field: FIELD_LABELS[key], before: shown(details.before![key]), after: shown(details.after![key]) }));
  }
  return [];
}

export function ChangeDiff({ details }: { details: ChangeDetails | null }) {
  const fields = changedFields(details);
  if (fields.length === 0) return null;
  return (
    <dl className="mt-1 space-y-0.5 rounded-md bg-stone-50 px-2.5 py-1.5 text-[13px]">
      {fields.map((f, i) => (
        <div key={i} className="flex flex-wrap gap-x-1.5">
          <dt className="font-medium text-stone-600 first-letter:uppercase">{f.field}:</dt>
          <dd className="break-words text-stone-800">
            <span className="text-stone-500 line-through decoration-stone-300">{f.before}</span> → {f.after}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Who did it: a username, or the app itself. */
export const actorName = (actor: string | null) => actor ?? "system";

export function ChangeList({ entries }: { entries: ChangeEntry[] }) {
  if (entries.length === 0) return <EmptyState icon={<History className="size-6" />} title="No changes yet" />;
  return (
    <ol className="space-y-3 text-sm">
      {entries.map((h) => (
        <li key={h.id}>
          <p className="text-stone-800">{h.summary}</p>
          <ChangeDiff details={h.details} />
          {h.reason && <p className="mt-0.5 text-stone-600">Reason: {h.reason}</p>}
          <p className="text-xs text-stone-500">
            {formatNairobi(h.at)} · by <span className="font-medium text-stone-700">{actorName(h.actor)}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}
