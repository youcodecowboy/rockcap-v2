// src/lib/chat/systemPrompt.ts
import { formatSkillCatalogForPrompt } from './skills';

export interface SystemPromptContext {
  pageContext?: {
    type: 'client' | 'project';
    clientName?: string;
    clientId?: string;
    projectName?: string;
    projectId?: string;
  };
  mentions?: Array<{
    type: 'client' | 'project';
    name: string;
    id: string;
  }>;
  references?: string[]; // Pre-formatted reference blocks
  currentDate?: string;
}

/**
 * Build the system prompt for the chat agent.
 * Returns an array of system blocks for Anthropic API caching.
 *
 * Block 0: Instructions + skill catalog (stable, cache_control breakpoint)
 * Block 1: References + page context (varies per request)
 */
export function buildSystemPromptBlocks(ctx: SystemPromptContext): Array<{
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}> {
  const date = ctx.currentDate || new Date().toISOString().split('T')[0];

  // Block 0: Instructions (stable across turns — cached)
  const instructions = `You are RockCap Assistant, an AI agent for UK property development lending.
You help users manage clients, projects, documents, and financial data.
Today's date: ${date}

## Resolution Chain (MANDATORY — follow every step before saying "I don't have it")
1. Check the References section — intelligence summaries for mentioned/viewed entities.
   If the answer is there, respond directly. No tool call needed.
2. Use queryIntelligence for specific field lookups with evidence/confidence details.
3. Use loadReference for additional context (document lists, contacts, notes).
4. If you still can't answer, use searchSkills to load the documents skill, then use
   reclassify to deep-analyze up to 3 promising documents. This saves new intelligence.
5. For actions (create notes, tasks, etc.), use searchSkills to discover tools first.
6. After 3 reclassify attempts with no answer, tell the user what you tried and
   what new data you discovered along the way.

CRITICAL: NEVER say "I don't have that information" or offer to help add data until you have
exhausted at least steps 1–3. If the References section doesn't have the answer, USE YOUR TOOLS
to search for it. The knowledge library and intelligence system contain far more data than what
fits in the reference summary. Always try before giving up.

## Available Skills
Load on demand via searchSkills:
${formatSkillCatalogForPrompt()}

## Rules
1. Lead with the answer, not the process.
2. Write operations require user confirmation before execution.
3. For financial values, use £ with commas. For percentages, use %.
4. If the user's question doesn't match the page context, ask or search broadly.
5. Be concise. Users are professionals who want direct answers.`;

  // Block 1: References + page context (varies per request)
  const contextParts: string[] = [];

  // References
  if (ctx.references && ctx.references.length > 0) {
    contextParts.push('## References\n');
    contextParts.push(ctx.references.join('\n\n'));
  }

  // Page context
  if (ctx.pageContext) {
    const page = ctx.pageContext;
    if (page.type === 'project' && page.projectName) {
      contextParts.push(`\n## Context\nPage: Project "${page.projectName}" (Client: "${page.clientName || 'Unknown'}")\nThis is a hint — the user may be asking about something else.`);
    } else if (page.type === 'client' && page.clientName) {
      contextParts.push(`\n## Context\nPage: Client "${page.clientName}"\nThis is a hint — the user may be asking about something else.`);
    }
  }

  const contextBlock = contextParts.length > 0
    ? contextParts.join('\n')
    : '## References\nNo entity context provided. Use searchSkills to find what you need.';

  return [
    {
      type: 'text' as const,
      text: instructions,
      cache_control: { type: 'ephemeral' as const },
    },
    {
      type: 'text' as const,
      text: contextBlock,
    },
  ];
}
