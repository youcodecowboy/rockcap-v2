import { describe, it, expect } from "vitest";
import { classifyLenderTier } from "../../convex/lib/lenderTiers";

describe("classifyLenderTier", () => {
  it("parks on a Tier 1 lender despite suffix variance", () => {
    expect(classifyLenderTier(["Quantum Development Finance LTD", "Paragon Development Finance Limited"]).action).toBe("park");
  });
  it("softens on a Tier 2 lender", () => {
    expect(classifyLenderTier(["Yellow Tree"]).action).toBe("soften");
  });
  it("park takes precedence over soften", () => {
    expect(classifyLenderTier(["Yellow Tree", "Quantum Development Finance"]).action).toBe("park");
  });
  it("none when no protected lender present", () => {
    const r = classifyLenderTier(["Investec Bank PLC", "Paragon Development Finance Limited"]);
    expect(r.action).toBe("none");
    expect(r.tier1).toEqual([]);
  });
});
