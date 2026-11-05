// Where a bill stands: nothing paid, part paid, fully paid, or more paid than the
// bill (the bill or a payment may be wrong). Internal bookkeeping only: the public
// site shows money paid, never what is still owed.

import { CheckCircle2, CircleDashed, CircleDot, TriangleAlert } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/misc";
import { Choice } from "@/components/ui/pickers";
import { useResource } from "@/lib/api";
import { formatKesShort } from "@/lib/money";
import type { BillStatus, BillsResponse } from "@/lib/types";

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  not_paid: "Not paid",
  part_paid: "Part paid",
  fully_paid: "Fully paid",
  overpaid: "Paid more than the bill",
};

const tones: Record<BillStatus, Tone> = { not_paid: "neutral", part_paid: "warning", fully_paid: "success", overpaid: "danger" };

export function billStatus(total: number, paid: number): BillStatus {
  if (paid === 0) return "not_paid";
  if (paid < total) return "part_paid";
  return paid === total ? "fully_paid" : "overpaid";
}

export function BillStatusBadge({ status }: { status: BillStatus }) {
  const Icon = { not_paid: CircleDashed, part_paid: CircleDot, fully_paid: CheckCircle2, overpaid: TriangleAlert }[status];
  return (
    <Badge tone={tones[status]}>
      <Icon className="size-3.5" aria-hidden />
      {BILL_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Choosing the bill a payment out goes towards, by what it is for, not record number. */
export function BillPicker({ id, value, onChange }: { id: string; value: string; onChange: (id: string) => void }) {
  const bills = useResource<BillsResponse>("/api/manage/bills");
  const open = (bills.data?.bills ?? []).filter((b) => b.status === "not_paid" || b.status === "part_paid" || String(b.id) === value);
  const options = open.map((b) => ({
    value: String(b.id),
    label: `${b.description || `Bill #${b.id}`} · ${formatKesShort(b.paid_minor)} of ${formatKesShort(b.total_minor)} paid`,
  }));
  return (
    <Choice
      id={id}
      value={value}
      options={options}
      onChange={onChange}
      clearable
      disabled={options.length === 0 && !value}
      placeholder={bills.loading ? "Loading bills…" : options.length ? "Not towards a bill" : "No bills waiting for payment"}
    />
  );
}
