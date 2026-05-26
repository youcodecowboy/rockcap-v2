# Misclassification audit playbook

After V4 ingestion classifies the intake batch, the deal-intake skill runs an audit pass to catch V4's known failure patterns. Corrections require operator approval (per operator directive 2026-05-25: "always ask the user before making changes"). Approved corrections are applied via Sprint H tools AND appended to the corrections corpus, so the classifier improves over time.

Loaded by `deal-intake` skill AFTER initial V4 classification + checklist auto-linking, BEFORE the skill returns its brief to the operator.

## Voice + format rules

- UK English. When citing a doc, use exact filename in backticks.
- When proposing a correction, always state: (a) V4's current classification, (b) the proposed correction, (c) the diagnostic pattern that flagged it (from corpus controlled vocabulary).
- Output a single batch of proposed corrections as a `approvals` row, never per-item — operator approves the batch (with per-item reject capability).

---

## The audit pass — 6 checks

The skill runs these in order on every doc in the just-classified batch:

### Check 1 — Fulfilled-but-mismatched

For each `knowledgeChecklistItems` with `status: fulfilled`, verify the primary doc's `fileTypeDetected` appears in the requirement's `matchingDocumentTypes`. If not → flag with diagnostic `wrong_checklist_link`.

**Real example caught (corrections corpus 003):** `Planning Decision Notice` checklist item had `Shawbrook_Allica_HoTSComparison.xlsx` linked as primary; that doc's `fileTypeDetected: Term Sheet` is not in the requirement's `["Planning Decision", "Planning Permission", "Decision Notice", "Planning Document"]` list.

**Action proposed:** `checklist.unlinkDocument` (the requirement returns to `missing` status if no other docs are linked).

### Check 2 — V4 defeat state

For each doc with `fileTypeDetected ∈ {"Other", "Other Document", "Unclassified"}` OR `category ∈ {"Other", "Miscellaneous", "Unclassified"}` → flag with diagnostic `default_to_other`.

The skill then runs a filename-vocabulary scan: tokenise the filename, check against the canonical fileTypeDetected vocabulary in `../document-vocabulary-catalogue.md`. If a literal vocabulary term appears in the filename → tag with `filename_literal_match_missed` and propose the matched vocabulary term as the correction.

**Real example caught (corrections corpus 001):** `Capstone Quinn Track Record - Track Record - Nov_23.xlsx` classified as `Other Document`; filename contains literal "Track Record" → propose `fileTypeDetected: Track Record`.

### Check 3 — Low confidence

For each doc with `confidence < 0.85` (V4's own confidence score) → flag with diagnostic `low_confidence`.

These docs may not need correction, but they warrant operator review. The skill presents the doc + V4's reasoning + asks operator to confirm or correct.

### Check 4 — Inconsistent-with-sibling

For each doc, check if another doc in the same deal has a similar filename pattern but a different classification. If sibling pairs disagree → flag with diagnostic `inconsistent_with_sibling_doc`.

**Real example caught (corrections corpus 005):** Same deal has `Vinnie Griffith ALIE.xls` correctly classified as `KYC + Assets & Liabilities Statement`, but `John Parker ALIE Sep_22.xlsx` classified as `Miscellaneous + Other Document`. ALIE pattern + different classifications → propose harmonising on the consistent classification.

### Check 5 — Cross-reference against corrections corpus

For each doc in the batch, check if its filename pattern OR classification matches a diagnostic_pattern in `../../../corpora/document-classification-corrections.md`. If so → flag with that diagnostic for operator review.

This is the **feedback loop in action**: corrections from past deal-intake runs catch the same pattern in future runs. Over time, V4's most common errors get pre-emptively caught.

### Check 6 — Link opportunities (correctly-classified but not auto-linked)

For each `knowledgeChecklistItems` with `status: missing`, search the batch for any doc whose `fileTypeDetected` appears in the requirement's `matchingDocumentTypes`. If found → flag with diagnostic `link_opportunity_missed` and propose `checklist.linkDocument` to attach the doc.

**Why this matters.** Test fire on Monksbury Court (2026-05-25) found this check produces MORE proposed corrections than checks 1–5 combined — 5 of 12 missing checklist items had correctly-classified docs in the batch that were never auto-linked. This is the single highest-leverage check, despite catching V4-correct (not V4-wrong) cases.

**Real example caught (Monksbury Court):**
- `Floorplans` requirement was `status: missing`. Batch contained 7 docs classified as `Floor Plans`. None linked. Proposal: link `Amended Plot 7 GF.pdf` as primary, optionally link the other 6 as supporting docs.
- `Initial Monitoring Report` requirement was `status: missing` despite phase=monitoring. Batch contained `10156 Monksbury Court Ledbury.pdf` correctly classified as `Initial Monitoring Report`. Proposal: link.

**When multiple candidate docs exist:**
- Pick the most-recent (by `_creationTime`) as primary.
- Other candidates proposed as supporting (non-primary) links.

**When NO candidate doc exists:**
- DON'T propose a correction (nothing to link).
- This is the boundary between "audit can fix it" and "operator/borrower needs to provide it." Step 11 (Stage tasks for missing material) handles the latter.

**Diagnostic pattern:** `link_opportunity_missed`. Add to controlled vocabulary in the corrections corpus.

---

## The folder-validation bug workaround

**Known substrate bug** (`/jotted` 2026-05-25; documented in corpus corrections 001 + 005): `documents.update` re-validates `folderId` even when not being changed. If V4 placed the doc in a folder that doesn't exist for the project context, ANY update fails.

**Workaround:** when calling `document.updateClassification`, ALWAYS pass `folderId: null, folderType: null` if the doc's current `folderId` looks suspicious (e.g., contains `kyc`, `miscellaneous`, or other client-level folder names at `folderType: project`).

When the substrate bug is fixed, this workaround should be removed.

---

## Always-ask-operator-first rule

**The skill never auto-applies corrections.** Operator directive 2026-05-25: "always ask the user before making changes."

The skill produces a single approvals row with `entityType: document_classification_audit` containing the full proposed-corrections list. The operator:
- Approves the full batch → all corrections applied
- Approves a subset (per-item checkboxes in the approvals UI) → only checked items applied
- Rejects → no corrections applied; flagged docs remain as V4 classified them

Reject signal IS data — the corpus may want to record "operator rejected this correction" so future audits don't keep proposing the same thing.

---

## Approvals row shape

```yaml
entityType: document_classification_audit
clientId: <client id>
projectId: <project id>
summary: |
  Deal-intake audit found 5 potential misclassifications across 32 documents.
  Recommend reviewing each before linking to the corrections corpus.
draftPayload:
  audit_corrections:
    - correctionId: prop_001
      docId: nx70szgnt7zpyaa830y5zq28nd82qjcj
      fileName: Capstone Quinn Track Record - Track Record - Nov_23.xlsx
      currentClassification:
        category: KYC
        fileTypeDetected: Other Document
      proposedClassification:
        category: Project Information
        fileTypeDetected: Track Record
      diagnosticPattern: filename_literal_match_missed
      reasoning: |
        Filename contains literal "Track Record" twice. V4 should have token-matched.
      proposedAction:
        tool: document.updateClassification
        args: {documentId: nx70..., category: Project Information, ...}
      ...
    - correctionId: prop_002
      ...
```

---

## After approval — apply + persist

For each operator-approved correction:

1. Apply the change using the proposed Sprint H tool:
   - `document.updateClassification` for category / fileTypeDetected fixes
   - `checklist.linkDocument` to attach a doc to a requirement
   - `checklist.unlinkDocument` to remove a wrong link
2. Append a corpus entry to `../../../corpora/document-classification-corrections.md` following the format documented there.
3. Set the approval row's `status: completed` with `executedAt` timestamp.

If any single correction fails (e.g., hit folder-validation bug, schema error), the skill:
- Continues applying the remaining corrections (don't fail the batch on one error).
- Records the failure in `skillRun.complete.gaps` with `kind: correction_failed`.
- Includes the failed correction in the corpus entry with `appliedStatus: failed_<reason>`.

---

## Failure modes

1. **Operator approves nothing.** The proposed corrections sit pending in the approvals queue. Skill exits with `status: complete_with_gaps`, brief notes "audit produced N corrections awaiting operator review."
2. **Operator approves but bug blocks application.** The folder-validation bug catches some corrections. Skill applies with workaround (`folderId: null`) on second attempt; if still fails, records in corpus with failure note.
3. **Operator rejects all proposals.** All flagged docs stay as V4 classified them. Skill writes a corpus entry per rejection with `appliedStatus: rejected_by_operator` so future audits don't re-propose identical corrections.
4. **Same doc appears in multiple proposals.** A doc might fail Check 1 (wrong checklist link) AND Check 2 (low confidence). Consolidate proposals per doc — the operator sees one row per doc with all its issues listed.
5. **V4 hasn't classified yet.** If the audit runs while any docs in the batch have `status: pending` or `processing` (V4 still running), skill waits up to 60 seconds then proceeds with whatever's classified. Unclassified docs surface as a `gap` of kind `v4_did_not_complete`.

---

## Metrics to track (over time)

The skill should record per-run metrics for the audit pass:

| Metric | Computed |
|---|---|
| `corrections_proposed_count` | Number of items in the approvals row's draftPayload |
| `corrections_approved_count` | Number actually applied |
| `corrections_rejected_count` | Subset approved=false |
| `diagnostic_pattern_breakdown` | Counts per pattern (filename_literal_match_missed, default_to_other, etc.) |
| `corpus_hits_count` | Corrections that matched a previously-recorded corpus pattern (signals feedback-loop value) |

Persist these via `skillRun.complete.metrics` (subject to skillRuns schema supporting metrics — currently TBD; if not yet, persist via `knowledgeItems` at `dealIntake.auditMetrics`).

---

## Integration with V4 improvement (future)

The corrections corpus is the substrate for V4 prompt improvement:
- When a single `diagnostic_pattern` accumulates N+ corpus entries (suggested threshold: 10), the `classification-critic` skill (skeleton at time of writing) generates a proposal to either:
  - Extend V4's canonical vocabulary (if `vocab_gap`)
  - Extend V4's prompt with explicit guidance (if `confused_correspondence_vs_kyc`, `filename_literal_match_missed`)
  - Add a normalisation rule (if `bad_folder_placement`)

This skill (deal-intake) doesn't drive that improvement loop directly — it just produces the corrections that fuel it. The classification-critic skill is what reads the corpus and proposes V4 prompt changes.
