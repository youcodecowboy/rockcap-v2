/**
 * Atomic Tool Library — Public API
 *
 * Barrel export for the tool registry, executor, and types.
 * Also provides backward-compatible exports that match the old chatTools.ts
 * interface so existing consumers can migrate incrementally.
 */

// Re-export types
export type {
  AtomicTool,
  ToolDomain,
  ToolAction,
  ChatContext,
  ChatContextType,
  ToolParameters,
  JsonSchemaProperty,
  ConvexMapping,
} from "./types";

export { TOOL_DOMAINS } from "./types";

// Re-export registry
export { ToolRegistry, getToolRegistry } from "./registry";

// Re-export executor
export { executeTool, hasHandler } from "./executor";

// Re-export validators
export {
  validateISODate,
  searchClientByName,
  resolveClientId,
  parseAndValidateReminderParams,
  parseAndValidateTaskParams,
} from "./validators";

// ---------------------------------------------------------------------------
// Backward-compatible shim
// ---------------------------------------------------------------------------
// The old chatTools.ts exported:
//   - Tool (interface)
//   - CHAT_TOOLS (array)
//   - executeTool (function) — already re-exported above
//   - formatToolsForLLM (function)
//
// This shim maps the new AtomicTool[] to the old Tool[] shape so that
// existing consumers (like /api/chat-assistant) can continue to work
// until they migrate to the new registry.

import { getToolRegistry } from "./registry";
import type { AtomicTool } from "./types";

/** @deprecated Use AtomicTool instead */
export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
  requiresConfirmation: boolean;
}

function atomicToLegacy(tool: AtomicTool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    requiresConfirmation: tool.requiresConfirmation,
  };
}

/**
 * @deprecated Use getToolRegistry().getAllTools() instead.
 * Backward-compatible flat tool array matching the old chatTools.ts export.
 */
export function getChatTools(): Tool[] {
  return getToolRegistry().getAllTools().map(atomicToLegacy);
}

/**
 * @deprecated Use getToolRegistry().formatForLLM() instead.
 * Backward-compatible LLM formatting function.
 */
export function formatToolsForLLM(): string {
  return getToolRegistry().formatForLLM();
}

// Static export for consumers that import CHAT_TOOLS directly.
// Lazy-initialized on first access.
let _legacyToolsCache: Tool[] | null = null;

/** @deprecated Use getToolRegistry().getAllTools() instead */
export function getLegacyChatTools(): Tool[] {
  if (!_legacyToolsCache) {
    _legacyToolsCache = getChatTools();
  }
  return _legacyToolsCache;
}
