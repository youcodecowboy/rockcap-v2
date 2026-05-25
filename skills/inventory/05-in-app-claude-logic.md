# In-App Claude Logic, API Routes, Prompts

This document inventories the AI-driven logic embedded in the app server-side. It is the input to step 3 of the brief (skill-vs-tool boundary decisions): for each piece of existing logic, decide whether it stays in the app as a tool, moves to the top-layer skills as a skill, splits between the two, or is replaced by a coarse-grained primitive.

The app currently runs a dual-track AI pipeline. The V3 stack (Together AI Llama 70B + OpenAI GPT-4o as critic) still handles legacy bulk-analyze and queue paths. The V4 stack (Anthropic Claude, Haiku for real-time and Opus/Sonnet for batch) handles new chat, deep extraction, meeting extraction, and the modern batch pipeline. The dual track is mid-migration; some V3 routes are unused.

## Part A: In-app skills, agents, and Claude-driven logic

For each piece of logic the classification column uses the test in the brief: **deterministic** plumbing (orchestrates tool calls, no real judgement), **judgement-carrying** (makes RockCap-specific calls a human would otherwise make), or **hybrid**.

### V3 agents (legacy pipeline)

Location: `src/lib/agents/`.

| Agent | File | Model | Tools | Classification | What it does |
|---|---|---|---|---|---|
| Summary Agent | `summary-agent/index.ts` | Together.ai Llama 3.3 70B | none | deterministic | Stage 1 of V3 pipeline. Extracts what/who/where/when/why from documents without making classification decisions. |
| Classification Agent | `classification-agent/index.ts` | Together.ai Llama 3.3 70B | none | hybrid | Stage 2. Takes Summary output and decides fileType, category, folder. RockCap-specific calls (file type taxonomy is RockCap's) but mostly mechanical. |
| Critic Agent | `critic-agent/index.ts` | OpenAI GPT-4o | none | judgement-carrying | Stage 4 (conditional). Reviews Classification output, applies learned corrections from feedback loop with tiered context (none/consolidated/targeted/full), overrides obvious mistakes, validates checklist matches. **Skill candidate.** |
| Checklist Agent | `checklist-agent/index.ts` | Together.ai Llama 3.3 70B | none | deterministic | Matches documents to checklist requirements using content + filename. Falls back to filename patterns if API fails. |
| Filename Matcher | `filename-matcher/index.ts` | none (regex) | none | deterministic | Pure heuristic filename pattern matching. Stays in app as a tool. |
| Deterministic Verifier | `deterministic-verifier/index.ts` | none (keyword scoring) | none | deterministic | Validates classification using keyword matching against `fileTypeDefinitions`. Compares deterministic scores against LLM classification, flags mismatches above 0.25 threshold. Stays in app as a tool. |
| Verification Agent | `verification-agent/index.ts` | Together.ai Llama 3.3 70B | none | deterministic | Validates low-confidence classification decisions. Mechanical work, stays in app. |

### V4 pipeline (current)

Location: `src/v4/`.

| Component | Files | Model | Tools | Classification | What it does |
|---|---|---|---|---|---|
| V4 Pipeline | `v4/lib/pipeline.ts`, `v4/lib/anthropic-client.ts`, `v4/lib/reference-library.ts`, `v4/lib/document-preprocessor.ts`, `v4/lib/placement-rules.ts`, `v4/lib/result-mapper.ts`, `v4/lib/v4-batch-processor.ts` | Claude Opus / Sonnet (Sonnet as critic) | none (pure batch) | hybrid | Modern skills-based architecture. Replaces the multi-stage V3 pipeline with single/dual Claude calls. Processes 1-8 documents per batch, loads relevant references by tag matching, returns classification + intelligence extraction + checklist matching in one structured response. Uses two-block ephemeral prompt caching (1h TTL). |
| Document Classify Skill | `v4/skills/document-classify/` | (data only) | n/a | n/a | Reference data the V4 pipeline loads. Pattern source for the eventual top-layer skills. |

### Chat assistant (real-time agentic loop)

Location: `src/lib/chat/`.

| Component | File | Model | Tools | Classification | What it does |
|---|---|---|---|---|---|
| Agentic Loop | `agenticLoop.ts` | Claude Haiku 4.5 | dynamic skill tools + core tools | hybrid | Real-time chat for the RockCap assistant. Resolution chain (the brief's preferred order): references → `queryIntelligence` → tools (including `searchSkills` and `loadReference`) → `reclassify` only if those cannot answer. Read tools execute immediately; write tools queue as `chatActions` for user confirmation. Uses ephemeral prompt caching. |
| Skill Catalog | `skills.ts` | n/a | n/a | n/a | The agentic loop's lookup table of which tool groups to load given a query. Replaced by the top-layer skills tree at architecture maturity. |
| System Prompt | `systemPrompt.ts` | n/a | n/a | n/a | Builds the system prompt with rules (UK English, no em dashes, hyperlinks as HTML, resolution chain, note formatting). Carries the brief's voice rules today. |

### Other Claude-driven logic

| Logic | File | Model | Classification | What it does |
|---|---|---|---|---|
| Markdown→Tiptap | `lib/notes/markdownToTiptap.ts` | none | deterministic | Format conversion only. Stays in app. |

## Part B: API routes inventory

All routes live under `model-testing-app/src/app/api/`. The version column reflects which AI track they sit on.

### V4-current routes

| Route | Method | Backing | Purpose |
|---|---|---|---|
| `/api/v4-analyze` | POST | V4 pipeline (Claude Opus/Sonnet) | Batch document classification + intelligence extraction |
| `/api/v4-deep-extract` | POST | V4 pipeline | Deep re-analysis of a single document with up to 400K chars |
| `/api/chat-assistant` | POST | Agentic loop (Claude Haiku 4.5) | Real-time chat with dynamic skill loading |
| `/api/intelligence-extract` | POST | Claude Haiku (with Llama fallback) | Extract canonical fields from document/text/email |
| `/api/meeting-extract` | POST | Claude Haiku 4.5 | Extract meeting metadata + action items |
| `/api/process-meeting-queue` | POST | Claude Haiku | Batch process meeting extraction queue |
| `/api/bulk-extract` | POST | Convex + Claude | Batch intelligence field extraction |
| `/api/extract-prospecting-context` | POST | Claude | Extract deal/prospect context from documents |
| `/api/consolidate-intelligence` | POST | Claude Haiku | Normalise extracted fields to canonical schema |
| `/api/debug-codification` | POST | Claude + Convex | Debug codified financial extraction |
| `/api/daily-brief/generate` | POST | Claude | Generate daily organisation briefs |
| `/api/note-cleanup` | POST | Claude | Light polish of raw notes |
| `/api/reminders/enhance` | POST | Claude | Enhance reminder with AI |
| `/api/tasks/agent` | POST | Claude | Parse natural language into structured tasks/events |
| `/api/prospects/*` | POST | Convex + Claude | Prospect scoring and gauntlet |

### V3-legacy routes

| Route | Method | Backing | Purpose |
|---|---|---|---|
| `/api/bulk-analyze` | POST | Together AI Llama + OpenAI Critic | Bulk document analysis (multi-agent V3 pipeline) |
| `/api/analyze-file` | POST | Convex + V3 agents | Single file classification + enrichment suggestions |
| `/api/reanalyze-document` | POST | Together AI Llama | Re-analyse document for improved confidence |
| `/api/process-intelligence-queue` | POST | Together AI Llama | Batch process intelligence extraction queue |
| `/api/process-extraction-queue` | POST | Convex background job | Batch process filed document extraction |
| `/api/knowledge-parse` | POST | Together AI Llama | Parse document requirement descriptions |
| `/api/ai-assistant` | POST | Together AI Llama | Note editing AI (deprecated) |
| `/api/codify-extraction` | POST | Together AI Llama | Codify financial figures |
| `/api/generate-insights` | POST | Together AI Llama | Generate client/project executive summaries |
| `/api/reminders/parse` | POST | Together AI Llama | Parse natural-language reminders |

### Integration routes

| Route | Methods | Purpose |
|---|---|---|
| `/api/hubspot/webhook` | POST | Receive HubSpot webhooks |
| `/api/hubspot/webhook-process` | POST | Convex-to-Next bridge for webhook processing |
| `/api/hubspot/sync-all` | POST | Cron-triggered HubSpot recurring sync entry point |
| `/api/hubspot/sync-companies` | POST | Manual companies sync |
| `/api/hubspot/sync-contacts` | POST | Manual contacts sync |
| `/api/hubspot/sync-deals` | POST | Manual deals sync |
| `/api/hubspot/sync-leads` | POST | Manual leads sync |
| `/api/hubspot/sync-pipelines` | POST | Manual pipelines sync |
| `/api/hubspot/recurring-sync` | POST | Manual trigger of recurring sync |
| `/api/hubspot/explore-leads` | POST | Lead exploration utility |
| `/api/hubspot/test-single-import` | POST | Test single import |
| `/api/hubspot/fix-data` | POST | One-off data fix |
| `/api/hubspot/fireflies-backfill` | POST | One-off Fireflies detection backfill |
| `/api/google/auth` | GET | Initiate Google OAuth |
| `/api/google/callback` | GET | Google OAuth callback |
| `/api/google/webhook` | POST | Google Calendar push channel webhook |
| `/api/google/setup-sync` | POST | Push channel setup |
| `/api/google/disconnect` | POST | Revoke Google access |
| `/api/google/events` | GET/POST | Event admin route |
| `/api/companies-house/test-auth` | GET | CH API auth test |
| `/api/companies-house/test-simple` | GET | Simple CH test |
| `/api/companies-house/search-companies` | GET | CH search |
| `/api/companies-house/sync-companies` | POST | Import CH company to local cache |
| `/api/companies-house/get-company-charges` | GET | Fetch charges |

### Utility routes

| Route | Methods | Purpose |
|---|---|---|
| `/api/convex-file` | GET | Fetch file from Convex storage |
| `/api/check-duplicates` | GET | Check for duplicate documents |
| `/api/quick-export` | POST | Export data to custom format |
| `/api/tasks/*` | POST | Task creation utilities |
| `/api/reminders/*` | POST | Reminder utilities |
| `/api/notifications/*` | POST | Notification routes |
| `/api/migrations/*` | POST | Migration trigger routes |
| `/api/mobile/*` | various | Mobile-specific endpoints |
| `/api/test-feedback-loop` | POST | Feedback loop test |

## Part C: Significant prompts catalogue

Files containing prompts longer than 200 characters or that meaningfully encode RockCap-specific judgement.

| File | Model | Role |
|---|---|---|
| `src/lib/agents/summary-agent/prompt.ts` | Llama 70B | Document analysis prompt (V3 Stage 1) |
| `src/lib/agents/classification-agent/prompt.ts` | Llama 70B | Classification decision prompt (V3 Stage 2) |
| `src/lib/agents/critic-agent/index.ts` (inline, lines 309-412) | GPT-4o | Final decision review prompt with learned corrections (V3 Stage 4) |
| `src/lib/chat/systemPrompt.ts` | Claude Haiku 4.5 | Chat assistant system prompt: resolution chain, skill loading, note formatting rules, voice rules (UK English, no em dashes) |
| `src/v4/lib/anthropic-client.ts` (lines 85-101, 107-170) | Claude Opus/Sonnet | V4 system prompt, two-block cached structure (skill instructions + folder list as stable block; references as dynamic block) |
| `src/app/api/meeting-extract/route.ts` (SYSTEM_PROMPT) | Claude Haiku 4.5 | Meeting analysis: metadata, attendees, action items, decisions |
| `src/app/api/intelligence-extract/route.ts` | Claude Haiku 4.5 | Field extraction with confidence scoring |
| `src/app/api/consolidate-intelligence/route.ts` | Claude Haiku | Map extracted custom fields to canonical RockCap schema |
| `src/app/api/process-intelligence-queue/route.ts` | Llama 70B | Batch intelligence extraction (V3) |
| `src/app/api/generate-insights/route.ts` | Llama 70B | Executive summary generation (V3) |
| `src/app/api/note-cleanup/route.ts` (SYSTEM_PROMPT) | Claude | Light note polish (not rewrite) |
| `src/app/api/codify-extraction/route.ts` | Llama 70B | Financial figure codification (V3) |
| `src/app/api/reminders/parse/route.ts` | Llama 70B | Natural-language reminder parsing (V3) |
| `src/app/api/tasks/agent/route.ts` | Claude | Task and event creation from natural language |
| `src/app/api/knowledge-parse/route.ts` | Llama 70B | Document requirement description parser (V3) |
| `src/app/api/daily-brief/generate/route.ts` | Claude | Daily briefing generation |

## Part D: Boundary decisions for step 3 of the brief

The brief's test: if Claude needs to make a RockCap-specific judgement, it is a skill. Otherwise it is a tool. Applying the test to existing logic:

### Clearly a skill (judgement-carrying, move to top-layer)

- **Critic Agent (`critic-agent`)**. The decision logic (overrides learned from feedback, tier-selected context) is exactly the kind of evolving RockCap expertise the brief wants in skills. Migrate the decision logic to a skill; keep the feedback-loop storage in the app.
- **The "resolution chain" rules currently in `chat/systemPrompt.ts`**. The chain itself (references → intelligence → tools → reclassify) is a workflow pattern. It should sit in a top-layer skill that the chat assistant loads, not in the system prompt.
- **The financial advisory tools (`getFinancialSummary`, `assessDealMetrics`, `compareDocumentValues`)**. They already carry LTV norms, 15% profit margin threshold, 5% variance threshold. These are judgements that should be in skills, with the underlying data fetches stay as atomic tools.

### Clearly a tool (deterministic, stays in app)

- **Filename Matcher**. Regex matching. Already deterministic.
- **Deterministic Verifier**. Keyword-scoring against `fileTypeDefinitions`. Deterministic.
- **Markdown→Tiptap conversion**. Format conversion.
- **All Convex queries and mutations**. The atomic-tool layer in `src/lib/tools/domains/` is the right home.

### Splits (some judgement, some plumbing)

- **V4 Pipeline**. The orchestration logic (which references to load, which model to call, how to repair truncated output) is plumbing and stays. The classification rubric and intelligence-extraction schema are judgement and should live in skills (or skill-loaded reference data) rather than in the route file.
- **Chat agentic loop**. The loop mechanics (tool dispatch, confirmation queueing, prompt caching) stay. The skills it loads should be top-layer skills.
- **Meeting extraction**. The mechanics (PDF parsing, action-item structure) stay. The "what counts as an action item, what counts as a decision" rules are judgement.

### Candidates for retirement

- **V3 pipeline routes overall**. If the V4 pipeline matches V3 capability, the legacy routes are dead weight. Verify which V3 routes still serve production traffic before retiring. Likely retirement candidates: `/api/ai-assistant` (marked deprecated in code), `/api/reminders/parse` (paralleled by `/api/reminders/enhance`).
- **`together-ai` SDK**. If all V3 routes retire, the SDK retires with them.
- **OpenAI GPT-4o dependency in critic-agent**. If the Critic Agent moves to a skill, the model choice changes (likely to Claude).

### Cross-cutting primitive candidates

Mapping the brief's primitive list to the inventory:

1. **`deal.get_full_context`**: does not exist. Would compose `projects.get`, `intelligence.getProjectIntelligence`, `knowledgeLibrary.getChecklistByProject`, recent documents, recent activities. New primitive.
2. **`document.extract(targetSchema, source)`**: partially exists across several routes (V4 deep extract, intelligence-extract, meeting-extract). Could be unified.
3. **`template.populate(template, data)`**: partially exists for Excel financial models. Could be generalised for DOCX, PDF forms.
4. **Cadence scheduling engine**: does not exist. Schema and Convex cron infrastructure are ready.
5. **Approval queue surface**: partially exists as `chatActions`. Would need promoting to a cross-cutting entity and a UI surface.

These five are the right candidates for primitive work, in roughly the priority the brief gives them.
