import {
  sizeBandFromLoanAmount,
  inferSector,
  buildAnonymisedHeadline,
  bucketProjectStatus,
  computePortfolioStats,
  DEAL_SECTORS,
} from "../../convex/lib/dealBook";

describe("sizeBandFromLoanAmount", () => {
  it("returns undisclosed for missing/zero", () => {
    expect(sizeBandFromLoanAmount(undefined)).toBe("undisclosed");
    expect(sizeBandFromLoanAmount(0)).toBe("undisclosed");
  });
  it("bands by millions", () => {
    expect(sizeBandFromLoanAmount(3_000_000)).toBe("sub-£5m");
    expect(sizeBandFromLoanAmount(7_500_000)).toBe("£5–10m");
    expect(sizeBandFromLoanAmount(20_000_000)).toBe("£10–25m");
    expect(sizeBandFromLoanAmount(40_000_000)).toBe("£25–50m");
    expect(sizeBandFromLoanAmount(80_000_000)).toBe("£50–100m");
    expect(sizeBandFromLoanAmount(150_000_000)).toBe("£100m+");
  });
});

describe("inferSector", () => {
  it("matches keywords case-insensitively", () => {
    expect(inferSector("Purpose Built Student accommodation")).toBe("student_pbsa");
    expect(inferSector("A Build-to-Rent tower")).toBe("btr_rental");
    expect(inferSector("logistics warehouse")).toBe("industrial_logistics");
  });
  it("returns null when nothing matches", () => {
    expect(inferSector("")).toBeNull();
    expect(inferSector("misc project")).toBeNull();
  });
  it("only returns canonical sectors", () => {
    const s = inferSector("residential houses");
    expect(DEAL_SECTORS).toContain(s);
  });
});

describe("buildAnonymisedHeadline", () => {
  it("uses region phrasing when region present", () => {
    expect(buildAnonymisedHeadline({ sector: "btr_rental", region: "North West" }))
      .toBe("we've arranged funding on a couple of BTR/rental schemes in the North West");
  });
  it("falls back to type-only phrasing without region", () => {
    expect(buildAnonymisedHeadline({ sector: "student_pbsa" }))
      .toBe("we've done a couple of similar student schemes");
  });
  it("never contains a borrower/client placeholder", () => {
    const h = buildAnonymisedHeadline({ sector: "residential", region: "London" });
    expect(h).not.toMatch(/\[CLIENT\]|borrower/i);
  });
});

describe("bucketProjectStatus", () => {
  it("maps lifecycle to buckets", () => {
    expect(bucketProjectStatus("active")).toBe("open");
    expect(bucketProjectStatus("on-hold")).toBe("open");
    expect(bucketProjectStatus("completed")).toBe("closed");
    expect(bucketProjectStatus("cancelled")).toBe("lost");
    expect(bucketProjectStatus("inactive")).toBeNull();
    expect(bucketProjectStatus(undefined)).toBeNull();
  });
});

describe("computePortfolioStats", () => {
  const now = "2026-06-10T00:00:00.000Z";
  it("aggregates counts, values, and closed windows", () => {
    const projects = [
      { status: "active", loanAmount: 10_000_000, endDate: null },
      { status: "active", loanAmount: 5_000_000, endDate: null },
      { status: "completed", loanAmount: 20_000_000, endDate: "2026-06-01T00:00:00.000Z" },
      { status: "completed", loanAmount: 30_000_000, endDate: "2026-01-01T00:00:00.000Z" },
      { status: "completed", loanAmount: 1_000_000, endDate: "2024-01-01T00:00:00.000Z" },
      { status: "cancelled", loanAmount: 9_000_000, endDate: null },
      { status: "inactive", loanAmount: 999, endDate: null },
    ];
    const s = computePortfolioStats(projects, now);
    expect(s.open).toEqual({ count: 2, value: 15_000_000 });
    expect(s.closed).toEqual({ count: 3, value: 51_000_000 });
    expect(s.lost).toEqual({ count: 1 });
    expect(s.closedByWindow.d30).toBe(1);
    expect(s.closedByWindow.d90).toBe(1);
    expect(s.closedByWindow.d180).toBe(2);
    expect(s.closedByWindow.d365).toBe(2);
  });
});
