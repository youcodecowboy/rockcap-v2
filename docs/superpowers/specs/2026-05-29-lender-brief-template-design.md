# Lender Brief Template (docgen v2) — Design

- **Date:** 2026-05-29
- **Status:** Approved design (brainstorming) → pending implementation plan
- **Builds on:** docgen v1 — P1 render engine, P2 `document_publish` approval + filing, P3 `document-author` skill + `generateDocument` tool, P4 MCP `document.generate`. (`docs/superpowers/specs/2026-05-29-docgen-substrate-design.md`)
- **Source examples:** Burnham (INTERNAL V1.3), Wimbledon Dev Exit (INTERNAL V1.3), Mitcham/Lucien (EXTERNAL V1.0)

## Context & goal

The first **template type** for the doc-gen substrate: the RockCap **lender brief** — a branded, table-first document produced from prospect/deal data, gated by operator approval, filed to the client/project. Distinct from v1's generic ad-hoc compose (the "house" style), the lender brief has a fixed branded frame (logo header, key-facts, black footer, RM sign-off) and a flexible, deal-type-driven section set.

From the 3 examples: the canonical brief (Burnham/Wimbledon V1.3) = branded header (`RockCap | Lender Brief | Confidential`) + title block (LOCATION + one-line descriptor + meta line) + key-facts block + numbered sections (the **set varies by deal type**) + RM sign-off. Sections are rich prose + tables, not field substitution. The "logo" is plain text "RockCap" in **Helvetica Neue** (the web-app wordmark) — no custom font, so it renders identically in PDF/DOCX with no embedding.

## Approach (A): branded shell + composed sections

The v1 engine gains **layouts**. The lender brief = a structured branded **shell** (header / title / key-facts / black footer / sign-off — server-assembled from fields) wrapping **composed section bodies** (prose + tables the agent composes from data per a doc-type reference). A "template type" = **a layout + a doc-type reference**.

Rejected: **docxtemplater** (fill a `.docx`) — ruled out by the flexible/variable section set, the light-edit workflow (PDF-primary, DOCX for small tweaks), and logo-as-web-font. **Typed section-component registry** — overkill; section content is composed prose regardless, so a registry only re-encodes ordering the reference already gives.

## Components

1. **Engine layouts** — `src/lib/docgen/layouts/`: `house.ts` (v1's `wrapInHouseStyle`, refactored in unchanged) + `lenderBrief.ts` exposing `buildLenderBriefHtml(briefData) → full branded HTML`. `renderDocument` becomes layout-aware: `{ layout: "house" | "lender-brief", ..., formats }`.
2. **Company-info config** — `src/lib/docgen/rockcapCompany.ts`: `{ wordmark: "RockCap", legalName: "RockCap Ltd", website: "rockcap.uk", email, phone, registeredOffice?, companyNo? }`. Read by the layout's header/footer. `registeredOffice` / `companyNo` optional (filled later; omitted from the footer until provided).
3. **Doc-type reference** — `skills/shared-references/doc-type-lender-brief.md`: the section menu + when-each-applies (deal-type variants: senior-dev / dev-exit-refinance / JV) + per-section content rules + INTERNAL/EXTERNAL variant + the key-facts fields + the sign-off + **table-first composition rules** (prefer tables for any 3+ figures; clean headers; cite sources as subtext; never a wall of numbers in prose).
4. **`lender-brief` skill** — `skills/skills/lender-brief/SKILL.md`: accepts **`clientId` and/or `projectId`**; gathers prospect-intel + (if present) project/deal data; composes section bodies + fills shell fields per the reference; assembles `briefData`; calls the generation path with `layout: "lender-brief"`; produces a `document_publish` approval; files to project/client on approval. Uses the standard `skillRun.start/complete` envelope.
5. **Generation-path extension** — the route (`/api/documents/generate`) + the chat/MCP tools (`generateDocument` / `document.generate`) gain an optional `layout` + structured `briefData` alongside the v1 `contentHtml` path. Route → `buildLenderBriefHtml(briefData)` → render. Reuses P1 render + P2 staging + P4 MCP wholesale.
6. **Project filing** — `recordPublishedDocs` gains `relatedProjectId` passthrough → files the documents rows under the **project** (projectId + folderType `project`, scope `client`) when present, else client base docs.

## `briefData` shape

```ts
{
  variant: "senior-dev" | "dev-exit" | "jv",
  confidentiality: "INTERNAL" | "EXTERNAL",
  title: { location: string; descriptor: string },          // "BURNHAM, BUCKINGHAMSHIRE" / "9-Unit Residential — Senior + Equity"
  meta: { borrower: string; preparedBy: "RockCap Ltd"; date: string },
  keyFacts: Array<{ label: string; value: string }>,        // Borrower, Principal(s), Financing Requirement, Date, Relationship Manager
  sections: Array<{ n: number; title: string; bodyHtml: string }>,  // composed prose + tables, semantic HTML
  signOff: { name: string; role: string; email: string; phone: string },
}
```

The agent composes `sections[].bodyHtml` (semantic, table-first HTML) and fills the rest. `buildLenderBriefHtml` assembles the branded frame and injects the sections, applying the layout CSS.

## Data flow

1. Resolve **client and/or project**. `skillRun.start` (dedup `lenderbrief:${client|project}:${variant}:${YYYY-MM-DD}`).
2. **Gather** — prospect-intel artifacts as a first-class source: `clientIntelligence`, the latest prospect-intel run's `intelMarkdown`, `prospectSchemes` / track record, CH charges + lender DNA — via `client.getDeepContext`. If a project exists, add `project.getDeepContext` (scheme, GDV/TDC/units, SPV, financing). **Early brief** = client-only (prospect-intel); **fuller brief** = + project/deal-intake data.
3. Pick the **variant** (senior-dev / dev-exit / jv) + INTERNAL/EXTERNAL (operator says, else INTERNAL) → selects the section set.
4. **Compose** per the reference: shell fields + section bodies (table-first), **cite-or-omit, never fabricate** (especially financials and track record); flag gaps. Deal-specific gaps on an early brief (financing requirement, sources & uses) are marked indicative or left for the operator.
5. Assemble `briefData` → call the generation tool (`layout: "lender-brief"`, `relatedClientId`, `relatedProjectId`).
6. Route → `buildLenderBriefHtml(briefData)` → render PDF + DOCX → upload `_storage` → stage `document_publish` approval.
7. Operator **previews the PDF** in `/approvals` → **Approve**.
8. `recordPublishedDocs` files to the project's (or client's) Documents.
9. `skillRun.complete` with `linkedClientId`/`linkedProjectId`, `linkedApprovalIds`, and **gaps** (e.g. "track-record details beyond intel not on file", "financing requirement inferred — confirm").

## Branding & formatting (top-quality, table-first)

- **Header:** RockCap wordmark (Helvetica Neue, large) + "Lender Brief" + "Strictly Private & Confidential".
- **Title block:** LOCATION (large, tracked caps) → one-line descriptor (muted subtext) → meta line (borrower · Prepared by RockCap Ltd · date) as small subtext.
- **Key-facts block:** a clean two-column table — monospace uppercase labels + values.
- **Sections:** numbered headers with a hairline rule beneath (per the examples); tight prose; **tables wherever there are 3+ figures**, styled premium — uppercase monospace header row, hairline row rules, **right-aligned tabular figures** (`£X.Xm`, psf, %), optional caption/source subtext beneath. Natural tables: scheme units/GDV, asset & liability, financial metrics, sources & uses, sales & pricing, track record (year · scheme · GDV · senior lender).
- **Black footer band:** reversed-out white-on-black — RockCap Ltd · rockcap.uk · contact · (registered office / co. no. when provided) · "Page X of Y".
- **Fidelity split:** the **PDF** (Chromium paged-media) gets the full premium treatment — black footer band, repeating page numbers, crisp tables. **`html-to-docx`** (the editable DOCX) has limited paged-media/footer support, so its footer renders as a trailing block (not a repeating band) and tables a touch plainer. Per Q1 this is the right split: PDF is the pixel-perfect deliverable; DOCX is for light edits. Pixel-perfect DOCX would need a LibreOffice route (deferred).

## Error handling

Cite-or-omit-and-flag-gaps; **never fabricate** financials or track record (it is a lender-facing document). Render failure → record a gap, stage no approval. The operator preview/approval is the gate. Thin data (early brief) → compose from intel + flag deal-specific gaps as indicative.

## Testing

(Repo reality: no `convex-test`; pure logic in vitest, the rest via build + manual.)
- **Pure units (vitest):** `buildLenderBriefHtml` (header / key-facts / sections / tables / footer present; escaping; figure formatting) + a table-builder helper.
- **Render smoke:** PDF `%PDF` + DOCX `PK` magic bytes off a sample `briefData`.
- **Skill e2e:** run on **Mackenzie Miller** (early brief from the existing prospect-intel) — eyeball the rendered brief, confirm it files to the client.
- **Build gate:** `npx convex dev --once` + `npx next build`.

## New dependencies

None — reuses the v1 stack (`@sparticuz/chromium` PDF, `html-to-docx`). LibreOffice for pixel-perfect DOCX is a deferred later option.

## Open questions for the implementation plan

1. **Section menu per variant** — derive the exact menu + ordering from the 3 examples; encode in the doc-type reference.
2. **`briefData` finalisation** — the `keyFacts` label set and section ids/numbering.
3. **Layout dispatch** — extend the existing route/tools with a `layout` + `briefData` param (recommended) vs a dedicated `lenderBrief.generate` tool.
4. **DOCX footer fallback** — confirm the trailing-block footer (no repeating band/page numbers in DOCX) is acceptable for v2.
5. **Company-info values** — `registeredOffice` / `companyNo` (operator to provide; omitted until then).

## Non-goals (YAGNI)

Pixel-perfect DOCX (LibreOffice); operator-managed template store + management UI (v3); template types beyond the lender brief; structured rule validation; and auto-sourcing data the app doesn't hold (e.g. detailed track-record narrative beyond what prospect-intel captured) — flagged as gaps rather than invented.
