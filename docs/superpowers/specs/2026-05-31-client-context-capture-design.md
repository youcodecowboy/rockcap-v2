# Client context capture: operator-stated intelligence + running reference — Design

- **Date:** 2026-05-31
- **Status:** Approved design (pre-implementation)
- **Owner:** Kristian (operator) + Claude Code
- **Scope:** `model-testing-app/` (Convex + Next) and `skills/`

## Problem

Client intelligence today is built almost entirely from **documents** (the V4 pipeline → `knowledgeItems` + `clientIntelligence`) and **online research** (prospect-intel → Companies House, web, the per-prospect `intelMarkdown`). But most of what a relationship manager actually knows arrives **out of band**: a meeting, a phone call, a hallway remark, personal history with the principals, a hunch about who really makes decisions. The operator has no clean way to say *"I met with Signia — here is a pile of context about them"* and have it land as durable, structured, citable intelligence.

The consequence: the agent reasons from docs + web and treats the operator's own primary knowledge as ephemeral chat that evaporates at the end of the session. Downstream skills (qualify-and-draft, meeting-prep, lender briefs) never see it.

Two narrower gaps underneath:

1. **No general operator-intake path.** `meeting-capture` exists but is scoped to a *meeting transcript*. There is nothing for arbitrary primary input that isn't a transcript.
2. **No per-client *running* reference.** Prospects have a rich `intelMarkdown`, but it is a **snapshot regenerated on every prospect-intel run**, not an accumulating log. Clients and projects have no narrative reference at all. Operator knowledge needs to *compound* over time; the snapshot model cannot do that.

## Goals

1. Let the operator dump arbitrary primary context about a client and/or deal in one turn and have a skill decompose it into durable intelligence.
2. Give every client a **`clientContextMarkdown`** running reference (and projects a `projectContextMarkdown`) — an append-style, dated, operator-attributed log that humans and the agent both read.
3. Mark operator-stated facts with clear provenance so the agent can cite *"you told me on 31 May"* and weight primary input appropriately.
4. Add the missing **MCP tools for notes** (create/update/list) so the agent can also drop a freeform note when the input is a note, not intelligence — keeping notes and intel as distinct lanes.
5. Keep the new skill **standalone-invokable** and v2-hardened so it stands up to the gauntlet on its own.

## Non-goals

- No change to the document → intelligence pipeline (V4, `addDocumentToIntelligence`).
- No approval gate on operator input. Operator-stated facts are **primary truth and write directly** (provenance-tagged), unlike outward-facing actions. The approval gate guards things that *leave* the system; this never leaves the system.
- Notes do **not** become intelligence and intelligence does not become notes — they stay separate lanes. The skill routes to one or the other (or both) deliberately.
- No new prospect/client state and no HubSpot change.

## Background — what already exists (extend, don't rebuild)

| Layer | Where | Already supports |
|---|---|---|
| Atomic facts | `knowledgeItems` + `intelligence.addKnowledgeItem` (MCP) | `sourceType: "manual"`, `sourceText` (verbatim quote), `context`, `qualifier`, auto-supersession of the same `(target, fieldPath, qualifier)` |
| Profile | `clientIntelligence` / `projectIntelligence` | identity, keyPeople, borrower/lenderProfile, evidenceTrail, `aiSummary.{executiveSummary, keyFacts, recentUpdates[]}`, `aiInsights.risks` |
| Narrative timeline | `clientIntelligence.aiSummary.recentUpdates[]` via `addClientUpdate` | dated `{date, update}` list — **capped at 10, not MCP-exposed** |
| Human notes | `notes` table + `notes.create/update/getByClient/getByProject` (Convex) | per-client/project rich-text (TipTap doc JSON `{type:'doc',content:[]}`) — **no MCP surface** |
| Prospect reference | `skillRuns.intelMarkdown` | rich per-prospect md — but a **regenerated snapshot**, not a running log |

The write primitives largely exist. What is missing is (a) the running md field, (b) a skill that decomposes a dump into the right destinations, (c) MCP exposure for notes + the narrative timeline, and (d) provenance weighting.

## Design

### 1. Data model — additive

**`clientIntelligence`** gains:
- `contextMarkdown?: string` — the running reference. Append-style: each entry is a dated, operator-attributed block. The agent curates (dedupes, reorganises) but never silently drops operator statements.
- `contextMarkdownUpdatedAt?: string`.

**`projectIntelligence`** gains the same two fields (`contextMarkdown`, `contextMarkdownUpdatedAt`).

No migration; both tables already carry `customFields`/versioning and are patched in place.

**Relationship to `aiSummary.recentUpdates` — none (deliberate decoupling).** There are three independent layers and this design keeps them apart:
- **`activities`** (real table) — the event feed ("what happened": emails, calls, meetings). HubSpot-synced; the agent does not write it. Drives `ClientActivityTab`, `/activity`, the dashboard. Untouched.
- **`contextMarkdown`** (NEW) — the operator's running *knowledge* reference ("what we know/believe"). Self-timestamping (every block dated + attributed), so it needs no separate timeline field.
- **`aiSummary.recentUpdates[]`** — a near-vestigial last-10 cache with exactly one consumer, `src/lib/aiNotesContext.ts` (feeds the notes-AI a text blob). No visual component renders it.

`contextMarkdown` and `recentUpdates` **must not interfere**: context-capture writes ONLY `contextMarkdown` and never touches `recentUpdates`. `recentUpdates` is left exactly as-is by this build and **retired in a separate follow-up PR** (see Out of scope / future).

### 2. Running-md format (`contextMarkdown`)

Reverse-chronological, one block per capture, fixed header line so it parses and renders consistently:

```
## 2026-05-31 — operator capture (Kristian)
**Source:** in-person meeting with the FD
- They are refinancing the senior facility in Q3; current lender is exiting.
- Real decision-maker is the FD (Jane Doe), not the named director.
- Burned by [Lender X] on a slow drawdown in 2024 — do not lead with them.

## 2026-05-20 — operator capture (Kristian)
...
```

Each block: a dated header attributing the operator, a one-line `**Source:**` (meeting / call / personal knowledge / hunch), then the prose/bullets. Hunches are allowed but must be marked (`(unconfirmed)`), mirroring the no-fabrication rule.

### 3. New skill — `client-context-capture` (NEW)

Standalone, operator-invoked.

- **Trigger:** "I met with {client}, here's context: …" / "add context to {client/deal}: …" / "log this about {deal}: …" / "remember this about {client}: …".
- **Inputs:** `clientId` and/or `projectId` (resolve from name if only a name is given), plus the freeform `context` text.
- **Step 1 — confirm scope (REQUIRED).** Decide whether the input is **client-level**, **project/deal-level**, or **spans both**, and **confirm with the operator before writing** when it is ambiguous. Some intel is client-wide (who the principals are, their reputation); some is deal-only (this scheme's exit plan); some spans both. Never guess silently — a wrong placement pollutes the wrong reference. If the operator named only a client but the content is clearly about one of their live deals, surface that and ask.
- **Step 2 — decompose** the dump into three destinations, each only when warranted:
  1. **Structured facts** → `intelligence.addKnowledgeItem` with `sourceType: "manual"`, `sourceText` = the operator's own words verbatim, `context` = "operator capture {date}", `addedBy` = operator. Targets `clientId` or `projectId` per step 1. Discrete, supersedable facts only (a corrected decision-maker, a stated GDV, a refinance date).
  2. **Profile patches** where clearly structural → `clientIntelligence` / `projectIntelligence` (a new key person, a corrected primary contact). Conservative — only unambiguous structural facts.
  3. **Running md append** → `contextMarkdown` via a new MCP tool (step 5), the full dated block per the format above. **This is the primary deliverable and always written** (the other two are conditional). The dated block IS the timeline — there is no separate timeline-field write (no `recentUpdates`).
- **Step 3 — note vs intel fork.** If the operator's input is genuinely a *note* (a to-do, a reminder, a doc-to-write) rather than intelligence about the entity, route it to `note.create` instead of / in addition to the intel destinations. The skill states which lane(s) it used.
- **Step 4 — report back** a tight summary: what landed where (N facts, profile fields touched, md appended), and surface any low-confidence items it declined to structure (left in the md as prose).
- **No approval gate.** Operator input is primary truth; it writes directly. Every write is provenance-tagged `operator-stated` + dated.

### 4. New MCP tools

**Notes (new lane — none exist today):**
- `note.create({ clientId?, projectId?, title, markdown, tags?, emoji? })` — wraps `notes.create`, converting `markdown` → TipTap doc JSON (`{type:'doc',content:[…]}`; paragraphs/bullets/headings from the markdown). Returns the noteId.
- `note.update({ noteId, markdown?, title?, tags? })` — wraps `notes.update`.
- `note.listByClient({ clientId })` / `note.listByProject({ projectId })` — wraps the existing queries so the agent can read existing notes before adding.

**Context intelligence:**
- `intelligence.appendContext({ clientId?|projectId?, markdownBlock })` — appends a dated block to `contextMarkdown` (creating the intelligence row via `getOrCreate` if absent) and bumps `contextMarkdownUpdatedAt`. **Single responsibility: it writes only `contextMarkdown`.** It does NOT touch `recentUpdates` (that field is being retired separately). No `summaryLine`, no timeline coupling.

`intelligence.addKnowledgeItem` already exists and is reused as-is for step 2.1. The existing `addClientUpdate` / `addProjectUpdate` mutations are deliberately NOT exposed to MCP — they write the soon-to-be-retired `recentUpdates`.

### 5. Surfacing (read paths)

- `prospect.getDeepContext` / `client.getDeepContext` / `project.getDeepContext` already return the intelligence row; `contextMarkdown` + `contextMarkdownUpdatedAt` ride along automatically. Add a `summary.hasOperatorContext` boolean + `summary.contextUpdatedAt` so the agent sees at a glance that operator knowledge exists.
- **UI:** a **Context** tab (or section) on the client detail view rendering `contextMarkdown` (read-only markdown), and the same on the project view. Mirrors how the prospect Intel tab renders `intelMarkdown`. Exact placement is a UI follow-up; the data + tools land first.

## Data flow

operator: "I met with Signia, here's context …" → `client-context-capture` → **confirm client vs deal vs both** → decompose → `addKnowledgeItem` (manual facts) + profile patch (if structural) + `intelligence.appendContext` (dated md block — `contextMarkdown` only) + optional `note.create` → report back. Next time any skill calls `*.getDeepContext`, the operator's knowledge is in scope and citable.

## Edge cases

- **Ambiguous client-vs-deal** → skill asks before writing (step 1). Never silent.
- **Operator states a hunch** → captured in `contextMarkdown` marked `(unconfirmed)`; NOT promoted to a structured `knowledgeItem` (those are for assertions, not guesses).
- **Contradicts a document-sourced fact** → the manual `knowledgeItem` supersedes by the same `(target, fieldPath, qualifier)` tuple, but the md block notes the conflict so the operator can see both. Operator-stated wins on supersession (it is primary), but the prior is retained as `superseded`, not deleted.
- **Markdown → TipTap conversion** for notes handles headings/bullets/paragraphs; anything exotic degrades to paragraphs (never throws).
- **No intelligence row yet** (brand-new client) → `appendContext` creates it via `getOrCreate`.
- **Re-capture / duplicate input** → md is append-only and dated; the skill may note "similar to {date} entry" but does not dedupe across days (the log is a record, not a deduped set).

## Testing / gauntlet

- `npx next build` (from `model-testing-app/`) passes; `tsc --noEmit` clean.
- Manual: capture context on a client → `contextMarkdown` populated + a `recentUpdates` line + N manual `knowledgeItems` with `sourceType:"manual"` and verbatim `sourceText`; `getDeepContext.summary.hasOperatorContext` true.
- Deal-only capture → lands on `projectIntelligence`, not the client.
- Ambiguous capture → skill asks before writing.
- Note input → `note.create` lands a note; nothing written to intelligence.
- **Standalone gauntlet:** invoke `client-context-capture` cold (no prior session context) on 3 different shapes of input (meeting dump, one-line correction, a hunch) and verify consistent routing + provenance.

## Out of scope / future

- **Retire `aiSummary.recentUpdates` (separate follow-up PR).** It is effectively vestigial: one reader (`src/lib/aiNotesContext.ts`), no UI, capped at 10, half-populated by the doc-analysis path (`addDocumentToIntelligence`). The retirement: (1) repoint `aiNotesContext.ts` at the richer real sources — `contextMarkdown` (operator knowledge) + `activities` (the event feed) — instead of `recentUpdates`; (2) stop populating `recentUpdates` in `addClientUpdate` / `addProjectUpdate` / `addDocumentToIntelligence`; (3) drop the field from the `aiSummary` objects in `clientIntelligence` + `projectIntelligence`. Kept OUT of this build deliberately — it touches the doc-analysis write path, and bundling it with a new skill would make the diff hard to review. This spec's only obligation to it is the negative one: context-capture must never write `recentUpdates`.
- Auto-extracting structured facts from the md retroactively (the skill structures at capture time only).
- A diff/merge UI for operator-vs-document conflicts (the md note is sufficient for now).
- Promoting `contextMarkdown` into lender briefs / IC papers as a cited source (natural next step once the field is populated).

## Open implementation notes

- Reuse `getOrCreateClientIntelligence` / `getOrCreateProjectIntelligence` so `appendContext` never fails on a missing row.
- The markdown→TipTap bridge: check for an existing helper in the notes editor before writing a new one; a minimal paragraph/bullet/heading converter is enough.
- Keep `client-context-capture` to the v2 SKILL.md template (Trigger / Inputs / Dedup / Outputs / workflow / Style / Tool deps / What goes wrong / References) and add it to `skills/skills/README.md` + `CATALOGUE.md` in the same commit.
