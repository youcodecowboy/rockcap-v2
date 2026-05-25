# extract-term-sheet

Parse a lender term sheet (indicative or credit-backed) into the canonical normalised shape used by `terms-comparison` and `lender-intel`. Used by terms-comparison directly, by lender-intel when capturing terms from a BDM meeting, and by deal-triage when checking for stale indicative terms.

## When to use

Any time a term sheet document needs structured field extraction. Skills do not parse term sheets inline; they call this sub-skill so the schema stays consistent.

## Inputs

Required (one of):

- `documentId`: id of a `documents` row classified as `Indicative Terms` or `Credit Backed Terms`
- `text`: pasted term sheet text

Optional:

- `lenderClientIdHint`: if known, used for confidence scoring on lender-specific quirks
- `currency`: defaults to `GBP`

## Outputs

```ts
type TermSheet = {
  // Required identification
  lenderName: string;
  lenderClientId?: Id<"clients">;
  document: { id?: Id<"documents">; receivedAt: string };

  // Facility shape
  facilityAmount: { value: number; currency: string };
  ltgdv?: number;        // 0-1
  ltc?: number;          // 0-1
  ltv?: number;          // 0-1 (investment loans only)
  tenorMonths?: number;
  dayOneRelease?: { value: number; currency: string };

  // Pricing
  margin?: { bps: number; reference: "SONIA" | "BBR" | "FIXED" | "OTHER" };
  allInRate?: number;    // % at quote date
  arrangementFee?: { value: number; basis: "percentage" | "fixed" };
  exitFee?: { value: number; basis: "percentage" | "fixed" };
  nonUtilisationFee?: { value: number; basis: "percentage_per_annum" };

  // Conditions
  keyConditionsPrecedent: string[];
  covenants: string[];

  // Equity / profit
  requiredEquity?: { value: number; currency: string };
  profitShare?: { percentage: number; trigger: string };

  // Meta
  validityDate?: string;
  exclusivity?: { weeks: number; conditions: string };

  // Provenance
  confidence: "high" | "medium" | "low";
  ambiguousFields: string[];     // field names where extraction was uncertain
  notes: string;                 // free-form caveats from the document
};
```

## Workflow

1. Load document content (PDF / DOCX / pasted text). Use the V4 extraction primitive with this schema as the target.
2. For each field, attempt extraction with a confidence per field. Convert formats: percentages from "70%" or "0.70" to 0-1; rates from "SONIA + 450bps" to `{ bps: 450, reference: "SONIA" }`; currency normalisation per `currency` input.
3. Resolve the lender: if `lenderClientIdHint` not given, run `resolve-company` on the extracted lender name.
4. Populate `ambiguousFields` with any field where multiple plausible interpretations existed in the document.
5. Set overall confidence: `high` if no ambiguous fields and all key fields populated; `medium` if 1-3 ambiguous; `low` otherwise.
6. Return the structured term sheet.

## Style rules

CONVENTIONS apply. Two that matter most:

- **Do not infer.** If the term sheet does not state the LTC, leave it undefined. Do not back-compute from LTGDV without flagging.
- **Preserve exact wording for conditions and covenants.** Conditions precedent and covenants get stored as strings, not paraphrased.

## Tool dependencies

- The V4 extraction primitive (currently `/api/intelligence-extract` with custom schema; future the unified `document.extract` with this schema as the target)
- `documents.get`
- `resolve-company`

## What goes wrong

1. **Document is a cover letter, not a term sheet**: skill returns `confidence: "low"` with `notes: "Document is a cover letter; underlying term sheet not attached"` and stops.
2. **Numbers in two units** (e.g., facility quoted in £ and €): skill follows `currency` input, flags the alternative.
3. **Margin quoted as "market"**: skill captures literally, marks `margin.bps` undefined.
4. **Fee structures the schema does not anticipate** (e.g., a deferred margin step-up): captured in `notes` field rather than discarded.
