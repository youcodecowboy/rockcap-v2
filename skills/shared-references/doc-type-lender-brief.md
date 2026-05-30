# Doc type: lender brief

The branded, multi-page RockCap **lender brief** — produced from prospect/deal data via the `lender-brief` layout (`model-testing-app/src/lib/docgen/layouts/lenderBrief.ts`), composed as structured **`briefData`** (not `contentHtml`). Pair with `document-house-style.md` for voice. Distinct from the one-pager: a fixed branded frame (masthead, key-facts block, black footer, RM sign-off) wrapping deal-type-driven sections of rich prose + tables.

## Purpose
A senior, evidence-led brief presenting a financed (or to-be-financed) development scheme to a lender, syndication partner, or IC. **Table-first; 3–5 pages with genuine depth is the target — depth beats brevity.** Do not compress to fit a page count; a longer, well-structured brief is preferred over a thin one.

## Source hierarchy (read this first)
The deal's **own documents are the primary source** — read them first and broadly (the worked example drew on ~40 documents). Companies House charges + RockCap intel are a **cross-check**: they verify the track record and catch what the documents don't show. The substance and the defensible figures live in the documents; **never invert this hierarchy** (composing from CH + intel alone produces a thin, and sometimes wrong, brief — e.g. a guarantor named in the facility letter won't appear in the CH register). See *Sourcing the brief* below for the how — it is a requirement, not optional enrichment.

## Variants
- `senior-dev` — senior development facility (default).
- `dev-exit` — development-exit / refinance.
- `jv` — JV / equity.

INTERNAL vs EXTERNAL: operator says; default INTERNAL. EXTERNAL drops internal-only commentary.

## Section set (senior-dev; omit any section with no data rather than padding)
1. **Executive Summary** — 2–3 paragraphs: the scheme, GDV + profit, the facility, the sponsor, one line on the group's funding depth.
2. **Asset Overview** — site + consent (planning ref) + a plots/schedule table.
3. **Scheme & Pricing** — pricing metrics table; comparable evidence cited.
4. **Development Appraisal** — headline cost / GDV / profit table (% of GDV), source cited.
5. **Senior Facility & Security** — facility tranche table, then security (first charge, debenture, personal guarantees) and monitoring. Cite the Companies House charge registration where known.
6. **Borrower & Sponsor** — group narrative (per-scheme SPV model, ownership / PSC) + a leadership table (principals + roles).
7. **Track Record & Group Funding** — *the depth section* (see below).
8. **Professional Team & Enclosed Documentation** — professional team table + an **annotated** enclosed-docs table (each document + what it provides).

## Depth: Track Record & Group Funding (section 7)
§7 is the one section built from the **Companies House charge register** (the deal facts in §1–§6 and §8 come from the documents — see *Sourcing the brief*). Source it from the register, never inferred:
- `companies.getGroupCharges({clientId})` → the per-charge group rollup: `lendersByCount` (active charges per lender), `activeCharges`, `satisfiedCharges`, `distinctLenders`. Build the **lender / charge-book table** from this (active charges per lender + where).
- `companies.getProspectSchemes({clientId})` → per-scheme `live[]` / `past[]` (address, lenders, `lastChargeDate`, scheme type, estimated units / GDV with `confidence`). Build the **recent-schemes table** from this (scheme, location, units, lender, funded, status).
- Add an interpretation line: repeat incumbents, who funded completed vs live schemes, any **satisfied** charges (a documented fund-and-repay cycle).
- Read the per-charge register; do **not** infer which lender funds which scheme from aggregate counts (see `../skills/prospect-intel/references/lender-dna-from-charges.md`).
- **Charge amounts are NOT disclosed at Companies House** — never state a charge/facility amount sourced from CH. Unit counts / GDV from `getProspectSchemes` are confidence-flagged estimates: hedge ("indicative", "~", "estimated") or omit. Mark `Sold` / `Live` / `Complete` from company + charge status.

## Key facts (the branded key-facts block)
Borrower (with SPV CH no.), Sponsor (parent + controller), Scheme, Location, GDV, Senior Facility, Profit on Cost, Relationship Manager. Each a short label + value.

## Sign-off
The named Relationship Manager: name, role, email, phone.

## Formatting & layout (engine rules — enforced in `lenderBrief.ts`)
- **Section blocks do not split across a page break.** Each `<section>` is kept whole (`break-inside: avoid`): a heading must **never** sit at a page bottom with its body overleaf. A section taller than a page still breaks, but the heading stays with its first content (`break-after: avoid` on the `h2`) and tables never split mid-row.
- **Prefer whole-block placement over tight page-fill.** Bottom-of-page whitespace is acceptable; a stranded heading or a table jammed against the footer is not.
- The sign-off stays as one block and is never split.
- Compose sections at a sensible size. Tables are the primary tool for any 3+ figures; clean monospace headers; cite sources as caption subtext; never a wall of numbers in prose.

## Sourcing the brief — read the documents first (required)
Build the brief **primarily from the deal's own documents**. Read first, read broadly — the Temple Guiting worked example drew on ~40 documents. Companies House + intel are the cross-check (see *Source hierarchy*).

1. **Enumerate the corpus.** `document.listByProject({projectId})` (the scheme's docs) + `document.listByClient({clientId})` (base + project docs). Each row carries `fileName`, AI `fileTypeDetected`, `category`, and a `summary`. Cross-reference `document-checklist-canon.md` for the expected borrower set by deal phase (`indicative_terms` / `credit_submission` / `post_credit`) so you know what should exist and what's missing.
2. **Read the ones that carry the facts.** `document.search({query, clientId})` to find a specific item; `document.get({documentId})` for the summary/classification, then read the content (download via `fileStorageId`) where the numbers and names actually live:
   - **Development appraisal** → GDV, cost build-up, finance costs, profit, % of GDV (§3, §4).
   - **Facility letter / term sheet** → facility amount, tranche schedule, rate, term, security, **personal guarantors** (§5). *This is where confirmed principals/guarantor names come from — not the CH register.*
   - **Valuation / comparables** → pricing evidence, blended psf (§3).
   - **Planning consent / decision notice** → planning ref, unit schedule (§2).
   - **KYC / corporate / legal** → confirmed principals, SPV structure (§6).
   - **Monitoring (QS) report** → cost / programme / security position (§8 enclosed list).
3. **Cross-check with Companies House + intel.** `companies.getGroupCharges` + `companies.getProspectSchemes` build the group track record (§7, see *Depth*); `client.getDeepContext` / `prospect.getDeepContext` / `project.getDeepContext` give identity, intel, and scheme/financing. Use these to *verify* the documents and assemble §7 — not as a substitute for reading the docs.
4. **Cite or omit.** Every figure traces to a named source document (or the CH register for the track record). Never invent; mark genuine gaps plainly.
5. **Confirm the borrower entity — do not trust the brand name.** Walk the controllers' CH appointments and search CH by the scheme name to find the actual per-scheme SPV, and reconcile against the documents. The architect/agent often names the *brand*, not the legal borrower: on Woodham, a drawing named "Birkett Hall Homes", the charges/land sat in "Birkett Hall Developments", and the clean go-forward vehicle was "Woodham45 Ltd". Name the legal borrower SPV in the brief; treat the brand as the sponsor. Also check **director ≠ owner** before crediting the sponsor with a scheme (it may be a JV partner's or a former employer's — confirm via PSC).

## Avoid
- Inventing figures, planning refs, or guarantor names — every one must trace to a named source document (or the CH register for the track record). CH does **not** disclose charge amounts; facility/charge figures come from the facility letter or appraisal.
- Composing from Companies House + intel alone without reading the deal documents (the inverted hierarchy — produces a thin or wrong brief).
- Asserting confidence-flagged estimates (units / GDV) as hard facts.
- Inferring lender↔scheme links from aggregate counts instead of the per-charge register.
- Padding empty sections.

## Worked example
**Temple Guiting** (Mackenzie Miller group, `senior-dev`, EXTERNAL): 8 sections, 5 pages. Built from the deal document corpus (~40 documents — appraisal, facility letter, monitoring report, planning, KYC; these are where the £6.24m facility tranches, the planning ref, and the guarantor names came from), cross-checked against the group's **17 active CH charges across 6 lenders** (Quantum the incumbent on live Cotswold schemes; Investec / Paragon on completed schemes; 2 satisfied facilities = a documented fund-and-repay cycle). Reproducible via `model-testing-app/src/__tests__/lenderBriefExample.test.ts`.
