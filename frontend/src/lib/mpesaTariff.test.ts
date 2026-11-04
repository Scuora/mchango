import { describe, expect, it } from "vitest";
import { suggestedCost } from "./mpesaTariff";

const kes = (n: number) => n * 100;

describe("M-Pesa tariff", () => {
  it("suggests Safaricom's charge at the edges of each band", () => {
    expect(suggestedCost(kes(100), "send")).toBe(0);
    expect(suggestedCost(kes(101), "send")).toBe(kes(7));
    expect(suggestedCost(kes(3_500), "send")).toBe(kes(53));
    expect(suggestedCost(kes(5_000), "send")).toBe(kes(57));
    expect(suggestedCost(kes(250_000), "send")).toBe(kes(108));
    expect(suggestedCost(kes(5_000), "withdraw")).toBe(kes(69));
    expect(suggestedCost(kes(40), "withdraw")).toBeNull(); // agents start at KES 50
    expect(suggestedCost(kes(12_000), "till")).toBe(0);
    expect(suggestedCost(kes(12_000), "paybill")).toBeNull(); // depends on the business
    expect(suggestedCost(kes(250_001), "send")).toBeNull();
  });
});
