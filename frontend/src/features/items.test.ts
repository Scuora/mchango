import { describe, expect, it } from "vitest";
import { billStatus } from "./bills";
import { buildItems } from "./items";

describe("itemised payments out", () => {
  it("must add up to the payment and say what each thing was", () => {
    const rows = [
      { description: "Shoes", amount: "4,000" },
      { description: "Clothing", amount: "6,000" },
    ];
    expect(buildItems(rows, 1_000_000)).toEqual({
      items: [
        { description: "Shoes", amount_minor: 400_000 },
        { description: "Clothing", amount_minor: 600_000 },
      ],
    });
    expect(buildItems(rows, 1_200_000)).toHaveProperty("error");
    expect(buildItems([{ description: "", amount: "4,000" }, rows[1]], 1_000_000)).toHaveProperty("error");
    expect(buildItems([rows[0]], 400_000)).toHaveProperty("error");
  });
});

describe("bills", () => {
  it("are paid in parts until fully paid", () => {
    expect(billStatus(1000, 0)).toBe("not_paid");
    expect(billStatus(1000, 400)).toBe("part_paid");
    expect(billStatus(1000, 1000)).toBe("fully_paid");
    expect(billStatus(1000, 1200)).toBe("overpaid");
  });
});
