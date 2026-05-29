# Document-Author Skill + generateDocument Tool (P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. NOTE: the prose-authoring tasks (SKILL.md + references) are authored by the controller (who holds the design context), not delegated to a context-blind subagent; the code task (Task 1) is subagent-suitable.

**Goal:** Close the loop — let a chat request ("generate me a one-pager on {company}") produce an approval-gated, client-filed document, by composing content under prose guardrails and driving the P1 render + P2 staging.

**Architecture:** A `generateDocument` chat tool (the "hands": renders via the P1 route, stages via P2's `requestPublish`) + a `document-author` guiding skill (the "brain": resolves the entity, gathers data, loads the rule references, composes semantic HTML, calls the tool) + two prose rule references (a house-style ref + one doc-type guardrail ref). The chat agent reaches the skill via the existing `searchSkills` injection; the model composes the HTML and passes it to the tool.

**Tech Stack:** chat tool registry (`src/lib/tools/`), the authenticated `ConvexHttpClient` the chat route already provides, server-to-server `fetch` to `/api/documents/generate`, Convex `documentPublish.requestPublish`, markdown skill + references.

**Where this sits:** Third and final v1 sub-plan. P1 (render engine: `POST /api/documents/generate` → `{files:[{format,storageId,fileName,fileSize,mime}]}`) and P2 (`documentPublish.requestPublish` stages a `document_publish` approval; on approve, `recordPublishedDocs` files client-scoped `documents` rows; `/approvals` previews them) are done.

**Verified integration facts (from codebase audit):**
- The `convexClient` passed to `executeTool` IS authenticated as the operator (`getAuthenticatedConvexClient()` at `chat-assistant/route.ts:24`, passed to the loop and the post-confirmation path). So a handler calling the auth-gated `api.documentPublish.requestPublish` succeeds.
- Base URL precedent: `process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? \`https://${process.env.VERCEL_URL}\` : "http://localhost:3000")`.
- `CONVEX_INTERNAL_SECRET` is an established Next-side env var (read by `bulk-analyze`, `cadence-compose`, `meeting-prep-respond`, and the P1 `documents/generate` route).
- Chat tool registration (confirmed in P-research): append the `AtomicTool` to `ANALYSIS_TOOLS` in `src/lib/tools/domains/analysis.tools.ts` (reuse `domain:"document"`); add a handler to the `handlers` map in `src/lib/tools/executor.ts`; add the name to `GLOBAL_WRITE_TOOLS` in `src/lib/tools/registry.ts`. `requiresConfirmation:true` routes it through the chat confirmation flow automatically.

**Implementer prerequisites:**
- App root: `/Users/cowboy/rockcap/rockcap-v2/model-testing-app/`. Skills/refs under `/Users/cowboy/rockcap/rockcap-v2/skills/`.
- Chat-tool handlers are not unit-tested in this repo (no mocks; verified by build + the live chat flow). Task 1 is build-verified + manual e2e.
- Commit after each task with the given message. Do NOT push, amend, or switch branches (`claude/ch-group-charges`).

---

### Task 1: The `generateDocument` chat tool

**Files:**
- Modify: `src/lib/tools/domains/analysis.tools.ts` (append one `AtomicTool` to `ANALYSIS_TOOLS`)
- Modify: `src/lib/tools/executor.ts` (add one handler to the `handlers` map)
- Modify: `src/lib/tools/registry.ts` (add the name to `GLOBAL_WRITE_TOOLS`)

- [ ] **Step 1: Add the AtomicTool definition**

Append this object to the `ANALYSIS_TOOLS` array in `src/lib/tools/domains/analysis.tools.ts` (before the closing `];`):

```ts
  {
    name: "generateDocument",
    domain: "document",
    action: "write",
    description:
      "Generate a formatted document (PDF + DOCX) from composed HTML content and stage it for operator approval. Use this for ad-hoc document requests like 'generate a one-pager on {company}'. YOU compose the document body as semantic HTML (headings, paragraphs, tables) grounded in real data — do NOT include <html>/<head>/<style>; house styling is applied automatically. On approval the document is filed to the client's library. Requires user confirmation.",
    parameters: {
      type: "object",
      properties: {
        contentHtml: {
          type: "string",
          description:
            "The document body as semantic HTML (e.g. <h1>, <h2>, <p>, <table>). No <html>/<head>/<style> wrappers — house-style CSS is applied by the renderer. Ground every figure in real data; never fabricate.",
        },
        title: {
          type: "string",
          description: "Document title, e.g. 'Mackenzie Miller Homes — Company One-Pager'. Used in the file and as the file name stem.",
        },
        docType: {
          type: "string",
          description: "The kind of document, e.g. 'Company One-Pager', 'Lender Submission Pack'. Stored as the document's detected type.",
        },
        category: {
          type: "string",
          description: "Filing category. Defaults to 'Generated' if omitted.",
        },
        summary: {
          type: "string",
          description: "One-line operator-facing description shown in the approvals queue. Defaults to the title.",
        },
        formats: {
          type: "array",
          description: "Output formats. Defaults to both ['pdf','docx'].",
          items: { type: "string", description: "pdf or docx" },
        },
        clientId: {
          type: "string",
          description: "Client to file the document under on approval.",
        },
        projectId: {
          type: "string",
          description: "Project to associate (optional).",
        },
      },
      required: ["contentHtml", "title", "docType"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "documentPublish.requestPublish" },
    contextRelevance: ["document", "client", "project"],
  },
```

- [ ] **Step 2: Add the handler**

Add this entry to the `handlers` object in `src/lib/tools/executor.ts` (anywhere inside the object literal; place it near `saveChatDocument` for cohesion). It mirrors `saveChatDocument`'s `isConvexId` guard and uses the already-imported `api` and `Id`:

```ts
  generateDocument: async (params, client) => {
    // 1) Render via the isolated P1 route (keeps Chromium out of the chat bundle).
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const formats =
      Array.isArray(params.formats) && params.formats.length ? params.formats : ["pdf", "docx"];

    const res = await fetch(`${baseUrl}/api/documents/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-convex-internal-secret": process.env.CONVEX_INTERNAL_SECRET ?? "",
      },
      body: JSON.stringify({ contentHtml: params.contentHtml, title: params.title, formats }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Document render failed: ${res.status} ${detail}`);
    }
    const { files } = await res.json();
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("Document render returned no files");
    }

    // 2) Stage the document_publish approval as the operator (client is authenticated).
    const isConvexId = (v: unknown) => typeof v === "string" && /^[a-z0-9]{20,}$/i.test(v);
    const stageArgs: any = {
      title: params.title,
      docType: params.docType,
      category: params.category || "Generated",
      summary: params.summary || params.title,
      files,
      isBaseDocument: true,
    };
    if (isConvexId(params.clientId)) stageArgs.relatedClientId = params.clientId as Id<"clients">;
    if (isConvexId(params.projectId)) stageArgs.relatedProjectId = params.projectId as Id<"projects">;

    const { approvalId } = await client.mutation(api.documentPublish.requestPublish, stageArgs);

    return {
      approvalId,
      formats: files.map((f: any) => f.format),
      message: `Drafted "${params.title}" (${files
        .map((f: any) => f.format)
        .join(" + ")}). Review and approve it in the Approvals queue to file it to the client.`,
    };
  },
```

- [ ] **Step 3: Disclose the tool in global context**

In `src/lib/tools/registry.ts`, add `"generateDocument"` to the `GLOBAL_WRITE_TOOLS` set:

```ts
const GLOBAL_WRITE_TOOLS = new Set([
  "createClient",
  "createProject",
  "createTask",
  "createReminder",
  "createEvent",
  "createNote",
  "createContact",
  "saveChatDocument",
  "generateDocument",
  "createMeeting",
  "extractMeetingFromText",
  "createFlag",
]);
```

(`domain:"document"` is already in `CLIENT_CONTEXT_DOMAINS` and `PROJECT_CONTEXT_DOMAINS`, so client/project contexts disclose it too. `requiresConfirmation:true` routes it through the pendingActions confirmation flow automatically — no other wiring needed.)

- [ ] **Step 4: Build**

Run: `npx next build`
Expected: compiles clean (the tool registry + executor typecheck; `Id<"clients">`/`Id<"projects">` resolve).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/domains/analysis.tools.ts src/lib/tools/executor.ts src/lib/tools/registry.ts
git commit -m "feat(docgen): generateDocument chat tool (render via P1 + stage via P2)"
```

---

### Task 2: House-style rule reference (controller-authored)

**Files:**
- Create: `skills/shared-references/document-house-style.md`

This is the soft "voice + format" guardrail the `document-author` skill loads for every generated document. Author a reference (not a placeholder) covering:
- **Voice:** RockCap's document register — precise, evidence-led, no marketing fluff; UK English; never state a figure without grounding (cite the source/derivation in-text where natural). Cross-reference `rockcap-outreach-voice.md` for tone consistency but note documents are more formal than outreach emails.
- **HTML composition rules for `contentHtml`:** semantic HTML only (`<h1>` title, `<h2>` sections, `<p>`, `<table>` for figures, `<span class="label">` for monospace labels); NO inline styles / `<style>` / `<html>` wrappers (the renderer wraps in house CSS); keep one `<h1>`.
- **Structure defaults:** title (h1) → a one-line standfirst → sections (h2). Tables for any 3+ figure set. Dates as `DD Mon YYYY`. Money as `£X.Xm` / `£XXk`.
- **Hard prohibitions:** never fabricate figures, never invent track record, never state a GDV/loan/value not present in the gathered data; if a fact is missing, omit it or mark it explicitly as "not on file" rather than guessing.

- [ ] **Step 1: Author the reference** (full content per the above; no TODOs).
- [ ] **Step 2: Commit**

```bash
git add skills/shared-references/document-house-style.md
git commit -m "docs(docgen): document house-style shared reference"
```

---

### Task 3: Company one-pager guardrail reference (controller-authored)

**Files:**
- Create: `skills/shared-references/doc-type-company-one-pager.md`

The first doc-type guardrail — the "hard structure as prose" for a company one-pager (until template-fill exists in v2). Author covering:
- **Purpose:** a single-page brief on a company/prospect for internal use or a warm intro.
- **Required sections (in order):** (1) Header — company name + one-line standfirst (what they do + where); (2) Snapshot — a table: incorporation, company number, directors/PSCs, registered office; (3) Track record / activity — recent schemes or charges if known (cite); (4) Financial signals — any GDV/loan/lender facts on file (cite, never invent); (5) Why relevant to RockCap — one short paragraph grounded in the data.
- **Length:** fits one A4 page; omit sections with no data rather than padding.
- **Data sources the skill should pull from** (via `getDeepContext`): CH profile + charges, intelligence, track record, contacts.
- **What to avoid:** speculation about deals, unverified valuations, generic boilerplate.

- [ ] **Step 1: Author the reference** (full content; no TODOs).
- [ ] **Step 2: Commit**

```bash
git add skills/shared-references/doc-type-company-one-pager.md
git commit -m "docs(docgen): company one-pager guardrail reference"
```

---

### Task 4: `document-author` SKILL.md (controller-authored)

**Files:**
- Create: `skills/skills/document-author/SKILL.md`

Author following the v2 hardened template (the 11 sections listed in `skills/skills/README.md` "Skill-side conventions"). Content specifics for document-author:
- **Header:** what it does — generate a formatted document about an entity, gated by approval, filed to the client. Last hardening date 2026-05-29 (v1).
- **Trigger:** (1) chat agent surfaces it via `searchSkills` on a doc request ("generate me a {docType} on {entity}"); (2) a future parent skill (terms-package-build etc.) invokes it. v1 surface = chat.
- **Inputs:** entity (clientId or name to resolve), docType (default "Company One-Pager"), optional mentionPoints.
- **Dedup:** `dedupKey: docauthor:${clientId}:${docType}:${YYYY-MM-DD}`, window 1 day.
- **Cadence package:** does NOT produce one.
- **Outputs:** a `document_publish` approval (via the `generateDocument` tool → `documentPublish.requestPublish`); on approval, client-filed `documents` rows. A `skillRun` envelope.
- **High-level workflow:** (1) resolve entity → clientId; (2) `skillRun.start` with dedup; (3) `client.getDeepContext` (data); (4) load `../../shared-references/document-house-style.md` + the doc-type guardrail (`doc-type-company-one-pager.md`); (5) compose the body as semantic HTML within those rules, citing real figures; (6) call the `generateDocument` tool with `{contentHtml, title, docType, category:"Generated", clientId}`; (7) tell the operator it's staged for approval; (8) `skillRun.complete` with the approvalId + gaps.
- **Style rules:** defer to the house-style + guardrail refs; cite every figure; omit-don't-fabricate.
- **Tool dependencies:** `client.getDeepContext`, `skillRun.start/complete` (MCP); `generateDocument` (chat tool). Note the MCP exposure of generateDocument is deferred to v3 — v1 runs on the chat surface.
- **What goes wrong:** entity unresolved (ask); thin data (compose with what's there, mark gaps, never invent); render failure (the tool throws → surface to operator); no client match (stage unfiled / ask).
- **References:** the two new shared-references.

- [ ] **Step 1: Author the SKILL.md** (full content per the above; no TODOs).
- [ ] **Step 2: Commit**

```bash
git add skills/skills/document-author/SKILL.md
git commit -m "docs(docgen): document-author guiding skill (v1)"
```

---

### Task 5: Update the skills index

**Files:**
- Modify: `skills/skills/README.md`

Per the repo's discoverability rule (CLAUDE.md), reflect the new skill + references:
- Add `document-author/` to the maturity status table (status: **v1**, last hardening 2026-05-29).
- Add it to the "deal lifecycle" / parallel-systems mapping as a foundational document-generation skill the deal-doc skills (terms-package-build, ic-paper-drafter, case-study-author) will later build on.
- Add the two new references to the `../shared-references/` bullet list in the "Sub-skills + corpora + templates" section.

- [ ] **Step 1: Make the edits** (no TODOs; real table row + bullets).
- [ ] **Step 2: Commit**

```bash
git add skills/skills/README.md
git commit -m "docs(docgen): index document-author skill + references"
```

---

### Task 6: Build gate + end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Build gate**

Run: `npx convex dev --once && npx next build`
Expected: both pass clean.

- [ ] **Step 2: Manual end-to-end (operator)**

With the dev server running, `CONVEX_INTERNAL_SECRET` + `NEXT_PUBLIC_APP_URL` (or localhost default) set, and Gmail-style env not required:
1. In the chat assistant, in a client context (or naming a real client), ask: "generate a one-pager on {that client}".
2. The agent (via `document-author`) composes HTML and calls `generateDocument`; confirm the chat shows the **confirmation prompt**; confirm it.
3. The handler renders + stages — chat reports the approval is staged.
4. Open `/approvals` → the `document_publish` row appears with a **View PDF** link → preview the rendered one-pager → **Approve**.
5. Confirm the badge flips to **Filed** and the document appears in that client's **Documents** library.
6. Try a **Reject** on another → confirm no documents row is created.

(If the live chat path is impractical in the environment, the build gate + P1/P2's verified paths cover the mechanics; note the e2e as operator-deferred.)

---

## Self-review checklist (run before handoff)

- [ ] **Spec coverage:** chat tool (renders via P1 + stages via P2) ✓; guiding skill composes-within-rules ✓; prose guardrails (house-style + one doc-type) ✓; loop closes (chat → approval → filed) ✓.
- [ ] **Type/contract consistency:** `generateDocument` params → `requestPublish` args (`files` shape from the P1 route matches the `FILE` validator; `relatedClientId`/`relatedProjectId` only when a real Convex id); the skill passes `contentHtml` as semantic HTML (no wrappers, matching the renderer's expectation).

## Known deferrals (documented)

- **MCP exposure of `generateDocument`** is v3 (v1 is chat-surface only). The operator-agent (Claude Code via MCP) cannot invoke it yet.
- **Structured rule validation** remains v2+ (v1 guardrails are prose, enforced by the model + the operator preview).
- The orphaned-blob-on-reject deferral from P2 still stands.

## Done when

`npx convex dev --once` + `npx next build` are green, and a chat "generate a one-pager on {client}" request flows through confirmation → render → a previewable `document_publish` approval → on approve, a client-filed document. That is v1 of the document-generation substrate complete.
