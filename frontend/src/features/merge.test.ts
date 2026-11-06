import { describe, expect, it } from "vitest";
import type { ListItem } from "@/lib/types";
import { nameChoices } from "./merge";

const payment = (id: number, public_name: string | null, amount_minor: number, group: ListItem["group"] = null) =>
  ({ id, public_name, amount_minor, group }) as ListItem;

describe("choosing the merged entry's name", () => {
  it("offers each public name once, with what it covers, and keeps an existing entry's name", () => {
    const chosen = [
      payment(1, "Mary Wanjiru", 100_000),
      payment(2, null, 50_000),
      payment(3, "Mary Wanjiru", 20_000),
      payment(4, "Mary", 30_000, { id: 9, public_name: "Family of Mary", count: 2, total_minor: 70_000 }),
    ];
    expect(nameChoices(chosen)).toEqual({
      names: [
        { name: "Mary Wanjiru", payments: 2, total_minor: 120_000 },
        { name: "Family of Mary", payments: 2, total_minor: 70_000 },
      ],
      anonymous: 1,
      named: "Family of Mary",
    });
  });

  it("has nothing to offer when every payment is anonymous", () => {
    expect(nameChoices([payment(1, null, 100), payment(2, "  ", 100)])).toEqual({ names: [], anonymous: 2, named: null });
  });
});
