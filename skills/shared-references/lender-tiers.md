# Lender tiers

Which lenders RockCap has protected or preferred relationships with, and the outreach rule each tier triggers. Consult this before drafting any cold outreach: some prospects must be parked, others need a softened hook, based on who they already borrow from. Pitching the borrowers of a favourite lender on debt cold can damage RockCap's most valuable lender relationships.

**Provenance:** Alex Lundberg's stated lender relationships (first-source, captured 2026-05-28 onward). This markdown is the human-readable source of truth and rationale. The code mirror that the app reads at draft/pick time is `model-testing-app/convex/lib/lenderTiers.ts`; keep the two in sync (add a lender here first, then mirror it in the config).

## Tiers

### Tier 1: Favourite lenders — FULL PARK
Relationships so strong that RockCap should not approach their borrowers on debt cold.

| Lender | Captured | Notes |
|---|---|---|
| Quantum Development Finance | 2026-05-28 | Alex's favourite lender, best relationship. |

**Action when a prospect borrows from a Tier 1 lender:**
- Park the prospect. Do not draft a cold debt send.
- The park is surfaced as a prospect flag (see "How the app consumes this").
- Keep the specific lender name out of HubSpot notes or anything third parties could see; the reason lives here.
- Consider a non-debt angle instead (investor-intro framing, a mezz layer the lender does not provide).

### Tier 2: Preferred / liked lenders — SOFTEN HOOK
Lenders RockCap likes and works with. Pitching their borrowers is acceptable, but the approach must not telegraph scheme-level interest; the lender could see RockCap engaging with their borrower on Companies House data and feel it as an intrusion.

| Lender | Captured | Notes |
|---|---|---|
| Yellow Tree | 2026-05-28 | RockCap likes them. Keep the prospect in outreach but soften the hook to broad-brush. |

**Action when a prospect borrows from a Tier 2 lender:**
- Keep the prospect in active outreach.
- Force the hook down to the generic-market rung ("how are you finding the market at the moment?"). Do not reference named schemes, charges, acquisitions or planning, i.e. anything that signals you have researched their portfolio.
- Log the soften reason here, not in the prospect-facing email.

## Decision tree

```
Prospect's charge holders (group-wide) include a lender in this file?
├── Tier 1 lender → PARK (do not send; raise the park flag)
├── Tier 2 lender → SOFTEN (keep in pipeline, force hook rung 10 broad-brush)
└── Neither → normal hook-ladder selection
```

## How to detect a conflict

1. Pull the prospect's group lenders (the distinct chargee names across the parent + sibling SPVs, from `companies.getGroupCharges`).
2. Match each against this file (and its code mirror).
3. Any Tier 1 match → park. Any Tier 2 match (and no Tier 1) → soften. Else normal.

Matching is on the lender name; allow for minor variants (e.g. "Quantum Development Finance LTD" vs "Quantum Development Finance"). The code mirror normalises case and trims a trailing company suffix before comparing.

## How the app consumes this

- `companies.getLenderTierConflict({clientId})` reads the group lenders and returns `{ action: "park" | "soften" | "none", tier1: [...], tier2: [...] }`.
- The prospect detail surfaces the result as a **flag chip** ("Parked: Tier 1 lender" / "Soften: Tier 2 lender") so it is visible without exposing the lender name in HubSpot.
- The prospect-intel cadence step consults it before composing: park means no draft; soften means force the broad-brush hook.

## Worked examples

- **Mackenzie Miller Homes** borrows heavily from Quantum Development Finance (group-wide, including its live Leighterton and Temple Guiting schemes). Quantum is Tier 1, so Mackenzie Miller is a **park**: do not pitch debt cold.
- **Decimus Property** borrows from Yellow Tree (Tier 2): kept in outreach but the hook is softened to "how are you finding the market at the moment?" to avoid telegraphing CH-research interest.
- **Esquire Developments** parked from a W22 batch for a Quantum (Tier 1) relationship conflict.

## Growth

Currently capturing favourite (Tier 1) and preferred (Tier 2) lenders only. Likely additions over time: further Tier 1 / Tier 2 lenders, neutral lenders where RockCap competes happily, and thin-relationship lenders with no conflict. Add new entries here first, then mirror in the code config.

## Cross-references

- `rockcap-outreach-voice.md` — the hard rule "check lender tiers before drafting".
- `hook-ladder.md` — the soften rule forces rung 10.
- Code mirror: `model-testing-app/convex/lib/lenderTiers.ts`.
