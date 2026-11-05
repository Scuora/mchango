import { describe, expect, it } from "vitest";
import { familyOf } from "./goal";

describe("familyOf", () => {
  it("names the family without the title or given name", () => {
    expect(familyOf("Dr. Joseph Karisa Gonzi")).toBe("the family of Karisa Gonzi");
    expect(familyOf("Joseph Karisa Gonzi", "sw")).toBe("familia ya Karisa Gonzi");
  });
});

