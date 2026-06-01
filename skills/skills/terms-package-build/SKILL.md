# terms-package-build

> **⚠ v1 SKELETON — not yet operational.** This skill documents *intended* behaviour for a future version. Some tools it references are **not yet in the MCP surface** (see `../../CATALOGUE.md` → "What's NOT yet MCP-exposed"). If a user triggers this skill: tell them this workflow isn't built yet, do only what the **live** tools (in `tools-manifest.json`) allow, and **never call a tool that isn't in the manifest** — log the rest as gaps via `skillRun.complete`.

Step 8 of the deal lifecycle. From the intaken deal data, produce two distinct documents: the indicative terms RockCap shares with the client (what we think the market can deliver), and the lender submission pack we send to lenders (the package they need to give us indicative terms).

## Trigger

Invoke when the project is at `dealPhase: "indicative_terms"`, the underwriting model has been populated, and the operator wants the terms package ready to send. Common forms:

- "Build the indicative terms doc and lender pack for {Project}"
- "Package up {Scheme} for lender outreach"

## Inputs

Required:

- `projectId`: id of the project

Optional:

- `targetLenderClientIds[]`: which lenders to address in the cover letter. Defaults to a shortlist computed by lender-match heuristics (specialist development lenders + relevant challenger banks for the project's asset class).
- `clientFacingTone`: `standard` (default) or `conservative` (used when the deal is on the edge of placeability and we want to manage expectations)

## Outputs

Persisted to Convex:

1. **One `approvals` row of type `document_publish`** for the client-facing indicative terms document. The draft links to a generated DOCX file in `_storage`.
2. **One `approvals` row of type `document_publish`** for the lender submission pack. The draft links to a generated DOCX (cover + appraisal summary + cashflow + sponsor profile + scheme brief).
3. **A summary written to `knowledgeBankEntries`** capturing the package contents for the audit trail.
4. **`lenderApproaches` rows** (one per target lender) in `status: "identified"`. The fan-out to actual outreach is a separate skill (lender-outreach-fanout) that consumes these rows.

## Workflow

1. Load the project, including: latest `modelRuns` row (the underwriting model output), `projectIntelligence`, the appraisal and cashflow documents, the sponsor's track record from `clientIntelligence`.
2. Verify the inputs are complete enough to package. If the model has no validated outputs or the appraisal is missing, stop and surface what's needed.
3. Compute the indicative terms RockCap is putting in front of the client. Use the underwriting model's facility scenarios. Pick the central case; note one stretch case.
4. Compose the client-facing indicative terms document using `template.populate` against the `client-indicative-terms.docx` template (BL-5.6, planned). Variables include facility, LTGDV, LTC, all-in rate, key conditions, target timeline.
5. Compose the lender submission pack using the `lender-submission-pack.docx` template. Variables include scheme summary, GDV, TDC, equity, profit, sponsor bio, scheme address, timeline, key risks acknowledged.
6. Identify target lenders. If the operator gave `targetLenderClientIds[]`, use them. Else compute a shortlist using lender-match heuristics: lenders with `appetiteSignals` matching this deal's profile (asset class, ticket size, location), plus lenders with positive behavioural history on similar deals from `lenderApproaches`.
7. Create `lenderApproaches` rows for each target with status `identified`, including the per-lender BDM contact if known.
8. Stage both documents as `approvals` rows of `entityType: "document_publish"`. The approvals queue UI shows the rendered preview; on approve, the executor (BL-5.7 future executor) writes the file to a defined destination.
9. Return a brief: number of target lenders, key indicative figures shown to client, where the documents are staged.

## Style rules

All CONVENTIONS apply. Three that matter most:

- **The client-facing doc and the lender pack are different shapes.** Client-facing is short, focused on what they care about (size, rate, timeline). Lender pack is dense, defensive, anticipates objections.
- **Conservative on rate quotes.** State the all-in rate as "based on current SONIA plus a market-typical margin in the range X to Y bps" rather than a single number. Locks in expectations only after a lender's indicative terms arrive.
- **No fabricated sponsor accolades.** Sponsor bio uses what's actually in `clientIntelligence`. Do not invent track record numbers.

## Tool dependencies

- `project.get`, `intelligence.getProjectIntelligence`, `intelligence.getClientIntelligence`
- `modelRuns.getLatest`
- `documents.getByProject` (to find the appraisal, cashflow, sponsor bio)
- `appetite.searchLenders` (for lender shortlist)
- `lenderApproach.create`
- `template.populate` (planned, BL-5.6)
- `approval.create` of type `document_publish` (queue + executor still planned)
- `knowledge.addEntry` for the audit trail

## What goes wrong

1. **No populated underwriting model**: skill stops and asks for `deal-intake` to be run first.
2. **Sponsor bio sparse**: skill produces the lender pack with a placeholder section flagged for operator infill rather than fabricating content.
3. **No appetite data for any plausible lender**: skill uses static lender-type matching (challenger banks for borrower's apparent ticket size, specialist development lenders for the asset class) and flags the absence of appetite signals.
4. **Asset class is unusual**: hotel, student accommodation, BTR. Skill flags that lender shortlist may need operator override.
5. **Sensitive content** (e.g., distressed seller, breakup of partnership): operator can flag at intake, skill suppresses that detail in the lender pack and includes it in a separate cover note for one-on-one conversations.

## References

- `../../shared-references/uk-property-finance-glossary.md`
- `../../shared-references/approval-payload-shapes.md` (document_publish shape)
- `../../templates/README.md` (templates this skill consumes)
- This skill's own references to be authored: `lender-shortlist-heuristics.md`, `client-vs-lender-narrative-rules.md`.
