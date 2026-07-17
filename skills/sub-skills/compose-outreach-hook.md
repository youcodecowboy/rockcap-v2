# compose-outreach-hook

Sub-skill: given a prospect's intelligence, select and write the single personalised **hook line** for a cold outreach touch, applying the lender-tier gate and Alex's voice. This is the reusable primitive behind the personalisation slot in every RockCap cold send.

Used by prospect-intel (cadence touch 1), qualify-and-draft (warm reply openers), and any `outreach.draftFreshEmail` borrower-side draft. Authored as a primitive because the same "pick the strongest honest hook" decision recurs everywhere RockCap reaches out.

## What it does

Fills the `<HOOK>` slot in the opener skeleton (`../shared-references/rockcap-outreach-voice.md`). Everything else in the opener is constant. The sub-skill turns a prospect's intel into one short, honest, voice-correct sentence, plus the metadata an operator needs to decide whether to upgrade it manually.

## When to use

- prospect-intel composes the cadence package and needs touch 1's hook.
- An operator says "draft a cold send to {prospect}".
- qualify-and-draft needs a warm opener (use the warm variants, not the cold "I came across" lead).

## Inputs

Required:
- `clientId` (the prospect's `clients` row).

Evidence pulled during the workflow (not passed in):
- `companies.getProspectSchemes({clientId})` — scheme names, addresses, what-they-are-building, planning refs, per scheme.
- `companies.getGroupCharges({clientId})` — group charge density + distinct lenders.
- `companies.getLenderTierConflict({clientId})` — the park / soften / none gate.
- Region: HubSpot city / county, or charge particulars.
- `../shared-references/sender-geography.md` and `rockcap-regional-activity.md` for the geographic rungs.

## Outputs

A `HookChoice`:
- `action`: "park" | "soften" | "normal" (from the lender-tier gate).
- `rung`: the chosen hook-ladder rung (1-10), or null if parked.
- `text`: the composed hook sentence (or null if parked).
- `evidence`: the specific facts the hook rests on (scheme name + source URL, region match, charge count, etc.).
- `confidence`: high / medium / low.
- `needsConfirmation`: true for personal-geography (rung 3) and unverified named-scheme (rung 2) claims.

Surface-only. This sub-skill never sends. The hook lands in a drafted touch for operator review.

## Workflow

1. **Lender-tier gate first.** Call `companies.getLenderTierConflict`. If `action: "park"` (Tier 1 lender), stop: produce no hook, return `action: "park"`, and let the caller raise the park flag and skip drafting. If `action: "soften"` (Tier 2), force the hook to rung 10 (generic market) regardless of other evidence, and do not reference schemes, charges, planning or acquisitions. See `../shared-references/lender-tiers.md`.

2. **Gather evidence.** Pull schemes, charges, region, and any `scheme-from-charges` research findings. Note which rungs each piece of evidence could support.

3. **Run the hook ladder** (`../shared-references/hook-ladder.md`). Rank candidate rungs strongest first; pick the **highest rung where the evidence is confident and honest**. Typical auto-reachable rungs from our data: rung 8 (5+ active charges), rung 7 (track record), rung 4 (region matches `rockcap-regional-activity.md`), rung 2 (a current named scheme from `getProspectSchemes`). Rungs 1, 5, 6 need the research step and are surfaced for review. Rung 3 needs a `sender-geography.md` match and confirmation.

4. **Apply voice and the credit-attribution rule.** Compose in Alex's voice (`rockcap-outreach-voice.md`): UK English, no em dashes, no promotional adjectives, one short sentence. For family or long-standing businesses, use present-tense credit ("have a fantastic business", not "have built up").

5. **Compose and expose.** Write the hook sentence. Set `evidence`, `confidence`, and `needsConfirmation`. Return the `HookChoice` for the caller to place in the draft and show to the operator.

### Rung 9 — sub-sector match (Deal Book)

After computing the prospect's sector (from scheme/charge evidence) and region, call `caseStudy.matchForProspect({ sector, region })`. If it returns one or more entries, surface the top entry's `headline` as a candidate hook for operator review — e.g. *"we've arranged funding on a couple of BTR/rental schemes in the North West"*. Never emit a borrower/prospect-side name. If it returns nothing, fall through to the next-best honest rung (7/8). This rung is anonymised by construction; the match payload carries no client names.

## Style rules

- One short sentence. The hook is a single clause after "wanted to reach out, ".
- Never fabricate a scheme name, planning event, architectural detail, or geographic claim. Drop a rung instead.
- Never name a prospect-side client (rungs 4 and 9 use regions / RockCap-led deals only).
- Personal-geography (rung 3) and named-scheme (rung 2) hooks set `needsConfirmation: true`; they are candidates for the operator, not auto-final.
- UK English, no em dashes (the hook obeys `rockcap-outreach-voice.md`).

## Tool dependencies

- `companies.getLenderTierConflict` — the park / soften gate (step 1).
- `companies.getProspectSchemes` — scheme names / addresses / what-building (rungs 1, 2, 5, 8).
- `companies.getGroupCharges` — charge density + lenders (rungs 7, 8; lender input to the gate).
- `WebSearch` / `WebFetch` via the prospect-intel `scheme-from-charges` step — rungs 1, 5, 6.

## What goes wrong

1. **Tier 1 lender.** Park, no hook. Caller raises the park flag and skips the draft. Do not try to find a "safe" hook; the prospect is out of the cold cycle.
2. **Tier 2 lender.** Force rung 10 broad-brush even when rich evidence exists. Telegraphing CH research to a Tier 2 lender's borrower is the risk being avoided.
3. **No honest specific evidence.** Fall to rung 8 if charge-dense, else rung 7, else rung 10. Flag that research could lift the hook.
4. **Unconfirmed personal-geography.** If a `sender-geography.md` match cannot be confirmed true, fall back to rung 4 (RockCap-active-in-region) rather than send an unverified personal claim.
5. **Family / long-standing business.** Apply the credit-attribution rule; present tense, not "built up".

## References

- `../shared-references/hook-ladder.md` — the ranked rungs and their data sources.
- `../shared-references/rockcap-outreach-voice.md` — the voice, skeleton, and hard rules.
- `../shared-references/lender-tiers.md` — the park / soften gate.
- `../shared-references/rockcap-regional-activity.md` and `sender-geography.md` — the geographic rung data.
