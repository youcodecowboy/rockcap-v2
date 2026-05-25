# lender-intel

Parallel to the deal-lifecycle skills. Maintains the lender intelligence layer: ingests appetite signals from BDM conversations, lender publications, and deal behavioural data; computes the three-layer LenderProfile (static / live appetite / behavioural); answers "which lender for this deal" matching queries.

## Trigger

Invoke when:

- A BDM check-in (Fireflies meeting, email exchange, manual note) yields appetite information
- A lender publishes a new policy, rate sheet, or market view
- A deal closes (won or lost) and the behavioural signals can be derived
- A skill needs a lender shortlist for a specific deal (e.g., terms-package-build)

Common operator forms:

- "Capture appetite signals from the {Lender} BDM call"
- "Update {Lender}'s profile from this publication"
- "Which lenders for {Project}?"

## Inputs

Required (mode-dependent):

For capture mode:

- One of: `meetingId`, `documentId`, `inboundEmailText`, `manualSignals[]`
- `lenderClientId`: the lender being learned about

For matching mode:

- `projectId`: the deal needing a lender shortlist
- Optional `topN`: max number of lenders to return; defaults to 6

For behavioural recompute mode:

- `lenderClientId`: the lender to recompute against deal history
- Optional `lookbackMonths`: how far back to look; defaults to 24

## Outputs

Persisted to Convex:

1. **`appetiteSignals` rows** with `sourceType` matching the input (bdm_meeting, lender_doc, publication, deal_behaviour). Each carries `fieldPath`, `value`, `asOfDate`, `confidence`, `sourceRef`.
2. **`clientIntelligence.lenderProfile.staticLayer` updates** for facts that are stable (the lender's legal name, address, headquarters location, lender type, ticket range). Static layer updates happen rarely.
3. **Computed behavioural metrics** stored as appetite signals with `sourceType: "deal_behaviour"`: percentage of approached deals that resulted in indicative terms, percentage of indicatives that closed, average time from approach to credit decision, average final-vs-indicative rate slippage.
4. **For matching mode**: a ranked list returned inline (no persistence beyond a `knowledgeBankEntries` audit entry).

## Workflow

### Capture mode

1. Parse the input. For meetings, read the transcript (or the structured `meetings.actionItems`). For documents, run extraction against the lender-appetite schema. For manual signals, validate the shape.
2. For each candidate signal, determine if it's new information or restates an existing one. If existing, mark the old row as superseded.
3. Write the new `appetiteSignals` row. Set `isCurrent: true`; mark the prior row's `isCurrent: false` and link `supersededBy`.
4. If the signal is a static-layer fact (legal name change, HQ relocation, lender-type re-categorisation), patch `clientIntelligence.lenderProfile.staticLayer`.
5. Return the captured signals.

### Matching mode

1. Load the project's profile: scheme type, location, asset class, GDV, TDC, target facility size, leverage required, timing.
2. Query `appetiteSignals` for the relevant fields across all lenders: `isCurrent: true`, fields like `dealSize.min`, `dealSize.max`, `propertyType.allowed`, `geography.allowed`, `ltvgdv.maximum`.
3. Score each lender on fit: hard filters first (deal too small / too large, wrong asset class), then soft scoring (leverage headroom, pricing competitiveness from recent behavioural data, BDM relationship health).
4. Score each lender on behavioural reliability: convert rate (indicative-to-close), speed (mean days approach-to-decision), recent flake-rate (deals withdrawn after indicative).
5. Combine the two scores; return top N. Each result names the lender, the BDM contact, the headline reason, and any caveats (e.g., "strong fit but their typical timing is 6+ weeks to close").

### Behavioural recompute mode

1. Load all `lenderApproaches` for the lender within `lookbackMonths`.
2. Compute the metrics: convert rate, speed, slippage, withdrawn-rate, IC pass rate.
3. Write each metric as an `appetiteSignals` row with `sourceType: "deal_behaviour"` and `asOfDate: now`.
4. Mark prior behavioural rows as superseded.
5. Return the new metrics.

## Style rules

All CONVENTIONS apply. Three that matter most:

- **Specific over directional.** "Mid-eight-figure tickets, 70% LTGDV ceiling" beats "they do bigger deals". The whole point of the appetite layer is precision.
- **Provenance always.** Every signal cites `sourceRef`. Operators must be able to trace any claim back to its source meeting or document.
- **Behavioural signals are derived, not anecdotal.** The convert rate is computed from `lenderApproaches`; do not assert it from memory.

## Tool dependencies

- `meeting.get`, `documents.get`
- The V4 extraction primitive (for lender-doc parsing)
- `intelligence.getClientIntelligence`, `intelligence.updateClientIntelligence`
- `appetite.create`, `appetite.list`, `appetite.markSuperseded`
- `lenderApproach.listByLender`
- `project.get` for matching-mode inputs

## What goes wrong

1. **A BDM gave you off-the-record information**: skill captures with `confidence` set low and `notes: "off-record per operator"`. The signal lives in lender-intel but is suppressed when fed to lender-pack-build or terms-comparison.
2. **Static-layer change ambiguous**: a name change might be a re-brand or a separate entity. Skill flags for operator confirmation; does not patch staticLayer until confirmed.
3. **No appetite signals for any candidate lender** (matching mode): skill falls back to static lender-type matching and flags that the shortlist is based on stale data.
4. **Behavioural sample too small**: lender has only 2 historical approaches. Skill computes the metrics but tags them `confidence: "low"`.
5. **Lender BDM has moved firms**: skill detects via Role (when BL-1.3 lands) or via contactRole updates; surfaces the move, transfers relationship history to the new firm if the BDM is now the only contact at a competing lender.

## References

- `../../shared-references/uk-property-finance-glossary.md`
- This skill's own references to be authored: `appetite-signal-fields.md` (the canonical fieldPaths), `lender-scoring-rubric.md`, `behavioural-metrics-definitions.md`.
