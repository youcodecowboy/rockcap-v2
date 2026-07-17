import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { PREDICATES } from "./knowledge/vocabulary";

// MCP server (BL-5.1).
// HTTP endpoint that speaks the Model Context Protocol over JSON-RPC.
// Authenticated by per-user bearer tokens minted via convex/mcpTokens.ts.
// Hosted as Convex HTTP actions (no Next.js bridge per ADR / confirmed decision).
//
// Protocol methods supported in v1:
//   - initialize          (handshake)
//   - tools/list          (return the tool catalogue)
//   - tools/call          (invoke a tool with arguments)
//   - notifications/initialized (acknowledged silently)
//
// Tool catalogue: a curated subset of the app's atomic tools, exposed by
// name. Read-only tools that do not need user-context propagation. The
// only write exposed in v1 is approval.create, which routes new
// approvals into the queue for human review.

const PROTOCOL_VERSION = "2024-11-05";

type ToolHandler = (
  ctx: any,
  userId: any,
  args: any,
) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: ToolHandler;
}

// ── Tool helpers ─────────────────────────────────────────────

function asText(result: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      { type: "text", text: JSON.stringify(result, null, 2) },
    ],
  };
}

// Cap on how many atom ids a single retrievalLog batch records (spec §10).
const RETRIEVAL_LOG_CAP = 100;

// Chunk text cap in the atoms.search tool response — full text stays in the
// documentChunks row; the tool trims to keep the response bounded and marks
// the cut with `truncated: true`. 2,200 chars covers a full target-size chunk
// (~320 words ≈ 2,000 chars, chunker.ts TARGET_WORDS) — the earlier 700-char
// cap ate the operative clause in 5/12 prose eval questions where the right
// chunk ranked #1. Worst case stays bounded: 20 chunks (CHUNK_LIMIT_MAX) ×
// 2.2K = 44K chars.
const CHUNK_TEXT_CAP = 2200;

/** Gather the atom ids a graph.expandEntity result actually surfaced — edge
 * provenance refs (atom-lane only; native refs are table names and are
 * dropped downstream by normalizeId anyway) plus attribute / ring-attribute
 * atom ids. Used to feed retrievalLog fire-and-forget. */
function collectExpandAtomIds(result: unknown): string[] {
  const ids = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = result as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addEdge = (e: any) => {
    if (e?.provenance?.sourceType !== "native" && typeof e?.provenance?.ref === "string") {
      ids.add(e.provenance.ref);
    }
  };
  (r?.edges ?? []).forEach(addEdge);
  (r?.interEdges ?? []).forEach(addEdge);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (r?.attributes ?? []).forEach((a: any) => {
    if (typeof a?.atomId === "string") ids.add(a.atomId);
  });
  for (const rows of Object.values(r?.ringAttributes ?? {})) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (rows as any[]) ?? []) {
      if (typeof a?.atomId === "string") ids.add(a.atomId);
    }
  }
  return [...ids].slice(0, RETRIEVAL_LOG_CAP);
}

// ── Tool catalogue ───────────────────────────────────────────

const TOOLS: McpTool[] = [
  // Client domain
  {
    name: "client.list",
    description:
      "List clients with optional filters. Returns active prospects and clients by default. Use status='prospect' for cold prospects, status='active' for engaged clients, type='lender' or type='borrower' to filter by role.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "prospect / active / archived / past" },
        type: { type: "string", description: "lender / borrower / developer" },
      },
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.clients.list, args ?? {});
      return asText(result);
    },
  },
  {
    name: "client.get",
    description:
      "Get a single client by id. Returns the full client row including status, type, companyName, and metadata.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.clients.get, { id: args.id });
      return asText(result);
    },
  },
  {
    name: "client.getStats",
    description:
      "Get aggregate stats for a client: project count, document count, last activity. Useful for at-a-glance health checks.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" } },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.clients.getStats, { clientId: args.clientId });
      return asText(result);
    },
  },

  // ── Outreach-ready gate (2026-05-30) ──
  // The operator "accept → ready for outreach" gate. prospect-intel is now
  // intel-only; it never drafts. The operator reviews the intel and marks the
  // prospect ready (sets outreachReadyAt). Then the outreach-draft skill drafts
  // the cadence package for ready prospects. These tools are the agent-side
  // surface of that gate. See skills/skills/prospect-pipeline-gates.md.
  {
    name: "client.markOutreachReady",
    description:
      "Accept a prospect's intel and mark it READY FOR OUTREACH. This is the operator gate between prospect-intel (intel-only) and outreach-draft (drafts the cadence package). Guard: rejects with `no_completed_intel_run` if no completed prospect-intel run exists for the client — you accept intel that exists. Idempotent (re-marking preserves the original accept timestamp). Does NOT draft anything and does NOT change prospectState or HubSpot lifecycle; it only sets outreachReadyAt/outreachReadyBy. Normally the operator clicks the UI accept button; use this tool only when explicitly asked to mark a prospect ready from the agent side.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string", description: "Convex id of the prospect clients row" } },
      required: ["clientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.clients.markOutreachReadyInternal, {
        clientId: args.clientId,
        userId,
      });
      return asText(result);
    },
  },
  {
    name: "client.clearOutreachReady",
    description:
      "Clear the ready-for-outreach flag on a prospect (the 'unmark' action). Meaningful only pre-draft; once a prospect is drafted, readiness is moot (it has left the pool). Idempotent.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string", description: "Convex id of the prospect clients row" } },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.clients.clearOutreachReadyInternal, {
        clientId: args.clientId,
      });
      return asText(result);
    },
  },
  {
    name: "client.listOutreachReady",
    description:
      "List prospects that are READY FOR OUTREACH but NOT YET DRAFTED (outreachReadyAt is set AND prospectState is still `researched`). This is exactly the pool the outreach-draft skill enumerates when the operator says 'draft all outreach for ready companies'. Drafted prospects drop out automatically (outreach-draft advances them past `researched`), so re-running the batch never double-drafts. Returns whole client rows.",
    inputSchema: { type: "object", properties: {} },
    handler: async (ctx, _userId, _args) => {
      const result = await ctx.runQuery(api.clients.listOutreachReady, {});
      return asText(result);
    },
  },

  // Project domain (the operational Deal table per ADR-0001)
  {
    name: "project.list",
    description:
      "List projects with optional client and status filters. Each project represents one transaction attempt. Use this when looking for active deals.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string" },
        status: { type: "string", description: "active / inactive / completed / on-hold / cancelled" },
      },
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.projects.list, args ?? {});
      return asText(result);
    },
  },
  {
    name: "project.get",
    description: "Get a single project by id. Returns the full row including dealPhase, status, address, and metadata.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.projects.get, { id: args.id });
      return asText(result);
    },
  },
  {
    name: "project.getByClient",
    description: "List projects belonging to a specific client.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" } },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.projects.getByClient, { clientId: args.clientId });
      return asText(result);
    },
  },
  {
    name: "project.getStats",
    description: "Get aggregate stats for a project: document count, checklist progress, model run count.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.projects.getStats, { projectId: args.projectId });
      return asText(result);
    },
  },

  // Contact domain
  {
    name: "contact.getByClient",
    description: "List contacts associated with a specific client.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" } },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.contacts.getByClient, { clientId: args.clientId });
      return asText(result);
    },
  },
  {
    name: "contact.get",
    description: "Get a single contact by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.contacts.get, { id: args.id });
      return asText(result);
    },
  },
  {
    name: "contact.create",
    description:
      "Create a new contact row. Use when prospect-intel / qualify-and-draft discovers a person (director, BDM, primary contact) who isn't yet in the system. Pass `name` (required) plus any of role/email/phone/company/notes. Link it by passing clientId, projectId, and/or linkedCompanyIds (Convex companies ids — also back-links the contact onto those companies). Email verification metadata (v1.2.4): when email comes from Apollo, pass emailStatus (e.g. 'verified'/'unverified') + emailSource='apollo'; when manually entered, leave both undefined (the cadence guard treats undefined as operator-entered/presumed-valid). Returns the new contactId — feed it to clients.setProspectFacts({primaryContactId}) or cadence.create({contactId}).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name (required)" },
        role: { type: "string", description: "e.g. 'Director', 'BDM'" },
        email: { type: "string" },
        emailStatus: { type: "string", description: "Apollo verification status: verified / unverified / questionable / unavailable. Omit for manually-entered emails." },
        emailSource: { type: "string", description: "'apollo' when sourced from apollo.findEmail; omit for manual entry." },
        phone: { type: "string" },
        company: { type: "string", description: "Free-text company name (display only)" },
        notes: { type: "string" },
        clientId: { type: "string", description: "Convex id of the client to link this contact to directly" },
        projectId: { type: "string", description: "Convex id of the project to link this contact to" },
        sourceDocumentId: { type: "string", description: "Convex id of the document this contact was extracted from, if any" },
        linkedCompanyIds: { type: "array", items: { type: "string" }, description: "Convex companies ids to associate (also back-links the contact onto each company)" },
      },
      required: ["name"],
    },
    handler: async (ctx, _userId, args) => {
      const contactId = await ctx.runMutation(api.contacts.create, {
        name: args.name,
        role: args.role,
        email: args.email,
        emailStatus: args.emailStatus,
        emailSource: args.emailSource,
        phone: args.phone,
        company: args.company,
        notes: args.notes,
        clientId: args.clientId,
        projectId: args.projectId,
        sourceDocumentId: args.sourceDocumentId,
        linkedCompanyIds: args.linkedCompanyIds,
      });
      return asText({ status: "created", contactId });
    },
  },
  {
    name: "contact.update",
    description:
      "Update an existing contact by id. Pass `id` (required) plus any subset of name/role/email/phone/company/notes to patch — omitted fields are left unchanged. To re-link to a different client pass clientId; to unlink from any client pass clientId=null. Common use: persisting an email discovered via apollo.findEmail (contact.update({id, email})) so a subsequent cadence.create passes the email guard.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Convex id of the contact to update (required)" },
        name: { type: "string" },
        role: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        company: { type: "string" },
        notes: { type: "string" },
        clientId: { type: "string", description: "Convex client id to (re)link to. Pass null to unlink from any client." },
      },
      required: ["id"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(api.contacts.update, {
        id: args.id,
        name: args.name,
        role: args.role,
        email: args.email,
        phone: args.phone,
        company: args.company,
        notes: args.notes,
        clientId: args.clientId,
      });
      return asText({ status: "updated", contactId: result });
    },
  },

  // Intelligence domain
  {
    name: "intelligence.getClientIntelligence",
    description:
      "Get structured intelligence for a client: identity, key people, lender profile, borrower profile, evidence trail. Returns the canonical singleton.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" } },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.intelligence.getClientIntelligence, {
        clientId: args.clientId,
      });
      return asText(result);
    },
  },
  {
    name: "intelligence.getProjectIntelligence",
    description:
      "Get structured intelligence for a project: overview, location, financials, timeline, development, key parties.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.intelligence.getProjectIntelligence, {
        projectId: args.projectId,
      });
      return asText(result);
    },
  },
  {
    name: "intelligence.searchLenders",
    description:
      "Search the lender database against a deal profile. Useful for producing a lender shortlist. All filters are optional.",
    inputSchema: {
      type: "object",
      properties: {
        dealSize: { type: "number", description: "facility size in GBP" },
        propertyType: { type: "string", description: "residential / commercial / mixed_use / etc." },
        loanType: { type: "string", description: "bridging / development / term / etc." },
        region: { type: "string" },
      },
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.intelligence.searchLenders, args ?? {});
      return asText(result);
    },
  },

  // Touchpoint domain (unified exchange ledger from BL-4.9)
  {
    name: "touchpoint.getByContact",
    description: "Get touchpoints for a contact, most recent first. Useful for relationship history before a meeting or reachout.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        limit: { type: "number" },
      },
      required: ["contactId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.touchpoints.getByContact, {
        contactId: args.contactId,
        limit: args.limit,
      });
      return asText(result);
    },
  },
  {
    name: "touchpoint.getByProject",
    description: "Get touchpoints for a project. Useful for deal-context summaries and chase decisions.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        limit: { type: "number" },
      },
      required: ["projectId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.touchpoints.getByProject, {
        projectId: args.projectId,
        limit: args.limit,
      });
      return asText(result);
    },
  },
  {
    name: "touchpoint.getByClient",
    description: "Get touchpoints for a client. Returns recent activity across all projects with that client.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string" },
        limit: { type: "number" },
      },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.touchpoints.getByClient, {
        clientId: args.clientId,
        limit: args.limit,
      });
      return asText(result);
    },
  },

  // Knowledge checklist (per the canonical document checklist from BL-1.5)
  {
    name: "checklist.getByProject",
    description:
      "Get the document checklist for a project. Returns all knowledgeChecklistItems with status, priority, isBlocking, rockcapStatus, lenderStatus.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.knowledgeLibrary.getChecklistByProject, {
        projectId: args.projectId,
      });
      return asText(result);
    },
  },
  {
    name: "checklist.getByClient",
    description: "Get the client-level checklist for a client. Returns the KYC and account-level requirements.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" } },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.knowledgeLibrary.getChecklistByClient, {
        clientId: args.clientId,
      });
      return asText(result);
    },
  },

  // Meetings
  {
    name: "meeting.getByProject",
    description: "Get meetings linked to a project, most recent first.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        limit: { type: "number" },
      },
      required: ["projectId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.meetings.getByProject, {
        projectId: args.projectId,
        limit: args.limit,
      });
      return asText(result);
    },
  },
  {
    name: "meeting.getByClient",
    description: "Get meetings linked to a client across all projects.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string" },
        limit: { type: "number" },
      },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.meetings.getByClient, {
        clientId: args.clientId,
        limit: args.limit,
      });
      return asText(result);
    },
  },

  // Approvals (the only write exposed in v1)
  {
    name: "approval.create",
    description:
      "Create a new approval request for human review. Use this when a skill produces output that needs human sign-off before action (drafted email, document, HubSpot write, etc.). The caller MUST set entityType correctly, supply a clear summary, and structure draftPayload per the entity type. Returns approvalId.",
    inputSchema: {
      type: "object",
      properties: {
        entityType: {
          type: "string",
          description:
            "gmail_send / hubspot_write / document_publish / lender_outreach / client_communication / skill_action / cadence_fire / other",
        },
        summary: { type: "string", description: "One-line description for the approval queue UI" },
        draftPayload: { type: "object", description: "Entity-type-specific payload per shared-references/approval-payload-shapes.md" },
        entityRefId: { type: "string" },
        requestSourceName: { type: "string", description: "Skill or job name that originated this approval" },
        relatedClientId: { type: "string" },
        relatedProjectId: { type: "string" },
        relatedContactId: { type: "string" },
        expiresAt: { type: "string" },
      },
      required: ["entityType", "summary", "draftPayload"],
    },
    handler: async (ctx, userId, args) => {
      const approvalId = await ctx.runMutation(internal.approvals.internalCreate, {
        entityType: args.entityType,
        summary: args.summary,
        draftPayload: args.draftPayload,
        entityRefId: args.entityRefId,
        requestedBy: userId,
        requestSource: "skill",
        requestSourceName: args.requestSourceName,
        relatedClientId: args.relatedClientId,
        relatedProjectId: args.relatedProjectId,
        relatedContactId: args.relatedContactId,
        expiresAt: args.expiresAt,
      });
      return asText({ approvalId, message: "Approval created. Awaits human review in /approvals." });
    },
  },

  // Skill execution lifecycle (BL-5.x; see spec
  // docs/superpowers/specs/2026-05-23-prospect-intel-level-a-hardening-design.md)
  {
    name: "skillRun.start",
    description:
      "Begin a skill execution. Creates a skillRuns row, returns runId. If dedupKey + dedupWindowDays are provided and a prior complete/complete_with_gaps run exists within the window for the same skill+dedupKey, returns status=duplicate_found with the prior run summary so the caller can surface it to the operator before continuing.",
    inputSchema: {
      type: "object",
      properties: {
        skillName: { type: "string", description: "e.g., 'prospect-intel'" },
        input: { type: "object", description: "Raw args the skill received" },
        trigger: { type: "string", description: "Free-form context, e.g., 'planning hit on Mulberry'" },
        dedupKey: { type: "string", minLength: 1, description: "Normalised identifier per the skill's ## Dedup section (e.g., a resolved Companies House number)" },
        dedupWindowDays: { type: "number", minimum: 1, maximum: 365, description: "Lookback window in days for the dedup check (typically 7)" },
      },
      required: ["skillName", "input"],
    },
    handler: async (ctx, userId, args) => {
      // Dedup check (only if both key + window supplied AND key is non-empty)
      if (args.dedupKey && args.dedupWindowDays) {
        const windowMs = args.dedupWindowDays * 24 * 60 * 60 * 1000;
        const cutoffMs = Date.now() - windowMs;
        const priorResult = await ctx.runQuery(internal.skillRuns.findRecentByDedupKeyInternal, {
          skillName: args.skillName,
          dedupKey: args.dedupKey,
          cutoffMs,
        });
        if (priorResult?.kind === "completed") {
          const priorRun = priorResult.row;
          const ageHours = (Date.now() - priorRun._creationTime) / (1000 * 60 * 60);
          return asText({
            status: "duplicate_found",
            priorRunId: priorRun._id,
            priorRunBrief: priorRun.brief ?? "",
            priorRunAgeHours: Math.round(ageHours * 10) / 10,
          });
        }
        if (priorResult?.kind === "in_flight") {
          const priorRun = priorResult.row;
          const ageMinutes = (Date.now() - priorRun._creationTime) / (1000 * 60);
          return asText({
            status: "already_running",
            priorRunId: priorRun._id,
            priorRunOwnerId: priorRun.userId,
            priorRunStartedAgoMinutes: Math.round(ageMinutes * 10) / 10,
          });
        }
      }
      const runId = await ctx.runMutation(internal.skillRuns.createInternal, {
        skillName: args.skillName,
        userId,
        input: args.input,
        trigger: args.trigger,
        dedupKey: args.dedupKey,
        dedupWindowDays: args.dedupWindowDays,
        status: "running",
      });
      return asText({ status: "created", runId });
    },
  },

  {
    name: "skillRun.complete",
    description:
      "Close a skill execution. Sets status (complete / complete_with_gaps / failed / cancelled), persists the narrative brief, records linked entities and the structured gaps + errors arrays. Sets completedAt and computes durationMs. Validates that the runId belongs to the calling user.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string", description: "The runId returned by skillRun.start" },
        status: {
          type: "string",
          description: "complete / complete_with_gaps / failed / cancelled",
        },
        brief: { type: "string", description: "Two-paragraph narrative summary, per CONVENTIONS voice rules. Operator-facing TL;DR." },
        intelMarkdown: {
          type: "string",
          description: "Full markdown intel report — rendered by the /prospects/[id] Intel tab. Separate from brief: this is the long-form artefact with sections (Identity, Online Presence, Key People, Lender DNA, Track Record, Recent Signals, Recommended Approach, Sources). Hardened skills (prospect-intel v2, qualify-and-draft, lender-intel) populate this; legacy skills can omit.",
        },
        structureGraph: {
          type: "object",
          description: "Corporate StructureGraph to persist on the run (optional). Shape per src/lib/structure/types.ts { subjectClientId, asOf, nodes[], edges[], verdict }. Rendered as the structure chart in the prospect Intel tab.",
        },
        linkedClientId: { type: "string" },
        linkedProjectId: { type: "string" },
        linkedApprovalIds: { type: "array", items: { type: "string" } },
        revalidateResult: {
          type: "string",
          description: "intel-revalidate verdict: 'still_valid' | 'materially_changed'. Only for intel-revalidate runs; denormalized onto clients.lastIntelResult.",
        },
        gaps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", description: "missing_tool / thin_reference / ui_gap / schema_gap / other" },
              description: { type: "string" },
              suggestedFix: { type: "string" },
            },
            required: ["kind", "description"],
          },
        },
        errors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              step: { type: "string" },
              message: { type: "string" },
            },
            required: ["step", "message"],
          },
        },
      },
      required: ["runId", "status"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.skillRuns.completeInternal, {
        runId: args.runId,
        userId,
        status: args.status,
        brief: args.brief,
        intelMarkdown: args.intelMarkdown,
        structureGraph: args.structureGraph,
        linkedClientId: args.linkedClientId,
        linkedProjectId: args.linkedProjectId,
        linkedApprovalIds: args.linkedApprovalIds,
        revalidateResult: args.revalidateResult,
        gaps: args.gaps,
        errors: args.errors,
      });
      return asText(result);
    },
  },

  // Cadence lifecycle (cadence-fire v1; see spec
  // docs/superpowers/specs/2026-05-23-cadence-fire-autonomy-engine-design.md)
  {
    name: "cadence.create",
    description:
      "Queue a cadence row that the dispatcher will fire at nextDueAt. For gauntlet-mode pre-drafted packages (prospect-intel uses this), set packageId + packageOrder + preDraftedTouch together. For recurring cadences (e.g., BDM relationship maintenance), set scheduleConfig.intervalDays and omit preDraftedTouch (v1 ships pre-drafted only; recurring composition lands in v1.1). contactId is OPTIONAL (Phase 3): omit it to create a held 'needs_contact' draft — the touch is composed and reviewable on the board but is forced inactive and the dispatcher will never fire it until a verified contact is attached. With contactId present, the v1.2.4 email guard still applies (refuses contacts with no/bad email).",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Convex id of the target contact. OPTIONAL: omit to create a contactless held 'needs_contact' draft (reviewable but never fired until a contact is attached)." },
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
      required: ["cadenceType", "nextDueAt", "scheduleConfig", "isActive"],
    },
    handler: async (ctx, userId, args) => {
      // Phase 3: contactless path. When no contactId is supplied, skip the
      // email guard entirely and create a held "needs_contact" draft. The
      // createInternal mutation forces isActive: false +
      // packageApprovalStatus: "needs_contact" + needsContact: true, so the
      // dispatcher (findDueInternal filters isActive=true AND approved) can
      // never fire it. The draft is reviewable on the board; the operator
      // attaches a contact to make it fireable.
      let warning: string | undefined;
      if (args.contactId) {
        // v1.2.4 email guard. Refuse to create cadences for contacts with no
        // email or with explicitly-bad emailStatus values. Surfaces the gap
        // at cadence-creation time (when the operator/skill can do something
        // about it) rather than at fire time (when the dispatcher would
        // silently skip or hit a deliverability wall).
        const contact = await ctx.runQuery(internal.contacts.getInternal, {
          contactId: args.contactId,
        });
        if (!contact) {
          return asText({
            status: "error",
            error: "contact_not_found",
            contactId: args.contactId,
          });
        }
        if (!contact.email || contact.email.trim() === "") {
          return asText({
            status: "error",
            error: "contact_has_no_email",
            contactId: args.contactId,
            contactName: contact.name,
            fix: "Run apollo.findEmail({firstName, lastName, companyName}) to discover, then contacts.update({contactId, email, emailStatus}) to persist before retrying this cadence.create call. Alternatively omit contactId to create a held 'needs_contact' draft for board review.",
          });
        }
        const bad = new Set(["questionable", "spam_trap", "invalid", "bounced"]);
        if (contact.emailStatus && bad.has(contact.emailStatus.toLowerCase())) {
          return asText({
            status: "error",
            error: "email_status_blocks_send",
            contactId: args.contactId,
            contactName: contact.name,
            email: contact.email,
            emailStatus: contact.emailStatus,
            fix: "Find an alternative email address (different contact at same company, or re-run apollo.findEmail with companyDomain hint) before sending to this contact.",
          });
        }
        // emailStatus = "verified" passes; undefined passes (assumed manually
        // entered + valid); "unverified" passes with a soft warning (the v1.1
        // cadence dispatcher will eventually surface verification status to
        // operators in the approvals UI).
        warning = contact.emailStatus === "unverified"
          ? "Contact email is unverified (Apollo or manual entry). Operator should confirm before package approval."
          : undefined;
      }

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
      // Phase 3: signal the held state back to the caller so the skill can
      // record a no_contact gap and surface "needs contact" to the operator.
      const needsContact = !args.contactId;
      return asText({
        status: "created",
        cadenceId,
        ...(needsContact ? { needsContact: true, packageApprovalStatus: "needs_contact" } : {}),
        ...(warning ? { warning } : {}),
      });
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

  // v1.3 — THE central operator workflow tool. Returns a one-shot snapshot
  // of everything about a prospect OR active client so Claude Code can
  // answer "where are we at with X?" without 10 separate reads. Works for
  // ANY clients-table row regardless of CRM state.
  {
    name: "prospect.getDeepContext",
    description:
      "Returns a comprehensive snapshot of any clients-table entity (prospect or active client). For prospects: contacts, cadences (active/fired/queued split), reply events (newest first), latest prospect-intel skillRun, CH profile + charges. For active clients: deals (active/all), projects (active/all), pending approvals. Always returns: identity, contacts, recent meetings (upcoming + past), touchpoints, clientIntelligence row. The `summary` block has an `entityFocus` field ('prospect' or 'active_client') so Claude Code knows which section counts matter most. Use this as the FIRST tool call when an operator asks about a specific entity. Subsequent narrower tool calls (reply.get, cadence.update, etc.) operate on data already in scope from the deep context return. v1.3 update: works for both prospects AND active clients with adaptive summary.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the clients row (prospect OR active client)" },
      },
      required: ["clientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.prospects.getDeepContext, {
        clientId: args.clientId,
      });
      if (!result) return asText({ error: "entity_not_found", clientId: args.clientId });
      return asText(result);
    },
  },

  // v1.3 — alias name for the same query, surfaced under client.* for
  // discoverability when working with active clients (operator says
  // "tell me about Bayfield Homes" → Claude Code naturally looks for
  // client.* tools). The query handler is shape-agnostic; returns the
  // same payload as prospect.getDeepContext.
  {
    name: "client.getDeepContext",
    description:
      "Alias of prospect.getDeepContext. Same query, surfaced under client.* for operator-side clarity when working with active clients. Returns identity + contacts + meetings + touchpoints + deals + projects + pending approvals + clientIntelligence + (when present) the prospect-flavour fields like cadences/replies/intel-run that survived from the prospect phase. The summary.entityFocus field tells you whether this entity is currently in prospect or active-client mode.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the clients row" },
      },
      required: ["clientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.prospects.getDeepContext, {
        clientId: args.clientId,
      });
      if (!result) return asText({ error: "client_not_found", clientId: args.clientId });
      return asText(result);
    },
  },

  // v1.3 Sprint F — lender substrate. Lenders are clients with type="lender";
  // appetite signals capture their preferences over time; matching scores
  // deals against current appetite. The headline tool is lender.matchForDeal —
  // produces the "Optimal lenders: X, Y, Z" recommendation Claude Code can
  // surface alongside prospect-intel's Recommended Approach section.
  {
    name: "lender.list",
    description:
      "List all lenders in the database (clients with type='lender'). Optionally filter by name substring. Use for 'show me all our lenders' or 'find the Octopus entry' type questions.",
    inputSchema: {
      type: "object",
      properties: {
        nameQuery: { type: "string", description: "Optional substring filter on name or companyName" },
        limit: { type: "number", description: "Default 100" },
      },
      required: [],
    },
    handler: async (ctx, userId, args) => {
      const rows = await ctx.runQuery(api.appetiteSignals.listLenders, {
        nameQuery: args.nameQuery,
        limit: args.limit ?? 100,
      });
      return asText(rows);
    },
  },

  {
    name: "lender.getDeepContext",
    description:
      "Comprehensive snapshot of a lender: identity + current appetite (all isCurrent=true signals as a fieldPath→value map) + recent appetite changes (last 90 days) + BDM contacts + projects where they appear in clientRoles + meetings (upcoming + past) + cadences (relationship maintenance) + pending approvals (lender-bound outreach). The summary block surfaces 'currentAppetiteFieldCount' so operator-agent knows how complete the appetite picture is. THE first tool to call when operator asks about a specific lender.",
    inputSchema: {
      type: "object",
      properties: { lenderClientId: { type: "string" } },
      required: ["lenderClientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.appetiteSignals.lenderGetDeepContext, {
        lenderClientId: args.lenderClientId,
      });
      if (!result) return asText({ error: "lender_not_found", lenderClientId: args.lenderClientId });
      return asText(result);
    },
  },

  {
    name: "lender.recordAppetite",
    description:
      "Record a new appetite signal for a lender. Each signal is (fieldPath, value, valueType, sourceType, asOfDate, confidence). Writing a new value for an existing (lender, fieldPath) automatically supersedes the prior — sets prior.isCurrent=false + supersededBy=<new id>, marks new.isCurrent=true. Standard fieldPaths (use these for matching to work): dealSize.min, dealSize.max, products.offered (array of LENDER product codes — bridging/development_finance/term/btl/mezzanine/commercial/land; this is the lender-side vocabulary, distinct from prospect deal-type codes, which lender.matchForDeal auto-maps onto it), propertyType.allowed (array: residential/commercial/mixed_use), geography.regions (array including 'uk_wide'), ltv.maximum (0-1), ltgdv.maximum (0-1), timeline.typicalWeeksToOffer (number). Custom fieldPaths are fine but won't contribute to matching scores unless lender.matchForDeal is extended to handle them.",
    inputSchema: {
      type: "object",
      properties: {
        lenderClientId: { type: "string" },
        fieldPath: { type: "string", description: "Standard path (see description) or custom <area>.<thing>" },
        value: { description: "The value — type per valueType (number/string/array/etc.)" },
        valueType: { type: "string", description: "number | currency | percentage | string | array | boolean | date" },
        sourceType: { type: "string", description: "bdm_meeting | lender_doc | publication | deal_behaviour | manual" },
        sourceRef: { type: "string", description: "Optional: meetingId / documentId / URL for traceability" },
        asOfDate: { type: "string", description: "ISO timestamp; defaults to now" },
        confidence: { type: "number", description: "0-1 confidence" },
        notes: { type: "string", description: "Optional free-text annotation" },
      },
      required: ["lenderClientId", "fieldPath", "value", "valueType", "sourceType"],
    },
    handler: async (ctx, userId, args) => {
      // MCP handlers have no Clerk session — use the internal variant with the
      // bearer-resolved userId (bug: was wired to the Clerk-authed public
      // mutation and threw "Unauthenticated" on every MCP call).
      const result = await ctx.runMutation(internal.appetiteSignals.recordInternal, {
        lenderClientId: args.lenderClientId,
        fieldPath: args.fieldPath,
        value: args.value,
        valueType: args.valueType,
        sourceType: args.sourceType,
        sourceRef: args.sourceRef,
        asOfDate: args.asOfDate ?? new Date().toISOString().slice(0, 10),
        confidence: args.confidence,
        notes: args.notes,
        userId,
      });
      return asText(result);
    },
  },

  {
    name: "lender.getAppetite",
    description:
      "Get current appetite for a lender as a fieldPath→value map. Returns only isCurrent=true signals. Use after lender.getDeepContext if you only need appetite (cheaper) OR when filtering by specific fields. Pass asMap=true (default) for the convenient map shape; asMap=false returns the raw array of signal rows including sourceType + asOfDate + confidence.",
    inputSchema: {
      type: "object",
      properties: {
        lenderClientId: { type: "string" },
        asMap: { type: "boolean", description: "Default true. If false, returns raw signal rows." },
      },
      required: ["lenderClientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.appetiteSignals.getCurrentForLender, {
        lenderClientId: args.lenderClientId,
        asMap: args.asMap ?? true,
      });
      return asText(result);
    },
  },

  {
    name: "lender.getAppetiteHistory",
    description:
      "Get full appetite history for a lender (current + superseded signals, newest first). Use to answer 'how has Octopus's max LTV changed over time?' or to audit signal sources. Optionally filter to one fieldPath for a single-dimension timeline.",
    inputSchema: {
      type: "object",
      properties: {
        lenderClientId: { type: "string" },
        fieldPath: { type: "string", description: "Optional: filter to one fieldPath" },
        limit: { type: "number", description: "Default unlimited" },
      },
      required: ["lenderClientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.appetiteSignals.getHistoryForLender, {
        lenderClientId: args.lenderClientId,
        fieldPath: args.fieldPath,
        limit: args.limit,
      });
      return asText(result);
    },
  },

  {
    name: "lender.matchForDeal",
    description:
      "THE headline matching tool. Given a deal's criteria (dealSize, dealType, assetClass, geography, ltv, ltgdv, timelineWeeks — all optional), returns a RANKED list of lenders with per-lender matchScore + matchReasons + fitConcerns + currentSignalsCount. Scoring: each matching dimension contributes +2 to +4 to score; each incompatible dimension subtracts -2 to -5. Lenders with zero appetite signals get score=0 + a note (uninformed match). Use right after prospect-intel produces its Recommended Approach section to compose 'Optimal lenders for this £X bridging deal: A (score 12 — reasons), B (score 9 — reasons)' answers.",
    inputSchema: {
      type: "object",
      properties: {
        criteria: {
          type: "object",
          properties: {
            dealSize: { type: "number", description: "GBP" },
            dealType: { type: "string", description: "Accepts EITHER a prospect canonical code (new_development | bridging | existing_asset | unclassifiable) OR a lender product code (bridging | development_finance | term | btl | mezzanine | commercial | land). Prospect codes are auto-mapped to lender products before matching (new_development→development_finance, existing_asset→term, bridging stays; unclassifiable→no match, dimension skipped). Scored against the lender's products.offered. See lender-matching-rules.md." },
            assetClass: { type: "string", description: "residential | commercial | mixed_use" },
            geography: { type: "string", description: "Region name; matches against lender's geography.regions" },
            ltv: { type: "number", description: "0-1; required loan-to-value" },
            ltgdv: { type: "number", description: "0-1; required loan-to-GDV" },
            timelineWeeks: { type: "number", description: "Weeks to indicative offer needed" },
          },
        },
        limit: { type: "number", description: "Default 10" },
      },
      required: ["criteria"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.appetiteSignals.matchForDeal, {
        criteria: args.criteria,
        limit: args.limit ?? 10,
      });
      return asText(result);
    },
  },

  {
    name: "lender.create",
    description:
      "Create OR UPSERT a lender record (a clients row with type='lender'). Three input modes (in priority order): (1) Pass `promoteFromCompanyId` (Convex id) to promote an existing companies-table row into a lender — auto-inherits name/website/etc. + marks the company as promoted + links any HubSpot-synced contacts to the new lender. (2) Pass `hubspotCompanyId` (string) when you only know the HubSpot id (e.g., reading off a contact's `hubspotCompanyIds[0]`) — skill resolves to Convex companies row + promotes. (3) Pass just `name` for naked creation. Mode 3 is now an UPSERT: before inserting it runs a conservative normalized-name match (lowercase, strip punctuation, drop trailing legal suffixes — equality only, never fuzzy) across every existing lender's name/companyName/aliases. On a match it patches that row instead of inserting (unions `aliases` + `sourceDocumentIds`, appends a dated note line, fills missing website/companyName/country) and returns `deduped:true` with the EXISTING `lenderClientId` — so a document-ingestion wave that re-encounters 'Funding 365' / 'Downing LLP' collapses onto the first row rather than duplicating it. Pass `aliases` (known alternate names) and `sourceDocumentIds` (evidence) so the roster self-heals. After create, call `lender.recordAppetite` repeatedly + `lender.setSubmissionRequirements` to populate substrate. Common patterns: (A) after BDM meeting on a known HubSpot lender → mode 2 + `lender.recordAppetite × N`; (B) lender with rich HubSpot doc evidence → mode 1; (C) cold-add / roster a lender from a document → mode 3 with aliases + sourceDocumentIds. To collapse EXISTING duplicate lender rows, use `lender.merge`.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Lender name (e.g., 'Shawbrook Bank'). REQUIRED for mode 3; OPTIONAL for modes 1/2 (defaults to the source company's name when promoting)." },
        promoteFromCompanyId: { type: "string", description: "Mode 1: Convex id of an existing companies row to promote. Read from contact.linkedCompanyIds[0] when working off a HubSpot-synced contact." },
        hubspotCompanyId: { type: "string", description: "Mode 2: HubSpot company id (string) when you only have the HubSpot id. Skill resolves to Convex companies row before promoting. Read directly from contact.hubspotCompanyIds[0]." },
        companyName: { type: "string", description: "Optional legal name if different from name" },
        notes: { type: "string", description: "Optional: 1-2 sentence summary of who they are" },
        website: { type: "string" },
        email: { type: "string", description: "General contact email if known" },
        phone: { type: "string" },
        country: { type: "string", description: "Default 'United Kingdom'" },
        aliases: { type: "array", items: { type: "string" }, description: "Mode 3 only: alternate names this lender is known by (registered-company variants, brand names). Feeds the dedup match here AND the knowledge-layer lender matcher. Unioned onto an existing row on dedup." },
        sourceDocumentIds: { type: "array", items: { type: "string" }, description: "Mode 3 only: Convex document ids that evidenced this lender (provenance). Unioned onto an existing row on dedup." },
      },
      required: [],
    },
    handler: async (ctx, userId, args) => {
      // Mode resolution: promoteFromCompanyId > hubspotCompanyId > name-only
      let convexCompanyId: string | undefined = args.promoteFromCompanyId;

      if (!convexCompanyId && args.hubspotCompanyId) {
        // Resolve HubSpot id → Convex id
        const companies = await ctx.runQuery(api.companies.listWithHubspotId, {});
        const match = (companies as any[]).find((c) => c.hubspotCompanyId === args.hubspotCompanyId);
        if (!match) {
          return asText({
            error: "hubspot_company_not_found_in_convex",
            note: `No companies row with hubspotCompanyId=${args.hubspotCompanyId}. The HubSpot sync may not have run yet, or the id is wrong. Try mode 3 (pass just 'name') for a naked creation.`,
          });
        }
        convexCompanyId = match._id;
      }

      if (convexCompanyId) {
        // Promotion path
        const company = await ctx.runQuery(api.companies.get, { id: convexCompanyId });
        if (!company) {
          return asText({ error: "company_not_found", note: `companies row ${convexCompanyId} not found.` });
        }
        const id = await ctx.runMutation(api.clients.createWithPromotion, {
          name: args.name ?? (company as any).name,
          type: "lender",
          status: "active" as const,
          companyName: args.companyName ?? (company as any).name,
          website: args.website ?? (company as any).website,
          phone: args.phone ?? (company as any).phone,
          address: (company as any).address,
          city: (company as any).city,
          country: args.country ?? (company as any).country ?? "United Kingdom",
          promoteFromCompanyId: convexCompanyId as any,
        });
        return asText({
          status: "promoted",
          lenderClientId: id,
          sourceCompanyId: convexCompanyId,
          sourceCompanyName: (company as any).name,
          note: "Lender created by promoting an existing HubSpot-synced company. Auto-inherited metadata + linked synced contacts. Now record appetite signals via lender.recordAppetite + author submission requirements via lender.setSubmissionRequirements.",
        });
      }

      // Mode 3: naked upsert (no HubSpot link) — dedups against existing
      // lenders by normalized name before inserting (see clients.upsertLender).
      if (!args.name) {
        return asText({ error: "name_required_for_mode_3", note: "Mode 3 (naked creation) requires `name`. For modes 1/2 (HubSpot promotion), pass promoteFromCompanyId or hubspotCompanyId instead." });
      }
      const upsert = await ctx.runMutation(api.clients.upsertLender, {
        name: args.name,
        companyName: args.companyName,
        notes: args.notes,
        website: args.website,
        email: args.email,
        phone: args.phone,
        country: args.country ?? "United Kingdom",
        aliases: args.aliases,
        sourceDocumentIds: args.sourceDocumentIds as any,
      });
      return asText(
        upsert.deduped
          ? {
              status: "deduped",
              deduped: true,
              lenderClientId: upsert.lenderClientId,
              matchedName: upsert.matchedName,
              note: `Matched an existing lender ("${upsert.matchedName}") by normalized name — patched that row (unioned aliases + sourceDocumentIds, appended a note) instead of creating a duplicate. Use this lenderClientId.`,
            }
          : {
              status: "created",
              deduped: false,
              lenderClientId: upsert.lenderClientId,
              note: "Lender created via naked path (no HubSpot link). Now record appetite signals via lender.recordAppetite + author submission requirements via lender.setSubmissionRequirements.",
            },
      );
    },
  },

  {
    name: "lender.merge",
    description:
      "Collapse a DUPLICATE lender row into a canonical one — the operator-hygiene fix for the duplicate lenders lender.create's dedup could not catch automatically (e.g. 'Funding 365' vs 'Funding 365 Property Finance', 'Downing' vs 'Downing LLP', 'Paragon' vs 'Paragon Bank'). Both ids must be clients rows with type='lender' and distinct. Repoints EVERYTHING from the from-row to the to-row: knowledge atoms + facilities + appetite signals + document chunks (via atoms.mergeEntities), then the flat CRM references (contacts, documents, tasks, notes, meetings, cadences/approvals-derived, …) and projects.clientRoles (via the client CRM merge), then unions the lender row fields (aliases — incl. the from-row's name/companyName as aliases so future mentions resolve — sourceDocumentIds, notes with a merge marker, and any missing scalars). Finally soft-deletes the from-row (deletedReason=merged_into_<toId>), so the roster reads clean. Pass `dryRun:true` (recommended first) to preview validation + the would-be repoint counts + field merge WITHOUT writing. The to-row is the survivor — pick the richer/canonical one as `toClientId`. The merge runs as three sequential transactions (knowledge → CRM → field union), so a mid-sequence failure can leave a partial merge; recovery is simple — re-run with the SAME arguments, the steps are idempotent and skip work already done.",
    inputSchema: {
      type: "object",
      properties: {
        fromClientId: { type: "string", description: "Convex id of the DUPLICATE lender to collapse and soft-delete." },
        toClientId: { type: "string", description: "Convex id of the CANONICAL lender that survives and absorbs the duplicate." },
        dryRun: { type: "boolean", description: "Preview only — validate + count would-be repoints and field merge without writing. Default false." },
      },
      required: ["fromClientId", "toClientId"],
    },
    handler: async (ctx, userId, args) => {
      // Pre-flight validation + plan (also the dryRun payload). Runs before any
      // write so an invalid pair never half-merges.
      const plan = await ctx.runQuery(api.clients.mergeLendersPlan, {
        fromClientId: args.fromClientId,
        toClientId: args.toClientId,
      });
      if (!plan.ok) {
        return asText({ error: "invalid_merge_pair", detail: plan.error });
      }
      if (args.dryRun) {
        return asText({ status: "dry_run", ...plan });
      }

      // 1. Knowledge side — atoms + facilities + appetite + chunks.
      const atomMerge = await ctx.runMutation(internal.knowledge.atomsCore.mergeEntities, {
        entityType: "client" as const,
        fromId: args.fromClientId,
        toId: args.toClientId,
        reason: `lender.merge ${args.fromClientId} → ${args.toClientId}`,
      });
      // 2. CRM side — flat FKs + clientRoles + soft-delete the from-row.
      const crmMerge = await ctx.runMutation(internal.migrations.mergeDuplicateClients.mergeTwo, {
        sourceId: args.fromClientId,
        targetId: args.toClientId,
      });
      // 3. Lender row-field union onto the survivor.
      const fields = await ctx.runMutation(api.clients.mergeLenderFields, {
        fromClientId: args.fromClientId,
        toClientId: args.toClientId,
      });

      return asText({
        status: "merged",
        fromClientId: args.fromClientId,
        toClientId: args.toClientId,
        survivor: plan.toName,
        collapsed: plan.fromName,
        knowledge: {
          atomsRepointed: atomMerge.repointed,
          atomsMerged: atomMerge.merged,
          atomsContested: atomMerge.contested,
          scope: atomMerge.scope,
        },
        crmCounts: crmMerge.counts,
        fieldMerge: fields,
        note: "Duplicate lender collapsed and soft-deleted (deletedReason=merged_into_target). All atoms, facilities, appetite, CRM refs and clientRoles now point at the survivor.",
      });
    },
  },

  {
    name: "facilities.create",
    description:
      "Manually add a facility to a lender's book — the operator lane for a facility the documents haven't evidenced (market intel, a call, a deal RockCap wasn't on). Args: lenderClientId (clients row, type=lender), projectId (required — facilities are project-anchored), optional borrowerClientId, tranche (senior/mezzanine/bridge/equity; anything else collapses to the whole-facility 'single' bucket), amountGBP, interestRate, maturityDate (ISO date), status (indicative/live/repaid/defaulted). Flagged createdFrom:'operator' — the Lenders tab shows it as manually added (orange provenance dot). Uses the SAME dedupeKey scheme as the pipeline minter, so a later document-evidenced mint for the same (project, lender, tranche) lands on this row instead of duplicating; returns {ok:false, error:'facility_exists', facilityId} if the row already exists. NOT for facilities a document evidences — atomize the document instead (atomize-document skill) so provenance is real.",
    inputSchema: {
      type: "object",
      properties: {
        lenderClientId: { type: "string", description: "Convex id of the lender's clients row" },
        projectId: { type: "string", description: "Convex id of the project the facility funds/quotes" },
        borrowerClientId: { type: "string", description: "Optional Convex id of the borrower's clients row" },
        tranche: { type: "string", description: "senior | mezzanine | bridge | equity (omit for a whole facility)" },
        amountGBP: { type: "number" },
        interestRate: { type: "number", description: "Percent, e.g. 9.5" },
        maturityDate: { type: "string", description: "ISO date, e.g. 2027-03-31" },
        status: { type: "string", description: "indicative | live | repaid | defaulted (default unset)" },
      },
      required: ["lenderClientId", "projectId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.knowledge.facilities.operatorCreateInternal, {
        lenderClientId: args.lenderClientId,
        projectId: args.projectId,
        borrowerClientId: args.borrowerClientId,
        tranche: args.tranche,
        amountGBP: args.amountGBP,
        interestRate: args.interestRate,
        maturityDate: args.maturityDate,
        status: args.status,
      });
      return asText(result);
    },
  },

  {
    name: "facilities.updateTerms",
    description:
      "Update a facility's terms — amountGBP, interestRate (percent, e.g. 9.5), maturityDate (ISO date). Pass only the fields to change. Semantics: on pipeline-minted rows these columns are atom mirrors, so an operator value holds until NEWER document evidence rematerializes the row (operator number = current truth, later executed doc = newer truth); operator-created rows are never rebuilt, so edits are final. For document-evidenced term changes prefer atomizing the document (facility-anchored atoms) so provenance is real. Returns {ok, updated:[fields]} or nothing_to_update.",
    inputSchema: {
      type: "object",
      properties: {
        facilityId: { type: "string", description: "Convex id of the facilities row" },
        amountGBP: { type: "number" },
        interestRate: { type: "number", description: "Percent, e.g. 9.5" },
        maturityDate: { type: "string", description: "ISO date, e.g. 2027-03-31" },
      },
      required: ["facilityId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.knowledge.facilities.operatorUpdateTermsInternal, {
        facilityId: args.facilityId,
        amountGBP: args.amountGBP,
        interestRate: args.interestRate,
        maturityDate: args.maturityDate,
      });
      return asText(result);
    },
  },

  {
    name: "facilities.setStatus",
    description:
      "Set a facility's lifecycle status — the operator override. The pipeline stamps status from document class and never downgrades; this tool permits ANY transition (a facility the paper says is live may have repaid; a stale indicative quote may be dead). Args: facilityId + status (indicative/live/repaid/defaulted). Status is not an atom mirror, so rematerialisation never clobbers the edit; later pipeline stamps still only upgrade. Get facilityIds from facilities.audit, lender.getDeepContext's graph section, or the atoms.createBatch facilities return.",
    inputSchema: {
      type: "object",
      properties: {
        facilityId: { type: "string", description: "Convex id of the facilities row" },
        status: { type: "string", description: "indicative | live | repaid | defaulted" },
      },
      required: ["facilityId", "status"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.knowledge.facilities.operatorSetStatusInternal, {
        facilityId: args.facilityId,
        status: args.status,
      });
      return asText(result);
    },
  },

  {
    name: "lender.getDocuments",
    description:
      "The lender's DOCUMENT EVIDENCE TRAIL: every document that evidences this lender, federated from four lanes — the lender row's sourceDocumentIds (lender.create evidence), atoms where the lender is subject/object (via observations), the facility book's atoms (term sheets, facility agreements, the later-stage deal paper), and appetite signals sourced from documents. Each document returns {documentId, fileName, fileTypeDetected, category, summary, uploadedAt, clientId/clientName, projectId/projectName, atomCount (knowledge pulled from it for this lender), via[] (which lanes cited it)}. Newest first, default 60 / cap 100 (totalFound carries the pre-cap count). Use to answer 'which documents did this lender's terms come from?', to group a lender's paper by project, or to pick the right documentId for document.get / document.extractText follow-ups. Powers the Lenders-tab Documents view.",
    inputSchema: {
      type: "object",
      properties: {
        lenderClientId: { type: "string", description: "Convex id of the lender's clients row" },
        limit: { type: "number", description: "Max documents (default 60, cap 100)" },
      },
      required: ["lenderClientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.appetiteSignals.lenderDocuments, {
        lenderClientId: args.lenderClientId,
        limit: args.limit,
      });
      return asText(result);
    },
  },

  {
    name: "facilities.audit",
    description:
      "Find (and optionally fix) FRAGMENTED facilities — the multiple facility rows that free-text tranche descriptors used to mint for one negotiation (e.g. Allica Bank: 8 rows on one project from successive quote revisions). Groups facilities by project + lender + normalized tranche (senior/mezzanine/bridge/equity/single); any group with >1 row is a fragment cluster of what should be ONE facility. Dry-run (default) reports each cluster with its rows (id/tranche/amount/status/atomCount) and the suggested canonical row (most attached atoms, then richest mirror columns). Pass `execute:true` to collapse each fragment into the canonical via the completed facility merge path (fills mirrors, recomputes dedupeKey under the enum scheme, deletes the fragment, rematerializes) and return the merge count. Scope to one project with `projectId`, or omit to audit the whole corpus. External/unrostered facilities (no lender id) are excluded — two such rows can't be confirmed duplicates.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Optional: limit the audit to one project's facilities. Omit to audit the whole corpus." },
        execute: { type: "boolean", description: "Perform the merges (fragments → canonical). Default false = dry-run report only." },
      },
      required: [],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.knowledge.facilities.auditFragmentation, {
        projectId: args.projectId as any,
        execute: args.execute ?? false,
      });
      return asText(result);
    },
  },

  // ── v1.4 Sprint K: lender Submission Requirements ─────────────────
  //
  // Per-lender doc capturing how that lender wants packs formatted +
  // what they care about + things they hate. Consumed by terms-package-build
  // to tailor each pack. Authored by lender-intel during BDM call captures
  // OR manually by operators as preferences are learned over time.
  // Shape canon: shared-references/lender-submission-requirements-canon.md

  {
    name: "lender.setSubmissionRequirements",
    description:
      "Set / update the Submission Requirements doc for a lender. Wraps document.createFromGeneration with the standard shape locked in: clientId=lender, fileTypeDetected='Submission Requirements', category='Lender outreach', isBaseDocument=true. Creates a NEW doc version each call (supersession via getSubmissionRequirements returning the most recent). Use after a BDM call when you've learned new lender preferences, OR initially when seeding a lender from HoTs evidence + operator domain knowledge. Always follow the canonical structure in shared-references/lender-submission-requirements-canon.md (8 sections: Identity, Submission preferences, Content emphasis, Credit committee, Appetite envelope, Submission history, Past wins/losses, Provenance). Sections you can't populate should be present with 'Not yet captured' placeholders, not omitted.",
    inputSchema: {
      type: "object",
      properties: {
        lenderClientId: { type: "string", description: "Convex id of the lender (clients row with type='lender')" },
        requirementsMarkdown: { type: "string", description: "Full markdown content per the canonical 8-section structure. Operator-facing artefact; will appear in lender's base documents list." },
        sourceContext: {
          type: "string",
          description: "Provenance — what source(s) informed this version. E.g., 'BDM call 2026-05-25 with Sarah at Octane', 'Inferred from 3 HoTs in Manor Park Refi + Comberton', 'Operator domain knowledge'.",
        },
      },
      required: ["lenderClientId", "requirementsMarkdown"],
    },
    handler: async (ctx, userId, args) => {
      const lender = await ctx.runQuery(api.clients.get, { id: args.lenderClientId });
      if (!lender) return asText({ error: "lender_not_found" });
      if ((lender as any).type !== "lender") {
        return asText({ error: "not_a_lender", note: `Client ${args.lenderClientId} has type='${(lender as any).type}'. Submission Requirements only applies to type=lender.` });
      }
      const result = await ctx.runMutation(api.documents.createFromGeneration, {
        clientId: args.lenderClientId,
        fileName: "Submission Requirements",
        fileTypeDetected: "Submission Requirements",
        category: "Lender outreach",
        summary: args.requirementsMarkdown,
        reasoning: args.sourceContext ?? "Submission requirements for this lender; loaded by terms-package-build to tailor packs.",
        isBaseDocument: true,
      });
      return asText({
        ok: true,
        lenderClientId: args.lenderClientId,
        lenderName: (lender as any).name,
        documentId: (result as any).documentId,
        contentLength: args.requirementsMarkdown.length,
        sourceContext: args.sourceContext,
      });
    },
  },

  {
    name: "lender.getSubmissionRequirements",
    description:
      "Fetch the most recent Submission Requirements doc for a lender. Returns the doc's full content (markdown), or {found:false} if the lender has no Submission Requirements yet. Used by terms-package-build to tailor each pack; used by lender-intel to read prior preferences before a BDM call. When multiple versions exist (because operator has updated over time), returns the most recently created.",
    inputSchema: {
      type: "object",
      properties: {
        lenderClientId: { type: "string", description: "Convex id of the lender" },
      },
      required: ["lenderClientId"],
    },
    handler: async (ctx, userId, args) => {
      const docs = await ctx.runQuery(api.documents.getByClient, { clientId: args.lenderClientId });
      const requirementsDocs = (docs as any[]).filter(
        (d) => d.fileTypeDetected === "Submission Requirements" || d.fileName === "Submission Requirements",
      );
      if (requirementsDocs.length === 0) {
        return asText({
          found: false,
          lenderClientId: args.lenderClientId,
          note: "No Submission Requirements doc found for this lender. Call lender.setSubmissionRequirements to author one.",
        });
      }
      // Most recent first
      requirementsDocs.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));
      const latest = requirementsDocs[0];
      return asText({
        found: true,
        documentId: latest._id,
        fileName: latest.fileName,
        createdAt: latest.uploadedAt ?? latest.savedAt,
        reasoning: latest.reasoning,
        content: latest.summary,
        versionsAvailable: requirementsDocs.length,
      });
    },
  },

  // v1.3 Sprint E — project MCP surface. Mirrors the client.getDeepContext
  // pattern but scoped to PROJECTS (schemes / deals). Use when operator
  // asks about a specific scheme: "where are we at with Comberton?".
  {
    name: "project.getDeepContext",
    description:
      "Returns a comprehensive snapshot of a project (scheme / deal): the project row, projectIntelligence, linked clients via clientRoles (with role labels), project-scoped meetings (upcoming + past), documents, checklist split by status (missing/pending_review/fulfilled), cadences, skillRuns, deals, touchpoints, and pending approvals. The summary block includes counts so the operator-agent can compose an answer in one round-trip. Use this FIRST when an operator asks about a specific project (vs prospect.getDeepContext for client-level questions).",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.projects.getDeepContext, {
        projectId: args.projectId,
      });
      if (!result) return asText({ error: "project_not_found", projectId: args.projectId });
      return asText(result);
    },
  },

  {
    name: "project.listByClient",
    description:
      "List all projects where a client appears in any clientRoles entry (borrower / lender / developer / etc.). Use to enumerate projects for a client when client.getDeepContext returned project counts and you want the full project list.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" } },
      required: ["clientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.projects.getByClient, { clientId: args.clientId });
      return asText(result);
    },
  },

  // (project.get + project.getStats already defined earlier in this file —
  // pre-Sprint E. The Sprint E project.listByClient + project.getDeepContext
  // above are the new additions. Re-defining project.get here would create
  // duplicate tool registrations.)

  // v1.3 Sprint E — meeting.update wrapper for meeting-capture skill output
  // (Sprint C added meeting.create + listByClient + listUpcoming + get;
  // this completes the surface with update for the post-meeting fill-in
  // path that meeting-capture uses.)
  {
    name: "meeting.update",
    description:
      "Update an existing meeting record with captured content (summary, keyPoints, decisions, actionItems, attendees). Used by meeting-capture skill after parsing a Fireflies transcript or operator-pasted notes — the meeting record was created via meeting.create at scheduling time; this fills in the post-call content.",
    inputSchema: {
      type: "object",
      properties: {
        meetingId: { type: "string" },
        title: { type: "string", description: "Optional: refine the title if it was a placeholder" },
        summary: { type: "string", description: "Optional: replace the summary" },
        keyPoints: { type: "array", items: { type: "string" } },
        decisions: { type: "array", items: { type: "string" } },
        actionItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              description: { type: "string" },
              assignee: { type: "string" },
              dueDate: { type: "string" },
              status: { type: "string", description: "pending | completed | cancelled" },
              createdAt: { type: "string" },
            },
            required: ["id", "description", "status", "createdAt"],
          },
        },
        attendees: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string" },
              company: { type: "string" },
              contactId: { type: "string" },
            },
            required: ["name"],
          },
        },
        verified: { type: "boolean", description: "Mark verified after operator review" },
      },
      required: ["meetingId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(api.meetings.update, {
        meetingId: args.meetingId,
        title: args.title,
        summary: args.summary,
        keyPoints: args.keyPoints,
        decisions: args.decisions,
        actionItems: args.actionItems,
        attendees: args.attendees,
        verified: args.verified,
      });
      return asText(result);
    },
  },

  // v1.3 Sprint E — outreach.draftToLender. Counterpart to draftReply +
  // draftFreshEmail; distinguished by entityType=lender_outreach so the
  // approvals UI can route lender-bound emails to a different reviewer
  // OR apply lender-specific guards (e.g., requires the project's terms
  // package to be approved before lender outreach can fire).
  {
    name: "outreach.draftToLender",
    description:
      "Stage a lender-bound email as a pending approval with entityType=lender_outreach (vs client_communication for borrower-bound). Use when sending indicative terms requests, follow-ups to lender BDMs, or term sheet acceptance / rejection notifications. The approvals UI applies any lender-specific gates (e.g., terms package signed off) before allowing send.",
    inputSchema: {
      type: "object",
      properties: {
        lenderClientId: { type: "string", description: "The lender (clients row with type=lender)" },
        contactId: { type: "string", description: "Specific BDM/contact at the lender" },
        projectId: { type: "string", description: "Optional but recommended — the deal context" },
        subject: { type: "string" },
        bodyText: { type: "string" },
        bodyHtml: { type: "string" },
        attachedDocumentIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional: document ids to attach (e.g., the lender brief package or appraisal)",
        },
        skillRunId: { type: "string", description: "Optional: skillRun audit linkage" },
        reasoning: { type: "string", description: "1-2 sentence operator-facing summary of WHY this lender + WHY now" },
      },
      required: ["lenderClientId", "contactId", "subject", "bodyText", "bodyHtml"],
    },
    handler: async (ctx, userId, args) => {
      const approvalId = await ctx.runMutation(internal.approvals.internalCreate, {
        entityType: "lender_outreach" as const,
        summary: args.reasoning
          ? `To lender (${args.subject.slice(0, 50)}) — ${args.reasoning.slice(0, 120)}`
          : `Lender outreach: ${args.subject.slice(0, 80)}`,
        draftPayload: {
          kind: "lender_email" as const,
          lenderClientId: args.lenderClientId,
          contactId: args.contactId,
          subject: args.subject,
          bodyText: args.bodyText,
          bodyHtml: args.bodyHtml,
          attachedDocumentIds: args.attachedDocumentIds,
          reasoning: args.reasoning,
        },
        requestedBy: userId,
        requestSource: "skill" as const,
        requestSourceName: "lender_outreach",
        relatedClientId: args.lenderClientId,
        relatedContactId: args.contactId,
        relatedProjectId: args.projectId,
        relatedSkillRunId: args.skillRunId,
      });
      return asText({
        status: "draft_staged",
        approvalId,
        viewAt: `/approvals/${approvalId}`,
        note: "Lender outreach draft staged. entityType=lender_outreach for any lender-specific approval guards.",
      });
    },
  },

  // v1.3 Sprint D — cadence flexibility primitives. Operator-driven pause /
  // resume / snooze for in-flight cadences. Used when operator says things
  // like "pause Mccarthy's cadence for 2 weeks while we wait for X" or
  // "snooze Touch 3 by a week — they're on holiday".
  {
    name: "cadence.pause",
    description:
      "Soft-pause a single cadence row by setting pauseUntil. The dispatcher checks pauseUntil before firing and skips while it's > now. Default: 14 days. Idempotent — re-running with a later date extends the pause; with an earlier date shortens it. Errors: cadence_not_found, cannot_pause_fired_cadence (Touch already sent).",
    inputSchema: {
      type: "object",
      properties: {
        cadenceId: { type: "string" },
        untilDate: { type: "string", description: "ISO timestamp. Defaults to 14 days from now." },
      },
      required: ["cadenceId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(api.cadences.pause, {
        cadenceId: args.cadenceId,
        untilDate: args.untilDate,
      });
      return asText(result);
    },
  },

  {
    name: "cadence.resume",
    description:
      "Clear pauseUntil on a cadence (resume). Optionally also reschedule by passing newNextDueAt. Use after cadence.pause when whatever the operator was waiting for has happened. If you don't pass newNextDueAt, the dispatcher will fire on the next tick if the original nextDueAt is now in the past.",
    inputSchema: {
      type: "object",
      properties: {
        cadenceId: { type: "string" },
        newNextDueAt: { type: "string", description: "Optional ISO timestamp. If supplied, also reschedules nextDueAt." },
      },
      required: ["cadenceId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(api.cadences.resume, {
        cadenceId: args.cadenceId,
        newNextDueAt: args.newNextDueAt,
      });
      return asText(result);
    },
  },

  {
    name: "cadence.snooze",
    description:
      "Push a cadence's nextDueAt forward by N days. Different from pause: snooze is a HARD reschedule of the next send date; pause leaves nextDueAt alone and just suppresses firing temporarily via pauseUntil. Use snooze when you want a specific delay (e.g., 'they said wait until next week'); use pause when the duration is open-ended. Errors: invalid_byDays (must be 1-365), cannot_snooze_fired_cadence.",
    inputSchema: {
      type: "object",
      properties: {
        cadenceId: { type: "string" },
        byDays: { type: "number", description: "Positive integer, 1-365. Pushed forward from current nextDueAt." },
      },
      required: ["cadenceId", "byDays"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(api.cadences.snooze, {
        cadenceId: args.cadenceId,
        byDays: args.byDays,
      });
      return asText(result);
    },
  },

  {
    name: "cadence.get",
    description:
      "Get a single cadence row by id. Use when you have a cadence id from prospect.getDeepContext's cadences section and need the full row (preDraftedTouch, scheduleConfig, pauseUntil status, etc).",
    inputSchema: {
      type: "object",
      properties: { cadenceId: { type: "string" } },
      required: ["cadenceId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.cadences.getById, { cadenceId: args.cadenceId });
      if (!result) return asText({ error: "cadence_not_found", cadenceId: args.cadenceId });
      return asText(result);
    },
  },

  {
    name: "cadence.listByPackage",
    description:
      "List all cadences in a package (all 4 touches of a prospect-intel package, typically). Useful when operator says 'show me Mccarthy's outreach package' and you want to enumerate touches without going through getDeepContext.",
    inputSchema: {
      type: "object",
      properties: { packageId: { type: "string" } },
      required: ["packageId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.cadences.listByPackage, { packageId: args.packageId });
      return asText(result);
    },
  },

  // v1.3 Sprint D — document MCP surface. Operator-driven document
  // discovery + linkage. Sister tools to the checklist + outreach surfaces.
  {
    name: "document.listByClient",
    description:
      "List all documents linked to a client. Includes Base Documents (not project-specific) AND any project-linked docs for that client's projects. Each row carries fileName + fileTypeDetected (AI-classified) + category + uploadedAt + summary + projectId/Name if linked.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" } },
      required: ["clientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.documents.getByClient, { clientId: args.clientId });
      return asText(result);
    },
  },

  {
    name: "document.listByProject",
    description:
      "List documents linked to a specific project. Use after prospect.getDeepContext.projects.active reveals a project id and you want the document list for that specific scheme.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.documents.getByProject, { projectId: args.projectId });
      return asText(result);
    },
  },

  {
    name: "document.get",
    description:
      "Get full document metadata by id (summary, reasoning, confidence, fileStorageId for download via storage URL, classification details). Use when document.listByClient returns an id you want to drill into.",
    inputSchema: {
      type: "object",
      properties: { documentId: { type: "string" } },
      required: ["documentId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.documents.get, { id: args.documentId });
      if (!result) return asText({ error: "document_not_found", documentId: args.documentId });
      return asText(result);
    },
  },

  {
    name: "document.search",
    description:
      "Search documents by query string. Returns documents whose fileName, summary, or fileTypeDetected match. Use for 'find Mccarthy's red book valuation' style queries.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        clientId: { type: "string", description: "Optional: restrict to one client" },
      },
      required: ["query"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.documents.search, {
        query: args.query,
        clientId: args.clientId,
      });
      return asText(result);
    },
  },

  {
    name: "document.linkToProject",
    description:
      "Link an existing document to a project. Patches the document's projectId + projectName + sets isBaseDocument=false. Pass projectId=null to unlink (moves back to Base Documents). Operator-driven: 'this Red Book Val is for Comberton, not Bayfield Base'.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        projectId: { type: "string", description: "Convex id of the project to link to. Pass null/omit to unlink." },
      },
      required: ["documentId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(api.documents.linkToProject, {
        documentId: args.documentId,
        projectId: args.projectId || undefined,
      });
      return asText(result);
    },
  },

  // v1.3 Sprint D — checklist MCP surface. Read existing items + create
  // custom items + flip status. The standard items get initialised from
  // templates; this surface is for the operator-driven exceptions.
  //
  // (Read surface: checklist.getByClient + checklist.getByProject exist
  // earlier in this file — pre-Sprint D. Use those for listing.)

  {
    name: "checklist.updateStatus",
    description:
      "Flip a checklist item's status (missing / pending_review / fulfilled). Use when a document was received OR when operator decides an item is no longer required (mark fulfilled with a note in evidence document).",
    inputSchema: {
      type: "object",
      properties: {
        checklistItemId: { type: "string" },
        status: {
          type: "string",
          description: "missing | pending_review | fulfilled",
        },
      },
      required: ["checklistItemId", "status"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(api.knowledgeLibrary.updateItemStatus, {
        checklistItemId: args.checklistItemId,
        status: args.status,
      });
      return asText(result);
    },
  },

  {
    name: "checklist.createCustomItem",
    description:
      "Add a custom (non-template) checklist item to a client or project. Use for bespoke requirements like lender-specific PG forms, unusual planning conditions, side letters. Defaults: phaseRequired=indicative_terms, priority=required, status=missing. Order auto-computed as last+1 within the scope.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string" },
        projectId: { type: "string", description: "Optional — omit for client-level item" },
        name: { type: "string", description: "Operator-readable item name, e.g., 'Personal Guarantee — Stephen Mccarthy'" },
        category: { type: "string", description: "Free-form category for grouping, e.g., 'Security' or 'Sponsor docs'" },
        phaseRequired: {
          type: "string",
          description: "indicative_terms | credit_submission | post_credit | always (default: indicative_terms)",
        },
        priority: {
          type: "string",
          description: "required | nice_to_have | optional (default: required)",
        },
        description: { type: "string", description: "Optional longer description" },
        matchingDocumentTypes: {
          type: "array",
          items: { type: "string" },
          description: "Optional: document types that fulfil this item (e.g., ['Personal Guarantee Form'])",
        },
        isBlocking: { type: "boolean", description: "Optional: signals deal can't proceed without this" },
      },
      required: ["clientId", "name", "category"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(api.knowledgeLibrary.createCustomItem, {
        clientId: args.clientId,
        projectId: args.projectId,
        name: args.name,
        category: args.category,
        phaseRequired: args.phaseRequired,
        priority: args.priority,
        description: args.description,
        matchingDocumentTypes: args.matchingDocumentTypes,
        isBlocking: args.isBlocking,
      });
      return asText(result);
    },
  },

  // v1.3 Sprint D — outreach.draftFreshEmail. Sister to outreach.draftReply.
  // Distinction: draftReply responds to a tracked replyEventId (links via
  // relatedReplyEventId); draftFreshEmail is operator-initiated NEW outreach
  // (no inbound). Use when operator says "send Mccarthy an email asking for
  // the appraisal" — no specific inbound prompted this.
  {
    name: "outreach.draftFreshEmail",
    description:
      "Stage a NEW outreach email as a pending approval (distinct from outreach.draftReply which threads onto a reply event). Use when operator initiates a fresh email outside the cadence package + outside a reply. Examples: 'send Mccarthy an email asking for the appraisal', 'follow up with Bayfield on Comberton planning status'. The approval appears on the Overview Pending Approvals card + in /approvals.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Recipient contact" },
        clientId: { type: "string", description: "Client this email concerns" },
        subject: { type: "string" },
        bodyText: { type: "string" },
        bodyHtml: { type: "string" },
        skillRunId: { type: "string", description: "Optional: skillRun audit linkage" },
        reasoning: { type: "string", description: "1-2 sentence operator-facing summary of WHY this email — surfaces on /approvals quick-review" },
      },
      required: ["contactId", "clientId", "subject", "bodyText", "bodyHtml"],
    },
    handler: async (ctx, userId, args) => {
      const approvalId = await ctx.runMutation(internal.approvals.internalCreate, {
        entityType: "client_communication" as const,
        summary: args.reasoning
          ? `Fresh outreach (${args.subject.slice(0, 60)}) — ${args.reasoning.slice(0, 120)}`
          : `Fresh outreach: ${args.subject.slice(0, 80)}`,
        draftPayload: {
          kind: "email_fresh" as const,
          contactId: args.contactId,
          subject: args.subject,
          bodyText: args.bodyText,
          bodyHtml: args.bodyHtml,
          reasoning: args.reasoning,
        },
        requestedBy: userId,
        requestSource: "skill" as const,
        requestSourceName: "operator_initiated",
        relatedClientId: args.clientId,
        relatedContactId: args.contactId,
        relatedSkillRunId: args.skillRunId,
      });
      return asText({
        status: "draft_staged",
        approvalId,
        viewAt: `/approvals/${approvalId}`,
        note: "Fresh outreach draft staged for operator review. Distinct from cadence touches AND from reply drafts — this is ad-hoc outreach.",
      });
    },
  },

  // v1.3 Sprint C — meeting visibility + skill-side meeting management.
  // The meeting-prep skill loads context (via getDeepContext which already
  // returns meeting summaries) then proposes availability via outreach.draftReply.
  // After a meeting books, meeting.create persists the record for the
  // Meetings tab + UpcomingMeetingsSection.
  //
  // (Read surface: meeting.getByClient + meeting.getByProject exist earlier
  // in this file — pre-Sprint C. Use those for listing per-client / per-project.
  // meeting.listUpcoming below is the only NEW list-surface introduced in
  // Sprint C since it spans all clients.)

  {
    name: "meeting.listUpcoming",
    description:
      "List upcoming meetings across all clients, soonest first. The operator's 'what calls do I have' surface — populates the UpcomingMeetingsSection on the /prospects home page AND Claude Code's morning-queue surveys. Filters to meetings whose meetingDate is in the future.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Default 50" },
      },
      required: [],
    },
    handler: async (ctx, userId, args) => {
      const rows = await ctx.runQuery(api.meetings.listUpcoming, {
        limit: args.limit ?? 50,
      });
      return asText(rows);
    },
  },

  {
    name: "meeting.get",
    description:
      "Get one meeting by id with full content (attendees, decisions, action items, summary). Use after meeting.listByClient / listUpcoming has returned an id and you need the full payload.",
    inputSchema: {
      type: "object",
      properties: {
        meetingId: { type: "string" },
      },
      required: ["meetingId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.meetings.get, {
        meetingId: args.meetingId,
      });
      if (!result) return asText({ error: "meeting_not_found", meetingId: args.meetingId });
      return asText(result);
    },
  },

  {
    name: "meeting.create",
    description:
      "Create a meeting record. Used by meeting-prep skill after operator approves a proposed time, and by meeting-capture skill when persisting captured notes. For a JUST-SCHEDULED meeting (no notes yet), pass title + meetingDate + attendees + meetingType only; leave summary='' / keyPoints=[] / decisions=[] / actionItems=[] empty — they get populated by meeting-capture post-meeting.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string" },
        projectId: { type: "string", description: "Optional — only if linked to a specific project" },
        title: { type: "string", description: "e.g., 'Mccarthy intro call' or 'Comberton site visit'" },
        meetingDate: { type: "string", description: "ISO timestamp; the scheduled date/time" },
        meetingType: {
          type: "string",
          description: "progress | kickoff | review | site_visit | call | other",
        },
        attendees: {
          type: "array",
          description: "Array of {name, role, company, contactId?}",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string" },
              company: { type: "string" },
              contactId: { type: "string" },
            },
            required: ["name"],
          },
        },
        summary: { type: "string", description: "Empty string for scheduled-but-not-yet-held meetings" },
      },
      required: ["clientId", "title", "meetingDate", "attendees", "summary"],
    },
    handler: async (ctx, userId, args) => {
      const meetingId = await ctx.runMutation(api.meetings.create, {
        clientId: args.clientId,
        projectId: args.projectId,
        title: args.title,
        meetingDate: args.meetingDate,
        meetingType: args.meetingType,
        attendees: args.attendees,
        summary: args.summary,
        keyPoints: [],
        decisions: [],
        actionItems: [],
      });
      return asText({ status: "created", meetingId });
    },
  },

  // v1.3 Sprint B — qualify-and-draft helper tools. Skill-friendly surface
  // for the "operator wants to draft a reply" workflow. Wraps approvals.create
  // with the right shape for email drafts + links the approval back to the
  // triggering reply event (when present) and the skillRun (always present
  // for skill-invoked drafts).
  {
    name: "outreach.draftReply",
    description:
      "Stage a drafted email reply as a pending approval. Use this from qualify-and-draft (or any draft-an-email skill) to surface the draft to the operator for review BEFORE it sends. The approval will appear on the prospect-detail Overview's 'Pending approvals' card AND in /approvals. Once approved, the existing approval-execution path triggers the actual send (Gmail or whichever provider is wired). Required: contactId + clientId (so the draft surfaces in both contact-scoped and client-scoped views) + subject + bodyText + bodyHtml. Optional: replyToReplyEventId (when drafting in response to a tracked inbound reply — links the approval back to the reply for cross-navigation) + skillRunId (audit linkage) + reasoning (1-2 sentence summary of why the draft says what it says, for the operator's quick-review).",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Convex id of the recipient contact" },
        clientId: { type: "string", description: "Convex id of the client this reply concerns" },
        subject: { type: "string" },
        bodyText: { type: "string", description: "Plain text email body" },
        bodyHtml: { type: "string", description: "HTML email body (paragraph-wrapped at minimum)" },
        replyToReplyEventId: { type: "string", description: "Optional: the replyEvents id this draft is responding to" },
        skillRunId: { type: "string", description: "Optional: the skillRun id that produced this draft (audit linkage)" },
        reasoning: { type: "string", description: "1-2 sentence summary of why the draft says what it says (operator-facing quick-review)" },
        threadId: { type: "string", description: "Optional: Gmail thread id if continuing a thread" },
        inReplyTo: { type: "string", description: "Optional: original Gmail Message-ID for proper threading" },
      },
      required: ["contactId", "clientId", "subject", "bodyText", "bodyHtml"],
    },
    handler: async (ctx, userId, args) => {
      // Auto-thread: when replying to a tracked reply event, pull the Gmail
      // thread + Message-ID from it so the send threads correctly, unless the
      // caller supplied them explicitly. Without this the reply lands as a new
      // top-level email instead of in the conversation.
      let threadId = args.threadId;
      let inReplyTo = args.inReplyTo;
      if (args.replyToReplyEventId && (!threadId || !inReplyTo)) {
        const ev: any = await ctx.runQuery(api.replyEvents.getById, {
          replyEventId: args.replyToReplyEventId,
        });
        if (ev) {
          threadId = threadId ?? ev.gmailThreadId;
          inReplyTo = inReplyTo ?? ev.gmailMessageId;
        }
      }
      const approvalId = await ctx.runMutation(internal.approvals.internalCreate, {
        entityType: "client_communication" as const,
        summary: args.reasoning
          ? `Reply draft (${args.subject.slice(0, 60)}) — ${args.reasoning.slice(0, 120)}`
          : `Reply draft: ${args.subject.slice(0, 80)}`,
        draftPayload: {
          kind: "email_reply" as const,
          contactId: args.contactId,
          subject: args.subject,
          bodyText: args.bodyText,
          bodyHtml: args.bodyHtml,
          threadId,
          inReplyTo,
          reasoning: args.reasoning,
        },
        requestedBy: userId,
        requestSource: "skill" as const,
        requestSourceName: "qualify-and-draft",
        relatedClientId: args.clientId,
        relatedContactId: args.contactId,
        relatedReplyEventId: args.replyToReplyEventId,
        relatedSkillRunId: args.skillRunId,
      });
      return asText({
        status: "draft_staged",
        approvalId,
        viewAt: `/approvals/${approvalId}`,
        note: "Approval is pending operator review. The operator can approve in the CRM (/approvals) or you can call approval.get to monitor status.",
      });
    },
  },

  {
    name: "approval.listPending",
    description:
      "EVERYTHING pending operator approval, org-wide, any entity type, newest first — THE session-opening read for the chat-first approval flow. Each row: approvalId, entityType (gmail_send / client_communication / lender_outreach / drive_write / …), summary, requestedAt, requestSourceName, client/project links + clientName, expiresAt. Trimmed — pull the full draft with approval.get before presenting anything for a yes. The intended loop: list → present each item to the operator IN CHAT → on their explicit yes call approval.approve (approval.approveBatch ≤50 for a reviewed set; approval.reject/rejectBatch to decline) — the executor fires immediately on approve; the app's /approvals page is an alternative surface, never a requirement. Optional entityType filter (e.g. 'drive_write' for pending Drive writes only).",
    inputSchema: {
      type: "object",
      properties: {
        entityType: {
          type: "string",
          description: "Filter to one entity type (e.g. drive_write, gmail_send, client_communication, lender_outreach).",
        },
        limit: { type: "number", description: "Max rows (default 50, max 200)" },
      },
      required: [],
    },
    handler: async (ctx, _userId, args) => {
      const rows = await ctx.runQuery(internal.approvals.listPendingInternal, {
        entityType: args.entityType,
        limit: args.limit,
      });
      return asText(rows);
    },
  },
  {
    name: "approval.listPendingByClient",
    description:
      "List pending approvals for a specific client. Use to check whether qualify-and-draft or any other skill has staged drafts awaiting operator review. Returns the same approval rows as the Overview tab's 'Pending approvals' card. Includes all entity types (client_communication, gmail_send, lender_outreach, etc).",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string" },
        limit: { type: "number", description: "Default 20" },
      },
      required: ["clientId"],
    },
    handler: async (ctx, userId, args) => {
      const rows = await ctx.runQuery(api.approvals.listPendingByClient, {
        clientId: args.clientId,
        limit: args.limit ?? 20,
      });
      return asText(rows);
    },
  },

  {
    name: "approval.listByReplyEvent",
    description:
      "List approvals (any status) linked to a specific reply event. Typically returns 0 or 1 row — the qualify-and-draft or meeting-prep-respond output. Use to check whether a reply has been drafted for yet.",
    inputSchema: {
      type: "object",
      properties: {
        replyEventId: { type: "string" },
      },
      required: ["replyEventId"],
    },
    handler: async (ctx, userId, args) => {
      const rows = await ctx.runQuery(api.approvals.listByReplyEvent, {
        replyEventId: args.replyEventId,
      });
      return asText(rows);
    },
  },

  // v1.3 reply handling: list + read + reclassify
  {
    name: "reply.listByClient",
    description:
      "List reply events linked to a specific clients row (newest first). Use this to see what inbound replies a prospect has sent. Each row carries the classified intent + confidence + dispatch destination. The body text is in replyBodyText when persisted.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string" },
        limit: { type: "number", description: "Default 50" },
      },
      required: ["clientId"],
    },
    handler: async (ctx, userId, args) => {
      const rows = await ctx.runQuery(api.replyEvents.listByClient, {
        clientId: args.clientId,
        limit: args.limit ?? 50,
      });
      return asText(rows);
    },
  },

  {
    name: "reply.listUnrouted",
    description:
      "List reply events where the classifier dispatched to 'operator_review' (didn't auto-route to a downstream skill). This is the operator's morning triage queue — replies that need a human decision before action. Each row carries the classified intent + evidence so the operator can see why the classifier flagged it.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Default 50" },
      },
      required: [],
    },
    handler: async (ctx, userId, args) => {
      const rows = await ctx.runQuery(api.replyEvents.listUnrouted, {
        limit: args.limit ?? 50,
      });
      return asText(rows);
    },
  },

  {
    name: "reply.get",
    description:
      "Get one reply event by id with all fields (body, subject, classification, dispatch destination, cancelledCadences). Use when prospect.getDeepContext returned the summary list and you need the full body of a specific reply. Gmail-ingested rows also carry attachments:[{filename, mimeType, sizeBytes, partId, inline}] when the email had any (captured at ingest since 2026-07-16 + backfilled onto historical rows; a row with the field ABSENT was unreachable at backfill time — reply.listAttachments lists any row live); to file one into Drive, use drive.saveEmailAttachment.",
    inputSchema: {
      type: "object",
      properties: {
        replyEventId: { type: "string" },
      },
      required: ["replyEventId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(internal.replyEvents.getInternal, {
        replyEventId: args.replyEventId,
      });
      if (!result) return asText({ error: "reply_event_not_found", replyEventId: args.replyEventId });
      return asText(result);
    },
  },

  {
    name: "reply.listAttachments",
    description:
      "List the file attachments on an inbound email, LIVE from Gmail — works for reply rows ingested before attachment capture existed (no stored metadata needed) and for raw Gmail references that never became reply rows. Pass replyEventId (preferred — any row from reply.listByClient / the inbox feed) OR gmailMessageId (a Gmail REST message id or an RFC822 Message-ID header, resolved via Gmail search). Returns {gmailApiId, subject, fromEmail, attachments:[{filename, mimeType, sizeBytes, partId, inline}]}. inline:true marks embedded images (signature logos etc.) — usually not worth filing. Reads the mailbox of the reply's OWNING user (Gmail tokens are per-user; a raw gmailMessageId reads the CALLING user's mailbox) — errors with gmail_not_connected if that mailbox has no live connection. To file an attachment into Google Drive, follow with drive.saveEmailAttachment.",
    inputSchema: {
      type: "object",
      properties: {
        replyEventId: {
          type: "string",
          description: "Reply event id (preferred). The email's Gmail reference + owning mailbox resolve from the row.",
        },
        gmailMessageId: {
          type: "string",
          description:
            "Alternative: a Gmail message id or RFC822 Message-ID header, for mail not in the reply feed. Read from the calling user's mailbox.",
        },
      },
      required: [],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runAction(internal.gmailAttachments.listForReply, {
        userId,
        replyEventId: args.replyEventId,
        gmailMessageId: args.gmailMessageId,
      });
      return asText(result);
    },
  },

  {
    name: "reply.ingestManual",
    description:
      "Operator pasted a reply they received via a channel that doesn't auto-sync (WhatsApp, text, forwarded email). Routes through the SAME flow as automated ingest: cancels active cadences for the matched contact, runs the intent classifier, dispatches to a downstream skill (or operator_review). Returns the same {status, replyEventId} shape as ingestFromGmailPush / ingestFromHubspot. Also useful for testing the reply-handling backbone before the Gmail Pub/Sub topic is provisioned. Errors: no_contact_match (the contactEmail doesn't resolve to any RockCap contact) — the reply event is still created but no cadence cancellation or dispatch happens.",
    inputSchema: {
      type: "object",
      properties: {
        contactEmail: { type: "string", description: "Email address of the person who replied (used to look up the contact)" },
        subject: { type: "string", description: "Subject of the reply" },
        body: { type: "string", description: "Plain-text body of the reply" },
        receivedAt: { type: "string", description: "ISO timestamp; defaults to now" },
        rawMessageRef: { type: "string", description: "Optional URL/reference to the original message (e.g., WhatsApp screenshot URL or forwarded-email reference)" },
      },
      required: ["contactEmail", "subject", "body"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runAction(internal.replyEventProcessor.ingestManualInternal, {
        contactEmail: args.contactEmail,
        subject: args.subject,
        body: args.body,
        receivedAt: args.receivedAt,
        rawMessageRef: args.rawMessageRef,
        userId,
      });
      return asText(result);
    },
  },

  // v1.2 prospects CRM — state transition
  {
    name: "prospect.transitionState",
    description:
      "Transition a prospect through the 9-state pipeline (researched/drafted/needs_revision/active/replied/engaged/promoted/parked/lost). Called by the prospects CRM and by skill workflows (e.g., reply event processor on intent classification). Side effect: pushes the mapped lifecycleStage + hs_lead_status to HubSpot (see spec section 2.8).",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the client row" },
        newState: {
          type: "string",
          description: "researched | drafted | needs_revision | active | replied | engaged | promoted | parked | lost",
        },
      },
      required: ["clientId", "newState"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.prospects.transitionStateInternal, {
        clientId: args.clientId,
        newState: args.newState,
        userId,
      });
      return asText(result);
    },
  },

  // Prospecting v3 — manual pipeline-stage promotion (the operator axis)
  {
    name: "prospect.promoteStage",
    description:
      "Move a prospect between the operator's 5 MANUAL pipeline stages (cold_outreach / warm_pre_meeting / warm_post_meeting / pre_qualification / qualified) — the axis behind the stage-by-stage /prospects dashboards. Any direction (force move), exact parity with the UI's promote control: patches pipelineStage and logs a prospectStageEvents row (kind 'pipeline_stage', reason 'manual') so rolling entered-this-month KPIs stay exact. This is a SEPARATE axis from prospectState (the 9-state position the outreach engine moves — use prospect.transitionState for that; promoting the stage does NOT touch prospectState or fire any outreach). Does NOT change clients.status either — graduating OUT of the pipeline to an active client is client.activate. Only meaningful for status='prospect' rows. Typical use: the operator says 'move Acme to pre-qual' / a stage-workspace chat graduates a company after a held meeting.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the prospect's clients row" },
        toStage: {
          type: "string",
          description: "cold_outreach | warm_pre_meeting | warm_post_meeting | pre_qualification | qualified",
        },
      },
      required: ["clientId", "toStage"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.prospectStages.setPipelineStageInternal, {
        clientId: args.clientId,
        toStage: args.toStage,
        reason: "manual",
        userId,
        mode: "force",
      });
      return asText(result);
    },
  },

  // Prospecting v3 — sub-stage ladder step (pre-qualification / qualified)
  {
    name: "prospect.setQualSubStage",
    description:
      "Set a prospect's current SUB-STAGE ladder step. Two ladders share this field, gated by pipelineStage: the pre_qualification ladder (modelling_required → modelling_review_required → qualitative_feedback_required → feedback_given → feedback_discussed) and the qualified ladder (terms_requested → terms_presented → progression_to_credit → formal_dd → credit_approved). Set the stage first (prospect.promoteStage) if the prospect isn't in the matching stage — this tool does not validate the pairing (parity with the UI mutation). Logs a prospectStageEvents row (kind 'qual_substage') for exact rolling KPIs. Typical use: 'Acme's model is built, mark it for review' → modelling_review_required; 'terms came back from two lenders' → terms_presented.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the prospect's clients row" },
        subStage: {
          type: "string",
          description:
            "Pre-qual ladder: modelling_required | modelling_review_required | qualitative_feedback_required | feedback_given | feedback_discussed. Qualified ladder: terms_requested | terms_presented | progression_to_credit | formal_dd | credit_approved.",
        },
      },
      required: ["clientId", "subStage"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.prospectStages.setQualSubStageInternal, {
        clientId: args.clientId,
        subStage: args.subStage,
        userId,
      });
      return asText(result);
    },
  },

  // v1.2 prospects CRM — operator edit on a single touch
  {
    name: "cadence.update",
    description:
      "Edit an existing cadence row — its drafted content (`preDraftedTouch`), schedule (`nextDueAt`), recurrence config (`scheduleConfig`: intervalDays / anchorDate / customSchedule), and/or `cadenceType`. All fields optional; only what you pass is changed. Sets editedByOperator + editedAt audit fields (revision re-runs then skip overwriting unless the operator's note calls out the edited touch). Use to reconfigure a cadence from Claude Code — e.g. change a quarterly prospect_followup to monthly, retype it, or rewrite a touch.",
    inputSchema: {
      type: "object",
      properties: {
        cadenceId: { type: "string" },
        preDraftedTouch: {
          type: "object",
          properties: {
            subject: { type: "string" },
            bodyText: { type: "string" },
            bodyHtml: { type: "string" },
            dynamicVars: { type: "object" },
          },
        },
        nextDueAt: { type: "string", description: "ISO timestamp for the next send." },
        cadenceType: {
          type: "string",
          description: "Retype the cadence: prospect_followup / warm_lead_chase / execution_chaser / client_checkin / bdm_relationship / monitoring_ask / post_lost_re_engagement / custom.",
        },
        scheduleConfig: {
          type: "object",
          description: "Recurrence config.",
          properties: {
            intervalDays: { type: "number", description: "Simple recurring interval, e.g. 90 for quarterly, 30 for monthly." },
            anchorDate: { type: "string", description: "ISO date the schedule anchors to." },
            customSchedule: { type: "object", description: "Flexible config for non-trivial cadences." },
          },
        },
      },
      required: ["cadenceId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.cadences.updateInternal, {
        cadenceId: args.cadenceId,
        userId,
        preDraftedTouch: args.preDraftedTouch,
        nextDueAt: args.nextDueAt,
        cadenceType: args.cadenceType,
        scheduleConfig: args.scheduleConfig,
      });
      return asText(result);
    },
  },
  {
    name: "cadence.applyPresetSchedule",
    description:
      "Reconfigure a whole cadence PACKAGE's timing by intensity preset — `light` / `moderate` / `aggressive` — rescheduling every UNFIRED touch's nextDueAt off touch 1's anchor date (fired touches are left alone). The fastest way to make a cold-outreach sequence more or less aggressive from Claude Code. Get the packageId from cadence.create / cadence.listByPackage / cadence.listByClient. Returns counts: rescheduled + skippedFired.",
    inputSchema: {
      type: "object",
      properties: {
        packageId: { type: "string", description: "The shared packageId of the cadence touches." },
        preset: { type: "string", description: "light / moderate / aggressive." },
      },
      required: ["packageId", "preset"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.cadences.applyPresetScheduleInternal, {
        packageId: args.packageId,
        preset: args.preset,
        userId,
      });
      return asText(result);
    },
  },
  {
    name: "cadence.listByClient",
    description:
      "List all cadences attached to a client (via relatedClientId). Use to see + manage everything in flight for a client before editing/pausing/rescheduling. Returns the cadence rows (each with cadenceType, scheduleConfig, nextDueAt, isActive, packageId, packageApprovalStatus).",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" } },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.cadences.listByClient, { clientId: args.clientId });
      return asText(result);
    },
  },
  {
    name: "cadence.listByContact",
    description:
      "List all cadences targeting a specific contact (via contactId). Use to see + manage a person's outreach touches before editing/pausing/rescheduling.",
    inputSchema: {
      type: "object",
      properties: { contactId: { type: "string" } },
      required: ["contactId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.cadences.listByContact, { contactId: args.contactId });
      return asText(result);
    },
  },

  // v1.2 prospects CRM — request revision on a cadence package
  {
    name: "cadence.requestRevision",
    description:
      "Mark all cadences in a package as revision-requested with an operator note. Skill re-runs use the note as context to produce a new package; the new package's diff is shown to the operator for per-touch accept/reject.",
    inputSchema: {
      type: "object",
      properties: {
        packageId: { type: "string" },
        revisionNote: { type: "string", description: "Operator's free-text revision note (e.g., 'too aggressive on rates')" },
      },
      required: ["packageId", "revisionNote"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.cadences.requestRevisionInternal, {
        packageId: args.packageId,
        userId,
        revisionNote: args.revisionNote,
      });
      return asText(result);
    },
  },

  // v1.2 prospects CRM — list unprocessed candidates for prospect-intel
  {
    name: "companies.listUnprocessed",
    description:
      "List HubSpot-synced companies that don't have a prospect-intel skillRun yet (or are in NEW/RUNNING/STUCK state). Used by Claude Code to find batch candidates for prospect-intel runs. Default filter: states=['new'], sinceDays=30, limit=25, excludePromoted=true. Returns rows with a per-row 'state' field.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Default 25" },
        sinceDays: { type: "number", description: "Only companies created in last N days; default 30" },
        states: {
          type: "array",
          items: { type: "string" },
          description: "Subset of ['new', 'running', 'stuck']; default ['new']",
        },
        excludePromoted: { type: "boolean", description: "Default true" },
        lifecycleStage: { type: "string", description: "Optional HubSpot lifecycleStage filter" },
      },
      required: [],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(internal.companies.listUnprocessedInternal, {
        limit: args.limit ?? 25,
        sinceDays: args.sinceDays ?? 30,
        states: args.states ?? ["new"],
        excludePromoted: args.excludePromoted ?? true,
        lifecycleStage: args.lifecycleStage,
      });
      return asText(result);
    },
  },

  // v1.x prospect-intel: Companies House NAME search (resolve name → number)
  {
    name: "companies.searchCompaniesHouse",
    description:
      "Search Companies House by company NAME and return ranked matches via the CH search API. Use this FIRST when you have a prospect's name but not its Companies House number — pick the right company_number from the results, then call companies.syncCompaniesHouse({chNumber}) to fetch + persist its data. Read-only (does not persist). Each result has: company_number, title, company_status (active/dissolved/liquidation/...), date_of_creation, address_snippet, and sic_codes when CH returns them on the hit. Returns { ok, query, totalResults, returnedResults, results[] }. Errors: COMPANIES_HOUSE_API_KEY not set (Convex env gap).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text company name to search for, e.g. 'Opulence Property Group'." },
        limit: { type: "number", description: "Max matches to return (1-100). Default 20." },
      },
      required: ["query"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runAction(internal.companiesHouse.searchCompaniesHouseInternal, {
        query: args.query,
        limit: args.limit,
      });
      return asText(result);
    },
  },

  // v1.2 prospect-intel hardening: trigger CH sync for a single company
  {
    name: "companies.syncCompaniesHouse",
    description:
      "Fetch a Companies House company by number — profile + charges + officers + PSCs — via the CH API and persist into RockCap's companiesHouseCompanies / Charges / Officers / PSC tables. Each officer row stores its CH links.officer.appointments URL (a join key for cross-company appointment resolution). Idempotent: re-running upserts existing rows on their natural keys. Called by prospect-intel skill workflow step 2 to ensure CH data is present before running lender-DNA analysis. Returns summary counts (chargesCount, officersCount, pscCount). Common errors: company_not_found_on_companies_house (CH returned 404 — verify the number) or COMPANIES_HOUSE_API_KEY not set (Convex env config gap).",
    inputSchema: {
      type: "object",
      properties: {
        chNumber: {
          type: "string",
          description: "Companies House number. 8 digits or 6 digits prefixed by SC/NI/OC etc. Will be normalised to uppercase + trimmed.",
        },
      },
      required: ["chNumber"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runAction(internal.companiesHouse.syncOneCompanyFromCHInternal, {
        companyNumber: args.chNumber,
      });
      return asText(result);
    },
  },

  // The people behind a synced company. companies.syncCompaniesHouse persists
  // officers/PSCs but returns only counts — this reads the names back, which
  // is the seed for contact discovery (apollo.findEmail needs a name; there
  // is no company-wide people search).
  {
    name: "companies.getOfficers",
    description:
      "Officers + PSCs of a Companies House company ALREADY SYNCED into RockCap's mirror tables, by CH number. Read-only. Call companies.syncCompaniesHouse({chNumber}) first if not yet synced (this returns error company_not_synced otherwise). Returns { ok, companyNumber, companyName, activeOfficerCount, officers: [{name, officerRole, appointedOn, resignedOn, isActive, occupation, nationality, appointmentsLink}] (active first, newest appointment first), psc: [{name, pscType, naturesOfControl, ceasedOn}] }. This is the name-seed for contact discovery: apollo.findEmail can only enrich a NAMED person (no company-wide people search exists), so lender-intel's enrich gauntlet and prospect-intel's director step read names here, then enrich each via apollo.findEmail and persist keepers via contact.create. appointmentsLink feeds companies.getOfficerAppointments for cross-company group walks.",
    inputSchema: {
      type: "object",
      properties: {
        companyNumber: {
          type: "string",
          description: "Companies House number (normalised to uppercase + trimmed).",
        },
      },
      required: ["companyNumber"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.companiesHouse.getOfficersByCompanyNumber, {
        companyNumber: args.companyNumber,
      });
      return asText(result);
    },
  },

  // prospect-intel corporate-group resolution: an individual's other CH
  // appointments. Given an officer's stored appointments link, returns the
  // person's full appointment list so the resolve-related-entities sub-skill
  // can map likely sibling SPVs controlled by the same director/PSC.
  {
    name: "companies.getOfficerAppointments",
    description:
      "Fetch an individual's full Companies House appointment list via the CH API. Pass `appointmentsLink` — the stored `links.officer.appointments` path persisted on each companiesHouseOfficers row (e.g. '/officers/{appointment_id}/appointments') — exactly as returned by companies.syncCompaniesHouse. (Or pass a bare `appointmentId`, which is normalised to the canonical path.) Read-only (does NOT persist). For each appointment returns: company_number, company_name, company_status (active/dissolved/...), officer_role, appointed_on, resigned_on, plus the appointed person's name + date_of_birth (echoed per-row for disambiguation when a common name resolves to multiple officers). Also returns a top-level name + date_of_birth and an activeCount split. Used by prospect-intel (via the resolve-related-entities sub-skill) to map the corporate group: a majority PSC/director who controls the prospect usually controls the sibling SPVs too, so their other active appointments reveal likely scheme vehicles vs the trading parent. The heuristic is a strong signal, not proof of ownership. Errors: missing_appointments_link_or_id (neither arg supplied), officer_appointments_not_found (CH 404), or COMPANIES_HOUSE_API_KEY not set (Convex env gap).",
    inputSchema: {
      type: "object",
      properties: {
        appointmentsLink: {
          type: "string",
          description:
            "The stored CH `links.officer.appointments` path (e.g. '/officers/abc123.../appointments'). Pass verbatim from companiesHouseOfficers.appointmentsLink. A full CH URL or leading-slash-less path is also accepted and normalised.",
        },
        appointmentId: {
          type: "string",
          description:
            "Alternative to appointmentsLink: a bare CH officer appointment id, normalised to '/officers/{id}/appointments'.",
        },
      },
      required: [],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runAction(internal.companiesHouse.getOfficerAppointmentsInternal, {
        appointmentsLink: args.appointmentsLink,
        appointmentId: args.appointmentId,
      });
      return asText(result);
    },
  },

  // Corporate-structure chart renderer: ownership-only layout SVG + data URI.
  {
    name: "structure.renderChart",
    description:
      "Render a corporate StructureGraph to a styled SVG (ownership-only layout) + a data:image/svg+xml URI + the high/med/low verdict. Pass { graph } (shape per src/lib/structure/types.ts). Use after building the graph in the corporate-structure skill: embed the returned dataUri in intelMarkdown and inline the svg in a lender brief's Corporate Structure section. Read-only (does not persist).",
    inputSchema: {
      type: "object",
      properties: { graph: { type: "object", description: "StructureGraph { subjectClientId, asOf, nodes[], edges[] }" } },
      required: ["graph"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runAction(internal.structureGen.renderChart, { graph: args.graph });
      return asText(result);
    },
  },

  // Corporate-group charge rollup: aggregates the Companies House charge book
  // across a prospect's parent + sibling-SPV CH numbers (the ones persisted on
  // clients.relatedCompaniesHouseNumbers by resolve-related-entities). Mirrors
  // the prospect CH-tab "Group charges" section.
  {
    name: "companies.getGroupCharges",
    description:
      "Aggregate the Companies House charge book across a prospect's whole corporate group — the parent (clients.companiesHouseNumber) plus the sibling SPVs on clients.relatedCompaniesHouseNumbers (set by the resolve-related-entities sub-skill). Read-only. A single CH number understates a developer's borrowing because schemes are spread across SPVs; this rolls the group's charges into one view. Returns { companyCount, totalCharges, activeCharges, satisfiedCharges, distinctLenders, lendersByCount: [{name,total,active}] (desc), byCompany: [{companyNumber,companyName,chargesCount,activeCount}], charges: [{companyNumber,companyName,companyStatus?,chargeId,lender,date?,status?,description?}] (newest-first) }. Returns the empty shape (companyCount 0, charges []) when the client has no related numbers. CH numbers not yet synced (no companiesHouseCompanies row) are skipped. Powers the prospect CH-tab group-charges rollup.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the prospect's clients row" },
      },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.companies.getGroupCharges, {
        clientId: args.clientId,
      });
      return asText(result);
    },
  },

  {
    name: "companies.mapGroup",
    description:
      "One-call group map: returns the prospect group's CH numbers + the distinct directors across them (with each director's appointmentsLink). The starting point for the corporate-structure walk — feed each appointmentsLink to companies.getOfficerAppointments to find scheme SPVs, and search CH by the deal/scheme name. Director != owner: confirm ownership via PSC before crediting a company to the prospect. Read-only; aggregates already-synced rows.",
    inputSchema: { type: "object", properties: { clientId: { type: "string", description: "Convex id of the prospect's clients row" } }, required: ["clientId"] },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.companies.mapGroup, { clientId: args.clientId });
      return asText(result);
    },
  },

  {
    name: "companies.getLenderTierConflict",
    description:
      "Check a prospect's group lenders against RockCap's protected lender tiers. Returns { action: 'park'|'soften'|'none', tier1[], tier2[] }. Tier 1 (favourite lender, e.g. Quantum) means park the prospect (do not pitch cold); Tier 2 (preferred, e.g. Yellow Tree) means soften the hook to broad-brush. Consulted before drafting cold outreach. Source of truth: skills/shared-references/lender-tiers.md.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the prospect's clients row" },
      },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.companies.getLenderTierConflict, {
        clientId: args.clientId,
      });
      return asText(result);
    },
  },

  {
    name: "companies.getProspectSchemes",
    description:
      "Per-scheme view of a prospect's corporate group: one row per charge-bearing SPV, split into live[] and past[] (live = active company with an outstanding charge), each ranked by most-recent charge date. Merges the SPV's charges (lender(s), dates) with any prospectSchemes enrichment (address, what they're building, confidence). Powers the Track Record tab. Args: { clientId }.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string", description: "Convex id of the prospect's clients row" } },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.companies.getProspectSchemes, { clientId: args.clientId });
      return asText(result);
    },
  },

  {
    name: "companies.upsertProspectScheme",
    description:
      "Upsert per-scheme enrichment for a prospect (keyed by clientId + companyNumber). The prospect-intel skill writes draft estimates (operatorConfirmed defaults false); operator edits in the Track Record tab set operatorConfirmed true and are not clobbered by skill re-runs. Pass address, planningRefs, estimatedUnits, schemeType, whatBuilding, gdvEstimate (range string), confidence ('high'|'med'|'low'), status ('live'|'past'), sourceUrls. Surface-only: does not create clients/companies rows.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string" },
        companyNumber: { type: "string" },
        companyName: { type: "string" },
        schemeName: { type: "string" },
        address: { type: "string" },
        planningRefs: { type: "array", items: { type: "string" } },
        estimatedUnits: { type: "number" },
        schemeType: { type: "string" },
        whatBuilding: { type: "string" },
        gdvEstimate: { type: "string" },
        confidence: { type: "string" },
        status: { type: "string" },
        sourceUrls: { type: "array", items: { type: "string" } },
        operatorConfirmed: { type: "boolean" },
      },
      required: ["clientId", "companyNumber", "companyName"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(api.companies.upsertProspectScheme, args);
      return asText(result);
    },
  },

  // v1.2.4 prospect-intel hardening: structured prospect facts
  {
    name: "clients.setProspectFacts",
    description:
      "Set structured prospect facts on a clients row (companiesHouseNumber, relatedCompaniesHouseNumbers, website, primaryDirectorName, primaryContactId, dealType, dealSizeRange). Called by prospect-intel workflow step 10 to promote facts out of intelMarkdown text into queryable DB columns. The CRM aside / PeopleTab / OverviewTab / prospects table read these directly when present and fall back to regex extraction on intelMarkdown when undefined (legacy data). relatedCompaniesHouseNumbers persists the corporate-group sibling SPVs discovered by the resolve-related-entities sub-skill — it powers the CH-tab group-charges rollup (companies.getGroupCharges). All fields are optional — pass only what you've discovered. Idempotent: re-running overwrites.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the clients row" },
        companiesHouseNumber: { type: "string", description: "8-digit CH number, or 6 digits prefixed by SC/NI/OC" },
        relatedCompaniesHouseNumbers: {
          type: "array",
          items: { type: "string" },
          description: "Corporate-group SPV Companies House numbers discovered via the resolve-related-entities sub-skill's director-appointment walk. EXCLUDE the parent (that's companiesHouseNumber). Each is an 8-digit CH number (or 6 digits prefixed by SC/NI/OC). Powers the prospect CH-tab group-charges rollup. Pass the full set each time — re-running overwrites.",
        },
        website: { type: "string", description: "Full URL (e.g., 'https://example.co.uk') or 'not-found' if confirmed-absent" },
        primaryDirectorName: { type: "string", description: "Director name as it should appear in the UI — operator-readable, not necessarily matching CH's surname-first format" },
        primaryContactId: { type: "string", description: "Convex id of the primary contact for outreach (the one cadences should target)" },
        dealType: {
          type: "string",
          enum: ["new_development", "bridging", "existing_asset", "unclassifiable"],
          description: "Canonical deal-type classification from prospect-intel (see bridging-vs-developer.md). One of: new_development, bridging, existing_asset, unclassifiable.",
        },
        dealSizeRange: {
          type: "string",
          description: "Display string carrying the indicative deal size as range + confidence + basis, e.g. '£2-5m, medium confidence, based on Woodberry Park 48 units'. Never a naked number. Omit for unclassifiable prospects.",
        },
      },
      required: ["clientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.clients.setProspectFactsInternal, {
        clientId: args.clientId,
        companiesHouseNumber: args.companiesHouseNumber,
        relatedCompaniesHouseNumbers: args.relatedCompaniesHouseNumbers,
        website: args.website,
        primaryDirectorName: args.primaryDirectorName,
        primaryContactId: args.primaryContactId,
        dealType: args.dealType,
        dealSizeRange: args.dealSizeRange,
      });
      return asText(result);
    },
  },

  // v1.2.3 prospect-intel hardening: Apollo email discovery
  {
    name: "apollo.findEmail",
    description:
      "Find a person's email address via Apollo's people-match API. Pass firstName + lastName + ideally companyName or companyDomain for disambiguation. Returns {ok, found, email, emailStatus, title, linkedinUrl, photoUrl, apolloPersonId, organization}. emailStatus values: 'verified' (safe for outreach), 'unverified' (needs manual confirmation), 'questionable' (do not use), 'unavailable' (Apollo has no email for this person). The cadence engine should refuse to fire on non-verified emails. Cost: 1 Apollo credit per successful reveal. Errors: APOLLO_API_KEY not set, apollo_auth_error, apollo_rate_limit, apollo_http_<status>.",
    inputSchema: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "Person's first name (e.g., 'Shane')" },
        lastName: { type: "string", description: "Person's surname (e.g., 'Gordon')" },
        companyName: {
          type: "string",
          description: "Optional but strongly recommended — the company name to disambiguate (e.g., 'Opulence Property Group Ltd')",
        },
        companyDomain: {
          type: "string",
          description: "Optional — the company's website domain (e.g., 'opulencepropertygroup.co.uk'). Used as fallback disambiguator if companyName is ambiguous.",
        },
      },
      required: ["firstName", "lastName"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runAction(internal.apollo.findPersonInternal, {
        firstName: args.firstName,
        lastName: args.lastName,
        companyName: args.companyName,
        companyDomain: args.companyDomain,
      });
      return asText(result);
    },
  },

  // v1.2 prospects CRM — operator-side read of an approval row
  {
    name: "approval.get",
    description:
      "Read an approval row by id (read-only). Closes the v1.1 gap where skills couldn't audit the approval rows they created. Returns the full row including draftPayload + linked entity ids.",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: { type: "string" },
      },
      required: ["approvalId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(internal.approvals.getInternal, {
        approvalId: args.approvalId,
      });
      if (!result) return asText({ error: "approval not found" });
      return asText(result);
    },
  },

  // ── v1.3 Sprint G: deferred writers, now wired ──────────────────
  //
  // Closes the four "deferred" gaps from the v1.3 catalogue. Skills
  // previously had to emit these as skillRun.complete.gaps; now they
  // can call the tool directly.

  {
    name: "intelligence.addKnowledgeItem",
    description:
      "Add a single canonical or non-canonical fact to a client's or project's intelligence library. Used by skills (qualify-and-draft, meeting-capture, deal-intake) to promote facts discovered in a reply / meeting transcript / document into the structured intelligence layer that the deep-context tools read from. Supersedes any prior active item with the same (clientId|projectId, fieldPath, qualifier) tuple — the prior item is marked status='superseded' and the new one becomes active. fieldPath examples: 'borrower.experienceYears', 'project.gdv', 'project.peakDebt', 'lender.appetiteMaxLtv'. valueType controls how the UI renders the value. sourceType='ai_extraction' for skill-derived facts; 'manual' for operator-entered; 'document' for extracted from an uploaded doc (then set sourceDocumentId).",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the client (mutually exclusive with projectId)" },
        projectId: { type: "string", description: "Convex id of the project (mutually exclusive with clientId)" },
        fieldPath: { type: "string", description: "Dotted path: e.g., 'borrower.experienceYears'" },
        isCanonical: { type: "boolean", description: "True if this is the canonical/authoritative value for this fieldPath" },
        category: { type: "string", description: "Grouping bucket: 'borrower' | 'project' | 'financials' | 'security' | 'lender' | 'kyc' | 'other'" },
        label: { type: "string", description: "Human-readable label shown in the UI (e.g., 'Years of dev experience')" },
        value: { description: "The actual value — type matches valueType. Pass number for number/currency/percentage, string for string/text/date, boolean for boolean, array for array." },
        valueType: {
          type: "string",
          enum: ["string", "number", "currency", "date", "percentage", "array", "text", "boolean"],
          description: "Controls UI rendering + downstream validation",
        },
        sourceType: {
          type: "string",
          enum: ["document", "manual", "ai_extraction", "data_library", "checklist"],
          description: "Where the value came from. Skill runs should use 'ai_extraction'.",
        },
        sourceDocumentId: { type: "string", description: "Optional Convex id of the document this fact was extracted from" },
        sourceDocumentName: { type: "string", description: "Optional human-readable doc name" },
        sourceText: { type: "string", description: "Optional verbatim sentence(s) from the source backing this fact" },
        qualifier: { type: "string", description: "Optional disambiguator when multiple items share the same fieldPath (e.g., scheme name)" },
        context: { type: "string", description: "Optional free-text context (e.g., 'mentioned on 2026-05-20 discovery call')" },
        addedBy: { type: "string", description: "Optional human-readable provenance string (defaults to skill name)" },
      },
      required: ["fieldPath", "isCanonical", "category", "label", "value", "valueType", "sourceType"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(api.knowledgeLibrary.addKnowledgeItem, {
        clientId: args.clientId,
        projectId: args.projectId,
        fieldPath: args.fieldPath,
        isCanonical: args.isCanonical,
        category: args.category,
        label: args.label,
        value: args.value,
        valueType: args.valueType,
        sourceType: args.sourceType,
        sourceDocumentId: args.sourceDocumentId,
        sourceDocumentName: args.sourceDocumentName,
        sourceText: args.sourceText,
        qualifier: args.qualifier,
        context: args.context,
        addedBy: args.addedBy,
      });
      return asText(result);
    },
  },

  {
    name: "intelligence.getKnowledgeItemsByClient",
    description:
      "Read back the structured knowledge items (facts) stored for a client — the AI-extracted (prospect-intel: lender DNA, classification, related entities) plus operator-entered facts that intelligence.addKnowledgeItem writes. Returns active items by default, sorted by category then fieldPath. Use this to read a client's captured facts without re-parsing the intel report's intelMarkdown (prospect.getDeepContext also now returns these under `knowledgeItems`). Optional category filter ('borrower'|'lender'|'project'|'financials'|'security'|'kyc'|'other') and status filter.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the client" },
        category: { type: "string", description: "Optional category filter (borrower / lender / project / financials / security / kyc / other)" },
        status: {
          type: "string",
          enum: ["active", "flagged", "archived", "superseded"],
          description: "Optional; defaults to active only",
        },
      },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.knowledgeLibrary.getKnowledgeItemsByClient, {
        clientId: args.clientId,
        category: args.category,
        status: args.status,
      });
      return asText(result);
    },
  },

  {
    name: "intelligence.updateClientIntelligence",
    description:
      "Enrich the structured clientIntelligence DOC for a client (partial merge — pass only the fields you have; objects merge, arrays/primitives replace; the row is created if absent). This is the canonical structured intelligence layer the deep-context tools read. prospect-intel calls this (Output #2) to promote identity + key people + a summary off the report into queryable fields: pass `identity` (legalName/tradingName/companyNumber/incorporationDate), `keyPeople` (one entry per key person, isDecisionMaker for the primary), `borrowerProfile` (experienceLevel/completedProjects/totalDevelopmentValue where derivable), and `aiSummary` (executiveSummary = the brief, keyFacts = bullet list incl. the lender-DNA one-liner). For discrete supersedable facts (e.g. a single GDV figure) prefer intelligence.addKnowledgeItem. `lenderProfile` here describes a client that IS a lender, not a borrower's lender DNA — leave it unset for borrowers.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the client" },
        identity: {
          type: "object",
          properties: {
            legalName: { type: "string" },
            tradingName: { type: "string" },
            companyNumber: { type: "string" },
            vatNumber: { type: "string" },
            incorporationDate: { type: "string", description: "ISO date" },
          },
        },
        primaryContact: {
          type: "object",
          properties: {
            name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, role: { type: "string" },
          },
        },
        addresses: {
          type: "object",
          properties: {
            registered: { type: "string" }, trading: { type: "string" }, correspondence: { type: "string" },
          },
        },
        keyPeople: {
          type: "array",
          description: "One entry per key person (PSCs + key directors). Mark the outreach/decision lead isDecisionMaker.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              isDecisionMaker: { type: "boolean" },
              notes: { type: "string" },
            },
            required: ["name"],
          },
        },
        borrowerProfile: {
          type: "object",
          properties: {
            experienceLevel: { type: "string" },
            completedProjects: { type: "number" },
            totalDevelopmentValue: { type: "number" },
            preferredPropertyTypes: { type: "array", items: { type: "string" } },
            preferredRegions: { type: "array", items: { type: "string" } },
          },
        },
        aiSummary: {
          type: "object",
          properties: {
            executiveSummary: { type: "string" },
            keyFacts: { type: "array", items: { type: "string" } },
          },
        },
        updatedBy: { type: "string", description: "Optional provenance label (e.g. 'prospect-intel')" },
      },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(api.intelligence.updateClientIntelligence, {
        clientId: args.clientId,
        identity: args.identity,
        primaryContact: args.primaryContact,
        addresses: args.addresses,
        keyPeople: args.keyPeople,
        borrowerProfile: args.borrowerProfile,
        aiSummary: args.aiSummary,
        updatedBy: args.updatedBy ?? "mcp",
      });
      return asText(result);
    },
  },

  // ── Operator context capture (2026-05-31) ──
  // The agent-side surface for the `client-context-capture` skill: a running
  // operator-knowledge reference (intelligence.appendContext) + a note lane
  // (note.*). See skills/skills/client-context-capture/SKILL.md.
  {
    name: "intelligence.appendContext",
    description:
      "Append a dated, operator-attributed markdown block to a client's OR a deal's running context reference (clientIntelligence.contextMarkdown / projectIntelligence.contextMarkdown). This is the home for OPERATOR-STATED primary knowledge — what the operator learned in a meeting/call or just knows — as opposed to document- or web-derived intel. The block is prepended (reverse-chronological) and the row is created if absent. Supply EXACTLY ONE of clientId / projectId (client-wide facts → clientId; deal-specific facts → projectId). Single responsibility: it writes only contextMarkdown; it does NOT touch the activity feed or the legacy recentUpdates field. Compose the block with a dated header line (e.g. '## 2026-05-31 — operator capture (Name)'), a '**Source:**' line, then the prose/bullets; mark unconfirmed items '(unconfirmed)'. For discrete supersedable facts, ALSO call intelligence.addKnowledgeItem with sourceType='manual'.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the client (mutually exclusive with projectId)" },
        projectId: { type: "string", description: "Convex id of the project/deal (mutually exclusive with clientId)" },
        markdownBlock: { type: "string", description: "The full dated markdown block to prepend (header line + Source line + body)" },
        addedBy: { type: "string", description: "Optional provenance label (defaults to 'client-context-capture')" },
      },
      required: ["markdownBlock"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.intelligence.appendContextInternal, {
        clientId: args.clientId,
        projectId: args.projectId,
        markdownBlock: args.markdownBlock,
        addedBy: args.addedBy,
      });
      return asText(result);
    },
  },
  {
    name: "note.create",
    description:
      "Create a freeform NOTE on a client or project (a separate lane from intelligence — use for a reminder, a to-do, a draft-this prompt, an unstructured jotting; use intelligence.appendContext / addKnowledgeItem for actual entity knowledge). Author in markdown (headings/bullets/quotes supported); it is converted to the notes editor's format. Pass clientId OR projectId to file it (filed notes are shared); pass neither to leave it unfiled under the calling operator. Returns the noteId.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short note title" },
        markdown: { type: "string", description: "Note body as markdown" },
        clientId: { type: "string", description: "Optional client to file the note under" },
        projectId: { type: "string", description: "Optional project to file the note under" },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
        emoji: { type: "string", description: "Optional emoji icon" },
      },
      required: ["title", "markdown"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.notes.createFromMarkdownInternal, {
        userId,
        title: args.title,
        markdown: args.markdown,
        emoji: args.emoji,
        clientId: args.clientId,
        projectId: args.projectId,
        tags: args.tags,
      });
      return asText({ noteId: result });
    },
  },
  {
    name: "note.update",
    description:
      "Update an existing note's title, body (markdown), and/or tags. Pass only the fields you want to change; markdown replaces the whole body.",
    inputSchema: {
      type: "object",
      properties: {
        noteId: { type: "string" },
        title: { type: "string" },
        markdown: { type: "string", description: "Replacement body as markdown" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["noteId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.notes.updateFromMarkdownInternal, {
        noteId: args.noteId,
        title: args.title,
        markdown: args.markdown,
        tags: args.tags,
      });
      return asText(result);
    },
  },
  {
    name: "note.listByClient",
    description: "List the notes filed under a client. Use to read existing notes before adding (avoid duplicates).",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" } },
      required: ["clientId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.notes.getByClient, { clientId: args.clientId });
      return asText(result);
    },
  },
  {
    name: "note.listByProject",
    description: "List the notes filed under a project/deal.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.notes.getByProject, { projectId: args.projectId });
      return asText(result);
    },
  },

  {
    name: "task.create",
    description:
      "Create an operator-facing task. Used by skills to surface follow-up work (e.g., meeting-capture creating 'Schedule follow-up call' or 'Send signed NDA'; qualify-and-draft creating 'Manual review of low-confidence reply'; deal-intake creating 'Request missing KYC items'). Tasks land in the operator's task inbox + appear on the linked client / project page. Defaults: status='todo', priority='medium', assignedTo=[calling operator]. Use `assignedTo` to route to a specific teammate.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short imperative title (e.g., 'Schedule follow-up with Shane Gordon')" },
        description: { type: "string", description: "Optional longer-form context" },
        notes: { type: "string", description: "Optional free-form notes" },
        dueDate: { type: "string", description: "Optional ISO timestamp" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Default 'medium'" },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags for filtering" },
        clientId: { type: "string", description: "Optional Convex id of the linked client" },
        projectId: { type: "string", description: "Optional Convex id of the linked project" },
        assignedTo: {
          type: "array",
          items: { type: "string" },
          description: "Optional array of Convex user ids; defaults to the calling operator",
        },
        attachmentIds: { type: "array", items: { type: "string" }, description: "Optional document ids to attach" },
        contactIds: { type: "array", items: { type: "string" }, description: "Optional contact ids to link" },
      },
      required: ["title"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.tasks.createInternal, {
        userId,
        title: args.title,
        description: args.description,
        notes: args.notes,
        dueDate: args.dueDate,
        priority: args.priority,
        tags: args.tags,
        clientId: args.clientId,
        projectId: args.projectId,
        assignedTo: args.assignedTo,
        attachmentIds: args.attachmentIds,
        contactIds: args.contactIds,
      });
      return asText(result);
    },
  },

  {
    name: "task.get",
    description:
      "Fetch a single task by id. Returns the full task row (title, status, priority, dueDate, assignees, linked client/project, tags, notes) or null if it doesn't exist or the calling operator isn't the creator/assignee.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Convex id of the task" },
      },
      required: ["id"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(internal.tasks.getInternal, {
        userId,
        id: args.id,
      });
      return asText(result);
    },
  },

  {
    name: "task.list",
    description:
      "List the calling operator's tasks (created by or assigned to them), most-recently-updated first. Filter by status, client, project, or tags. Use to answer 'what's on my plate', surface overdue/open follow-ups for a client, or check whether a follow-up task already exists before creating a duplicate.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["todo", "in_progress", "completed", "cancelled", "paused"],
          description: "Optional status filter",
        },
        clientId: { type: "string", description: "Optional Convex client id filter" },
        projectId: { type: "string", description: "Optional Convex project id filter" },
        tags: { type: "array", items: { type: "string" }, description: "Optional tag filter (matches any)" },
        includeCreated: { type: "boolean", description: "Include tasks the operator created (default true)" },
        includeAssigned: { type: "boolean", description: "Include tasks assigned to the operator (default true)" },
      },
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(internal.tasks.getByUserInternal, {
        userId,
        status: args.status,
        clientId: args.clientId,
        projectId: args.projectId,
        tags: args.tags,
        includeCreated: args.includeCreated,
        includeAssigned: args.includeAssigned,
      });
      return asText(result);
    },
  },

  {
    name: "task.update",
    description:
      "Update fields on an existing task — retitle, change status/priority, reschedule (dueDate), edit notes, reassign, or relink client/project. Only the creator or an assignee may edit. Stakeholders are notified of status/dueDate/notes/assignee changes. Pass null to clear an optional field (dueDate, clientId, projectId, assignedTo, attachmentIds). To mark a task done prefer `task.complete` (it also notifies + logs completion).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Convex id of the task (required)" },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New longer-form context" },
        notes: { type: "string", description: "New free-form notes" },
        dueDate: { type: ["string", "null"], description: "New ISO timestamp, or null to clear" },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "completed", "cancelled", "paused"],
          description: "New status",
        },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "New priority" },
        tags: { type: "array", items: { type: "string" }, description: "Replacement tag list" },
        clientId: { type: ["string", "null"], description: "Relink to a client, or null to clear" },
        projectId: { type: ["string", "null"], description: "Relink to a project, or null to clear" },
        assignedTo: {
          type: ["array", "null"],
          items: { type: "string" },
          description: "Replacement array of Convex user ids, or null to unassign",
        },
        attachmentIds: {
          type: ["array", "null"],
          items: { type: "string" },
          description: "Replacement document id list, or null to clear",
        },
      },
      required: ["id"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.tasks.updateInternal, {
        userId,
        id: args.id,
        title: args.title,
        description: args.description,
        notes: args.notes,
        dueDate: args.dueDate,
        status: args.status,
        priority: args.priority,
        tags: args.tags,
        clientId: args.clientId,
        projectId: args.projectId,
        assignedTo: args.assignedTo,
        attachmentIds: args.attachmentIds,
      });
      return asText(result);
    },
  },

  {
    name: "task.complete",
    description:
      "Mark a task as completed. Notifies stakeholders and logs the completion to any open flag thread on the task. Only the creator or an assignee may complete it. Prefer this over `task.update` with status='completed' so the completion side-effects fire.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Convex id of the task" },
      },
      required: ["id"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.tasks.completeInternal, {
        userId,
        id: args.id,
      });
      return asText(result);
    },
  },

  {
    name: "task.delete",
    description:
      "Permanently delete a task. Only the task creator may delete it; stakeholders are notified before removal. Irreversible — to keep an audit trail, prefer setting status to 'cancelled' via `task.update` instead.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Convex id of the task" },
      },
      required: ["id"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.tasks.removeInternal, {
        userId,
        id: args.id,
      });
      return asText(result);
    },
  },

  {
    name: "document.createFromGeneration",
    description:
      "Persist a document that was *generated* by a skill (e.g., lender brief package, IC paper, terms-comparison memo, post-meeting notes) into the documents table. Content lives inline in the `summary` field as markdown / plain text — no file storage required until a separate markdown→PDF/DOCX conversion step runs. The resulting row appears in the standard documents UI (filterable by category, linkable to a project, etc.). For UPLOADS of files (PDFs / spreadsheets), use the normal documents.create flow with file storage. For pre-existing docs that need linking to a project, use document.linkToProject.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Optional Convex id of the linked client" },
        projectId: { type: "string", description: "Optional Convex id of the linked project" },
        fileName: { type: "string", description: "Display name for the generated artefact (e.g., 'Comberton — Lender Brief Package.md')" },
        fileTypeDetected: {
          type: "string",
          description: "Operator-facing artefact type (e.g., 'Lender Brief Package', 'IC Paper', 'Terms Comparison Memo', 'Meeting Notes')",
        },
        category: {
          type: "string",
          description: "Document category for filing (e.g., 'Lender outreach', 'Credit submission', 'Meeting notes')",
        },
        summary: { type: "string", description: "The full generated content (markdown or plain text). Becomes the document body." },
        reasoning: { type: "string", description: "Optional 1-2 sentence operator-facing explanation of what this artefact is + when it was generated" },
        sourceSkillRunId: { type: "string", description: "Optional Convex id of the skillRun that produced this artefact (for provenance)" },
        isBaseDocument: { type: "boolean", description: "True if this should appear in the client's Base Documents folder (default false)" },
      },
      required: ["fileName", "fileTypeDetected", "category", "summary"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(api.documents.createFromGeneration, {
        clientId: args.clientId,
        projectId: args.projectId,
        fileName: args.fileName,
        fileTypeDetected: args.fileTypeDetected,
        category: args.category,
        summary: args.summary,
        reasoning: args.reasoning,
        sourceSkillRunId: args.sourceSkillRunId,
        isBaseDocument: args.isBaseDocument,
      });
      return asText(result);
    },
  },

  {
    name: "project.addLenderRole",
    description:
      "Idempotently add a lender (clients row with type='lender') to a project's clientRoles array. Used by the terms-package-build workflow after lender.matchForDeal picks a shortlist — each chosen lender is attached to the project here before outreach.draftToLender stages an approval per lender. Refuses non-lender clients with error='not_a_lender' (use projects.update directly for borrower/developer/professional roles). If the lender + role pair is already present, returns ok:true with idempotent:true.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Convex id of the project" },
        clientId: { type: "string", description: "Convex id of the lender (clients row with type='lender')" },
        role: { type: "string", description: "Default 'lender'. Use 'co-lender' / 'syndicate-lead' for multi-lender deals." },
      },
      required: ["projectId", "clientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(api.projects.addLenderRole, {
        projectId: args.projectId,
        clientId: args.clientId,
        role: args.role,
      });
      return asText(result);
    },
  },

  // ── v1.4 Sprint H: misclassification fixers ──────────────────────
  //
  // The V4 ingestion classifier makes mistakes. Skills + operators
  // see these mistakes via `client.getDeepContext` / `project.getDeepContext`
  // (e.g., a checklist item shows status='fulfilled' but the linked
  // primaryDocument is obviously wrong). These three tools let the
  // operator / skill correct the record without leaving Claude Code.
  //
  // Typical flow: operator notices misclassification → calls
  // checklist.unlinkDocument to remove the wrong link → optionally
  // calls document.updateClassification to fix the doc's own category
  // → calls checklist.linkDocument to attach the correct doc to the
  // requirement.

  {
    name: "document.updateClassification",
    description:
      "Patch a document's classification fields (category, fileTypeDetected, summary, reasoning) — for correcting V4 ingestion classifier mistakes. Use when you've identified that a document is in the wrong category (e.g., an email auto-classified as 'Scheme Brief' should be 'Communications'). Does NOT change the file itself, only its metadata. Common cases: (1) V4 mis-categorised a doc, (2) the operator wants to add a more specific fileTypeDetected (e.g., 'Personal Guarantee' instead of generic 'Legal Document'), (3) the summary or reasoning is wrong and worth re-stating. Each field is optional; pass only what you want to change. Does not re-run V4 — strictly a metadata patch.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Convex id of the document" },
        category: {
          type: "string",
          description: "New canonical category, e.g., 'Legal Documents' | 'Professional Reports' | 'Project Plans' | 'Project Information' | 'Communications' | 'KYC' | 'Financial Documents' | 'Insurance' | 'Photographs' | 'Warranties' (see CATALOGUE for full list). Optional — omit to leave unchanged.",
        },
        fileTypeDetected: {
          type: "string",
          description: "More specific type tag (e.g., 'Personal Guarantee', 'Floorplan', 'Red Book Valuation'). Used by checklist auto-matching. Optional.",
        },
        summary: {
          type: "string",
          description: "Replacement summary text (markdown). Optional. Use when V4's summary is materially wrong, not for minor tweaks.",
        },
        reasoning: {
          type: "string",
          description: "Free-text rationale for the correction (audit trail). Recommended whenever you change category or fileTypeDetected so the next reviewer knows why.",
        },
      },
      required: ["documentId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(api.documents.update, {
        id: args.documentId,
        category: args.category,
        fileTypeDetected: args.fileTypeDetected,
        summary: args.summary,
        reasoning: args.reasoning,
      });
      return asText({ ok: true, documentId: args.documentId, updatedFields: Object.keys(args).filter(k => k !== "documentId" && args[k] !== undefined) });
    },
  },

  {
    name: "checklist.linkDocument",
    description:
      "Link a document to a checklist item (knowledgeChecklistItems row). If this is the first document linked, the item's status becomes 'fulfilled' and the doc becomes the primary. If links already exist, the new one is added as non-primary. Idempotent: returns alreadyExists=true if the same doc was already linked. Use when (1) V4 failed to auto-link an obviously-fulfilling doc, OR (2) operator wants to attach a second supporting doc to a requirement (e.g., a revised floorplan alongside the original).",
    inputSchema: {
      type: "object",
      properties: {
        checklistItemId: { type: "string", description: "Convex id of the knowledgeChecklistItems row" },
        documentId: { type: "string", description: "Convex id of the document to link" },
      },
      required: ["checklistItemId", "documentId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(api.knowledgeLibrary.linkDocumentToChecklistItem, {
        checklistItemId: args.checklistItemId,
        documentId: args.documentId,
        userId,
      });
      return asText(result);
    },
  },

  {
    name: "checklist.unlinkDocument",
    description:
      "Remove a document link from a checklist item. If the unlinked doc was the primary AND other links remain, the oldest remaining link is auto-promoted to primary. If no links remain, the item's status reverts to 'missing'. Use when V4 wrongly linked a non-matching doc to a requirement (e.g., a HoTs Comparison wrongly linked to the 'Planning Decision Notice' requirement) and you want to clean up. Pair with document.updateClassification when the doc itself is also miscategorised.",
    inputSchema: {
      type: "object",
      properties: {
        checklistItemId: { type: "string", description: "Convex id of the knowledgeChecklistItems row" },
        documentId: { type: "string", description: "Convex id of the document to unlink" },
      },
      required: ["checklistItemId", "documentId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(api.knowledgeLibrary.unlinkDocumentFromChecklistItem, {
        checklistItemId: args.checklistItemId,
        documentId: args.documentId,
      });
      return asText(result);
    },
  },

  // ── v1.4 Sprint I: lifecycle transitions for deal-intake ────────────
  //
  // The deal-intake skill is the lynchpin moment when a prospect becomes
  // an active client + a project comes into being. These two tools wire
  // the substrate so the skill can actually fire those transitions
  // (previously both required `npx convex run` fallback).

  {
    name: "client.activate",
    description:
      "Promote a client from prospect to active. Atomic: (1) patches `clients.status` to 'active', (2) if `prospectState` is set + not terminal, transitions to 'promoted' with audit fields, (3) schedules the HubSpot lifecycleStage push-back. Idempotent: returns ok:true with idempotent:true if client is already active. The natural firing point is the deal-intake skill — after the first meaningful doc batch arrives + a project is created, the client conceptually transitions from 'lead we're chasing' to 'active client we're executing on.' Operators can also fire manually for non-deal-intake activations (e.g., a referred direct-active client that skipped the prospect phase).",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the client to activate" },
      },
      required: ["clientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.clients.activateInternal, {
        clientId: args.clientId,
        userId,
      });
      return asText(result);
    },
  },

  {
    name: "project.create",
    description:
      "Create a new project (a deal record). Auto-generates a 10-char shortcode if not provided; uniqueness checked. Auto-seeds folder structure based on the primary client's type (borrower / lender / developer). Default status is 'active'. The natural firing point is the deal-intake skill — after detecting the deal type + phase, the skill creates the project as the substrate the docs will be filed against. Returns the new projectId. Errors: shortcode_in_use (operator-provided shortcode collides) — auto-generation avoids this by appending a counter.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name (e.g., 'Comberton', 'Manor Park Refinance')" },
        clientId: { type: "string", description: "Convex id of the primary client (borrower). Convenience field — wraps into clientRoles array with role='borrower'." },
        clientRoles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              clientId: { type: "string" },
              role: { type: "string", description: "borrower / developer / lender / professional / etc." },
            },
            required: ["clientId", "role"],
          },
          description: "Alternative to `clientId` — full clientRoles array for multi-party deals. If both `clientId` and `clientRoles` provided, `clientRoles` wins.",
        },
        projectShortcode: { type: "string", description: "Optional 10-char shortcode for document naming. Auto-generated if omitted." },
        description: { type: "string", description: "Optional project description" },
        address: { type: "string", description: "Scheme address" },
        city: { type: "string" },
        state: { type: "string", description: "UK county / region" },
        zip: { type: "string", description: "UK postcode" },
        country: { type: "string", description: "Default 'United Kingdom'" },
        status: {
          type: "string",
          enum: ["active", "inactive", "completed", "on-hold", "cancelled"],
          description: "Default 'active'",
        },
        lifecycleStage: {
          type: "string",
          enum: ["prospective", "active", "completed", "on-hold", "cancelled", "archived"],
          description: "Optional. Defaults based on status.",
        },
        loanAmount: { type: "number", description: "Optional headline loan amount in GBP" },
        notes: { type: "string", description: "Optional free-text notes" },
      },
      required: ["name"],
    },
    handler: async (ctx, userId, args) => {
      // Resolve clientRoles: explicit array wins; else build from `clientId`
      let clientRoles = args.clientRoles;
      if (!clientRoles || clientRoles.length === 0) {
        if (!args.clientId) {
          return asText({ error: "must provide either clientId or clientRoles" });
        }
        clientRoles = [{ clientId: args.clientId, role: "borrower" }];
      }
      const result = await ctx.runMutation(api.projects.create, {
        name: args.name,
        clientRoles,
        projectShortcode: args.projectShortcode,
        description: args.description,
        address: args.address,
        city: args.city,
        state: args.state,
        zip: args.zip,
        country: args.country ?? "United Kingdom",
        status: args.status,
        lifecycleStage: args.lifecycleStage,
        loanAmount: args.loanAmount,
        notes: args.notes,
      });
      return asText({ ok: true, projectId: result });
    },
  },

  // ── P4: ad-hoc document generation from Claude Code ──────────────────
  {
    name: "document.generate",
    description:
      "Generate a formatted document (PDF + DOCX) from composed HTML and stage it for operator approval; on approval it is filed to the client's Documents library. YOU compose the body as semantic HTML (h1/h2/p/table; NO <html>/<head>/<style> wrappers — house styling is applied automatically). GATHER BEFORE COMPOSING: run the knowledge multi-hop first — atoms.search for the subject's key facts, graph.expandEntity on the client/project/lender for relationships, graph.findPaths where a cross-entity claim needs provenance — then ground every figure in that evidence plus the deal's documents; never fabricate. Use for ad-hoc requests like a company one-pager. See the document-author skill + the document-house-style reference for voice and structure.",
    inputSchema: {
      type: "object",
      properties: {
        contentHtml: { type: "string", description: "Document body as semantic HTML. No html/head/style wrappers; one <h1>." },
        title: { type: "string", description: "Document title; also the file-name stem." },
        docType: { type: "string", description: "Kind of document, e.g. 'Company One-Pager'." },
        category: { type: "string", description: "Filing category. Defaults to 'Generated'." },
        summary: { type: "string", description: "One-line operator-facing summary for the approvals queue. Defaults to the title." },
        formats: { type: "array", items: { type: "string", description: "pdf or docx" }, description: "Output formats. Defaults to ['pdf','docx']." },
        clientId: { type: "string", description: "Client id to file the document under on approval." },
        projectId: { type: "string", description: "Project id to associate (optional)." },
      },
      required: ["contentHtml", "title", "docType"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runAction(internal.documentGen.renderAndStage, {
        contentHtml: args.contentHtml,
        title: args.title,
        docType: args.docType,
        category: args.category,
        summary: args.summary,
        formats: args.formats,
        isBaseDocument: true,
        requestedByUserId: userId,
        relatedClientId: args.clientId,
        relatedProjectId: args.projectId,
      });
      return asText(result);
    },
  },
  // ── P4: branded multi-page BRIEF generation (structured briefData) ─────
  {
    name: "document.generateBrief",
    description:
      "Generate a branded RockCap multi-page BRIEF (PDF + DOCX) and stage it for operator approval; on approval it is filed to the client's Documents library. Two layouts: 'lender-brief' sells a borrower's deal TO a lender (track-record depth from Companies House charges); 'client-brief' advises the BORROWER on the indicative lender landscape, leverage scenarios and expected pricing BEFORE going to market. YOU compose the structured briefData (title, key facts, numbered sections whose bodies are semantic HTML, sign-off), grounded in real data — GATHER BEFORE COMPOSING: read the deal's documents AND run the knowledge multi-hop (atoms.search on the borrower/scheme/lender, graph.expandEntity for track record and cross-entity control facts, graph.findPaths to evidence borrower↔lender history); never fabricate. Section bodyHtml is semantic HTML only (no <html>/<head>/<style> wrappers; <table> with class=\"num\" on numeric cells, class=\"caption\" for source/footnote lines). Follow the doc-type-lender-brief / doc-type-client-brief references for the section set.",
    inputSchema: {
      type: "object",
      properties: {
        layout: { type: "string", enum: ["lender-brief", "client-brief"], description: "Which brief to render." },
        briefData: {
          type: "object",
          description: "The full structured brief. Section set differs per layout — see the doc-type reference.",
          properties: {
            variant: { type: "string", description: "lender-brief: senior-dev|dev-exit|jv. client-brief: new-facility|refinance|multi-scenario." },
            confidentiality: { type: "string", enum: ["INTERNAL", "EXTERNAL"], description: "Client briefs are EXTERNAL; lender briefs default INTERNAL." },
            title: {
              type: "object",
              properties: {
                location: { type: "string", description: "Scheme/location headline (rendered uppercase)." },
                descriptor: { type: "string", description: "One-line descriptor." },
              },
              required: ["location", "descriptor"],
            },
            meta: {
              type: "object",
              properties: {
                borrower: { type: "string", description: "Borrower / group name." },
                preparedBy: { type: "string", description: "Usually 'RockCap Ltd'." },
                date: { type: "string", description: "e.g. 'April 2026'." },
              },
              required: ["borrower", "preparedBy", "date"],
            },
            keyFacts: {
              type: "array",
              description: "Key-facts block — short label + value rows.",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "Short label, e.g. 'GDV'." },
                  value: { type: "string", description: "The value." },
                },
                required: ["label", "value"],
              },
            },
            sections: {
              type: "array",
              description: "Numbered sections; bodyHtml is semantic HTML (no html/head/style wrappers).",
              items: {
                type: "object",
                properties: {
                  n: { type: "number", description: "Section number." },
                  title: { type: "string", description: "Section heading." },
                  bodyHtml: { type: "string", description: "Section body as semantic HTML (prose + tables)." },
                },
                required: ["n", "title", "bodyHtml"],
              },
            },
            signOff: {
              type: "object",
              properties: {
                name: { type: "string", description: "RM name." },
                role: { type: "string", description: "e.g. 'Director, RockCap'." },
                email: { type: "string", description: "RM email." },
                phone: { type: "string", description: "RM phone." },
              },
              required: ["name", "role", "email", "phone"],
            },
          },
          required: ["variant", "confidentiality", "title", "meta", "keyFacts", "sections", "signOff"],
        },
        title: { type: "string", description: "Document title; also the file-name stem." },
        docType: { type: "string", description: "Stored doc type. Defaults to 'Client Brief' / 'Lender Brief' from the layout." },
        category: { type: "string", description: "Filing category. Defaults to 'Generated'." },
        summary: { type: "string", description: "One-line operator-facing summary for the approvals queue. Defaults to the title." },
        formats: { type: "array", items: { type: "string", description: "pdf or docx" }, description: "Output formats. Defaults to ['pdf','docx']." },
        clientId: { type: "string", description: "Client id to file the document under on approval." },
        projectId: { type: "string", description: "Project id to associate (optional)." },
      },
      required: ["layout", "briefData", "title"],
    },
    handler: async (ctx, userId, args) => {
      const defaultDocType = args.layout === "client-brief" ? "Client Brief" : "Lender Brief";
      const result = await ctx.runAction(internal.documentGen.renderAndStage, {
        layout: args.layout,
        briefData: args.briefData,
        title: args.title,
        docType: args.docType ?? defaultDocType,
        category: args.category,
        summary: args.summary,
        formats: args.formats,
        isBaseDocument: true,
        requestedByUserId: userId,
        relatedClientId: args.clientId,
        relatedProjectId: args.projectId,
      });
      return asText(result);
    },
  },
  // ── P4: comps appendix (Master Comparable Schedule) generation ────────
  {
    name: "document.generateComps",
    description:
      "Generate a RockCap 'Appendix A — Master Comparable Schedule' (comps) as a spreadsheet (XLSX, default) or Word table (DOCX), and stage it for operator approval; on approval it is filed to the client's Documents library. A comps appendix is the comparable-evidence table attached to a lender credit pack / client brief that justifies a scheme's GDV pricing. YOU compose the structured compsData: one or more sheets (tabs), each with configurable columns and tier/section groups of comparable rows (address, scheme, date, price, sqft, £psf, type, beds, notes, evidence). Set column roles ('price','sqft','psf') and leave £psf blank to auto-compute it (price ÷ sqft); a tier can carry an auto-average row. Ground every comp in real evidence (Land Registry / agent listings) — check atoms.search for scheme pricing facts (has_gdv / has_price_psf / has_valuation) already in the knowledge graph before composing; never fabricate prices or sqft. See the doc-type-comps-appendix reference for structure.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Document title; also the file-name stem." },
        compsData: {
          type: "object",
          description: "The structured comps appendix. One workbook; one sheet per entry in sheets[].",
          properties: {
            title: { type: "string", description: "Heading at the top of the sheet." },
            subtitle: { type: "string", description: "Scheme address + purpose line." },
            preparedBy: { type: "string", description: "e.g. 'Prepared by RockCap Ltd | May 2026 | …'." },
            sheets: {
              type: "array",
              description: "One or more tabs (single tiered schedule = one sheet; hero/second-hand/new-build = several).",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Tab name, e.g. 'Appendix A', 'Hero Comps'." },
                  intro: { type: "array", items: { type: "string" }, description: "Optional framing bullets above the table." },
                  columns: {
                    type: "array",
                    description: "Column definitions, left to right.",
                    items: {
                      type: "object",
                      properties: {
                        key: { type: "string", description: "Stable key referenced by each row's cells." },
                        label: { type: "string", description: "Header text." },
                        type: { type: "string", enum: ["text", "price", "psf", "number", "date", "link"], description: "Formatting; 'price'/'psf' format as £, 'link' is a hyperlink." },
                        role: { type: "string", enum: ["price", "sqft", "psf"], description: "Set on price/sqft/psf columns to enable £psf auto-compute." },
                        width: { type: "number", description: "Optional column width." },
                        align: { type: "string", enum: ["left", "center", "right"], description: "Optional alignment." },
                      },
                      required: ["key", "label"],
                    },
                  },
                  tiers: {
                    type: "array",
                    description: "Grouped sections. For a flat schedule, use a single tier with no heading.",
                    items: {
                      type: "object",
                      properties: {
                        heading: { type: "string", description: "Full-width band, e.g. 'TIER 1: WALL HALL (WD25)'. Omit for a flat sheet." },
                        rows: {
                          type: "array",
                          description: "Comparable rows.",
                          items: {
                            type: "object",
                            properties: {
                              cells: { type: "object", description: "Values keyed by column key. Numeric columns take numbers; a 'link' column takes { text, url }. Leave £psf empty to auto-compute." },
                              excludeFromAverage: { type: "boolean", description: "True for asking/marketing evidence (left out of the tier average)." },
                              isSummary: { type: "boolean", description: "Render as an emphasised summary row." },
                            },
                            required: ["cells"],
                          },
                        },
                        average: {
                          type: "object",
                          description: "Optional per-tier average row.",
                          properties: {
                            label: { type: "string", description: "Row label, e.g. 'Average (3-bed)'." },
                            auto: { type: "array", items: { type: "string" }, description: "Column keys to mean-average across non-excluded rows." },
                          },
                        },
                      },
                      required: ["rows"],
                    },
                  },
                },
                required: ["name", "columns", "tiers"],
              },
            },
          },
          required: ["title", "sheets"],
        },
        docType: { type: "string", description: "Stored doc type. Defaults to 'Comparable Schedule'." },
        category: { type: "string", description: "Filing category. Defaults to 'Generated'." },
        summary: { type: "string", description: "One-line operator-facing summary. Defaults to the title." },
        formats: { type: "array", items: { type: "string", description: "xlsx or docx" }, description: "Output formats. Defaults to ['xlsx']. PDF not supported." },
        clientId: { type: "string", description: "Client id to file under on approval." },
        projectId: { type: "string", description: "Project id to associate (optional)." },
      },
      required: ["title", "compsData"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runAction(internal.documentGen.renderAndStage, {
        compsData: args.compsData,
        title: args.title,
        docType: args.docType ?? "Comparable Schedule",
        category: args.category,
        summary: args.summary,
        formats: args.formats,
        isBaseDocument: true,
        requestedByUserId: userId,
        relatedClientId: args.clientId,
        relatedProjectId: args.projectId,
      });
      return asText(result);
    },
  },

  // ── Close-the-loop writes (2026-06-01) ──────────────────────
  // The MCP surface could draft + stage but not ACT. These wrap existing
  // internal mutations (the execution dispatchers already work server-side),
  // so a fresh MCP-only operator can actually fire the outbound action and
  // seed a net-new prospect — no web UI / CLI escape hatch needed.
  {
    name: "approval.approve",
    description:
      "Approve a pending approval and FIRE its action. This is the trust gate that actually acts — approving a gmail_send approval really sends the email, a document_publish really publishes (the executor runs server-side via the scheduler). Use after the operator has reviewed the staged draft (see approval.listPendingByClient / approval.get). No-op-safe: returns {ok:false, reason:'not_pending_*'} if the row is not pending. Pair with approval.reject to decline.",
    inputSchema: {
      type: "object",
      properties: { approvalId: { type: "string", description: "Convex id of the approvals row to approve." } },
      required: ["approvalId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.approvals.approveInternal, {
        approvalId: args.approvalId,
        actorUserId: userId,
      });
      return asText(result);
    },
  },
  {
    name: "approval.reject",
    description:
      "Reject a pending approval so it does NOT fire (the drafted email/doc is discarded). Optionally pass a reason for the audit trail. No-op-safe on non-pending rows. Use when the operator reviews a staged draft and decides against it.",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: { type: "string", description: "Convex id of the approvals row to reject." },
        reason: { type: "string", description: "Optional reason, recorded on the row." },
      },
      required: ["approvalId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.approvals.rejectInternal, {
        approvalId: args.approvalId,
        reason: args.reason,
        actorUserId: userId,
      });
      return asText(result);
    },
  },
  {
    name: "cadence.approvePackage",
    description:
      "Approve a cadence PACKAGE AND begin outreach in one step (prospecting v3). Flips every touch (shared packageId) to approved, writes the prospect's pipelineStage to 'cold_outreach' on first approval (forward-only — never regresses a warm prospect), backfills outreachReadyAt, and fires touch 1 within seconds (later touches auto-send on their scheduled dates). Enforces a no-contact guard: throws if the package has no sendable contact email. This is the single 'Approve & begin outreach' gate; pair with cadence.denyPackage to discard. Get the packageId from cadence.create or cadence.listByPackage.",
    inputSchema: {
      type: "object",
      properties: { packageId: { type: "string", description: "The shared packageId of the cadence touches to approve." } },
      required: ["packageId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.cadences.approvePackageInternal, {
        packageId: args.packageId,
        userId,
      });
      return asText(result);
    },
  },
  {
    name: "intel.revalidate",
    description:
      "Run the cheap intel-revalidate pass (prospecting v3, mode 2) for a prospect: a diff-focused check of whether the prior full intel still holds (new CH charges, status change, new planning/scheme activity, news). Returns 'still_valid' | 'materially_changed'. On materially_changed the prospect is flagged for an intel refresh (intelAttentionAt). This is the lightweight counterpart to a full prospect-intel re-run; the cadence dispatcher runs it automatically before a touch fires after a >30-day gap, and a booked meeting on >7-day-stale intel raises the same flag.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex clients id of the prospect." },
        companyNumber: { type: "string", description: "Companies House number (optional; resolved from the prospect if omitted)." },
        reason: { type: "string", description: "Optional free-text reason for the manual re-check." },
      },
      required: ["clientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runAction(internal.intelRevalidate.runRevalidateInternal, {
        clientId: args.clientId,
        companyNumber: args.companyNumber,
        reason: args.reason,
        triggeredBy: "operator",
      });
      return asText(result);
    },
  },
  {
    name: "cadence.denyPackage",
    description:
      "Deny a cadence package: marks every touch in the package denied + inactive (cancelledReason='operator_denied_package') so none fire. Use when the operator reviews a staged cold-outreach sequence and decides against running it.",
    inputSchema: {
      type: "object",
      properties: { packageId: { type: "string", description: "The shared packageId of the cadence touches to deny." } },
      required: ["packageId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.cadences.denyPackageInternal, {
        packageId: args.packageId,
        userId,
      });
      return asText(result);
    },
  },

  // ── Outreach triage backbone (2026-07-14) ────────────────────
  // The cross-prospect "what needs me + what fires next" read-model plus the
  // batch approval writes. Powers the /outreach skill and the stage-workspace
  // session digest. See convex/outreachTriage.ts.
  {
    name: "outreach.triageQueue",
    description:
      "THE cross-prospect triage read: every open outreach action in one call, grouped by kind — pendingPackages (cadence packages awaiting approve/deny), needsContact (held drafts with no sendable contact), replyDrafts (staged reply approvals awaiting accept), otherApprovals, failedSends (approved sends that errored — retry or reject), unroutedReplies (classifier sent to operator_review), deadEndReplies (ingested but matched no contact/prospect — otherwise invisible), stalledCadences (intel_hold / auto_deactivated_failures / paused — cadences that silently stopped), flaggedClients (needs-action flags from the reply lifecycle), staleIntel. Rows are trimmed (no bodies) — follow up with approval.get / reply.get / cadence.get for full content. ALWAYS call this first in an /outreach triage session; it replaces stitching together approval.listPendingByClient + reply.listUnrouted + per-prospect cadence reads.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.outreachTriage.triageQueue, {});
      return asText(result);
    },
  },
  {
    name: "cadence.listUpcoming",
    description:
      "The OUTBOX: every active cadence touch due inside the horizon (default 7 days, max 90), sorted by fire date, each with an honest fireStatus — 'scheduled' / 'due_now' (will fire on the next 5-min dispatcher tick) vs 'paused' / 'blocked_package_pending' / 'blocked_no_contact_email' (will NOT send, and why). Overdue-but-blocked rows are the answer to 'why didn't this send?'. This is the operator's 'whether and when will cadences fire' view — no other surface shows approved future touches across prospects.",
    inputSchema: {
      type: "object",
      properties: {
        daysAhead: { type: "number", description: "Horizon in days (default 7, max 90)." },
        limit: { type: "number", description: "Max touches returned (default 100, max 200)." },
      },
      required: [],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.outreachTriage.listUpcoming, {
        daysAhead: args.daysAhead,
        limit: args.limit,
      });
      return asText(result);
    },
  },
  {
    name: "approval.approveBatch",
    description:
      "Approve up to 50 pending approvals in one call and FIRE each action (same executor path as approval.approve — a gmail_send really sends). RULE: itemise the batch to the operator first (one line each: recipient, subject, what fires) and get an explicit yes; batch approval is a convenience over per-item clicking, never a blind bulk flip. Per-item no-op-safe: missing/non-pending rows land in `skipped` with a reason instead of aborting the batch. Returns {total, approved, skipped[]}.",
    inputSchema: {
      type: "object",
      properties: {
        approvalIds: {
          type: "array",
          items: { type: "string" },
          description: "Convex ids of the approvals rows to approve (max 50).",
        },
      },
      required: ["approvalIds"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.approvals.approveBatchInternal, {
        approvalIds: args.approvalIds,
        actorUserId: userId,
      });
      return asText(result);
    },
  },
  {
    name: "cadence.approvePackageBatch",
    description:
      "Approve up to 25 cadence packages in one call — each gets the full cadence.approvePackage treatment (no-contact guard, pipelineStage → cold_outreach forward-only, outreachReadyAt backfill) with ONE dispatcher kick at the end, so due touch-1s fire within seconds. RULE: itemise the packages to the operator first (company, touch count, first send date) and get an explicit yes. Per-item safe: a package failing its no-contact guard is reported in results[] with ok:false instead of aborting the batch. Returns {total, approved, results[]}.",
    inputSchema: {
      type: "object",
      properties: {
        packageIds: {
          type: "array",
          items: { type: "string" },
          description: "Shared packageIds of the cadence packages to approve (max 25).",
        },
      },
      required: ["packageIds"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.cadences.approvePackageBatchInternal, {
        packageIds: args.packageIds,
        userId,
      });
      return asText(result);
    },
  },
  {
    name: "approval.retry",
    description:
      "Re-queue an execution_failed approval for a REAL retry (kill switch was off, Gmail token needed reconnect, transient error). The operator already approved this exact content — retry re-runs the same executor without a re-draft. Use on the failedSends section of outreach.triageQueue after checking the executionError. No-op-safe: {ok:false, reason:'not_failed_*'} on non-failed rows.",
    inputSchema: {
      type: "object",
      properties: { approvalId: { type: "string", description: "Convex id of the execution_failed approvals row." } },
      required: ["approvalId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.approvals.retryInternal, {
        approvalId: args.approvalId,
        actorUserId: userId,
      });
      return asText(result);
    },
  },
  {
    name: "cadence.reactivate",
    description:
      "Reactivate a STALLED cadence — the recovery action for the stalledCadences section of outreach.triageQueue. Clears ALL three silent stall states in one call (intel hold, 3-strike failure auto-deactivation, pause), sets isActive back to true, and optionally reschedules via newNextDueAt. Refuses deliberate stops: cancelled rows (reply cancellation / operator cancel), denied packages, and needs_contact holds return {ok:false} with the right redirect (fresh cadence / re-approve / cadence.setPackageContact). For an intel_hold stall, consider intel.revalidate or a fresh prospect-intel run BEFORE reactivating — the hold exists because the intel looked stale.",
    inputSchema: {
      type: "object",
      properties: {
        cadenceId: { type: "string" },
        newNextDueAt: { type: "string", description: "Optional ISO timestamp — reschedule the touch on reactivation." },
      },
      required: ["cadenceId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.cadences.reactivateInternal, {
        cadenceId: args.cadenceId,
        userId,
        newNextDueAt: args.newNextDueAt,
      });
      return asText(result);
    },
  },
  {
    name: "reply.resolveBatch",
    description:
      "Mark up to 100 replies HANDLED so they leave the triage queue (listUnrouted / outreach.triageQueue / the session digest) while keeping full history on the row. THE backlog-reset primitive for replies: use when the operator confirms items were already answered outside the system (e.g. manually via Gmail), acknowledged, or aren't actionable (spam, dead-end from an irrelevant sender). Pass a resolutionNote saying WHY (e.g. 'answered manually via Gmail pre-system', 'not actionable — newsletter'). RULE: itemise the batch to the operator and get an explicit yes first — resolving hides items from every queue. Per-item no-op-safe ({skipped[]} for missing/already-resolved). Does NOT send anything or touch cadences.",
    inputSchema: {
      type: "object",
      properties: {
        replyEventIds: {
          type: "array",
          items: { type: "string" },
          description: "Convex ids of the replyEvents rows to mark handled (max 100).",
        },
        resolutionNote: { type: "string", description: "Why these are considered handled — lands on every row for the audit trail." },
      },
      required: ["replyEventIds", "resolutionNote"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.replyEvents.resolveBatchInternal, {
        replyEventIds: args.replyEventIds,
        resolutionNote: args.resolutionNote,
        actorUserId: userId,
      });
      return asText(result);
    },
  },
  {
    name: "cadence.denyPackageBatch",
    description:
      "Deny up to 25 cadence packages in one call: every touch in every listed package is marked denied + inactive so none EVER fire. THE backlog-reset primitive for stale drafted outreach — e.g. packages drafted for prospects the operator has since emailed manually outside the system (sending them now would double-email). Pass a reason for the audit trail (defaults to operator_denied_package). RULE: itemise the packages (company, touches, drafted-when) and get an explicit operator yes first — this discards drafted work. A prospect denied here can get FRESH outreach later via the outreach-draft skill. Per-item safe: unknown packageIds land in results[] with ok:false.",
    inputSchema: {
      type: "object",
      properties: {
        packageIds: {
          type: "array",
          items: { type: "string" },
          description: "Shared packageIds of the cadence packages to deny (max 25).",
        },
        reason: { type: "string", description: "Audit reason, e.g. 'stale_draft_manual_outreach_took_over'." },
      },
      required: ["packageIds"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.cadences.denyPackageBatchInternal, {
        packageIds: args.packageIds,
        userId,
        reason: args.reason,
      });
      return asText(result);
    },
  },
  {
    name: "approval.rejectBatch",
    description:
      "Reject up to 50 pending approvals in one call — every draft is discarded, NOTHING sends. The backlog-reset counterpart of approval.approveBatch: use when clearing stale staged drafts (superseded by manual sends, outdated content). Pass a reason for the audit trail. RULE: itemise to the operator and get an explicit yes first. Per-item no-op-safe ({skipped[]} for missing/non-pending rows).",
    inputSchema: {
      type: "object",
      properties: {
        approvalIds: {
          type: "array",
          items: { type: "string" },
          description: "Convex ids of the pending approvals rows to reject (max 50).",
        },
        reason: { type: "string", description: "Audit reason recorded on every row." },
      },
      required: ["approvalIds"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.approvals.rejectBatchInternal, {
        approvalIds: args.approvalIds,
        reason: args.reason,
        actorUserId: userId,
      });
      return asText(result);
    },
  },
  {
    name: "client.dismissNeedsActionFlag",
    description:
      "Dismiss a needs-action flag on a prospect (the flaggedClients section of outreach.triageQueue / the 'Waiting on you' chip). Use after the operator has made the decision the flag was asking for — e.g. reviewed a reply_not_interested and decided keep-or-lost, acknowledged an out-of-office. Pass the flag's kind exactly as returned by the triage queue (reply_received / reply_flag_only / reply_not_interested / reply_out_of_office / ...) and, when the flag row carries one, its sourceReplyEventId — kind+source identify WHICH flag to clear when a prospect has several.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex clients id of the prospect." },
        kind: { type: "string", description: "The flag kind to clear, exactly as listed on the triage queue row." },
        sourceReplyEventId: { type: "string", description: "The flag's sourceReplyEventId when present — disambiguates same-kind flags." },
      },
      required: ["clientId", "kind"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.clients.clearNeedsActionFlagInternal, {
        clientId: args.clientId,
        kind: args.kind,
        sourceReplyEventId: args.sourceReplyEventId,
      });
      return asText(result);
    },
  },
  {
    name: "touchpoint.logManualSend",
    description:
      "Backfill outbound emails that were sent OUTSIDE the system (operator used a generic Gmail tool) as real outbound touchpoints — up to 50 per call. For each entry: logs the touchpoint, stamps the prospect's lastOutreachSendAt forward, and advances the prospect state machine exactly as a real send would (no-op-safe). THE reconciliation write for sends with NO drafted package — when a manual send matches a drafted package's touch 1, use cadence.adoptManualSend instead (it also refits the follow-ups). Idempotent when gmailMessageId is supplied (re-running a reset never double-logs). Resolve each send from the operator's Gmail Sent search: recipient email, sent date, subject, message id.",
    inputSchema: {
      type: "object",
      properties: {
        entries: {
          type: "array",
          description: "Manual sends to log (max 50).",
          items: {
            type: "object",
            properties: {
              contactEmail: { type: "string", description: "Recipient email — resolved to a contact + prospect. Preferred key." },
              contactId: { type: "string", description: "Convex contacts id, if already known (alternative to contactEmail)." },
              clientId: { type: "string", description: "Convex clients id override when the contact can't be resolved." },
              occurredAt: { type: "string", description: "ISO timestamp of the actual manual send (from Gmail)." },
              subject: { type: "string", description: "Email subject, for the history row." },
              gmailMessageId: { type: "string", description: "Gmail message id — supplies idempotency; pass it whenever the Gmail search returned one." },
              note: { type: "string", description: "Optional context, e.g. 'found during 2026-07 backlog reset'." },
            },
            required: ["occurredAt"],
          },
        },
      },
      required: ["entries"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.touchpoints.logManualOutboundBatchInternal, {
        entries: args.entries,
        actorUserId: userId,
      });
      return asText(result);
    },
  },
  {
    name: "cadence.adoptManualSend",
    description:
      "AUTOFIT a drafted cadence package onto a manual send (backlog reconciliation). When the operator sent touch 1 THEMSELVES outside the system: marks touch 1 fired-externally at the real send date (the dispatcher can never re-send it — no double-email), REFITS the unfired follow-up touches onto the preset schedule anchored at that date (past-due dates pushed forward: min 2 days out, 2 days apart, order kept), logs the send as an outbound touchpoint (idempotent on gmailMessageId), stamps lastOutreachSendAt, and advances the prospect state. The package keeps its approval status: a pending package still needs the operator's normal 'Approve & begin outreach' before follow-ups fire — an already-approved one auto-sends on the new dates (say so explicitly when itemising). Use instead of denying when the operator wants the drafted follow-up sequence to CONTINUE from their manual send. Errors: package_not_found, touch_1_already_fired (nothing to adopt), invalid_sentAt.",
    inputSchema: {
      type: "object",
      properties: {
        packageId: { type: "string", description: "The drafted package whose touch 1 the operator sent manually." },
        sentAt: { type: "string", description: "ISO timestamp of the real manual send (from Gmail Sent)." },
        preset: { type: "string", description: "Follow-up spacing: light / moderate (default) / aggressive." },
        gmailMessageId: { type: "string", description: "Gmail message id of the manual send — idempotency for the touchpoint." },
        subject: { type: "string", description: "Subject of the manual send (defaults to the drafted touch-1 subject)." },
      },
      required: ["packageId", "sentAt"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.cadences.adoptManualSendInternal, {
        packageId: args.packageId,
        sentAt: args.sentAt,
        preset: args.preset,
        gmailMessageId: args.gmailMessageId,
        subject: args.subject,
        userId,
      });
      return asText(result);
    },
  },
  {
    name: "deal.listByStage",
    description:
      "SELECTION read for the /cold-reachout action flow (and any stage-scoped session): list mirrored HubSpot deals sitting in one pipeline stage, each joined to its app-side prospect where one exists, with explicit dedupe/readiness flags — appClient (the linked clients row with pipelineStage / prospectState / lastOutreachSendAt), alreadyWorked (true when the linked prospect has send evidence — SKIP these in a cold-reachout selection, they belong to follow-up), linkedContactCount + contactWithEmail (whether outreach can actually send). Both pipelineId AND stageId are required — HubSpot dealstage ids are only unique within a pipeline. Freshness = the HubSpot mirror sync (recurring sync + webhooks), not a live HubSpot call. Known ids live in the RockCap-MCP docs (e.g. Cold Reachout pipeline 1755919552, Weekly Targets stage 2380814543).",
    inputSchema: {
      type: "object",
      properties: {
        pipelineId: { type: "string", description: "HubSpot pipeline id (required — pairs with stageId)." },
        stageId: { type: "string", description: "HubSpot dealstage id within that pipeline." },
        limit: { type: "number", description: "Max deals returned (default 25, max 100)." },
      },
      required: ["pipelineId", "stageId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(internal.deals.listByStageForSelectionInternal, {
        pipelineId: args.pipelineId,
        stageId: args.stageId,
        limit: args.limit,
      });
      return asText(result);
    },
  },
  {
    name: "outreach.metrics",
    description:
      "OUTCOME metrics for outreach (Phase 2) — triage checks state, this reports results over a window (default 90 days): sends (outbound email touchpoints, incl. reconciliation-backfilled manual sends), substantive replies (out-of-office excluded from rate math but reported), response rate at contact level (share of emailed contacts who replied — the honest headline) and send level, touchesPerEarnedReply (the operator's priority number: average sends it took to earn a contact's first reply), and a byTemplate table (sends / replies / responseRate per templateKey, replies attributed to the latest fired touch before the reply; legacy sends land in 'untagged'). Capped + windowed — `capped` flags mean a number is a floor. Baselines are only honest AFTER the backlog reset has backfilled manual sends. Use in the *-triage commands' metrics section.",
    inputSchema: {
      type: "object",
      properties: {
        sinceDays: { type: "number", description: "Window in days (default 90, max 365)." },
      },
      required: [],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.outreachMetrics.summary, {
        sinceDays: args.sinceDays,
      });
      return asText(result);
    },
  },
  {
    name: "outreach.prospectingInbox",
    description:
      "THE prospecting inbox — the org-wide, client-linked view over BOTH mail directions in one feed, newest first. Inbound rows are replyEvents with a linkedClientId (contact-email match at ingest); outbound rows are gmail email touchpoints with a relatedClientId — in-app approved sends AND manual Gmail sends (the SENT poller captures those automatically since 2026-07-17, deduped against in-app sends by Gmail message id). Distinct from the operator's private /inbox: this surface only ever shows business correspondence. Each row: kind (inbound/outbound), occurredAt, subject, 160-char snippet (never full bodies — drill in with reply.get / touchpoint reads), clientId/clientName/pipelineStage, contact, counterpartyEmail, OPERATOR ATTRIBUTION (operatorName/operatorEmail — whose mailbox: 'sent by Rayn' vs 'received in Alex's inbox'; several operators prospect in parallel), classifiedIntent + resolvedAt (inbound), hasAttachments. Filters: stage (one of the 5 manual pipeline stages), direction, includeNonProspects (default FALSE — prospects only; pass true to include active clients), windowDays (default 45, max 120 — it is a recency surface, not an archive). Use for 'what mail moved with prospects this week', per-stage triage sweeps, and as the evidence read behind KPI questions — for the counts themselves prefer outreach.prospectingKpis.",
    inputSchema: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          description:
            "Filter to one pipeline stage: cold_outreach | warm_pre_meeting | warm_post_meeting | pre_qualification | qualified",
        },
        direction: { type: "string", description: '"inbound" or "outbound" — omit for both' },
        includeNonProspects: {
          type: "boolean",
          description: "Include active (non-prospect) clients too. Default false.",
        },
        windowDays: { type: "number", description: "Lookback window (default 45, max 120)" },
        limit: { type: "number", description: "Max rows (default 50, max 100)" },
      },
      required: [],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.prospectingInbox.list, {
        stage: args.stage,
        direction: args.direction,
        includeNonProspects: args.includeNonProspects,
        windowDays: args.windowDays,
        limit: args.limit,
      });
      return asText(result);
    },
  },
  {
    name: "outreach.prospectingKpis",
    description:
      "Prospecting KPI counts over a window (default 30 days), total + broken down by pipeline stage: outboundSent (gmail email touchpoints to prospect-linked contacts — in-app sends + poller-captured manual Gmail sends), inboundReceived (client-linked replyEvents), meetingsHeld (calendar events with a matched prospect attendee whose start already passed inside the window) and meetingsUpcoming (matched events starting from now, ≤90d out) — the calendar attendee matcher links an event to a prospect when ≥1 attendee email resolves to one of its contacts (operators excluded, cancelled events excluded, internal-only meetings never count). Also returns uniqueProspectsContacted / uniqueProspectsReplied AND a byOperator breakdown (same buckets per operator — who is doing the prospecting; mail attributes to the mailbox owner, meetings to the calendar owner). Complements outreach.metrics (which measures the CADENCE pipeline: touches per earned reply, per-template attribution) — this tool measures the PROSPECTING FUNNEL regardless of how the mail was sent. Prospects only by default; includeNonProspects:true widens to active clients.",
    inputSchema: {
      type: "object",
      properties: {
        sinceDays: { type: "number", description: "Lookback window (default 30, max 120)" },
        includeNonProspects: {
          type: "boolean",
          description: "Include active (non-prospect) clients too. Default false.",
        },
      },
      required: [],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.prospectingInbox.kpis, {
        sinceDays: args.sinceDays,
        includeNonProspects: args.includeNonProspects,
      });
      return asText(result);
    },
  },
  {
    name: "client.create",
    description:
      "Create a new borrower/developer client record (a clients row), defaulting to status='prospect'. The borrower-side counterpart to lender.create — closes the gap where a net-new prospect could previously only be seeded via CLI. Three input modes (priority order): (1) promoteFromCompanyId (Convex companies id) → promote an existing company, inheriting metadata + linking synced contacts; (2) hubspotCompanyId (string) → resolve the HubSpot id to a Convex company, then promote; (3) name only → naked creation for a genuinely net-new company. After create, populate via clients.setProspectFacts / intelligence.* / contact.create, then run prospect-intel. Defaults: type='borrower', status='prospect', country='United Kingdom'.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Company name. REQUIRED for mode 3; optional for modes 1/2 (defaults to the source company's name)." },
        type: { type: "string", description: "Client type: 'borrower' (default) or 'developer'." },
        status: { type: "string", description: "prospect (default) / active." },
        promoteFromCompanyId: { type: "string", description: "Mode 1: Convex companies id to promote." },
        hubspotCompanyId: { type: "string", description: "Mode 2: HubSpot company id; resolved to a Convex company before promoting." },
        companyName: { type: "string", description: "Optional legal name if different from name." },
        notes: { type: "string", description: "Optional 1-2 sentence summary." },
        website: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        country: { type: "string", description: "Default 'United Kingdom'." },
      },
      required: [],
    },
    handler: async (ctx, _userId, args) => {
      const type = args.type ?? "borrower";
      const status = (args.status ?? "prospect") as any;
      let convexCompanyId: string | undefined = args.promoteFromCompanyId;

      if (!convexCompanyId && args.hubspotCompanyId) {
        const companies = await ctx.runQuery(api.companies.listWithHubspotId, {});
        const match = (companies as any[]).find((c) => c.hubspotCompanyId === args.hubspotCompanyId);
        if (!match) {
          return asText({
            error: "hubspot_company_not_found_in_convex",
            note: `No companies row with hubspotCompanyId=${args.hubspotCompanyId}. The HubSpot sync may not have run yet, or the id is wrong. Try mode 3 (pass just 'name').`,
          });
        }
        convexCompanyId = match._id;
      }

      if (convexCompanyId) {
        const company = await ctx.runQuery(api.companies.get, { id: convexCompanyId });
        if (!company) {
          return asText({ error: "company_not_found", note: `companies row ${convexCompanyId} not found.` });
        }
        const id = await ctx.runMutation(api.clients.createWithPromotion, {
          name: args.name ?? (company as any).name,
          type,
          status,
          companyName: args.companyName ?? (company as any).name,
          website: args.website ?? (company as any).website,
          phone: args.phone ?? (company as any).phone,
          address: (company as any).address,
          city: (company as any).city,
          country: args.country ?? (company as any).country ?? "United Kingdom",
          promoteFromCompanyId: convexCompanyId as any,
        });
        return asText({
          status: "promoted",
          clientId: id,
          sourceCompanyId: convexCompanyId,
          sourceCompanyName: (company as any).name,
          note: "Prospect created by promoting an existing company. Now populate via clients.setProspectFacts / intelligence.* / contact.create, then run prospect-intel.",
        });
      }

      if (!args.name) {
        return asText({ error: "name_required_for_mode_3", note: "Naked creation requires `name`. For modes 1/2 pass promoteFromCompanyId or hubspotCompanyId." });
      }
      const id = await ctx.runMutation(api.clients.create, {
        name: args.name,
        type,
        status,
        companyName: args.companyName,
        notes: args.notes,
        website: args.website,
        email: args.email,
        phone: args.phone,
        country: args.country ?? "United Kingdom",
        source: "manual" as const,
      });
      return asText({
        status: "created",
        clientId: id,
        note: "Prospect created via naked path (no HubSpot link). Now populate via clients.setProspectFacts / intelligence.* / contact.create, then run prospect-intel.",
      });
    },
  },

  // ── Bulk/manual onboarding (2026-06-08): land an EXISTING prospect at any stage ──
  // client.create always starts a prospect pre-funnel (prospectState=NULL) on the
  // assumption prospect-intel runs next. That's wrong for companies the operator
  // has ALREADY been working manually (hundreds, with prior outreach). This tool
  // is the one-call onboard-at-stage path: create + transition + facts + contacts
  // + a history note, so the prospect lands honestly at e.g. 'active' or 'engaged'
  // without pretending the funnel started today. Call once per company; to bulk
  // import, the caller maps over a list.
  {
    name: "prospect.import",
    description:
      "Onboard an EXISTING prospect (one you've already been working manually) directly at a chosen pipeline stage, in a single call. Unlike client.create (which always lands a prospect pre-funnel at prospectState=NULL on the assumption prospect-intel runs next), this sets prospectState explicitly so the company appears at the right rung immediately. Composes: create client → transition to prospectState → optional setProspectFacts → optional contacts → optional outreach-history note. Use for back-filling companies with prior manual outreach (e.g. 'add Acme Developments at active, we've emailed them since Jan'). For a genuinely net-new prospect that should start at the top of the funnel, use client.create + prospect-intel instead. To bulk import, call once per company. prospectState='promoted' also flips clients.status to 'active' (true promotion); all other states keep status='prospect'.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Company name. REQUIRED unless promoteFromCompanyId is given (then defaults to the source company's name)." },
        prospectState: {
          type: "string",
          enum: ["researched", "drafted", "needs_revision", "active", "replied", "engaged", "promoted", "parked", "lost"],
          description: "Pipeline stage to land the prospect at. REQUIRED — that's the whole point of this tool. For manually-worked companies you've emailed, 'active' (outreach in flight) or 'engaged' (in conversation) are the usual choices; 'replied' if they've replied.",
        },
        type: { type: "string", description: "Client type: 'borrower' (default) or 'developer'." },
        promoteFromCompanyId: { type: "string", description: "Optional Convex companies id to promote (inherits metadata + links synced contacts), instead of naked creation by name." },
        companyName: { type: "string", description: "Optional legal name if different from name." },
        website: { type: "string", description: "Full URL or 'not-found'." },
        companiesHouseNumber: { type: "string", description: "Optional 8-digit CH number (or 6 digits prefixed SC/NI/OC). Lights up the CH/sourcing intel later; omit and enrich via prospect-intel if unknown." },
        primaryDirectorName: { type: "string", description: "Optional operator-readable primary director/principal name." },
        dealType: {
          type: "string",
          enum: ["new_development", "bridging", "existing_asset", "unclassifiable"],
          description: "Optional canonical deal-type classification, if already known.",
        },
        dealSizeRange: { type: "string", description: "Optional display string for indicative deal size, e.g. '£2-5m, low confidence, operator estimate'. Never a naked number." },
        contacts: {
          type: "array",
          description: "Optional people you've been in contact with at this company. The FIRST contact is set as the prospect's primaryContactId (cadence target). Each: { name (required), role?, email?, phone?, linkedinUrl? }.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              linkedinUrl: { type: "string" },
            },
            required: ["name"],
          },
        },
        outreachHistoryNote: {
          type: "string",
          description: "Optional free-text summary of the manual outreach already done, e.g. '12 emails since Jan, last reply 14 May re: Woodberry Park'. Filed as a note on the client so the stage is honest. Use reply.ingestManual separately if you want the actual reply threads rebuilt.",
        },
        notes: { type: "string", description: "Optional 1-2 sentence summary stored on the client record." },
      },
      required: ["prospectState"],
    },
    handler: async (ctx, userId, args) => {
      const VALID_STATES = [
        "researched", "drafted", "needs_revision", "active",
        "replied", "engaged", "promoted", "parked", "lost",
      ];
      if (!VALID_STATES.includes(args.prospectState)) {
        return asText({ error: "invalid_prospect_state", note: `prospectState must be one of: ${VALID_STATES.join(", ")}.` });
      }

      const type = args.type ?? "borrower";
      // 'promoted' is a true promotion to a live client; every other stage is
      // still a prospect in the funnel.
      const status = args.prospectState === "promoted" ? "active" : "prospect";

      // 1) Create the client (promote an existing company, or naked-by-name).
      let clientId: string;
      let createMode: string;
      if (args.promoteFromCompanyId) {
        const company = await ctx.runQuery(api.companies.get, { id: args.promoteFromCompanyId });
        if (!company) {
          return asText({ error: "company_not_found", note: `companies row ${args.promoteFromCompanyId} not found.` });
        }
        clientId = await ctx.runMutation(api.clients.createWithPromotion, {
          name: args.name ?? (company as any).name,
          type,
          status: status as any,
          companyName: args.companyName ?? (company as any).name,
          website: args.website ?? (company as any).website,
          phone: (company as any).phone,
          address: (company as any).address,
          city: (company as any).city,
          country: (company as any).country ?? "United Kingdom",
          promoteFromCompanyId: args.promoteFromCompanyId as any,
        });
        createMode = "promoted";
      } else {
        if (!args.name) {
          return asText({ error: "name_required", note: "Pass `name` (or `promoteFromCompanyId` to promote an existing company)." });
        }
        clientId = await ctx.runMutation(api.clients.create, {
          name: args.name,
          type,
          status: status as any,
          companyName: args.companyName,
          notes: args.notes,
          website: args.website,
          country: "United Kingdom",
          source: "manual" as const,
        });
        createMode = "created";
      }

      // 2) Land it at the requested pipeline stage (audit fields + HubSpot push-back).
      await ctx.runMutation(internal.prospects.transitionStateInternal, {
        clientId: clientId as any,
        newState: args.prospectState,
        userId,
      });

      // 3) Create any known contacts; first one becomes the primary outreach target.
      const contactIds: string[] = [];
      for (const c of (args.contacts ?? [])) {
        if (!c?.name) continue;
        const cid = await ctx.runMutation(api.contacts.create, {
          name: c.name,
          role: c.role,
          email: c.email,
          phone: c.phone,
          linkedinUrl: c.linkedinUrl,
          company: args.companyName ?? args.name,
          clientId: clientId as any,
        });
        contactIds.push(cid as string);
      }

      // 4) Promote any known facts into queryable columns (incl. primary contact).
      const hasFacts =
        args.companiesHouseNumber || args.website || args.primaryDirectorName ||
        args.dealType || args.dealSizeRange || contactIds.length > 0;
      if (hasFacts) {
        await ctx.runMutation(internal.clients.setProspectFactsInternal, {
          clientId: clientId as any,
          companiesHouseNumber: args.companiesHouseNumber,
          website: args.website,
          primaryDirectorName: args.primaryDirectorName,
          primaryContactId: contactIds[0] as any,
          dealType: args.dealType,
          dealSizeRange: args.dealSizeRange,
        });
      }

      // 5) File the manual-outreach history as a note so the stage is honest.
      let noteId: string | undefined;
      if (args.outreachHistoryNote) {
        noteId = await ctx.runMutation(internal.notes.createFromMarkdownInternal, {
          userId,
          title: "Manual outreach history (imported)",
          markdown: args.outreachHistoryNote,
          emoji: "📨",
          clientId: clientId as any,
          tags: ["imported", "manual-outreach"],
        }) as string;
      }

      return asText({
        status: "imported",
        clientId,
        createMode,
        prospectState: args.prospectState,
        clientStatus: status,
        contactsCreated: contactIds.length,
        primaryContactId: contactIds[0],
        noteId,
        note: `Existing prospect onboarded at '${args.prospectState}'. ${args.companiesHouseNumber ? "" : "No CH number set — run prospect-intel to enrich CH/sourcing intel. "}It will not be picked up by the top-of-funnel prospect-intel sweep unless you run it explicitly.`,
      });
    },
  },

  // ── Document ingestion (2026-06-01): drop docs → analyze → filed ──
  // The inbound half of close-the-loop. Two-step so file bytes never pass
  // through the model context: (1) requestUpload returns a pre-signed Convex
  // storage URL the client curls the file to; (2) analyze runs the stored file
  // through the V4 classifier and files it as a documents row. Mirrors the
  // server-side pattern in convex/bulkBackgroundProcessor.ts.
  {
    name: "document.requestUpload",
    description:
      "Step 1 of ingesting a document via MCP. Returns a short-lived, pre-signed Convex storage upload URL. Claude Code then uploads the raw bytes directly: `curl -X POST '<uploadUrl>' -H 'Content-Type: <mime>' --data-binary @<localfile>` — the response JSON is `{ storageId }`. Pass that storageId to `document.analyze` (step 2). The bytes go straight to Convex storage and never pass through the model context, so large PDFs/xlsx are fine. No extra credentials: the signed URL carries its own authorization.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async (ctx, _userId, _args) => {
      const uploadUrl = await ctx.runMutation(api.files.generateUploadUrl, {});
      return asText({
        uploadUrl,
        howToUpload: "curl -X POST '<uploadUrl>' -H 'Content-Type: <mime-type>' --data-binary @<local-file-path>",
        next: "The POST response is JSON { storageId }. Call document.analyze with that storageId + the fileName to classify and file it.",
      });
    },
  },
  {
    name: "document.analyze",
    description:
      "Step 2 of ingesting a document via MCP (after document.requestUpload + curl upload). Takes the storageId of an uploaded file, runs it through the V4 classifier, and files it as a documents row under the given client/project — AI-assigned category + summary + auto document code. Returns the created documentId + classification. This is the 'drop docs → analyzed → filed' path for MCP-only operators. Requires NEXT_APP_URL on the server (already set for the other Convex→Next fetchers).",
    inputSchema: {
      type: "object",
      properties: {
        storageId: { type: "string", description: "From the curl upload response (document.requestUpload)." },
        fileName: { type: "string", description: "Original filename incl. extension, e.g. 'appraisal.pdf'." },
        fileType: { type: "string", description: "MIME type, e.g. 'application/pdf'. Default 'application/octet-stream'." },
        fileSize: { type: "number", description: "Optional file size in bytes, for the record." },
        clientId: { type: "string", description: "Client to file the document under." },
        projectId: { type: "string", description: "Optional project/deal to file under." },
      },
      required: ["storageId", "fileName"],
    },
    handler: async (ctx, userId, args) => {
      // 1. Resolve a fetchable URL for the stored file.
      const fileUrl = await ctx.runQuery(api.documents.getFileUrl, { storageId: args.storageId });
      if (!fileUrl) {
        return asText({ error: "storage_not_found", note: "No file at that storageId. Re-upload via document.requestUpload." });
      }

      // 2. Gather light client/project context for classification + filing.
      let clientName: string | undefined;
      let clientType: string | undefined;
      let projectName: string | undefined;
      if (args.clientId) {
        const c: any = await ctx.runQuery(api.clients.get, { id: args.clientId });
        clientName = c?.name;
        clientType = c?.type;
      }
      if (args.projectId) {
        const p: any = await ctx.runQuery(api.projects.get, { id: args.projectId });
        projectName = p?.name;
      }

      // 3. Run the V4 classifier (same server-side path as bulkBackgroundProcessor).
      const rawAppUrl = process.env.NEXT_APP_URL;
      if (!rawAppUrl) {
        return asText({ error: "next_app_url_not_set", note: "Server missing NEXT_APP_URL; cannot reach the V4 analyzer." });
      }
      const appUrl = rawAppUrl.startsWith("http") ? rawAppUrl : `https://${rawAppUrl}`;
      const fd = new FormData();
      fd.append("fileUrl_0", fileUrl);
      fd.append("fileName_0", args.fileName);
      fd.append("fileType_0", args.fileType ?? "application/octet-stream");
      fd.append("metadata", JSON.stringify({
        clientName,
        clientContext: { clientName, clientType },
      }));
      const res = await fetch(`${appUrl}/api/v4-analyze`, { method: "POST", body: fd });
      if (!res.ok) {
        return asText({ error: "v4_analyze_failed", status: res.status, note: (await res.text()).slice(0, 500) });
      }
      const data: any = await res.json();
      const doc = data?.documents?.[0];
      if (!data?.success || !doc) {
        return asText({ error: "v4_no_classification", raw: data });
      }

      // 4. Persist as a filed documents row (one-shot, not the bulk-batch flow).
      const documentId = await ctx.runMutation(api.documents.uploadFileAndCreateDocument, {
        storageId: args.storageId,
        fileName: args.fileName,
        fileSize: args.fileSize ?? 0,
        fileType: args.fileType ?? "application/octet-stream",
        summary: doc.summary ?? "",
        fileTypeDetected: doc.fileType ?? "",
        category: doc.category ?? "Uncategorized",
        reasoning: doc.classificationReasoning ?? "",
        confidence: typeof doc.confidence === "number" ? doc.confidence : 0,
        tokensUsed: 0,
        clientId: args.clientId,
        clientName,
        projectId: args.projectId,
        projectName,
        extractedData: doc.extractedData ?? undefined,
        uploadedBy: userId,
      });

      return asText({
        status: "filed",
        documentId,
        category: doc.category,
        summary: doc.summary,
        confidence: doc.confidence,
        suggestedFolder: doc.suggestedFolder,
        documentCode: doc.generatedDocumentCode,
        note: "Document classified + filed. Link to a project with document.linkToProject or refine via document.updateClassification if the category is off.",
      });
    },
  },

  // ── Harness classification, Claude-side (2026-07-07) ─────────
  // The two halves that make bulk document classification runnable through
  // Claude Code (subscription cost) instead of the v4 API pipeline. The
  // server parses and persists deterministically; the AGENT is the
  // classifier. The API pipeline (driveHydration cron → /api/drive/ingest)
  // stays untouched as the automatic lane for changed-file re-processing.
  {
    name: "document.extractText",
    description:
      "Harness classification step 1 — returns a document's raw text so YOU classify it, then persist your verdict with document.applyClassification. Text-layer documents (PDF/DOCX/XLSX/CSV/EML/…) are parsed SERVER-SIDE with ZERO LLM. The ONE exception: image documents (PNG/JPG term sheets) and scanned image-only PDFs have no text layer, so they are transcribed faithfully via vision — method:'vision' in the result flags this (treat as best-effort OCR; [illegible] marks unreadable regions). Works on any documents row: uses the stored bytes when current, and for a PENDING Drive-imported doc (no bytes yet) fetches them from Drive, caches them in Convex storage, and CLAIMS the mirror row ('processing') so the automatic pipeline doesn't race you — finish with applyClassification within ~30 min or the claim is reclaimed and the API pipeline takes over. Returns {text (a ≤120K-char WINDOW), truncated, textOffset, fullTextChars, fileName, mimeType, contentChecksum, source, method ('parser'|'vision'), parsedName, alreadyClassified, alreadyAtomized}. PAGING (2026-07): when fullTextChars exceeds the window, call again with `textOffset` (the note tells you the next offset) — multi-sheet workbooks now parse EVERY sheet (priority-ordered, per-sheet budget, manifest of all sheets at the top of page one), so atomize fact-dense documents from ALL pages, not just page one; the contentChecksum is identical across pages of one revision. parsedName is the V1.2 file-naming-standard parse of the fileName (docs/classification/RockCap_FileNamingStandard_RC_INTERNAL_V1.2_20260708.md; schema src/lib/naming/filename_schema.json): {scheme, docType, documentDate?, origin{role,party?}, status?, version?, reissue?, filingDate, confidence:'full'|'partial'} or null for non-standard names — TREAT A confidence:'full' parsedName.docType AS A STRONG CLASSIFICATION PRIOR (the name was authored to the client-confirmed convention; the schema's docTypes map gives its appFileType), 'partial' as a hint to verify against content, null as no signal. KEEP contentChecksum — applyClassification requires it for Drive docs (it is the drift anchor). alreadyClassified=true means the doc already has a real classification: skip it in bulk passes unless the operator asked for a re-classify (re-classifying never moves its folder). alreadyAtomized=true means the knowledge graph already has observations for this doc. This is the bulk/onboarding lane; automatic re-processing of CHANGED Drive files stays on the API pipeline.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "The documents row to parse." },
        textOffset: { type: "number", description: "Optional paging offset into the full parsed text (default 0). Use the next-offset value from the previous call's note to read the following ≤120K-char page." },
      },
      required: ["documentId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runAction(
        internal.knowledge.harnessClassify.extractText,
        { documentId: args.documentId, textOffset: args.textOffset },
      );
      return asText(result);
    },
  },
  {
    name: "document.applyClassification",
    description:
      "Harness classification step 2 — persist YOUR classification of a document (after document.extractText) with server-side deterministic filing, mirroring the v4 pipeline's persistence exactly. Use the vocabulary of EXISTING fileTypeDetected/category values — category MUST be one of the 13 canonical categories: Appraisals, Plans, Inspections, Professional Reports, KYC, Loan Terms, Legal Documents, Project Documents, Financial Documents, Insurance, Communications, Warranties, Photographs. fileTypeDetected is the specific type (e.g. 'RedBook Valuation', 'Facility Letter', 'Cashflow', 'Bank Statement', 'Meeting Minutes') — grep a few existing values via document.listByClient if unsure. ALSO PASS THE TWO CLASSIFICATION AXES when you can determine them: producer (client|rockcap|lender|third_party_professional|statutory_authority) and audience (internal|external|neutral) — content-derived (see the per-field descriptions; body stamp beats filename token, Drive owner is never a producer signal). The axes are persisted in the doc's extractedData.classificationAxes and refine SUBFOLDER placement: the server resolves the target folder from (fileTypeDetected, category, producer, audience) through the same placement-rules table the pipeline uses (project taxonomy when the doc has a projectId, client taxonomy otherwise; nested folder keys like client_appraisals/rockcap_appraisals/comps_appendix fall back to their parent folder on older projects; lender_pack is NEVER a target — it encodes an operator send-event, not a category) — on FIRST classification only; a doc that already has a folder is NEVER moved (folders are app-owned). Side effects match the pipeline: knowledge-bank entry (create-only), meeting-extraction job heuristics, context-cache invalidation, an ingestionEvents feed row, and drift-aware completion of the Drive mirror row (pass the contentChecksum extractText returned — REQUIRED for Drive docs; if the file changed in Drive mid-classification the row re-arms and the automatic pipeline re-extracts). Pass textContent (≤900K chars) to persist the parsed text for future re-analysis/atomization — recommended on first classification. Optional keyDates/keyAmounts/keyEntities land in the documentAnalysis block. CLASSIFICATION IDENTITY IS IMMUTABLE: if the doc already has a real classification (extractText returned alreadyClassified:true), your fileTypeDetected/category/producer/audience/confidence are IGNORED — only contents refresh (summary/documentAnalysis/textContent/checksum) and the result carries identityLocked:true; reclassification is a future explicit operator tool (the identityLocked path is the designated hook for the later re-atomization migration). This persists at zero API cost — you already did the classification.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        contentChecksum: { type: "string", description: "The fetch-time checksum document.extractText returned. REQUIRED for Drive-mirrored docs." },
        fileTypeDetected: { type: "string", description: "Specific document type, e.g. 'RedBook Valuation', 'Facility Letter', 'Meeting Minutes'." },
        category: { type: "string", description: "One of the 13 canonical categories (see tool description)." },
        producer: {
          type: "string",
          enum: ["client", "rockcap", "lender", "third_party_professional", "statutory_authority"],
          description: "WHO authored the document — detect from CONTENT, never Drive metadata (Drive owner is always rockcap.uk). client = developer-ops DNA (timesheets, trade cost matrices, Gross Margin %); rockcap = debt-structuring DNA (LTGDV / Lender IRR / Lender Dashboard tabs / Note house template); lender = first-person lender voice + broker-as-a-fee-line; third_party_professional = firm letterhead / architect job numbers; statutory_authority = HEREBY PERMITS / TCPA citations / planning refs. Refines subfolder placement (e.g. client_appraisals vs rockcap_appraisals).",
        },
        audience: {
          type: "string",
          enum: ["internal", "external", "neutral"],
          description: "WHO the document is for — detect from body name-stamp + register; a filename AUDIENCE token records filing custody only and can lie (body stamp wins). neutral = public record (statutory decisions).",
        },
        summary: { type: "string", description: "≤1200 chars. What the document is, who it concerns, the headline figures/dates." },
        confidence: { type: "number", description: "0..1 (clamped server-side)." },
        reasoning: { type: "string", description: "Why you classified it this way — audit trail." },
        keyDates: { type: "array", items: { type: "string" }, description: "Notable dates, e.g. '2027-09-30 (maturity)'." },
        keyAmounts: { type: "array", items: { type: "string" }, description: "Notable amounts, e.g. '£3.2M senior facility'." },
        keyEntities: {
          type: "object",
          description: "People/companies/locations/projects named in the document.",
          properties: {
            people: { type: "array", items: { type: "string" } },
            companies: { type: "array", items: { type: "string" } },
            locations: { type: "array", items: { type: "string" } },
            projects: { type: "array", items: { type: "string" } },
          },
        },
        textContent: { type: "string", description: "Optional (≤900K chars): the parsed text, persisted on the doc for future re-analysis." },
      },
      required: ["documentId", "fileTypeDetected", "category", "summary", "confidence"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(
        internal.knowledge.harnessClassify.applyClassification,
        {
          documentId: args.documentId,
          contentChecksum: args.contentChecksum,
          fileTypeDetected: args.fileTypeDetected,
          category: args.category,
          producer: args.producer,
          audience: args.audience,
          summary: args.summary,
          confidence: args.confidence,
          reasoning: args.reasoning,
          keyDates: args.keyDates,
          keyAmounts: args.keyAmounts,
          keyEntities: args.keyEntities,
          textContent: args.textContent,
        },
      );
      return asText(result);
    },
  },

  // ── Spreadsheet extraction, Claude-side (2026-06-01) ─────────
  // The server hands over the cells; the agent does the extraction. getSheetData
  // turns a stored xlsx/csv into structured cells so the model can reason out the
  // figures (GDV/TDC/units/peak debt/LTGDV…) with provenance, then write them back
  // via saveIntelligence (with templateTags, for re-populating appraisal templates).
  {
    name: "document.getSheetData",
    description:
      "Read a stored spreadsheet (xlsx/xls/csv) as STRUCTURED CELLS so YOU can extract the figures. Returns `{ sheets: [{ name, rows: [[cell,…]] }] }` (rows capped per sheet — raise maxRows for big models). The workflow for an appraisal/financial spreadsheet: call this → reason out GDV / total development cost / unit schedule / peak debt / LTGDV / profit-on-cost etc. (note the sheet!cell each came from) → persist with `document.saveIntelligence`. Pass a `documentId` (resolves its stored file) or a raw `storageId`. The server only parses cells; it does not interpret them.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "A documents row with a stored file. Resolves its storageId + fileName." },
        storageId: { type: "string", description: "Alternatively, a raw Convex storageId (e.g. straight from document.requestUpload)." },
        fileName: { type: "string", description: "Helps detect csv vs xlsx. Auto-filled when documentId is given." },
        maxRows: { type: "number", description: "Rows per sheet cap (default 250). Raise for large appraisal models." },
      },
      required: [],
    },
    handler: async (ctx, _userId, args) => {
      let storageId: string | undefined = args.storageId;
      let fileName: string | undefined = args.fileName;
      if (!storageId && args.documentId) {
        const d: any = await ctx.runQuery(api.documents.get, { id: args.documentId });
        if (!d) return asText({ error: "document_not_found", documentId: args.documentId });
        storageId = d.fileStorageId;
        fileName = fileName ?? d.fileName;
      }
      if (!storageId) {
        return asText({ error: "no_storage", note: "Pass a documentId (with a stored file) or a storageId." });
      }
      const fileUrl = await ctx.runQuery(api.documents.getFileUrl, { storageId });
      if (!fileUrl) return asText({ error: "storage_not_found", note: "No file at that storageId." });

      const rawAppUrl = process.env.NEXT_APP_URL;
      if (!rawAppUrl) return asText({ error: "next_app_url_not_set", note: "Server missing NEXT_APP_URL; cannot reach the sheet parser." });
      const appUrl = rawAppUrl.startsWith("http") ? rawAppUrl : `https://${rawAppUrl}`;
      const res = await fetch(`${appUrl}/api/sheet-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl, fileName, maxRows: args.maxRows }),
      });
      if (!res.ok) {
        return asText({ error: "sheet_data_failed", status: res.status, note: (await res.text()).slice(0, 300) });
      }
      return asText(await res.json());
    },
  },
  {
    name: "document.saveIntelligence",
    description:
      "Write structured extracted fields onto a document AND into the knowledge library — how you persist appraisal figures after extracting them from document.getSheetData. Each field: `{ fieldPath (e.g. 'financials.grossDevelopmentValue'), label, value, valueType ('number'|'string'|'date'|…), confidence (0-1), scope ('project'|'client'|'document'), isCanonical, category (e.g. 'Appraisals'), templateTags? (tag figures so they can re-populate appraisal templates), sourceText? (the sheet!cell or range it came from) }`. Pass `projectId` / `clientId` so project/client-scoped facts land on the right entity (defaults to the document's own links). Supersedes prior facts at the same fieldPath from this document.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        projectId: { type: "string", description: "Scope target for project-level facts. Defaults to the document's projectId." },
        clientId: { type: "string", description: "Scope target for client-level facts. Defaults to the document's clientId." },
        fields: {
          type: "array",
          description: "The extracted fields to persist.",
          items: {
            type: "object",
            properties: {
              fieldPath: { type: "string", description: "e.g. 'financials.grossDevelopmentValue', 'financials.totalDevelopmentCost', 'financials.peakDebt'." },
              label: { type: "string", description: "Human label, e.g. 'Gross Development Value'." },
              value: { description: "The value (number for figures)." },
              valueType: { type: "string", description: "number / string / date / currency / percent." },
              confidence: { type: "number", description: "0-1." },
              scope: { type: "string", description: "project / client / document." },
              isCanonical: { type: "boolean", description: "True if this is the authoritative value for the fieldPath." },
              category: { type: "string", description: "e.g. 'Appraisals'." },
              templateTags: { type: "array", items: { type: "string" }, description: "Tags for template re-population." },
              sourceText: { type: "string", description: "Provenance — the sheet!cell or range, e.g. 'Appraisal!B12'." },
            },
            required: ["fieldPath", "label", "value", "valueType", "confidence", "scope", "isCanonical", "category"],
          },
        },
      },
      required: ["documentId", "fields"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(api.documents.saveDocumentIntelligence, {
        documentId: args.documentId,
        fields: args.fields,
        clientId: args.clientId,
        projectId: args.projectId,
      });
      return asText(result);
    },
  },
  {
    name: "projectData.upsertItem",
    description:
      "Write a single extracted figure into a project's DATA LIBRARY (the project/client Data tab) — this is where appraisal financials belong. Upsert by `(projectId, itemCode)`: re-running an extraction updates the value and appends to its history. Use a canonical `itemCode` (e.g. `FIN.GDV`, `FIN.TDC`, `FIN.LTGDV`, `SCH.UNITS`), the `category` (e.g. 'Financials' / 'Scheme'), `originalName` (display label), `value` (number for £/%), `dataType` ('currency' / 'percentage' / 'number'), the source `documentId` (so it groups under the file in the Data tab), and `note` for provenance (e.g. 'Appraisal!C10'). The library normalizes the value + computes category totals. For headline figures that lender-matching needs (GDV/TDC/LTGDV/units), ALSO call `intelligence.addKnowledgeItem` with the matching `financials.*` fieldPath.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        itemCode: { type: "string", description: "Canonical code, e.g. FIN.GDV / FIN.TDC / SCH.UNITS." },
        category: { type: "string", description: "Grouping category, e.g. 'Financials', 'Scheme', 'Timeline'." },
        originalName: { type: "string", description: "Display label, e.g. 'Gross Development Value'." },
        value: { description: "The value — a number for currency/percent figures." },
        dataType: { type: "string", description: "currency / percentage / number." },
        documentId: { type: "string", description: "Source document, so the figure files under its name in the Data tab." },
        note: { type: "string", description: "Provenance — the sheet!cell or derivation, e.g. 'Appraisal!C10' or 'derived'." },
      },
      required: ["projectId", "itemCode", "category", "originalName", "value", "dataType"],
    },
    handler: async (ctx, userId, args) => {
      let sourceDocumentName: string | undefined;
      if (args.documentId) {
        const d: any = await ctx.runQuery(api.documents.get, { id: args.documentId });
        sourceDocumentName = d?.fileName;
      }
      const result = await ctx.runMutation(internal.projectDataLibrary.upsertExtractedItemInternal, {
        projectId: args.projectId,
        itemCode: args.itemCode,
        category: args.category,
        originalName: args.originalName,
        value: args.value,
        dataType: args.dataType,
        userId,
        sourceDocumentId: args.documentId,
        sourceDocumentName,
        note: args.note,
      });
      return asText(result);
    },
  },

  // ── Last CLI-fallback removers (2026-06-01) ──────────────────
  {
    name: "bulkUpload.getBatchItems",
    description:
      "List the items in a bulk-upload batch (the per-file rows + their classification/status). Use when a deal-intake or doc workflow is driven from a `bulkUploadBatchId` — removes the prior `npx convex run` fallback. Returns the bulkUploadItems rows for the batch.",
    inputSchema: {
      type: "object",
      properties: { batchId: { type: "string", description: "Convex id of the bulkUploadBatches row." } },
      required: ["batchId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.bulkUpload.getBatchItems, { batchId: args.batchId });
      return asText(result);
    },
  },
  {
    name: "checklist.initializeForProject",
    description:
      "Seed the document checklist for a project from the client-type template. Idempotent — returns a no-op if the project already has a checklist. Note: `project.create` already auto-seeds the checklist, so this is the explicit / re-initialise path (e.g. a legacy project created before auto-seeding). Removes the prior `npx convex run` fallback in deal-intake.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the client." },
        projectId: { type: "string", description: "Convex id of the project." },
        clientType: { type: "string", description: "Client type driving the template (e.g. 'borrower', 'developer')." },
      },
      required: ["clientId", "projectId", "clientType"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(api.knowledgeLibrary.initializeChecklistForProject, {
        clientId: args.clientId,
        projectId: args.projectId,
        clientType: args.clientType,
      });
      return asText(result);
    },
  },

  // ── Sourcing domain ──────────────────────────────────────────
  // Prospect SOURCING from the charges service: from a known lender, surface
  // the companies it has charged as bulk candidates, enrich each with one CH
  // profile call, and let the operator promote the few that fit into the
  // prospect pipeline. Candidates live in `sourcedCompanies` (NOT clients).
  {
    name: "sourcing.searchLenders",
    description:
      "Disambiguate a lender name against the charges dataset. Returns distinct canonical lenders matching the query with charge/company counts — e.g. 'PARAGON' resolves to PARAGON BANK PLC vs PARAGON DEVELOPMENT FINANCE LIMITED. Call this FIRST to get the exact canonical name to pass to sourcing.fromLender.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Fuzzy lender name, e.g. 'paragon dev finance'" },
        limit: { type: "number", description: "Max lenders to return. Default 25." },
      },
      required: ["query"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runAction(api.sourcing.searchLenders, {
        query: args.query,
        limit: args.limit,
      });
      return asText(result);
    },
  },
  {
    name: "sourcing.fromLender",
    description:
      "Source prospect CANDIDATES from a known lender: pull the companies that lender has charged (from the charges service), enrich each with one Companies House profile call (name/status/SIC/town), dedup against the existing client book, and store as `sourcedCompanies` candidates. These are NOT prospects yet — review then promote. Pass the EXACT canonical lender name from sourcing.searchLenders. Filters: status (all|outstanding|satisfied), registeredSince/registeredUntil (YYYY-MM-DD), jurisdiction (ew|sc|ni), entityType (company|llp), propertyContains (free-text scheme/location). Capped at 500 companies — narrow big lenders with registeredSince.",
    inputSchema: {
      type: "object",
      properties: {
        lender: { type: "string", description: "Exact canonical lender name (from sourcing.searchLenders)" },
        status: { type: "string", description: "all | outstanding | satisfied. Default all." },
        registeredSince: { type: "string", description: "YYYY-MM-DD lower bound on charge date" },
        registeredUntil: { type: "string", description: "YYYY-MM-DD upper bound on charge date" },
        jurisdiction: { type: "string", description: "ew | sc | ni" },
        entityType: { type: "string", description: "company | llp" },
        propertyContains: { type: "string", description: "free-text scheme/location filter" },
        limit: { type: "number", description: "Max companies (<=500). Default 500." },
      },
      required: ["lender"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runAction(api.sourcing.sourceFromLender, args);
      return asText(result);
    },
  },
  {
    name: "sourcing.list",
    description:
      "List sourced prospect candidates. Filter by state (new|reviewed|promoted|dismissed), lender (canonical name), or batch. Set includeInBook=false to hide companies already in the client book. Returns candidates with CH profile + charge provenance, newest charge first.",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", description: "new | reviewed | promoted | dismissed" },
        lender: { type: "string", description: "canonical lender name" },
        batch: { type: "string", description: "sourcing batch id" },
        includeInBook: { type: "boolean", description: "include companies already in the book (default true)" },
        limit: { type: "number" },
      },
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.sourcing.list, args ?? {});
      return asText(result);
    },
  },
  {
    name: "sourcing.promote",
    description:
      "Promote a sourced candidate into the prospect pipeline: creates a borrower client (status=prospect) linked to the CH number, schedules the full Companies House sync, and marks the candidate 'promoted'. Apollo / deep intel is a separate operator-driven step after this. Returns the new client id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "sourcedCompanies row id" } },
      required: ["id"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(api.sourcing.promote, { id: args.id });
      return asText({ promotedToClientId: result });
    },
  },
  {
    name: "sourcing.setState",
    description:
      "Set a sourced candidate's state to reviewed or dismissed (or back to new), with optional notes. Use to triage a sourcing batch without promoting.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "sourcedCompanies row id" },
        state: { type: "string", description: "new | reviewed | dismissed" },
        notes: { type: "string" },
      },
      required: ["id", "state"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(api.sourcing.setState, {
        id: args.id,
        state: args.state,
        notes: args.notes,
      });
      return asText(result);
    },
  },

  // ── Drive domain ─────────────────────────────────────────────
  // One org-wide Google Drive connection, mirrored every 2 min into
  // driveFolders/driveFiles. Mapping a folder to a client sets OWNERSHIP SCOPE
  // only; IMPORT is the purposeful act that creates a documents row and turns
  // the live extraction link on. Folder imports dry-run first — a deliberate
  // cost barrier, because every imported file is later extracted through the
  // Claude-powered v4 pipeline. These tools drive ingestion from Claude Code.
  // Phase 6 adds the ONLY writes back to Drive — organizational operations
  // (createFolder / moveFile / rename; never file contents) — each staged as
  // a PENDING approval and gated behind the /settings/drive write-back
  // kill switch (checked at queue time AND re-checked at execute time).
  {
    name: "drive.status",
    description:
      "Google Drive connection status + mirror stats in one call. Returns the connected account email, root folder, lastSyncAt, and whether the connection needs re-authorising (needsReconnect), plus mirror counts: total/mapped/trashed folders, total/imported/trashed files, and files by extractionStatus. Read-only. Start here to confirm Drive is connected and synced before listing or importing.",
    inputSchema: { type: "object", properties: {} },
    handler: async (ctx, _userId) => {
      const result = await ctx.runQuery(internal.driveSync.getStatusForMcpInternal, {});
      return asText(result);
    },
  },
  {
    name: "drive.listFolders",
    description:
      "List the child folders of a Drive folder (omit parentFolderId to list the connection root), with the root→here breadcrumb. Each folder carries its effective client mapping — effectiveClientId/effectiveClientName (the nearest ancestor mapping, inherited if not set on this folder) and isExplicitMapping (whether the mapping lives on THIS folder) — plus its effective PROJECT mapping: effectiveProjectId/effectiveProjectName and isExplicitProjectMapping (same nearest-ancestor semantics; a project mapping makes imports from that subtree file at PROJECT level) — plus its wide-net auto-import state: effectiveAutoImport/isExplicitAutoImport (see drive.setAutoImport) and autoImportCapHit (ms — the folder tripped the 20/day auto-import cap; a stamp from today means files are waiting on a manual import / harness wave). Read-only — this is how you navigate the Drive tree to find the folder to map or import. Mapping/scope is set with drive.mapFolderToClient / drive.mapFolderToProject; nothing is imported by listing.",
    inputSchema: {
      type: "object",
      properties: {
        parentFolderId: {
          type: "string",
          description: "Drive folder id to list children of. Omit for the connection root.",
        },
      },
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(internal.driveSync.listFolderChildrenInternal, {
        parentFolderId: args?.parentFolderId,
      });
      return asText(result);
    },
  },
  {
    name: "drive.listFiles",
    description:
      "List the files in a Drive folder from the mirror: name, mimeType, size, modifiedTime, driveFileId, imported (whether a documents row exists — i.e. documentId is set), extractionStatus (none/settling/processing/complete/error), and documentId when imported. By default lists only the folder's direct files; pass subtree:true to list the whole descendant subtree (import-picker style, capped at 500 rows with a `truncated` flag). Read-only. Use to see what is importable and what has already been imported/extracted before calling drive.importFiles / drive.importFolder.",
    inputSchema: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "Drive folder id" },
        subtree: {
          type: "boolean",
          description: "List the whole descendant subtree (capped at 500) instead of just direct files.",
        },
      },
      required: ["folderId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(internal.driveSync.listFilesForMcpInternal, {
        folderId: args.folderId,
        subtree: args?.subtree,
      });
      return asText(result);
    },
  },
  {
    name: "drive.getFile",
    description:
      "Full mirror detail for a single Drive file by driveFileId: name, mimeType, size, modifiedTime, parentFolderId, trashed, md5Checksum, webViewLink, imported flag + linked documentId, extractionStatus/extractionError, and the effective client scope (inScope / clientId / clientName / mappedFolderId — resolved via the nearest mapped ancestor folder). Read-only. Use to inspect one file's import + extraction state and confirm which client it would import under.",
    inputSchema: {
      type: "object",
      properties: { driveFileId: { type: "string", description: "Drive file id" } },
      required: ["driveFileId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(internal.driveSync.getFileForMcpInternal, {
        driveFileId: args.driveFileId,
      });
      return asText(result);
    },
  },
  {
    name: "drive.mapFolderToClient",
    description:
      "Map a Drive folder to a client — or omit clientId to clear the mapping. Mapping sets OWNERSHIP SCOPE ONLY: it does NOT import or extract anything, creates no documents rows, and queues no work, so mapping a 10,000-file historical folder costs nothing. The mapping is inherited by descendant folders/files (nearest-ancestor wins) and determines which client a later import files under. To actually bring files into the app library, use drive.importFolder / drive.importFiles after mapping. Idempotent.",
    inputSchema: {
      type: "object",
      properties: {
        driveFolderId: { type: "string", description: "Drive folder id" },
        clientId: {
          type: "string",
          description: "Convex clients id to map to. Omit to clear the mapping.",
        },
      },
      required: ["driveFolderId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.driveSync.mapFolderToClientInternal, {
        driveFolderId: args.driveFolderId,
        clientId: args.clientId,
      });
      return asText(result);
    },
  },
  {
    name: "drive.mapFolderToProject",
    description:
      "Map a Drive subfolder to an in-app project — or omit projectId to clear the mapping — so imports from that subtree file at PROJECT level (documents get projectId/projectName stamped and land in the project's folder taxonomy instead of polluting the client library). The folder MUST already sit inside a client-mapped subtree, and the project must belong to that same client — rejected otherwise. Like drive.mapFolderToClient this sets SCOPE ONLY: nothing is imported or extracted, no documents rows are created, no work is queued. Inherited by descendant folders (nearest projectId-mapped ancestor wins). Typical onboarding: map the client's top folder (drive.mapFolderToClient) → map each project subfolder with this → import per project (drive.importFolder). Idempotent.",
    inputSchema: {
      type: "object",
      properties: {
        driveFolderId: { type: "string", description: "Drive folder id (must be inside a client-mapped subtree)" },
        projectId: {
          type: "string",
          description: "Convex projects id to map to (must belong to the folder's effective client). Omit to clear the mapping.",
        },
      },
      required: ["driveFolderId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.driveSync.mapFolderToProjectInternal, {
        driveFolderId: args.driveFolderId,
        projectId: args.projectId,
      });
      return asText(result);
    },
  },
  {
    name: "drive.setAutoImport",
    description:
      "Arm (or disarm) WIDE-NET auto-import on a Drive folder — a STANDING AUTHORIZATION: from now on, NEW files dropped anywhere in this subtree are automatically imported on the poll tick that mirrors them (metadata-first document immediately, then classified through the v4 API pipeline at a few cents per file). The folder's effective scope must have a client mapping (drive.mapFolderToClient first) — the flag is inert outside a client scope. Inherits like the project mapping: nearest ancestor-or-self with the flag EXPLICITLY set wins, so enabled:false on a subfolder carves it out of a flagged parent. GUARD RAILS: capped at 20 auto-imports/day per flagged folder. A bulk drop beyond the cap stays mirrored but UNIMPORTED, the folder is flagged (autoImportCapHit — badged in the /settings/drive tree), and cap-skipped files do NOT retro-import the next day (they are no longer 'new' to the mirror) — run drive.importFolder / a harness classification wave for the remainder. Atomization stays a harness-lane act regardless. Arming imports nothing retroactively — existing files still need an explicit import. Returns {ok, enabled}.",
    inputSchema: {
      type: "object",
      properties: {
        driveFolderId: { type: "string", description: "Drive folder id (should sit inside a client-mapped subtree — the flag has no effect outside one)" },
        enabled: { type: "boolean", description: "true to arm auto-import for the subtree; false to disarm (or to carve a subfolder out of a flagged parent)" },
      },
      required: ["driveFolderId", "enabled"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.driveSync.setFolderAutoImportInternal, {
        driveFolderId: args.driveFolderId,
        enabled: args.enabled,
      });
      return asText(result);
    },
  },
  {
    name: "drive.importFiles",
    description:
      "Import specific Drive files into the app library (≤200 driveFileIds per call). Each imported file becomes a METADATA-FIRST document immediately — visible in the client's library at once (fileName/size/link) — and extraction follows automatically within the ~5–20 min settle window through the Claude-powered v4 pipeline; thereafter Drive edits auto-update the document. Files under a project-mapped folder (drive.mapFolderToProject) are additionally stamped with projectId/projectName and file into the PROJECT's folder taxonomy on extraction. Returns {imported, skipped:[{driveFileId, reason}]} — a file is skipped if it is trashed, already imported, not found, or its folder has no client mapping (map it first with drive.mapFolderToClient). Use for a targeted handful of files; for a whole folder use drive.importFolder (which dry-runs the cost first). DUPLICATE SIGNATURE: several files whose Drive createdTime clusters in a tight window (seconds apart) AND whose createdTime > modifiedTime are COPIES pasted in together (e.g. a curated 'Lender Pack' send bundle) — the cheap first check is the same filename elsewhere in the tree. Classify such files by TYPE to their canonical folder (never to a lender_pack folder) and note them as outbound-pack members / probable duplicates of the canonical copy.",
    inputSchema: {
      type: "object",
      properties: {
        driveFileIds: {
          type: "array",
          items: { type: "string" },
          description: "Drive file ids to import (max 200).",
        },
      },
      required: ["driveFileIds"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.driveSync.importDriveFilesInternal, {
        driveFileIds: args.driveFileIds,
      });
      return asText(result);
    },
  },
  {
    name: "drive.importFolder",
    description:
      "Import a whole Drive folder subtree into the app library. WITHOUT confirm this is a DRY RUN — zero writes — returning {dryRun:true, fileCount (importable files), alreadyImported, folders}; nothing is imported. This is a deliberate COST BARRIER: every imported file is later extracted through the Claude-powered v4 pipeline. You MUST present fileCount to the operator and only call again with confirm:true after their EXPLICIT approval. WITH confirm:true it imports the subtree, chaining through the scheduler: it returns the first slice's counts ({dryRun:false, imported, queuedForImport, ...}) and the rest continues in the background. Files land as metadata-first documents immediately (visible at once) and extract automatically within the ~5–20 min settle window; thereafter Drive edits auto-update the documents. Files under a project-mapped folder (drive.mapFolderToProject) are stamped with projectId/projectName and file into the PROJECT's folder taxonomy — map project subfolders BEFORE importing so project documents don't pollute the client library. Files whose folder has no client mapping are skipped — map the folder first with drive.mapFolderToClient. DUPLICATE SIGNATURE (common in imported deal folders): files whose Drive createdTime clusters in a tight window (seconds apart) AND whose createdTime > modifiedTime are COPIES pasted in together — typically an operator-curated 'Lender Pack' send bundle duplicating files that live elsewhere in the tree (same filename is the cheap first check). Classify such files by TYPE to their canonical folder (lender_pack is never a classification target) and treat them as outbound-pack members / probable duplicates of the canonical copy.",
    inputSchema: {
      type: "object",
      properties: {
        driveFolderId: { type: "string", description: "Drive folder id" },
        confirm: {
          type: "boolean",
          description:
            "Omit/false for a dry-run count (nothing imported). Pass true ONLY after the operator approves the count.",
        },
      },
      required: ["driveFolderId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.driveSync.importDriveFolderInternal, {
        driveFolderId: args.driveFolderId,
        confirm: args?.confirm,
      });
      return asText(result);
    },
  },
  {
    name: "drive.createFolder",
    description:
      "Stage the creation of a new Google Drive folder as a PENDING OPERATOR APPROVAL — nothing is written to Drive by this call. Action it IN-CHAT: present the staged write to the operator and, on their explicit yes, call approval.approve (approval.approveBatch for many) — the app's /approvals page is an alternative surface, not a requirement. Only after approval does the folder get created (and echoed into the mirror immediately). This is one of the only four writes the app EVER makes to Drive (create folder / move file / rename / save email attachment — the app never edits existing file contents). Requires the Drive write-back kill switch to be enabled at /settings/drive — the call throws (nothing staged) if it is off. The parent folder must already be in the mirror (find it with drive.listFolders). Returns {approvalId, description}.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the new folder" },
        parentFolderId: {
          type: "string",
          description: "Drive folder id of the parent (must exist in the mirror and not be trashed)",
        },
      },
      required: ["name", "parentFolderId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.driveWriteback.requestWrite, {
        userId,
        op: "create_folder",
        args: { name: args.name, parentFolderId: args.parentFolderId },
      });
      return asText({
        ...result,
        status: "PENDING OPERATOR APPROVAL",
        message:
          "Folder creation staged — NOTHING has been written to Drive yet. Approve via approval.approve on the operator's explicit yes (or at /approvals in the app) before it executes. (Drive write-back must also remain enabled at /settings/drive at execute time.)",
      });
    },
  },
  {
    name: "drive.moveFile",
    description:
      "Stage moving a Drive file to a different folder as a PENDING OPERATOR APPROVAL — nothing is written to Drive by this call. Action it IN-CHAT: present the staged write to the operator and, on their explicit yes, call approval.approve (approval.approveBatch for many) — the app's /approvals page is an alternative surface, not a requirement. Only after approval does the move execute (the executor fetches the file's CURRENT parents live from Drive at that moment, so a file that moved in the meantime is handled correctly, and the mirror is updated immediately — no re-extraction is queued, since contents don't change). Organizational write only; the app never edits file contents. Requires the Drive write-back kill switch to be enabled at /settings/drive — throws (nothing staged) if off. Both the file and the destination folder must be in the mirror. Returns {approvalId, description}.",
    inputSchema: {
      type: "object",
      properties: {
        driveFileId: { type: "string", description: "Drive file id to move" },
        newParentFolderId: {
          type: "string",
          description: "Drive folder id of the destination (must exist in the mirror and not be trashed)",
        },
      },
      required: ["driveFileId", "newParentFolderId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.driveWriteback.requestWrite, {
        userId,
        op: "move_file",
        args: { driveFileId: args.driveFileId, newParentFolderId: args.newParentFolderId },
      });
      return asText({
        ...result,
        status: "PENDING OPERATOR APPROVAL",
        message:
          "Move staged — NOTHING has been written to Drive yet. Approve via approval.approve on the operator's explicit yes (or at /approvals in the app) before it executes. (Drive write-back must also remain enabled at /settings/drive at execute time.)",
      });
    },
  },
  {
    name: "drive.rename",
    description:
      "Stage renaming a Drive file or folder as a PENDING OPERATOR APPROVAL — nothing is written to Drive by this call. Action it IN-CHAT: present the staged write to the operator and, on their explicit yes, call approval.approve (approval.approveBatch for many) — the app's /approvals page is an alternative surface, not a requirement. Only after approval does the rename execute (echoed into the mirror immediately — folder renames recompute descendant paths, imported file renames update the library's fileName live; no re-extraction is queued). Organizational write only; the app never edits file contents. Requires the Drive write-back kill switch to be enabled at /settings/drive — throws (nothing staged) if off. The item must be in the mirror; the connection root folder cannot be renamed. Returns {approvalId, description}.",
    inputSchema: {
      type: "object",
      properties: {
        driveId: { type: "string", description: "Drive id of the file or folder to rename" },
        newName: { type: "string", description: "The new name" },
        kind: {
          type: "string",
          description: '"file" or "folder" — which table the id refers to',
        },
      },
      required: ["driveId", "newName", "kind"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.driveWriteback.requestWrite, {
        userId,
        op: "rename",
        args: { driveId: args.driveId, newName: args.newName, kind: args.kind },
      });
      return asText({
        ...result,
        status: "PENDING OPERATOR APPROVAL",
        message:
          "Rename staged — NOTHING has been written to Drive yet. Approve via approval.approve on the operator's explicit yes (or at /approvals in the app) before it executes. (Drive write-back must also remain enabled at /settings/drive at execute time.)",
      });
    },
  },
  {
    name: "drive.saveEmailAttachment",
    description:
      "Stage copying an attachment from an inbound Gmail email into a Google Drive folder as a PENDING OPERATOR APPROVAL — nothing is written by this call. Action it IN-CHAT: present the staged write to the operator and, on their explicit yes, call approval.approve (approval.approveBatch for many) — the app's /approvals page is an alternative surface, not a requirement. Only after approval does the executor fetch the attachment bytes from the mailbox owner's Gmail (the bytes are never stored in the app), upload them into the target folder, and echo the new file into the mirror immediately. Identify the email by replyEventId (preferred — any Gmail-ingested row from the reply feed) OR gmailMessageId (Gmail message id / RFC822 Message-ID, for mail not in the feed — read from the calling user's mailbox). filename must match an attachment on the message — check with reply.listAttachments first, and pass its partId to disambiguate duplicate filenames. The destination folder must be in the mirror (drive.listFolders) and not trashed. Pass importToLibrary:true to ALSO import the uploaded file as a metadata-first document (extraction follows via the v4 pipeline — a few cents; requires the folder to have an effective client mapping, else the import is skipped with a reason in the executionResult). NOTE: the upload does NOT trigger folder auto-import even when armed (the executor mirrors the file before the poller sees it) — importToLibrary is the only import lane. Optional newName renames the file on upload. Requires the Drive write-back kill switch ON at /settings/drive — throws (nothing staged) if off; the executor re-checks it at fire time. Also requires the mailbox owner's Gmail connection to be live. Returns {approvalId, description}.",
    inputSchema: {
      type: "object",
      properties: {
        replyEventId: {
          type: "string",
          description: "Reply event id of the Gmail-ingested email carrying the attachment (preferred).",
        },
        gmailMessageId: {
          type: "string",
          description:
            "Alternative: a Gmail message id or RFC822 Message-ID header, for mail not in the reply feed (read from the calling user's mailbox).",
        },
        filename: {
          type: "string",
          description: "Filename of the attachment to save (as listed by reply.listAttachments).",
        },
        partId: {
          type: "string",
          description: "MIME part id from reply.listAttachments — pass to disambiguate duplicate filenames.",
        },
        targetFolderId: {
          type: "string",
          description: "Drive folder id of the destination (must exist in the mirror and not be trashed).",
        },
        newName: {
          type: "string",
          description: "Optional new filename for the uploaded file (defaults to the attachment's own name).",
        },
        importToLibrary: {
          type: "boolean",
          description:
            "Also import the uploaded file into the app library after upload (extraction cost applies; folder must have a client mapping).",
        },
      },
      required: ["filename", "targetFolderId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.driveWriteback.requestWrite, {
        userId,
        op: "upload_email_attachment",
        args: {
          replyEventId: args.replyEventId,
          gmailMessageId: args.gmailMessageId,
          filename: args.filename,
          partId: args.partId,
          targetFolderId: args.targetFolderId,
          newName: args.newName,
          importToLibrary: args.importToLibrary,
        },
      });
      return asText({
        ...result,
        status: "PENDING OPERATOR APPROVAL",
        message:
          "Upload staged — NOTHING has been written to Drive yet. Approve via approval.approve on the operator's explicit yes (or at /approvals in the app) before the attachment is fetched from Gmail and uploaded. (Drive write-back must also remain enabled at /settings/drive at execute time.)",
      });
    },
  },

  // ── atoms.* — Knowledge Layer (Spec 2 §11 / §14b.1) ──────────
  // The HARNESS LANE write surface. Claude Code (subscription cost) does bulk
  // atomization via these tools; the API lane (a Convex cron → Next route)
  // handles cheap incremental re-atomization. BOTH lanes persist through
  // knowledge/atomsCore, so the three persistence gates (anchored /
  // discriminating / material) are machine-checked server-side and cannot be
  // bypassed. Predicates come from a versioned vocabulary module — call
  // atoms.vocabulary FIRST so you never guess a predicate name.
  {
    name: "atoms.createBatch",
    description:
      "Persist a batch of candidate atoms (≤100 per call — chunk larger sets). Each atom is ONE self-contained fact anchored to a rostered entity. THREE GATES are enforced server-side and an atom that fails ANY is REJECTED, not stored: (1) anchored — subjectId must resolve to a real row (clients/projects/contacts/companiesHouseCompanies/facilities) or the atom is dropped; (2) discriminating — the peer test is your job at extraction time (see the atomize-document skill); (3) material — amounts, terms, parties/roles, dates, obligations, security, ownership, status, appetite. Predicates MUST come from the vocabulary (families: financing, people, structure, property) — call atoms.vocabulary first; unknown or native-store predicates (officer_of, has_appetite_for, etc.) are rejected. Each atom needs EXACTLY ONE of objectEntityId (an EDGE — also set objectEntityType) or objectLiteral{value,valueType,currency?,unit?} (an ATTRIBUTE). Returns the engine's result verbatim: {created, corroborated, superseded, contested, rejected, facilities}. CRITICAL: READ the `rejected` array — each entry has {index, statement, reason}. Do NOT silently drop rejects: fix the cause (usually a subjectId/objectEntityId that isn't a real row, an unknown predicate, or edge/literal both-or-neither) and resubmit the repaired atoms. Corroboration, contradiction and supersession are handled automatically (five docs stating one GDV converge on one atom). FACILITY DISCIPLINE (2026-07): a lends_to or funds_project edge with a tranche qualifier MINTS/REBUILDS the (project, lender, tranche) facility — status stamped from the source doc class (term sheet → indicative) — and `facilities.minted`/`facilities.rebuilt` return {facilityId, projectId, lenderClientId?, lenderCompanyId?, tranche?} so you can map your quote to its facility. Anchor the quote's economics (has_loan_amount, has_interest_rate, matures_on, has_loan_term_months, has_guarantee) to subjectType 'facility' with that facilityId in a FOLLOW-UP batch — NEVER to the project, where rival lenders' numbers contest each other as false conflicts. Recommended per terms doc: batch 1 = the funds_project/lends_to edge (+ scheme facts); read facilities from the result; batch 2 = the facility-anchored economics.",
    inputSchema: {
      type: "object",
      properties: {
        atoms: {
          type: "array",
          description: "≤100 candidate atoms.",
          items: {
            type: "object",
            properties: {
              statement: { type: "string", description: "One self-contained sentence." },
              subjectType: { type: "string", description: "client | project | contact | company | facility" },
              subjectId: { type: "string", description: "Stringified Convex id of the subject row (must exist)." },
              predicate: { type: "string", description: "A vocabulary predicate (call atoms.vocabulary)." },
              objectEntityType: { type: "string", description: "EDGE only: type of the object row." },
              objectEntityId: { type: "string", description: "EDGE only: Convex id of the object row (must exist). Mutually exclusive with objectLiteral." },
              objectLiteral: {
                type: "object",
                description: "ATTRIBUTE only. Mutually exclusive with objectEntityId.",
                properties: {
                  value: { description: "Canonicalized value (ISO date / raw number / string / range)." },
                  valueType: { type: "string", description: "currency | number | percentage | date | string | range" },
                  currency: { type: "string" },
                  unit: { type: "string" },
                },
              },
              qualifier: { type: "string", description: "Multi-instance disambiguation, e.g. Senior / Mezzanine." },
              clientId: { type: "string", description: "Owning client scope (Convex id)." },
              projectId: { type: "string", description: "Owning project scope (Convex id)." },
              asOf: { type: "string", description: "ISO date the fact was true in the world." },
              confidence: { type: "number", description: "0..1." },
              observation: {
                type: "object",
                description: "Provenance for THIS source occurrence.",
                properties: {
                  sourceType: { type: "string", description: "document | companies_house | apollo | operator | skill | migration" },
                  documentId: { type: "string" },
                  contentChecksum: { type: "string" },
                  locator: {
                    type: "object",
                    properties: {
                      page: { type: "number" },
                      sheet: { type: "string" },
                      row: { type: "number" },
                      cellRange: { type: "string" },
                      section: { type: "string" },
                    },
                  },
                  sourceText: { type: "string", description: "Verbatim snippet — the audit anchor." },
                  externalRef: { type: "string", description: "CH charge/filing id, Apollo id, skillRunId, userId." },
                  authorityTier: { type: "number", description: "5 executed-legal > 4 facility-letter > 3 valuation > 2 internal-brief > 1 email." },
                },
                required: ["sourceType", "authorityTier"],
              },
            },
            required: ["statement", "subjectType", "subjectId", "predicate", "confidence", "observation"],
          },
        },
      },
      required: ["atoms"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.knowledge.atomsCore.createAtomsBatch, {
        candidates: args.atoms ?? [],
      });
      return asText(result);
    },
  },
  {
    name: "atoms.vocabulary",
    description:
      "Return the legal predicate vocabulary as a map of {name → {kind, family, direction?, description, store}}. Call this BEFORE atoms.createBatch so you use real predicate names instead of guessing. `kind` is edge (needs objectEntityId) or attribute (needs objectLiteral). `store` of 'native' means the fact lives in a structural table and is REJECTED as an atom (officer_of, funds_project native side, has_appetite_for, etc.); 'atom'/'both' are storable. Families: financing, people, structure, property, meta.",
    inputSchema: { type: "object", properties: {} },
    handler: async (_ctx, _userId, _args) => {
      return asText({
        predicates: PREDICATES,
        families: ["financing", "people", "structure", "property", "meta"],
        note: "store='native' predicates are rejected by atoms.createBatch (they belong in structural tables). Use kind to decide objectEntityId (edge) vs objectLiteral (attribute).",
      });
    },
  },
  {
    name: "atoms.supersede",
    description:
      "Operator/hygiene: mark an atom superseded (status=superseded, reason=operator). Use when a fact is stale/wrong and should drop out of retrieval but its provenance must survive (atoms are never hard-deleted). `reason` is a free-text explanation for the audit note; the lifecycle reason is recorded as 'operator'.",
    inputSchema: {
      type: "object",
      properties: {
        atomId: { type: "string", description: "Convex id of the atom." },
        reason: { type: "string", description: "Why it is being superseded (audit note)." },
      },
      required: ["atomId", "reason"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.knowledge.atomsCore.supersedeAtom, {
        atomId: args.atomId,
        reason: "operator" as const,
      });
      return asText({ ...result, operatorReason: args.reason });
    },
  },
  {
    name: "atoms.retire",
    description:
      "Operator/hygiene: retire an atom (status=retired). Stronger than supersede — the fact is removed from the live graph but kept for provenance. Use for atoms that should never have existed (misextraction). `reason` is a free-text audit note.",
    inputSchema: {
      type: "object",
      properties: {
        atomId: { type: "string", description: "Convex id of the atom." },
        reason: { type: "string", description: "Why it is being retired (audit note)." },
      },
      required: ["atomId", "reason"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.knowledge.atomsCore.retireAtom, {
        atomId: args.atomId,
      });
      return asText({ ...result, operatorReason: args.reason });
    },
  },
  {
    name: "atoms.resolveContested",
    description:
      "Operator adjudication of a contested fact: name the atom whose value is correct and the contest closes. The winner (winnerAtomId) returns to status=active; every OTHER member of its contested identity group (same subject/predicate/qualifier/object-kind) is archived as superseded (supersededBy=winner, reason=operator). Losers keep their full observation history — nothing is deleted. This is operator hygiene, NOT an approvals action: it fires immediately and is reversible via the preserved provenance. Errors if the atom isn't currently contested. Returns {resolved, archived}.",
    inputSchema: {
      type: "object",
      properties: {
        winnerAtomId: { type: "string", description: "Convex id of the contested atom whose value is correct." },
      },
      required: ["winnerAtomId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.knowledge.atomsCore.resolveContested, {
        winnerAtomId: args.winnerAtomId,
      });
      return asText(result);
    },
  },
  {
    name: "atoms.getForSubject",
    description:
      "Return the atoms already stored for a subject entity (with observation counts), so you can check existing coverage before atomizing — the idempotency check for the harness lane. Pass subjectType + subjectId; optional status filter (active / contested / superseded / retired). Default returns all statuses.",
    inputSchema: {
      type: "object",
      properties: {
        subjectType: { type: "string", description: "client | project | contact | company | facility" },
        subjectId: { type: "string", description: "Stringified Convex id of the subject." },
        status: { type: "string", description: "Optional: active | contested | superseded | retired." },
      },
      required: ["subjectType", "subjectId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(internal.knowledge.atomsCore.getAtomsForSubject, {
        subjectType: args.subjectType,
        subjectId: args.subjectId,
        status: args.status,
      });
      return asText(result);
    },
  },
  {
    name: "atoms.upsertChunks",
    description:
      "Persist the narrative dual index for a document (spec §3.4): the chunk retrieval side that complements atoms for prose-heavy docs (legal opinions, reports). Chunks are disposable derivatives of ONE revision — this deletes the document's existing chunks and recreates them. Chunk narrative documents into ~800-token sections; SKIP fact-dense spreadsheets (atoms win there). Pass documentId, contentChecksum, and chunks:[{chunkIndex, text, locator?}] plus optional clientId/projectId scope tags.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        contentChecksum: { type: "string" },
        clientId: { type: "string" },
        projectId: { type: "string" },
        chunks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              chunkIndex: { type: "number" },
              text: { type: "string" },
              tokenCount: { type: "number" },
              locator: {
                type: "object",
                properties: {
                  page: { type: "number" },
                  sheet: { type: "string" },
                  section: { type: "string" },
                },
              },
            },
            required: ["chunkIndex", "text"],
          },
        },
      },
      required: ["documentId", "contentChecksum", "chunks"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.knowledge.atomsCore.upsertChunks, {
        documentId: args.documentId,
        contentChecksum: args.contentChecksum,
        clientId: args.clientId,
        projectId: args.projectId,
        chunks: args.chunks ?? [],
      });
      return asText(result);
    },
  },
  {
    name: "atoms.search",
    description:
      "Search the knowledge layer in TWO RESULT LANES at once. `results` = ATOMS: discrete facts with provenance — a HYBRID of full-text (Convex search index) and semantic vector similarity (Voyage embeddings over the atom statements), fused with reciprocal-rank fusion — so a query matches on MEANING (e.g. 'how leveraged is the scheme' surfaces LTGDV / loan-amount atoms with zero shared words) as well as exact terms, and an atom found by both lanes ranks highest (each hit carries a `lane` marker: text | vector | both). `chunks` = PROSE PASSAGES from the narrative dual index (documentChunks, spec §3.4): the same hybrid+RRF over chunk text, each hit carrying documentId + parent document {displayName, fileName, fileTypeDetected} + locator {page/sheet/section} + chunkIndex — use chunks for the nuance atoms flatten (caveats, conditions, reasoning, surrounding context in legal opinions / reports); chunk text is trimmed to ~700 chars with `truncated:true` when cut (read the full doc via document.get if you need more). includeChunks defaults TRUE; set false to skip the chunk lane. Atom filters: clientId (owning scope; also scopes chunks), subjectType, status (default: live atoms only — active + contested). Each atom hit returns the statement, predicate, resolved subject/object entity names, objectLiteral, status, confidence, primarySourceType and observation count — provenance rides inline, and the atomId is the handle for atoms.getForSubject / graph.expandEntity drill-downs. USE THIS as the entity-resolution entry point of a graph walk: search the name/phrase, read the subject off the top hit, then expandEntity from there. Contested atoms surface as status='contested' — present BOTH values to the operator, never silently pick one. If embeddings are unavailable both lanes degrade to full-text alone (vectorLaneDisabled:true).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Full-text search over atom statements." },
        clientId: { type: "string", description: "Optional owning-client scope filter (Convex id)." },
        subjectType: { type: "string", description: "Optional: client | project | contact | company | facility | candidate." },
        status: { type: "string", description: "Optional: active | contested | superseded | retired. Default: live (active + contested)." },
        limit: { type: "number", description: "Default 20, max 50." },
        includeProspectScoped: { type: "boolean", description: "Default true (unfiltered — the LLM lane sees everything; spec §14b.6a). Set false to hide hits whose owning clientId is a prospect-status clients row; counts.prospectScopedHidden reports how many were hidden." },
        includeChunks: { type: "boolean", description: "Default true: also run the prose-chunk lane (same query + clientId) and return a `chunks` array (documentChunks hits with parent-document metadata + locator). Set false for atoms only." },
        chunkLimit: { type: "number", description: "Max chunk hits. Default 8, max 20." },
      },
      required: ["query"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runAction(internal.knowledge.embeddings.atomsSearchHybrid, {
        query: args.query,
        clientId: args.clientId,
        subjectType: args.subjectType,
        status: args.status,
        limit: args.limit,
        includeProspectScoped: args.includeProspectScoped,
      });

      // Chunk lane (default ON) — prose passages from the narrative dual
      // index, same query + client scope. Trimmed to ~2,200 chars per hit so
      // the tool response stays bounded; `truncated:true` flags a cut.
      let chunksSection: Record<string, unknown> = {};
      let chunkIds: string[] = [];
      if (args.includeChunks !== false) {
        const chunkResult = await ctx.runAction(
          internal.knowledge.embeddings.chunksSearchHybrid,
          { query: args.query, clientId: args.clientId, limit: args.chunkLimit },
        );
        const chunks = chunkResult.results.map((c) => {
          const truncated = c.text.length > CHUNK_TEXT_CAP;
          return {
            ...c,
            text: truncated ? c.text.slice(0, CHUNK_TEXT_CAP) : c.text,
            ...(truncated ? { truncated: true as const } : {}),
          };
        });
        chunkIds = chunks
          .map((c) => c.chunkId as string)
          .slice(0, RETRIEVAL_LOG_CAP);
        chunksSection = { chunks, chunkCounts: chunkResult.counts };
      }

      // Retrieval instrumentation (spec §10, Phase 2c) — fire-and-forget so the
      // usage half of salience learns from real queries; off the latency path.
      // Chunk hits log in the same batch (chunkId rows; salience-inert).
      const atomIds = ((result.results ?? []) as Array<{ atomId?: unknown }>)
        .map((row) => row.atomId)
        .filter((id): id is string => typeof id === "string")
        .slice(0, RETRIEVAL_LOG_CAP);
      if (atomIds.length > 0 || chunkIds.length > 0) {
        await ctx.scheduler.runAfter(0, internal.knowledge.salience.logRetrieval, {
          atomIds,
          chunkIds,
          source: "search",
          queryText: args.query,
          clientId: args.clientId,
          retrievedAt: Date.now(),
        });
      }
      return asText({ ...result, ...chunksSection });
    },
  },

  // ── atoms.*Candidate — provisional entities (Spec 2 Phase 2b, §3.5) ──
  // The repair path for unresolvable mentions: mint a candidate, anchor the
  // atom to it (subjectType/objectEntityType "candidate") — facts are never
  // dropped. The 2-hourly enrichment worker resolves candidates (companies →
  // CH, people → contacts/Apollo) and re-points referencing atoms through
  // the identity machinery.
  {
    name: "atoms.createCandidate",
    description:
      "Mint (or reuse) a PROVISIONAL entity for a person/company mention that doesn't resolve to any roster id — the atomize-document repair path for `unresolved_subject`/`unresolved_object` rejects. Anchor the rejected atom to the returned candidateId with subjectType/objectEntityType 'candidate' and resubmit: the fact is NEVER dropped, and the background enrichment worker (2-hourly) resolves the candidate (companies → Companies House exact-name search + full sync; people → client-scoped contact match, then Apollo) and re-points every referencing atom to the real entity through the identity machinery (duplicates merge automatically). Dedup is built in: the same normalized mention (lowercased, punctuation-stripped) with the same guessedType reuses ONE candidate row across documents — `reused:true` tells you it already existed. If the candidate was ALREADY RESOLVED you get `{status:'resolved', resolvedType, resolvedId}` — anchor your atom to THAT real entity directly instead of the candidate. Pass `clientId` as a scope hint whenever you know the owning client (it is what lets the worker scan the right contact roster and give Apollo a company context; stored inside contextSnippet as 'client:<id>|<snippet>' — the schema is frozen). Returns {candidateId, reused, status} or the resolved-entity ref.",
    inputSchema: {
      type: "object",
      properties: {
        mentionText: { type: "string", description: "The mention verbatim, e.g. 'Land at Willersey SPV Ltd' or 'Jason Buttler'." },
        guessedType: { type: "string", description: "'person' or 'company'." },
        contextSnippet: { type: "string", description: "Optional verbatim source snippet around the mention — helps the worker and the operator judge who/what this is." },
        sourceDocumentId: { type: "string", description: "Optional Convex id of the document the mention came from." },
        clientId: { type: "string", description: "Optional owning-client scope hint (Convex id). STRONGLY recommended — person resolution is client-scoped." },
      },
      required: ["mentionText", "guessedType"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.knowledge.candidates.createCandidate, {
        mentionText: args.mentionText,
        guessedType: args.guessedType,
        contextSnippet: args.contextSnippet,
        sourceDocumentId: args.sourceDocumentId,
        clientId: args.clientId,
      });
      return asText(result);
    },
  },
  {
    name: "atoms.listCandidates",
    description:
      "List entityCandidates rows (provisional entities minted for unresolvable mentions) with referencing-atom counts. Optional status filter: 'pending' (awaiting enrichment — the default operator triage view), 'resolved' (tombstones pointing at the real entity via resolvedToType/resolvedToId), 'dismissed'. Each row carries mentionText, guessedType, enrichmentAttempts (the worker stops retrying after 3 failed attempts but NEVER auto-dismisses — a pending row with attempts=3 is waiting for the operator), scopeClientId (parsed from the stored scope hint), sourceDocumentId, and referencingAtoms {asSubject, asObject, total} so you can see how much of the graph hangs off each unresolved mention. Use with atoms.dismissCandidate to clear noise (typos, generic phrases wrongly minted as entities).",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Optional: pending | resolved | dismissed. Omit for all." },
      },
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(internal.knowledge.candidates.listCandidates, {
        status: args?.status,
      });
      return asText(result);
    },
  },
  {
    name: "atoms.dismissCandidate",
    description:
      "Operator hygiene: mark an entityCandidates row 'dismissed' — this mention is not a real resolvable entity (a typo, a generic phrase, an out-of-scope party) and the enrichment worker should never chase it again. Atoms anchored to the candidate stay anchored (the facts survive, flagged as unconfirmed via their candidate reference); a later atomization pass re-encountering the same mention reuses the dismissed row rather than resurrecting it as fresh pending noise. Errors on an already-resolved candidate (the tombstone must survive so re-extraction keeps resolving instantly). This is the ONLY dismissal path — the worker itself never auto-dismisses, it just stops retrying after 3 failed attempts.",
    inputSchema: {
      type: "object",
      properties: {
        candidateId: { type: "string", description: "Convex id of the entityCandidates row." },
      },
      required: ["candidateId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.knowledge.candidates.dismissCandidate, {
        candidateId: args.candidateId,
      });
      return asText(result);
    },
  },
  {
    name: "atoms.mergeEntities",
    description:
      "Operator hygiene: collapse a DUPLICATE existing entity into its canonical twin on the KNOWLEDGE GRAPH. Use when the SAME real thing exists under two ids — a client created twice (HubSpot/promotion), a '(175)'-suffixed duplicate contact, a company synced under two Companies House rows — and their atoms/facilities/scope tags are split across both. Re-points every knowledge-side reference from `fromId` to `toId` (BOTH must be the same `entityType`) and routes each atom through the SAME identity machinery Phase-2b candidate resolution uses: a re-pointed atom that now duplicates a live atom on the target MERGES (its observations move to the survivor, corroboration bumps, the duplicate is superseded); a value clash goes CONTESTED (both live, surfaced for adjudication — never a silent double). Also re-scopes the denormalized refs the subject/object re-point misses: atoms.clientId/projectId, the facilities mirror columns (lender/borrower/company/project), documentChunks scope tags, and appetiteSignals.lenderClientId. SCOPE: knowledge graph ONLY. This tool is CRM-BLIND — it does NOT reassign CRM tables (contacts/documents/tasks/notes/…) and does NOT delete or soft-delete the `from` entity row. For client duplicates run the CRM-side merge separately (migrations/mergeDuplicateClients — it is the atom-blind mirror of this tool); then remove the source row. `entityType`: client | project | contact | company | facility | candidate. For 'candidate' this RESOLVES the candidate to a real entity — pass `toType` (the resolved entity's type), and `toId` is that real entity's id. `reason` is a free-text audit note. Writes an auditLog row and returns {repointed, merged, contested, scope:{atomsRescoped, chunksRescoped, facilitiesRescoped, appetiteRescoped}} so you see exactly what moved.",
    inputSchema: {
      type: "object",
      properties: {
        entityType: { type: "string", description: "client | project | contact | company | facility | candidate. fromId and toId are BOTH this type (except 'candidate', where toId is the resolved real entity named by toType)." },
        fromId: { type: "string", description: "Convex id of the DUPLICATE to collapse (the entityCandidates id when entityType='candidate')." },
        toId: { type: "string", description: "Convex id of the canonical entity to keep (the real entity's id when entityType='candidate')." },
        reason: { type: "string", description: "Why these are the same entity (audit note)." },
        toType: { type: "string", description: "Required ONLY when entityType='candidate': the resolved real entity's type (client | project | contact | company | facility)." },
      },
      required: ["entityType", "fromId", "toId", "reason"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(internal.knowledge.atomsCore.mergeEntities, {
        entityType: args.entityType,
        fromId: args.fromId,
        toId: args.toId,
        reason: args.reason,
        toType: args.toType,
      });
      return asText(result);
    },
  },

  // ── graph.* — Knowledge Layer traversal (Spec 2 §9 / §14b) ───
  // Read-side of the graph. YOU (Claude) are the query planner — there is no
  // retrieval router: a hop is one tool call, and multi-hop reasoning is a
  // SEQUENCE of calls with pruning between hops. Atom edges and native
  // structural edges are federated at read time (never stored twice), every
  // edge carries provenance inline, and fan-out is truncated per the hub
  // rule (top-K by rank + full counts, so "27 edges — expand?" is cheap).
  {
    name: "graph.expandEntity",
    description:
      "ONE HOP of the knowledge graph: the neighborhood of an entity, federating ATOM edges (facts extracted from documents/CH/Apollo/operators, provenance-stamped) with NATIVE edges synthesized live from structural tables (projects.clientRoles → funds_project/developing, contacts → works_at, clients group SPVs → spv_of_group, CH officers/PSC → officer_of/psc_of via exact-name match only — provenance.matchQuality flags it, facilities columns → funds/lends_to/secured_on with the facility hub as the node). When both lanes assert the same edge the atom wins and its provenance notes nativeCorroboration. Claude is the query planner: multi-hop questions are a SEQUENCE of expandEntity calls with reasoning between hops — pivoting is just calling this again on a neighbor. FAN-OUT RULE: edges/nativeEdges/attributes are each ranked (contested first → confidence desc → asOf recency) and truncated to `limit` (default 30, cap 100); counts always carries the FULL totals + truncated flag, so surface 'N more — expand?' instead of re-fetching blindly. Every edge carries inline provenance {sourceType, ref (atomId or table), observationCount}. Attributes are the entity's literal facts (GDV, loan amount, rates; contested values surface FIRST — present both, never pick silently); lender clients also get current appetiteSignals federated in as has_appetite_for attributes. WORKED EXAMPLE — 'which of our clients have exposure to Hampshire Trust Bank?': (1) atoms.search({query:'Hampshire Trust Bank'}) resolves the lender entity; (2) graph.expandEntity({entityType:'client', entityId:<HTB>, direction:'out'}) → nativeEdges: funds_project → Comberton (clientRoles), funds → Facility · £3.2M; edges: lends_to → Fireside Capital (facility letter, 2 observations), holds_charge_over → Bayfield SPV (CH charge ref); (3) you map projects/facilities → borrower clients and answer with three exposures, each cited. Two calls, no router. interEdges = edges among the returned ring — render them; they're what makes clusters visible. Set includeRingAttributes:true to also get ringAttributes — each ring member's own literal facts (a project's GDV/planning/cost), keyed by `${type}:${id}`, capped 12/member — so a ring member's knowledge is visible without a second expand.",
    inputSchema: {
      type: "object",
      properties: {
        entityType: { type: "string", description: "client | project | contact | company | facility | candidate" },
        entityId: { type: "string", description: "Convex id of the entity row." },
        predicates: { type: "array", items: { type: "string" }, description: "Optional predicate filter (vocabulary names + synthetic facility predicates funds/lends_to/secured_on)." },
        direction: { type: "string", description: "out | in | both (default both)." },
        includeAttributes: { type: "boolean", description: "Default true. Set false when you only need edges." },
        limit: { type: "number", description: "Fan-out cap per list. Default 30, hard cap 100." },
        includeProspectScoped: { type: "boolean", description: "Default true (unfiltered — the LLM lane sees everything; spec §14b.6a). Set false to hide ATOM-lane items (edges/attributes/interEdges) whose owning clientId is a prospect-status clients row; native edges are public record and always exempt. counts.prospectScopedHidden reports how many were hidden." },
        includeRingAttributes: { type: "boolean", description: "Default false. When true, also return ringAttributes: each ring member's ATTRIBUTE atoms (its literal facts) keyed by `${type}:${id}`, capped 12/member (overflow in ringAttributeTruncated), so ring knowledge is visible without a second expand. Atom lane only; respects includeProspectScoped." },
      },
      required: ["entityType", "entityId"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(internal.knowledge.graphQueries.expandEntityInternal, {
        entityType: args.entityType,
        entityId: args.entityId,
        predicates: args.predicates,
        direction: args.direction,
        includeAttributes: args.includeAttributes,
        limit: args.limit,
        includeProspectScoped: args.includeProspectScoped,
        includeRingAttributes: args.includeRingAttributes,
      });
      // Retrieval instrumentation (spec §10, Phase 2c) — fire-and-forget.
      const atomIds = collectExpandAtomIds(result);
      if (atomIds.length > 0) {
        await ctx.scheduler.runAfter(0, internal.knowledge.salience.logRetrieval, {
          atomIds,
          source: "expand",
          clientId: args.entityType === "client" ? args.entityId : undefined,
          subjectType: args.entityType,
          subjectId: args.entityId,
          retrievedAt: Date.now(),
        });
      }
      return asText(result);
    },
  },
  {
    name: "graph.sharedNeighbors",
    description:
      "The 'what connects these?' primitive: expand each input entity into a bounded structural GROUP (client → its role projects + facilities + CH group companies; project → its facilities + their SPV/borrower client; company → the client(s) it is a group SPV of + their mapped sibling companies; contact/facility/candidate → just themselves — ≤25 members/input, `capped` flagged per input in `groups`), then INTERSECT the UNION of each group's members' one-hop federated neighborhoods (atom + native edges) — a node counts as reached by an input if ANY of its group members has a direct edge to it. Returns only nodes reached by ALL inputs, each with per-input connections ({fromInput, groupMember?, predicate, direction, provenance}) — groupMember is set when the link runs input→member→node (the group hop), absent for a classic one-hop link. This closes the lender→facility→project→developer gap where the shared project sits two hops from a lender that anchors on the facility node. Use for prospect-connection checks ('does this new prospect share a director/lender with the book?'), co-exposure ('what sits between client X and lender Y?' — typically the facility + project), and dedupe suspicions. `via` narrows the shared-node type: people (contacts), companies (CH companies), lenders (clients with type='lender'), any (default). 2-5 input entities; only the input entities THEMSELVES are excluded from results — a group member the other side reaches (a developer's own project reached by a lender) is a legitimate shared node. For longer indirect chains use graph.findPaths.",
    inputSchema: {
      type: "object",
      properties: {
        entities: {
          type: "array",
          description: "2-5 entities to intersect.",
          items: {
            type: "object",
            properties: {
              type: { type: "string", description: "client | project | contact | company | facility | candidate" },
              id: { type: "string", description: "Convex id." },
            },
            required: ["type", "id"],
          },
        },
        via: { type: "string", description: "Optional shared-node filter: people | companies | lenders | any (default any)." },
      },
      required: ["entities"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(internal.knowledge.graphQueries.sharedNeighborsInternal, {
        entities: args.entities ?? [],
        via: args.via,
      });
      return asText(result);
    },
  },
  {
    name: "graph.findPaths",
    description:
      "Bounded path search between two entities over the federated edge function (atoms + native, same provenance-per-hop). BFS up to maxHops (≤3, default 3), total node expansions budgeted (~200) and per-node fan-out capped by the same contested→confidence→recency ranking, so a hub node can't blow the walk up. Returns up to 5 paths ranked shortest-first then by weakest-link confidence, each as an edge chain [{from, predicate, direction, to, provenance}] you can cite hop by hop. Use when sharedNeighbors (one hop plus its bounded group expansion) comes back empty and you suspect a longer indirect route ('how is this prospect connected to our book at all?'). counts.budgetExhausted=true means the walk was cut short — absence of a path is then NOT proof of disconnection.",
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "object",
          properties: { type: { type: "string" }, id: { type: "string" } },
          required: ["type", "id"],
        },
        to: {
          type: "object",
          properties: { type: { type: "string" }, id: { type: "string" } },
          required: ["type", "id"],
        },
        maxHops: { type: "number", description: "1-3 (default 3)." },
      },
      required: ["from", "to"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(internal.knowledge.graphQueries.findPathsInternal, {
        from: args.from,
        to: args.to,
        maxHops: args.maxHops,
      });
      return asText(result);
    },
  },
  {
    name: "graph.overview",
    description:
      "The ORG-WIDE knowledge-graph snapshot (the atlas view): EVERY entity and edge in one call — all clients (flagged clientType lender/borrower/developer + clientStatus active/prospect) and projects, plus every contact/company/facility/candidate with ≥1 atom or structural edge. Edges federate BOTH lanes with the standard semantics: ATOM edges from one bounded walk of the atoms table (live only — active + contested; superseded/retired skipped) and NATIVE structural edges (clientRoles → funds_project/developing, contacts → works_at, group SPVs → spv_of_group, facility columns → funds/lends_to/secured_on, CH officers/PSC → officer_of/psc_of for companies already in the graph). Deduped per (from, to, predicate): the atom wins over its native mirror (`corroborated: true` notes the agreement); duplicate atoms keep the contested one — a contest is never hidden. Node keys and edge endpoints share the `<type>:<id>` format; each node carries atomCount/contestedCount (live atoms with it as subject) and degree (endpoints in the returned edge list). Use for the whole-book questions expandEntity can't answer in one hop — which lenders fan across multiple clients, where cross-client clusters sit, where the contested hotspots are — then drill with graph.expandEntity / atoms.getForSubject (edge.atomId is the handle). BOUNDED: response capped at maxNodes (default 2500) / maxEdges (default 6000), lowest-degree contact/company/candidate leaves dropped first; counts carries org-wide atom totals, node counts byType, and truncated=true when any cap bit. No prospect-scope filter — this is the everything view. Served from a CACHED snapshot (the graph outgrew a single query execution): the call rebuilds first only when the cache is older than ~5 min, and `builtAt` (epoch ms) rides along so you can see the snapshot's age.",
    inputSchema: {
      type: "object",
      properties: {
        maxNodes: { type: "number", description: "Node cap (default and max 2500). Lowest-degree contact/company/candidate leaves drop first." },
        maxEdges: { type: "number", description: "Edge cap (default and max 6000). Kept by contested-first → atom-over-native → confidence ranking." },
      },
    },
    handler: async (ctx, _userId, args) => {
      // Cached-snapshot read: rebuild only when past the TTL, then serve the
      // stored chunks (the org-wide walk no longer fits one query execution).
      await ctx.runAction(internal.knowledge.graphOverview.ensureFresh, {});
      const snap = await ctx.runQuery(internal.knowledge.graphOverview.snapshotInternal, {
        maxNodes: args.maxNodes,
        maxEdges: args.maxEdges,
      });
      if (!snap.overview) {
        // Only reachable when another build claimed the lock before the very
        // first snapshot landed — momentary.
        return asText({ error: "atlas snapshot is still building — retry in a few seconds" });
      }
      return asText({ ...snap.overview, builtAt: snap.builtAt });
    },
  },

  // ── Meta / introspection ─────────────────────────────────────
  // Self-describing catalogue. The skills repo lives separately from this app,
  // so skill-forge calls this at the start of each session to refresh its
  // `tools-manifest.json` and validate that skills only reference tools that
  // actually exist. Source of truth IS the TOOLS array below it — zero drift.
  {
    name: "meta.listTools",
    description:
      "Introspection: return the full catalogue of MCP tools this server exposes — name, domain, description, and inputSchema — as structured JSON. Use this to refresh the skills repo's tools-manifest.json and to validate that a skill only references tools that actually exist. Read-only. Optional `domain` filter (the prefix before the first dot, e.g. 'lender').",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Optional. Only return tools in this domain (prefix before the first dot).",
        },
      },
    },
    handler: async (_ctx, _userId, args) => {
      const all = TOOLS.map((t) => ({
        name: t.name,
        domain: t.name.split(".")[0],
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      const domains = [...new Set(all.map((t) => t.domain))].sort();
      const tools = (args?.domain ? all.filter((t) => t.domain === args.domain) : all).sort(
        (a, b) => a.name.localeCompare(b.name),
      );
      return asText({
        toolCount: all.length,
        domainCount: domains.length,
        domains,
        tools,
      });
    },
  },
];

const TOOL_INDEX: Record<string, McpTool> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

// ── JSON-RPC helpers ─────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: any;
}

function jsonRpcSuccess(id: number | string | null, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonRpcError(id: number | string | null, code: number, message: string, data?: unknown): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ── Token hashing (subtle.digest in the action runtime) ──────

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

// ── The HTTP action ──────────────────────────────────────────

export const mcpHandler = httpAction(async (ctx, request) => {
  // Bearer-token auth
  const authHeader = request.headers.get("Authorization") ?? request.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid Authorization header. Expected: Bearer <mcp-token>" }),
      { status: 401, headers: { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" } },
    );
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Empty bearer token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const tokenHash = await sha256Hex(token);
  const validation = await ctx.runQuery(internal.mcpTokens.validateTokenByHashInternal, { tokenHash });
  if (!validation) {
    return new Response(JSON.stringify({ error: "Invalid or revoked token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Record use asynchronously by not awaiting heavy work; in Convex actions
  // we still await to avoid floating promises, but it is a small mutation.
  await ctx.runMutation(internal.mcpTokens.recordTokenUseInternal, {
    mcpTokenId: validation.mcpTokenId,
  });

  // Parse JSON-RPC body
  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Parse error: invalid JSON");
  }

  const id = body.id ?? null;
  const method = body.method;
  const params = body.params ?? {};

  if (body.jsonrpc !== "2.0") {
    return jsonRpcError(id, -32600, "Invalid Request: jsonrpc must be \"2.0\"");
  }
  if (!method) {
    return jsonRpcError(id, -32600, "Invalid Request: method is required");
  }

  // Dispatch
  try {
    switch (method) {
      case "initialize":
        return jsonRpcSuccess(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "rockcap-mcp", version: "0.1.0" },
        });

      case "notifications/initialized":
        // Per MCP spec, this is a one-way notification. Acknowledge with 204.
        return new Response(null, { status: 204 });

      case "tools/list":
        return jsonRpcSuccess(id, {
          tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });

      case "tools/call": {
        const toolName = params.name as string | undefined;
        const toolArgs = params.arguments ?? {};
        if (!toolName) {
          return jsonRpcError(id, -32602, "Invalid params: tools/call requires name");
        }
        const tool = TOOL_INDEX[toolName];
        if (!tool) {
          return jsonRpcError(id, -32602, `Tool not found: ${toolName}`);
        }
        const callResult = await tool.handler(ctx, validation.userId, toolArgs);
        return jsonRpcSuccess(id, callResult);
      }

      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err: any) {
    const message = err?.message ?? String(err);
    return jsonRpcError(id, -32603, `Internal error: ${message}`);
  }
});
