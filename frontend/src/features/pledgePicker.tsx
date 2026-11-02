// Choosing the pledge a contribution fulfils by name, not record number. When
// the sender's name matches a pledge that is still open, it is offered.

import { Link2 } from "lucide-react";
import { Choice } from "@/components/ui/pickers";
import { useResource } from "@/lib/api";
import { formatKesShort } from "@/lib/money";
import type { ManagedPledge } from "@/lib/types";

const words = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 1);

export function pledgeName(p: ManagedPledge): string {
  return p.public_name ?? "Anonymous pledge";
}

/** Every word of the pledge's name appears in the sender's name. */
function sameName(p: ManagedPledge, sender: string): boolean {
  const name = words(p.public_name ?? "");
  const from = new Set(words(sender));
  return name.length > 0 && name.every((w) => from.has(w));
}

export function PledgePicker({ id, value, onChange, senderName }: { id: string; value: string; onChange: (id: string) => void; senderName?: string }) {
  const pledges = useResource<ManagedPledge[]>("/api/manage/pledges");
  const list = pledges.data ?? [];
  const open = list.filter((p) => p.status !== "received" || String(p.id) === value);
  const options = open.map((p) => ({
    value: String(p.id),
    label: `${pledgeName(p)} (${p.pledged_by === "family" ? "family" : "friend"}) · ${formatKesShort(p.received_minor)} of ${formatKesShort(p.amount_minor)} received`,
  }));
  const suggestion = !value && senderName ? open.find((p) => sameName(p, senderName)) : undefined;
  return (
    <div className="space-y-2">
      <Choice
        id={id}
        value={value}
        options={options}
        onChange={onChange}
        clearable
        disabled={options.length === 0 && !value}
        placeholder={pledges.loading ? "Loading pledges…" : options.length ? "Not for a pledge" : "No open pledges"}
      />
      {suggestion && (
        <button
          type="button"
          onClick={() => onChange(String(suggestion.id))}
          className="press flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg bg-ochre-50 px-3 text-left text-[15px] text-ochre-900 hover:bg-ochre-100"
        >
          <Link2 className="size-4 shrink-0" aria-hidden />
          <span>
            {pledgeName(suggestion)} pledged {formatKesShort(suggestion.amount_minor)}. <strong className="font-semibold">Link this payment to it</strong>
          </span>
        </button>
      )}
    </div>
  );
}
