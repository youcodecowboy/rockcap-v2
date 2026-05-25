# detect-intelligence-conflict

Detect when newly-extracted intelligence contradicts existing intelligence for the same entity and field path. Used by meeting-capture, deal-intake, lender-intel, monitoring-watcher, and any skill that writes to `knowledgeItems`, `clientIntelligence`, or `projectIntelligence`.

## When to use

Before writing a new intelligence row, check for conflicts. If found, either flag for operator review or supersede the prior value depending on confidence.

## Inputs

Required:

- `scope`: `"client"` or `"project"`
- `entityId`: clientId or projectId
- `fieldPath`: the canonical fieldPath (e.g., `"financials.gdv"`, `"sponsor.name"`, `"appetite.dealSize.max"`)
- `newValue`: the proposed new value
- `newValueType`: the type discriminator
- `newSourceType`: where the new value came from
- `newSourceRef`: source reference
- `newConfidence`: confidence in the new value (0-1)
- `newAsOfDate`: when the new value applies

## Outputs

```ts
type ConflictCheck = {
  conflictFound: boolean;
  existingValue?: {
    knowledgeItemId: Id<"knowledgeItems">;
    value: unknown;
    sourceType: string;
    sourceRef: string;
    confidence: number;
    asOfDate: string;
  };
  recommendation: "write_new_supersedes_old" | "write_new_pending_review" | "skip_new_existing_wins" | "no_conflict_write_new";
  reasoning: string;
};
```

## Workflow

1. Query `knowledgeItems` (or the structured intelligence singleton) by `(scope, entityId, fieldPath)` and `isCurrent: true`.
2. If no existing value: `conflictFound: false`, recommend `no_conflict_write_new`.
3. If existing value matches the new value (equality or within tolerance for numeric values): no conflict, but mark the existing row's `asOfDate` updated to reflect the corroboration.
4. If existing value differs:
   - Compare `asOfDate`: if new is materially more recent (more than 30 days), lean towards supersede.
   - Compare `confidence`: if new is materially higher (delta > 0.3), lean towards supersede.
   - Compare `sourceType`: human-verified sources (`manual`) beat `ai_extraction` ties. RICS-Red-Book-derived figures (via document) beat sponsor self-reported figures.
   - Compute recommendation:
     - **`write_new_supersedes_old`**: new is more recent AND higher confidence AND not contradicted by other live signals.
     - **`write_new_pending_review`**: new is plausible but conflicts meaningfully; let an operator decide.
     - **`skip_new_existing_wins`**: new is from a lower-quality source and not more recent.
5. If recommendation is `write_new_pending_review`, the caller should additionally write an `intelligenceConflicts` row referencing both ids.
6. Return the structured result.

## Tolerance rules per field type

- **Numeric (currency, percentage, number)**: within 2% is equality; 2-10% is "minor variance" (existing wins, asOfDate updated); over 10% is conflict.
- **String / enum**: exact equality only; any difference is conflict.
- **Date**: same day is equality; same week is minor variance; over a week is conflict.
- **Array**: subset relationship is not conflict; disjoint sets are conflict; partial overlap is minor variance.

## Style rules

CONVENTIONS apply. Two that matter most:

- **Conservative on supersession.** Skill prefers `write_new_pending_review` over auto-superseding when in doubt. Better to ask than to silently override the operator's prior judgement.
- **Explain in `reasoning`.** Why was a value superseded or held? One sentence per source field that drove the decision.

## Tool dependencies

- `knowledge.queryIntelligence`, `knowledge.queryByFieldPath`
- `intelligence.getClientIntelligence`, `intelligence.getProjectIntelligence` (for structured singletons)
- `intelligenceConflicts.create` (when `write_new_pending_review`)
- `knowledge.markSuperseded` (when `write_new_supersedes_old`)

## What goes wrong

1. **Multiple existing values** for the same fieldPath in `isCurrent: true` state (shouldn't happen but the data may be dirty): skill treats this as a pre-existing conflict and flags before writing.
2. **The new value is a refinement, not a contradiction** (e.g., GDV stated as "£15m" before, now "£15.2m"): minor variance under the numeric tolerance; existing row's asOfDate updates.
3. **AsOfDate of the new value is older than the existing** (a historical document being processed now): skill recommends `skip_new_existing_wins` unless the source is materially higher quality.
4. **Field-type mismatch**: existing is a number, new is a string. Skill flags as conflict regardless of values; usually means an extraction error in one of them.
