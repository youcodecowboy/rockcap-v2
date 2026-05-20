# extract-appraisal-figures

Pull the canonical financial and scheme figures from an appraisal or cashflow document. Used by deal-intake (populate underwriting model), terms-package-build (compose client and lender packs), monitoring-watcher (compare to baseline).

## When to use

Any time a project-level RICS Red Book valuation, development appraisal, or cashflow needs structured field extraction.

## Inputs

Required (one of):

- `documentId`: id of a document classified as `Appraisal`, `RedBook Valuation`, or `Cashflow`
- `text`: pasted content

Optional:

- `projectIdHint`: if known, used for cross-checking against other extractions on the same project

## Outputs

```ts
type AppraisalFigures = {
  // Scheme
  scheme: {
    name?: string;
    address?: string;
    postcode?: string;
    assetClass?: "residential" | "commercial" | "mixed_use" | "student" | "btr" | "operating" | "other";
    units?: { residential?: number; commercial?: number };
    gia?: { value: number; unit: "sqm" | "sqft" };
    nia?: { value: number; unit: "sqm" | "sqft" };
  };

  // Values
  gdv: { value: number; currency: string; basis?: string };
  tdc: { value: number; currency: string };
  landCost?: { value: number; currency: string };
  buildCost?: { value: number; currency: string };
  professionalFees?: { value: number; currency: string };
  financeCosts?: { value: number; currency: string };
  contingency?: { value: number; currency: string };

  // Returns
  profit: { value: number; currency: string };
  profitOnCost?: number;        // 0-1
  profitOnGdv?: number;         // 0-1

  // Timing
  programmeMonths?: number;
  salesPeriodMonths?: number;

  // Valuation context
  valuerName?: string;
  valuationDate?: string;
  redBookCompliant?: boolean;
  marketValueVsSpecialAssumption?: "market_value" | "special_assumption" | "both";

  // Provenance
  confidence: "high" | "medium" | "low";
  ambiguousFields: string[];
  notes: string;
};
```

## Workflow

1. Load document content. Use the V4 extraction primitive with this schema.
2. Extract the GDV and TDC first; these are the primary figures and must be present.
3. Extract the breakdown of TDC (land + build + fees + finance + contingency) if the document provides it.
4. Compute profit = GDV - TDC if not directly stated; flag as derived.
5. Compute ratios (profit on cost, profit on GDV) if not directly stated; flag as derived.
6. Capture valuation context (valuer, date, Red Book compliance).
7. Confidence: `high` if GDV and TDC both unambiguous; `medium` if one ambiguous; `low` otherwise.

## Style rules

CONVENTIONS apply. Three that matter most:

- **Do not infer scheme details from address.** If the appraisal does not state asset class, leave it null.
- **Distinguish derived from stated.** `profit` derived as GDV minus TDC is different from `profit` stated by the valuer; capture which.
- **Preserve units.** Some valuations use sqm, others sqft. Skill does not silently convert.

## Tool dependencies

- The V4 extraction primitive
- `documents.get`

## What goes wrong

1. **Multiple GDVs in the document** (e.g., a Market Value plus a Gross Development Value plus a 180-day disposal value): skill captures the headline GDV per Red Book convention, lists alternatives in `notes`.
2. **The appraisal is a single-page summary**: many fields missing. Skill returns what's there; confidence low.
3. **The appraisal is for a different scheme than the project context**: skill flags via address mismatch with `projectIdHint`. Operator confirms before write.
4. **Phased schemes**: total GDV vs phase-1 GDV. Skill captures both if available; defaults to total.
