# V4 Architecture Audit & Tool Library Plan

## Audit Date: 2026-02-24

## Executive Summary

V4's classification pipeline is well-structured but operates as a pure single-shot system with
zero tool-use capability. The chat assistant runs on Together.ai/Llama with brittle XML-based
tool parsing instead of Anthropic's native `tool_use`. The two systems share no tool
infrastructure. This audit proposes a **shared V4 Tool Library** as the foundation for both
Tier 1 (batch classification) and Tier 2 (agentic chat), following Anthropic's tool-use patterns.

---

## Current Architecture Audit

### V4 Classification Pipeline (Tier 1 — exists)

**Files:**
```
v4/lib/pipeline.ts          — 6-stage orchestrator (preprocess → refs → select → skill → API → assemble)
v4/lib/anthropic-client.ts  — Anthropic SDK wrapper, builds prompts, calls API, parses JSON
v4/lib/reference-library.ts — Shared ref library with tag-based selection, 1-hour cache
v4/lib/document-preprocessor.ts — Filename heuristics, truncation, batch chunking
v4/lib/skill-loader.ts      — SKILL.md loader with YAML frontmatter parsing
v4/skills/document-classify/ — Classification skill (SKILL.md)
v4/api/v4-analyze/route.ts  — POST /api/v4-analyze Next.js route
v4/types.ts                 — All type definitions
```

**What works well:**
- Clean 6-stage pipeline with clear separation of concerns
- SKILL.md with YAML frontmatter (matches Anthropic agent skills pattern)
- Shared reference library with tagging (not per-skill)
- Batch processing: 8 docs/call, smart chunking, token estimation
- 24 system references covering real estate domain
- Prompt caching via `cache_control: { type: 'ephemeral' }` on system prompt

**What's missing:**
1. **No `tools` parameter in API call** — `anthropic-client.ts:267` calls `messages.create()`
   without any tools. Model cannot reach back for references, check placement rules, or
   request clarification.
2. **Pre-selected references only** — The orchestrator decides which references the model sees.
   If the heuristic tag matching fails (e.g., unusual filename, no text content), the model
   gets wrong references and cannot self-correct.
3. **No placement rule integration** — Folder routing is in `suggestedFolder` but there's no
   deterministic placement system. The model guesses the folder.
4. **No critic/verification pass** — Architecture doc mentions Sonnet critic for ambiguous
   results, but it's not implemented.
5. **JSON output parsing is fragile** — Relies on regex to extract JSON from text response.
   Should use Anthropic's structured output or `tool_use` response format.

### Chat Assistant (Proto-Tier 2 — exists but wrong foundation)

**Files:**
```
lib/chatTools.ts                    — 20+ tool definitions + executeTool() dispatch
app/api/chat-assistant/route.ts     — Chat API route (1467 lines)
components/ChatAssistantDrawer.tsx  — Chat UI
components/ChatInput.tsx            — Chat input
components/ChatMessage.tsx          — Chat message display
contexts/ChatDrawerContext.tsx       — Chat state management
```

**What works well:**
- Rich tool library (searchClients, getKnowledgeBank, createNote, createReminder, etc.)
- Confirmation pattern for write operations (`requiresConfirmation: boolean`)
- Context gathering (loads client/project data into context)
- Multi-turn tool loop (up to 3 iterations)

**What's critically wrong:**
1. **Uses Together.ai / Llama, not Anthropic** — `route.ts:8` uses
   `meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8`. No Anthropic API.
2. **Brittle XML tool parsing** — Tool calls are `<TOOL_CALL>JSON</TOOL_CALL>` tags parsed
   via regex. Anthropic's native `tool_use` returns structured `tool_use` content blocks
   that are guaranteed well-formed.
3. **Massive prompt** — The system prompt is 1000+ lines with tool docs, examples, rules.
   Anthropic's tool definitions handle this natively.
4. **No integration with V4** — Chat cannot classify documents, load references, or use
   the V4 pipeline. It's a completely separate system.

### What Does NOT Exist (Gap Analysis)

| Component | Status | Impact |
|-----------|--------|--------|
| Shared V4 Tool Library | Missing | Both tiers reinvent tool definitions |
| Anthropic tool_use in classification | Missing | Model cannot self-correct or request info |
| Anthropic tool_use in chat | Missing | Stuck on Llama with brittle parsing |
| load_reference tool | Missing | Model can't pull references on demand |
| resolve_placement tool | Missing | No deterministic folder routing |
| search_knowledge_bank tool | Missing | Can't check existing intelligence |
| check_duplicate tool | Missing | Can't detect duplicate uploads |
| Tier 2 skill router | Missing | Chat can't invoke V4 skills |
| Transcript analysis skill | Missing | No call transcript processing |
| Deep summarization skill | Missing | No narrative summary capability |

---

## Proposed Architecture: V4 Tool Library

### Design Principles

1. **Tools are the foundation** — Define once, use in both tiers
2. **Tier 1 gets tools as optional capability** — Pre-loaded context is the fast path;
   tools are the fallback for ambiguity
3. **Tier 2 gets tools as primary interface** — Minimal pre-loading, model drives via tools
4. **Anthropic native tool_use everywhere** — No XML parsing, no string matching
5. **Skills + Tools are orthogonal** — Skills define WHAT to do (instructions); tools define
   HOW to interact with the system

### Tool Library Definition

```typescript
// v4/tools/tool-library.ts

import type Anthropic from '@anthropic-ai/sdk';

/**
 * V4 Tool Library — shared across all skills and tiers.
 *
 * Each tool is defined in Anthropic's tool_use format and has a corresponding
 * executor function. Tools are categorized by domain and risk level.
 */

// ══════════════════════════════════════════════════════════════
// TOOL CATEGORIES
// ══════════════════════════════════════════════════════════════

// Category 1: REFERENCE TOOLS (read-only, low latency)
// These let the model pull reference information on demand.

lookup_reference: {
  description: "Look up a reference document by file type name or tags. Returns the
    reference content that describes how to identify this document type.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "File type name or tag to search for" },
      tags: { type: "array", items: { type: "string" }, description: "Tags to match" }
    },
    required: ["query"]
  }
}

list_references: {
  description: "List all available reference documents with their file types and categories.
    Use this to understand the full range of document types the system can classify.",
  input_schema: {
    type: "object",
    properties: {
      category: { type: "string", description: "Filter by category" }
    }
  }
}

// Category 2: PLACEMENT TOOLS (read-only, deterministic)
// These resolve where a document should be filed.

resolve_placement: {
  description: "Given a file type and client type, resolve the correct folder and filing
    level (client vs project). Returns deterministic placement based on business rules.",
  input_schema: {
    type: "object",
    properties: {
      fileType: { type: "string" },
      category: { type: "string" },
      clientType: { type: "string" }
    },
    required: ["fileType", "category"]
  }
}

// Category 3: DATA TOOLS (read-only, requires Convex)
// These query application state.

search_knowledge_bank: {
  description: "Search the knowledge bank for existing intelligence about a client or
    project. Returns relevant entries that may help with document context.",
  input_schema: {
    type: "object",
    properties: {
      clientId: { type: "string" },
      projectId: { type: "string" },
      query: { type: "string", description: "Search term" }
    }
  }
}

check_duplicate: {
  description: "Check if a similar document already exists for this client/project.
    Returns matching documents by filename pattern or content similarity.",
  input_schema: {
    type: "object",
    properties: {
      clientId: { type: "string" },
      fileName: { type: "string" },
      fileType: { type: "string" }
    },
    required: ["fileName"]
  }
}

get_client_context: {
  description: "Get comprehensive context about a client including their type, status,
    existing documents, and project associations.",
  input_schema: {
    type: "object",
    properties: {
      clientId: { type: "string", description: "Client ID" }
    },
    required: ["clientId"]
  }
}

// Category 4: WRITE TOOLS (require confirmation in chat, auto-execute in pipeline)
// These create or modify data.

create_knowledge_entry: {
  description: "Create a knowledge bank entry from extracted document intelligence.",
  input_schema: {
    type: "object",
    properties: {
      clientId: { type: "string" },
      projectId: { type: "string" },
      title: { type: "string" },
      content: { type: "string" },
      entryType: { type: "string", enum: ["document_summary", "deal_update", "call_transcript"] },
      keyPoints: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } }
    },
    required: ["clientId", "title", "content"]
  }
}

create_action_item: {
  description: "Create a task/action item extracted from a document or transcript.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      dueDate: { type: "string" },
      priority: { type: "string", enum: ["low", "medium", "high"] },
      clientId: { type: "string" },
      projectId: { type: "string" }
    },
    required: ["title"]
  }
}
```

### Tier 1 Integration: Classification with Optional Tool Use

```
CURRENT FLOW:
  Pre-select refs → Build system prompt → Single API call → Parse JSON

PROPOSED FLOW:
  Pre-select refs → Build system prompt → API call WITH tools → Handle response
                                                    ↓
                                          If tool_use blocks:
                                            Execute tools
                                            Continue conversation
                                          If text blocks:
                                            Parse JSON (same as before)
```

The key change in `anthropic-client.ts`:

```typescript
// BEFORE: No tools
const response = await client.messages.create({
  model: config.primaryModel,
  max_tokens: config.maxTokens,
  system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: userBlocks }],
});

// AFTER: Tools available but optional
const response = await client.messages.create({
  model: config.primaryModel,
  max_tokens: config.maxTokens,
  system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: userBlocks }],
  tools: V4_TOOL_DEFINITIONS,  // Available but not forced
  // No tool_choice — model decides whether to use tools or respond directly
});

// Handle response — may be text (fast path) or tool_use (fallback path)
if (response.stop_reason === 'tool_use') {
  // Execute tool calls, feed results back, continue
  return handleToolUseLoop(response, config);
} else {
  // Fast path — parse JSON directly (same as before)
  return parseClassificationResponse(textContent);
}
```

**Expected behavior in Tier 1:**
- 95% of the time: Model responds directly with JSON (fast path, same latency as now)
- 5% of the time: Model calls `lookup_reference` or `resolve_placement` for ambiguous docs
- Net result: Higher accuracy with minimal latency increase

### Tier 2 Integration: Agentic Chat with Anthropic

```
CURRENT CHAT FLOW:
  User message → Together.ai/Llama → Parse <TOOL_CALL> XML → Execute → Feed back → Repeat

PROPOSED CHAT FLOW:
  User message → Anthropic Claude → Native tool_use blocks → Execute → Feed back → Repeat
```

The key changes:
1. Replace Together.ai with Anthropic in `chat-assistant/route.ts`
2. Convert `CHAT_TOOLS` from custom format to Anthropic `tool` definitions
3. Merge V4 tools (reference, placement, classification) into chat tool library
4. Remove XML parsing — use `response.content` blocks directly
5. Add V4 skills as tools the chat can invoke:
   - `classify_document` — run V4 classification on an uploaded document
   - `summarize_document` — run deep summarization skill
   - `analyze_transcript` — run transcript analysis skill

### File Structure

```
v4/
├── tools/
│   ├── tool-library.ts         # Shared tool definitions (Anthropic format)
│   ├── tool-executor.ts        # Tool execution dispatch
│   ├── reference-tools.ts      # lookup_reference, list_references
│   ├── placement-tools.ts      # resolve_placement
│   ├── data-tools.ts           # search_knowledge_bank, check_duplicate, get_client_context
│   └── write-tools.ts          # create_knowledge_entry, create_action_item
├── skills/
│   ├── document-classify/
│   │   └── SKILL.md
│   ├── document-summarize/
│   │   └── SKILL.md            # NEW: Deep narrative summary
│   ├── transcript-analyze/
│   │   └── SKILL.md            # NEW: Call transcript → action items
│   └── intelligence-extract/
│       └── SKILL.md            # NEW: Structured field extraction
├── lib/
│   ├── pipeline.ts             # Updated: tool_use support in API call
│   ├── anthropic-client.ts     # Updated: tools param + tool_use loop
│   ├── reference-library.ts    # (unchanged)
│   ├── document-preprocessor.ts # (unchanged)
│   └── skill-loader.ts         # (unchanged)
├── api/
│   └── v4-analyze/
│       └── route.ts            # (unchanged)
├── types.ts                    # Updated: tool types
├── index.ts                    # Updated: export tools
└── V4_ARCHITECTURE.md          # Updated
```

### Migration Path for Chat

The existing `chatTools.ts` has 20+ well-defined tools that work. The migration:

1. **Keep `chatTools.ts` as the source of truth** for application-level CRUD tools
2. **Add an adapter** that converts `CHAT_TOOLS[]` to Anthropic `Tool[]` format
3. **Merge V4 tools** (reference, placement, classification) into the combined set
4. **Update `chat-assistant/route.ts`** to use Anthropic instead of Together.ai
5. **Remove XML parsing** — Anthropic returns structured `tool_use` blocks

```typescript
// v4/tools/chat-adapter.ts

import { CHAT_TOOLS, executeTool } from '@/lib/chatTools';
import { V4_TOOLS, executeV4Tool } from './tool-library';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Merge application CRUD tools with V4 document processing tools
 * into a single Anthropic-compatible tool array.
 */
export function getAllTools(): Anthropic.Tool[] {
  // Convert chatTools format to Anthropic format
  const appTools = CHAT_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));

  // V4 tools are already in Anthropic format
  return [...appTools, ...V4_TOOLS];
}

/**
 * Execute any tool by name — dispatches to correct executor.
 */
export async function executeAnyTool(
  toolName: string,
  params: Record<string, any>,
  context: { convexClient?: any; config?: any }
): Promise<any> {
  // Check if it's a V4 tool
  if (V4_TOOLS.some(t => t.name === toolName)) {
    return executeV4Tool(toolName, params, context);
  }

  // Otherwise it's an app tool
  return executeTool(toolName, params, context.convexClient);
}
```

---

## Implementation Priority

### Phase 1: Foundation (Tool Library + Tier 1 Enhancement)
1. Create `v4/tools/tool-library.ts` with Anthropic-format tool definitions
2. Implement `lookup_reference` and `resolve_placement` tool executors
3. Update `anthropic-client.ts` to pass tools and handle `tool_use` response loop
4. Test: classification accuracy with tool-use enabled vs disabled

### Phase 2: Chat Migration (Tier 2 on Anthropic)
1. Create `v4/tools/chat-adapter.ts` to merge tool libraries
2. Create new Anthropic-based chat route (can coexist with Together.ai route)
3. Update chat frontend to handle Anthropic's response format
4. Test: chat functionality with Anthropic + merged tools

### Phase 3: New Skills (Deep Analysis)
1. Create `document-summarize/SKILL.md` — narrative summary skill
2. Create `transcript-analyze/SKILL.md` — call transcript → action items
3. Wire skills as tools the chat can invoke
4. Test: end-to-end transcript → action items flow

---

## Key Decision: Anthropic Model for Chat

| Option | Model | Cost | Quality | Latency |
|--------|-------|------|---------|---------|
| Current | Llama Maverick (Together.ai) | ~$0.002/msg | Medium | Fast |
| Option A | Claude Haiku 4.5 | ~$0.003/msg | High | Fast |
| Option B | Claude Sonnet 4.6 | ~$0.01/msg | Very High | Medium |
| Recommended | **Haiku 4.5 for chat, Sonnet for deep analysis** | — | — | — |

Haiku 4.5 is the natural replacement for Llama in chat — similar cost, better tool use,
native Anthropic integration. Sonnet reserved for complex analysis skills.

---

## Answering the Original Question

> Are we following the correct folder structure and architecture that Anthropic defines
> for skills, tools, and native capabilities like load_reference?

**Partially.** Here's the scorecard:

| Pattern | Anthropic Standard | Our Implementation | Status |
|---------|-------------------|-------------------|--------|
| SKILL.md with YAML frontmatter | Yes | Yes | Correct |
| Progressive disclosure (3 levels) | Yes | Yes | Correct |
| Shared reference library | Our design | Our design | Good |
| `tool_use` in API calls | Required for tools | Not implemented | **Missing** |
| Tool definitions (JSON Schema) | Standard format | Custom format in chatTools | **Needs migration** |
| `tool_result` message flow | Standard | Custom XML parsing | **Wrong** |
| `load_reference` as tool | Recommended | Pre-selected only | **Missing** |
| Skills directory structure | Standard | Correct | Correct |

**Bottom line:** The skill structure is correct. The tool infrastructure is either missing
(V4 pipeline) or built on the wrong foundation (chat uses Llama + XML). The tool library
plan above fixes both.
