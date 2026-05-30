# scheme-from-charges

Sub-step of prospect-intel. Turns a prospect's per-scheme Companies House charges into a deep, operator-confirmable estimate of what each LIVE scheme is building. Output persists to the `prospectSchemes` table (one row per SPV) via `companies.upsertProspectScheme`, and powers the prospect detail **Track Record** tab.

## When to run

After the corporate-group walk (SKILL.md step 8b) and the lender DNA analysis, once the group's SPVs are synced and `companies.getProspectSchemes({clientId})` returns the live schemes. Run for the LIVE schemes (SPVs with an outstanding charge) — those are the active sites worth researching. Past/satisfied schemes are historic; enrich them only if the operator asks.

## Inputs

- The prospect's `clientId`.
- `companies.getProspectSchemes({clientId})` → `live[]` schemes, each with `companyNumber`, `companyName`, `charges` (with the particulars/description text), a candidate `address` (parsed from the charge particulars), `lenders`, `lastChargeDate`.

## Per-scheme workflow

Do this for each live scheme; prioritise the 5-7 most recent (by `lastChargeDate`) unless the operator wants the full set.

1. **Start from the candidate address** (from the charge particulars). If it is absent or garbled, derive the best address you can from the particulars; if still nothing, note it and skip enrichment for that scheme.
2. **Research as deep as possible — cite every source:**
   - Planning portal (the local planning authority, or a national planning search) for the address → the application(s), the description of development, unit count, status. Capture the planning reference(s).
   - The developer's own website scheme page, if the scheme is listed → units, type, completion.
   - Local press / planning news for the scheme.
   - Property listings (Rightmove / Zoopla) for units for sale or sold at the address → unit count and values (helps a GDV estimate).
3. **Synthesise an estimate:** `schemeType` (e.g. "bespoke detached new-build", "barn conversion", "strategic land allocation"), `estimatedUnits`, `whatBuilding` (one to two sentences of prose), `gdvEstimate` (a RANGE with a basis, never a naked number — see `../../shared-references/deal-type-size-bands.md`), a `confidence` label (high / med / low), and the `sourceUrls`.
4. **Persist** via `companies.upsertProspectScheme({ clientId, companyNumber, companyName, address, planningRefs, estimatedUnits, schemeType, whatBuilding, gdvEstimate, confidence, status, sourceUrls })`. Do NOT pass `operatorConfirmed` — it defaults to false (a draft). The operator confirms in the Track Record tab.

## Rules

- **Estimates only.** Every figure cites a source; if you cannot find it, say so and lower confidence. No fabrication (CONVENTIONS): do not invent unit counts, GDV, or planning references.
- **Never assert which lender funded a scheme** beyond what the charge register shows (see `lender-dna-from-charges.md` "What not to do").
- **Re-run hygiene.** Skip a scheme already enriched unless it is stale (older than 30 days, or a new charge has appeared since the last research) or it is unconfirmed and you now have better data. Never clobber an operator-confirmed row (the mutation guards this; a re-run that omits fields will not clear confirmed content).
- **Cap depth sensibly.** The 5-7 most recent live schemes are the priority. Do not research dissolved or satisfied schemes unless asked.

## What goes wrong

- The address from the particulars is a vague "land at X" with no postcode → the planning search may be ambiguous; capture the best match, lower confidence, cite the query.
- Multiple planning applications at one address (outline + reserved matters + amendments) → cite the most recent material one and note any phasing.
- No planning or listing footprint (a very new site) → `whatBuilding` stays sparse; record what the charge particulars and the developer's site imply, at low confidence.

## Tool dependencies

- `companies.getProspectSchemes` — read the live schemes + candidate addresses.
- `companies.upsertProspectScheme` — persist the draft estimate.
- `WebSearch` / `WebFetch` — planning portal, local press, listings, developer site.
