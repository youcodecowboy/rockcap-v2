# Document-Generation Substrate — Design

- **Date:** 2026-05-29
- **Status:** Approved design (brainstorming) → pending implementation plan
- **Related:** skills `terms-package-build`, `ic-paper-drafter`, `case-study-author` (future callers); the `gmail_send` approval/executor pattern (precedent for `document_publish`)

## Context & goal

RockCap needs to generate documents — DOCX, XLSX/XLSM, PDF — from data, both as steps inside the linear skill pipelines (lender pack, IC paper, case study) and on-demand from chat ("generate me a one-pager on X company").

Current state (from codebase audit):
- **No DOCX-write, no PDF generation** exist (only read: `mammoth`, `pdf-parse`).
- **XLSX/XLSM *generation* exists** via `xlsx-populate` (macro-preserving) + the modeling-template system (`modelingTemplates` / `templateDefinitions`, placeholder codes filled from extracted deal data).
- `skills/templates/` is **empty** (a README of 6 planned files); the `template.populate` primitive every deal-doc skill references is unbuilt.
- The MCP tool surface (`convex/mcp.ts`) and the chat tool registry (`src/lib/tools/`) are **parallel** — the same capability is defined twice (`document.createFromGeneration` vs `saveChatDocument`). Real logic should live in one function both wrap.

Goal: a substrate that (a) renders content to real files, (b) supports both fixed-template docs and freeform "within constraints" docs, (c) is reachable from both skills and ad-hoc chat, and (d) hardens over time as operators add templates and rules.

## Approach: incremental (Approach C)

Build a lean working spine now, with boundaries cut so platform features bolt on without rework.

- **v1 (this spec):** the ad-hoc content-compose slice — "generate a doc about an entity → DOCX + PDF, from chat, approval-gated, filed to the client."
- **v2:** template-fill (fixed deal docs: lender pack, indicative terms) + a Convex template store; reuse `xlsx-populate` for XLSX/XLSM behind the same renderer interface.
- **v3:** operator management UI (add templates/rules), MCP exposure of the generation tool, and a shared "register-once → expose to both surfaces" tool layer (its own project).

## v1 scope

**In:**
- A generation engine (Next.js `runtime='nodejs'` API route) with a pluggable `Renderer` interface; v1 renderers HTML→PDF and HTML→DOCX, both off one house-style-wrapped HTML.
- A guiding skill `document-author` that gathers data, applies prose rules, composes HTML, renders, and stages an approval.
- A house-style reference + at least one doc-type guardrail reference (`skills/shared-references/`).
- A chat tool `generateDocument` (`requiresConfirmation`) wrapping a single core generation function.
- Storage + a new `document_publish` approval executor that finalizes and **files the doc to the client's library** on approval.

**Deferred (non-goals for v1):** template-fill + template store (v2); an XLSX/XLSM generation tool (v2, reuse existing populate); structured rule validation (v2+); operator management UI + MCP exposure + the shared tool-registry layer (v3); LibreOffice/Gotenberg high-fidelity DOCX→PDF (later).

## Rules model (hybrid)

- **Hard structure** comes from a template when one exists (v2).
- **Soft guardrails** come from prose references (house-style + per-doc-type), LLM-applied by the guiding skill. v1 is prose-only ("freeform within constraints"); the **operator preview is the enforcement gate**. Structured/automated validation is v2+.
- Operators extend rules by adding references (v1) and later via the management UI (v3) — the "hardens over time" trajectory, mirroring the skeleton→hardened skill pattern.

## Architecture (5 components)

1. **Renderer (engine).** `/api/documents/generate` (Next.js `runtime='nodejs'`) behind `interface Renderer { format; render(spec): Promise<Buffer> }`. v1 renderers:
   - HTML→PDF: `puppeteer-core` + `@sparticuz/chromium`.
   - HTML→DOCX: `html-to-docx`.
   - Both consume one HTML body wrapped in **house-style CSS**. Template-fill renderers (`docxtemplater`, the existing `xlsx-populate`) slot behind the same interface in v2.
2. **Guiding skill** `skills/skills/document-author/SKILL.md`. The brain: resolve entity → `*.getDeepContext` → load rule refs → compose HTML within constraints → call `generateDocument` → stage approval → `skillRun.start/complete` envelope. The specific deal-doc skills become thin callers of this in v2+.
3. **Rules.** `skills/shared-references/` — a house-style ref + per-doc-type guardrail refs. Soft, LLM-applied in v1.
4. **Tool surface.** Chat tool `generateDocument` (`src/lib/tools/domains/`, `requiresConfirmation: true`) → a single core generation function (API route + a Convex mutation). v1 is chat-only; the chat agent reaches the skill via the existing `searchSkills` injection. The MCP descriptor wraps the same core in v3.
5. **Storage + approval.** Rendered files → Convex `_storage` → `documents` row(s) → an `approvals` row (`document_publish`). A new `document_publish` executor mirrors the `gmail_send` executor (the `executeApproval` switch dispatches to a real executor → `markExecuted` / `markExecutionFailed`).

## Data flow (ad-hoc path)

1. Chat agent receives "generate a one-pager on {Entity}" → `searchSkills` → `document-author` injected. (Existing mechanism.)
2. Skill resolves `clientId`; `skillRun.start({ dedupKey: "docauthor:{clientId}:{docType}:{YYYY-MM-DD}" })`.
3. `client.getDeepContext({clientId})` → identity, CH profile + charges, intelligence, track record, contacts, activity.
4. Load house-style + doc-type guardrail references.
5. Compose the body as **semantic HTML**, grounded in real figures and constrained by the rules (no styling in the body — house-style CSS owns the look).
6. Call `generateDocument({ contentHtml, title, formats: ["pdf","docx"], styleId, relatedClientId })` → the route wraps the HTML in house-style CSS and runs both renderers → PDF buffer + DOCX buffer.
7. **Stage:** upload buffers to `_storage`; create `documents` row(s) in a non-client-surfaced draft state; stage ONE `approvals` row (`document_publish`; `draftPayload` = storageIds + title + docType + rule refs used + preview URL). The operator previews the **real** rendered file.
8. Operator approves in `/approvals`.
9. **Finalize (`document_publish` executor):** mark published; **file to client** — set `clientId` + `scope: "client"` + a folder (Base Documents or a dedicated "Generated" folder) so it appears in the client's Documents view and via `document.listByClient`; mark the approval `executed`.
10. `skillRun.complete` (status, brief, `linkedClientId`, `linkedApprovalIds`, gaps).
11. **Reject path:** documents rows marked rejected, **not** filed to the client; stored blobs cleaned up.

The linear/skill-pipeline path is identical from step 3 onward; only the trigger differs (chat agent surfacing the skill, an operator command, or a parent skill invoking `document-author`).

## Error handling

- **Render failure** (Chromium crash / bad HTML / DOCX-lib error) → structured error from the route → skill records a `gap`, stages no approval.
- **Storage/upload failure** → abort + gap, no orphan approval.
- **Thin/missing data** → compose with what's available and flag the gap; if too thin, ask the operator rather than fabricate (consistent with the "cite every figure" rule).
- **Guardrails (v1) are soft** → the operator preview is the hard gate.
- **Approve-time executor failure** → `markExecutionFailed` + status `execution_failed`, visible in `/approvals`; the file already exists, so it is retryable.
- **Idempotency:** the skillRun `dedupKey` blocks duplicate same-day drafts; the executor's finalize is a no-op if already published.

## Testing

(Matches repo reality — no `convex-test`; pure logic in vitest, the rest via build + manual preview.)

- **Pure units (vitest):** content-blocks→HTML helpers, house-style wrapping, any markdown→HTML normalization, rule-reference selection logic.
- **Renderer smoke test:** feed known HTML → assert a non-empty PDF/DOCX buffer with the correct magic bytes / content-type.
- **Skill + executor:** verified end-to-end on a real client (e.g., Mackenzie Miller) — eyeball the rendered doc and confirm it lands in the client's Documents view.
- **Build gate:** `npx convex dev --once` + `npx next build`.

## New dependencies + infra notes

- npm: `puppeteer-core`, `@sparticuz/chromium`, `html-to-docx`.
- Vercel serverless caveats for Chromium: bundle size (~50MB), cold starts, `maxDuration` (the existing `/api/quick-export` uses 60s). Known-feasible-with-caveats; the pluggable renderer means PDF can move to a worker (LibreOffice/Gotenberg) later without touching the skill or tool layers.

## Open questions for the implementation plan

1. **Draft-state representation:** how a stage-time `documents` row is kept out of the client library until approval — withhold `clientId`, use a non-`"client"` `scope`, or add a `generationStatus` field. Depends on the exact client-Documents-view query (confirm in the plan). Recommended: set the client-surfacing fields (`clientId` + `scope:"client"` + folder) ON approval, so "filing" == the finalize action.
2. **Folder placement:** default client folder for generated docs (Base Documents vs a dedicated "Generated"/"AI-drafted" folder) — confirm against `clientFolders` / `folderId` + `folderType`.
3. **Documents row shape:** one row per format, or one primary (PDF) + DOCX companion (linked rows).
4. **House-style source:** the CSS file location + how a v2 template overrides/extends it.
5. **Chromium-on-Vercel validation:** spike `@sparticuz/chromium` in a nodejs route early to confirm bundle/time limits before building on it.

## Non-goals (YAGNI)

Template-fill, template store + management UI, structured rule validation, MCP exposure, the shared register-once tool layer, and high-fidelity DOCX→PDF are all explicitly out of v1. v1 proves the spine end-to-end on the ad-hoc content-compose case.
