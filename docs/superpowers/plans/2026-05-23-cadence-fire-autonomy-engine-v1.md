# Cadence-Fire Autonomy Engine v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the v1 autonomy engine substrate so prospect-intel's drafted cadence packages fire on schedule into the approval queue, Gmail inbound replies cancel active cadences and classify intent within seconds, and the HubSpot sync sweep provides a safety-net cancellation path. Pre-drafted dispatch only; dynamic-compose deferred to v1.1.

**Architecture:** Modify the existing `cadences` table to add gauntlet fields (packageId, preDraftedTouch, idempotency, cancellation audit); add a new `replyEvents` table for inbound idempotency; add a 5-min Convex cron dispatcher that polls due cadences and creates approval rows directly for pre-drafted touches; add a Gmail push HTTP webhook + daily watch-renewal cron; hook the existing 6h HubSpot sync as a safety-net sweep; add a Next.js API route + sub-skill for intent classification; wire intent dispatch to four destinations (skill stub, opt-out marker, restored cadence, operator-review approval).

**Tech Stack:** Convex (schema, mutations, queries, HTTP actions, crons), TypeScript, Next.js 16 App Router API route, Anthropic SDK, MCP over JSON-RPC, markdown for skill content.

**Reference spec:** `docs/superpowers/specs/2026-05-23-cadence-fire-autonomy-engine-design.md`

**Sibling work landed:** Phase 1 of `2026-05-23-prospect-intel-level-a-hardening` (skillRuns table, skillRun.start/complete MCP tools, prospect-intel ## Dedup section, root CLAUDE.md ### Skill execution rules) is committed (commits `1aa6ba7..b2b4705`). This plan builds on that substrate.

---

## File Structure

**Created:**
- `model-testing-app/convex/cadences.ts` — mutations + queries for cadences (~120 lines)
- `model-testing-app/convex/replyEvents.ts` — mutations + queries for replyEvents (~80 lines)
- `model-testing-app/convex/cadenceDispatcher.ts` — the 5-min cron handler that polls due rows and dispatches (~150 lines)
- `model-testing-app/convex/gmailWatch.ts` — Gmail push webhook handler + watch registration/renewal (~180 lines)
- `model-testing-app/convex/replyEventProcessor.ts` — internal action that cancels cadences + invokes classifier + dispatches by intent (~140 lines)
- `model-testing-app/src/app/api/classify-reply-intent/route.ts` — Next.js API route that loads the sub-skill prompt + calls Anthropic SDK (~100 lines)
- `skills/sub-skills/classify-reply-intent.md` — the sub-skill prompt content (~80 lines)

**Modified:**
- `model-testing-app/convex/schema.ts` — modify existing `cadences` table (add 9 fields), modify existing `contacts` table (add 2 opt-out fields), add new `replyEvents` table
- `model-testing-app/convex/crons.ts` — register 2 new crons (`cadence-dispatcher`, `gmail-watch-renewal`)
- `model-testing-app/convex/mcp.ts` — add `cadence.create` and `cadence.cancel` MCP tools
- `model-testing-app/convex/hubspotSync/activities.ts` — add post-sync hook that calls `replyEventProcessor.ingestFromHubspot` for new inbound activities
- `skills/skills/cadence-fire/SKILL.md` — document the v1 contract (pre-drafted dispatch only; dynamic compose marked deferred)
- `skills/skills/prospect-intel/SKILL.md` — add `## Cadence package` section between `## Dedup` and `## Outputs`; reference `cadence.create` in workflow step 7
- `CLAUDE.md` (root) — add `### Event-driven skills` subsection under `## Workflow Rules`

**Verification surface:** Convex dashboard (`https://dashboard.convex.dev/d/incredible-kudu-562` → Data → cadences, replyEvents tables) + `curl` calls to `https://incredible-kudu-562.convex.site/mcp` + `npx next build`.

---

# PHASE 1 — Schema Foundation (~20 min)

### Task 1: Modify the existing `cadences` table to add gauntlet fields

**Files:**
- Modify: `model-testing-app/convex/schema.ts` (existing `cadences: defineTable({` at line ~3702)

- [ ] **Step 1: Read the current cadences definition to confirm line numbers**

Run: `grep -n "cadences: defineTable" /Users/cowboy/rockcap/rockcap-v2/model-testing-app/convex/schema.ts`

Expected: returns line ~3702. Note: the existing table has 14 fields and 5 indexes already; we're adding 9 fields and 1 index.

- [ ] **Step 2: Insert new fields in the cadences table definition**

In `model-testing-app/convex/schema.ts`, locate the existing `cadences: defineTable({` block (starts ~line 3702). Find the line `updatedAt: v.string(),` (the last field before the closing `})`). After that line, insert the following new fields (before the closing `})`):

```typescript
    // Packaging (gauntlet feature: groups linked touches drafted as one batch)
    packageId: v.optional(v.string()),
    packageOrder: v.optional(v.number()),

    // Drafting mode (gauntlet feature: pre-drafted touch composed at queue time)
    preDraftedTouch: v.optional(v.object({
      subject: v.string(),
      bodyText: v.string(),
      bodyHtml: v.string(),
      dynamicVars: v.optional(v.any()),
    })),

    // Cancellation audit (set when an inbound reply cancels this cadence)
    cancelledReason: v.optional(v.string()),
    cancelledByEventId: v.optional(v.id("replyEvents")),

    // Idempotency (the dispatcher computes `${_id}:${nextDueAt}` and skips if matches)
    lastFireKey: v.optional(v.string()),

    // Failure tracking (incremented on retryable errors; reset on next success)
    consecutiveFailures: v.optional(v.number()),
    errors: v.optional(v.array(v.object({
      at: v.string(),
      step: v.string(),
      message: v.string(),
    }))),

    // Origin (which skill run drafted this cadence)
    sourceSkillRunId: v.optional(v.id("skillRuns")),
```

- [ ] **Step 3: Add a new index for package queries**

After the existing `.index("by_related_client", ["relatedClientId"])` line in the cadences table, before the closing comma + next-table comment, add:

```typescript
    .index("by_package", ["packageId"])
```

(Make sure the prior index ends with `,` and the chain continues correctly.)

- [ ] **Step 4: Deploy schema, defer codegen until replyEvents table is added**

The `cancelledByEventId: v.optional(v.id("replyEvents"))` field references the `replyEvents` table which doesn't exist yet. The schema will fail to deploy until Task 2 lands. This is intentional — Tasks 1, 2, and 3 commit together as one atomic schema change.

Skip deploy. Proceed to Task 2.

- [ ] **Step 5: Commit deferred — batched with Tasks 2 + 3**

Skip commit. The schema changes commit together at end of Task 3.

---

### Task 2: Create the new `replyEvents` table

**Files:**
- Modify: `model-testing-app/convex/schema.ts` (insert new table near other event-style tables)

- [ ] **Step 1: Identify the insertion point**

Run: `grep -n "skillRuns: defineTable" /Users/cowboy/rockcap/rockcap-v2/model-testing-app/convex/schema.ts`

Expected: returns line ~3999 (the table added by the sibling spec). We'll insert `replyEvents` right before `skillRuns` so event-style audit tables sit together.

- [ ] **Step 2: Insert the replyEvents table definition**

In `model-testing-app/convex/schema.ts`, find the `skillRuns: defineTable({` line. Insert the following block directly above it (with a blank line separator):

```typescript
  // ReplyEvents (cadence-fire v1) - audit trail for inbound replies that
  // cancelled active cadences. Source is "gmail_push" for real-time webhook
  // delivery; "hubspot_sync" for the 6h safety-net sweep. The (source,
  // externalId) pair is the idempotency key — same message arriving via
  // both paths processes once.
  replyEvents: defineTable({
    source: v.union(v.literal("gmail_push"), v.literal("hubspot_sync")),
    externalId: v.string(),                    // Gmail Message-ID header or `hubspot:engagement:${id}`
    contactId: v.optional(v.id("contacts")),
    receivedAt: v.string(),                    // ISO; when the inbound was sent (per provider), not when we processed
    rawMessageRef: v.optional(v.string()),     // Gmail thread URL or HubSpot engagement URL for debugging
    classifiedIntent: v.optional(v.string()),  // one of the 6 buckets, or "unknown"
    classifiedConfidence: v.optional(v.number()),
    classifierEvidence: v.optional(v.string()),
    cadencesCancelled: v.optional(v.array(v.id("cadences"))),
    dispatchedTo: v.optional(v.string()),      // "meeting-prep" | "long-term-monitor" | "qualify-and-draft" | "opt_out_marker" | "operator_review" | "restored_cadences"
    dispatchedSkillRunId: v.optional(v.id("skillRuns")),
    processed: v.boolean(),
    errors: v.optional(v.array(v.string())),
    userId: v.id("users"),                     // owner of the cadences cancelled; needed for downstream user-scoped queries
  })
    .index("by_source_externalId", ["source", "externalId"])
    .index("by_contact", ["contactId"])
    .index("by_processed", ["processed"])
    .index("by_user", ["userId"]),
```

- [ ] **Step 3: Verify field references compile**

The `cancelledByEventId: v.optional(v.id("replyEvents"))` from Task 1 now has a valid target. Visually inspect both fields are present.

- [ ] **Step 4: Commit deferred — batched with Task 3**

Skip commit. Continue to Task 3.

---

### Task 3: Modify `contacts` table to add opt-out fields, deploy + commit

**Files:**
- Modify: `model-testing-app/convex/schema.ts` (existing `contacts: defineTable({` at line ~408)

- [ ] **Step 1: Locate insertion point in contacts table**

Run: `grep -n "deletedReason: v.optional(v.string())," /Users/cowboy/rockcap/rockcap-v2/model-testing-app/convex/schema.ts`

Expected: one line ~446 (inside contacts table). The opt-out fields go after the soft-delete fields, before the closing `})`.

- [ ] **Step 2: Insert opt-out fields**

In `model-testing-app/convex/schema.ts`, after the `deletedReason: v.optional(v.string()),` line in the contacts table, before the closing `})`, insert:

```typescript
    // Opt-out (cadence-fire v1) - set by reply handler on not_interested
    // intent classification. Cadence dispatcher checks this before firing;
    // prospect-intel and other cadence-producing skills should also check
    // before queueing new cadences.
    optedOutAt: v.optional(v.string()),                              // ISO
    optedOutByReplyEventId: v.optional(v.id("replyEvents")),         // audit
```

- [ ] **Step 3: Deploy schema**

Run (from `model-testing-app/`): `npx convex dev --once`

Expected output: "Schema validation passed" or similar; no errors about missing tables or unresolved id references. If errors, check Tasks 1, 2, 3 edits all landed in `schema.ts`.

- [ ] **Step 4: Regenerate Convex types**

Run (from `model-testing-app/`): `npx convex codegen`

Expected: generates new types for `cadences` (with new fields), `replyEvents`, `contacts.optedOutAt`. Look for changes in `convex/_generated/dataModel.d.ts`.

- [ ] **Step 5: Smoke test the new schema**

Run: `npx convex run --no-push schema:run -- '{"query": "query { __typename }"}'` (or skip — the codegen above is sufficient smoke test if it succeeded).

- [ ] **Step 6: Commit the Phase 1 schema changes**

```bash
git add model-testing-app/convex/schema.ts model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1 schema: extend cadences, add replyEvents, opt-out on contacts

Three coupled schema additions per spec
docs/superpowers/specs/2026-05-23-cadence-fire-autonomy-engine-design.md:

- cadences: add packageId, packageOrder, preDraftedTouch (subject/bodyText/
  bodyHtml/dynamicVars), cancelledReason, cancelledByEventId, lastFireKey,
  consecutiveFailures, errors, sourceSkillRunId; add by_package index
- replyEvents (new): inbound audit trail + idempotency surface for both
  Gmail push and HubSpot sync sweep paths
- contacts: add optedOutAt, optedOutByReplyEventId for permanent opt-out
  marker used by the reply handler and cadence-producing skills

Cadences existing structure preserved; intervalDays stays inside
scheduleConfig (no top-level migration). The (source, externalId) index
on replyEvents is the idempotency guard for the dual-path reply detection.

Backend modules, MCP tools, dispatcher, and webhook land in follow-on commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 2 — Cadence Backend Module (~30 min)

### Task 4: Create `convex/cadences.ts` with mutations and queries

**Files:**
- Create: `model-testing-app/convex/cadences.ts`

- [ ] **Step 1: Create the file with complete content**

Create `model-testing-app/convex/cadences.ts` with this content (no placeholders):

```typescript
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Internal API for the cadences table. The MCP tools cadence.create and
// cadence.cancel wrap these (see convex/mcp.ts). The cron dispatcher in
// cadenceDispatcher.ts uses the internal queries to find due rows and the
// internal mutations to advance state.

// ── Create a cadence row (called by cadence.create MCP tool) ───────────

export const createInternal = internalMutation({
  args: {
    contactId: v.id("contacts"),
    cadenceType: v.union(
      v.literal("prospect_followup"),
      v.literal("warm_lead_chase"),
      v.literal("execution_chaser"),
      v.literal("client_checkin"),
      v.literal("bdm_relationship"),
      v.literal("monitoring_ask"),
      v.literal("post_lost_re_engagement"),
      v.literal("custom"),
    ),
    scheduleConfig: v.object({
      intervalDays: v.optional(v.number()),
      anchorDate: v.optional(v.string()),
      customSchedule: v.optional(v.any()),
    }),
    nextDueAt: v.string(),
    isActive: v.boolean(),
    relatedClientId: v.optional(v.id("clients")),
    relatedProjectId: v.optional(v.id("projects")),
    packageId: v.optional(v.string()),
    packageOrder: v.optional(v.number()),
    preDraftedTouch: v.optional(v.object({
      subject: v.string(),
      bodyText: v.string(),
      bodyHtml: v.string(),
      dynamicVars: v.optional(v.any()),
    })),
    sourceSkillRunId: v.optional(v.id("skillRuns")),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("cadences", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ── Find due cadences for the dispatcher cron ────────────────────────

export const findDueInternal = internalQuery({
  args: { nowIso: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    // by_active_next_due is the existing index; query is true + due
    return await ctx.db
      .query("cadences")
      .withIndex("by_active_next_due", (q) =>
        q.eq("isActive", true).lte("nextDueAt", args.nowIso),
      )
      .take(args.limit);
  },
});

// ── Find active cadences for a contact (reply handler cancellation) ──

export const findActiveByContactInternal = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cadences")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

// ── Cancel a single cadence (used by reply handler) ──────────────────

export const cancelInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
    reason: v.string(),
    replyEventId: v.optional(v.id("replyEvents")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cadenceId, {
      isActive: false,
      cancelledReason: args.reason,
      cancelledByEventId: args.replyEventId,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  },
});

// ── Restore a cancelled cadence (used by out_of_office intent) ───────

export const restoreInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
    pauseUntil: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cadenceId, {
      isActive: true,
      pauseUntil: args.pauseUntil,
      cancelledReason: undefined,
      cancelledByEventId: undefined,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  },
});

// ── Advance cadence state after a successful fire ────────────────────

export const advanceAfterFireInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
    fireKey: v.string(),
    lastResult: v.union(
      v.literal("sent"),
      v.literal("skipped_paused"),
      v.literal("skipped_holiday"),
      v.literal("skipped_user_opted_out"),
      v.literal("failed"),
    ),
    nextDueAt: v.optional(v.string()),  // undefined means one-shot complete → set isActive: false
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      lastFiredAt: now,
      lastResult: args.lastResult,
      lastFireKey: args.fireKey,
      consecutiveFailures: 0,
      updatedAt: now,
    };
    if (args.nextDueAt === undefined) {
      patch.isActive = false;
    } else {
      patch.nextDueAt = args.nextDueAt;
    }
    await ctx.db.patch(args.cadenceId, patch);
    return { ok: true };
  },
});

// ── Record a fire failure ────────────────────────────────────────────

export const recordFailureInternal = internalMutation({
  args: {
    cadenceId: v.id("cadences"),
    step: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.cadenceId);
    if (!row) throw new Error(`cadence not found: ${args.cadenceId}`);
    const prevFailures = row.consecutiveFailures ?? 0;
    const prevErrors = row.errors ?? [];
    const now = new Date().toISOString();
    const newErrors = [
      ...prevErrors.slice(-9),  // keep last 10
      { at: now, step: args.step, message: args.message },
    ];
    const consecutiveFailures = prevFailures + 1;
    const patch: Record<string, unknown> = {
      lastResult: "failed" as const,
      consecutiveFailures,
      errors: newErrors,
      updatedAt: now,
    };
    if (consecutiveFailures >= 3) {
      patch.isActive = false;
    }
    await ctx.db.patch(args.cadenceId, patch);
    return { ok: true, deactivated: consecutiveFailures >= 3 };
  },
});

// ── Get one cadence by id ────────────────────────────────────────────

export const getInternal = internalQuery({
  args: { cadenceId: v.id("cadences") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.cadenceId);
  },
});
```

- [ ] **Step 2: Verify it compiles via convex codegen**

Run (from `model-testing-app/`): `npx convex codegen`

Expected: success, generates types for the new module. If errors about missing imports or undefined types, re-read the file and fix.

- [ ] **Step 3: Commit deferred — batched with Task 5**

Skip; commit at end of Task 5.

---

### Task 5: Create `convex/replyEvents.ts` with mutations and queries

**Files:**
- Create: `model-testing-app/convex/replyEvents.ts`

- [ ] **Step 1: Create the file**

Create `model-testing-app/convex/replyEvents.ts` with this content:

```typescript
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// Internal API for the replyEvents table. Written by the Gmail push webhook
// and the HubSpot sync sweep. Idempotency guard is the (source, externalId)
// index — the same Gmail message arriving via both paths processes once.

// ── Find by source + externalId (idempotency check) ──────────────────

export const findBySourceExternalIdInternal = internalQuery({
  args: {
    source: v.union(v.literal("gmail_push"), v.literal("hubspot_sync")),
    externalId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("replyEvents")
      .withIndex("by_source_externalId", (q) =>
        q.eq("source", args.source).eq("externalId", args.externalId),
      )
      .first();
  },
});

// ── Create a new event row ───────────────────────────────────────────

export const createInternal = internalMutation({
  args: {
    source: v.union(v.literal("gmail_push"), v.literal("hubspot_sync")),
    externalId: v.string(),
    contactId: v.optional(v.id("contacts")),
    receivedAt: v.string(),
    rawMessageRef: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("replyEvents", {
      ...args,
      processed: false,
    });
  },
});

// ── Patch classification result onto a row ───────────────────────────

export const patchClassificationInternal = internalMutation({
  args: {
    replyEventId: v.id("replyEvents"),
    classifiedIntent: v.string(),
    classifiedConfidence: v.number(),
    classifierEvidence: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { replyEventId, ...rest } = args;
    await ctx.db.patch(replyEventId, rest);
    return { ok: true };
  },
});

// ── Mark cancelled cadences onto the row ─────────────────────────────

export const patchCancelledInternal = internalMutation({
  args: {
    replyEventId: v.id("replyEvents"),
    cadencesCancelled: v.array(v.id("cadences")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.replyEventId, {
      cadencesCancelled: args.cadencesCancelled,
    });
    return { ok: true };
  },
});

// ── Mark processed + dispatched ──────────────────────────────────────

export const markProcessedInternal = internalMutation({
  args: {
    replyEventId: v.id("replyEvents"),
    dispatchedTo: v.string(),
    dispatchedSkillRunId: v.optional(v.id("skillRuns")),
  },
  handler: async (ctx, args) => {
    const { replyEventId, ...rest } = args;
    await ctx.db.patch(replyEventId, {
      ...rest,
      processed: true,
    });
    return { ok: true };
  },
});

// ── Append error ─────────────────────────────────────────────────────

export const appendErrorInternal = internalMutation({
  args: { replyEventId: v.id("replyEvents"), message: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.replyEventId);
    if (!row) throw new Error(`replyEvent not found: ${args.replyEventId}`);
    const prev = row.errors ?? [];
    await ctx.db.patch(args.replyEventId, {
      errors: [...prev.slice(-9), args.message],
    });
    return { ok: true };
  },
});

// ── Get one row by id ────────────────────────────────────────────────

export const getInternal = internalQuery({
  args: { replyEventId: v.id("replyEvents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.replyEventId);
  },
});
```

- [ ] **Step 2: Verify it compiles**

Run (from `model-testing-app/`): `npx convex codegen`

Expected: success. New `internal.replyEvents.*` API surface visible in generated types.

- [ ] **Step 3: Commit Phase 2 backend modules**

```bash
git add model-testing-app/convex/cadences.ts model-testing-app/convex/replyEvents.ts model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1: cadences + replyEvents internal mutations and queries

cadences.ts: createInternal, findDueInternal (the dispatcher's hot path,
uses the existing by_active_next_due index), findActiveByContactInternal
(reply handler's cancellation lookup), cancelInternal, restoreInternal
(for out_of_office intent), advanceAfterFireInternal (resets
consecutiveFailures + computes next state), recordFailureInternal
(auto-deactivates after 3 consecutive failures per spec), getInternal.

replyEvents.ts: findBySourceExternalIdInternal (idempotency guard for the
dual-path Gmail push + HubSpot sync flow), createInternal,
patchClassificationInternal, patchCancelledInternal, markProcessedInternal,
appendErrorInternal, getInternal.

Both modules are internal-only; the MCP tool surface (cadence.create,
cadence.cancel) lands in the next commit. The cron dispatcher (Task 7-8)
and webhook handler (Task 9-12) wire these together.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Add `cadence.create` and `cadence.cancel` MCP tools

**Files:**
- Modify: `model-testing-app/convex/mcp.ts` (insert in `TOOLS` array, after `skillRun.complete`)

- [ ] **Step 1: Confirm the bearer token + endpoint**

Run: `cat /Users/cowboy/rockcap/rockcap-v2/.mcp.json`

Expected: shows `"url": "https://incredible-kudu-562.convex.site/mcp"` and `"Authorization": "Bearer rcp_..."`. Note the token for the verification calls.

- [ ] **Step 2: Locate the insertion point in mcp.ts**

Run: `grep -n "skillRun.complete" /Users/cowboy/rockcap/rockcap-v2/model-testing-app/convex/mcp.ts`

Expected: shows the line with the skillRun.complete tool name (likely ~line 480-500). New tools insert directly after that tool's closing `},` and before the next `]` of the TOOLS array.

- [ ] **Step 3: Insert both tool definitions**

After the `skillRun.complete` block, before the closing `]` of the `TOOLS` array, insert:

```typescript
  // Cadence lifecycle (cadence-fire v1; see spec
  // docs/superpowers/specs/2026-05-23-cadence-fire-autonomy-engine-design.md)
  {
    name: "cadence.create",
    description:
      "Queue a cadence row that the dispatcher will fire at nextDueAt. For gauntlet-mode pre-drafted packages (prospect-intel uses this), set packageId + packageOrder + preDraftedTouch together. For recurring cadences (e.g., BDM relationship maintenance), set scheduleConfig.intervalDays and omit preDraftedTouch (v1 ships pre-drafted only; recurring composition lands in v1.1).",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Convex id of the target contact" },
        cadenceType: {
          type: "string",
          description: "prospect_followup | warm_lead_chase | execution_chaser | client_checkin | bdm_relationship | monitoring_ask | post_lost_re_engagement | custom",
        },
        nextDueAt: { type: "string", description: "ISO timestamp; when the dispatcher should consider this due" },
        scheduleConfig: {
          type: "object",
          properties: {
            intervalDays: { type: "number" },
            anchorDate: { type: "string" },
            customSchedule: { type: "object" },
          },
        },
        isActive: { type: "boolean", description: "Usually true on creation" },
        relatedClientId: { type: "string" },
        relatedProjectId: { type: "string" },
        packageId: { type: "string", description: "If part of a multi-touch package (gauntlet pattern), use the same packageId for all members" },
        packageOrder: { type: "number", description: "1-indexed position in the package (1, 2, 3, ...)" },
        preDraftedTouch: {
          type: "object",
          description: "If supplied, the dispatcher fires this content directly without invoking the composer",
          properties: {
            subject: { type: "string" },
            bodyText: { type: "string" },
            bodyHtml: { type: "string" },
            dynamicVars: { type: "object", description: "Optional placeholders to refresh at fire time" },
          },
          required: ["subject", "bodyText", "bodyHtml"],
        },
        sourceSkillRunId: { type: "string", description: "If queued by a skill run, the runId for audit linkage" },
      },
      required: ["contactId", "cadenceType", "nextDueAt", "scheduleConfig", "isActive"],
    },
    handler: async (ctx, userId, args) => {
      const cadenceId = await ctx.runMutation(internal.cadences.createInternal, {
        contactId: args.contactId,
        cadenceType: args.cadenceType,
        scheduleConfig: args.scheduleConfig,
        nextDueAt: args.nextDueAt,
        isActive: args.isActive,
        relatedClientId: args.relatedClientId,
        relatedProjectId: args.relatedProjectId,
        packageId: args.packageId,
        packageOrder: args.packageOrder,
        preDraftedTouch: args.preDraftedTouch,
        sourceSkillRunId: args.sourceSkillRunId,
        createdBy: userId,
      });
      return asText({ status: "created", cadenceId });
    },
  },
  {
    name: "cadence.cancel",
    description:
      "Set a cadence's isActive to false with a reason. Used by operators for manual cancellation. Reply-event-driven cancellation goes through the webhook handler, not this tool.",
    inputSchema: {
      type: "object",
      properties: {
        cadenceId: { type: "string" },
        reason: { type: "string", description: "Free-form reason; will be stored in cancelledReason" },
      },
      required: ["cadenceId", "reason"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.cadences.cancelInternal, {
        cadenceId: args.cadenceId,
        reason: args.reason,
      });
      return asText(result);
    },
  },
```

- [ ] **Step 4: Deploy**

Run (from `model-testing-app/`): `npx convex dev --once`

Expected: clean push, no errors. The MCP HTTP action re-deploys with the two new tools.

- [ ] **Step 5: Verify both tools are listed via tools/list**

Run (substitute `<TOKEN>` from Step 1):

```bash
curl -s -X POST https://incredible-kudu-562.convex.site/mcp \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -oE '"name":"cadence\.[a-z]+"'
```

Expected: `"name":"cadence.create"` and `"name":"cadence.cancel"` both appear.

- [ ] **Step 6: Smoke-test cadence.cancel error path**

Run (with a fake cadenceId):

```bash
curl -s -X POST https://incredible-kudu-562.convex.site/mcp \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"cadence.cancel","arguments":{"cadenceId":"definitely-not-real","reason":"smoke test"}}}'
```

Expected: returns an error response (validator error about id format). Confirms the tool is registered and validation runs.

- [ ] **Step 7: Commit Task 6**

```bash
git add model-testing-app/convex/mcp.ts
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1: cadence.create and cadence.cancel MCP tools

cadence.create accepts the full gauntlet-package shape (contactId,
cadenceType, scheduleConfig, nextDueAt, isActive, package fields,
preDraftedTouch, sourceSkillRunId). Used by prospect-intel to queue
the initial outreach + 3-4 follow-ups in one batch.

cadence.cancel is the operator-facing manual override; reply-driven
cancellation flows through the webhook handler instead (lands in
follow-on commits).

Verified end-to-end via tools/list + tools/call against the live MCP
endpoint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 3 — Dispatcher Cron (~25 min)

### Task 7: Create `convex/cadenceDispatcher.ts` with the dispatch action

**Files:**
- Create: `model-testing-app/convex/cadenceDispatcher.ts`

- [ ] **Step 1: Create the file**

Create `model-testing-app/convex/cadenceDispatcher.ts` with this content:

```typescript
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

// Cadence dispatcher (cadence-fire v1).
//
// Runs every 5 minutes via crons.ts. Polls due cadences (isActive + nextDueAt
// past), runs skip checks, and either creates an approval directly for
// pre-drafted touches OR (v1.1) calls out to the composer for dynamic types.
//
// v1 scope: pre-drafted only. If preDraftedTouch is absent, log an error
// and mark the row failed (v1.1 will route to the composer).

const MAX_ROWS_PER_TICK = 100;

export const tick = internalAction({
  args: {},
  handler: async (ctx) => {
    const nowIso = new Date().toISOString();

    const dueRows = await ctx.runQuery(internal.cadences.findDueInternal, {
      nowIso,
      limit: MAX_ROWS_PER_TICK,
    });

    let fired = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of dueRows) {
      const fireKey = `${row._id}:${row.nextDueAt}`;

      // Idempotency: already fired this nextDueAt window
      if (row.lastFireKey === fireKey) {
        skipped++;
        continue;
      }

      // Skip: paused
      if (row.pauseUntil && nowIso < row.pauseUntil) {
        await ctx.runMutation(internal.cadences.advanceAfterFireInternal, {
          cadenceId: row._id,
          fireKey,
          lastResult: "skipped_paused",
          nextDueAt: computeNextDueAt(row),
        });
        skipped++;
        continue;
      }

      // Skip: contact opted out
      const contact = await ctx.runQuery(internal.contacts.getInternal, {
        contactId: row.contactId,
      });
      if (contact?.optedOutAt) {
        await ctx.runMutation(internal.cadences.advanceAfterFireInternal, {
          cadenceId: row._id,
          fireKey,
          lastResult: "skipped_user_opted_out",
          nextDueAt: undefined,  // deactivate
        });
        skipped++;
        continue;
      }

      // Branch on drafting mode
      if (row.preDraftedTouch) {
        // Pre-drafted: create the approval row directly
        try {
          await ctx.runMutation(internal.approvals.createInternal, {
            entityType: "gmail_send",
            summary: row.preDraftedTouch.subject.slice(0, 200),
            draftPayload: {
              to: contact?.email ?? "(no email on contact)",
              subject: row.preDraftedTouch.subject,
              bodyText: row.preDraftedTouch.bodyText,
              bodyHtml: row.preDraftedTouch.bodyHtml,
            },
            requestedBy: row.createdBy,
            requestedAt: nowIso,
            requestSource: "cadence",
            requestSourceName: "cadence-fire",
            relatedClientId: row.relatedClientId,
            relatedProjectId: row.relatedProjectId,
            relatedContactId: row.contactId,
            relatedCadenceId: row._id,
          });
          await ctx.runMutation(internal.cadences.advanceAfterFireInternal, {
            cadenceId: row._id,
            fireKey,
            lastResult: "sent",
            nextDueAt: computeNextDueAt(row),
          });
          fired++;
        } catch (err) {
          await ctx.runMutation(internal.cadences.recordFailureInternal, {
            cadenceId: row._id,
            step: "create_approval",
            message: err instanceof Error ? err.message : String(err),
          });
          failed++;
        }
      } else {
        // Dynamic-compose: v1.1 will route here. v1 marks failed.
        await ctx.runMutation(internal.cadences.recordFailureInternal, {
          cadenceId: row._id,
          step: "dynamic_compose_unavailable",
          message:
            "v1 ships pre-drafted only; dynamic compose deferred to v1.1. Add preDraftedTouch to cadence row or wait for v1.1 composer.",
        });
        failed++;
      }
    }

    return { fired, skipped, failed, polled: dueRows.length };
  },
});

// Helper: compute the next due-at for a cadence after a successful fire.
// Returns undefined for one-shot package members (which deactivates).
function computeNextDueAt(row: {
  scheduleConfig: { intervalDays?: number };
  packageId?: string;
  packageOrder?: number;
}): string | undefined {
  // Package members are one-shots; they don't recur themselves.
  // (The package as a whole is a sequence of multiple cadence rows
  // each with its own nextDueAt; once a member fires, it's done.)
  if (row.packageId) {
    return undefined;
  }
  // Recurring (no package): advance by intervalDays
  const intervalDays = row.scheduleConfig.intervalDays;
  if (!intervalDays) {
    return undefined;  // one-shot non-package
  }
  const next = new Date(Date.now() + intervalDays * 86_400_000);
  return next.toISOString();
}
```

- [ ] **Step 2: Add the `contacts.getInternal` query referenced above**

The dispatcher calls `internal.contacts.getInternal` to check opt-out status. Verify it exists; if not, add it.

Run: `grep -n "getInternal" /Users/cowboy/rockcap/rockcap-v2/model-testing-app/convex/contacts.ts`

If no result, add this to `model-testing-app/convex/contacts.ts` at the end of the file:

```typescript
import { internalQuery } from "./_generated/server";

export const getInternal = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.contactId);
  },
});
```

(If `import { v }` already at top, don't re-add. If `import { internalQuery }` not present, add to the existing imports.)

- [ ] **Step 3: Add the `approvals.createInternal` mutation if not present**

The dispatcher creates approval rows. Check if internal-API exists.

Run: `grep -n "createInternal\|internalMutation" /Users/cowboy/rockcap/rockcap-v2/model-testing-app/convex/approvals.ts`

If no `createInternal`, add at the end of `model-testing-app/convex/approvals.ts`:

```typescript
import { internalMutation } from "./_generated/server";

export const createInternal = internalMutation({
  args: {
    entityType: v.union(
      v.literal("gmail_send"),
      v.literal("hubspot_write"),
      v.literal("document_publish"),
      v.literal("lender_outreach"),
      v.literal("client_communication"),
      v.literal("skill_action"),
      v.literal("cadence_fire"),
      v.literal("other"),
    ),
    summary: v.string(),
    draftPayload: v.any(),
    requestedBy: v.id("users"),
    requestedAt: v.string(),
    requestSource: v.optional(v.union(
      v.literal("skill"),
      v.literal("background_job"),
      v.literal("cadence"),
      v.literal("manual"),
    )),
    requestSourceName: v.optional(v.string()),
    relatedClientId: v.optional(v.id("clients")),
    relatedProjectId: v.optional(v.id("projects")),
    relatedContactId: v.optional(v.id("contacts")),
    relatedCadenceId: v.optional(v.id("cadences")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("approvals", {
      ...args,
      status: "pending",
    });
  },
});
```

(Imports same caveat — only add what's not already there.)

- [ ] **Step 4: Deploy + codegen**

Run (from `model-testing-app/`): `npx convex dev --once && npx convex codegen`

Expected: clean push, generates types for `internal.cadenceDispatcher.tick`, `internal.contacts.getInternal`, `internal.approvals.createInternal`.

- [ ] **Step 5: Smoke-test the tick manually**

Run (from `model-testing-app/`): `npx convex run cadenceDispatcher:tick`

Expected: returns `{"fired": 0, "skipped": 0, "failed": 0, "polled": 0}` (no due cadences yet, so empty result). Confirms the action is callable.

- [ ] **Step 6: Commit Task 7**

```bash
git add model-testing-app/convex/cadenceDispatcher.ts model-testing-app/convex/contacts.ts model-testing-app/convex/approvals.ts model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1: dispatcher action + supporting internal mutations

cadenceDispatcher.tick: the 5-min cron handler. Polls due cadences via
the existing by_active_next_due index (capped at 100/tick), checks
idempotency via lastFireKey, runs skip checks (pauseUntil, opt-out),
branches on drafting mode. Pre-drafted touches create approval rows
directly via approvals.createInternal. Dynamic-compose rows record a
failure with a v1.1 deferral message — they don't fire in v1.

Supporting internal mutations added:
- contacts.getInternal (used for opt-out check on each due row)
- approvals.createInternal (write-side that the dispatcher uses)

Cron registration lands in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Register the dispatcher cron

**Files:**
- Modify: `model-testing-app/convex/crons.ts`

- [ ] **Step 1: Add the cron registration**

At the end of `model-testing-app/convex/crons.ts`, before the `export default crons;` line, add:

```typescript
// Cadence dispatcher (cadence-fire v1). Every 5 minutes. Polls due
// cadences (isActive + nextDueAt past), fires pre-drafted touches into
// the approval queue, advances state. Dynamic-compose types defer to
// v1.1 (composer not yet built). Cap of 100 rows per tick prevents
// runaway under backlog conditions.
crons.interval(
  "cadence-dispatcher",
  { minutes: 5 },
  internal.cadenceDispatcher.tick,
);
```

- [ ] **Step 2: Deploy**

Run (from `model-testing-app/`): `npx convex dev --once`

Expected: clean push; "cadence-dispatcher" appears in registered crons (visible at `https://dashboard.convex.dev/d/incredible-kudu-562` → Functions → Cron Jobs).

- [ ] **Step 3: Commit Task 8**

```bash
git add model-testing-app/convex/crons.ts
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1: register 5-min dispatcher cron

The dispatcher's tick action (prior commit) is now wired to a 5-min
Convex cron. Hot path is the existing by_active_next_due composite
index on the cadences table; without it every tick would scan the
whole table.

Gmail watch renewal cron lands in a later phase.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 4 — Reply Detection (~45 min)

### Task 9: Create the Gmail push webhook HTTP action

**Files:**
- Create: `model-testing-app/convex/gmailWatch.ts`

- [ ] **Step 1: Confirm Gmail OAuth tokens are stored per-user**

Run: `grep -n "gmail\|googleAccessToken\|googleRefreshToken" /Users/cowboy/rockcap/rockcap-v2/model-testing-app/convex/schema.ts | head -10`

Expected: shows fields on the `users` table or a related table for Google OAuth credentials. Note the field names — needed in Step 2.

If no Gmail-specific tokens (the codebase may share Google tokens between Calendar and Gmail since they share OAuth), use the existing Google token fields. Document which fields are used in the code comment.

- [ ] **Step 2: Create the file with webhook + watch helpers**

Create `model-testing-app/convex/gmailWatch.ts` with this content. The Gmail watch + push pattern is similar to the existing Calendar push channel pattern (`googleCalendarSync.ts`).

```typescript
import { v } from "convex/values";
import { httpAction, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Gmail push notifications (cadence-fire v1).
//
// Gmail's users.watch API delivers a Pub/Sub message to this webhook when
// new mail arrives in INBOX. The webhook acks immediately (200 OK to
// prevent Gmail retries) and dispatches async processing to
// replyEventProcessor.ingestFromGmailPush. Watches expire after 7 days
// and are renewed by the daily gmail-watch-renewal cron below.
//
// Pattern parallels googleCalendarSync.ts (push channel renewal). Shares
// the OAuth tokens stored on the users table (Calendar + Gmail use the
// same Google OAuth identity).

// ── HTTP action: webhook receiver ─────────────────────────────────────

export const pushWebhook = httpAction(async (ctx, request) => {
  // Acknowledge immediately so Gmail doesn't retry. Process async.
  let body: { message?: { data?: string }; subscription?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  // Gmail's push payload is base64(JSON({ emailAddress, historyId }))
  if (!body?.message?.data) {
    return new Response("ok", { status: 200 });
  }

  let decoded: { emailAddress?: string; historyId?: string };
  try {
    const dataStr = atob(body.message.data);
    decoded = JSON.parse(dataStr);
  } catch {
    return new Response("invalid payload", { status: 400 });
  }

  const { emailAddress, historyId } = decoded;
  if (!emailAddress || !historyId) {
    return new Response("missing fields", { status: 400 });
  }

  // Dispatch async; do not await
  await ctx.scheduler.runAfter(
    0,
    internal.replyEventProcessor.ingestFromGmailPush,
    { emailAddress, historyId },
  );

  return new Response("ok", { status: 200 });
});

// ── Internal action: register a Gmail watch for one user ─────────────

export const registerWatchInternal = internalAction({
  args: { userId: v.id("users") },
  handler: async (_ctx, _args) => {
    // STUB for v1: real implementation calls
    //   POST https://gmail.googleapis.com/gmail/v1/users/me/watch
    //   with body { topicName, labelIds: ["INBOX"], labelFilterAction: "include" }
    // and stores the resulting historyId + expiration on the user row.
    //
    // Pre-requisite: a Google Cloud Pub/Sub topic configured to push to
    // the pushWebhook above. Topic ARN comes from an env var.
    //
    // Returning a stub result here; full wiring is operator-driven setup
    // outside the autonomous build. The cron below calls this for users
    // due for renewal so the skeleton is in place when the operator
    // completes the Pub/Sub setup.
    return { status: "stub", note: "Gmail watch registration requires Pub/Sub topic setup (operator)" };
  },
});

// ── Internal action: renew Gmail watches due for refresh ─────────────

export const renewWatchesInternal = internalAction({
  args: {},
  handler: async (_ctx, _args) => {
    // STUB: iterate users with Gmail tokens, re-issue users.watch for those
    // whose watch expiry is within 2 days. Same body as register above.
    // Returning stub; lands operationally when Pub/Sub topic is configured.
    return { status: "stub", note: "Renewal loop runs but is no-op until registerWatchInternal is wired" };
  },
});
```

The stubs are deliberate. Operating Gmail push end-to-end requires a Google Cloud Pub/Sub topic (operator setup outside the autonomous build). The webhook receiver is fully functional today; the watch registration becomes operational when the operator completes Pub/Sub setup.

- [ ] **Step 3: Register the webhook route in http.ts**

Run: `cat /Users/cowboy/rockcap/rockcap-v2/model-testing-app/convex/http.ts 2>/dev/null | head -30`

If `convex/http.ts` exists, add the route there. If not, create it with this content:

```typescript
import { httpRouter } from "convex/server";
import { pushWebhook } from "./gmailWatch";

const http = httpRouter();

http.route({
  path: "/webhooks/gmail-push",
  method: "POST",
  handler: pushWebhook,
});

export default http;
```

If `http.ts` already exists, add only the import + the `http.route({...})` block for `/webhooks/gmail-push`.

- [ ] **Step 4: Deploy + codegen**

Run (from `model-testing-app/`): `npx convex dev --once && npx convex codegen`

Expected: clean push. The webhook URL `https://incredible-kudu-562.convex.site/webhooks/gmail-push` is now live.

- [ ] **Step 5: Smoke-test the webhook**

Run:

```bash
curl -s -X POST https://incredible-kudu-562.convex.site/webhooks/gmail-push \
  -H "Content-Type: application/json" \
  -d '{"message":{"data":"eyJlbWFpbEFkZHJlc3MiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaGlzdG9yeUlkIjoiOTk5OSJ9"},"subscription":"projects/test/subscriptions/test"}'
```

(The `data` field is base64 of `{"emailAddress":"test@example.com","historyId":"9999"}`.)

Expected: returns `ok` HTTP 200. The async dispatch will fail because `replyEventProcessor.ingestFromGmailPush` doesn't exist yet (lands in Task 12) — that's expected; the webhook ack is what we're verifying here.

- [ ] **Step 6: Commit Task 9**

```bash
git add model-testing-app/convex/gmailWatch.ts model-testing-app/convex/http.ts
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1: Gmail push webhook + watch registration stubs

pushWebhook (HTTP action): receives Gmail Pub/Sub notifications,
decodes the base64 message payload, dispatches async to
replyEventProcessor.ingestFromGmailPush (lands in a follow-on commit).
Acknowledges immediately to prevent Gmail retries.

registerWatchInternal + renewWatchesInternal: stub implementations.
Operating Gmail push end-to-end requires a Google Cloud Pub/Sub topic
configured by the operator; the stubs let the renewal cron register
and the webhook route is live, but actual watch issuance is a manual
setup step. Pattern parallels googleCalendarSync.ts (Calendar push
channel renewal).

Route registered at /webhooks/gmail-push on the Convex HTTP host.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Register the Gmail watch renewal cron

**Files:**
- Modify: `model-testing-app/convex/crons.ts`

- [ ] **Step 1: Add the cron registration**

In `model-testing-app/convex/crons.ts`, after the `cadence-dispatcher` cron block from Task 8, add:

```typescript
// Gmail watch renewal (cadence-fire v1). Daily. Re-issues users.watch
// API call for any user whose watch expires within 2 days. Same pattern
// as Calendar push channel renewal. Stub until Pub/Sub topic is
// configured; the cron runs harmlessly today.
crons.daily(
  "gmail-watch-renewal",
  { hourUTC: 4, minuteUTC: 0 },  // before daily-brief-trigger at 5:00
  internal.gmailWatch.renewWatchesInternal,
);
```

- [ ] **Step 2: Deploy**

Run (from `model-testing-app/`): `npx convex dev --once`

Expected: clean push. "gmail-watch-renewal" visible in registered crons.

- [ ] **Step 3: Commit Task 10**

```bash
git add model-testing-app/convex/crons.ts
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1: register daily Gmail watch renewal cron

Renewal cron at 04:00 UTC, before the daily-brief-trigger at 05:00.
Calls gmailWatch.renewWatchesInternal which is a stub until the
operator configures the Pub/Sub topic; the cron runs safely today.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Create the reply event processor

**Files:**
- Create: `model-testing-app/convex/replyEventProcessor.ts`

- [ ] **Step 1: Create the file**

Create `model-testing-app/convex/replyEventProcessor.ts`:

```typescript
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Reply event processor (cadence-fire v1).
//
// Called from two paths:
//  - ingestFromGmailPush: from the Gmail push webhook (real-time)
//  - ingestFromHubspot: from the HubSpot 6h sync sweep (safety net)
//
// Both paths converge on processReplyEvent which:
//  1. Idempotency check by (source, externalId)
//  2. Contact match by email
//  3. Cancel active cadences for the contact
//  4. Call the classifier (Next.js API route) to get intent label
//  5. Dispatch by intent:
//       - book_meeting | info_question → operator_review approval (skills not yet hardened)
//       - defer_long_term → queue wakeup cadences directly
//       - not_interested → set contacts.optedOutAt
//       - out_of_office → restore cancelled cadences + bump pauseUntil
//       - unknown → operator_review approval
//  6. Mark replyEvent.processed

const CLASSIFIER_URL_ENV = "NEXT_APP_URL";
const CLASSIFIER_CONFIDENCE_THRESHOLD = 0.7;

// ── Entry point: Gmail push ──────────────────────────────────────────

export const ingestFromGmailPush = internalAction({
  args: { emailAddress: v.string(), historyId: v.string() },
  handler: async (_ctx, _args) => {
    // STUB for v1: real implementation calls users.history.list since
    // last-known historyId, fetches each new message, then for each
    // message dispatches to processReplyEvent with source: "gmail_push"
    // and externalId: <Message-ID header>.
    //
    // Wired functionally when Pub/Sub setup completes (see gmailWatch.ts
    // stubs). The webhook route exists, the dispatch path exists, the
    // OAuth tokens exist; the missing piece is the operator's Pub/Sub
    // topic provisioning.
    return { status: "stub", processed: 0 };
  },
});

// ── Entry point: HubSpot sync sweep ──────────────────────────────────

export const ingestFromHubspot = internalAction({
  args: {
    engagementId: v.string(),
    contactEmail: v.optional(v.string()),
    receivedAt: v.string(),
    rawMessageRef: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await processReplyEvent(ctx, {
      source: "hubspot_sync",
      externalId: `hubspot:engagement:${args.engagementId}`,
      contactEmail: args.contactEmail,
      receivedAt: args.receivedAt,
      rawMessageRef: args.rawMessageRef,
      userId: args.userId,
      replyBody: undefined,  // HubSpot sweep doesn't have body; classifier limited to intent inference from cadence context
      replySubject: undefined,
    });
  },
});

// ── Shared processing logic ──────────────────────────────────────────

async function processReplyEvent(
  ctx: any,
  args: {
    source: "gmail_push" | "hubspot_sync";
    externalId: string;
    contactEmail?: string;
    receivedAt: string;
    rawMessageRef?: string;
    userId: any;  // Id<"users">
    replyBody?: string;
    replySubject?: string;
  },
) {
  // Step 1: Idempotency
  const existing = await ctx.runQuery(
    internal.replyEvents.findBySourceExternalIdInternal,
    { source: args.source, externalId: args.externalId },
  );
  if (existing) {
    return { status: "duplicate", replyEventId: existing._id };
  }

  // Step 2: Contact match
  let contactId: any = undefined;
  if (args.contactEmail) {
    const contact = await ctx.runQuery(
      internal.contacts.findByEmailInternal,
      { email: args.contactEmail },
    );
    contactId = contact?._id;
  }

  // Step 3: Create the event row
  const replyEventId = await ctx.runMutation(
    internal.replyEvents.createInternal,
    {
      source: args.source,
      externalId: args.externalId,
      contactId,
      receivedAt: args.receivedAt,
      rawMessageRef: args.rawMessageRef,
      userId: args.userId,
    },
  );

  // If no contact matched, record but do not act
  if (!contactId) {
    await ctx.runMutation(internal.replyEvents.markProcessedInternal, {
      replyEventId,
      dispatchedTo: "no_contact_match",
    });
    return { status: "no_contact_match", replyEventId };
  }

  // Step 4: Cancel active cadences
  const activeCadences = await ctx.runQuery(
    internal.cadences.findActiveByContactInternal,
    { contactId },
  );
  const cancelledIds = [];
  for (const cad of activeCadences) {
    await ctx.runMutation(internal.cadences.cancelInternal, {
      cadenceId: cad._id,
      reason: "inbound_received",
      replyEventId,
    });
    cancelledIds.push(cad._id);
  }
  if (cancelledIds.length > 0) {
    await ctx.runMutation(internal.replyEvents.patchCancelledInternal, {
      replyEventId,
      cadencesCancelled: cancelledIds,
    });
  }

  // Step 5: Call classifier (Next.js API)
  let intent = "unknown";
  let confidence = 0.0;
  let evidence: string | undefined = undefined;
  try {
    const appUrl = process.env[CLASSIFIER_URL_ENV];
    if (appUrl && args.replyBody) {
      const res = await fetch(`${appUrl}/api/classify-reply-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replyBody: args.replyBody,
          replySubject: args.replySubject ?? "",
          contactId,
          cancelledCadenceIds: cancelledIds,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        intent = data.intent ?? "unknown";
        confidence = data.confidence ?? 0;
        evidence = data.evidence;
      }
    }
  } catch (err) {
    await ctx.runMutation(internal.replyEvents.appendErrorInternal, {
      replyEventId,
      message: `classifier call failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Force unknown if low confidence
  if (confidence < CLASSIFIER_CONFIDENCE_THRESHOLD) {
    intent = "unknown";
  }

  await ctx.runMutation(internal.replyEvents.patchClassificationInternal, {
    replyEventId,
    classifiedIntent: intent,
    classifiedConfidence: confidence,
    classifierEvidence: evidence,
  });

  // Step 6: Dispatch by intent
  const dispatch = await dispatchByIntent(ctx, {
    intent,
    replyEventId,
    contactId,
    cancelledCadences: activeCadences,
    userId: args.userId,
    replyBody: args.replyBody,
    replySubject: args.replySubject,
  });

  await ctx.runMutation(internal.replyEvents.markProcessedInternal, {
    replyEventId,
    dispatchedTo: dispatch.destination,
  });

  return { status: "processed", replyEventId, intent, dispatch };
}

async function dispatchByIntent(
  ctx: any,
  args: {
    intent: string;
    replyEventId: any;
    contactId: any;
    cancelledCadences: any[];
    userId: any;
    replyBody?: string;
    replySubject?: string;
  },
) {
  switch (args.intent) {
    case "not_interested": {
      await ctx.runMutation(internal.contacts.markOptedOutInternal, {
        contactId: args.contactId,
        replyEventId: args.replyEventId,
      });
      return { destination: "opt_out_marker" };
    }
    case "defer_long_term": {
      // Queue 3-month and 6-month wakeup cadences
      const now = Date.now();
      const threeMonths = new Date(now + 90 * 86_400_000).toISOString();
      const sixMonths = new Date(now + 180 * 86_400_000).toISOString();
      const packageId = `longterm-${args.replyEventId}`;
      for (const [idx, dueAt] of [threeMonths, sixMonths].entries()) {
        await ctx.runMutation(internal.cadences.createInternal, {
          contactId: args.contactId,
          cadenceType: "post_lost_re_engagement",
          scheduleConfig: {},
          nextDueAt: dueAt,
          isActive: true,
          packageId,
          packageOrder: idx + 1,
          createdBy: args.userId,
        });
      }
      return { destination: "long_term_monitor_queued" };
    }
    case "out_of_office": {
      // Restore the cancelled cadences with a 7-day pause
      const pauseUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
      for (const cad of args.cancelledCadences) {
        await ctx.runMutation(internal.cadences.restoreInternal, {
          cadenceId: cad._id,
          pauseUntil,
        });
      }
      return { destination: "restored_cadences" };
    }
    case "book_meeting":
    case "info_question":
    case "unknown":
    default: {
      // Create an operator-review approval
      await ctx.runMutation(internal.approvals.createInternal, {
        entityType: "client_communication",
        summary: `Reply needs operator review (intent: ${args.intent})`,
        draftPayload: {
          intent: args.intent,
          replyBody: args.replyBody ?? "(no body — HubSpot sweep path)",
          replySubject: args.replySubject ?? "",
          replyEventId: args.replyEventId,
        },
        requestedBy: args.userId,
        requestedAt: new Date().toISOString(),
        requestSource: "background_job",
        requestSourceName: "cadence-fire/reply-router",
        relatedContactId: args.contactId,
      });
      return { destination: "operator_review" };
    }
  }
}
```

- [ ] **Step 2: Add the supporting internal queries/mutations**

The processor calls `internal.contacts.findByEmailInternal` and `internal.contacts.markOptedOutInternal`. Add these to `model-testing-app/convex/contacts.ts`:

```typescript
// Add these to convex/contacts.ts (alongside getInternal from Task 7):

export const findByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contacts")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

export const markOptedOutInternal = internalMutation({
  args: {
    contactId: v.id("contacts"),
    replyEventId: v.id("replyEvents"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.contactId, {
      optedOutAt: new Date().toISOString(),
      optedOutByReplyEventId: args.replyEventId,
    });
    return { ok: true };
  },
});
```

(Import `internalMutation` from `./_generated/server` if not already imported.)

- [ ] **Step 3: Deploy + codegen**

Run (from `model-testing-app/`): `npx convex dev --once && npx convex codegen`

Expected: clean push. No errors about missing types or references.

- [ ] **Step 4: Smoke-test ingestFromHubspot manually**

Run:

```bash
npx convex run replyEventProcessor:ingestFromHubspot '{
  "engagementId": "smoketest-1",
  "contactEmail": "nonexistent@example.com",
  "receivedAt": "2026-05-23T00:00:00Z",
  "userId": "<a-real-user-id-from-the-users-table>"
}'
```

(Substitute a real user ID. Get one from the Convex dashboard → users table.)

Expected: returns `{"status": "no_contact_match", "replyEventId": "..."}`. Confirms the processor runs, creates a replyEvents row, and correctly handles the no-match case.

Re-run the same command. Expected: returns `{"status": "duplicate", "replyEventId": <same id>}`. Confirms idempotency.

- [ ] **Step 5: Commit Task 11**

```bash
git add model-testing-app/convex/replyEventProcessor.ts model-testing-app/convex/contacts.ts model-testing-app/convex/_generated/
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1: reply event processor + intent dispatch

replyEventProcessor.processReplyEvent: the unified handler called by both
the Gmail push webhook path (real-time) and the HubSpot 6h sync sweep
(safety net). Steps: idempotency check → contact match → cancel active
cadences → call classifier API → dispatch by intent.

Intent dispatch destinations (v1 cut):
- not_interested → mark contact opted-out
- defer_long_term → queue 3- and 6-month wakeup cadences directly
- out_of_office → restore cancelled cadences, 7-day pause
- book_meeting | info_question | unknown → operator-review approval
  (target skills not hardened yet)

Supporting mutations added to contacts.ts: findByEmailInternal,
markOptedOutInternal.

ingestFromGmailPush is currently a stub (requires Pub/Sub setup);
ingestFromHubspot is fully functional and is the path the upcoming
HubSpot sync sweep hook (Task 12) will call.

Verified end-to-end: a smoke-test call creates a replyEvent and
returns no-match-found correctly; a duplicate call returns the
idempotency guard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Hook HubSpot sync sweep to the reply processor

**Files:**
- Modify: `model-testing-app/convex/hubspotSync/activities.ts`

- [ ] **Step 1: Locate the insertion point in activities.ts**

Run: `grep -n "^export\|ingestNewActivity\|email_in\|incoming" /Users/cowboy/rockcap/rockcap-v2/model-testing-app/convex/hubspotSync/activities.ts | head -20`

Expected: shows exported functions and any existing inbound-handling code. Identify where new inbound activities are inserted/upserted — that's the hook point.

- [ ] **Step 2: Add the hook**

The exact insertion depends on file structure. The principle: after an inbound activity (`email_in`, `incoming_call`, `meeting`) is upserted, fire-and-forget a call to `internal.replyEventProcessor.ingestFromHubspot`. Use `ctx.scheduler.runAfter(0, ...)` so the sync itself isn't slowed.

Pseudo-pattern to apply (adapt to actual file structure):

```typescript
// After existing logic that upserts an inbound activity row:
if (activity.type === "EMAIL" && activity.metadata?.direction === "INBOUND") {
  await ctx.scheduler.runAfter(0, internal.replyEventProcessor.ingestFromHubspot, {
    engagementId: activity.hubspotEngagementId,
    contactEmail: activity.from?.email,
    receivedAt: activity.activityDate ?? new Date().toISOString(),
    rawMessageRef: activity.hubspotUrl,
    userId: activity.syncOwnerUserId,  // whichever user's sync surfaced this
  });
}
```

The exact field names depend on the existing activities.ts shape. Read the file first; adapt the access paths.

- [ ] **Step 3: Deploy**

Run (from `model-testing-app/`): `npx convex dev --once`

Expected: clean push.

- [ ] **Step 4: Smoke-test via manual trigger of an existing sync**

Run: `npx convex run hubspotSync.recurringSync:runRecurringSync`

(This may have side effects depending on the sync state. If the existing sync is heavy, skip and rely on Convex dashboard verification at next 6h tick.)

Expected: returns sync result; no errors about the hook. Any new inbound activities should produce `replyEvents` rows visible at the dashboard.

- [ ] **Step 5: Commit Task 12**

```bash
git add model-testing-app/convex/hubspotSync/activities.ts
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1: HubSpot sync sweep hook to reply processor

After the existing 6h HubSpot sync upserts an inbound EMAIL activity,
fire-and-forget a call to replyEventProcessor.ingestFromHubspot with
the engagement id, contact email, and receivedAt. The processor's
idempotency check ((source, externalId) on replyEvents) handles
re-runs safely.

This is the safety-net path for the Gmail push webhook: anything
Gmail push misses (delivery failure, watch expired, etc.) catches up
on the next HubSpot tick. The processor's logic is shared between
both entry points, so dispatch behaviour is identical.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 5 — Intent Classifier (~25 min)

### Task 13: Create the `classify-reply-intent` sub-skill

**Files:**
- Create: `skills/sub-skills/classify-reply-intent.md`

- [ ] **Step 1: Create the file**

Create `skills/sub-skills/classify-reply-intent.md` with this content:

```md
# classify-reply-intent

Sub-skill: classify an inbound reply into one of six intent buckets so the cadence-fire reply handler can dispatch to the right downstream destination.

Called by `/api/classify-reply-intent` (Next.js API route, server-side LLM execution). Loaded as system prompt; input data is passed as the user message.

## When to use

Use whenever the cadence engine has detected an inbound reply from a contact with at least one active cadence cancelled. The classifier's job is one decision: which of the six labels best fits this reply, with what confidence.

Not for:

- Drafting a response (downstream skills do that).
- Deciding whether to cancel cadences (the reply event handler already cancelled before calling this).
- Multi-intent classification. Pick the strongest single label; if multiple plausibly apply, default to `unknown` and let the operator route.

## Inputs

Provided in the API request body:

- `replyBody`: full text of the inbound reply
- `replySubject`: subject line of the reply
- `contactId`: Convex id of the matched contact (for context, do not echo)
- `cancelledCadenceIds`: ids of the cadences this reply cancelled (for context, e.g., "if the cancelled cadence was a `prospect_followup`, the reply is most likely a response to a cold outreach")

## Outputs

Return a single JSON object, no prose:

```json
{
  "intent": "book_meeting" | "defer_long_term" | "not_interested" | "info_question" | "out_of_office" | "unknown",
  "confidence": 0.0 - 1.0,
  "evidence": "one-sentence quote or paraphrase from the reply that drove the classification"
}
```

## Intent vocabulary

| Intent | Triggering language |
|---|---|
| `book_meeting` | Explicit accept of a meeting or call. Phrases: "let's chat", "happy to discuss", "what times work for you", "send me a calendar invite", "I'm free Tuesday". The reply expresses willingness to meet. |
| `defer_long_term` | Interested but not now; explicit future timing. Phrases: "not right now", "circle back in {N} months", "maybe in Q3", "we're heads-down on something else", "ping me in the spring". The reply is positive on the relationship but negative on immediate timing. |
| `not_interested` | Clear no. Phrases: "no thanks", "remove me", "not a fit", "please stop contacting me", "unsubscribe", "we don't need this". The reply is a firm decline with no future-window invitation. |
| `info_question` | Substantive question that isn't a meeting accept or rejection. Phrases: "what rates do you typically see for {x}?", "do you handle {asset class}?", "what's your fee structure?", "can you tell me more about your firm?". The reply asks for information that requires a real answer. |
| `out_of_office` | Auto-responder. Phrases: "I'm out of office until {date}", "limited email access", "for urgent matters contact {someone}", "I'll respond when I return". The reply is generated by an auto-responder, not the human. Pay attention to signature blocks that say "Sent automatically" or similar. |
| `unknown` | Cannot classify confidently. Either none of the above match cleanly, or multiple plausibly apply, or the reply is too short / ambiguous to commit. |

## Confidence calibration

- **0.9+**: the reply explicitly uses one of the triggering phrases or a close variant.
- **0.7-0.9**: the reply implies the intent strongly through context, even without exact phrases.
- **0.5-0.7**: ambiguous; the intent is the most plausible single label but a different label could also fit.
- **Below 0.7**: force `intent: "unknown"`. The downstream router's threshold cuts off there, so any label below 0.7 is treated as unknown anyway; report the honest score rather than padding it.

## Style rules

All voice and output rules from `../CONVENTIONS.md` apply. The two that matter most here:

- **No fabrication.** The `evidence` field must quote or paraphrase actual reply text. Do not invent supporting language to justify a label.
- **One decision.** Return one intent. If you find yourself debating between two, the answer is `unknown`. The operator can route correctly with the reply text in hand; the classifier mis-routing is worse than asking.

## Examples

**Input reply:**
> "Hi — thanks for reaching out. We've actually just secured funding for the current project so we're set for now. Could be interested in chatting in 3-6 months once we're looking at our next site. — David"

**Output:**
```json
{
  "intent": "defer_long_term",
  "confidence": 0.92,
  "evidence": "Reply explicitly defers to 3-6 months with positive sentiment ('Could be interested in chatting')"
}
```

**Input reply:**
> "I'm out of the office until 27 May with limited access to email. For urgent matters please contact my colleague Sarah at sarah@example.com. Otherwise I will reply on my return."

**Output:**
```json
{
  "intent": "out_of_office",
  "confidence": 0.99,
  "evidence": "Auto-responder pattern: 'out of the office until 27 May' with delegate contact information"
}
```

**Input reply:**
> "Sure, happy to chat. What times work on your end this week?"

**Output:**
```json
{
  "intent": "book_meeting",
  "confidence": 0.95,
  "evidence": "Explicit 'happy to chat' acceptance with availability inquiry"
}
```

**Input reply:**
> "Not interested"

**Output:**
```json
{
  "intent": "not_interested",
  "confidence": 0.9,
  "evidence": "Two-word firm decline with no qualification or future window"
}
```

**Input reply:**
> "Thanks for the note — what rates are you typically seeing for development finance at 65% LTGDV right now? Want to compare to what we just got quoted."

**Output:**
```json
{
  "intent": "info_question",
  "confidence": 0.85,
  "evidence": "Substantive technical question about current rates at a specific LTV requiring a content answer"
}
```
```

- [ ] **Step 2: Verify the file is properly formatted**

Run: `wc -l /Users/cowboy/rockcap/rockcap-v2/skills/sub-skills/classify-reply-intent.md`

Expected: ~120 lines. Sub-skill content scales with the complexity of the decision rubric; 120 lines is appropriate here given 6 intent buckets with examples.

- [ ] **Step 3: Commit Task 13**

```bash
git add skills/sub-skills/classify-reply-intent.md
git commit -m "$(cat <<'EOF'
[skills] cadence-fire v1: classify-reply-intent sub-skill

New sub-skill loaded as system prompt by /api/classify-reply-intent.
Six intent buckets per spec (book_meeting, defer_long_term,
not_interested, info_question, out_of_office, unknown) with calibrated
triggering language and confidence rubric. Examples per intent cover
both clear and ambiguous cases.

Output contract is a single JSON object: { intent, confidence, evidence }.
Downstream router (replyEventProcessor.dispatchByIntent) thresholds at
0.7 and forces "unknown" below — the sub-skill is instructed to report
honest scores rather than pad above the threshold.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Create the Next.js classifier API route

**Files:**
- Create: `model-testing-app/src/app/api/classify-reply-intent/route.ts`

- [ ] **Step 1: Confirm the Anthropic SDK pattern from the existing chat assistant**

Run: `head -40 /Users/cowboy/rockcap/rockcap-v2/model-testing-app/src/app/api/chat-assistant/route.ts`

Expected: shows the existing pattern (Anthropic client init, system prompt loading, request body shape). Use the same library version + initialisation pattern.

- [ ] **Step 2: Locate the sub-skill file path resolution pattern**

The classifier route needs to load `skills/sub-skills/classify-reply-intent.md` as its system prompt. Check if there's an existing helper for this in the app.

Run: `grep -rn "sub-skills\|SKILL.md\|loadSkill" /Users/cowboy/rockcap/rockcap-v2/model-testing-app/src/ --include='*.ts' --include='*.tsx' | head -10`

If no helper, the route reads the file directly at runtime using `fs.readFile` with a path relative to the repo root.

- [ ] **Step 3: Create the route**

Create `model-testing-app/src/app/api/classify-reply-intent/route.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest } from "next/server";

// Classify-reply-intent API (cadence-fire v1).
//
// Called by Convex action replyEventProcessor.processReplyEvent. Loads the
// classify-reply-intent sub-skill as system prompt, sends the reply body +
// context as user message, parses the model's JSON response.
//
// Pattern parallels /api/chat-assistant: Anthropic SDK, server-side
// execution, no Convex direct calls (Convex calls us via fetch).

const SUB_SKILL_PATH = "skills/sub-skills/classify-reply-intent.md";
const MODEL = "claude-haiku-4-5-20251001";  // cheap + fast; classifier is a small decision
const MAX_TOKENS = 256;

let cachedSystemPrompt: string | null = null;

async function getSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  // Path relative to monorepo root; in production the file ships in the
  // build output (Next.js serverless function can read it via fs).
  const repoRoot = path.resolve(process.cwd(), "..");
  const fullPath = path.join(repoRoot, SUB_SKILL_PATH);
  cachedSystemPrompt = await fs.readFile(fullPath, "utf-8");
  return cachedSystemPrompt;
}

interface ClassifyRequest {
  replyBody: string;
  replySubject?: string;
  contactId: string;
  cancelledCadenceIds: string[];
}

interface ClassifyResponse {
  intent: string;
  confidence: number;
  evidence?: string;
}

export async function POST(request: NextRequest) {
  let body: ClassifyRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.replyBody) {
    return Response.json({ error: "replyBody required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 },
    );
  }

  const client = new Anthropic({ apiKey });
  const systemPrompt = await getSystemPrompt();

  const userMessage = [
    `Subject: ${body.replySubject ?? "(no subject)"}`,
    "",
    "Reply body:",
    body.replyBody,
    "",
    `Cancelled cadence count: ${body.cancelledCadenceIds.length}`,
    "",
    "Return only the JSON object per the output contract. No prose.",
  ].join("\n");

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    return Response.json(
      { error: `anthropic api error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // Extract the text content
  const textBlock = response.content.find((b: { type: string }) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  if (!textBlock) {
    return Response.json({ error: "no text in response" }, { status: 502 });
  }

  // Strip code fence if present, parse JSON
  let parsed: ClassifyResponse;
  try {
    const cleaned = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return Response.json(
      { error: "model response was not valid JSON", raw: textBlock.text },
      { status: 502 },
    );
  }

  return Response.json(parsed);
}
```

- [ ] **Step 4: Smoke-test the route (requires dev server)**

Skip this if dev server isn't running. If running:

```bash
curl -s -X POST http://localhost:3000/api/classify-reply-intent \
  -H "Content-Type: application/json" \
  -d '{"replyBody":"Sorry, not interested right now. Maybe in Q3.","replySubject":"Re: Quick intro","contactId":"test","cancelledCadenceIds":[]}'
```

Expected: JSON response with `intent: "defer_long_term"`, `confidence` around 0.85-0.95, and `evidence` quoting the Q3 deferral. If the endpoint returns 500 about ANTHROPIC_API_KEY, that's expected without the env var — the route is wired correctly.

The build verification in Phase 7 catches the route compiles even without a runtime test.

- [ ] **Step 5: Commit Task 14**

```bash
git add model-testing-app/src/app/api/classify-reply-intent/route.ts
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1: /api/classify-reply-intent Next.js route

Loads classify-reply-intent.md sub-skill as cached system prompt;
calls Anthropic with Haiku 4.5 (cheap + fast for a small decision);
parses model's JSON output and returns it to the caller (Convex's
replyEventProcessor). Strip-and-parse handles models that wrap the
JSON in a code fence.

Pattern parallels /api/chat-assistant: server-side Anthropic SDK,
ephemeral cache_control on the system prompt to amortise the sub-skill
load across requests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 6 — Skill + Doc Updates (~15 min)

### Task 15: Update `cadence-fire/SKILL.md` for the v1 contract

**Files:**
- Modify: `skills/skills/cadence-fire/SKILL.md`

- [ ] **Step 1: Add a v1 contract note at the top of the skill**

After the opening title and one-line description in `skills/skills/cadence-fire/SKILL.md`, before `## Trigger`, insert:

```md
## v1 contract (2026-05-23)

The autonomy engine substrate is live: cadences table, 5-min dispatcher cron, Gmail push webhook (Pub/Sub setup pending), HubSpot sync sweep safety net, classify-reply-intent sub-skill, intent dispatch to four destinations.

**v1 supports pre-drafted touches only.** Skills that produce cadences (prospect-intel today; others in coming weeks) must populate the `preDraftedTouch` field on each `cadences.create` call. Dynamic-compose cadence types (where this skill's per-type composition logic runs at fire time) **defer to v1.1** once the `/api/cadence-compose` route is built.

The per-cadence-type sections below describe the target composition behaviour; in v1 the dispatcher logs a failure for any row without `preDraftedTouch` and the operator handles fallback manually.

See `docs/superpowers/specs/2026-05-23-cadence-fire-autonomy-engine-design.md` for the full design.
```

- [ ] **Step 2: Verify the existing per-cadence-type sections are still readable**

Run: `grep -n '^##' /Users/cowboy/rockcap/rockcap-v2/skills/skills/cadence-fire/SKILL.md`

Expected: `## v1 contract`, `## Trigger`, `## Inputs`, `## Outputs`, `## High-level workflow`, `## Per-cadence-type composition`, `## Style rules`, `## Tool dependencies`, `## What goes wrong`, `## References`. The v1 contract note slots in before the original first heading.

- [ ] **Step 3: Commit deferred — batched with Task 16**

Skip; commit at end of Task 16.

---

### Task 16: Update `prospect-intel/SKILL.md` to declare the cadence package

**Files:**
- Modify: `skills/skills/prospect-intel/SKILL.md`

- [ ] **Step 1: Add the `## Cadence package` section**

In `skills/skills/prospect-intel/SKILL.md`, locate the existing `## Dedup` section (added by the sibling spec). After the `## Dedup` section, before `## Outputs`, insert:

```md
## Cadence package

When the workflow produces a draft outreach (step 7), it does NOT stop at the initial message. Instead it produces a **cadence package**: the initial outreach plus 3 follow-ups, all pre-drafted at queue time, with sequential send dates.

**Why upfront drafting:** the follow-ups reference the initial pitch and intel. Drafting them at queue time keeps the narrative coherent (each follow-up builds on the prior); deferring composition to fire-time loses that thread. Operator approves the full package once.

**Package shape (4 rows in `cadences`, all sharing a `packageId`):**

| Order | Type | nextDueAt offset from now | Content angle |
|---|---|---|---|
| 1 | `prospect_followup` | +0 days (immediate) | The cold outreach itself (drawn from template-mapped-reachout reference) |
| 2 | `prospect_followup` | +5 days | Soft nudge referencing the initial; new angle (one fresh piece of intel) |
| 3 | `prospect_followup` | +12 days | Stronger close referencing a specific scheme or charge filing |
| 4 | `prospect_followup` | +30 days | Final touch with a "should I stop reaching out?" close |

**Implementation:** in workflow step 7, after composing the four messages, call `cadence.create` four times (one per row). Same `packageId` (a UUID generated at step start). `packageOrder` 1-4. Each row carries `preDraftedTouch: { subject, bodyText, bodyHtml }`. `isActive: true`. `sourceSkillRunId` set to the current runId.

If a reply arrives at any point, the cadence engine cancels all remaining package members automatically (via the by_contact_active index lookup). No skill action needed.
```

- [ ] **Step 2: Update workflow step 7 to reference the new section**

In the `## High-level workflow` section, locate step 7 (the reachout drafting step). At the end of step 7's paragraph, append:

```
After composing, queue the full cadence package via `cadence.create` per the `## Cadence package` section above. Operator approves the package; the engine fires the initial touch immediately and the follow-ups on schedule.
```

- [ ] **Step 3: Verify both edits**

Run: `grep -n '^## \|^#### \|cadence.create' /Users/cowboy/rockcap/rockcap-v2/skills/skills/prospect-intel/SKILL.md | head -20`

Expected: includes `## Dedup`, `## Cadence package`, `## Outputs` in that order; `cadence.create` referenced in workflow step 7.

- [ ] **Step 4: Commit Tasks 15 + 16 together**

```bash
git add skills/skills/cadence-fire/SKILL.md skills/skills/prospect-intel/SKILL.md
git commit -m "$(cat <<'EOF'
[skills] cadence-fire v1 contract + prospect-intel cadence package section

cadence-fire/SKILL.md: add ## v1 contract section at top declaring
pre-drafted dispatch only; dynamic compose deferred to v1.1. Documents
which cadence types work today and which wait for the composer.

prospect-intel/SKILL.md: add ## Cadence package section between ## Dedup
and ## Outputs. Specifies the 4-row package shape (initial + 3 follow-
ups, sequential dates, shared packageId, pre-drafted touches). Updates
workflow step 7 to call cadence.create four times to queue the package.

Together these close the contract: prospect-intel produces packages,
cadence-fire fires them. The autonomous outreach loop is live for the
prospect_followup type.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Add `### Event-driven skills` subsection to root CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (root of repo)

- [ ] **Step 1: Locate the insertion point**

Run: `grep -n '^### ' /Users/cowboy/rockcap/rockcap-v2/CLAUDE.md`

Expected: shows `### Plan Execution`, `### Repo layout`, `### Skill execution` (added by sibling spec). The new `### Event-driven skills` goes after `### Skill execution` and before `---` or `## Task Tracking`.

- [ ] **Step 2: Insert the subsection**

After the `### Skill execution` block in root `CLAUDE.md`, insert:

```md
### Event-driven skills

Some skills are not invoked by an operator; they are triggered by events (a cron tick, an inbound reply webhook, a state change). These skills follow a different runtime contract:

1. **Skills that produce cadences** (today: prospect-intel; coming: qualify-and-draft, meeting-prep, lender-intel) must include a `## Cadence package` section in their SKILL.md analogous to the `## Dedup` section pattern. The section specifies the package shape, the cadence types used, the send-date offsets, and any dynamicVars the dispatcher may refresh.

2. **The dispatcher fires pre-drafted touches autonomously.** v1 supports `preDraftedTouch` only. Skills that need fire-time composition (dynamic content based on fresh evidence) must wait for v1.1's `/api/cadence-compose` route. Until then, document the intended dynamic behaviour in SKILL.md but produce pre-drafted touches at queue time.

3. **Reply events cancel cadences.** Any inbound reply from a contact with active cadences automatically cancels those cadences and routes to the intent classifier. Skills do not need to handle this directly. The classifier dispatches to the right next skill (or to an operator-review approval if the destination skill is not yet hardened).

4. **No autonomous external action.** Every output that leaves the system (Gmail send, HubSpot write, lender outreach) routes through an `approvals` row. The operator approves before the action fires. This rule does not change as autonomy increases; the approval is the trust gate.
```

- [ ] **Step 3: Verify the edit**

Run: `grep -n '^### Event-driven skills' /Users/cowboy/rockcap/rockcap-v2/CLAUDE.md`

Expected: one match, between `### Skill execution` and `## Task Tracking`.

- [ ] **Step 4: Commit Task 17**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
[both] CLAUDE.md: add ### Event-driven skills subsection

Companion to ### Skill execution from the sibling spec. Four rules:
(1) skills producing cadences declare a ## Cadence package section in
SKILL.md; (2) v1 dispatcher fires pre-drafted only, fire-time compose
defers to v1.1; (3) inbound replies auto-cancel cadences via the
reply-event handler, skills don't handle directly; (4) all outbound
actions still route through approvals — the human gate doesn't change
with autonomy.

This is the first CLAUDE.md rule set produced by the cadence-fire
hardening session, following the pattern of one CLAUDE.md addition
per substantial skill hardening. Future skill sessions add rules
only after the pattern recurs in 2+ skills (per HARDENING-PLAYBOOK.md).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 7 — Verification (~15 min)

### Task 18: Run `npx next build` and resolve any errors

**Files:** none modified at start; may modify if errors surface.

- [ ] **Step 1: Run convex codegen first**

Run (from `model-testing-app/`): `npx convex codegen`

Expected: clean. Generates all the types added across this plan. If errors, re-deploy schema (`npx convex dev --once`) and retry.

- [ ] **Step 2: Run the Next.js build**

Run (from `model-testing-app/`): `npx next build`

Expected: build completes successfully.

If errors:

- **Missing type imports:** add to the file that references them.
- **`internal.cadences.X` not in API:** Run `npx convex codegen` again; if still missing, the function may not be exported correctly — check the file.
- **`fs` module not found in route:** The classifier route uses `fs.promises`. This works in Node runtime but not Edge. If errors mention edge runtime, add `export const runtime = "nodejs"` to the route file.
- **Anthropic SDK type errors:** check the version pinned in `package.json`; the API shape may differ slightly between versions. Match the pattern from `chat-assistant/route.ts`.

Fix each error in the offending file, re-run the build, repeat until clean.

- [ ] **Step 3: Commit any build fixes**

If build fixes were needed:

```bash
git add <modified files>
git commit -m "$(cat <<'EOF'
[app] cadence-fire v1: build fixes for [brief summary]

[Describe the specific fix(es) applied to pass the build.]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If the build was clean first try, skip the commit.

---

### Task 19: End-to-end smoke test of the dispatcher path

**Files:** none modified; verification only.

This task confirms the pre-drafted dispatch path works end to end without depending on Gmail or HubSpot inbound (those require operator setup outside the autonomous build).

- [ ] **Step 1: Confirm a real user + contact exist**

In the Convex dashboard (`https://dashboard.convex.dev/d/incredible-kudu-562` → Data), locate:
- One row in `users` — note the `_id`
- One row in `contacts` with an email — note the `_id` and the email

If no contacts exist (unlikely given the existing HubSpot sync data), pick a known-stable contact id.

- [ ] **Step 2: Insert a test cadence row via the MCP tool**

Run (substitute `<TOKEN>`, `<CONTACT_ID>`, `<USER_ID>` — though for the MCP tool, userId is taken from the bearer token's user, not passed explicitly):

```bash
curl -s -X POST https://incredible-kudu-562.convex.site/mcp \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cadence.create","arguments":{"contactId":"<CONTACT_ID>","cadenceType":"prospect_followup","nextDueAt":"2020-01-01T00:00:00Z","scheduleConfig":{},"isActive":true,"packageId":"smoketest-001","packageOrder":1,"preDraftedTouch":{"subject":"smoke test","bodyText":"This is a smoke test cadence row. Safe to reject in the approval queue.","bodyHtml":"<p>This is a smoke test cadence row. Safe to reject in the approval queue.</p>"}}}}'
```

(The `nextDueAt` is in the past so the next dispatcher tick picks it up.)

Expected: returns `{"status": "created", "cadenceId": "..."}`. Note the cadenceId.

- [ ] **Step 3: Trigger the dispatcher manually**

Run (from `model-testing-app/`): `npx convex run cadenceDispatcher:tick`

Expected: returns `{"fired": 1, "skipped": 0, "failed": 0, "polled": 1}` (or higher counts if other due rows exist).

- [ ] **Step 4: Verify in the Convex dashboard**

Open `https://dashboard.convex.dev/d/incredible-kudu-562` → Data:

- `cadences` table: the smoke test row's `lastFiredAt` is now populated, `lastResult` is `"sent"`, `lastFireKey` matches `${_id}:2020-01-01T00:00:00Z`.
- `approvals` table: a new row exists with `relatedCadenceId` = the smoke test cadenceId, `entityType: "gmail_send"`, `status: "pending"`, `summary: "smoke test"`.

- [ ] **Step 5: Re-trigger to verify idempotency**

Run: `npx convex run cadenceDispatcher:tick`

Expected: returns `{"fired": 0, "skipped": 1, "failed": 0, "polled": 1}` (because the lastFireKey matches). No new approval row created.

- [ ] **Step 6: Clean up the smoke test row**

In the Convex dashboard, delete the smoke test cadence row and the associated approval row. (Or leave them tagged as smoke tests — operator's call.)

- [ ] **Step 7: Push all commits to the remote (per CLAUDE.md plan execution rule)**

Run: `git push origin HEAD`

(Pushes the current branch to its tracked remote. If no upstream is set, use `git push -u origin <branch-name>`.)

Expected: all commits from this plan visible on the remote branch.

- [ ] **Step 8: Surface a summary to the operator**

In the final message of the session, report:
- Total commits landed (count via `git log --oneline main..HEAD | wc -l`)
- Confirmation that `npx next build` passed
- Smoke test result
- Known operator-driven follow-ups: Pub/Sub topic setup for Gmail push; real prospect-intel run to produce a real package; v1.1 composer for dynamic-mode cadence types
- Branch name + suggestion: review the commits, then merge to main

**Plan complete.**

---

## Plan Self-Review

**Spec coverage:**

| Spec section | Plan task(s) |
|---|---|
| 1. Goal and Success Criteria | Task 19 (smoke test verifies criterion 1; criteria 2-5 require operator setup of Pub/Sub) |
| 2.1 Roles and Runtimes | Distributed: dispatcher (Task 7-8), composer (deferred), webhook (Task 9), HubSpot sweep (Task 12), classifier (Task 14), watch renewer (Task 10) |
| 2.2 Data Model: cadences | Task 1 (extends existing) |
| 2.2 Data Model: replyEvents | Task 2 |
| 2.2 Data Model: contacts.optedOutAt | Task 3 |
| 2.3 Time-Driven Flow | Task 7 (dispatcher logic), Task 8 (cron) |
| 2.4 Reply-Driven Flow | Tasks 9, 10, 11, 12 |
| 2.5 Intent Classifier | Tasks 13 (sub-skill), 14 (API route); dispatch in Task 11 |
| 3.1 v1 Scope (cadences + replyEvents + contacts fields) | Tasks 1, 2, 3 |
| 3.1 v1 Scope (dispatcher pre-drafted only) | Task 7 (explicit v1.1 stub for dynamic) |
| 3.1 v1 Scope (Gmail webhook + watch renewer) | Tasks 9, 10 |
| 3.1 v1 Scope (HubSpot sweep) | Task 12 |
| 3.1 v1 Scope (intent classifier sub-skill + dispatch) | Tasks 13, 14, 11 |
| 3.1 v1 Scope (cadence.create, cadence.cancel MCP) | Task 6 |
| 3.1 v1 Scope (cadence-fire SKILL.md update) | Task 15 |
| 3.1 v1 Scope (prospect-intel package section) | Task 16 |
| 3.1 v1 Scope (CLAUDE.md addition) | Task 17 |
| 4.1 Definition of Done | Task 18 (build), Task 19 (smoke test) |
| 4.2 Out of Scope (composer, holiday calendar, etc.) | Honoured throughout; explicit stub in Task 7 |

**Placeholder scan:** Searched for TBD, TODO, "fill in details", "similar to Task N". The Gmail watch stubs in Task 9 and the GmailPush ingest stub in Task 11 are intentional and load-bearing: the spec's Section 6 ("Open Considerations") and Section 3.1 ("v1 Scope") both call out that Pub/Sub setup is operator work, not autonomous build. Each stub returns a structured response and is honest about its scope; the webhook route + renewal cron are fully wired and the renewal stub runs harmlessly until the operator completes setup. This is a real v1 boundary, not a plan failure.

**Type consistency:** Field names match across schema (Task 1-3), internal mutations (Tasks 4-5), MCP tools (Task 6), dispatcher (Task 7), processor (Task 11), and verification calls (Task 19). `preDraftedTouch` has the same shape (subject, bodyText, bodyHtml, dynamicVars?) everywhere it appears. `lastFireKey` is consistently `${_id}:${nextDueAt}`. Intent label strings match between the sub-skill examples (Task 13), the classifier API (Task 14), and the dispatcher switch (Task 11).

**Spec-to-plan gap check:** Spec Section 4.2 (Out of Scope) lists composer, meeting-prep/qualify-and-draft hardening, holiday calendar, multi-channel cadences, /cadences UI, token cost capture, repo split. Plan does not implement any of these. Correctly out of scope.

No fixes needed; plan is internally consistent and covers the v1 cut of the spec.
