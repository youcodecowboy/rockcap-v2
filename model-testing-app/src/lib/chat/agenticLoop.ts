// src/lib/chat/agenticLoop.ts
import Anthropic from '@anthropic-ai/sdk';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import { executeTool } from '../tools/executor';
import { getToolRegistry } from '../tools/registry';
import {
  resolveSkillSearch,
  getSkillTools,
  formatSkillSearchResult,
} from './skills';
import {
  formatClientReference,
  formatProjectReference,
  formatDocumentListReference,
  formatContactListReference,
  formatNoteListReference,
  KnowledgeItem,
} from './references';
import { CORE_CHAT_TOOLS } from '../tools/domains/intelligence.tools';
import type { AtomicTool } from '../tools/types';

const anthropic = new Anthropic();

export interface AgenticLoopConfig {
  sessionId: string;
  clientId?: string;
  projectId?: string;
  systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  messages: Anthropic.MessageParam[];
  convexClient: ConvexHttpClient;
  maxIterations?: number;
}

export interface AgenticLoopResult {
  content: string;
  toolCalls: Array<{ name: string; input: any; result: any }>;
  pendingActions: Array<{ toolName: string; parameters: any; description: string; requiresConfirmation: boolean }>;
  activityLog: Array<{ activity: string; timestamp: string }>;
  tokensUsed: number;
  cacheMetrics: {
    cacheReadTokens: number;
    cacheCreationTokens: number;
    uncachedInputTokens: number;
    outputTokens: number;
  };
  loadedSkills: string[];
}

/**
 * Run the skills-based agentic loop.
 *
 * Starts with minimal tools (queryIntelligence, searchSkills, loadReference).
 * Dynamically injects tool definitions when skills are loaded.
 */
export async function runAgenticLoop(config: AgenticLoopConfig): Promise<AgenticLoopResult> {
  const {
    clientId,
    projectId,
    systemBlocks,
    convexClient,
    maxIterations = 8,
  } = config;
  let messages = [...config.messages];

  // Core tools always loaded: queryIntelligence (from registry) + searchSkills + loadReference
  const registry = getToolRegistry();
  const queryIntelTool = registry.getTool('queryIntelligence');
  const coreTools: AtomicTool[] = [
    ...(queryIntelTool ? [queryIntelTool] : []),
    ...CORE_CHAT_TOOLS,
  ];
  let activeTools = [...coreTools];
  const loadedSkills = new Set<string>();
  const confirmationTools = new Set(
    registry.getConfirmationTools().map((t) => t.name)
  );

  const result: AgenticLoopResult = {
    content: '',
    toolCalls: [],
    pendingActions: [],
    activityLog: [],
    tokensUsed: 0,
    cacheMetrics: { cacheReadTokens: 0, cacheCreationTokens: 0, uncachedInputTokens: 0, outputTokens: 0 },
    loadedSkills: [],
  };

  let reclassifyAttempts = 0;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const anthropicTools = formatToolsForAnthropic(activeTools);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      cache_control: { type: 'ephemeral' },
      system: systemBlocks as any,
      tools: anthropicTools as any,
      messages,
    });

    // Accumulate usage
    const usage = response.usage as any;
    result.tokensUsed += (usage.input_tokens || 0) + (usage.output_tokens || 0);
    result.cacheMetrics.cacheReadTokens += usage.cache_read_input_tokens || 0;
    result.cacheMetrics.cacheCreationTokens += usage.cache_creation_input_tokens || 0;
    result.cacheMetrics.uncachedInputTokens += usage.input_tokens || 0;
    result.cacheMetrics.outputTokens += usage.output_tokens || 0;

    // Extract text content
    for (const block of response.content) {
      if (block.type === 'text') {
        result.content += block.text;
      }
    }

    // If no tool use, we're done
    if (response.stop_reason === 'end_turn') break;

    // Process tool calls
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    if (toolUseBlocks.length === 0) break;

    // Add assistant response to messages
    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const input = toolUse.input as Record<string, any>;
      const timestamp = new Date().toISOString();

      try {
        if (toolUse.name === 'searchSkills') {
          // Handle searchSkills — inject tools dynamically
          const skillNames = resolveSkillSearch(input.query);
          for (const name of skillNames) {
            if (!loadedSkills.has(name)) {
              const skillTools = getSkillTools(name);
              activeTools.push(...skillTools);
              loadedSkills.add(name);
              result.activityLog.push({
                activity: `Loaded skill: ${name} (${skillTools.length} tools)`,
                timestamp,
              });
            }
          }
          result.loadedSkills = [...loadedSkills];
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: formatSkillSearchResult(skillNames),
          });
        } else if (toolUse.name === 'loadReference') {
          // Handle loadReference — return reference text
          const refText = await handleLoadReference(input, convexClient);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: refText,
          });
          result.activityLog.push({
            activity: `Loaded reference: ${input.type} for ${input.entityId}`,
            timestamp,
          });
        } else if (toolUse.name === 'reclassify') {
          // Track reclassify attempts
          reclassifyAttempts++;
          if (reclassifyAttempts > 3) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: 'Maximum reclassify attempts reached (3). Please inform the user of what you found so far.',
              is_error: true,
            });
          } else {
            // Execute reclassify via executor (it's a normal tool with a handler)
            const toolResult = await executeTool(toolUse.name, injectContextIds(input, clientId, projectId), convexClient);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
            });
            result.activityLog.push({
              activity: `Deep-analyzed document (attempt ${reclassifyAttempts}/3)`,
              timestamp,
            });
          }
        } else if (confirmationTools.has(toolUse.name)) {
          // Write tool — collect as pending action for user confirmation
          result.pendingActions.push({
            toolName: toolUse.name,
            parameters: injectContextIds(input, clientId, projectId),
            description: `${toolUse.name}: ${JSON.stringify(input).slice(0, 200)}`,
            requiresConfirmation: true,
          });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Action "${toolUse.name}" queued for user confirmation.`,
          });
        } else {
          // Normal read tool — execute immediately
          const toolResult = await executeTool(toolUse.name, injectContextIds(input, clientId, projectId), convexClient);
          const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: resultStr,
          });
          result.toolCalls.push({
            name: toolUse.name,
            input,
            result: toolResult,
          });
          result.activityLog.push({
            activity: `Called ${toolUse.name}`,
            timestamp,
          });
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Error: ${errMsg}`,
          is_error: true,
        });
        result.activityLog.push({
          activity: `Error in ${toolUse.name}: ${errMsg}`,
          timestamp,
        });
      }
    }

    // Add tool results to messages
    messages.push({ role: 'user', content: toolResults });

    // Content is accumulated across iterations via += in the text extraction above
  }

  if (result.activityLog.length > 0) {
    const lastIteration = result.activityLog.length;
    if (lastIteration >= maxIterations) {
      console.warn(`[agenticLoop] Hit maxIterations (${maxIterations}) — response may be incomplete`);
      result.activityLog.push({
        activity: `Loop reached max iterations (${maxIterations})`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return result;
}

// --- Helpers ---

function formatToolsForAnthropic(tools: AtomicTool[]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool.InputSchema,
  }));
}

function injectContextIds(
  params: Record<string, any>,
  clientId?: string,
  projectId?: string
): Record<string, any> {
  const injected = { ...params };
  if (clientId && !injected.clientId) injected.clientId = clientId;
  if (projectId && !injected.projectId) injected.projectId = projectId;
  return injected;
}

async function handleLoadReference(
  input: Record<string, any>,
  convexClient: ConvexHttpClient
): Promise<string> {
  const { type, entityId } = input;

  switch (type) {
    case 'client_summary': {
      const client = await convexClient.query(api.clients.get, { id: entityId as any });
      const intel = await convexClient.query(api.intelligence.getClientIntelligence, { clientId: entityId as any });
      const knowledgeItems = await convexClient.query(api.knowledgeLibrary.getKnowledgeItemsByClient, { clientId: entityId as any }) as KnowledgeItem[];
      return formatClientReference(
        { name: client?.name || 'Unknown', status: client?.status || 'unknown', type: client?.type || 'unknown' },
        intel,
        knowledgeItems
      );
    }
    case 'project_summary': {
      const project = await convexClient.query(api.projects.get, { id: entityId as any });
      const intel = await convexClient.query(api.intelligence.getProjectIntelligence, { projectId: entityId as any });
      const knowledgeItems = await convexClient.query(api.knowledgeLibrary.getKnowledgeItemsByProject, { projectId: entityId as any }) as KnowledgeItem[];
      return formatProjectReference(
        { name: project?.name || 'Unknown', status: project?.status || 'unknown' },
        intel,
        knowledgeItems
      );
    }
    case 'document_list': {
      const docs = await convexClient.query(api.documents.getByProject, { projectId: entityId as any });
      return formatDocumentListReference(docs || []);
    }
    case 'contact_list': {
      const contacts = await convexClient.query(api.contacts.getByClient, { clientId: entityId as any });
      return formatContactListReference(contacts || []);
    }
    case 'note_list': {
      const notes = await convexClient.query(api.notes.getByClient, { clientId: entityId as any });
      return formatNoteListReference(notes || []);
    }
    case 'document_summary': {
      const doc = await convexClient.query(api.documents.get, { id: entityId as any });
      if (!doc) return 'Document not found.';
      return `Document: ${doc.fileName}\nCategory: ${doc.category || 'Uncategorized'}\nStatus: ${doc.status || 'unknown'}\n${doc.summary || 'No summary available.'}`;
    }
    case 'knowledge_bank': {
      const entries = await convexClient.query(api.knowledgeBank.getByClient, { clientId: entityId as any });
      if (!entries || entries.length === 0) return 'No knowledge bank entries.';
      return entries.slice(0, 10).map((e: any) => `- ${e.title || e.category}: ${(e.content || '').slice(0, 150)}`).join('\n');
    }
    default:
      return `Unknown reference type: ${type}`;
  }
}
