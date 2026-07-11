# Knowledge cutover — retire old knowledge bank, GraphRAG everywhere

**Started:** 2026-07-11
**Branch:** `knowledge-cutover` (based on `coverage-audit`)
**Context:** Audit (2026-07-11 session) confirmed three generations of the old
knowledge system (knowledgeBankEntries, clientIntelligence/projectIntelligence
+ intelMarkdown, knowledgeItems) all still live alongside the new atoms/GraphRAG
layer. New system intake is documents-only (Drive + harness lanes); v4 uploads,
notes, meetings, emails never atomize. Chat is retired entirely (out of scope).

## Phase 1 — close the intake gaps (this PR)

- [x] Upload paths emit `ingestionEvents` (source "upload") + schedule prose
      chunking on filing — shared `knowledge/ingestUpload.ts` helper called
      from documents.create + bulkUpload.fileItem/fileBatch (the paths that
      persist textContent; uploadFileAndCreateDocument stores none, and
      copies + AI-generated docs are deliberately excluded).
- [x] Drive lane schedules `chunkDocument` from `applyExtraction`.
- [x] Cost wall: API lane atomizes FIRST-TIME docs for knowledge-enabled
      clients (clientHasAtoms); never-onboarded clients stay harness-only.
- [x] Notes atomization: "note" observation sourceType + noteId provenance +
      by_note index; reatomizeCore extracted (document|note anchor) +
      reatomizeNoteDiff; noteAtomizer action (5-min debounce,
      checksum-idempotent, cost-walled; project-only notes resolve owner via
      clientRoles); /api/knowledge/atomize accepts noteId payloads;
      tipTapDocToPlainText added.
- [x] project.getDeepContext gets `graph` + summary.graphAtoms
      (projectGraphSection in graphQueries — subject atoms + by_project scope
      + top-10 federated edges + facilities by_project).
- [x] MCP doc-gen tool descriptions (+ CATALOGUE.md rows) mandate the
      multi-hop knowledge gather before composing.
- [x] Chat bubble removed from desktop layout (chat feature retired).
- [x] Convex pushed (`--typecheck=disable` — HEAD already carries 82 tsc
      errors incl. pre-existing facilities.ts:753 project.clientId bug);
      `npx next build` passes.
- [ ] Commit + push + PR.

## Phase 2 — repoint readers (next PR)

- [ ] Profile Intelligence tabs (desktop + m- + native) → atoms-backed panel.
- [ ] Project page graph entry point (KnowledgeGraphDrawer).
- [ ] Skills that read getClientIntelligence/knowledgeItems → atoms/graph tools.

## Phase 3 — retire old system (final PR)

- [ ] Stop dual-writes: knowledgeBankEntries writes in documents.create /
      driveHydration / directUpload / bulkUpload / harnessClassify;
      intelligence-extract legacy updateClientIntelligence write.
- [ ] Migrate valuable knowledgeItems → atoms; then remove intelligence_* +
      knowledgeBank MCP/chat tools, KnowledgeBankView, ConsolidationModal,
      GlobalSearch knowledgeBankEntries source; update skills + CATALOGUE.md.
- [ ] Keep: operator contextMarkdown lane; intelMarkdown as report artifact.

## Log

- 2026-07-11: audit complete (4 parallel sweeps); plan approved; chat declared
  retired — bubble removal folded into Phase 1.
