# ADR 0001: Deal vs Project naming

- **Status**: Accepted
- **Date**: 2026-05-19
- **Backlog item**: BL-1.0
- **Decider**: project owner (confirmed in design conversation)

## Context

The project brief defines a "Deal" entity as one transaction attempt, with a `predecessor_deal_id` for re-engagement and the deal lifecycle (state machine, milestones, lender approaches, information requests) hanging off it.

The current Convex schema has two tables that could fill that role:

- **`deals`**: thin HubSpot deal projection. Carries `hubspotDealId`, status (new/contacted/qualified/negotiation/closed-won/closed-lost), pipeline. Used during the prospecting and qualification phases.
- **`projects`**: internal financing tracking table. Carries the `dealPhase` state machine (indicative_terms / credit_submission / post_credit / completed), clientRoles, folder structure, scenarios, model runs, and intelligence singletons.

The brief's "Deal" concept maps closer to `projects` than to `deals`. The audit (`skills/inventory/02-convex-schema.md`) flagged this as the largest naming question because most of the missing entities (LenderApproach, InformationRequest, Milestone) hang off the Deal concept and need to know which table to point at.

## Options considered

### Option A: Keep both. `projects` becomes the operational Deal; `deals` stays as the HubSpot projection.

Schema extensions hang off `projects`. UI may surface the term "Deal" in user-facing copy but the table name stays `projects` to avoid renaming risk. The `deals` table continues to be the HubSpot read-projection populated by `hubspotSync/`.

Pros: zero rename risk; no migration needed; uses the existing dealPhase state machine; keeps the HubSpot projection cleanly separated.

Cons: ongoing terminology mismatch between internal code (`projects`) and external-facing language (Deal). New contributors need to learn the convention.

### Option B: Rename `projects` to `deals` and rename the existing `deals` to `hubspotDealProjections`.

Pros: code matches the brief's language.

Cons: large rename across 80+ Convex files. Risk to live functionality. HubSpot integration code would need broad updates. Not justified by the benefit.

### Option C: Collapse to a single Deal table.

Pros: simplest mental model.

Cons: `deals` and `projects` carry different lifecycle states and link patterns. Collapsing would require schema work and would conflate the "HubSpot says this is a deal" signal with the "RockCap is engaged on this transaction" signal. Loses information.

## Decision

**Option A. Keep both. `projects` becomes the operational Deal by extension; `deals` stays as the HubSpot projection.**

## Consequences

### Affirmative

- All WS-1 schema extensions hang off `projects`:
  - `predecessorProjectId` added to `projects` (BL-1.1)
  - `LenderApproach.projectId` (BL-1.4)
  - `Milestone.projectId` (BL-1.6)
  - `Cadence` references persons, not projects directly, but cadence-firing reads from projects
- The `deals` table continues to be populated by `hubspotSync/deals.ts`. It is read-only from the rest of the codebase. The link from a `deal` to its operational `project` is `deals.linkedProjectId`.
- The chat assistant's tool catalogue should expose a `deal.*` namespace (per WS-7.2) that maps to `projects.*` Convex functions. The MCP server surface uses Deal terminology; the underlying Convex calls use project terminology. The boundary is the tool name, not the schema.
- UI copy can use "Deal" freely. Internal code uses "project". Document this in `skills/CONVENTIONS.md` (BL-6.0).

### What this rules out

- We do not rename the `projects` table. Any future proposal to rename has to argue against this decision explicitly.
- We do not merge `deals` and `projects`. The HubSpot projection stays separate from the operational state.
- We do not add a third "Deal" table on top of both. Two is enough.

### Open follow-ups

- BL-7.2 namespace tightening adds the `deal.*` tool namespace as an alias layer over the existing `project.*` tools. Existing tool names stay valid (deprecation, not rename, per WS-0 rule 7).
- When the InformationRequest extension lands (BL-1.5), confirm whether `knowledgeChecklistItems.projectId` should be renamed to `dealId` in any UI surface. Schema field stays `projectId`.
