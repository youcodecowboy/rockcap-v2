# document-author

Generate a formatted document (PDF + DOCX) about an entity, gated by operator approval, and filed to the client's library on approval. The generic document-generation skill the deal-doc skills (terms-package-build, ic-paper-drafter, case-study-author) will later build on.

**Last hardening:** v1 (2026-05-29) — document-generation substrate v1 (ad-hoc content-compose slice).

## Trigger
- **Chat agent (v1 primary):** surfaced via `searchSkills` when the operator asks the assistant to "generate a {docType} on/about {entity}" (e.g. "generate me a one-pager on Mackenzie Miller Homes").
- **Parent skill (future):** a deal-doc skill invokes document-author with a specific docType + data.

## Inputs
Required: the target entity (a `clientId`, or a name to resolve to one).
Optional: `docType` (default "Company One-Pager"), `mentionPoints` (specific things to emphasise), `formats` (default both PDF + DOCX).

## Dedup
- **dedupKey:** `docauthor:${clientId}:${docType}:${YYYY-MM-DD}` (one of a given doc type per client per day).
- **dedupWindowDays:** 1. On `duplicate_found`, surface the prior approval and ask whether to redraft.

## Cadence package
Does NOT produce a cadence.

## Outputs
- A `document_publish` **approval** (staged via the `generateDocument` tool, which renders then calls `documentPublish.requestPublish`). The operator previews the rendered file in `/approvals`.
- On approval: client-scoped `documents` rows filed to the client's library (handled by `recordPublishedDocs`).
- A `skillRun` envelope (`skillRun.start` / `skillRun.complete`) with the staged `approvalId` in `linkedApprovalIds`.
- Does NOT send or publish anything autonomously; the approval is the gate.

## High-level workflow
1. **Resolve the entity** to a `clientId` (the chat layer usually injects it; otherwise resolve by name).
2. **`skillRun.start`** with the dedupKey above; honour `duplicate_found`.
3. **Gather data:** `client.getDeepContext({clientId})` — identity, CH profile + charges, intelligence, track record, contacts, activity.
4. **Load the guardrails:** `../../shared-references/document-house-style.md` (voice + HTML rules) and the doc-type reference (for one-pagers, `../../shared-references/doc-type-company-one-pager.md`).
5. **Compose** the document body as semantic HTML, following the house style and the doc-type structure, grounding every figure in the gathered data. Omit sections with no data; never fabricate.
6. **Call the `generateDocument` tool** with `{ contentHtml, title, docType, category: "Generated", clientId }`. It renders PDF + DOCX and stages the `document_publish` approval.
7. **Report** to the operator that the document is staged for approval (with the approval link) and what to review.
8. **`skillRun.complete`** with status, a one-paragraph brief, `linkedClientId`, `linkedApprovalIds`, and any `gaps` (missing data, unresolved entity).

## Style rules
Defer to `document-house-style.md` and the doc-type reference. The three that matter most: cite every figure; omit rather than fabricate; one `<h1>`, semantic HTML only (no style wrappers).

## Tool dependencies
- `client.getDeepContext` — one-shot data load (MCP).
- `skillRun.start` / `skillRun.complete` — workflow envelope (MCP).
- `generateDocument` — chat tool that renders (via `/api/documents/generate`) and stages the approval (via `documentPublish.requestPublish`).
- **Deferred:** MCP exposure of `generateDocument` is v3; in v1 this skill runs on the chat surface.

## What goes wrong
1. **Entity unresolved.** Ask the operator which client, rather than guessing.
2. **Thin data.** Compose with what is on file, mark gaps plainly ("not on file"), and never invent figures. Note the gaps in `skillRun.complete`.
3. **Render failure.** The `generateDocument` tool throws (e.g. a Chromium error); surface the error to the operator and do not claim a draft was staged.
4. **No client match for filing.** The document can still be staged unfiled; flag it and ask the operator where it should live.

## References
- `../../shared-references/document-house-style.md`
- `../../shared-references/doc-type-company-one-pager.md`
