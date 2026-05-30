import { describe, it, expect } from "vitest";
import {
  type GroupCharge,
  distinctLenders,
  classifySchemeStatus,
  parseCandidateAddress,
  rankByRecency,
} from "../../convex/lib/schemeGrouping";

const ch = (over: Partial<GroupCharge> = {}): GroupCharge => ({
  companyNumber: "16027708",
  companyName: "LAND AT LEIGHTERTON SPV LTD",
  companyStatus: "active",
  chargeId: "x",
  lender: "Quantum Development Finance LTD",
  date: "2025-04-10",
  status: "outstanding",
  description: "Part of the freehold property to be known as land at poole farm leighterton",
  ...over,
});

describe("distinctLenders", () => {
  it("dedupes and drops empties", () => {
    expect(
      distinctLenders([ch(), ch({ lender: "Quantum Development Finance LTD" }), ch({ lender: "Investec Bank PLC" })]),
    ).toEqual(["Quantum Development Finance LTD", "Investec Bank PLC"]);
  });
});

describe("classifySchemeStatus", () => {
  it("live when an outstanding charge exists on an active company", () => {
    expect(classifySchemeStatus("active", [ch({ status: "outstanding" })])).toBe("live");
  });
  it("past when all charges satisfied", () => {
    expect(classifySchemeStatus("active", [ch({ status: "fully-satisfied" })])).toBe("past");
  });
  it("past when company dissolved even with an outstanding charge", () => {
    expect(classifySchemeStatus("dissolved", [ch({ status: "outstanding" })])).toBe("past");
  });
});

describe("parseCandidateAddress", () => {
  it("strips common charge-particulars prefixes", () => {
    expect(parseCandidateAddress("Part of the freehold property to be known as land at poole farm leighterton"))
      .toBe("land at poole farm leighterton");
  });
  it("returns undefined for empty/charge-jargon-only text", () => {
    expect(parseCandidateAddress("")).toBeUndefined();
    expect(parseCandidateAddress("None")).toBeUndefined();
  });
});

describe("rankByRecency", () => {
  it("orders by lastChargeDate desc", () => {
    const a = { lastChargeDate: "2022-01-01" };
    const b = { lastChargeDate: "2025-10-24" };
    expect(rankByRecency([a, b])).toEqual([b, a]);
  });
});
