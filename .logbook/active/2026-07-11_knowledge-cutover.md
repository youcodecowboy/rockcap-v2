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
- [x] Committed (33645f04, + 91de86cf for the pre-existing coverageAudit
      helpers so api.d.ts stays consistent) and pushed to
      `origin/knowledge-cutover`. PR pending — branch is based on
      `coverage-audit` (3 unmerged commits), so either merge coverage-audit
      first or PR the combined branch.

## Phase 2 — repoint readers (same branch, second commit)

- [x] Desktop client + project "Intelligence" tabs → atoms-backed
      `KnowledgeAtomsTab` (expandEntity + ringAttributes; contested
      adjudication inline via resolveContested; relabelled "Knowledge").
      Beauhurst cards kept above the client tab.
- [x] Project page gets a "Knowledge graph" header button + drawer
      (entryEntityType "project").
- [x] Mobile-web m-clients Client/Project IntelligenceTab rewritten in place
      to atoms (same filenames/props; native mobile app still legacy —
      fold into mobile facelift).
- [x] Meetings + emails atomize: "meeting"/"email" observation sourceTypes,
      `atomizedAt` stamps on meetings/replyEvents, one-shot
      `knowledge/sourceAtomizer` (createAtomsBatch + externalRef anchors,
      tier 2/1 forced), triggers on fireflies insert (60s), meetings.create,
      replyEvents.createInternal; roster/route call factored into
      `knowledge/rosterAssembly.ts` (noteAtomizer refactored onto it);
      atomize route accepts `sourceRef`.
- [x] skills/CONVENTIONS.md: graph-first read chain codified (§5); legacy
      writes marked no-new-writes (§2).
- [x] Per-skill SKILL.md read repointing — 15 files (9 skills + 6 sub-skills)
      lead with getDeepContext graph section → atoms.search → graph.*;
      legacy reads demoted to not-yet-atomized fallback; writes untouched
      (Phase 3). Skips were write-only references (meeting-capture,
      deal-intake, terms-comparison, info-request-grader, monitoring-watcher,
      deal-triage, client-context-capture, case-study-author, lender-intel).
- [ ] Native mobile app tabs (mobile-app/) still read knowledgeItems — fold
      into the mobile facelift branch.

## Phase 3 — retire old system (worktree `knowledge-phase3`)

- [x] knowledgeBankEntries writes removed (all 5 automatic writers):
      documents.create, driveHydration.applyExtraction, directUpload,
      bulkUpload fileItem + fileBatch, harnessClassify. Table is read-only
      legacy data now.
- [x] bulkUpload automatic knowledgeItems extraction sections removed (both
      filing paths). Deliberate writes kept: user-note add-to-intelligence
      toggle, intelligence.addKnowledgeItem MCP, document.saveIntelligence
      (retire with the skill write-migration).
- [x] /api/intelligence-extract route DELETED (with its legacy
      updateClientIntelligence dual-write). Its two callers repointed:
      AddIntelligenceModal deleted (no mounts); FileDetailPanel "Analyze"
      now = classify (if text missing) + documents.requestKnowledgeIngestion
      (new mutation → upload knowledge feed); panel Intelligence tab renders
      graphQueries.atomsForDocument (new query — atoms this doc asserted).
- [x] Prospect KnowledgeTab: knowledgeItems facts list → KnowledgeAtomsTab;
      operator contextMarkdown lane kept as designed. Nav count →
      clientAtomTotals.
- [x] Dead desktop UI deleted: IntelligenceTab.tsx, KnowledgeBankView,
      AddKnowledgeEntryModal, ConsolidationModal, ChatAssistantButton/Drawer
      (all had zero importers).
- [x] Global search: knowledgeBankEntries source → atoms (search_statement
      index, live facts, routes to client Knowledge tab / atlas).
- [x] CATALOGUE.md: legacy intelligence_* reads marked DEPRECATED
      (fallback-only), writes marked LEGACY WRITE.
- [x] Kept: operator contextMarkdown lane; intelMarkdown report artifact;
      legacy MCP read tools (skills' not-yet-atomized fallback); knowledge
      checklist feature (separate concern, not a knowledge store).
- [ ] NOT deployed from worktree (Convex dev = prod; lender agent has
      in-flight deploys) — deploy after merge to knowledge-cutover.
- [ ] Deferred to Phase 3b: skill write-migration (addKnowledgeItem /
      updateClientIntelligence / saveIntelligence → atoms), knowledgeItems
      data migration/archive, knowledgeBank.ts + knowledgeLibrary.ts module
      removal, chat library deletion (chatTools/agenticLoop/routes), native
      mobile tabs, aiNotesContext / contextCache KB reads, note-template
      knowledgeBankFields.

## Log

- 2026-07-11: audit complete (4 parallel sweeps); plan approved; chat declared
  retired — bubble removal folded into Phase 1.
- 2026-07-11: Phase 1 + 2 shipped and deployed (see above). Phase 3 executed
  in worktree `knowledge-phase3` (lender agent active in main tree).
