# Lender DNA from Companies House Charges

Reference loaded by `../SKILL.md` step 4. This document defines how to read a UK developer's secured borrowing history off the Companies House charge book and turn it into a structured lender DNA picture.

## What you have to work with

For a UK limited company, Companies House exposes:

- **Charges**: each secured borrowing agreement filed by the company. Includes a charge ID, a date created, a status (outstanding or satisfied), the persons entitled (the lender or security agent), a free-text description, and links to the underlying filings.
- **Officers**: directors and secretaries with appointment and resignation dates.
- **PSCs**: persons with significant control.

The charge book is the primary source for lender DNA. The other two are corroborating context.

## What lender DNA means

Lender DNA is a structured summary of which lenders this developer borrows from, in what shape, with what current exposure. Five sub-views:

1. **Current lenders**: outstanding charges grouped by lender.
2. **Historical lenders**: satisfied charges, grouped by lender, with the dates the charge was created and satisfied.
3. **Lender mix**: bank, challenger bank, specialist development lender, bridging lender, debt fund, private credit, family office, security agent for a syndicate.
4. **Pattern signals**: serial-bridger (multiple short-tenor bridging charges), bank-loyal (multiple charges with the same high-street bank), pivot pattern (shifted from one lender type to another over time), syndicate-user (security agent on file).
5. **Maturity profile**: where charges are time-stamped, the implied tenor of recent borrowings.

## How to extract it

For each charge in the company's charge book, classify the `persons-entitled` field:

### Step 1: identify the named entity

The `persons-entitled` field carries the legal name of the secured party. Common shapes:

- A direct lender: "HSBC UK Bank Plc", "OakNorth Bank Plc", "Together Commercial Finance Limited".
- A security agent or trustee: "Apex Corporate Trustees (UK) Limited", "GLAS Trust Corporation Limited". Common when a syndicate is on the loan; the security agent is on title and the actual lender is not visible from Companies House alone.
- A private lender via an SPV or holding entity: "Acme Holdings Limited", a name with no public lender footprint. Often a high-net-worth individual or family office acting through a vehicle.
- A fund manager: "Cheyne Real Estate Credit Holdings Fund", "ICG Real Estate Fund". The fund vehicle is on file directly.

### Step 2: classify by lender type

Map the named entity to a lender type. The rough taxonomy:

- **High-street bank**: HSBC, Lloyds, NatWest, Barclays, Santander UK, Bank of Scotland. Conservative LTVs, slow execution, full covenant packages.
- **Challenger bank**: OakNorth, Aldermore, Shawbrook, Allica, Cambridge & Counties, Hampshire Trust, Investec. More flexible than the big six but still bank-style underwriting.
- **Specialist development finance**: Together, Hampshire Trust development, Octopus Real Estate, Maslow Capital, Pluto Finance. Built around schemes with build risk; price reflects the risk.
- **Bridging**: MT Finance, Roma Finance, Octopus Bridging, LendInvest, Glenhawk, Aldermore Bridging. Short tenor, high price, no construction monitoring expected.
- **Debt fund and private credit**: ICG, Cheyne, Blackstone Real Estate Debt, Maslow Capital (overlaps with development), Cain International, Pluto. Larger ticket, more bespoke.
- **Security agent for syndicate**: Apex, GLAS, GLAS Trust, US Bank Trustees, BNY Mellon. Flag "syndicate inferred"; the actual lenders are not on the public record. Note the count of distinct charges with the same security agent on the same date as a syndicate signal.
- **Private/SPV**: any named entity without a public lender footprint. Note it as "private" without speculating about the underlying.
- **Group internal**: charges from a parent or affiliate of the borrower. Verify by cross-referencing PSC and officer overlap.

### Step 3: time-bucket

For each charge:

- Outstanding versus satisfied (read off charge status directly).
- Created date (read off charge filing).
- If satisfied, satisfied date (read off the satisfaction filing).
- Implied tenor: satisfied date minus created date, in months. Treat anything under 18 months as bridging-shaped, 18 to 36 months as development-finance-shaped, over 36 months as term-loan-shaped.

### Step 4: aggregate to lender DNA

Roll up the per-charge data into:

- Current exposure: outstanding charges grouped by lender.
- Historical pattern: who they've borrowed from, in what order, on what tenors.
- Recency: most recent charge in the last 12 months, 12 to 36 months, beyond 36 months. Recent activity is a stronger signal than ancient history.

**Group rollup gives counts, not the lender-to-scheme mapping.** When the prospect borrows through per-scheme SPVs (the common case, and the reason the trading parent often shows zero charges), you will lean on the group rollup `companies.getGroupCharges` (see SKILL.md step 8b). That tool returns charge **counts** per lender (`lendersByCount`) and per company (`byCompany`), but **not** which lender sits on which company. Counts alone cannot tell you which scheme a lender funded, that scheme's size, or whether it is prime. To attribute a lender to a scheme, or to characterise those schemes at all, read that SPV's per-charge register directly (`find-and-update.company-information.service.gov.uk/company/{N}/charges`) and build the real lender-to-scheme map. If you have only counts, write "lender-to-scheme mapping not yet retrieved" rather than inferring it.

## Patterns to flag

These patterns recur on real charge books and shape the prospect-intel output:

1. **Serial bridger**: three or more bridging-shaped charges in the last 36 months, mostly satisfied. Suggests the developer uses bridging as a primary tool; product-fit is bridging, not term development finance, despite the asset class.
2. **Bank loyalty**: multiple charges with the same high-street bank over several years. Slow-moving, conservative balance sheet. Reachout angle: rate competition unlikely to win them; offer something the bank cannot (speed, leverage, structure).
3. **Pivot pattern**: a clear shift in lender type at a point in time. Often signals a relationship breakdown or a deliberate strategic move. Worth investigating in the reachout context.
4. **Syndicate use**: any security agent on file. Implies larger ticket and a more sophisticated borrower than a typical SME developer. Adjusts lender-match downstream.
5. **No charges and no recent activity**: company is dormant, an SPV not yet funded, or a holding entity. Look at parent or sister companies before drawing a conclusion.
6. **All charges satisfied, no current exposure**: an unencumbered borrower. Strong reachout angle for a new development financing.
7. **Recent SPV proliferation**: multiple new subsidiaries with charges in the last 12 months. Active developer with a portfolio approach. Worth a portfolio-level conversation, not a single-scheme pitch.
8. **Same-day-filed-and-satisfied private finance**: a charge that is filed AND marked satisfied on the same day (or within 1-2 days), with a chargee that is an individual name OR a small private company (not a recognised lender). This is the signature of **seller-funded acquisition bridging** or **completion-day private finance** — the previous owner (or an associated company) lent the borrower the gap between deposit and main facility, paid off at completion. Frequently 2+ same-day charges appear together (one to the individual seller, one to an associated entity). **Operational meaning**: this is a SOPHISTICATED borrower who uses non-bank finance to win competitive bids. Implies (a) deal-sourcing capability strong enough to bid where others can't structure quickly, (b) network of private finance backers, (c) execution skill to close on tight timelines. Reachout angle: do NOT compete on rate (the borrower clearly has access to bespoke capital); compete on speed + relationship + ability to scale the next deal.
9. **Same property, multiple lenders, no satisfaction**: same asset address appearing on 2+ outstanding charges in close succession (within 12 months), with no fully-satisfied filings in between. Could be (a) paperwork lag on the original lender's discharge (most common — CH satisfaction filings sometimes lag actual repayment by weeks), (b) senior + mezz structure, (c) staged refurb financing where each lender funds a different phase. Disambiguation requires the charge PDFs. Always flag with the 3-interpretation note; never assert one interpretation without PDF evidence.

## What to write into Convex

For each significant finding, write a `knowledgeItems` row with:

- `fieldPath`: a stable key per finding, e.g. `lender_dna.current_lenders`, `lender_dna.pattern_signals`, `lender_dna.maturity_profile`.
- `value`: structured according to the field path.
- `sourceType`: `"ai_extraction"`.
- `sourceRef`: the Companies House charge IDs that supported the finding, comma-separated.
- `confidence`: lowered if the analysis depended on uncertain inferences (e.g., a private SPV that you can only label "private", not classify further).

Also update `clientIntelligence.lenderProfile.staticLayer` with the rolled-up DNA summary as a flat object, so a downstream skill or the UI can read it without re-aggregating.

## What not to do

- Do not infer the actual lender behind a security agent. State "syndicate, agent X, lenders not publicly disclosed" and stop.
- Do not match a private SPV name to a known individual without independent corroboration. Companies House officers and PSCs may help; press mentions or public LinkedIn data may help; speculation without evidence does not.
- Do not extrapolate lender appetite from this analysis. Lender DNA tells you who has lent before, not who would lend now. Current appetite lives in `appetiteSignals`; that is fed by BDM check-ins, not by charge analysis.
- Do not include the charge book itself in the output. Summarise and cite IDs; the full charge book is one query away if the operator wants it.
- Do not infer which scheme a lender funds, or characterise those schemes (size, prime-ness, anything), from aggregate charge counts or from the lender-type taxonomy. The taxonomy classifies a *named* lender; it does not tell you which of the borrower's schemes that lender sits on. Read the per-charge register for the funded SPVs first, then state the mapping. (Real past error, 2026-05: a run stated a bank was "on the larger or more prime schemes" from `companies.getGroupCharges` counts alone, when its charges were in fact on the borrower's two smallest schemes, a single house and a three-unit row. Counts told us how many charges that lender held, not which schemes.)
