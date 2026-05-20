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
