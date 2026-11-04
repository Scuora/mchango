// Safaricom's M-PESA customer charges, to suggest a transaction cost when a
// payment out is entered by hand. From the M-PESA Consumer Tariffs page as
// updated on 4 August 2026 (excise duty included). Only a suggestion: the
// M-Pesa confirmation message shows the actual cost, and a pasted message
// fills it in exactly.

/** How the money left M-Pesa. */
export type PaidBy = "send" | "paybill" | "till" | "withdraw";

// [highest amount in the band (KES), charge (KES)], in order.
const SEND_MONEY: [number, number][] = [
  [100, 0],
  [500, 7],
  [1_000, 13],
  [1_500, 23],
  [2_500, 33],
  [3_500, 53],
  [5_000, 57],
  [7_500, 78],
  [10_000, 90],
  [15_000, 100],
  [20_000, 105],
  [250_000, 108],
];

// Agent withdrawals start at KES 50.
const AGENT_WITHDRAWAL: [number, number][] = [
  [100, 11],
  [2_500, 29],
  [3_500, 52],
  [5_000, 69],
  [7_500, 87],
  [10_000, 115],
  [15_000, 167],
  [20_000, 185],
  [35_000, 197],
  [50_000, 278],
  [250_000, 309],
];

export const TARIFF_DATE = "4 August 2026";

/**
 * The usual charge, in minor units, for paying `amountMinor` out of M-Pesa this way.
 * Null when it cannot be known: Pay Bill charges depend on the business, and
 * amounts outside M-Pesa's limits have no charge to suggest.
 */
export function suggestedCost(amountMinor: number, by: PaidBy): number | null {
  const shillings = amountMinor / 100;
  if (by === "till") return 0; // Buy Goods is free for the customer.
  if (by === "paybill") return null;
  if (shillings < (by === "withdraw" ? 50 : 1)) return null;
  const band = (by === "send" ? SEND_MONEY : AGENT_WITHDRAWAL).find(([max]) => shillings <= max);
  return band ? band[1] * 100 : null;
}

/** The likely way it was paid, from a pasted M-Pesa message's format. */
export function paidByFromFormat(format: string | null | undefined): PaidBy | null {
  if (format === "sent") return "send";
  if (format === "pay_bill") return "paybill";
  if (format === "buy_goods") return "till";
  if (format === "withdrawal") return "withdraw";
  return null;
}
