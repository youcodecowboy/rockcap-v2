import { describe, it, expect } from "vitest";
import { normalizeTranche, statusFromDocDescriptor } from "./facilities";

// Pure-part coverage for the 2026-07 lender-DB hardening: the tranche enum
// (which collapses free-text quote-revision descriptors onto ONE facility) and
// the document-descriptor → lifecycle-status mapping.

describe("normalizeTranche — closed enum", () => {
  it("accepts the four canonical enum values", () => {
    expect(normalizeTranche("senior")).toBe("senior");
    expect(normalizeTranche("mezzanine")).toBe("mezzanine");
    expect(normalizeTranche("bridge")).toBe("bridge");
    expect(normalizeTranche("equity")).toBe("equity");
  });

  it("maps the two accepted spelling aliases", () => {
    expect(normalizeTranche("mezz")).toBe("mezzanine");
    expect(normalizeTranche("bridging")).toBe("bridge");
  });

  it("is case-insensitive and trims/collapses whitespace-only input", () => {
    expect(normalizeTranche("  SENIOR ")).toBe("senior");
    expect(normalizeTranche("Mezz")).toBe("mezzanine");
    expect(normalizeTranche("")).toBeUndefined();
    expect(normalizeTranche("   ")).toBeUndefined();
    expect(normalizeTranche(undefined)).toBeUndefined();
  });

  it("collapses free-text quote-revision descriptors to undefined (→ 'single')", () => {
    // These are the exact shapes that used to fragment facilities.
    expect(normalizeTranche("indicative terms 2026-07-02")).toBeUndefined();
    expect(normalizeTranche("0.75% fee variant")).toBeUndefined();
    expect(normalizeTranche("senior debt")).toBeUndefined(); // not an exact enum token
    expect(normalizeTranche("junior")).toBeUndefined();
  });
});

describe("statusFromDocDescriptor — lifecycle mapping", () => {
  it("maps executed-agreement docs to live", () => {
    expect(statusFromDocDescriptor("Facility Agreement")).toBe("live");
    expect(statusFromDocDescriptor("Loan Agreement — signed")).toBe("live");
    expect(statusFromDocDescriptor("Facility Letter")).toBe("live");
    expect(statusFromDocDescriptor("Completion statement")).toBe("live");
  });

  it("maps pre-commitment docs to indicative", () => {
    expect(statusFromDocDescriptor("Term Sheet")).toBe("indicative");
    expect(statusFromDocDescriptor("Heads of Terms")).toBe("indicative");
    expect(statusFromDocDescriptor("HOTs draft")).toBe("indicative");
    expect(statusFromDocDescriptor("DIP")).toBe("indicative");
    expect(statusFromDocDescriptor("Decision in Principle")).toBe("indicative");
    expect(statusFromDocDescriptor("Agreement in Principle")).toBe("indicative");
    expect(statusFromDocDescriptor("Indicative Terms")).toBe("indicative");
    expect(statusFromDocDescriptor("Quote for Woodberry Park")).toBe("indicative");
  });

  it("prefers live over indicative when both signals could match", () => {
    // "facility agreement" must not be mistaken for an indicative facility doc.
    expect(statusFromDocDescriptor("Facility Agreement (final)")).toBe("live");
  });

  it("returns undefined for unrecognised descriptors", () => {
    expect(statusFromDocDescriptor("RedBook Valuation")).toBeUndefined();
    expect(statusFromDocDescriptor("")).toBeUndefined();
    expect(statusFromDocDescriptor("Title Deed")).toBeUndefined();
  });
});
