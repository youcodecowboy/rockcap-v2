// src/lib/structure/stressTest.ts
import type { StructureGraph, StructureVerdict } from "./types";

export function gradeStructure(graph: StructureGraph): StructureVerdict {
  const openQuestions: string[] = [];
  const borrower = graph.nodes.find((n) => n.role === "borrower");
  if (!borrower) {
    return {
      structureConfidence: "low",
      rationale: "Borrower entity not identified in the structure.",
      openQuestions: ["Identify the legal borrower SPV (walk controllers' appointments + scheme-name search)."],
    };
  }

  const ownEdges = graph.edges.filter((e) => e.to === borrower.id && (e.relation === "owns" || e.relation === "psc"));
  const softOwn = ownEdges.some((e) => e.confidence === "soft" || (e.flags ?? []).includes("band-only"));
  const hasUnverified = graph.nodes.some((n) => n.role === "unknown") || graph.edges.some((e) => (e.flags ?? []).includes("unverified"));
  const directorNotOwner = graph.edges.filter((e) => (e.flags ?? []).includes("director-not-owner"));
  const brandNotBorrower = graph.edges.some((e) => (e.flags ?? []).includes("brand-not-borrower"));

  if (brandNotBorrower) openQuestions.push("Confirm the legal borrower vs the brand named in the documents.");
  for (const e of directorNotOwner) {
    const n = graph.nodes.find((x) => x.id === e.to);
    openQuestions.push(`Do not credit ${n?.name ?? e.to} as the sponsor's own scheme — directed, not owned.`);
  }
  const jv = graph.nodes.find((n) => n.role === "jv-partner");
  if (jv) openQuestions.push(`Confirm whether ${jv.name} (JV partner) participates in the development phase.`);

  let structureConfidence: StructureVerdict["structureConfidence"];
  if (hasUnverified) structureConfidence = "low";
  else if (softOwn || directorNotOwner.length > 0 || brandNotBorrower) structureConfidence = "medium";
  else structureConfidence = "high";

  const rationale =
    structureConfidence === "high"
      ? "Borrower and ownership chain are all filed declarations; no unresolved structural questions."
      : structureConfidence === "medium"
        ? "Some ownership is band-only/inferred or there are directorships that are not ownership; resolve the open questions before relying on the structure."
        : "The structure may be incomplete (an unconfirmed or unidentified entity); re-search before relying on it.";

  return { structureConfidence, rationale, openQuestions };
}
