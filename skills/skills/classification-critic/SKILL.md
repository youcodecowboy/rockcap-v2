# classification-critic

> **⚠ v1 SKELETON — not yet operational.** This skill documents *intended* behaviour for a future version. Some tools it references are **not yet in the MCP surface** (see `../../CATALOGUE.md` → "What's NOT yet MCP-exposed"). If a user triggers this skill: tell them this workflow isn't built yet, do only what the **live** tools (in `tools-manifest.json`) allow, and **never call a tool that isn't in the manifest** — log the rest as gaps via `skillRun.complete`.

Lifts the V3 critic-agent decision logic into a skill (per BL-2.10 / BL-6.5). Reviews document classifications produced by the V4 pipeline, applies RockCap-specific override rules learned from operator corrections, and produces a final confirmed classification.

## Trigger

Invoke after a document classification has been produced but before it's committed as final. Either by the V4 pipeline orchestrator at the end of its classification step, or by an operator who wants to review a specific document.

Common forms:

- Automatic invocation in the V4 batch pipeline
- "Re-check the classification on document {id}"
- "Run the critic on the unfiled queue"

## Inputs

Required:

- `documentId`: id of the classified document
- `proposedClassification`: the V4 pipeline's output: `{ fileTypeDetected, category, reasoning, confidence, checklistMatches[] }`

Optional:

- `priorCorrections`: when invoked in a feedback loop, the operator's prior correction record for this document
- `contextDepth`: `light` (description and name only), `full` (full content read), or `targeted` (read specific pages or sections)

## Outputs

Persisted to Convex:

1. **A final classification decision** that either confirms `proposedClassification` or overrides it. Written back to `documents` row.
2. **A `learningEvents` row** if the critic overrode the V4 output, capturing the reason. Subsequent classifications of similar documents pick this up.
3. **An updated `filingCorrections` row** if the operator's prior correction was the source of the override.
4. **A `classificationCache` row** for content-hash-based fast classification on identical re-uploads.
5. **`flags` row** if the critic believes the document warrants human review (e.g., unusual content, contradictory signals).

## Workflow

1. Load the document and its full content (or summary). Honour `contextDepth`.
2. Load the relevant correction history. Three tiers depending on what's available:
   - **None**: no prior corrections matter; the V4 output is taken at face value.
   - **Consolidated**: aggregate-statistics from `filingCorrections` (e.g., "75% of documents V4 classified as 'Report' were re-classified by operators as 'Monitoring Report' last quarter").
   - **Targeted**: a specific prior `filingCorrections` row for this filename pattern or content hash.
   - **Full**: the deterministic verifier's keyword-scoring output plus all of the above.
3. Apply override rules:
   - If the deterministic verifier's keyword-scored top result disagrees with V4 and the disagreement margin is over 0.25, prefer the verifier's result. Document the override.
   - If a targeted correction exists, apply it.
   - If the V4 output's category is generic ("Report", "Document") and corrections show a more specific category is consistently chosen, override to the specific.
   - If the V4 output assigns `confidence < 0.4` and a deterministic match exists, override.
4. Validate checklist matches. If V4 matched the document to a `knowledgeChecklistItems` row but the document type does not align with the requirement's `matchingDocumentTypes`, unset the match.
5. If the critic is uncertain (multiple plausible outcomes, no decisive override rule, no prior correction), keep the V4 result but lower its confidence and stage a `flags` row for operator review.
6. Write the final decision. Write the learning event if appropriate. Update the cache.
7. Return the decision: confirmed or overridden, with reasoning.

## Style rules

All CONVENTIONS apply. Two that matter most:

- **Reasoning visible.** Every override decision is logged with a one-sentence rationale. "Overrode V4 'Report' to 'Initial Monitoring Report' because the document content includes 'pre-funding monitoring' keyword and prior similar documents were re-classified the same way."
- **Bias to V4 unless evidence overrides.** This skill is a critic, not a re-classifier. Default to acceptance; override only when one of the rules fires.

## Tool dependencies

- `document.get`, `document.updateClassification` (for the final classification write)
- `documentContent.get` (or the V4 extraction interface for partial content reads)
- `filingCorrections.getRelevant`
- `learningEvents.create`
- `classificationCache.upsert`
- `flags.create` (for documents needing human review)
- The deterministic verifier (existing in `src/lib/agents/deterministic-verifier/`; will become a tool when MCP server exposes it)
- `fileTypeDefinitions.list` for the canonical taxonomy

## Migration from the V3 critic

Today the V3 `critic-agent` (`src/lib/agents/critic-agent/`) carries the decision logic this skill lifts. The migration plan (BL-2.10):

1. The V4 pipeline will call this skill as its critic step instead of running the V3 critic.
2. The decision rules currently in the agent's prompt move into this SKILL.md and its references.
3. The `learningEvents` and `filingCorrections` tables continue to feed the decision; nothing about that storage changes.
4. Operators tweak rules by editing this SKILL.md and its references rather than the V3 agent's prompt. Skill changes pull through `git pull` on the operator's laptop, propagating immediately.
5. Once this skill is operationally proven, the V3 critic-agent code is deleted (BL-2.14).

## What goes wrong

1. **Document is genuinely novel**: no prior corrections, no keyword matches, V4 confidence is low. Skill keeps V4, stages a `flags` row, asks operator to classify, the resulting `filingCorrections` row trains future calls.
2. **Conflicting prior corrections**: two operators have classified similar documents differently. Skill applies the most recent correction, flags the disagreement, asks for canonicalisation.
3. **The proposed classification is for a type not in `fileTypeDefinitions`**: V4 has hallucinated a category. Skill rejects and falls back to the closest valid category.
4. **Override would unset a checklist match that the operator manually set**: skill preserves operator-set checklist links even on classification override.
5. **The document is multi-purpose** (e.g., a single PDF containing a valuation, a planning pack, and a cashflow). Skill flags the multi-doc case; the V4 pipeline's classification cannot fit; the operator splits the PDF before re-classifying.

## References

- `../../shared-references/uk-property-finance-glossary.md` (the document taxonomy)
- `../../shared-references/document-checklist-canon.md`
- This skill's own references to be authored: `override-rule-catalogue.md`, `correction-tier-selection.md`, `confidence-thresholds.md`.
