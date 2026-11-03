import { describe, expect, it } from "vitest";
import { buildShares, splitEqually } from "./shares";

describe("sharing a payment", () => {
  it("splits equally in whole shillings, and always adds up", () => {
    expect(splitEqually(1_000_00, 5)).toEqual([200_00, 200_00, 200_00, 200_00, 200_00]);
    expect(splitEqually(1_000_00, 3)).toEqual([334_00, 333_00, 333_00]);
    expect(splitEqually(100_50, 2)).toEqual([50_25, 50_25]);
  });

  it("takes an amount against each name, and refuses parts that do not add up", () => {
    const rows = [
      { name: "Samuel Mashanga", amount: "500" },
      { name: "", amount: "300" },
    ];
    expect(buildShares(rows, 800_00)).toEqual({ shares: [{ public_name: "Samuel Mashanga", amount_minor: 500_00 }, { public_name: null, amount_minor: 300_00 }] });
    expect(buildShares(rows, 1_000_00)).toEqual({ error: "The shares add up to KES 800, but the payment is KES 1,000." });
  });
});
