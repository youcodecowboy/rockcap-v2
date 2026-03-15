// src/lib/chat/skills.ts
import { getToolRegistry } from '../tools/registry';
import type { AtomicTool, ToolDomain } from '../tools/types';

export interface SkillDefinition {
  name: string;
  description: string;
  domains: ToolDomain[];
  keywords: string[]; // For search matching
}

export const SKILL_CATALOG: Record<string, SkillDefinition> = {
  intelligence: {
    name: 'intelligence',
    description: 'Query extracted intelligence fields, compare values, check confidence scores',
    domains: ['intelligence'],
    keywords: ['intelligence', 'data', 'field', 'extract', 'confidence', 'value'],
  },
  documents: {
    name: 'documents',
    description: 'Fetch, read, summarize, compare project documents. Includes reclassify for deep analysis.',
    domains: ['document', 'internalDocument', 'fileQueue'],
    keywords: ['document', 'file', 'pdf', 'report', 'valuation', 'read', 'fetch', 'reclassify', 'analyze'],
  },
  notes: {
    name: 'notes',
    description: 'Create, update, list client/project notes',
    domains: ['note'],
    keywords: ['note', 'write', 'record', 'memo', 'comment'],
  },
  tasks: {
    name: 'tasks',
    description: 'Create, assign, update, list tasks',
    domains: ['task'],
    keywords: ['task', 'todo', 'assign', 'deadline', 'action'],
  },
  contacts: {
    name: 'contacts',
    description: 'Lookup, create, update contacts and key people',
    domains: ['contact'],
    keywords: ['contact', 'person', 'phone', 'email', 'solicitor', 'borrower'],
  },
  calendar: {
    name: 'calendar',
    description: 'Events, reminders, meetings',
    domains: ['event', 'reminder', 'meeting'],
    keywords: ['event', 'reminder', 'meeting', 'calendar', 'schedule', 'date'],
  },
  search: {
    name: 'search',
    description: 'Search across clients, projects, documents',
    domains: ['client', 'project'],
    keywords: ['search', 'find', 'lookup', 'list', 'browse'],
  },
  filing: {
    name: 'filing',
    description: 'File documents, reanalyze, manage filing queue',
    domains: ['fileQueue', 'folder'],
    keywords: ['file', 'filing', 'classify', 'folder', 'organize', 'queue'],
  },
  checklists: {
    name: 'checklists',
    description: 'View and update project checklists',
    domains: ['checklist'],
    keywords: ['checklist', 'check', 'complete', 'progress', 'item'],
  },
  financial: {
    name: 'financial',
    description: 'Financial analysis, loan calculations, scenarios',
    // Analysis tools use domain "document" in the registry
    domains: ['document'],
    keywords: ['finance', 'financial', 'loan', 'ltv', 'gdv', 'cost', 'profit', 'calculation'],
  },
  flags: {
    name: 'flags',
    description: 'Create and manage project flags and alerts',
    domains: ['flag'],
    keywords: ['flag', 'alert', 'warning', 'issue', 'risk'],
  },
};

/**
 * Search skills by query string. Returns matching skill names.
 * Uses name match, then keyword match, then description match.
 */
export function resolveSkillSearch(query: string): string[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const matches: Array<{ name: string; score: number }> = [];

  for (const [name, skill] of Object.entries(SKILL_CATALOG)) {
    let score = 0;

    // Exact name match
    if (name === q) {
      score = 100;
    }
    // Name starts with query
    else if (name.startsWith(q)) {
      score = 80;
    }
    // Name contains query
    else if (name.includes(q)) {
      score = 60;
    }
    // Keyword match
    else if (skill.keywords.some((kw) => kw.includes(q) || q.includes(kw))) {
      score = 40;
    }
    // Description match
    else if (skill.description.toLowerCase().includes(q)) {
      score = 20;
    }

    if (score > 0) {
      matches.push({ name, score });
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .map((m) => m.name);
}

/**
 * Get the AtomicTool[] for a given skill name.
 * Pulls tools from the registry by domain.
 */
export function getSkillTools(skillName: string): AtomicTool[] {
  const skill = SKILL_CATALOG[skillName];
  if (!skill) return [];

  const registry = getToolRegistry();
  const tools: AtomicTool[] = [];
  const seen = new Set<string>();
  for (const domain of skill.domains) {
    for (const tool of registry.getToolsByDomain(domain)) {
      if (!seen.has(tool.name)) {
        tools.push(tool);
        seen.add(tool.name);
      }
    }
  }
  return tools;
}

/**
 * Format skill catalog for inclusion in system prompt.
 * Compact format: "- name: description" per line.
 */
export function formatSkillCatalogForPrompt(): string {
  const lines = Object.values(SKILL_CATALOG).map(
    (s) => `- ${s.name}: ${s.description}`
  );
  return lines.join('\n');
}

/**
 * Format the result of a skill search for the model.
 * Lists matched skills with their tool names.
 */
export function formatSkillSearchResult(skillNames: string[]): string {
  if (skillNames.length === 0) {
    return 'No matching skills found. Try a different search query.';
  }

  const lines: string[] = ['Found skills:'];
  for (const name of skillNames) {
    const skill = SKILL_CATALOG[name];
    if (!skill) continue;
    const tools = getSkillTools(name);
    const toolNames = tools.map((t) => t.name).join(', ');
    lines.push(`\n${skill.name}: ${skill.description}`);
    lines.push(`  Tools: ${toolNames}`);
  }
  return lines.join('\n');
}
