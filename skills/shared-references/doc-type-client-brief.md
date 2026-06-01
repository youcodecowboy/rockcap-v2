# Doc type: client brief

The branded, multi-page RockCap **client brief** — the borrower-facing counterpart to the lender brief. Produced via the `client-brief` layout (`model-testing-app/src/lib/docgen/layouts/clientBrief.ts`), composed as structured **`briefData`** (a `ClientBriefData`, not `contentHtml`). It shares the lender brief's exact visual frame (masthead, key-facts block, black page footer, RM sign-off — the shared chrome in `model-testing-app/src/lib/docgen/layouts/briefShared.ts`); the masthead reads **"Client Briefing / Confidential"** instead of "Lender Brief / Strictly Private & Confidential", and the section set is different. Pair with `document-house-style.md` for voice.

## Purpose
A senior, advisory note **sent to the borrower (the client)** *before* going to market. Where the lender brief sells the borrower's deal **to a lender**, the client brief advises the **client** on the indicative lender landscape, the leverage scenarios open to them, and the expected pricing — so they can choose a leverage target and brief RockCap to take the deal out. It is RockCap's pre-market view, not a set of committed terms. **Table-first; 3–5 pages with genuine depth is the target.** Depth beats brevity; do not pad.

## The defining caveat (every client brief carries this)
The client brief is written **before any lender has been approached**. Two disclaimers are mandatory and must appear in the Introduction:
1. *"No lender has yet been approached."*
2. Pricing guidance is **drawn from indicative terms on comparable recent schemes** — it is **expectations, not commitments**, and will be replaced with live indicative terms (and a full comparative analysis + recommendation) once the scheme goes to market.

All figures are indicative and subject to credit approval, valuation, satisfactory due diligence and legal documentation. Never present expected pricing as agreed.

## Source hierarchy (read this first)
The substance is **RockCap's own modelling + the deal's appraisal**, cross-checked against **lender panel intelligence**. The leverage scenarios, cash-equity figures, day-one advances and profit numbers come from the appraisal / model workbook — *never invent them*. The expected-pricing panel comes from recent comparable indicative terms RockCap holds plus lender appetite intel. This inverts the lender brief's hierarchy: there, the deal documents lead and CH charges cross-check; here, **RockCap's model leads** and lender intel supplies the pricing panel.

## Variants
- `new-facility` — pre-market landscape for a **new** senior development facility (default). *Worked example: The Old Dairy.*
- `refinance` — refinance / cash-release of an **incumbent** facility; adds a section critiquing why the current facility is uncompetitive (cost + day-one advance) and shows cash released back to the borrower. *Real example: Land off Fakenham Road, East Rudham (refinancing Assetz).*
- `multi-scenario` — **two scoping cases shown side-by-side** (e.g. include vs exclude a lot from the security), each with its own parameter column and scenario table. *Real example: 92–94 Queenstown Road (with-flats / no-flats).*

Client briefs are sent to the borrower — **confidentiality is EXTERNAL** in practice. (`confidentiality` is kept on the type for parity; the masthead always shows "Confidential".)

## Section set (new-facility; omit any section with no data rather than padding)
1. **Introduction** — what RockCap has modelled, the scoping, the GDV headline, the number of lenders to be approached, and the **mandatory caveats** above (no lender approached yet; pricing is indicative).
2. **Key Deal Parameters** — a parameter/detail table: borrower/SPV, site, development, planning status, GIA/NIA, blended psf, GDV, NDV, land cost, construction (incl. contingency + professionals), programme, facility term modelled. *(`multi-scenario`: two side-by-side option columns instead of one detail column.)*
3. **Market Overview and Leverage Structure** — depth of the market for this size/profile, then the **leverage-scenario comparison table** (per leverage point: senior debt gross, modelled margin, arr./exit fees, cash equity required, developer profit, profit on cost). Follow with the equity-vs-leverage trade-off line and the **personal-guarantee step-up** (typically 20% of loan at 65% → 25–30% at 70%+).
4. **Expected Senior Lender Pricing** — the **lender-panel table**: Lender · Expected Margin · Arr./Exit Fees · Max LTGDV · Commentary, one row per lender to be approached. A caption notes the pricing conventions (margins over Base unless stated; SONIA floors; arrangement fees that include a procuration fee payable to RockCap).
5. **Next Steps** — an owner/action table (Client actions vs RockCap actions): confirm leverage target, supply outstanding borrower docs / SPV / address; RockCap to issue the coordinated approach and produce a side-by-side terms comparison + recommendation once responses are in.

### `refinance` variant — additional / modified sections
- After **Key Deal Parameters**, add **"The Current [Incumbent] Facility: Why We Regard It as Uncompetitive"** — two sub-points: **cost** (implied effective margin vs market) and **day-one advance** (how little the incumbent released, and the unplanned equity the borrower had to inject).
- The leverage table becomes **Refinance Scenarios and Cash Release**: add **day-one land proceeds** and **mezzanine/equity-stretch net proceeds** rows, and frame the cash-equity row as **cash released back** to the borrower.

## Key facts (the branded key-facts block)
Borrower / SPV, Site, Development (units + planning status), GDV (with blended psf), Net Development Value, Land cost, Construction, Programme, Relationship Manager. Each a short label + value. (Keep to the figures that exist in the model/appraisal; omit a line rather than guess.)

## Sign-off
The named Relationship Manager: name, role, email, phone.

## Formatting & layout
Identical engine rules to the lender brief (enforced via the shared chrome): **section blocks never split across a page break**; the heading stays with its first content; tables never split mid-row; the sign-off is one block. Prefer whole-block placement over tight page-fill. Tables are the primary tool for any 3+ figures; cite sources as caption subtext; never a wall of numbers in prose.

## Composing & rendering
Compose the brief as a structured **`briefData`** object (a `ClientBriefData` — `model-testing-app/src/lib/docgen/types.ts`) and call **`generateBrief`** (MCP: **`document.generateBrief`**) with `{ layout: "client-brief", briefData, title, clientId }`. The tool renders PDF + DOCX (via `/api/documents/generate` → `renderDocument`) and stages a `document_publish` approval. Section `bodyHtml` is injected raw — emit clean semantic HTML (`<p>`, `<table>` with `class="num"` on numeric cells, `class="caption"` on source/footnote lines; no `<html>`/`<head>`/`<style>` wrappers). Shell fields (title, meta, key facts, sign-off) are escaped by the layout.

## Sourcing the brief (required)
1. **Read the appraisal / model first.** `document.search` / `document.get` (download via `fileStorageId`) for the development appraisal and the model workbook — this is where GDV, cost, profit, the leverage scenarios, cash-equity and day-one-advance figures live. `project.getDeepContext` / `client.getDeepContext` for identity, scheme and financing context.
2. **Build the lender panel from intel + recent terms.** `lender.matchForDeal` to shortlist the panel; `lender.getDeepContext` / `lender.getAppetite` / `intelligence.searchLenders` for each lender's expected margin, max LTGDV and commentary; cross-check against the indicative terms RockCap has received on comparable recent schemes. Note which lenders RockCap transacts with most often.
3. **(refinance only)** Read the **incumbent's** facility terms to build the cost + day-one-advance critique; mark figures implied vs confirmed and reconcile against the latest loan statement when available.
4. **Cite or hedge.** Scenario figures trace to the model; pricing is labelled indicative/expected. Mark genuine gaps plainly ("address to confirm", "SPV TBC").

## Avoid
- Presenting expected pricing as committed/agreed terms, or omitting the "no lender approached yet" caveat.
- Inventing scenario numbers, cash-equity figures or day-one advances — they come from the model/appraisal.
- Stating margins without the Base/SONIA basis, or quoting a procuration-fee-inclusive arrangement fee without flagging the RockCap proc fee.
- Padding empty sections (omit a section with no data).

## Worked example
**The Old Dairy** (Innocent Group / Vantage & Co JV, `new-facility`, EXTERNAL): 5 sections — Introduction (with caveats), Key Deal Parameters, Market Overview & Leverage Structure (three-point leverage table), Expected Senior Lender Pricing (eleven-lender panel), Next Steps. Reproducible via `model-testing-app/src/__tests__/clientBriefExample.test.ts`.
