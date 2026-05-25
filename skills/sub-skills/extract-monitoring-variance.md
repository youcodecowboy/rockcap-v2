# extract-monitoring-variance

Compute variances between a monitoring report and the underwriting baseline. Used by monitoring-watcher (primary), deal-triage (to flag at-risk monitoring deals), case-study-author (for closed-deal retrospectives).

## When to use

After a monitoring document arrives or when a periodic monitoring check is due. Inputs vary: a freshly extracted monitoring report, a cost-to-complete update, a sales update.

## Inputs

Required:

- `projectId`: the project being monitored
- `period`: `{ year: number, month: number }` or `{ year: number, quarter: number }`

Optional (at least one source of monitoring data should be present, either via documents or directly):

- `monitoringDocumentIds[]`: documents covering this period
- `monitoringDataDirect`: pre-extracted figures `{ buildCostToDate?, buildCostForecastAtCompletion?, unitsSold?, unitsReserved?, salesRealised?, weeksAheadBehindProgramme? }`

## Outputs

```ts
type VarianceReport = {
  period: { year: number; month?: number; quarter?: number };
  baseline: {
    modelRunId: Id<"modelRuns">;
    gdv: number;
    tdc: number;
    buildCost: number;
    programmeMonths: number;
    projectedSalesByPeriod: number;
  };
  actuals: {
    buildCostToDate: number;
    buildCostForecastAtCompletion: number;
    unitsSold?: number;
    unitsReserved?: number;
    salesRealised?: number;
    weeksAheadBehindProgramme: number;        // negative = behind
  };
  variances: {
    buildCostOverrunPercent: number;
    programmeDeltaWeeks: number;
    salesPaceVariancePercent?: number;
    revenueVariancePercent?: number;
  };
  flags: VarianceFlag[];
  trend: { worsening: boolean; samePeriodsCount: number };
  confidence: "high" | "medium" | "low";
};

type VarianceFlag = {
  dimension: "cost" | "programme" | "sales" | "revenue" | "covenant";
  severity: "noted" | "concern" | "material";
  message: string;
  threshold: string;
  recommendedAction: string;
};
```

## Workflow

1. Load the project's underwriting baseline via `modelRuns.getLatest` filtered for the at-drawdown version.
2. Load actuals: from `monitoringDataDirect` if provided, else extract from `monitoringDocumentIds` using the V4 extraction primitive with a monitoring schema.
3. Compute variances:
   - Build cost overrun = (buildCostForecastAtCompletion - baseline.buildCost) / baseline.buildCost
   - Programme delta = weeksAheadBehindProgramme (already signed)
   - Sales pace variance = (unitsSold / expectedUnitsSoldByPeriod) - 1
   - Revenue variance = (salesRealised / expectedSalesByPeriod) - 1
4. Apply thresholds (RockCap-standard):
   - Build cost: `>5%` noted, `>10%` concern, `>15%` material
   - Programme: `>4 weeks behind` noted, `>8 weeks` concern, `>12 weeks` material
   - Sales pace: `>15% behind` noted, `>25%` concern, `>35%` material
   - Covenant headroom: any breach is material
5. Check trend: load prior period's variance report and see if any dimension worsened.
6. Generate flags. For each flag, set severity, threshold breached, and a recommended action ("request QS update on M&E package", "discuss sales rate adjustment with marketing agent").
7. Return the structured variance report.

## Style rules

CONVENTIONS apply. Three that matter most:

- **Numbers, then narrative.** Severity is computed from the threshold, not from adjectives in the source.
- **Trend matters.** A 6% cost overrun is `noted`; the same 6% overrun three months in a row is `concern` even though it never crossed the absolute threshold.
- **Specific recommended actions.** "Request QS update on the M&E package re-tender" beats "Investigate cost overrun".

## Tool dependencies

- `modelRuns.getLatest`, `modelRuns.getByPeriod`
- `documents.getByProject` (for monitoring docs)
- The V4 extraction primitive with monitoring schema
- `knowledge.queryIntelligence` (for prior periods)

## What goes wrong

1. **Baseline missing**: project has no modelRuns at drawdown. Skill flags and uses the most recent run as the proxy baseline; lowers confidence.
2. **Monitoring data inconsistent across docs in same period**: QS report says one cost-to-date, drawdown statement says another. Skill captures both, flags the conflict.
3. **Sales not started yet**: project too early. Sales-related variances null; do not flag.
4. **Build complete, monitoring continues for sales**: build cost variance fixes; sales variance continues. Skill switches focus accordingly.
5. **Period overlaps two reporting cycles** (e.g., a quarterly report mid-cycle): skill matches the period it's asked for; warns if the documents straddle.
