# SPV structure canon

Canonical reference for UK property finance entity ownership structures. Used by multiple skills that encounter SPV chains in different sources:

- **`prospect-intel`** — sees SPVs in Companies House charges, officers, and PSC filings when researching a developer.
- **`deal-intake`** — extracts SPV chains from Heads of Terms / Facility Letter documents at the moment a deal is stood up.
- **`lender-intel`** — sees lender-side SPVs (Lender SPV + Agent) when capturing lender appetite.
- **`ic-paper-drafter`** (future) — documents the SPV chain in credit submissions.

This file documents the canonical 5-entity pattern and the source-specific extraction perspectives. Persistence schema is included (used by deal-intake until native nested clientRoles ship).

## The canonical 5-entity chain

UK property finance deals typically structure as:

```
Sponsor (parent operating company)
    ↓ owns
Borrower SPV (project-specific, holds the asset)
    ← lends to
Lender SPV (lender-side; loan parked here)
    ↓ controlled by
Lender (parent capital provider)
    + Agent / Security Agent (third party holding security)
    + Guarantors (personal guarantees from sponsor principals)
```

### Worked example — Comberton scheme (Bayfield Homes)

Source: `Comberton HOTs 011225.pdf` extracted via deal-intake on 2026-05-25.

| Role | Entity | CH number |
|---|---|---|
| Sponsor | Bayfield Homes Limited | (TBC) |
| Borrower SPV | Bayfield Homes (Comberton) Limited | (TBC) |
| Lender SPV | Falco Bayfield (Comberton) Limited | (TBC) |
| Lender | Falco Capital Limited | (TBC) |
| Agent / Security Agent | Falco Agent Limited | (TBC) |
| Personal Guarantor | Jameison Bird | (n/a — personal) |

This nesting is universal in development + investment facility deals. Bridging deals often have a simpler structure (sometimes Sponsor = Borrower with no SPV).

## How each role appears

### Sponsor

- The broader developer / operating company name.
- Usually NOT scheme-specific (no parentheses).
- Often the publicly-known brand (`Bayfield Homes Limited`, `Capstone Group Limited`).
- Filed at Companies House; has its own charges and officers.
- **In `prospect-intel`**: this is what you're typically researching as the "prospect."

### Borrower SPV

- Project-specific entity that holds the asset and is the borrower of record on the loan.
- Naming convention: `{Sponsor name} ({Scheme name}) Limited` (e.g., `Bayfield Homes (Comberton) Limited`).
- Has its own CH filing with a single director (typically a sponsor principal).
- Has the charge filed against it for THIS loan only.
- **In `prospect-intel`**: shows up in CH search if you query by sponsor name. If you see multiple `Sponsor (X) Limited` entities, that's the sponsor's pipeline of schemes.

### Lender SPV

- Lender-side entity that parks the loan.
- Naming convention: often combines lender + sponsor + scheme: `{Lender} {Sponsor} ({Scheme}) Limited` (e.g., `Falco Bayfield (Comberton) Limited`). Some lenders use simpler `{Lender}-{Scheme} Limited` patterns.
- Common with private credit funds and specialist lenders. Often absent in bank deals (bank lends from balance sheet directly).
- Appears on the charge as the "persons entitled" alongside the parent Lender.
- **In `prospect-intel`**: a Lender SPV's name on a charge gives you DOUBLE signal — both the parent lender + the deal-specific arrangement.

### Lender

- The parent capital provider (`Falco Capital Limited`, `Octane Capital Limited`, `Shawbrook Bank Plc`).
- Often what you'd "name" the deal as — the lender people refer to.
- Filed at CH; has its own broader portfolio of charges across many deals.
- **In `prospect-intel`**: lender entities you recognise are signal for `lender-dna-from-charges.md` analysis.

### Agent / Security Agent

- Third party holding security on behalf of the lender (or syndicate).
- Common with funds and syndicated deals; less common in single-lender bank deals.
- Naming convention: often `{Lender} Agent Limited`, `Apex Corporate Trustees (UK) Limited`, `GLAS Trust Corporation Limited`.
- Filed at CH; tends to appear on many charges (each deal = one charge with the same agent).
- **In `prospect-intel`**: the agent doesn't tell you the lender directly — you need to cross-reference. A `GLAS Trust Corporation` charge means "there's a syndicate"; the actual lenders are unknown from CH alone.

### Guarantors

- Personal names (or corporate names) listed as guarantors of the loan.
- Typically 1-3 sponsor principals (directors).
- NOT filed at CH (personal guarantees don't appear on charge book) but DO appear in the HoTs / Facility Letter.
- **In `prospect-intel`**: only visible if you have the HoTs / FL doc. CH-only research won't surface guarantors.

## Source-specific extraction perspectives

### Perspective A — Companies House (prospect-intel)

CH gives you partial visibility into the SPV chain:

- **Charges section** shows: Borrower (the company being researched), Lender, Lender SPV, and Agent (all as "persons entitled" on outstanding/satisfied charges).
- **Officers section** shows: directors of the company being researched. Sponsor principals usually appear here.
- **PSC section** shows: parent ownership — if Borrower SPV's only PSC is "Sponsor Limited", you've confirmed the Sponsor → Borrower SPV link.
- **Filings section** shows: incorporation date (when Borrower SPV was set up — often dates the deal start), accounts (financial health), confirmation statements.

**What CH doesn't give you:**
- Personal guarantors (private to the HoTs / FL)
- Equity terms (parent ownership chains beyond first-level PSC)
- Loan terms (rates, fees, covenants — private to HoTs / FL)

**Prospect-intel use:** when researching `Bayfield Homes Limited`, search CH for `Bayfield Homes` and you'll see Bayfield Homes Limited + multiple `Bayfield Homes (X) Limited` entities. Each `(X)` represents a scheme. Map the chain via PSC + charge data. See `prospect-intel/references/lender-dna-from-charges.md` for charge-side analysis.

### Perspective B — Heads of Terms / Facility Letter (deal-intake)

These documents give you the FULL chain in one place:

- The header / parties section lists all 6 roles (Sponsor, Borrower SPV, Lender, Lender SPV, Agent, Guarantors).
- The structure is more explicit because each party needs to be named for the loan terms to be enforceable.
- The CH number is NOT usually in the HoTs — extract the name, then resolve to CH separately.

**Deal-intake use:** parse a HoTs / FL doc using the extraction prompt below; persist via `intelligence.addKnowledgeItem` at `borrower.spvStructure`; optionally enrich with CH numbers via `companies.syncCompaniesHouse`.

## Extraction prompt (for deal-intake)

When deal-intake detects an `Indicative Terms` / `Heads of Terms` / `Facility Letter` doc in the batch, it runs:

```
You are reading a UK property finance Heads of Terms / Facility Letter to extract the entity ownership structure.

Document:
{paste documentAnalysis.summary + documentAnalysis.entities.companies}

Extract the following entities. If an entity is not present in the doc, return null for that slot.

1. Sponsor — the parent operating company that owns the Borrower SPV.
2. Borrower SPV — the scheme-specific entity that holds the asset and is the borrower of record. Usually has the scheme name in parentheses.
3. Lender — the parent lender (the capital provider).
4. Lender SPV — the lender-side scheme-specific entity that parks the loan. Often combines lender + sponsor + scheme. May not exist for smaller / bridging deals.
5. Agent / Security Agent — usually a third-party entity holding security for the lender. May be same as Lender SPV.
6. Guarantors — personal names (or corporate names) listed as guarantors. Typically 1-3 sponsor principals.

Return JSON in this exact shape:
{
  "sponsor": {"name": "...", "chNumber": null},
  "borrowerSpv": {"name": "...", "chNumber": null},
  "lenderSpv": {"name": "..." or null, "chNumber": null},
  "lender": {"name": "...", "chNumber": null},
  "agent": {"name": "..." or null, "chNumber": null},
  "guarantors": [{"name": "...", "type": "personal|corporate"}]
}
```

## Persistence schema (until native support ships)

Persisted via `intelligence.addKnowledgeItem`:

```yaml
clientId: <borrower client id>  # or projectId if project-scoped
fieldPath: borrower.spvStructure
isCanonical: true
category: borrower
label: SPV ownership structure
valueType: text  # JSON-stringified or markdown-encoded
value: |
  {
    "sponsor": {"name": "Bayfield Homes Limited", "chNumber": "12345678"},
    "borrowerSpv": {"name": "Bayfield Homes (Comberton) Limited", "chNumber": "23456789"},
    "lenderSpv": {"name": "Falco Bayfield (Comberton) Limited", "chNumber": null},
    "lender": {"name": "Falco Capital Limited", "chNumber": "34567890"},
    "agent": {"name": "Falco Agent Limited", "chNumber": null},
    "guarantors": [{"name": "Jameison Bird", "type": "personal"}]
  }
sourceType: ai_extraction
sourceDocumentId: <id of the HoTs doc>
sourceText: <quoted excerpt from the HoTs listing the entities>
context: "Extracted from Heads of Terms / Facility Letter at deal-intake. Until schema extends to nested clientRoles, this is the canonical capture."
```

### Multi-lender shopping (Bridging type)

When a deal has multiple HoTs from different lenders (common in Bridging type), the skill extracts ALL chains and persists multiple `knowledgeItems` rows with `qualifier` set to the lender name:

```
borrower.spvStructure (qualifier: "Octane")
borrower.spvStructure (qualifier: "Shawbrook")
borrower.spvStructure (qualifier: "Allica")
```

Each row reflects the parties named in that specific lender's HoTs.

## Substrate gap and future migration

**Gap (jotted 2026-05-25):** `projects.clientRoles` schema doesn't model nested SPV chains. Today the field stores `{clientId, role}` pairs where each `clientId` is a flat `clients` row.

**Migration path when schema extends:**

1. For each `knowledgeItems` row at `borrower.spvStructure`, parse the value.
2. For each entity in the structure, ensure a `clients` row exists (create with `type: borrower-spv | lender-spv | agent | sponsor` as new client types).
3. Add new `projects.clientRoles[]` entries with role names matching the SPV structure.
4. Mark the `knowledgeItems` row as `status: superseded`, with `context: "migrated to native clientRoles on YYYY-MM-DD"`.

The corpus of `borrower.spvStructure` knowledgeItems IS the migration source data.

## What goes wrong

1. **Doc is too thin to extract.** A 2-paragraph term sheet may only list the headline parties (Sponsor + Lender), not the full chain. Skill captures what it can, leaves missing slots null, flags `spv_structure_partial`.
2. **Sponsor and Borrower SPV are the same entity.** Common in Bridging deals (no separate SPV). Skill returns the same name for both slots with a note.
3. **Lender SPV cannot be resolved.** Some lenders don't use SPV structures (e.g., direct lending from balance sheet). Skill returns null for `lenderSpv` and notes "direct lender" in `context`.
4. **Personal guarantors with privacy concerns.** Some HoTs list full director names + addresses. Capture names only, not addresses, and do NOT enrich personal guarantors via CH.
5. **CH-only research misses guarantors + loan terms.** Prospect-intel cannot fully reconstruct the chain from CH alone — guarantors and explicit loan terms are private to HoTs / FL. This is expected, not a failure.
