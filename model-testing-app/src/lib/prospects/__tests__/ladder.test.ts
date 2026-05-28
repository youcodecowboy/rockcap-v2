import { describe, it, expect } from "vitest";
import { rungFor, RUNGS, PROSPECT_RUNGS } from "../ladder";

describe("rungFor", () => {
  it("maps researched to the Researched rung", () => {
    expect(rungFor("researched")).toEqual({ key: "researched", label: "Researched", order: 1 });
  });
  it("relabels engaged as Meeting booked", () => {
    expect(rungFor("engaged").label).toBe("Meeting booked");
  });
  it("treats needs_revision as Drafted (revision is a flag, not a rung)", () => {
    expect(rungFor("needs_revision").key).toBe("drafted");
  });
  it("relabels active as Outreach active", () => {
    expect(rungFor("active").label).toBe("Outreach active");
  });
  it("returns null for an unset state (belongs to New tab, not a rung)", () => {
    expect(rungFor(undefined)).toBeNull();
  });
  it("orders the active prospect rungs researched→drafted→active→replied→engaged", () => {
    const ordered = PROSPECT_RUNGS.map((r) => r.key);
    expect(ordered).toEqual(["researched", "drafted", "active", "replied", "engaged"]);
  });
});
