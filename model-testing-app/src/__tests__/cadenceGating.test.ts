import { describe, it, expect } from "vitest";
import { isCadenceFireable } from "../../convex/lib/cadenceGating";

describe("isCadenceFireable", () => {
  it("does NOT fire an unapproved package member (the bug we fixed)", () => {
    expect(isCadenceFireable({ packageId: "p1" })).toBe(false); // undefined status
    expect(isCadenceFireable({ packageId: "p1", packageApprovalStatus: "pending" })).toBe(false);
    expect(isCadenceFireable({ packageId: "p1", packageApprovalStatus: "denied" })).toBe(false);
    expect(isCadenceFireable({ packageId: "p1", packageApprovalStatus: "needs_contact" })).toBe(false);
  });

  it("fires a package member only once the package is approved", () => {
    expect(isCadenceFireable({ packageId: "p1", packageApprovalStatus: "approved" })).toBe(true);
  });

  it("fires a non-package (recurring) cadence with no package gate", () => {
    expect(isCadenceFireable({})).toBe(true);
    expect(isCadenceFireable({ packageApprovalStatus: "approved" })).toBe(true);
  });
});
