# Three-File Backlog System — Design Spec

**Date:** 2026-04-16
**Status:** Design (awaiting implementation)
**Owner:** Kristian

---

## Problem

Work across the RockCap repo is currently tracked ad-hoc: a one-shot spec file (`2026-04-15-mobile-app-refinement-backlog.md`) with `BL5-BL12`, commit messages referencing those IDs, and no live surface for new work. There's no lightweight way for:

1. The human to jot new items with minimal friction during a chat session.
2. A separate AI agent (a "worker" Claude session) to discover, pick up, and execute backlog items autonomously by reading a known location.
3. Completed work to leave behind a searchable archive that captures *how* it was solved, not just *what* shipped.

The goal is a multi-agent-friendly backlog that requires zero tooling — just markdown files and a protocol that any agent can follow after reading `CLAUDE.md`.

---

## Design

### Directory layout

```
/                         (repo root)
├── CLAUDE.md             ← restored, auto-loaded by Claude Code; contains Backlog Protocol
└── .backlog/
    ├── inbox.md          ← new items, newest on top (low-ceremony jots)
    ├── active.md         ← items being worked now (expanded to Problem/Fix/Acceptance)
    └── done.md           ← append-only archive with "How solved" breakdowns
```

The `.backlog/` dotfolder at repo root follows the same convention as `.github/`, `.vscode/` — tooling/convention at the top level, out of the way of application code.

### Item IDs

- Format: `BL<n>` — continuing the existing sequence.
- The highest existing ID is `BL12` (in `docs/superpowers/specs/2026-04-15-mobile-app-refinement-backlog.md`). The next new item is `BL13`.
- IDs are unique across all three files; an item keeps the same ID through its whole lifecycle.

### State transitions

```
               ┌─────────────────┐
   new item →  │     inbox       │  ← any agent adds here when user jots
               └────────┬────────┘
                        │  agent picks top item
                        ↓
               ┌─────────────────┐
               │     active      │  ← work in progress, expanded format
               └────┬────────┬───┘
                    │        │
                    │        └→ back to inbox (if blocked — with Blocked: <reason> note)
                    │
                    ↓ on completion
               ┌─────────────────┐
               │     done        │  ← append-only; includes "How solved" + commit SHAs
               └─────────────────┘
```

Flow is one-way except for the blocked case. Done entries are never edited — they're the historical record.

### File formats

#### `inbox.md`

```markdown
# Inbox
_Newest on top. Just enough for the executing agent to get started._

## BL14: Rich text editor crashes on long paste
Mobile app. Tiptap WebView freezes when pasting >10kb. Needs investigation + fix.

## BL13: Recent clients section missing from docs screen
Mobile app. Mobile web has this, RN doesn't.
```

Each entry is `## BL<n>: <title>` followed by 1–3 sentences of context. No priority field, no tags — the executing agent picks the top item unless the user directs otherwise.

#### `active.md`

```markdown
# Active
_Pulled from inbox. Expanded before work starts._

## BL12: Dashboard NaN fixes
**Started:** 2026-04-16 · **Area:** mobile

### Problem
Dashboard cards show "NaN" for timestamps and counts when data is missing.

### Fix Required
- Add null checks for `.length` accesses
- Handle undefined `_creationTime` in `formatRelativeTime`

### Acceptance
- No NaN appears on dashboard under any data state
- Tap targets navigate correctly
```

The `Problem / Fix Required / Acceptance` structure matches the existing `BL5-BL12` spec format so there's no convention churn.

#### `done.md`

```markdown
# Done
_Append completed items. Never edit past entries — historical record._

---

## BL11: Rich text editor with @mentions ✓
**Completed:** 2026-04-15 · **Commits:** b6029cb, c95068a

### Problem
(carried from active)

### How solved
Used Tiptap in a WebView rather than a native RN editor because limited RN-native
options (no @mention support, no full formatting). Formatting toolbar is a native
React Native `<RichToolbar>` bridged to the WebView via postMessage. @mentions
trigger `api.notifications.createMentionNotification`.

Tradeoff: WebView adds ~200ms cold start, but unlocks the full Tiptap feature set.

### Files changed
- `mobile-app/components/TiptapEditor.tsx` (new)
- `mobile-app/app/notes/[id].tsx` (wired editor)
```

"How solved" is the load-bearing field: it turns `done.md` into a searchable decision log. When someone later asks "why is the editor in a WebView?", grep gives them the *why* — not just the *what* buried across commits.

### Root `CLAUDE.md` — Backlog Protocol section

The protocol lives in root `CLAUDE.md` (auto-loaded every session). Self-contained so any agent can follow it cold. Proposed content:

```markdown
## Backlog Protocol

A three-file backlog lives in `.backlog/` at the repo root. Any agent asked to
"reference the backlog", "work the backlog", "pull from the backlog", or "add to
the backlog" should use this protocol without further instruction.

### Files
- `.backlog/inbox.md` — new items, newest on top. Title + 1–3 sentences of context.
- `.backlog/active.md` — items being worked now. Expanded Problem / Fix Required / Acceptance.
- `.backlog/done.md` — append-only archive. Completed items with "How solved" breakdown + commit SHAs.

### IDs
Items have IDs of the form `BL<n>`. Before assigning a new ID, scan `.backlog/*.md`
and any `docs/superpowers/specs/*-backlog.md` (for legacy items) for `BL<number>`
patterns and use `max(existing) + 1`.

### Adding to inbox (when user says "add to backlog" or similar)
1. Assign the next `BL<n>`.
2. Prepend the entry to `inbox.md` (newest on top) as:
   `## BL<n>: <one-line title>` followed by 1–3 sentences of context.
3. Do NOT start work just because you added to inbox.

### Starting work (when user says "work the backlog" or specifies an ID)
1. Default pick = top item in `inbox.md`, unless the user names a specific ID.
2. Remove the entry from `inbox.md`.
3. Add it to `active.md` with `**Started:** <YYYY-MM-DD> · **Area:** <area>`, where
   area is a short label like `mobile`, `web`, `backend`, `infra`, `docs`, etc. — a
   suggested set, not a strict enum.
4. Expand into `### Problem`, `### Fix Required`, `### Acceptance` sections.
5. Then start work.

### Completing work
1. Append the entry to `done.md` with:
   - `## BL<n>: <title> ✓`
   - `**Completed:** <YYYY-MM-DD> · **Commits:** <sha>, <sha>`
   - Carry over `### Problem` from active
   - `### How solved` — narrative (2–5 sentences) covering the approach + key tradeoffs
   - `### Files changed` — bullet list of the main files touched
2. Remove the entry from `active.md`.
3. Never edit past `done.md` entries.

### Blocked / abandoned items
If an item in `active.md` cannot be finished:
- Move it back to the **top** of `inbox.md` (so the human sees it on next scan).
- Keep the original `BL<n>` ID.
- Add a `**Blocked:** <reason>` line immediately below the title.
- Do not leave blocked items in `active.md`.

### What NOT to do
- Don't skip inbox and add directly to active.
- Don't edit or delete `done.md` entries.
- Don't reuse IDs. Every item gets a fresh `BL<n>`.
- Don't add priority/effort fields unless the user asks — keep ceremony low.
```

The existing `docs/CLAUDE.md` content (the plan-execution rule) is merged into the new root `CLAUDE.md`. The old `docs/CLAUDE.md` is deleted to avoid drift.

### Out of scope (intentionally)

- **Migrating `BL5-BL12`.** The old spec stays as a historical artifact. No backfill.
- **Priority/effort metadata.** Top of inbox = next up. If the user wants to reprioritize, they bump an entry to the top manually.
- **Tagging by area in inbox.** Area is recorded when an item enters `active.md`, not earlier.
- **Automation beyond agent-reads-CLAUDE.md.** No scripts, no hooks, no linters. If structure drifts, it's a human/agent conversation, not a CI job.
- **Multi-repo support.** The backlog is for this repo only. If another repo needs one, it gets its own `.backlog/`.

---

## Alternatives considered

1. **Single file with status labels.** One `backlog.md` where items carry `Status: inbox|active|done`. Rejected — harder to scan ("where are we at?" requires reading the whole file), merge-conflict-prone when two agents touch it, and `done` entries would clutter the live view.

2. **GitHub Issues.** Standard, has a UI. Rejected — solo dev + AI agents can't seamlessly read/write issues without API ceremony, and the "How solved" decision log belongs in-repo next to the code, not on a third-party surface.

3. **Database / JSON / YAML.** Structured data, queryable. Rejected — requires tooling, breaks the "any agent can read and edit without setup" property, and markdown is already parseable enough for our needs.

The three-file markdown approach wins because it's the simplest thing that serves the two-agent workflow.

---

## Acceptance criteria

- [ ] `.backlog/` directory exists at repo root with `inbox.md`, `active.md`, `done.md`.
- [ ] Each file has the starter header and format comment shown in the "File formats" section.
- [ ] Root `CLAUDE.md` exists (auto-loaded by Claude Code) and contains the full Backlog Protocol section.
- [ ] The existing plan-execution rule from `docs/CLAUDE.md` is preserved in the new root `CLAUDE.md`.
- [ ] `docs/CLAUDE.md` is deleted (no duplication).
- [ ] A new agent, given only the prompt "reference the backlog and add BL13: <title>", can complete the task correctly after reading root `CLAUDE.md`.
- [ ] A new agent, given only "work the backlog", can pull the top inbox item, move it to active, expand it, and begin work without further instruction.
