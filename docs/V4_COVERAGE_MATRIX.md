# V4 Coverage Matrix

- **Backlog item**: BL-2.0
- **Purpose**: for each V3 (Together AI Llama 70B / OpenAI GPT-4o) route, document the current callers, the V4 equivalent if any, the work needed to migrate, and the recommended action. Gates every WS-2 migration item.
- **Method**: code audit of `model-testing-app/src/`, `model-testing-app/convex/`, `mobile-app/` for active callers of each V3 route.

## Matrix

| V3 route | Current callers | V4 equivalent | Delta to close | Migration risk | Recommended action |
|---|---|---|---|---|---|
| `/api/bulk-analyze` | No active callers found. `DirectUploadButton.tsx` already switched to `/api/v4-analyze`. | `/api/v4-analyze` | None. V4 accepts `file`, `file_0` / `fileUrl_0` formats and returns `documents[]` with V3-fallback parity. | low | Migrate callers (already done in code; verify by traffic check before delete) |
| `/api/analyze-file` | **3 active callers**: `DirectUploadButton.tsx:94`, `AddKnowledgeEntryModal.tsx:73`, `fileQueueProcessor.ts:269` (twice in parallel retry logic) | None | V4 needs a single-file analysis route returning `{summary, fileType, category, reasoning, confidence, tokensUsed, extractedData}`. Today V4 only batch-analyzes. | medium | **Build V4 first** (a single-file `/api/v4-analyze-file` or extend `/api/v4-analyze` to accept a single document and return single-document shape) |
| `/api/reanalyze-document` | No active callers. Route is `@deprecated` in comments. `FileDetailPanel` migrated to `/api/v4-analyze`. | `/api/v4-analyze` or `/api/v4-deep-extract` | None. V4 deep-extract supports up to 400K chars; full coverage. | low | **Delete V3 immediately** (no callers, already deprecated) |
| `/api/process-intelligence-queue` | No active callers detected. POST/GET defined; no `fetch` invocations in `src/` or `convex/`. | Closest existing: `/api/intelligence-extract` (single document) or `/api/consolidate-intelligence` (normalisation) | Either a new batch queue route, or this becomes a Convex scheduled action instead of a Next.js route. | high | **Needs design call**: should this become a Convex internal action triggered by `intelligenceExtractionJobs` table, or stay as an HTTP endpoint? Architecturally, the answer is probably "Convex internal action" since the MCP migration (BL-5.1) moves work into Convex anyway. |
| `/api/knowledge-parse` | **3+ active callers**: `NoteUploadModal.tsx:187,219` (PDF/DOCX parsing), `DynamicChecklistInput.tsx` (grep pending) | None | V4 has no route that parses document requirement descriptions into structured checklist items. Current V4 routes focus on data and intelligence extraction, not requirement-text parsing. | medium | **Build V4 first** (`/api/v4-parse-requirements` returning structured checklist requirement items, or extend `/api/intelligence-extract` with a `targetSchema` param per the BL-5.5 unified extract primitive) |
| `/api/ai-assistant` | **1 active caller**: `AIAssistantBlock.tsx:117` (note editor). Marked deprecated in code with TODO to migrate to `/api/chat-assistant`. | `/api/chat-assistant` | None. V4 chat-assistant is the documented replacement. | low | **Migrate caller** (update `AIAssistantBlock.tsx` to call chat-assistant); delete V3 after observation |
| `/api/codify-extraction` | **6+ active callers**: `AddDataLibraryItemModal.tsx:116` (2 actions), `DataLibrary.tsx:683,763,1316` (Fast Pass, Smart Pass, suggest-single, add-item), `FileAssignmentCard.tsx` (codify action), upload page. | None | V4 has no codification subsystem. Codification is a complete V3-specific domain (Fast Pass alias lookup plus Smart Pass LLM-driven canonical code mapping). | high | **Needs design call**: is data codification in scope for V4, or does it deprecate in favour of V4's consolidated intelligence + manual mapping flow? This is the largest open question in V3 retirement. |
| `/api/generate-insights` | No active callers found. Likely a prototype that never shipped. | `/api/chat-assistant` (agentic loop can generate summaries) or `/api/daily-brief/generate` | Chat-assistant can produce executive summaries via prompting; no dedicated insights route in V4. | medium | **Delete V3** (no callers; functionality covered by chat-assistant agentic loop or the daily brief route) |
| `/api/reminders/parse` | **1 active caller**: `TaskNaturalLanguageInput.tsx:16`, `mode='reminder'` branch | `/api/reminders/enhance` + `/api/tasks/agent` (split functionality) | V3 parses natural language to structured reminder in one call. V4 splits this across two routes (enhance for light polish, tasks/agent for NL-to-structured-task). Either unify or extend one of them. | medium | **Build V4 first** (extend `/api/reminders/enhance` with a `parse` mode that returns a structured reminder from raw NL input; or build a dedicated `/api/reminders/parse-v4`) |

## Summary

| Action | Count | Routes |
|---|---|---|
| Already migrated; verify and delete | 1 | bulk-analyze |
| Delete immediately (no callers) | 2 | reanalyze-document, generate-insights |
| Migrate caller, then delete | 1 | ai-assistant |
| Build V4 first, then migrate | 3 | analyze-file, knowledge-parse, reminders/parse |
| Needs design call | 2 | process-intelligence-queue, codify-extraction |
| **Total V3 routes** | **9** | |

## Recommended sequencing for WS-2

Phase B (additive build-out): unblock the three "build V4 first" items by creating the missing V4 routes. These are small, additive route additions to the V4 surface; no risk to existing V3 callers because V3 stays alive.

1. **BL-2.0a** (new): Build `/api/v4-analyze-file` single-document V4 route. Mirrors `/api/v4-analyze` response shape but for one file.
2. **BL-2.0b** (new): Build `/api/v4-parse-requirements` for knowledge-parse coverage, OR extend `/api/intelligence-extract` with a `targetSchema` param (this aligns with BL-5.5 unified extract primitive; doing it once at primitive level is cleaner).
3. **BL-2.0c** (new): Build NL-to-reminder coverage in V4 (extend `/api/reminders/enhance` with parse mode).

Then proceed with caller migrations per route (BL-2.1 through BL-2.11 in the existing backlog).

## The two design-call items

These need an architectural decision before any code lands.

### Codify-extraction (`/api/codify-extraction`)

**The question**: is data codification (mapping extracted financial figures to canonical item codes via Fast Pass alias lookup plus Smart Pass LLM mapping) still in scope for V4, or does V4 collapse codification into the consolidated-intelligence flow?

**Why it matters**: codification is a six-caller V3 surface. Six call sites need a story. If V4 keeps codification but routes it differently, this is a build-V4-then-migrate task. If V4 retires the concept, the call sites need replacement workflows.

**Initial position**: keep codification. The Fast Pass alias lookup is fast, deterministic, and cheap; the Smart Pass LLM mapping is where V4 should take over. Recommend rebuilding the codify route on V4 with Fast Pass unchanged and Smart Pass switched to Claude. This preserves the call sites' contracts.

**Decision needed before**: BL-2.6 (the codify-extraction migration item in the existing backlog).

### Process-intelligence-queue (`/api/process-intelligence-queue`)

**The question**: should batch intelligence extraction processing be an HTTP route, or a Convex scheduled action consuming the `intelligenceExtractionJobs` table?

**Why it matters**: the existing route has no detectable callers, suggesting the queue processor was always meant to be cron-triggered. The MCP architecture (BL-5.1) pushes work into Convex; an HTTP route here is the wrong shape.

**Initial position**: convert to a Convex scheduled internal action. Drop the HTTP route. The `intelligenceExtractionJobs` table already exists and tracks status; the consumer becomes a `crons.ts` entry that processes pending jobs.

**Decision needed before**: BL-2.4.

## Deletion criteria

Per the WS-0 non-negotiables and the backlog's V3 retirement coverage gate:

- A V3 route is deleted only after the V4 equivalent ships, every caller migrates, and the V3 route shows zero traffic for 7 consecutive days in Vercel logs.
- The two "delete immediately" routes (reanalyze-document, generate-insights) skip the 7-day gate because they have no callers. Verify zero traffic in the last 30 days before deleting to be safe.

## Final state

When WS-2 completes:

- 0 V3 routes remain in `model-testing-app/src/app/api/`.
- `together-ai` dependency removed from `package.json`.
- `critic-agent` decision logic lifted to a `classification-critic` skill (per WS-6.5); OpenAI HTTP call gone.
- `TOGETHER_API_KEY` and `OPENAI_API_KEY` env vars removed.
- All AI traffic routes through Claude via the V4 routes (or the unified primitives once BL-5 lands).
