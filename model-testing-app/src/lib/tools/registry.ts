/**
 * Tool Registry
 *
 * Central registry for all atomic tools. Supports:
 * - Domain-based grouping
 * - Progressive disclosure (context-aware tool loading)
 * - LLM-formatted tool descriptions
 */

import type { AtomicTool, ChatContext, ToolDomain, ToolAction } from "./types";

// Import all domain tool arrays
import { CLIENT_TOOLS } from "./domains/client.tools";
import { PROJECT_TOOLS } from "./domains/project.tools";
import { DOCUMENT_TOOLS } from "./domains/document.tools";
import { FOLDER_TOOLS } from "./domains/folder.tools";
import { CHECKLIST_TOOLS } from "./domains/checklist.tools";
import { TASK_TOOLS } from "./domains/task.tools";
import { NOTE_TOOLS } from "./domains/note.tools";
import { CONTACT_TOOLS } from "./domains/contact.tools";
import { REMINDER_TOOLS } from "./domains/reminder.tools";
import { EVENT_TOOLS } from "./domains/event.tools";
import { KNOWLEDGE_BANK_TOOLS } from "./domains/knowledgeBank.tools";
import { INTELLIGENCE_TOOLS } from "./domains/intelligence.tools";
import { INTERNAL_DOCUMENT_TOOLS } from "./domains/internalDocument.tools";
import { FILE_QUEUE_TOOLS } from "./domains/fileQueue.tools";

/**
 * Core write tools always available in global context
 */
const GLOBAL_WRITE_TOOLS = new Set([
  "createClient",
  "createProject",
  "createTask",
  "createReminder",
  "createEvent",
  "createNote",
  "createContact",
]);

/**
 * Domain mapping for context-based loading.
 * When chatting in "client" context, these domains are relevant.
 * When in "project" context, project-specific domains are added.
 */
const CLIENT_CONTEXT_DOMAINS: ToolDomain[] = [
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
];

const PROJECT_CONTEXT_DOMAINS: ToolDomain[] = [
  "client",
  "project",
  "document",
  "folder",
  "checklist",
  "task",
  "note",
  "contact",
  "knowledgeBank",
  "intelligence",
  "fileQueue",
];

export class ToolRegistry {
  private tools: Map<string, AtomicTool> = new Map();

  constructor() {
    this.registerAll([
      ...CLIENT_TOOLS,
      ...PROJECT_TOOLS,
      ...DOCUMENT_TOOLS,
      ...FOLDER_TOOLS,
      ...CHECKLIST_TOOLS,
      ...TASK_TOOLS,
      ...NOTE_TOOLS,
      ...CONTACT_TOOLS,
      ...REMINDER_TOOLS,
      ...EVENT_TOOLS,
      ...KNOWLEDGE_BANK_TOOLS,
      ...INTELLIGENCE_TOOLS,
      ...INTERNAL_DOCUMENT_TOOLS,
      ...FILE_QUEUE_TOOLS,
    ]);
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  private registerAll(tools: AtomicTool[]): void {
    for (const tool of tools) {
      if (this.tools.has(tool.name)) {
        console.warn(`[ToolRegistry] Duplicate tool name: "${tool.name}" — skipping.`);
        continue;
      }
      this.tools.set(tool.name, tool);
    }
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** Get a single tool by name */
  getTool(name: string): AtomicTool | undefined {
    return this.tools.get(name);
  }

  /** Get all registered tools */
  getAllTools(): AtomicTool[] {
    return Array.from(this.tools.values());
  }

  /** Get tools for a specific domain */
  getToolsByDomain(domain: ToolDomain): AtomicTool[] {
    return this.getAllTools().filter((t) => t.domain === domain);
  }

  /** Get tools by action type */
  getToolsByAction(action: ToolAction): AtomicTool[] {
    return this.getAllTools().filter((t) => t.action === action);
  }

  /** Get tools that require user confirmation */
  getConfirmationTools(): AtomicTool[] {
    return this.getAllTools().filter((t) => t.requiresConfirmation);
  }

  /**
   * Progressive disclosure: load tools based on chat context.
   *
   * - global: all read tools + core write tools (~30 tools)
   * - client: all tools relevant to client context (~60 tools)
   * - project: all tools relevant to project context (~70 tools)
   */
  getToolsForContext(context: ChatContext): AtomicTool[] {
    const all = this.getAllTools();

    switch (context.contextType) {
      case "global": {
        // All read tools + a curated set of core write tools
        return all.filter(
          (t) => t.action === "read" || GLOBAL_WRITE_TOOLS.has(t.name)
        );
      }

      case "client": {
        // All tools whose domain is in the client-context list
        return all.filter(
          (t) =>
            CLIENT_CONTEXT_DOMAINS.includes(t.domain) ||
            t.contextRelevance.includes("client")
        );
      }

      case "project": {
        // All tools whose domain is in the project-context list
        return all.filter(
          (t) =>
            PROJECT_CONTEXT_DOMAINS.includes(t.domain) ||
            t.contextRelevance.includes("project")
        );
      }

      default:
        return all;
    }
  }

  // -------------------------------------------------------------------------
  // Formatting
  // -------------------------------------------------------------------------

  /**
   * Format an array of tools for inclusion in the LLM system prompt.
   * Replaces the old `formatToolsForLLM()` from chatTools.ts.
   */
  formatForLLM(tools?: AtomicTool[]): string {
    const list = tools ?? this.getAllTools();

    return list
      .map((tool) => {
        const confirm = tool.requiresConfirmation ? "Yes" : "No";
        return `### ${tool.name}
Description: ${tool.description}
Domain: ${tool.domain}
Parameters: ${JSON.stringify(tool.parameters, null, 2)}
Requires Confirmation: ${confirm}`;
      })
      .join("\n\n");
  }

  /**
   * Format tools for the Anthropic SDK `tools` parameter.
   * Returns an array matching Anthropic's tool schema.
   */
  formatForAnthropicTools(tools?: AtomicTool[]): Array<{
    name: string;
    description: string;
    input_schema: { type: string; properties: Record<string, any>; required: string[] };
  }> {
    const list = tools ?? this.getAllTools();
    return list.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  /** Total number of registered tools */
  get size(): number {
    return this.tools.size;
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

let _instance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!_instance) {
    _instance = new ToolRegistry();
  }
  return _instance;
}
