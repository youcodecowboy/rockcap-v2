# Doc type: lender brief

The branded, multi-page RockCap **lender brief** — produced from prospect/deal data via the `lender-brief` layout (`model-testing-app/src/lib/docgen/layouts/lenderBrief.ts`), composed as structured **`briefData`** (not `contentHtml`). Pair with `document-house-style.md` for voice. Distinct from the one-pager: a fixed branded frame (masthead, key-facts block, black footer, RM sign-off) wrapping deal-type-driven sections of rich prose + tables.

## Purpose
A senior, evidence-led brief presenting a financed (or to-be-financed) development scheme to a lender, syndication partner, or IC. **Table-first; 3–5 pages with genuine depth is the target — depth beats brevity.** Do not compress to fit a page count; a longer, well-structured brief is preferred over a thin one.

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
This is what separates a real brief from a thin one. Source it from the **Companies House charge register, never inferred**:
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

## Data sources
`client.getDeepContext` / `prospect.getDeepContext` (identity, contacts, intel, deal/project, CH profile), `companies.getGroupCharges` + `companies.getProspectSchemes` (track record + group funding), `project.getDeepContext` (scheme / financing when a project exists).

## Avoid
- Inventing charge / facility amounts (not on CH), planning refs, or guarantor names not in the data.
- Asserting confidence-flagged estimates (units / GDV) as hard facts.
- Inferring lender↔scheme links from aggregate counts instead of the per-charge register.
- Padding empty sections.

## Worked example
**Temple Guiting** (Mackenzie Miller group, `senior-dev`, EXTERNAL): 8 sections, 5 pages. Track Record & Group Funding built from the group's **17 active CH charges across 6 lenders** (Quantum the incumbent on live Cotswold schemes; Investec / Paragon on completed schemes; 2 satisfied facilities = a documented fund-and-repay cycle). Reproducible via `model-testing-app/src/__tests__/lenderBriefExample.test.ts`.
