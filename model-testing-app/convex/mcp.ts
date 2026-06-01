import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

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
      const result = await ctx.runMutation(api.appetiteSignals.record, {
        lenderClientId: args.lenderClientId,
        fieldPath: args.fieldPath,
        value: args.value,
        valueType: args.valueType,
        sourceType: args.sourceType,
        sourceRef: args.sourceRef,
        asOfDate: args.asOfDate,
        confidence: args.confidence,
        notes: args.notes,
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
      "Create a new lender record (a clients row with type='lender'). Three input modes (in priority order): (1) Pass `promoteFromCompanyId` (Convex id) to promote an existing companies-table row into a lender — auto-inherits name/website/etc. + marks the company as promoted + links any HubSpot-synced contacts to the new lender. (2) Pass `hubspotCompanyId` (string) when you only know the HubSpot id (e.g., reading off a contact's `hubspotCompanyIds[0]`) — skill resolves to Convex companies row + promotes. (3) Pass just `name` for naked creation — escape hatch for genuine net-new lenders never seen in HubSpot. After create, call `lender.recordAppetite` repeatedly + `lender.setSubmissionRequirements` to populate substrate. Common patterns: (A) after BDM meeting on a known HubSpot lender → mode 2 + `lender.recordAppetite × N`; (B) lender with rich HubSpot doc evidence → mode 1; (C) cold-add a new lender you're starting to track → mode 3.",
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

      // Mode 3: naked creation (no HubSpot link)
      if (!args.name) {
        return asText({ error: "name_required_for_mode_3", note: "Mode 3 (naked creation) requires `name`. For modes 1/2 (HubSpot promotion), pass promoteFromCompanyId or hubspotCompanyId instead." });
      }
      const id = await ctx.runMutation(api.clients.create, {
        name: args.name,
        type: "lender",
        status: "active" as const,
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
        lenderClientId: id,
        note: "Lender created via naked path (no HubSpot link). Now record appetite signals via lender.recordAppetite + author submission requirements via lender.setSubmissionRequirements.",
      });
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
      "Get one reply event by id with all fields (body, subject, classification, dispatch destination, cancelledCadences). Use when prospect.getDeepContext returned the summary list and you need the full body of a specific reply.",
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
      "Generate a formatted document (PDF + DOCX) from composed HTML and stage it for operator approval; on approval it is filed to the client's Documents library. YOU compose the body as semantic HTML (h1/h2/p/table; NO <html>/<head>/<style> wrappers — house styling is applied automatically). Ground every figure in real data; never fabricate. Use for ad-hoc requests like a company one-pager. See the document-author skill + the document-house-style reference for voice and structure.",
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
      "Generate a branded RockCap multi-page BRIEF (PDF + DOCX) and stage it for operator approval; on approval it is filed to the client's Documents library. Two layouts: 'lender-brief' sells a borrower's deal TO a lender (track-record depth from Companies House charges); 'client-brief' advises the BORROWER on the indicative lender landscape, leverage scenarios and expected pricing BEFORE going to market. YOU compose the structured briefData (title, key facts, numbered sections whose bodies are semantic HTML, sign-off), grounded in real data — read the deal's documents + intel first; never fabricate. Section bodyHtml is semantic HTML only (no <html>/<head>/<style> wrappers; <table> with class=\"num\" on numeric cells, class=\"caption\" for source/footnote lines). Follow the doc-type-lender-brief / doc-type-client-brief references for the section set.",
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
      "Generate a RockCap 'Appendix A — Master Comparable Schedule' (comps) as a spreadsheet (XLSX, default) or Word table (DOCX), and stage it for operator approval; on approval it is filed to the client's Documents library. A comps appendix is the comparable-evidence table attached to a lender credit pack / client brief that justifies a scheme's GDV pricing. YOU compose the structured compsData: one or more sheets (tabs), each with configurable columns and tier/section groups of comparable rows (address, scheme, date, price, sqft, £psf, type, beds, notes, evidence). Set column roles ('price','sqft','psf') and leave £psf blank to auto-compute it (price ÷ sqft); a tier can carry an auto-average row. Ground every comp in real evidence (Land Registry / agent listings); never fabricate prices or sqft. See the doc-type-comps-appendix reference for structure.",
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
      "Approve a whole cadence PACKAGE (all touches sharing a packageId) so the dispatcher will fire them. A freshly-created cold-outreach package is queued at packageApprovalStatus='pending' and never fires until approved — this is that gate. Get the packageId from cadence.create's result or cadence.listByPackage. Pair with cadence.denyPackage to discard the sequence.",
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
