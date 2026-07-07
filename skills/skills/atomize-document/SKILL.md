# atomize-document

The **harness lane** for the Knowledge Layer (Spec 2 §11 / §14b.1). Claude Code reads a client's documents and writes atomic facts into the knowledge graph via the `atoms.*` MCP tools, at subscription cost. This is the bulk path; the API lane (a Convex cron → `/api/knowledge/atomize`) owns cheap incremental re-atomization and you should NOT duplicate it here.

Both lanes persist through the same server-side engine (`knowledge/atomsCore`), so the three persistence gates (anchored / discriminating / material) are machine-checked. You cannot bypass the noise rules; you can only produce good candidates and repair rejects.

## Trigger

Invoke for **bulk / backfill** atomization:

- "Build the knowledge graph for client {name}"
- Client onboarding — atomize the client's existing document corpus in one pass
- Pre-Drive migration / backfill of a client's historical documents

Do **NOT** invoke for incremental single-document updates after a Drive edit — the API lane (`knowledge-atomize-sweep` cron) handles those automatically once a client is knowledge-enabled. If asked to "re-atomize one changed doc", defer to the API lane unless the operator explicitly wants a manual pass.

## Inputs

Required:

- `clientId` (Convex id) OR a company name that resolves to one clients row.

Optional:

- `projectId` — narrow the pass to one project's documents.
- `documentIds` (array) — atomize a specific subset instead of the whole corpus.

## Dedup

- **dedupKey**: `${documentId}:${contentChecksum}` for a single-document invocation; for a whole-client bulk pass, use the `clientId` so a repeated onboarding surfaces the prior run.
- **dedupWindowDays**: 30.
- **On `status: "duplicate_found"`**: surface the prior run's brief and ask before re-atomizing (a re-run is safe — the engine converges duplicates — but it spends tokens).
- Per-document idempotency inside a bulk pass is handled in the procedure (step 3): skip any document whose `(documentId, contentChecksum)` already has observations.

## Cadence package

This skill does **not** produce a cadence package. It writes to the knowledge graph only; nothing leaves the system.

## Outputs

Persisted via the `atoms.*` MCP tools (all through the server-side gates):

- **Atoms + observations** — one canonical atom per fact identity, one observation per source occurrence, via `atoms.createBatch`.
- **Document chunks** — the narrative dual index for prose-heavy documents, via `atoms.upsertChunks` (skip fact-dense spreadsheets).
- No structural-table writes, no approvals, no outreach. Facility minting happens automatically inside the engine when facility-shaped predicates land.

## Cost guardrail

Before atomizing, count the documents in scope. **If more than 60 documents are in scope, STOP, report the count to the operator, and get explicit confirmation before proceeding** (mirror the `drive.importFolder` dry-run ethic — a large pass costs real tokens). Under 60, proceed.

## High-level workflow

1. **Resolve the client + gather the ROSTER.** The roster is what mentions resolve against — every `subjectId`/`objectEntityId` you emit MUST be a roster id.
   - `client.getDeepContext({clientId})` → the client row, its projects (ids + shortcodes), its contacts (ids + names + roles), and CH numbers on the client / related SPVs.
   - `lender.list({})` → the **global lender roster** (lenders are `clients` rows with `type="lender"`). Cross-client lender resolution is automatic: both clients' documents resolve "Hampshire Trust" to the same lender id.
   - Note the client's + related SPVs' Companies House numbers — company mentions resolve by CH number first.
2. **Load the legal predicates.** `atoms.vocabulary` — returns the `{name → {kind, family, direction, store}}` map. Use only these names. `kind: "edge"` → set `objectEntityId` + `objectEntityType`; `kind: "attribute"` → set `objectLiteral`. `store: "native"` predicates are rejected (they belong in structural tables) — never emit them.
3. **Check existing coverage (idempotency).** `atoms.getForSubject({subjectType:"client", subjectId: clientId})` to see what's already stored. Enumerate the client's documents (`document.listByClient` / `document.get`); each row carries `contentChecksum`. **Skip any document whose `(documentId, contentChecksum)` already has observations** (its facts are already in the graph). This makes re-runs cheap and safe.
4. **Per document: read + extract.** Read the document's `textContent` (`document.get` or the list row). Apply the EXACT extraction instruction block below (do not paraphrase it). For every extracted fact, attach:
   - a **locator** — `{page}` for PDFs, `{sheet, row}` for spreadsheets (column letters don't survive v4 parsing yet), `{section}` for prose;
   - a **sourceText** snippet (verbatim) — the reliable audit anchor;
   - an **authorityTier** by document type (see the tier table below).
5. **Persist in chunks.** `atoms.createBatch({atoms})` in batches of ≤100. Emit each atom with exactly one of `objectEntityId` (edge) or `objectLiteral` (attribute), the right `subjectType`/`subjectId` from the roster, `confidence` (0..1), and an `observation` carrying `sourceType:"document"`, `documentId`, `contentChecksum`, `locator`, `sourceText`, `authorityTier`.
6. **READ `rejected[]` and repair.** Every `atoms.createBatch` return has a `rejected` array of `{index, statement, reason}`. Never drop rejects silently. The usual causes and fixes:
   - `unresolved_subject` / `unresolved_object` — the id isn't a real row. The mention is a person/company not yet in the system. **`entityCandidates` creation does not exist yet (that lands in Phase 2b), so you cannot mint a provisional entity.** Instead: re-anchor the fact to the client (if the fact is genuinely about the client) OR **drop it and log a gap** (`kind: "schema_gap"`, describing the unresolvable mention) so 2b can pick it up. Do not force a wrong id.
   - `unknown_predicate` / `native_predicate` — you used a name not in the vocabulary or a native-store predicate. Re-map to a real atom-store predicate or drop.
   - `object_both` / `object_missing` / `predicate_kind_mismatch` — fix edge-vs-attribute and resubmit.
   Resubmit the repaired atoms in a follow-up `atoms.createBatch`.
7. **Chunk narrative documents.** For prose-heavy documents (legal opinions, professional reports), `atoms.upsertChunks({documentId, contentChecksum, chunks})` with ~800-token sections. **Skip fact-dense spreadsheets** (spec §3.4 — atoms win there; chunks would be noise).
8. **Close the run.** `skillRun.complete` with `status` (`complete` or `complete_with_gaps`), a two-paragraph `brief` (documents atomized, atom/observation counts, notable facilities minted, coverage gaps), and the `gaps` array (every unresolvable mention from step 6, every skipped document, every parse failure).

## Full onboarding (classify + atomize in one pass)

Bulk document processing runs through the harness, not the API pipeline (operator decision 2026-07-07). When the documents in scope are **unclassified** (fresh Drive imports still showing `fileTypeDetected: "Unclassified"`, or an upload backlog), fuse classification into this skill's pass — you already have the text open, so classify and atomize from ONE read. **You are the classifier**; the server only parses and persists.

Per document:

1. **`document.extractText({documentId})`** — server-side parse only, zero LLM. Returns `{text (≤120K, truncation noted), fileName, mimeType, contentChecksum, source, alreadyClassified, alreadyAtomized}`. Branch on the flags:
   - `alreadyClassified: true` and `alreadyAtomized: true` → skip the doc entirely.
   - `alreadyClassified: true`, `alreadyAtomized: false` → skip classification, atomize only (steps 4–7 of the main workflow). Do NOT re-classify unless the operator asked; a re-classification never moves the doc's folder anyway (first-classification-only placement).
   - both false → full pass below.
2. **Classify the text yourself.** Restraint over flourish: pick `category` from the 13 canonical categories — Appraisals, Plans, Inspections, Professional Reports, KYC, Loan Terms, Legal Documents, Project Documents, Financial Documents, Insurance, Communications, Warranties, Photographs — and a specific `fileTypeDetected` matching existing vocabulary (`document.listByClient` on a mature client shows real values: 'RedBook Valuation', 'Facility Letter', 'Cashflow', 'Bank Statement', 'Meeting Minutes', …). Write a ≤1200-char evidence-first summary and an honest confidence.
3. **`document.applyClassification({documentId, contentChecksum, fileTypeDetected, category, summary, confidence, reasoning, keyDates?, keyAmounts?, keyEntities?, textContent})`** — pass the `contentChecksum` from step 1 (required for Drive docs) and the parsed text as `textContent` so future re-analysis and the API-lane re-atomizer have it. Folder placement is resolved SERVER-SIDE from your category/fileTypeDetected (project taxonomy when the doc has a projectId, client taxonomy otherwise) — you never choose folders. Side effects (knowledge-bank entry, meeting-job heuristics, context-cache invalidation, ingestionEvents row, Drive mirror-row completion) match the v4 pipeline exactly.
4. **Atomize the SAME text** — steps 4–7 of the main workflow (`atoms.createBatch` with the step-1 `contentChecksum` on every observation, `atoms.upsertChunks` for narrative docs). One read, both outputs.
5. **One `skillRun` covers both** — the run's brief reports documents classified AND atomized; classification-only failures (parse errors, unresolvable category) go in the `gaps` array like any other gap.

Pipeline-pause convention for bulk: `extractText` on a pending Drive doc claims its mirror row (`processing`), which pauses the automatic pipeline for that file; complete `applyClassification` within ~30 minutes per document (work doc-by-doc, never extract a big batch up front) or the claim is reclaimed, its settle timer re-arms, and the API pipeline processes it at API cost. Re-processing when a Drive file CHANGES stays fully automated (hydration cron → `/api/drive/ingest` → API-lane re-atomizer) — do not re-run this pass for edits.

## The extraction instruction block (apply verbatim — spec §6.1)

> Extract atomic facts from this document. An atomic fact is ONE self-contained sentence that would remain true and meaningful if read with no surrounding context, attached to ONE subject entity from the roster above (or a new person/company you can identify precisely).
>
> EXTRACT a fact only if ALL three hold:
> 1. **Anchored** — it is about a specific rostered or precisely-identifiable entity. Never about "the market," "the borrower generally," or an unnamed party.
> 2. **Discriminating** — it would help distinguish this entity from a typical UK property-finance peer. If the statement would be true of most developers, most lenders, or most schemes, do not extract it.
> 3. **Material** — it is an amount, term, party/role, date/milestone, obligation, security interest, ownership/control fact, status change, or stated appetite/preference.
>
> EXTRACT (examples):
> - "Hampshire Trust Bank provides a £3.2M senior facility to Bayfield Homes (Wellington) Ltd at SONIA + 4.25%, maturing 2027-09-30." *(facility letter)*
> - "The Wellington Road scheme has a GDV of £4.2M across 6 units." *(appraisal)*
> - "James Carter is a director of both Bayfield Homes Ltd and Marlow Property Group Ltd." *(KYC — cross-entity control fact)*
> - "Planning consent 23/01847/FUL for 6 dwellings was granted by Test Valley BC on 2026-03-14 subject to a s106 contribution of £48,000." *(planning)*
> - "Bayfield Homes (Wellington) Ltd granted a debenture and first legal charge over the Wellington Road site to Hampshire Trust Bank on 2026-04-02." *(security)*
> - "The facility includes a personal guarantee from James Carter capped at £500,000." *(obligation)*
>
> DO NOT EXTRACT (examples):
> - "Bayfield Homes is a UK-based property developer." *(true of nearly every client — fails discrimination)*
> - "The property market has experienced volatility in recent months." *(unanchored commentary)*
> - "The valuation was prepared in accordance with RICS Red Book standards." *(boilerplate)*
> - "The borrower must comply with all applicable laws." *(standard clause, no deviation)*
> - "The scheme is subject to obtaining planning permission." *(generic; extract only the specific application, decision, or condition)*
> - "The directors are experienced in residential development." *(marketing prose)*
>
> When a number appears in multiple places with different values, extract each with its exact source location — do not reconcile them yourself.

## Authority tiers (encode on every observation)

The engine resolves cross-document contradictions on this scale (matching `atomsCore.AUTHORITY_TIERS` exactly — higher wins). Stamp `observation.authorityTier` by document type:

| Tier | Document type |
|---|---|
| 5 | Executed legal documents (debentures, executed legal charges, deeds) |
| 4 | Facility letters / term sheets / loan agreements |
| 3 | Valuations / appraisals |
| 2 | Internal briefs / memos |
| 1 | Emails and everything else |

## Style rules

- All CONVENTIONS.md rules apply. The atoms you emit are data, not prose — but keep `statement` sentences UK-English, evidence-first, and free of em dashes / rule-of-three.
- **Never fabricate a resolution.** If a mention doesn't resolve to a roster id, drop the fact and log a gap — do not attach a plausible-but-wrong id to satisfy the anchoring gate.
- **One fact, one atom.** Do not pack multiple facts into one statement; the engine dedups per identity, and compound statements defeat that.

## Tool dependencies

MCP tools:

- `atoms.vocabulary` — legal predicates (step 2).
- `atoms.getForSubject` — existing coverage / idempotency (step 3).
- `atoms.createBatch` — persist atoms; READ its `rejected` array (steps 5–6).
- `atoms.upsertChunks` — narrative dual index (step 7).
- `client.getDeepContext`, `lender.list` — roster (step 1).
- `document.listByClient`, `document.get` — enumerate + read documents (steps 3–4).
- `document.extractText` / `document.applyClassification` — the fused classify+atomize pass ("Full onboarding" above): server-side parse in, agent classification out.
- `skillRun.start` / `skillRun.complete` — runtime contract.

Claude Code native tools: `Read` for any local artefacts; no `WebSearch`/`WebFetch` needed (atomization is corpus-only).

Not yet available (log as gaps, don't invent): `entityCandidates` creation (Phase 2b) — until it ships, unresolvable people/companies are re-anchored to the client or dropped with a logged gap.

## What goes wrong

1. **Unresolvable mention.** A person/company in the document isn't in the roster and `entityCandidates` doesn't exist yet. Re-anchor to the client if the fact is truly about the client, else drop + log a `schema_gap`. Never force a wrong id.
2. **Rejects ignored.** The single most common failure is not reading `atoms.createBatch.rejected`. Always read it; repair and resubmit.
3. **Native predicate used.** `officer_of`, `funds_project` (native side), `has_appetite_for`, `developing`, `spv_of_group`, `works_at`, `psc_of` are rejected — those live in structural tables. Use `atoms.vocabulary` to see `store`.
4. **Spreadsheet chunked.** Don't `upsertChunks` fact-dense spreadsheets; atomize them instead.
5. **Big pass fired without confirmation.** >60 documents in scope must be confirmed by the operator first.
6. **Re-atomizing already-covered docs.** Skip documents whose `(documentId, contentChecksum)` already has observations (step 3) — otherwise you spend tokens re-deriving facts the engine already holds.

## References

None yet — the extraction block above and `atoms.vocabulary` are the ground truth. As good runs accumulate, anonymised exemplars will land in `corpora/`.
