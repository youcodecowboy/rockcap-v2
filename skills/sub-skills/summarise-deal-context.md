# summarise-deal-context

Produce a compact, scannable summary of a deal's current state for inline display: chat replies, meeting prep, daily briefs, anywhere the operator needs to know "where is this deal right now". Used by meeting-prep, deal-triage, the chat assistant for context-loading, and any skill that wants quick situational awareness without pulling full intelligence.

## When to use

When the caller needs a 200-word-or-less summary of a deal, not the full intelligence dump. For full context, use the planned `deal.get_full_context` primitive (BL-5.4) directly.

## Inputs

Required:

- `projectId`: the deal

Optional:

- `audience`: `"operator_internal"` (default), `"client_facing"`, `"lender_facing"`. Tunes the summary's emphasis.
- `lookbackDays`: how recent the "recent activity" portion looks; default 14

## Outputs

```ts
type DealSummary = {
  project: { name: string; shortcode: string; dealPhase: string; clientName: string };
  headlineFigures: {
    gdv?: string;          // formatted, e.g. "£28m"
    facility?: string;     // formatted, e.g. "£18m at 65% LTGDV"
    selectedLender?: string;
    timeline?: string;     // e.g., "drawdown targeted Q3 2026"
  };
  status: string;          // one-paragraph status, register-matched to audience
  recentActivity: string;  // bulleted recent touchpoints and milestones
  openItems: string[];     // 1-5 bullet outstanding items
  risks: string[];         // 0-3 bullet flagged risks
};
```

## Workflow

1. Load the project via `project.getDeepContext` (read its `graph` section — atom counts, top edges, facilities), plus recent `touchpoints`, open `milestones`, outstanding `knowledgeChecklistItems`, and any `flags` rows. If the graph section is empty (project not yet atomized), fall back to `projectIntelligence`.
2. Build `headlineFigures`:
   - GDV from the graph (`atoms.search` for the GDV atom); fall back to `projectIntelligence.financials.gdv` for a not-yet-atomized project
   - Facility from the selected lenderApproach's `finalTerms` (or `indicativeTerms` if pre-credit)
   - Selected lender's name if a lenderApproach is past `indicative_received`
   - Timeline from the nearest upcoming milestone
3. Build `status`: one paragraph in the right register.
   - **operator_internal**: factual, no softening. "At credit_submission with Lender A. Two info-request items outstanding; expected decision next Thursday."
   - **client_facing**: same facts, gentler tone. "We're now with Lender A's credit team. They've asked us for two more items; decision expected late next week."
   - **lender_facing**: precise, defensive of the deal. "Deal is at credit_submission. We're working through the latest information request items; full pack expected by Thursday."
4. Build `recentActivity`: up to 5 recent touchpoints / milestones within `lookbackDays`. Format as `"DD Mon: <one-line description>"`.
5. Build `openItems`: 1 to 5 outstanding asks from the project. Lead with blocking items. Cite who is on the hook for each.
6. Build `risks`: 0 to 3 flagged risks from `flags` rows or from `monitoring-watcher` outputs. Empty list if nothing is flagged.
7. Return the structured summary. Total word count target: 200 or under.

## Style rules

CONVENTIONS apply. Three that matter most:

- **Tight.** This is for fast consumption. Sentences are short; bullets are short.
- **Audience-tuned.** The same deal looks slightly different to an operator, a client, and a lender. Each audience gets only what they need.
- **Honest.** Risks get listed even in client-facing summaries; the wording softens but the facts do not change.

## Tool dependencies

- `project.get`, `project.getDeepContext` (graph section), `atoms.search` (fallback only, when the graph section is empty — project not yet atomized: `intelligence.getProjectIntelligence`)
- `touchpoint.getByProject`
- `milestone.listByProject`
- `knowledge.getChecklistByProject`
- `flags.getByEntity`
- `lenderApproach.listByProject`

## What goes wrong

1. **Brand-new deal**: little to summarise. Skill produces a short version flagging that the deal is in early stage.
2. **Deal with conflicting intelligence**: skill picks the most recent / highest confidence value and notes the alternative in `status`.
3. **Client-facing audience but the deal is in a difficult patch**: skill does not hide bad news; phrases it factually. Operator approves the final message.
4. **Lender-facing audience for a deal that has already closed**: skill notes the closed status and recommends the case study as the appropriate artefact instead.
