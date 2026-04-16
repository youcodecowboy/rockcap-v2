# CLAUDE.md

## Workflow Rules

### Plan Execution
- When executing any plan, the **last step** must always be:
  1. Run `npx next build` to check for build issues and fix any errors
  2. Commit changes and push to GitHub

---

## Backlog Protocol

A three-file backlog lives in `.backlog/` at the repo root. Any agent asked to "reference the backlog", "work the backlog", "pull from the backlog", or "add to the backlog" should use this protocol without further instruction.

### Files
- `.backlog/inbox.md` — new items, newest on top. Title + 1–3 sentences of context.
- `.backlog/active.md` — items being worked now. Expanded Problem / Fix Required / Acceptance.
- `.backlog/done.md` — append-only archive. Completed items with "How solved" breakdown + commit SHAs.

### IDs
Items have IDs of the form `BL<n>`. Before assigning a new ID, scan `.backlog/*.md` and any `docs/superpowers/specs/*-backlog.md` (for legacy items) for `BL<number>` patterns and use `max(existing) + 1`.

### Adding to inbox (when user says "add to backlog" or similar)
1. Assign the next `BL<n>`.
2. Prepend the entry to `inbox.md` (newest on top) as:
   `## BL<n>: <one-line title>` followed by 1–3 sentences of context.
3. Do NOT start work just because you added to inbox.

### Starting work (when user says "work the backlog" or specifies an ID)
1. Default pick = top item in `inbox.md`, unless the user names a specific ID.
2. Remove the entry from `inbox.md`.
3. Add it to `active.md` with `**Started:** <YYYY-MM-DD> · **Area:** <area>`, where area is a short label like `mobile`, `web`, `backend`, `infra`, `docs`, etc. — a suggested set, not a strict enum.
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
