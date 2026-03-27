# Chat Agent Rework — Skills-Based Architecture

**Date**: 2026-03-14
**Status**: Draft
**Goal**: Transform the chat from a token-heavy tool-dumping assistant into a lean, skills-based central agent

---

## Problem Statement

A simple query like "what's the registered address?" costs **42K tokens** despite the answer being visible at 95% confidence in the Intelligence tab. The current architecture loads everything upfront:

| Component | Current Tokens | Problem |
|-----------|---------------|---------|
| Tool definitions | ~8-12K | 70 tools loaded every call |
| Document context | 5-20K | ALL docs dumped via `gatherChatContext()` |
| Intelligence summary | ~300 | Already optimized |
| System prompt | ~800 | Reasonable |
| **Total base** | **~15-33K** | Before model even thinks |

**Target**: Simple lookups under **3-4K tokens**. Complex analysis scales proportionally.

---

## Architecture Overview

### Core Principle: Load Nothing Until Needed

Replace the "dump everything upfront" pattern with a **skills-based architecture** where the agent starts lean and loads capabilities on demand via client-side tool search.

```
┌─────────────────────────────────────────────────┐
│  Base System Prompt (~1.5K tokens)              │
│  - Identity & behavior rules                    │
│  - Available skill categories (names only)      │
│  - Page context hint                            │
├─────────────────────────────────────────────────┤
│  Auto-Injected References (~300-600 tokens)     │
│  - @ mention → intelligence summary per entity  │
│  - Page context → intelligence summary          │
│  - Compact, structured, immediately useful      │
├─────────────────────────────────────────────────┤
│  Always-Loaded Tools (~500 tokens)              │
│  - queryIntelligence (drill down into fields)   │
│  - searchSkills (discover & load tool groups)   │
│  - loadReference (fetch additional references)  │
├─────────────────────────────────────────────────┤
│  On-Demand Skills (loaded via searchSkills)     │
│  - doc_* (fetch, read, compare documents)       │
│  - note_* (create, update, list notes)          │
│  - task_* (create, manage tasks)                │
│  - contact_* (lookup, create contacts)          │
│  - event_* (calendar, reminders)                │
│  - search_* (search clients/projects/docs)      │
│  - finance_* (financial analysis)               │
│  - checklist_* (checklist management)            │
│  - flag_* (flag management)                     │
│  - meeting_* (meeting extraction)               │
│  - filing_* (document filing, reanalysis)       │
└─────────────────────────────────────────────────┘
```

---

## Design Sections

### 1. Skills Registry

Replace the flat tool registry with a **two-tier skill system**:

**Tier 1 — Skill Catalog** (always in system prompt, ~200 tokens):
```
Available skills you can load via searchSkills:
- intelligence: Query extracted data fields, compare values, check confidence
- documents: Fetch, read, summarize, compare project documents
- notes: Create, update, list client/project notes
- tasks: Create, assign, update, list tasks
- contacts: Lookup, create, update contacts
- calendar: Events, reminders, meetings
- search: Search across clients, projects, documents
- filing: File documents, reanalyze, manage queue
- checklists: View, update project checklists
- financial: Financial analysis, loan calculations
- flags: Create, manage project flags
```

**Tier 2 — Skill Definitions** (loaded on demand):
Each skill is a group of related tools with their Anthropic-format definitions. When the model calls `searchSkills("notes")`, the server injects the `note_*` tool definitions into the `tools` array for the next API call in the agentic loop.

**File**: `src/lib/tools/skills.ts`
```typescript
interface Skill {
  name: string;
  description: string;
  domain: string;
  tools: AtomicTool[]; // existing tool definitions from registry
}

// Skills map domain groups to their tools
const SKILL_CATALOG: Record<string, Skill> = {
  intelligence: {
    name: 'intelligence',
    description: 'Query extracted intelligence fields, compare values, check confidence scores',
    domain: 'intelligence',
    tools: [...intelligenceTools],
  },
  documents: {
    name: 'documents',
    description: 'Fetch, read, summarize, compare project documents',
    domain: 'document',
    tools: [...documentTools, ...internalDocumentTools],
  },
  // ... etc
};
```

### 2. Client-Side Tool Search (searchSkills)

The `searchSkills` tool is always loaded. When called, it returns skill descriptions and triggers tool injection:

**How it works in the agentic loop**:
1. Model receives user message with minimal tools (`queryIntelligence`, `searchSkills`)
2. If model needs capabilities beyond intelligence lookup, it calls `searchSkills("documents")`
3. Server-side handler:
   - Looks up matching skills from `SKILL_CATALOG`
   - Returns skill descriptions + tool names to the model
   - **Sets a flag** to inject those tool definitions into the next API call
4. Next iteration of agentic loop includes the new tools in the `tools` array
5. Model can now call the discovered tools

**Key implementation detail**: The agentic loop already exists in `route.ts`. We modify it so the `tools` array is **dynamic** — it starts minimal and grows as skills are loaded.

```typescript
// In the agentic loop
let activeTools = [...coreTools]; // queryIntelligence, searchSkills
let loadedSkills = new Set<string>();

while (true) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    system: systemPrompt,
    tools: formatForAnthropicTools(activeTools),
    messages: conversationMessages,
  });

  // Process tool calls
  for (const block of response.content) {
    if (block.type === 'tool_use' && block.name === 'searchSkills') {
      const skillNames = resolveSkillSearch(block.input.query);
      for (const name of skillNames) {
        if (!loadedSkills.has(name)) {
          activeTools.push(...SKILL_CATALOG[name].tools);
          loadedSkills.add(name);
        }
      }
      // Return skill info to model
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: formatSkillSearchResult(skillNames),
      });
    }
    // ... handle other tool calls normally
  }

  if (response.stop_reason === 'end_turn') break;
}
```

### 3. Kill gatherChatContext()

The biggest token waste is `gatherChatContext()` loading ALL documents, notes, contacts, tasks, events, and reminders upfront (~5-20K tokens).

**Replace with**: On-demand context loading via skills.

| Before | After |
|--------|-------|
| Load all document summaries | Model calls `doc_list` or `doc_fetch` when needed |
| Load all notes | Model calls `note_list` when needed |
| Load all contacts | Model calls `contact_list` when needed |
| Load all tasks | Model calls `task_list` when needed |
| Load all events/reminders | Model calls `event_list` when needed |

**What stays in the system prompt**:
- Intelligence summary (~300 tokens) — compact overview of extracted data
- Page context hint (~50 tokens) — "User is viewing Client: Acme Corp, Project: 123 High St"
- @ mention resolved context (~100 tokens) — "User explicitly referenced @Acme Corp (client ID: xxx)"

**What goes away**:
- Full document summaries (the single biggest token consumer)
- Notes dump
- Contacts dump
- Tasks/events/reminders dump
- The entire `gatherChatContext()` function

### 4. @ Mention System

Users can `@client` or `@project` to explicitly scope their query, eliminating ambiguity.

**Frontend (ChatInput.tsx)**:
- Detect `@` character in input
- Show autocomplete dropdown searching clients + projects via Convex
- On selection: insert `@Entity Name` with hidden metadata (entityType, entityId)
- Visual: show as a styled chip/badge in the input

**Backend (route.ts)**:
- Parse `@` mentions from message before sending to API
- Resolve entity IDs
- Inject resolved context into system prompt:
  ```
  User explicitly mentioned: @Acme Corp (client, ID: abc123)
  This means queries should be scoped to this client and its projects.
  ```
- If `@project` mentioned: load both project AND parent client intelligence

**Data flow**:
```
User types: "What's the LTV on @Riverside Development?"
                                    ↓
Frontend resolves: { type: 'project', id: 'xyz', name: 'Riverside Development' }
                                    ↓
Backend injects: scoped intelligence summary for that project + client
                                    ↓
Model: queryIntelligence({ scope: 'project', projectId: 'xyz', fieldName: 'ltv' })
                                    ↓
Response: "The LTV for Riverside Development is 65%" (~3K tokens total)
```

### 4b. Reference System

References are **structured context blocks** that get injected into the system prompt automatically or on demand. They're the primary way the agent gets knowledge without burning tool calls.

**Auto-Injected References (no tool call needed)**:

Every `@` mention and page context triggers an automatic reference injection:

| Trigger | Reference Injected | ~Tokens |
|---------|-------------------|---------|
| `@Client Name` | Client intelligence summary | ~300 |
| `@Project Name` | Project intelligence summary + parent client summary | ~500 |
| Page context (client page) | Client intelligence summary | ~300 |
| Page context (project page) | Project + client intelligence summaries | ~500 |
| Multiple `@` mentions | Summary per entity | ~300 each |

**Reference format** (injected into system prompt):
```
## References

### @Acme Holdings (Client)
Status: Active | Type: Developer
Key Data: Registered Address: 123 Main St | Company #: 12345678
Directors: John Smith, Jane Doe | SIC: 41100
Financials: Total Exposure: £4,200,000 across 3 projects
Intelligence: 38/48 fields filled | 2 conflicts detected
Missing Critical: Sanctions Check, PEP Status

### @Riverside Development (Project, Client: Acme Holdings)
Status: In Progress | Category: Residential
Loan: £2,400,000 | LTV: 65% | GDV: £4,200,000
Term: 18 months | Rate: 8.5% | Facility: Development
Site: 45 River Lane, London SW1 | Units: 12
Intelligence: 82/105 fields filled | 1 conflict
Missing Critical: Insurance Expiry, Title Number
```

**On-Demand References (via `loadReference` tool)**:

For deeper context the model can request specific reference types:

```typescript
// loadReference tool definition
{
  name: 'loadReference',
  description: 'Load additional context about a client, project, or document',
  parameters: {
    type: { enum: ['client_summary', 'project_summary', 'document_summary', 'document_list', 'contact_list', 'note_list', 'knowledge_bank'] },
    entityId: { type: 'string' },
  }
}
```

| Reference Type | What it returns | ~Tokens |
|---------------|-----------------|---------|
| `client_summary` | Full intelligence summary for a client | ~300 |
| `project_summary` | Full intelligence summary for a project | ~300 |
| `document_summary` | Summary of a specific document | ~200-500 |
| `document_list` | List of documents with names, types, dates | ~100-500 |
| `contact_list` | Contacts for client/project | ~100-300 |
| `note_list` | Recent notes for client/project | ~200-500 |
| `knowledge_bank` | Knowledge bank entries for entity | ~200-500 |

**Key difference from gatherChatContext()**: References are loaded **individually and on demand**, not as a single massive dump. The model decides what it needs based on the question.

**Why this is better than just using tools**:
- References inject **context**, not tool results. They appear in the system prompt where the model can reason about them naturally.
- No tool call overhead (no `tool_use` → `tool_result` round-trip for auto-injected refs)
- The model "just knows" the facts about `@` mentioned entities
- `loadReference` is for when the model realizes it needs more context mid-conversation

**Behavior when NO @ mention and no page context**:
- Model can still use `searchClients` / `searchProjects` tools (loaded via `search` skill)
- This is the fallback for global-context conversations

**Behavior when on a page but no @ mention**:
- Page context injected as a **hint**: "User is currently viewing Client: X, Project: Y"
- System prompt instruction: "The page context is a hint, not a constraint. If the user's question doesn't seem related to the current page context, ask for clarification or search more broadly."

### 4c. Deep Reclassify Tool — Self-Improving Resolution Chain

When the agent can't answer from intelligence or references, it can **deep-analyze documents** to find the answer and **save new insights back to intelligence**. This creates a feedback loop where every unanswered question makes the system smarter.

**The Resolution Chain** (model follows this automatically via system prompt instructions):

```
Step 1: Check auto-injected references
        → Answer found? Respond directly. Done.

Step 2: queryIntelligence (targeted field lookup)
        → Answer found? Respond with evidence. Done.

Step 3: loadReference('document_list') — scan available documents
        → Identify 1-3 most promising documents by type/name/summary
        → e.g., "Building Contract" for a construction question

Step 4: reclassify(documentId, focusQuery) — deep document analysis
        → Pull raw document from Convex storage (by storageId)
        → Run deep extraction with UNCAPPED input tokens
        → Focus the analysis on the user's specific question
        → Extract ALL relevant fields, not just the original classification targets
        → Save new findings to client/project intelligence
        → Return findings + evidence to chat

Step 5: If not found → try next promising document (up to 3 attempts)
        → Each attempt still enriches intelligence with new discoveries

Step 6: After 3 attempts, if still not found:
        → "I've analyzed [Doc1], [Doc2], and [Doc3] but couldn't find
           the specific information you're looking for. However, I did
           extract [X] new data points that have been saved to intelligence."
```

**reclassify tool definition**:
```typescript
{
  name: 'reclassify',
  description: 'Deep-analyze a document to find specific information. Pulls raw document content and runs thorough extraction focused on the user query. Saves any new findings to intelligence automatically.',
  parameters: {
    documentId: { type: 'string', description: 'Convex document ID' },
    focusQuery: { type: 'string', description: 'What specific information to look for' },
    projectId: { type: 'string', description: 'Project to save intelligence to' },
    clientId: { type: 'string', description: 'Client to save intelligence to' },
  }
}
```

**Implementation**: The reclassify handler would:
1. Fetch the document's `storageId` from Convex
2. Download the raw file content (PDF text, etc.)
3. Call Claude (can use Haiku or Sonnet depending on document complexity) with:
   - The full document content (uncapped — this is the deep analysis)
   - The user's focus query
   - The current intelligence state (so it doesn't re-extract known fields)
   - Instructions to extract ALL relevant fields, not just the focus query
4. Parse the extraction results
5. Save new fields to intelligence via `api.intelligence.updateIntelligence`
6. Return findings + evidence (page numbers, quotes) to the chat

**Key design decisions**:
- **Max 3 reclassify attempts per question** — prevents infinite loops
- **Uncapped input tokens** — this is the one place we intentionally allow high token usage because we're creating lasting value (new intelligence entries)
- **Always saves new findings** — even if the specific answer isn't found, any extracted data enriches the system
- **Part of the `documents` skill** — loaded via `searchSkills("documents")`, not always present
- **Evidence trail** — each new intelligence entry records the source document, page, confidence, and that it was extracted via chat reclassify

**Why this is powerful**:
- The system **gets smarter over time** — every question that triggers a reclassify adds permanent intelligence
- Users discover data they didn't know was in their documents
- The "I couldn't find it but I extracted X new data points" response still feels productive
- Over time, reclassify is needed less and less as intelligence coverage increases
- This is the "outrageously intelligent" behavior — the chat doesn't just look, it learns

**Token budget for reclassify**:
| Component | Tokens |
|-----------|--------|
| Document content (full) | 5K-50K (varies by document) |
| Focus query + instructions | ~500 |
| Current intelligence state | ~300 |
| Extraction output | ~1-3K |
| **Per reclassify call** | **~6K-54K** |
| **Max per question (3 attempts)** | **~18K-160K** |

This is acceptable because:
1. It only triggers when simpler methods fail
2. Each call creates permanent value (new intelligence)
3. The V4 pipeline already does 40K+ per document classification — this is the same pattern
4. Users expect deeper analysis to take more time/resources

### 5. Proactive Briefing

When the chat opens on a client or project page, show a brief status without an API call.

**Implementation**: Client-side computation from existing Convex queries (intelligence data is already loaded for the Intelligence tab).

```typescript
// In ChatAssistantDrawer.tsx
function generateBriefing(intelligence: IntelligenceRecord): BriefingItem[] {
  const items: BriefingItem[] = [];

  // Recent changes (fields updated in last 7 days)
  const recentChanges = findRecentChanges(intelligence, 7);
  if (recentChanges.length > 0) {
    items.push({ type: 'update', text: `${recentChanges.length} fields updated recently` });
  }

  // Conflicts
  const conflicts = findConflicts(intelligence);
  if (conflicts.length > 0) {
    items.push({ type: 'warning', text: `${conflicts.length} conflicting values detected` });
  }

  // Missing critical fields
  const missing = findMissingCritical(intelligence);
  if (missing.length > 0) {
    items.push({ type: 'missing', text: `${missing.length} critical fields still missing` });
  }

  return items;
}
```

**UI**: Compact card at the top of the chat, above the message history. User can click items to ask follow-up questions (pre-fills the chat input).

### 6. Optimized System Prompt

Replace the current ~800 token system prompt with a lean ~1.5K prompt that includes intelligence summary and skill catalog.

```
You are RockCap Assistant, an AI agent for UK property development lending.
You help users manage clients, projects, documents, and financial data.

## Resolution Chain (follow in order)
1. Check References below — intelligence summaries for mentioned/viewed entities.
   If the answer is there, respond directly. No tool call needed.
2. Use queryIntelligence for specific field lookups with evidence/confidence.
3. Use loadReference for additional context (document lists, contacts, notes).
4. If you still can't answer, load the documents skill and use reclassify to
   deep-analyze up to 3 promising documents. This saves new intelligence automatically.
5. For actions (create notes, tasks, etc.), use searchSkills to discover tools.
6. After 3 reclassify attempts with no answer, tell the user what you tried and
   what new data you discovered along the way.

## Available Skills
Load on demand via searchSkills:
[skill catalog list - ~200 tokens]

## References
[Auto-injected intelligence summaries for @ mentioned entities and/or page context]
[Each ~300 tokens, structured with key fields, stats, missing critical fields]

## Context
Page: [Client/Project name the user is currently viewing, if any — treat as hint only]

## Rules
1. Lead with the answer, not the process.
2. Write operations require user confirmation before execution.
3. For financial values, use £ with commas. For percentages, use %.
4. If the user's question doesn't match the page context, ask or search broadly.
```

### 7. Token Budget Targets

| Query Type | Example | Target Tokens | Path |
|-----------|---------|---------------|------|
| Simple lookup (with @) | "What's the address on @Acme?" | ~2.5-3K | System + auto-ref → direct answer |
| Simple lookup (no @) | "What's the address?" | ~3-4K | System + queryIntelligence |
| Intelligence comparison | "Compare LTV across projects" | ~4-6K | System + loadReference x2-3 |
| Create note | "Add a note about the call" | ~4-5K | System + searchSkills + note_create |
| Document fetch | "What did the valuation say?" | ~6-12K | System + searchSkills + doc_fetch |
| Deep discovery | "What's the retention %?" | ~10-60K | System + reclassify (1-3 docs) + saves new intel |
| Multi-document analysis | "Compare the two valuations" | ~10-20K | System + searchSkills + doc_fetch x2 |
| Complex research | "Analyze all loan docs" | ~20-35K | System + multiple skills + multiple docs |

### 8. Caching Strategy

The skills-based approach changes caching dynamics:

- **System prompt** (block 0): Cached with explicit `cache_control` — stable across turns (~1.5K)
- **Skill catalog**: Part of system prompt, cached automatically
- **Tool definitions**: Dynamic, but skill groups are cached once loaded in a session
- **Conversation history**: Cached via automatic conversation caching
- **Intelligence data**: Cached server-side via existing `contextCache` (24h TTL)

**Important**: Since tools are now dynamic, the `tools` array changes between calls as skills are loaded. This means tool caching is less effective than the current approach where all tools are sent every time. However, the total tokens are so much lower that this is still a massive net win.

### 9. Context Cache Rework

Current `contextCache` stores the entire gathered context blob. Replace with:

- **Intelligence cache**: Already exists, keep as-is (lightweight summary)
- **Per-resource caching**: Cache individual document contents, note lists, etc. when fetched via tools
- **Session-level skill cache**: Track which skills are loaded in the current session to avoid re-loading

The Convex `contextCache` table can be simplified or repurposed for intelligence-only caching.

---

## Migration Strategy

This is a **full rewrite** of the chat API route, not an incremental change. The key files:

| File | Change |
|------|--------|
| `src/lib/tools/skills.ts` | **NEW** — Skill catalog, searchSkills handler, skill resolver |
| `src/lib/chat/references.ts` | **NEW** — Reference system: buildReference(), formatReference(), loadReference handler |
| `src/lib/chat/reclassify.ts` | **NEW** — Deep reclassify handler: fetch doc, run extraction, save intelligence |
| `src/lib/tools/registry.ts` | **MODIFY** — Add skill grouping, keep tool definitions |
| `src/lib/tools/executor.ts` | **KEEP** — Tool handlers unchanged, just called differently |
| `src/app/api/chat-assistant/route.ts` | **REWRITE** — New agentic loop with dynamic tool injection + reference injection |
| `src/components/ChatInput.tsx` | **REWRITE** — Add @ mention autocomplete |
| `src/components/ChatAssistantDrawer.tsx` | **MODIFY** — Add proactive briefing, handle new response format |
| `src/components/MentionAutocomplete.tsx` | **NEW** — Autocomplete dropdown for @ mentions |
| `src/components/ChatBriefing.tsx` | **NEW** — Proactive briefing card component |
| `convex/chatSessions.ts` | **MODIFY** — Store @ mention metadata per session |

**What stays the same**:
- All tool definitions in `src/lib/tools/domains/` — unchanged
- Tool executor handlers — unchanged
- Convex chat message storage — unchanged
- Pending actions / confirmation flow — unchanged
- Intelligence queries — unchanged

---

## Token Comparison: Before vs After

### Simple Query: "What's the registered address?"

**Before (42K tokens)**:
```
System prompt:           800 tokens
Tool definitions (70):  8,000 tokens
Document context:       15,000 tokens
Intelligence summary:      300 tokens
Conversation:              500 tokens
Model output:              400 tokens
───────────────────────────────────
TOTAL:                  ~25,000 input + output
(User reported 42K which includes conversation history)
```

**After (~2.8K tokens)**:
```
System prompt:          1,200 tokens  (identity + skill catalog)
@ reference injection:    300 tokens  (client intelligence summary — auto-injected)
Core tools (3):           600 tokens  (queryIntelligence + searchSkills + loadReference)
Conversation:             500 tokens
Model output:             200 tokens  (answer found in reference — ZERO tool calls)
───────────────────────────────────
TOTAL:                  ~2,800 tokens
```

**Reduction: ~93%** — and ZERO tool calls (answer found in auto-injected reference)

### Complex Query: "Compare the two valuation reports"

**Before (~35K tokens)**:
```
System prompt:            800 tokens
Tool definitions (70):  8,000 tokens
Document context:       15,000 tokens  (ALL docs loaded)
Intelligence summary:      300 tokens
Conversation:              500 tokens
Model output:            2,000 tokens
───────────────────────────────────
TOTAL:                  ~26,600 tokens
```

**After (~15K tokens)**:
```
System prompt:          1,500 tokens
Core tools (2):           500 tokens
searchSkills("documents"): 200 tokens
Document tools (5):      1,000 tokens  (loaded on demand)
doc_fetch x2:           8,000 tokens  (only the 2 valuations)
Conversation:              500 tokens
Model output:            2,000 tokens
───────────────────────────────────
TOTAL:                  ~13,700 tokens
```

**Reduction: ~48%** (and more accurate since only relevant docs loaded)

---

## Non-Goals (for this rework)

- **Model upgrade**: Staying on Haiku 4.5
- **Streaming**: Current non-streaming approach is fine for now
- **Multi-agent**: Single agent with skills, not spawning sub-agents
- **Voice/audio**: Not in scope
- **File upload rework**: Current file upload flow stays as-is

---

## Open Questions

1. **Skill search matching**: Simple string match on skill names, or fuzzy/semantic? Start with simple prefix/contains match.
2. **Max skills per session**: Should we cap how many skills can be loaded? Probably no — if model needs them, load them.
3. **Briefing data source**: Use existing Convex queries or add a dedicated briefing query? Use existing.
4. **@ mention storage**: Store mentions in message metadata or parse from message text? Store in metadata.
