# deal-intake

Step 7 of the deal lifecycle. A borrower has provided a meaningful first batch of documents and we need to stand up a deal: **transition the entity from prospect to active client**, **create the project record**, detect what kind of deal it is, seed the right checklist, file the docs to the right places, mine initial intelligence, surface what's missing, and audit V4's classification for misfires before they propagate.

This skill is **the lynchpin moment** in the operator's pipeline. Before deal-intake runs, the entity is "a lead we're chasing." After it runs, the entity is "an active client we're executing on" — with a project, a checklist, intelligence, and a clear list of what's needed next. Everything downstream (terms-package-build, ic-paper-drafter, monitoring-watcher) depends on this skill having produced clean substrate.

**Last hardening:** v1.4 Sprint I (2026-05-25). Hardened against the v1.4 MCP surface (77 tools after Sprint I). Output a v2-template SKILL.md grounded in production data from 3 reference deals (Comberton / Manor Park Refinance / Monksbury Court) + one test-fire dry-run on Monksbury Court.

## Trigger

Invoke when a borrower has just sent a meaningful first batch of documents and the operator wants to stand up a tracked deal. Common invocation paths:

- **Operator says:** "Intake the {Scheme Name} pack from {Borrower Co.}"
- **Operator says:** "Spin up a deal off these documents for {Client}"
- **Operator says:** "Run intake on upload batch {batchId}"
- **Operator says:** "Stand up the Manor Park deal — I've just uploaded the docs"
- **Auto-trigger** (future v1.5): bulkUpload batch landing webhook with `clientId` set → invoke deal-intake automatically

## Inputs

Required (one of):

- `clientId` plus `documentIds[]` — an existing client and a set of just-uploaded documents
- `bulkUploadBatchId` — a batch from the file upload queue
- `clientId` plus `projectId` (existing project) — re-runs intake on an existing project (operator wants to refresh detection / re-audit classifications)

Optional:

- `projectName` — human-readable name; otherwise derived from the appraisal title or scheme address
- `projectShortcode` — 10-character code for document naming; otherwise auto-generated
- `dealTypeHint` — operator override for type detection: `Development | Bridging | Investment Facility`
- `dealPhaseHint` — operator override for phase detection: `indicative_terms | credit_submission | post_credit | monitoring | redemption`

## Dedup

dedupKey: `deal-intake:${clientId}:${md5(sorted(documentIds))}` or `deal-intake:${bulkUploadBatchId}`.

dedupWindowDays: 7. On `status: "duplicate_found"`, surface the prior run's brief and ask the operator whether to re-run (use case: V4 has re-classified some docs; the operator wants a fresh audit). When the operator confirms re-run, pass `forceRerun: true` to skip the dedup check.

## Cadence package

**Does not produce a cadence.** Deal-intake stands up a deal but does not produce ongoing outreach. The next-up cadence (sponsor + project workflow updates) is owned by the post-meeting nurture flow (`cadence-fire` substrate).

## Outputs

Persisted to Convex:

1. **A promotion recommendation (not an auto-promotion).** Promotion to active client is an operator judgment call (`client.activate`), never fired automatically by intake — a prospect can carry a project + docs as a semi-client (`engaged`) until the operator decides. Intake surfaces the recommendation in the brief. See `prospect-pipeline-gates.md` Gate 6.
2. **A `projects` row** with `name`, `projectShortcode`, `clientRoles` linking the borrower. Via `project.create` (Sprint I): auto-generates shortcode, auto-seeds the borrower project-level folder template (8 folders). Returns `projectId`.
3. **Default checklist** (15 items from the standard requirementTemplate) — **`project.create` auto-seeds this** (it schedules the checklist init on creation). For a legacy project missing one, re-seed explicitly via `checklist.initializeForProject`. For Bridging-type deals the skill ALSO seeds bridging-specific items via `checklist.createCustomItem`.
4. **Filed documents** — each input doc classified via V4, linked to checklist items where `matchingDocumentTypes` align (via `checklist.linkDocument`), placed in the right project folder.
5. **`knowledgeItems` rows** for intelligence mined at intake (deal type + phase, scheme address, GDV/TDC/units from appraisal, SPV structure from HoTs/FL, filename-extracted metadata). All via `intelligence.addKnowledgeItem`.
6. **Approval row** for the misclassification audit (`entityType: document_classification_audit`) — operator approves the batch of proposed corrections (now including Check 6 link-opportunities) before any classification fixes are applied (always-ask-operator rule).
7. **Corpus appends** to `skills/corpora/document-classification-corrections.md` for each operator-approved correction.
8. **`tasks` rows** for any RockCap-side follow-ups (e.g., "request missing appraisal" if no Appraisal in the batch), via `task.create`.
9. **The skillRun envelope** via `skillRun.start` (dedup-aware) and `skillRun.complete` (with `linkedClientId`, `linkedProjectId`, `linkedApprovalIds`, `brief`, `gaps`).

## High-level workflow

1. **Validate input.** If `bulkUploadBatchId` was given, list batch items via direct Convex query (no MCP tool yet — substrate gap). If `documentIds[]`, verify each exists via `document.get` per doc. If `clientId + projectId`, this is a re-run — load existing context via `project.getDeepContext`. Either way, load the client via `client.getDeepContext` to check current status.

2. **Recommend promotion — do NOT auto-promote.** Promotion to client is a **pure operator judgment call** (see `prospect-pipeline-gates.md` Gate 6), never automatic. Intake stands up the project and files the docs for the prospect/semi-client (it can stay `engaged` in the prospecting section); then **recommend** in the brief that the operator promote — e.g. "{Client} now has a project + appraisal on file; looks like a live deal — promote to client? (`client.activate`)". Only call `client.activate({clientId})` yourself if the operator explicitly says to.

3. **Resolve or create the project.** Use the appraisal, scheme brief, OR filename extraction (per `references/filename-extraction-patterns.md`) to extract a sensible name + address. Check for existing project under same client (name match or shortcode hint) — if found, switch to update mode (skip creation). Otherwise call `project.create({name, clientId, address?, ...})` (Sprint I). Returns `projectId`. Project status defaults to "active", folder structure auto-seeded.

4. **Reject macOS resource forks.** Per `references/filename-extraction-patterns.md` "Special rule" section: any filename starting with `._` is rejected before V4 runs. Emit `gap: resource_fork_ingested` so the operator sees the noise count.

5. **Pre-classify metadata from filenames.** Per `references/filename-extraction-patterns.md`: tokenise each filename, extract date / scheme / sponsor / lender / plot / unit via the 9 patterns + documentCode convention. Persist via `intelligence.addKnowledgeItem` at standardised fieldPaths.

6. **Wait for V4 classification.** If docs are still `status: pending | processing`, wait up to 60 seconds. After timeout, proceed with whatever's classified; surface `gap: v4_did_not_complete` for the stragglers.

7. **Detect deal type + phase.** Per `references/deal-type-and-phase-detection.md`: score against the detection signals, output `{dealType, dealPhase, confidence, evidence[]}`. Honour operator's `dealTypeHint` / `dealPhaseHint` if provided (skip detection and use the override). Persist via `intelligence.addKnowledgeItem` using the knowledge-item fieldPaths "deal.type", "deal.phase", "deal.detectionConfidence", "deal.detectionEvidence" (fieldPath strings, not tools).

8. **Seed the right checklist.** New projects get the 15-item standard template automatically (`project.create` schedules it). If a project is somehow missing one, re-seed via `checklist.initializeForProject`. For Bridging-type, also seed bridging-specific items via `checklist.createCustomItem`. Auto-link any matching docs via `checklist.linkDocument` (this is a first-pass; the audit at step 9 catches additional link opportunities).

9. **Run the misclassification audit pass.** Per `references/misclassification-audit-playbook.md`: 6 checks (fulfilled-but-mismatched, V4 defeat state, low confidence, inconsistent-with-sibling, corpus cross-reference, link opportunities). **Check 6 (link opportunities) is highest-leverage** — test fire showed it typically dominates the proposed-corrections batch when project is mid-stage. Produce a single `approvals` row (`entityType: document_classification_audit`) with the proposed corrections list. **Do NOT auto-apply.**

10. **Extract SPV structure** if an `Indicative Terms` / `Heads of Terms` / `Facility Letter` doc is in the batch. Per `../../shared-references/spv-structure-canon.md`: run the extraction prompt, persist via `intelligence.addKnowledgeItem` at `borrower.spvStructure`. For Bridging deals with multiple lenders, persist one row per lender with `qualifier` set.

11. **Mine scheme + financial intelligence** from the appraisal (highest-confidence doc): GDV, TDC, equity, unit count, asset class, location, peak debt. Each via `intelligence.addKnowledgeItem` with `sourceType: ai_extraction`, `sourceDocumentId` set to the appraisal doc, `isCanonical: true` when the appraisal states the figure unambiguously, `false` for inferences.

12. **Stage tasks for missing material.** For each "required" checklist item missing at the deal's current `phaseRequired` AND with no candidate doc in batch (Check 6 already auto-proposes links when candidates exist), decide if it's blocking (e.g., no Appraisal at indicative_terms = stage `task.create` "Request appraisal from borrower"; missing Personal Guarantee at indicative_terms = not blocking yet, no task).

13. **Call `skillRun.complete`** with:
    - `status: "complete"` if no audit corrections proposed and all required items linked
    - `status: "complete_with_gaps"` if audit corrections proposed (awaiting approval) OR required items missing OR SPV partial OR detection low-confidence
    - `brief` should lead with the lifecycle headline ("Promoted {Client} from prospect to active client; stood up {Project Name}; type=X, phase=Y"), then summarise audit + intelligence + tasks staged
    - `linkedClientId`, `linkedProjectId`, `linkedApprovalIds: [auditApprovalId]`
    - `gaps`: every flagged item from steps 4, 5 (vocab substitutions), 6 (V4 timeouts), 7 (low confidence), 9 (audit), 10 (SPV partial), 12 (missing required docs without candidates)

## Audit-approval loop (post-skillRun)

After `skillRun.complete`, the operator visits the approvals UI. For each approved correction:
- Apply via Sprint H tool (`document.updateClassification` / `checklist.linkDocument` / `checklist.unlinkDocument`).
- Append corpus entry to `skills/corpora/document-classification-corrections.md` per the format documented there.
- For rejections, append a corpus entry with `appliedStatus: rejected_by_operator` (rejection IS data).

This loop happens AFTER the skill run completes — driven by the approval execution path, not the skill itself.

## Style rules

All `../../CONVENTIONS.md` rules apply. Three that matter most:

- **Don't promote.** Intake stands up a project; it does not close a deal. Default phase is what's detected; never auto-advance.
- **Cite every intelligence write.** Every `knowledgeItems` row has `sourceDocumentId` + `sourceText` so the operator can audit the extraction. Inferences are `isCanonical: false`.
- **Audit-as-proposal, not auto-fix.** Per operator directive (2026-05-25): the skill ALWAYS proposes corrections via an approvals row, never auto-applies. Even high-confidence corrections wait for operator review.

## Tool dependencies

This skill calls these MCP-exposed tools (v1.4):

- `skillRun.start` (with dedup) + `skillRun.complete` (with gaps) — workflow envelope
- `client.getDeepContext` — load client context (step 1)
- `client.activate` (Sprint I) — promote prospect to active client (step 2)
- `project.getDeepContext` — load existing project context when re-running on existing project (step 1)
- `project.create` (Sprint I) — stand up new project with auto-shortcode + folder structure (step 3)
- `document.get` / `document.search` — verify input docs exist; find sibling docs for Check 4 (steps 1 + 9)
- `document.updateClassification` (Sprint H) — apply approved classification corrections (post-audit)
- `document.linkToProject` — re-file docs to the new project folder (step 5)
- `intelligence.addKnowledgeItem` (Sprint G) — persist mined intelligence + extraction metadata (steps 5, 7, 10, 11)
- `checklist.getByProject` — read existing checklist state for re-runs (step 8)
- `checklist.linkDocument` (Sprint H) — link docs to fulfilled requirements (steps 8 + 9 Check 6)
- `checklist.unlinkDocument` (Sprint H) — clear wrong links found in audit (step 9 Check 1)
- `checklist.createCustomItem` — add bridging-specific items when type=Bridging (step 8)
- `approval.create` — stage the audit corrections row (step 9)
- `task.create` (Sprint G) — surface missing-doc follow-ups (step 12)
- `companies.syncCompaniesHouse` — enrich SPV entities with CH numbers (best-effort; step 10)

Tools NOT YET MCP-exposed (skill falls back to gaps):

- xlsx content extraction — needed to mine appraisal financials in step 11 (until exists, mining is partial; flagged as gap)

(Previously listed here and now MCP-exposed: `checklist.initializeForProject` — though `project.create` auto-seeds the checklist anyway — and `bulkUpload.getBatchItems`.)

**Claude Code native tools used:** none required. All data is in Convex; all reads/writes are MCP. (V4 classification is a separate pipeline triggered by upload — deal-intake reads its output, does not invoke it.)

## What goes wrong

1. **V4 classification doesn't complete in time.** Some docs land in the batch with `status: pending | processing`. Skill waits up to 60 seconds then proceeds; unclassified docs surface as `gap: v4_did_not_complete`. Operator can re-run with `forceRerun: true` after V4 catches up.

2. **Detection confidence is LOW.** Type detection or phase detection scoring is tight (top two within 20%) OR doc batch is too thin (<5 docs). Skill stands up the project shell with placeholder type/phase, flags `gap: detection_low_confidence`, asks operator to set manually via `dealTypeHint` / `dealPhaseHint` on a re-run.

3. **The scheme already has a project.** Detected by name + client + shortcode overlap. Skill switches to update mode, layering new docs and intelligence onto the existing project rather than creating a duplicate. Returns a brief noting "updated existing project X" not "created new project."

4. **Mixed asset classes in one upload.** Batch contains docs from two unrelated schemes (e.g., portfolio appraisal mixed with a single-scheme intake). Skill stops at step 1, surfaces `gap: mixed_asset_classes`, asks the operator to split the batch and re-run.

5. **Sponsor inferred from docs differs from clientRoles.** Docs reference a different entity than the existing client. Skill flags `gap: sponsor_mismatch` for operator review (may indicate wrong client selected, OR a new SPV that should become its own client row).

6. **No appraisal in the batch.** The skill cannot mine scheme financials. Skill stands up the project shell, populates what it can from filename extraction, stages `task.create` "Request appraisal from borrower," flags `gap: appraisal_missing`.

7. **SPV extraction returns partial.** The HoTs / FL doc is too thin to fill all 6 slots. Skill captures what it can, flags `gap: spv_structure_partial`.

8. **Audit produces zero corrections.** No misclassifications detected (V4 did clean work). Skill skips step 8's approvals row, sets `status: "complete"`.

9. **macOS resource forks in batch.** Sprint I added a server-side filter in the bulk-upload pipeline that rejects `._*` files at upload time. The skill's step 4 resource-fork check is now defence-in-depth — should be a no-op for new uploads but still rejects any historical `._*` docs that slipped through before the filter landed. If the rejection count is unusually high (>10), the operator should be alerted via the brief — likely the borrower drag-dropped from a Mac with hidden files visible.

## References

Loaded on demand during the workflow:

- `references/document-vocabulary-catalogue.md` — the 3-level taxonomy (category × fileTypeDetected × phaseRequired), drift normalisation, checklist requirement → matchingDocumentTypes map. Loaded by step 7 (seed checklist) + step 8 (audit).
- `references/deal-type-and-phase-detection.md` — the Type × Phase 2D frame + detection algorithm + 15-cell combination matrix. Loaded by step 6 (detect type + phase).
- `references/filename-extraction-patterns.md` — 9 filename patterns with regex + the `._*` rejection rule + documentCode abbrev table. Loaded by step 3 + step 4.
- `references/misclassification-audit-playbook.md` — the 5-check audit pass + always-ask-operator rule + folder-bug workaround + approval payload shape. Loaded by step 8.
- `../../shared-references/spv-structure-canon.md` — the canonical 5-entity chain + extraction prompt + persistence schema. Loaded by step 9 (SPV extraction) when a HoTs / FL doc is present.
- `../../shared-references/document-checklist-canon.md` — the standard borrower checklist canon. Loaded by step 7 as backup if the requirementTemplate query fails.
- `../../shared-references/uk-property-finance-glossary.md` — vocabulary for content extraction (GDV, TDC, peak debt, etc.). Loaded by step 10.

And the corpus:

- `../../corpora/document-classification-corrections.md` — known V4 misclassification patterns. Cross-referenced by step 8 (Check 5).
