/**
 * Atomic Tool Library — Type Definitions
 *
 * Defines the AtomicTool interface and supporting types for the
 * domain-organized tool registry used by the agentic chat system.
 */

// ---------------------------------------------------------------------------
// Domain & Action enums
// ---------------------------------------------------------------------------

export const TOOL_DOMAINS = [
  "client",
  "project",
  "document",
  "folder",
  "checklist",
  "task",
  "note",
  "contact",
  "reminder",
  "event",
  "knowledgeBank",
  "intelligence",
  "internalDocument",
  "fileQueue",
] as const;

export type ToolDomain = (typeof TOOL_DOMAINS)[number];

export type ToolAction = "read" | "write" | "delete";

// ---------------------------------------------------------------------------
// JSON Schema helpers (subset used by tool parameters)
// ---------------------------------------------------------------------------

export interface JsonSchemaProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  default?: unknown;
}

export interface ToolParameters {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
}

// ---------------------------------------------------------------------------
// Convex mapping
// ---------------------------------------------------------------------------

export interface ConvexMapping {
  type: "query" | "mutation";
  /** Dot-path to the Convex function, e.g. "clients.list" */
  path: string;
}

// ---------------------------------------------------------------------------
// AtomicTool — the core interface
// ---------------------------------------------------------------------------

export interface AtomicTool {
  /** Verb-noun name, e.g. "createClient", "getChecklistByProject" */
  name: string;

  /** Which entity domain this tool belongs to */
  domain: ToolDomain;

  /** Whether this tool reads, writes, or deletes data */
  action: ToolAction;

  /** Human-readable description shown to the model */
  description: string;

  /** JSON-Schema-style parameter definition */
  parameters: ToolParameters;

  /** If true, the UI must show a confirmation dialog before executing */
  requiresConfirmation: boolean;

  /** Maps directly to a Convex query or mutation */
  convexMapping: ConvexMapping;

  /**
   * Domains that make this tool relevant.
   * Used for progressive disclosure — when the chat is in "client" context,
   * tools whose contextRelevance includes "client" will be loaded.
   */
  contextRelevance: ToolDomain[];
}

// ---------------------------------------------------------------------------
// Chat context (used by the registry to filter tools)
// ---------------------------------------------------------------------------

export type ChatContextType = "global" | "client" | "project";

export interface ChatContext {
  contextType: ChatContextType;
  clientId?: string;
  projectId?: string;
}
