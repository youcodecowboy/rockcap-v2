// src/lib/structure/fixtures/birkettHall.ts
import type { StructureGraph } from "../types";

export const birkettHallGraph: StructureGraph = {
  subjectClientId: "kn78czrp5pdw17cs86aneexsss85ap0w",
  asOf: "2026-05-30",
  nodes: [
    { id: "paul-thompson", kind: "person", name: "Paul Thompson" },
    { id: "mark-bedding", kind: "person", name: "Mark Bedding" },
    { id: "16115992", kind: "company", name: "Birkett Hall Homes Ltd", ref: "16115992", status: "active", role: "sponsor-holding" },
    { id: "15751971", kind: "company", name: "Birkett Hall Developments Ltd", ref: "15751971", status: "active", role: "landholder", meta: { charges: 3 } },
    { id: "17131507", kind: "company", name: "Woodham45 Ltd", ref: "17131507", status: "active", role: "borrower", meta: { charges: 0 } },
    { id: "10818893", kind: "company", name: "Bocking Homes Ltd", ref: "10818893", status: "active", role: "jv-partner" },
    { id: "15077959", kind: "company", name: "D2P Billericay Ltd", ref: "15077959", status: "active", role: "former-employer" },
  ],
  edges: [
    { from: "paul-thompson", to: "16115992", relation: "psc", detail: "25–50%", evidence: { source: "CH PSC", url: "https://find-and-update.company-information.service.gov.uk/company/16115992/persons-with-significant-control" }, confidence: "hard", flags: ["band-only"] },
    { from: "mark-bedding", to: "16115992", relation: "psc", detail: "25–50%", evidence: { source: "CH PSC" }, confidence: "hard", flags: ["band-only"] },
    { from: "16115992", to: "17131507", relation: "psc", detail: "75%+", evidence: { source: "CH PSC", url: "https://find-and-update.company-information.service.gov.uk/company/17131507/persons-with-significant-control" }, confidence: "hard" },
    { from: "16115992", to: "15751971", relation: "psc", detail: "25–50%", evidence: { source: "CH PSC" }, confidence: "hard", flags: ["band-only"] },
    { from: "10818893", to: "15751971", relation: "psc", detail: "25–50%", evidence: { source: "CH PSC" }, confidence: "hard", flags: ["band-only"] },
    { from: "paul-thompson", to: "15077959", relation: "directs", detail: "director, resigned 2024", evidence: { source: "CH officer appointments" }, confidence: "hard", flags: ["director-not-owner"] },
  ],
  verdict: { structureConfidence: "low", rationale: "", openQuestions: [] },
};
