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
          fix: "Run apollo.findEmail({firstName, lastName, companyName}) to discover, then contacts.update({contactId, email, emailStatus}) to persist before retrying this cadence.create call.",
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
      const warning = contact.emailStatus === "unverified"
        ? "Contact email is unverified (Apollo or manual entry). Operator should confirm before package approval."
        : undefined;
      return asText({ status: "created", cadenceId, ...(warning ? { warning } : {}) });
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
      "Record a new appetite signal for a lender. Each signal is (fieldPath, value, valueType, sourceType, asOfDate, confidence). Writing a new value for an existing (lender, fieldPath) automatically supersedes the prior — sets prior.isCurrent=false + supersededBy=<new id>, marks new.isCurrent=true. Standard fieldPaths (use these for matching to work): dealSize.min, dealSize.max, products.offered (array: bridging/development_finance/term/btl), propertyType.allowed (array: residential/commercial/mixed_use), geography.regions (array including 'uk_wide'), ltv.maximum (0-1), ltgdv.maximum (0-1), timeline.typicalWeeksToOffer (number). Custom fieldPaths are fine but won't contribute to matching scores unless lender.matchForDeal is extended to handle them.",
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
            dealType: { type: "string", description: "bridging | development_finance | term | btl" },
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
      "Create a new lender record (a clients row with type='lender'). Use for adding a new lender to the database before recording appetite signals. After create, call lender.recordAppetite repeatedly to populate the appetite picture. Common pattern after a first BDM meeting: lender.create → lender.recordAppetite × N from the meeting notes.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Lender name (e.g., 'Octopus Real Estate')" },
        companyName: { type: "string", description: "Optional legal name if different from name" },
        notes: { type: "string", description: "Optional: 1-2 sentence summary of who they are" },
        website: { type: "string" },
        email: { type: "string", description: "General contact email if known" },
        phone: { type: "string" },
        country: { type: "string", description: "Default 'United Kingdom'" },
      },
      required: ["name"],
    },
    handler: async (ctx, userId, args) => {
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
      return asText({ status: "created", lenderClientId: id, note: "Now record appetite signals via lender.recordAppetite to enable matching." });
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

  {
    name: "project.get",
    description: "Get one project by id (name, shortcode, status, clientRoles, address, description, etc.).",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.projects.get, { id: args.projectId });
      if (!result) return asText({ error: "project_not_found", projectId: args.projectId });
      return asText(result);
    },
  },

  {
    name: "project.getStats",
    description:
      "Get aggregate counts for a project (documents count by category, checklist completion %, recent activity count). Use when operator asks 'how complete is the Comberton package?' style questions.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.projects.getStats, { id: args.projectId });
      return asText(result);
    },
  },

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
  {
    name: "checklist.listByClient",
    description:
      "List all checklist items for a client (both client-level and project-level items). Each row carries name + category + phaseRequired + priority + status (missing/pending_review/fulfilled). Use to answer 'what do we still need from Mccarthy?' type questions.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" } },
      required: ["clientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.knowledgeLibrary.getChecklistByClient, {
        clientId: args.clientId,
      });
      return asText(result);
    },
  },

  {
    name: "checklist.listByProject",
    description:
      "List checklist items for a specific project. Use after prospect.getDeepContext reveals a project id and you want the scheme-specific requirements list (vs the client-level Base Documents).",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runQuery(api.knowledgeLibrary.getChecklistByProject, {
        projectId: args.projectId,
      });
      return asText(result);
    },
  },

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
  {
    name: "meeting.listByClient",
    description:
      "List meetings for a specific client (past + upcoming, newest first). Used by Claude Code when an operator asks 'what's the meeting history with X?' and by the Meetings tab on the prospect detail page. Each row carries full meeting content: title, attendees, decisions, action items, summary.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string" },
        limit: { type: "number", description: "Default 50" },
      },
      required: ["clientId"],
    },
    handler: async (ctx, userId, args) => {
      const rows = await ctx.runQuery(api.meetings.getByClient, {
        clientId: args.clientId,
        limit: args.limit ?? 50,
      });
      return asText(rows);
    },
  },

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
          threadId: args.threadId,
          inReplyTo: args.inReplyTo,
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
      "Transition a prospect through the 8-state pipeline (drafted/needs_revision/active/replied/engaged/promoted/parked/lost). Called by the prospects CRM and by skill workflows (e.g., reply event processor on intent classification). Side effect: pushes the mapped lifecycleStage + hs_lead_status to HubSpot (see spec section 2.8).",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the client row" },
        newState: {
          type: "string",
          description: "drafted | needs_revision | active | replied | engaged | promoted | parked | lost",
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
      "Update an existing cadence row's preDraftedTouch content or scheduled nextDueAt. Sets editedByOperator + editedAt audit fields. Revision re-runs respect editedByOperator and skip overwriting unless the operator's revision note specifically calls out the edited touch.",
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
        nextDueAt: { type: "string", description: "ISO timestamp" },
      },
      required: ["cadenceId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.cadences.updateInternal, {
        cadenceId: args.cadenceId,
        userId,
        preDraftedTouch: args.preDraftedTouch,
        nextDueAt: args.nextDueAt,
      });
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

  // v1.2 prospect-intel hardening: trigger CH sync for a single company
  {
    name: "companies.syncCompaniesHouse",
    description:
      "Fetch a Companies House company by number (profile + charges + officers + PSCs) via the CH API and persist into RockCap's companiesHouseCompanies / Charges / Officers / PSC tables. Idempotent: re-running upserts existing rows. Called by prospect-intel skill workflow step 2 to ensure CH data is present before running lender-DNA analysis. Returns summary counts. Common errors: company_not_found_on_companies_house (CH returned 404 — verify the number) or COMPANIES_HOUSE_API_KEY not set (Convex env config gap).",
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

  // v1.2.4 prospect-intel hardening: structured prospect facts
  {
    name: "clients.setProspectFacts",
    description:
      "Set structured prospect facts on a clients row (companiesHouseNumber, website, primaryDirectorName, primaryContactId). Called by prospect-intel workflow step 10 to promote facts out of intelMarkdown text into queryable DB columns. The CRM aside / PeopleTab / OverviewTab read these directly when present and fall back to regex extraction on intelMarkdown when undefined (legacy data). All fields are optional — pass only what you've discovered. Idempotent: re-running overwrites.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Convex id of the clients row" },
        companiesHouseNumber: { type: "string", description: "8-digit CH number, or 6 digits prefixed by SC/NI/OC" },
        website: { type: "string", description: "Full URL (e.g., 'https://example.co.uk') or 'not-found' if confirmed-absent" },
        primaryDirectorName: { type: "string", description: "Director name as it should appear in the UI — operator-readable, not necessarily matching CH's surname-first format" },
        primaryContactId: { type: "string", description: "Convex id of the primary contact for outreach (the one cadences should target)" },
      },
      required: ["clientId"],
    },
    handler: async (ctx, userId, args) => {
      const result = await ctx.runMutation(internal.clients.setProspectFactsInternal, {
        clientId: args.clientId,
        companiesHouseNumber: args.companiesHouseNumber,
        website: args.website,
        primaryDirectorName: args.primaryDirectorName,
        primaryContactId: args.primaryContactId,
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
