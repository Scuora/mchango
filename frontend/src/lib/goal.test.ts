import { describe, expect, it } from "vitest";
import { familyOf, goalOf } from "./goal";

describe("familyOf", () => {
  it("names the family without the title or given name", () => {
    expect(familyOf("Dr. Joseph Karisa Gonzi")).toBe("the family of Karisa Gonzi");
    expect(familyOf("Joseph Karisa Gonzi", "sw")).toBe("familia ya Karisa Gonzi");
  });
});

describe("goalOf", () => {
  it("does not count pledges as money until they are received", () => {
    // Target 1,100,000; the family's 570,000; 1,000 received from others; 100,000 pledged by a friend.
    const pledges = {
      family: { count: 1, pledged_minor: 570_000_00, received_minor: 0, outstanding_minor: 570_000_00 },
      friends: { count: 1, pledged_minor: 100_000_00, received_minor: 0, outstanding_minor: 100_000_00 },
    };
    const goal = goalOf(1_100_000_00, pledges, 1_000_00)!;
    expect(goal.stillNeeded).toBe(529_000_00);
    expect(goal.othersOutstanding).toBe(100_000_00);
  });
});
