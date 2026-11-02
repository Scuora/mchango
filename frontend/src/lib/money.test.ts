import { describe, expect, it } from "vitest";
import vectors from "../../../docs/money-test-vectors.json";
import { formatKes, parseKes } from "./money";

// The same vectors are checked by the Rust implementation (backend/src/money.rs).
describe("money", () => {
  it("parses and formats exactly like the backend", () => {
    for (const [input, expected] of vectors.valid as [string, number][]) {
      expect(parseKes(input), input).toEqual({ ok: true, minor: expected });
    }
    for (const input of vectors.invalid as string[]) {
      expect(parseKes(input).ok, input).toBe(false);
    }
    for (const [minor, expected] of vectors.format as [number, string][]) {
      expect(formatKes(minor)).toBe(expected);
    }
  });
});
