// src/__tests__/structureGrade.test.ts
import { describe, it, expect } from "vitest";
import { gradeStructure } from "../lib/structure/stressTest";
import type { StructureGraph } from "../lib/structure/types";
import { birkettHallGraph } from "../lib/structure/fixtures/birkettHall";

const base = (over: Partial<StructureGraph> = {}): StructureGraph => ({
  subjectClientId: "c1", asOf: "2026-05-30", nodes: [], edges: [],
  verdict: { structureConfidence: "low", rationale: "", openQuestions: [] }, ...over,
});

describe("gradeStructure", () => {
  it("returns low when no borrower node is present", () => {
    const v = gradeStructure(base({ nodes: [{ id: "x", kind: "company", name: "X", role: "sponsor-holding" }] }));
    expect(v.structureConfidence).toBe("low");
    expect(v.openQuestions.join(" ")).toMatch(/borrower/i);
  });

  it("returns high when borrower ownership is all hard and unflagged", () => {
    const v = gradeStructure(base({
      nodes: [
        { id: "b", kind: "company", name: "B", role: "borrower" },
        { id: "h", kind: "company", name: "H", role: "sponsor-holding" },
      ],
      edges: [{ from: "h", to: "b", relation: "psc", detail: "75%+", evidence: { source: "CH" }, confidence: "hard" }],
    }));
    expect(v.structureConfidence).toBe("high");
  });

  it("returns medium when a director-not-owner edge is present", () => {
    const v = gradeStructure(base({
      nodes: [
        { id: "b", kind: "company", name: "B", role: "borrower" },
        { id: "x", kind: "company", name: "X", role: "former-employer" },
      ],
      edges: [
        { from: "h", to: "b", relation: "psc", detail: "75%+", evidence: { source: "CH" }, confidence: "hard" },
        { from: "p", to: "x", relation: "directs", evidence: { source: "CH" }, confidence: "hard", flags: ["director-not-owner"] },
      ],
    }));
    expect(v.structureConfidence).toBe("medium");
    expect(v.openQuestions.some((q) => /directed, not owned/i.test(q))).toBe(true);
  });

  it("returns low when an unverified candidate node exists", () => {
    const v = gradeStructure(base({
      nodes: [
        { id: "b", kind: "company", name: "B", role: "borrower" },
        { id: "u", kind: "company", name: "Maybe SPV", role: "unknown" },
      ],
      edges: [{ from: "h", to: "b", relation: "psc", evidence: { source: "CH" }, confidence: "hard" }],
    }));
    expect(v.structureConfidence).toBe("low");
  });

  it("grades the Birkett Hall fixture as medium with a JV open question", () => {
    const v = gradeStructure(birkettHallGraph);
    expect(v.structureConfidence).toBe("medium");
    expect(v.openQuestions.some((q) => /Bocking/i.test(q))).toBe(true);
  });
});
