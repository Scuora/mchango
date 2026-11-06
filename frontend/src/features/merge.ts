import type { ListItem } from "@/lib/types";

/** A name already on the chosen payments that the merged entry can take. */
export interface NameChoice {
  name: string;
  payments: number;
  total_minor: number;
}

/** How a chosen row counts: a merged entry brings every payment in it. */
export function mergeWeight(item: ListItem): { payments: number; total_minor: number } {
  return item.group && item.group.count > 1
    ? { payments: item.group.count, total_minor: item.group.total_minor }
    : { payments: 1, total_minor: item.amount_minor };
}

/**
 * The public names on the chosen payments, each once, in the order chosen (a
 * merged entry offers its own name). M-Pesa names are left out: they are for
 * the family committee only. `named` is the name of the first merged entry
 * chosen, else the first name, so merging into an entry keeps its name.
 */
export function nameChoices(chosen: ListItem[]): { names: NameChoice[]; anonymous: number; named: string | null } {
  const names = new Map<string, NameChoice>();
  let anonymous = 0;
  let fromEntry: string | null = null;
  for (const item of chosen) {
    const name = (item.group ? item.group.public_name : item.public_name)?.trim() || null;
    const { payments, total_minor } = mergeWeight(item);
    if (!name) {
      anonymous += payments;
      continue;
    }
    if (item.group && fromEntry === null) fromEntry = name;
    const seen = names.get(name);
    if (seen) {
      seen.payments += payments;
      seen.total_minor += total_minor;
    } else {
      names.set(name, { name, payments, total_minor });
    }
  }
  const list = [...names.values()];
  return { names: list, anonymous, named: fromEntry ?? list[0]?.name ?? null };
}
