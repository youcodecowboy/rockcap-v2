# ic-paper-drafter

> **⚠ v1 SKELETON — not yet operational.** This skill documents *intended* behaviour for a future version. Some tools it references are **not yet in the MCP surface** (see `../../CATALOGUE.md` → "What's NOT yet MCP-exposed"). If a user triggers this skill: tell them this workflow isn't built yet, do only what the **live** tools (in `tools-manifest.json`) allow, and **never call a tool that isn't in the manifest** — log the rest as gaps via `skillRun.complete`.

Step 11 of the deal lifecycle. The deal has moved to credit submission; the selected lender's IC needs a paper. This skill drafts it from the deal's full context, using the lender's known IC template format when available.

## Trigger

Invoke when `projects.dealPhase = "credit_submission"` and the operator wants the IC paper draft ready to send. Common forms:

- "Draft the IC paper for {Project}"
- "Build the credit submission for the {Lender} on {Project}"

## Inputs

Required:

- `projectId`: the project
- `targetLenderClientId`: the lender to whom this paper goes

Optional:

- `templateOverride`: id of a specific IC template to use (defaults to the lender's known format if one is on file; else the generic IC template)
- `narrativeAngles`: free-text from the operator on which deal aspects to emphasise

## Outputs

Persisted to Convex:

1. **One `approvals` row** of type `document_publish` carrying the drafted IC paper as a DOCX file in `_storage`. The draft is rendered enough for senior review; the operator edits before approving.
2. **A graded information-request checklist** as `knowledgeChecklistItems` rows where the lender's IC has explicit info requirements. These layer on top of the existing `knowledgeRequirementTemplates`-seeded items via the BL-1.5 extension fields.
3. **A summary `knowledgeBankEntries` row** capturing the IC submission event.

## Workflow

1. Load full project context via `deal.get_full_context` (BL-5.4, planned): project, intelligence, lenderApproaches, milestones, info requests, recent docs, recent touchpoints.
2. Load the lender's profile: `lender.getDeepContext` (read its `graph` section — facilities, atom/contested counts, top edges) plus `atoms.search` for lender-specific facts, alongside recent `appetiteSignals` and behavioural data computed from prior `lenderApproaches` with this lender. If the graph section is empty (lender not yet atomized), fall back to the static fields on `clientIntelligence.lenderProfile`.
3. Pick the template. If the lender has a known IC format (a `documents` row of type "IC Template" linked to that client), use it. Otherwise use the generic IC paper template from `skills/templates/ic-paper.docx`.
4. Compose the paper in sections:
   - **Executive summary**: facility, sponsor, scheme, indicative terms agreed at step 8 (or step 9 final), timing
   - **Sponsor profile**: track record, financial standing, key principals
   - **The scheme**: location, asset class, GDV, TDC, profit, market context
   - **Deal mechanics**: facility structure, day-one release, drawdown schedule, key conditions
   - **Risks**: scheme-specific, sponsor-specific, market-level; how each is mitigated
   - **Recommendation to credit**: the borrower-side ask in a single paragraph
5. Use `template.populate` (BL-5.6) to render the docx with extracted variables.
6. Identify the lender's specific information requirements. Search the graph first (`atoms.search` on the lender for IC-requirement facts) or use `documents` rows linked to this lender of type "IC Submission Pack"; if the lender's graph is empty (not yet atomized), fall back to `clientIntelligence.lenderProfile.icRequirements` if populated. Parse and add as graded `knowledgeChecklistItems` with `lenderStatus: "not_requested"` initially.
7. Stage the docx as an `approvals` row of type `document_publish` with `relatedClientId` set to the lender and `relatedProjectId` set to the project.
8. Return a brief: paper sections drafted, information requirements added to checklist, what the operator should review before approving.

## Style rules

All CONVENTIONS apply. Three that matter most:

- **Defensive.** The IC reader is hostile by default. Anticipate the objections; surface them; mitigate them. Skipping a risk is worse than naming it and addressing it.
- **No marketing language.** "Stabilised income profile" not "fantastic income". "0.65x LTGDV" not "comfortable headroom".
- **Numbers cited, not summarised.** Every figure traces to a document in the deal's folder.

## Tool dependencies

- `deal.get_full_context` (BL-5.4, planned)
- `lender.getDeepContext` (graph section: facilities + atoms) + `atoms.search` (the lender's; `intelligence.getClientIntelligence` fallback only when the graph section is empty — lender not yet atomized)
- `appetite.getCurrentForLender`, `lenderApproach.getBehaviouralSummary`
- `documents.getByProject`, `documents.getByClient` (for IC templates)
- `template.populate` (BL-5.6, planned)
- `knowledge.addItem` for graded info requirements
- `approval.create` of type `document_publish`
- `knowledge.addEntry` for the audit trail

## What goes wrong

1. **No IC template on file for the lender**: skill uses the generic template and flags the missing lender-specific format for the operator (a future intake task for the BDM).
2. **Sponsor track record is sparse**: skill includes the sections it can populate, flags missing detail for operator infill, and asks for the sponsor's CV or track-record document.
3. **Scheme valuation is contested**: more than one appraisal exists with different GDVs. Skill surfaces the conflict, picks the most recent RICS Red Book valuation if any, and footnotes the alternative.
4. **Risks section is too thin**: the underwriting model shows headroom but the appraisal does not document local sales evidence. Skill drafts a placeholder risks section and asks the operator to flesh out before approving.
5. **The lender's BDM relationship is poor** (recent `appetiteSignals` show declined or withdrawn deals): skill flags this in the brief so the operator can pre-empt with a direct call.

## References

- `../../shared-references/uk-property-finance-glossary.md`
- `../../shared-references/document-checklist-canon.md`
- `../../shared-references/approval-payload-shapes.md`
- `../../templates/README.md`
- This skill's own references to be authored: `ic-paper-section-rubric.md`, `risk-section-checklist.md`.
