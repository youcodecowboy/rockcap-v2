# score-lender-match

Score a candidate lender against a specific deal's profile, producing a ranked recommendation usable for the lender shortlist. Used by terms-package-build (computing the initial shortlist) and lender-intel (matching-mode invocation).

## When to use

When a skill needs an ordered list of "which lenders are likely to be a fit for this deal". Replaces hand-curated lender lists with a data-driven ranking.

## Inputs

Required:

- `projectId`: the deal
- `candidateLenderClientIds[]`: optional explicit shortlist; defaults to all `clients` with `type: "lender"` and `status` in (`active`, `prospect`).

Optional:

- `weights`: override the default scoring weights `{ pricing, leverage, speed, behavioural, fit }` (default 25/25/15/20/15)
- `hardFilters`: explicit eliminators (e.g., minimum ticket size, required asset class)

## Outputs

```ts
type LenderScore = {
  lenderClientId: Id<"clients">;
  lenderName: string;
  totalScore: number;                    // 0-100
  componentScores: {
    pricing: number;                     // 0-100; based on recent indicatives vs deal
    leverage: number;                    // 0-100; their max LTGDV/LTV vs deal need
    speed: number;                       // 0-100; their typical approach-to-close days
    behavioural: number;                 // 0-100; convert rate, slippage history
    fit: number;                         // 0-100; asset class, geography, ticket size
  };
  bdmContactId?: Id<"contacts">;
  caveats: string[];                     // notable things the operator should know
  hardFilterPassed: boolean;
  hardFilterReasons: string[];           // populated when hardFilterPassed is false
};

type ScoreResult = {
  ranked: LenderScore[];
  filtered: LenderScore[];               // failed hard filters; surface separately
  notes: string[];
};
```

## Workflow

1. Load the project's profile via deal context: scheme type, location, asset class, GDV, TDC, target facility size, target leverage, timing constraint.
2. For each candidate lender, load their profile graph-first: `lender.getDeepContext` (read its `graph` section — facilities, atom counts, top edges — for the lender's actual charge/facility footprint), plus live appetite from `appetiteSignals` where `isCurrent: true` and behavioural from `lenderApproaches` history. If the graph section is empty (lender not yet atomized), fall back to the static layer on `clientIntelligence`.
3. Apply hard filters first:
   - Min ticket size: lender's stated min must be at or below deal facility.
   - Max ticket size: lender's stated max must be at or above deal facility.
   - Asset class: deal asset class must be in lender's allowed set.
   - Geography: deal location must be in lender's geography (UK-wide, London-only, etc.).
   - Currency: deal currency must match lender's accepted currencies.
   - LTGDV ceiling: deal target leverage must not exceed lender's stated maximum.
   Lenders that fail any hard filter go into `filtered` with reasons; they do not get component scores.
4. For lenders that pass, compute component scores:
   - **Pricing**: invert distance from deal's target rate to lender's recent indicative pricing. Lenders without recent pricing get a baseline.
   - **Leverage**: distance from deal's target leverage to lender's published max; closer is better.
   - **Speed**: inverse of mean days from approach to credit decision in `lenderApproaches` history.
   - **Behavioural**: composite of convert rate, indicative-to-final slippage, withdrawn-rate. Each on a 0-100 scale; combined weighted.
   - **Fit**: lender's preferred sweet-spot (their typical deal profile) versus the deal. Closer is higher.
5. Apply weights and compute `totalScore`.
6. Add caveats: anything notable that the score does not capture ("relationship has been thin since BDM moved firms", "this lender has been declining mid-market deals lately").
7. Return ranked + filtered.

## Style rules

CONVENTIONS apply. Two that matter most:

- **The score is advisory.** Skills that consume it should surface the ranking but accept operator overrides without protest.
- **Caveats matter.** A high-scoring lender with a recent decline pattern needs that flagged. The score is a starting point.

## Tool dependencies

- `project.get`, `project.getDeepContext` (graph section) / `atoms.search` (fallback: `intelligence.getProjectIntelligence` when the project's graph is empty — not yet atomized)
- `appetite.getCurrentForLender`
- `lenderApproach.listByLender` (for behavioural)
- `lender.getDeepContext` (graph section: facilities + atoms; fallback: `intelligence.getClientIntelligence` for the static layer when the lender is not yet atomized)
- `contact.get` (for BDM resolution)

## What goes wrong

1. **No appetite data for any candidate**: skill returns scores based on static layer + behavioural only; flags the absence of appetite data in `notes`.
2. **Behavioural sample too small**: lender has fewer than 3 historical approaches. Behavioural score uses defaults; flagged.
3. **Lender's stated and behavioural ranges contradict** (says they do up to £20m, but every recent deal was sub-£5m): skill captures both; recent behavioural overrides the stated when confidence is high.
4. **Hard filters eliminate all candidates**: skill returns empty ranked and surfaces the most-near-miss in filtered, so the operator can decide whether to relax a filter.
