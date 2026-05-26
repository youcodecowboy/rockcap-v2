# Document classification corrections corpus

A growing, append-only log of every misclassification correction approved by an operator. The corpus exists so the V4 ingestion classifier (and the skills that consume its output) can improve from real production errors over time.

## Purpose

The V4 classifier makes systematic errors — defaulting to `Other Document` when it should have token-matched on filenames, miscategorising sponsor-related docs as correspondence, placing docs in folders that don't exist for the project. Each individual error is small. The aggregate pattern is signal.

This file captures the corrections, with enough diagnostic detail that:
- **Deal-intake skill** loads it at startup to pre-validate V4 output against known-bad patterns before accepting V4 classifications. Reduces operator review burden over time.
- **Classification-critic skill** (skeleton at time of writing) consumes the corpus to propose vocabulary additions, prompt-engineering tweaks, or re-classification rule patches.
- **Future V4 enhancement** loads recent entries as in-context examples for the LLM classifier call, so the LLM sees "here are 20 corrections operators have made recently — don't repeat these mistakes."

## Append discipline

Every operator-approved misclassification fix becomes one appended entry. Entries are numbered (001, 002, …) and dated. Never edit or remove entries — they form a historical record. If a later correction supersedes an earlier one, append a NEW entry referencing the older one.

## Anonymisation rules (specific to THIS corpus)

The standard `skills/corpora/README.md` anonymisation rules optimise for hiding identity. For corrections, we use a hybrid:

- **Preserve filenames exactly.** The filename pattern is the diagnostic signal — anonymising it destroys the lesson (e.g., the classifier missed `Track Record` literal; replacing with `{Doc} Track Record` would erase that).
- **Preserve all vocabulary terms exactly.** Categories like `KYC`, fileTypeDetected values like `Assets & Liabilities Statement` — these are canonical and must match the live vocabulary.
- **Anonymise sponsor + project names in the reasoning narrative if sensitive.** For internal early-stage use, real names are fine. As the corpus grows + as it leaves the internal team, swap real names for `{Sponsor Co.}` / `{Scheme Name}` in the narrative.
- **Preserve confidence scores + structured diagnostic patterns.** These help downstream tooling.

## Entry shape

Each correction is a fenced YAML block followed by a prose reasoning section:

```yaml
correction: 001
date: 2026-05-25
deal: {project name, optionally anonymised}
file: {exact filename}
v4_classification:
  category: {V4's category}
  fileTypeDetected: {V4's fileTypeDetected}
  confidence: {0.00 to 1.00}
  folder: {folderId / folderType if relevant}
correct_classification:
  category: {operator-approved category}
  fileTypeDetected: {operator-approved fileTypeDetected}
diagnostic_pattern: {short tag — see "Diagnostic patterns" below}
```

Reasoning: 1-3 sentences explaining why V4 got it wrong and what the operator-approved logic was.

## Diagnostic patterns (controlled vocabulary)

Each correction is tagged with a short diagnostic pattern. New patterns are added as we discover them. Current patterns:

- `filename_literal_match_missed` — vocabulary term appears literally in filename but V4 didn't match
- `initialism_match_missed` — sponsor/scheme initials in filename weren't recognised (e.g., "CQ" for "Capstone Quinn")
- `confused_correspondence_vs_kyc` — CVs, profiles, ALIEs misclassed as email/correspondence
- `default_to_other` — V4 fell back to `Other Document` instead of attempting a match
- `inconsistent_with_sibling_doc` — same deal has another doc of same type classified correctly, but V4 was inconsistent
- `wrong_checklist_link` — V4 linked a doc to a checklist item whose `matchingDocumentTypes` doesn't contain the doc's fileTypeDetected
- `bad_folder_placement` — V4 placed the doc in a folder that doesn't exist for the project (e.g., wrote `folderId: "kyc"` to a project-scoped doc but `kyc` is a client-level folder). **Note (Sprint I):** the `documents.update` validator no longer trips on this for unchanged folder fields. Corrections can be applied without the prior `folderId: null` workaround. The V4 bad-placement behaviour itself is still a substrate issue (V4 picks invalid folders); fixing V4 to pick correctly is a separate vocab/prompt PR.
- `vocab_gap` — the correct fileTypeDetected isn't in the V4 vocabulary yet (e.g., `Brochure` would need adding)
- `link_opportunity_missed` — doc was correctly classified by V4 BUT was never auto-linked to a checklist item it would have fulfilled. Highest-frequency pattern observed during test fire (Monksbury Court 2026-05-25). Often dominates audit batches.

---

## Corrections

```yaml
correction: 001
date: 2026-05-25
deal: Manor Park Refinance (Capstone Group) — type=Bridging, phase=indicative_terms
file: Capstone Quinn Track Record  - Track Record - Nov_23.xlsx
v4_classification:
  category: KYC
  fileTypeDetected: Other Document
  confidence: ~0.65
  folder: kyc / project ⚠️ (kyc folder doesn't exist at project scope)
correct_classification:
  category: Project Information
  fileTypeDetected: Track Record
diagnostic_pattern: filename_literal_match_missed
```

The filename contains the literal token "Track Record" TWICE (`Capstone Quinn Track Record - Track Record - Nov_23.xlsx`). V4 should have matched on the second occurrence (the canonical `Track Record` vocabulary value). Additionally V4 placed the doc into folder `kyc` at `folderType=project`, which is invalid — `kyc` is a client-level folder name, not a project folder. This invalid folder placement BLOCKED the correction (had to clear folderId during update — see corpus correction 005 for the recurrence).

---

```yaml
correction: 002
date: 2026-05-25
deal: Manor Park Refinance (Capstone Group) — type=Bridging
file: CQ Track Record Oct_25.xlsx
v4_classification:
  category: Financial Documents
  fileTypeDetected: Other Document
  confidence: ~0.65
  folder: background / project
correct_classification:
  category: Project Information
  fileTypeDetected: Track Record
diagnostic_pattern: initialism_match_missed
```

"CQ" is the initialism for Capstone Quinn — the borrower SPV behind Manor Park Refinance. Filename contains "Track Record" literally. V4 missed both the initialism context AND the literal vocabulary match. Same V4 run correctly recognised `Capstone Quinn Track Record - Track Record - Nov_23.xlsx` as containing a track-record concept but defaulted to Other Document anyway (correction 001) — the inconsistency is informative.

---

```yaml
correction: 003
date: 2026-05-25
deal: Manor Park Refinance (Capstone Group)
checklist_item: Planning Decision Notice (rh7791v3dr5sexj3zbsa0zphm182pbxa)
wrongly_linked_file: Shawbrook_Allica_HoTSComparison.xlsx
action: unlinkDocumentFromChecklistItem
new_checklist_status: missing (no alternative doc available to link)
diagnostic_pattern: wrong_checklist_link
```

V4 linked a HoTs Comparison memo (a multi-lender terms comparison artefact) to the `Planning Decision Notice` checklist requirement, marking it `fulfilled`. The matching requirement's `matchingDocumentTypes` is `["Planning Decision", "Planning Permission", "Decision Notice", "Planning Document"]`. The linked doc's `fileTypeDetected: Term Sheet` is not in the list. V4 should have rejected the link. After unlinking, the item correctly returns to `missing` status — the deal genuinely doesn't have planning decision notice yet, and this should be visible.

---

```yaml
correction: 004
date: 2026-05-25
deal: Monksbury Court (Kinspire) — type=Development, phase=post_credit / monitoring
file: Director_s CVs.docx
v4_classification:
  category: Communications
  fileTypeDetected: Email/Correspondence
  confidence: ~0.65
  folder: notes / project
correct_classification:
  category: KYC
  fileTypeDetected: Track Record
diagnostic_pattern: confused_correspondence_vs_kyc
```

Director CVs are sponsor due-diligence material, not correspondence. The .docx extension + presence of "CV" word suggests a personnel document, not an email. V4 may have been confused by the lack of structured CV markers in the document content. Track Record is the closest existing vocabulary value — captures the "evidence of sponsor capability" intent. (Alternative: argue for adding a CV / Director Profile vocabulary value — flagged in corpus inbox.)

---

```yaml
correction: 005
date: 2026-05-25
deal: Monksbury Court (Kinspire) — type=Development
file: John Parker ALIE Sep_22.xlsx
v4_classification:
  category: Miscellaneous
  fileTypeDetected: Other Document
  confidence: ~0.65
  folder: miscellaneous / project ⚠️ (miscellaneous folder doesn't exist at project scope)
correct_classification:
  category: KYC
  fileTypeDetected: Assets & Liabilities Statement
diagnostic_pattern: inconsistent_with_sibling_doc + bad_folder_placement
```

ALIE = Assets, Liabilities, Income, Expenditure — a canonical UK property finance KYC artefact. The same deal has `Vinnie Griffith ALIE.xls` correctly classified as `KYC + Assets & Liabilities Statement`. V4 was inconsistent across the two ALIE docs. Additionally, this doc had `folderId: miscellaneous` at `folderType: project`, which is invalid (same bug as correction 001) and blocked the update until folder was cleared.

---

## Pattern aggregates (auto-generated; refresh on each correction)

Patterns observed in current corpus (5 corrections):

- `filename_literal_match_missed`: 1
- `initialism_match_missed`: 1
- `confused_correspondence_vs_kyc`: 1
- `inconsistent_with_sibling_doc`: 1
- `bad_folder_placement`: 2 (Capstone Quinn TR + John Parker ALIE)
- `wrong_checklist_link`: 1
- `default_to_other`: 4 (correlated with above patterns — when V4 defaults to Other Document, it's usually because it failed to match on another diagnostic)

Categories appearing in V4 misses: KYC (1), Financial Documents (1), Communications (1), Miscellaneous (1), Loan Terms (1)
Categories operator should have used: Project Information (2), KYC (2), [n/a unlink] (1)
FileTypeDetected operator should have used: Track Record (3), Assets & Liabilities Statement (1), [n/a unlink] (1)

## Open vocabulary gaps surfaced (for V4 prompt extension)

- `CV` / `Director Profile` — currently best-match is `Track Record` but not a perfect fit
- `Brochure` — for sales brochures (saw `ManorParkBrchMar25-FINAL-Digital.pdf` mid-mining; not in this corpus yet because operator hasn't approved that correction)
- `HoTs Comparison` / `Terms Comparison Memo` — multi-lender comparison artefacts; currently classified as `Term Sheet` which is misleading

---

## How skills should use this corpus

### deal-intake (the primary consumer)

After V4 classifies a batch, the skill compares each doc against this corpus:
1. For each diagnostic_pattern, check if the doc matches. (e.g., for `filename_literal_match_missed`: tokenise the filename, intersect with canonical fileTypeDetected vocabulary, if there's a literal match but V4 said `Other Document`, surface for operator review.)
2. For each `bad_folder_placement` pattern, pre-clear folderId before calling document.updateClassification (avoids the documents.update bug — see `.logbook/inbox.md` 2026-05-25 entry).
3. Add new corrections at the end of the workflow's audit pass (after operator approves the proposed corrections batch).

### classification-critic (future)

Periodically scan the corpus for:
- Diagnostic patterns appearing N+ times → propose V4 prompt enhancement
- Vocabulary gaps appearing N+ times → propose new vocabulary value
- Bad folder placements → propose V4 folder-assignment fix
