# Chat Agent Rework — Skills-Based Architecture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the token-heavy dump-everything chat with a lean skills-based agent that uses ~3K tokens for simple lookups (down from 42K), with @ mentions, auto-injected intelligence references, and a self-improving reclassify tool.

**Architecture:** Client-side skill search pattern on Haiku 4.5 — minimal always-loaded tools (queryIntelligence, searchSkills, loadReference), dynamic tool injection in the agentic loop, auto-injected intelligence references for @ mentioned entities, and a reclassify tool that deep-analyzes documents and saves new intelligence.

**Tech Stack:** Next.js 16, Convex backend, Anthropic SDK (`@anthropic-ai/sdk`), Claude Haiku 4.5, React, TypeScript, Vitest, shadcn/ui + Lucide icons

**Spec:** `docs/plans/2026-03-14-chat-agent-rework.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/chat/skills.ts` | Skill catalog, searchSkills resolver, skill-to-tool mapping |
| `src/lib/chat/references.ts` | Reference builders (client/project summaries), loadReference handler, formatReference() |
| `src/lib/chat/reclassify.ts` | Deep document analysis handler, intelligence saving |
| `src/lib/chat/systemPrompt.ts` | New system prompt builder with references + skill catalog |
| `src/lib/chat/agenticLoop.ts` | New agentic loop with dynamic tool injection |
| `src/lib/chat/mentionParser.ts` | Parse @ mentions from message text, resolve entity IDs |
| `src/components/MentionAutocomplete.tsx` | Dropdown autocomplete for @ mentions in chat input |
| `src/components/ChatBriefing.tsx` | Proactive briefing card (recent changes, conflicts, missing fields) |
| `src/__tests__/skills.test.ts` | Tests for skill catalog and search |
| `src/__tests__/references.test.ts` | Tests for reference building and formatting |
| `src/__tests__/mentionParser.test.ts` | Tests for @ mention parsing |
| `src/__tests__/agenticLoop.test.ts` | Tests for dynamic tool injection logic |

### Modified Files
| File | Changes |
|------|---------|
| `src/app/api/chat-assistant/route.ts` | Rewrite POST handler to use new agenticLoop, remove gatherChatContext |
| `src/components/ChatInput.tsx` | Add @ mention detection and autocomplete trigger |
| `src/components/ChatAssistantDrawer.tsx` | Add ChatBriefing, pass @ mention metadata, handle new response format |
| `src/lib/tools/registry.ts` | Add `getToolsByDomains()` method for skill-based loading |
| `convex/chatSessions.ts` | Add mentions field to session schema |

### Unchanged Files
| File | Why unchanged |
|------|--------------|
| `src/lib/tools/domains/*.tools.ts` (all 17) | Tool definitions stay as-is |
| `src/lib/tools/executor.ts` | Handler dispatch unchanged |
| `convex/intelligence.ts` | Queries unchanged, used by references |
| `convex/chatMessages.ts` | Message storage unchanged |

---

## Chunk 1: Backend Foundation — Skills + References

### Task 1: Skill Catalog (`src/lib/chat/skills.ts`)

**Files:**
- Create: `src/lib/chat/skills.ts`
- Create: `src/__tests__/skills.test.ts`
- Reference: `src/lib/tools/registry.ts`, `src/lib/tools/types.ts`

- [ ] **Step 1: Write failing tests for skill catalog**

```typescript
// src/__tests__/skills.test.ts
import { describe, it, expect } from 'vitest';
import {
  SKILL_CATALOG,
  resolveSkillSearch,
  formatSkillCatalogForPrompt,
  formatSkillSearchResult,
  getSkillTools,
} from '../lib/chat/skills';

describe('SKILL_CATALOG', () => {
  it('contains all expected skill domains', () => {
    const expectedSkills = [
      'intelligence', 'documents', 'notes', 'tasks', 'contacts',
      'calendar', 'search', 'filing', 'checklists', 'financial', 'flags',
    ];
    for (const skill of expectedSkills) {
      expect(SKILL_CATALOG[skill]).toBeDefined();
      expect(SKILL_CATALOG[skill].name).toBe(skill);
      expect(SKILL_CATALOG[skill].description).toBeTruthy();
      expect(SKILL_CATALOG[skill].domains.length).toBeGreaterThan(0);
    }
  });

  it('each skill references valid tool domains', () => {
    for (const [, skill] of Object.entries(SKILL_CATALOG)) {
      for (const domain of skill.domains) {
        expect(typeof domain).toBe('string');
      }
    }
  });
});

describe('resolveSkillSearch', () => {
  it('returns exact match for skill name', () => {
    const result = resolveSkillSearch('documents');
    expect(result).toContain('documents');
  });

  it('returns partial matches', () => {
    const result = resolveSkillSearch('doc');
    expect(result).toContain('documents');
  });

  it('returns multiple matches for broad query', () => {
    const result = resolveSkillSearch('create');
    expect(result.length).toBeGreaterThan(1);
  });

  it('returns empty for nonsense query', () => {
    const result = resolveSkillSearch('xyznonexistent');
    expect(result).toEqual([]);
  });
});

describe('formatSkillCatalogForPrompt', () => {
  it('returns compact skill listing under 300 tokens (~1200 chars)', () => {
    const catalog = formatSkillCatalogForPrompt();
    expect(catalog.length).toBeLessThan(1500);
    expect(catalog).toContain('documents');
    expect(catalog).toContain('intelligence');
  });
});

describe('getSkillTools', () => {
  it('returns AtomicTool[] for a valid skill name', () => {
    const tools = getSkillTools('intelligence');
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0]).toHaveProperty('name');
    expect(tools[0]).toHaveProperty('domain');
  });

  it('returns empty array for unknown skill', () => {
    const tools = getSkillTools('nonexistent');
    expect(tools).toEqual([]);
  });
});

describe('formatSkillSearchResult', () => {
  it('returns human-readable skill descriptions', () => {
    const result = formatSkillSearchResult(['documents', 'notes']);
    expect(result).toContain('documents');
    expect(result).toContain('notes');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/skills.test.ts`
Expected: FAIL — module `../lib/chat/skills` not found

- [ ] **Step 3: Implement skill catalog**

```typescript
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
    domains: ['analysis'],
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
  for (const domain of skill.domains) {
    tools.push(...registry.getToolsByDomain(domain));
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/skills.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/skills.ts src/__tests__/skills.test.ts
git commit -m "feat: add skills catalog with search and tool resolution"
```

---

### Task 2: Reference System (`src/lib/chat/references.ts`)

**Files:**
- Create: `src/lib/chat/references.ts`
- Create: `src/__tests__/references.test.ts`
- Reference: `convex/intelligence.ts`, `src/lib/canonicalFields.ts`

- [ ] **Step 1: Write failing tests for reference system**

```typescript
// src/__tests__/references.test.ts
import { describe, it, expect } from 'vitest';
import {
  formatClientReference,
  formatProjectReference,
  formatDocumentListReference,
  formatContactListReference,
  formatNoteListReference,
} from '../lib/chat/references';

describe('formatClientReference', () => {
  it('formats a client intelligence record into a compact reference', () => {
    const mockIntel = {
      clientType: 'borrower',
      identity: { legalName: 'Acme Holdings Ltd', companyNumber: '12345678' },
      addresses: { registered: '123 Main St, London' },
      primaryContact: { name: 'John Smith', email: 'john@acme.com' },
      banking: {},
      keyPeople: [{ name: 'John Smith', role: 'Director' }],
    };
    const mockClient = { name: 'Acme Holdings', status: 'active', type: 'borrower' };
    const result = formatClientReference(mockClient, mockIntel);
    expect(result).toContain('Acme Holdings');
    expect(result).toContain('123 Main St');
    expect(result).toContain('12345678');
    expect(result.length).toBeLessThan(2000); // Compact
  });

  it('handles null intelligence gracefully', () => {
    const mockClient = { name: 'New Client', status: 'prospect', type: 'borrower' };
    const result = formatClientReference(mockClient, null);
    expect(result).toContain('New Client');
    expect(result).toContain('No intelligence data');
  });
});

describe('formatProjectReference', () => {
  it('formats a project intelligence record into a compact reference', () => {
    const mockIntel = {
      overview: { projectType: 'Residential', currentPhase: 'Construction' },
      location: { siteAddress: '45 River Lane', postcode: 'SW1 1AA' },
      financials: { loanAmount: 2400000, ltv: 65, grossDevelopmentValue: 4200000 },
      timeline: { practicalCompletionDate: '2027-06-01' },
      development: { totalUnits: 12 },
    };
    const mockProject = { name: 'Riverside Dev', status: 'active' };
    const result = formatProjectReference(mockProject, mockIntel);
    expect(result).toContain('Riverside Dev');
    expect(result).toContain('2,400,000');
    expect(result).toContain('65');
    expect(result.length).toBeLessThan(2000);
  });
});

describe('formatDocumentListReference', () => {
  it('formats document list compactly', () => {
    const docs = [
      { _id: 'doc1', fileName: 'Valuation.pdf', category: 'Appraisals', status: 'classified' },
      { _id: 'doc2', fileName: 'Contract.pdf', category: 'Legal Documents', status: 'classified' },
    ];
    const result = formatDocumentListReference(docs);
    expect(result).toContain('Valuation.pdf');
    expect(result).toContain('Contract.pdf');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/references.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement reference system**

```typescript
// src/lib/chat/references.ts

/**
 * Format a client intelligence record into a compact reference block.
 * Target: ~300 tokens.
 */
export function formatClientReference(
  client: { name: string; status: string; type: string },
  intel: any | null
): string {
  if (!intel) {
    return `### ${client.name} (Client)\nStatus: ${client.status} | Type: ${client.type}\nNo intelligence data extracted yet.`;
  }

  const lines: string[] = [`### ${client.name} (Client)`];
  lines.push(`Status: ${client.status} | Type: ${client.type}`);

  // Identity
  const id = intel.identity || {};
  const idParts: string[] = [];
  if (id.legalName) idParts.push(`Legal: ${id.legalName}`);
  if (id.companyNumber) idParts.push(`Co #: ${id.companyNumber}`);
  if (id.vatNumber) idParts.push(`VAT: ${id.vatNumber}`);
  if (idParts.length > 0) lines.push(idParts.join(' | '));

  // Address
  const addr = intel.addresses || {};
  if (addr.registered) lines.push(`Registered: ${addr.registered}`);

  // Contact
  const contact = intel.primaryContact || {};
  if (contact.name) {
    const contactParts = [contact.name];
    if (contact.email) contactParts.push(contact.email);
    if (contact.phone) contactParts.push(contact.phone);
    lines.push(`Primary Contact: ${contactParts.join(' | ')}`);
  }

  // Key people
  const people = intel.keyPeople || [];
  if (people.length > 0) {
    const names = people.slice(0, 5).map((p: any) => `${p.name}${p.role ? ` (${p.role})` : ''}`);
    lines.push(`Key People: ${names.join(', ')}`);
  }

  // Borrower/Lender profile summary
  if (intel.borrowerProfile) {
    const bp = intel.borrowerProfile;
    const parts: string[] = [];
    if (bp.experienceLevel) parts.push(`Experience: ${bp.experienceLevel}`);
    if (bp.completedProjects) parts.push(`Projects: ${bp.completedProjects}`);
    if (parts.length > 0) lines.push(parts.join(' | '));
  }
  if (intel.lenderProfile) {
    const lp = intel.lenderProfile;
    const parts: string[] = [];
    if (lp.dealSizeMin && lp.dealSizeMax) parts.push(`Deals: £${formatNum(lp.dealSizeMin)}-£${formatNum(lp.dealSizeMax)}`);
    if (lp.typicalLTV) parts.push(`LTV: ${lp.typicalLTV}%`);
    if (parts.length > 0) lines.push(parts.join(' | '));
  }

  // Intelligence stats
  const filledCount = countFilledFields(intel);
  lines.push(`Intelligence: ${filledCount}/48 fields filled`);

  // Extracted attributes (custom fields)
  if (intel.extractedAttributes) {
    const attrs = Object.entries(intel.extractedAttributes).slice(0, 10);
    if (attrs.length > 0) {
      const attrStr = attrs.map(([k, v]: [string, any]) => `${k}: ${v}`).join(' | ');
      lines.push(`Custom: ${attrStr}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a project intelligence record into a compact reference block.
 * Target: ~300 tokens.
 */
export function formatProjectReference(
  project: { name: string; status: string },
  intel: any | null
): string {
  if (!intel) {
    return `### ${project.name} (Project)\nStatus: ${project.status}\nNo intelligence data extracted yet.`;
  }

  const lines: string[] = [`### ${project.name} (Project)`];
  lines.push(`Status: ${project.status}`);

  // Overview
  const ov = intel.overview || {};
  const ovParts: string[] = [];
  if (ov.projectType) ovParts.push(`Type: ${ov.projectType}`);
  if (ov.assetClass) ovParts.push(`Class: ${ov.assetClass}`);
  if (ov.currentPhase) ovParts.push(`Phase: ${ov.currentPhase}`);
  if (ovParts.length > 0) lines.push(ovParts.join(' | '));

  // Location
  const loc = intel.location || {};
  if (loc.siteAddress) lines.push(`Site: ${loc.siteAddress}${loc.postcode ? `, ${loc.postcode}` : ''}`);

  // Financials
  const fin = intel.financials || {};
  const finParts: string[] = [];
  if (fin.loanAmount) finParts.push(`Loan: £${formatNum(fin.loanAmount)}`);
  if (fin.ltv) finParts.push(`LTV: ${fin.ltv}%`);
  if (fin.grossDevelopmentValue) finParts.push(`GDV: £${formatNum(fin.grossDevelopmentValue)}`);
  if (fin.totalDevelopmentCost) finParts.push(`TDC: £${formatNum(fin.totalDevelopmentCost)}`);
  if (fin.interestRate) finParts.push(`Rate: ${fin.interestRate}%`);
  if (finParts.length > 0) lines.push(finParts.join(' | '));

  // Development
  const dev = intel.development || {};
  const devParts: string[] = [];
  if (dev.totalUnits) devParts.push(`Units: ${dev.totalUnits}`);
  if (dev.totalSqFt) devParts.push(`${formatNum(dev.totalSqFt)} sq ft`);
  if (dev.planningStatus) devParts.push(`Planning: ${dev.planningStatus}`);
  if (devParts.length > 0) lines.push(devParts.join(' | '));

  // Timeline
  const tl = intel.timeline || {};
  const tlParts: string[] = [];
  if (tl.constructionStartDate) tlParts.push(`Start: ${tl.constructionStartDate}`);
  if (tl.practicalCompletionDate) tlParts.push(`Completion: ${tl.practicalCompletionDate}`);
  if (tl.loanMaturityDate) tlParts.push(`Maturity: ${tl.loanMaturityDate}`);
  if (tlParts.length > 0) lines.push(tlParts.join(' | '));

  // Key parties
  const kp = intel.keyParties || {};
  const partyParts: string[] = [];
  if (kp.borrower) partyParts.push(`Borrower: ${kp.borrower}`);
  if (kp.contractor) partyParts.push(`Contractor: ${kp.contractor}`);
  if (kp.solicitor) partyParts.push(`Solicitor: ${kp.solicitor}`);
  if (partyParts.length > 0) lines.push(partyParts.join(' | '));

  // Intelligence stats
  const filledCount = countFilledFields(intel);
  lines.push(`Intelligence: ${filledCount}/105 fields filled`);

  // Extracted attributes
  if (intel.extractedAttributes) {
    const attrs = Object.entries(intel.extractedAttributes).slice(0, 10);
    if (attrs.length > 0) {
      const attrStr = attrs.map(([k, v]: [string, any]) => `${k}: ${v}`).join(' | ');
      lines.push(`Custom: ${attrStr}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a document list as a compact reference.
 */
export function formatDocumentListReference(
  docs: Array<{ _id: string; fileName: string; category?: string; status?: string; summary?: string }>
): string {
  if (docs.length === 0) return 'No documents found.';
  const lines = [`${docs.length} documents:`];
  for (const doc of docs) {
    const parts = [doc.fileName];
    if (doc.category) parts.push(`[${doc.category}]`);
    if (doc.status) parts.push(`(${doc.status})`);
    lines.push(`- ${parts.join(' ')} — ID: ${doc._id}`);
    if (doc.summary) {
      lines.push(`  Summary: ${doc.summary.slice(0, 150)}${doc.summary.length > 150 ? '...' : ''}`);
    }
  }
  return lines.join('\n');
}

/**
 * Format a contact list as a compact reference.
 */
export function formatContactListReference(
  contacts: Array<{ name: string; role?: string; email?: string; phone?: string }>
): string {
  if (contacts.length === 0) return 'No contacts found.';
  const lines = [`${contacts.length} contacts:`];
  for (const c of contacts) {
    const parts = [c.name];
    if (c.role) parts.push(`(${c.role})`);
    if (c.email) parts.push(c.email);
    if (c.phone) parts.push(c.phone);
    lines.push(`- ${parts.join(' | ')}`);
  }
  return lines.join('\n');
}

/**
 * Format a note list as a compact reference.
 */
export function formatNoteListReference(
  notes: Array<{ title?: string; content: string; createdAt: string }>
): string {
  if (notes.length === 0) return 'No notes found.';
  const lines = [`${notes.length} notes:`];
  for (const n of notes.slice(0, 10)) {
    const date = n.createdAt.split('T')[0];
    const preview = n.content.slice(0, 100) + (n.content.length > 100 ? '...' : '');
    lines.push(`- [${date}] ${n.title || 'Untitled'}: ${preview}`);
  }
  return lines.join('\n');
}

// --- Helpers ---

function formatNum(n: number): string {
  return n.toLocaleString('en-GB');
}

function countFilledFields(intel: any): number {
  let count = 0;
  const skip = new Set(['_id', '_creationTime', 'clientId', 'projectId', 'clientType', 'lastUpdated', 'lastUpdatedBy', 'version', 'extractedAttributes']);
  for (const [key, value] of Object.entries(intel)) {
    if (skip.has(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      count += Object.values(value).filter((v) => v != null && v !== '').length;
    } else if (Array.isArray(value)) {
      count += value.length > 0 ? 1 : 0;
    }
  }
  return count;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/references.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/references.ts src/__tests__/references.test.ts
git commit -m "feat: add reference system for compact intelligence summaries"
```

---

### Task 3: System Prompt Builder (`src/lib/chat/systemPrompt.ts`)

**Files:**
- Create: `src/lib/chat/systemPrompt.ts`
- Reference: `src/lib/chat/skills.ts`, `src/lib/chat/references.ts`

- [ ] **Step 1: Implement system prompt builder**

```typescript
// src/lib/chat/systemPrompt.ts
import { formatSkillCatalogForPrompt } from './skills';
import { formatClientReference, formatProjectReference } from './references';

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

## Resolution Chain (follow in order)
1. Check the References section — intelligence summaries for mentioned/viewed entities.
   If the answer is there, respond directly. No tool call needed.
2. Use queryIntelligence for specific field lookups with evidence/confidence details.
3. Use loadReference for additional context (document lists, contacts, notes).
4. If you still can't answer, use searchSkills to load the documents skill, then use
   reclassify to deep-analyze up to 3 promising documents. This saves new intelligence.
5. For actions (create notes, tasks, etc.), use searchSkills to discover tools first.
6. After 3 reclassify attempts with no answer, tell the user what you tried and
   what new data you discovered along the way.

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
```

- [ ] **Step 2: Run build check**

Run: `npx tsc --noEmit src/lib/chat/systemPrompt.ts 2>&1 | head -20`
Expected: No errors (or only unrelated existing errors)

- [ ] **Step 3: Commit**

```bash
git add src/lib/chat/systemPrompt.ts
git commit -m "feat: add system prompt builder with references and skill catalog"
```

---

### Task 4: Mention Parser (`src/lib/chat/mentionParser.ts`)

**Files:**
- Create: `src/lib/chat/mentionParser.ts`
- Create: `src/__tests__/mentionParser.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/mentionParser.test.ts
import { describe, it, expect } from 'vitest';
import { parseMentions, stripMentionMarkup } from '../lib/chat/mentionParser';

describe('parseMentions', () => {
  it('parses a single client mention', () => {
    const result = parseMentions('What is @[Acme Corp](client:abc123) address?');
    expect(result).toEqual([
      { type: 'client', name: 'Acme Corp', id: 'abc123' },
    ]);
  });

  it('parses a project mention', () => {
    const result = parseMentions('LTV on @[Riverside](project:xyz789)?');
    expect(result).toEqual([
      { type: 'project', name: 'Riverside', id: 'xyz789' },
    ]);
  });

  it('parses multiple mentions', () => {
    const result = parseMentions('Compare @[Client A](client:a1) and @[Project B](project:b2)');
    expect(result.length).toBe(2);
  });

  it('returns empty for no mentions', () => {
    const result = parseMentions('What is the weather?');
    expect(result).toEqual([]);
  });
});

describe('stripMentionMarkup', () => {
  it('converts markup to plain @ mention for display', () => {
    const result = stripMentionMarkup('What is @[Acme Corp](client:abc123) address?');
    expect(result).toBe('What is @Acme Corp address?');
  });

  it('handles multiple mentions', () => {
    const result = stripMentionMarkup('Compare @[A](client:1) and @[B](project:2)');
    expect(result).toBe('Compare @A and @B');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/mentionParser.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement mention parser**

```typescript
// src/lib/chat/mentionParser.ts

export interface ParsedMention {
  type: 'client' | 'project';
  name: string;
  id: string;
}

/**
 * Parse @ mentions from message text.
 * Format: @[Display Name](client:id) or @[Display Name](project:id)
 */
const MENTION_REGEX = /@\[([^\]]+)\]\((client|project):([^)]+)\)/g;

export function parseMentions(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  let match;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    mentions.push({
      name: match[1],
      type: match[2] as 'client' | 'project',
      id: match[3],
    });
  }
  // Reset regex lastIndex for reuse
  MENTION_REGEX.lastIndex = 0;
  return mentions;
}

/**
 * Strip mention markup, leaving just @Name for the model to see.
 */
export function stripMentionMarkup(text: string): string {
  return text.replace(MENTION_REGEX, '@$1');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/mentionParser.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/mentionParser.ts src/__tests__/mentionParser.test.ts
git commit -m "feat: add @ mention parser with markup format"
```

---

### Task 5: Core Tool Definitions (searchSkills, loadReference)

**Files:**
- Modify: `src/lib/tools/domains/intelligence.tools.ts`
- Reference: `src/lib/tools/types.ts`

These are the always-loaded tool definitions. They use the existing `AtomicTool` format but are handled specially in the new agentic loop (not dispatched through executor.ts).

- [ ] **Step 1: Add searchSkills and loadReference tool definitions**

Add to the end of `src/lib/tools/domains/intelligence.tools.ts` (after the existing `INTELLIGENCE_TOOLS` array):

```typescript
// Core tools that are always loaded in the skills-based chat architecture.
// These are NOT part of INTELLIGENCE_TOOLS — they are exported separately
// and handled by the agentic loop, not the executor.
export const CORE_CHAT_TOOLS: AtomicTool[] = [
  {
    name: 'searchSkills',
    domain: 'intelligence',
    action: 'read',
    description: 'Search for available tool skills to load. Returns matching skill groups with their tools. Use this when you need capabilities beyond queryIntelligence and loadReference.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query — skill name, keyword, or description of what you need (e.g., "documents", "create note", "filing")',
        },
      },
      required: ['query'],
    },
    requiresConfirmation: false,
    convexMapping: { type: 'query', path: '' }, // Handled by agentic loop, not executor
    contextRelevance: ['intelligence'],
  },
  {
    name: 'loadReference',
    domain: 'intelligence',
    action: 'read',
    description: 'Load additional context about a client, project, or their resources. Returns structured reference data.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['client_summary', 'project_summary', 'document_summary', 'document_list', 'contact_list', 'note_list', 'knowledge_bank'],
          description: 'Type of reference to load',
        },
        entityId: {
          type: 'string',
          description: 'The Convex ID of the client, project, or document',
        },
      },
      required: ['type', 'entityId'],
    },
    requiresConfirmation: false,
    convexMapping: { type: 'query', path: '' }, // Handled by agentic loop, not executor
    contextRelevance: ['intelligence'],
  },
];
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | grep intelligence.tools | head -5`
Expected: No errors from intelligence.tools.ts

- [ ] **Step 3: Commit**

```bash
git add src/lib/tools/domains/intelligence.tools.ts
git commit -m "feat: add searchSkills and loadReference core tool definitions"
```

---

### Task 6: Registry Enhancement — `getToolsByDomains()`

**Files:**
- Modify: `src/lib/tools/registry.ts`

- [ ] **Step 1: Add getToolsByDomains method**

Add after the existing `getToolsByDomain()` method (around line 145):

```typescript
  /**
   * Get tools from multiple domains at once.
   * Used by the skills system to load tool groups.
   */
  getToolsByDomains(domains: ToolDomain[]): AtomicTool[] {
    const tools: AtomicTool[] = [];
    const seen = new Set<string>();
    for (const domain of domains) {
      for (const tool of this.getToolsByDomain(domain)) {
        if (!seen.has(tool.name)) {
          tools.push(tool);
          seen.add(tool.name);
        }
      }
    }
    return tools;
  }
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep registry | head -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/tools/registry.ts
git commit -m "feat: add getToolsByDomains method to tool registry"
```

---

## Chunk 2: Chat API Route Rewrite

### Task 7: Agentic Loop (`src/lib/chat/agenticLoop.ts`)

This is the core of the rewrite. The agentic loop handles:
- Dynamic tool injection when searchSkills is called
- loadReference handling (returns reference text as tool result)
- Normal tool execution via existing executor
- Pending actions collection for write tools
- Reclassify attempt tracking

**Files:**
- Create: `src/lib/chat/agenticLoop.ts`
- Reference: `src/lib/tools/executor.ts`, `src/lib/chat/skills.ts`, `src/lib/chat/references.ts`

- [ ] **Step 1: Implement the agentic loop module**

```typescript
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
  pendingActions: Array<{ toolName: string; parameters: any; description: string }>;
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
          // Write tool — collect as pending action
          result.pendingActions.push({
            toolName: toolUse.name,
            parameters: injectContextIds(input, clientId, projectId),
            description: `${toolUse.name}: ${JSON.stringify(input).slice(0, 200)}`,
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

    // Reset content for next iteration (append, don't replace)
    result.content = '';
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
      return formatClientReference(
        { name: client?.name || 'Unknown', status: client?.status || 'unknown', type: client?.type || 'unknown' },
        intel
      );
    }
    case 'project_summary': {
      const project = await convexClient.query(api.projects.get, { id: entityId as any });
      const intel = await convexClient.query(api.intelligence.getProjectIntelligence, { projectId: entityId as any });
      return formatProjectReference(
        { name: project?.name || 'Unknown', status: project?.status || 'unknown' },
        intel
      );
    }
    case 'document_list': {
      const docs = await convexClient.query(api.documents.list, { projectId: entityId as any });
      return formatDocumentListReference(docs || []);
    }
    case 'contact_list': {
      const contacts = await convexClient.query(api.contacts.list, { clientId: entityId as any });
      return formatContactListReference(contacts || []);
    }
    case 'note_list': {
      const notes = await convexClient.query(api.notes.list, { clientId: entityId as any });
      return formatNoteListReference(notes || []);
    }
    case 'document_summary': {
      const doc = await convexClient.query(api.documents.get, { id: entityId as any });
      if (!doc) return 'Document not found.';
      return `Document: ${doc.fileName}\nCategory: ${doc.category || 'Uncategorized'}\nStatus: ${doc.status || 'unknown'}\n${doc.summary || 'No summary available.'}`;
    }
    case 'knowledge_bank': {
      const entries = await convexClient.query(api.knowledgeBank.list, { clientId: entityId as any });
      if (!entries || entries.length === 0) return 'No knowledge bank entries.';
      return entries.slice(0, 10).map((e: any) => `- ${e.title || e.category}: ${e.content?.slice(0, 150) || ''}`).join('\n');
    }
    default:
      return `Unknown reference type: ${type}`;
  }
}
```

- [ ] **Step 2: Verify type checking**

Run: `npx tsc --noEmit 2>&1 | grep agenticLoop | head -10`
Expected: No errors (or only Convex API typing that resolves at build)

- [ ] **Step 3: Commit**

```bash
git add src/lib/chat/agenticLoop.ts
git commit -m "feat: implement skills-based agentic loop with dynamic tool injection"
```

---

### Task 8: Rewrite Chat API Route

**Files:**
- Modify: `src/app/api/chat-assistant/route.ts`

This is the big one. We replace the existing POST handler while keeping:
- Authentication flow
- Pending action execution flow (`handleActionExecution`)
- Chat title generation
- The response format (so the frontend doesn't break)

- [ ] **Step 1: Rewrite the POST handler**

Replace the body of the `POST` function. Keep the following from the existing file:
- Lines 1-23: Imports (add new imports)
- `handleActionExecution()` function (keep as-is)
- `generateChatTitle()` function (keep as-is)

**New imports to add at top:**
```typescript
import { buildSystemPromptBlocks } from '../../lib/chat/systemPrompt';
import { runAgenticLoop } from '../../lib/chat/agenticLoop';
import { parseMentions, stripMentionMarkup } from '../../lib/chat/mentionParser';
import { formatClientReference, formatProjectReference } from '../../lib/chat/references';
```

**Remove these functions entirely:**
- `buildIntelligenceSummary()` (lines 24-112)
- `gatherChatContext()` (lines 122-619)
- `restrictToolAccess()` (lines 628-791)
- `filterToolResults()` (lines 796-825)
- `buildChatSystemBlocks()` (lines 955-1039)

**New POST handler structure:**
```typescript
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth check (keep existing pattern)
    const authHeader = request.headers.get('authorization');
    // ... existing auth logic ...

    // 2. Parse request body (same structure as before)
    const body = await request.json();
    const {
      sessionId,
      message,
      clientId,
      projectId,
      conversationHistory,
      executeAction,
      actionId,
      fileMetadata,
      mentions, // NEW: Array<{ type, name, id }> from frontend
    } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    // 3. Handle action execution (keep existing)
    if (executeAction && actionId) {
      return handleActionExecution(actionId, convexClient);
    }

    // 4. Parse @ mentions from message
    const parsedMentions = mentions || (message ? parseMentions(message) : []);
    const cleanMessage = message ? stripMentionMarkup(message) : '';

    // 5. Build references from mentions + page context
    const references: string[] = [];
    for (const mention of parsedMentions) {
      if (mention.type === 'client') {
        const client = await convexClient.query(api.clients.get, { id: mention.id as any });
        const intel = await convexClient.query(api.intelligence.getClientIntelligence, { clientId: mention.id as any });
        references.push(formatClientReference(
          { name: client?.name || mention.name, status: client?.status || 'unknown', type: client?.type || 'unknown' },
          intel
        ));
      } else if (mention.type === 'project') {
        const project = await convexClient.query(api.projects.get, { id: mention.id as any });
        const intel = await convexClient.query(api.intelligence.getProjectIntelligence, { projectId: mention.id as any });
        references.push(formatProjectReference(
          { name: project?.name || mention.name, status: project?.status || 'unknown' },
          intel
        ));
        // Also load parent client reference for project mentions
        if (project?.clientId) {
          const parentClient = await convexClient.query(api.clients.get, { id: project.clientId });
          const parentIntel = await convexClient.query(api.intelligence.getClientIntelligence, { clientId: project.clientId });
          if (parentClient) {
            references.push(formatClientReference(
              { name: parentClient.name, status: parentClient.status, type: parentClient.type },
              parentIntel
            ));
          }
        }
      }
    }

    // If no mentions, inject page context reference
    if (references.length === 0 && (clientId || projectId)) {
      if (projectId) {
        const project = await convexClient.query(api.projects.get, { id: projectId as any });
        const intel = await convexClient.query(api.intelligence.getProjectIntelligence, { projectId: projectId as any });
        if (project) {
          references.push(formatProjectReference(
            { name: project.name, status: project.status },
            intel
          ));
        }
        if (project?.clientId) {
          const client = await convexClient.query(api.clients.get, { id: project.clientId });
          const clientIntel = await convexClient.query(api.intelligence.getClientIntelligence, { clientId: project.clientId });
          if (client) {
            references.push(formatClientReference(
              { name: client.name, status: client.status, type: client.type },
              clientIntel
            ));
          }
        }
      } else if (clientId) {
        const client = await convexClient.query(api.clients.get, { id: clientId as any });
        const intel = await convexClient.query(api.intelligence.getClientIntelligence, { clientId: clientId as any });
        if (client) {
          references.push(formatClientReference(
            { name: client.name, status: client.status, type: client.type },
            intel
          ));
        }
      }
    }

    // 6. Build system prompt
    const systemBlocks = buildSystemPromptBlocks({
      pageContext: clientId || projectId
        ? {
            type: projectId ? 'project' : 'client',
            clientId,
            projectId,
            clientName: clientId ? (await convexClient.query(api.clients.get, { id: clientId as any }))?.name : undefined,
            projectName: projectId ? (await convexClient.query(api.projects.get, { id: projectId as any }))?.name : undefined,
          }
        : undefined,
      references,
      currentDate: new Date().toISOString().split('T')[0],
    });

    // 7. Build messages array
    const messages: Anthropic.MessageParam[] = [];
    if (conversationHistory) {
      for (const msg of conversationHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add file context to message if present
    let userContent = cleanMessage || '';
    if (fileMetadata) {
      userContent = `[File uploaded: ${fileMetadata.fileName} (${fileMetadata.fileType}, ${Math.round(fileMetadata.fileSize / 1024)}KB, storageId: ${fileMetadata.fileStorageId})]\n\n${userContent || `Please analyze and file ${fileMetadata.fileName}.`}`;
    }
    if (userContent) {
      messages.push({ role: 'user', content: userContent });
    }

    // 8. Run the agentic loop
    const loopResult = await runAgenticLoop({
      sessionId,
      clientId,
      projectId,
      systemBlocks,
      messages,
      convexClient,
    });

    // 9. Generate title for first message
    if (conversationHistory?.length === 0 || !conversationHistory) {
      generateChatTitle(sessionId, cleanMessage, convexClient).catch(() => {});
    }

    // 10. Return response (same format as before)
    return NextResponse.json({
      content: loopResult.content,
      toolCalls: loopResult.toolCalls,
      activityLog: loopResult.activityLog,
      pendingActions: loopResult.pendingActions,
      tokensUsed: loopResult.tokensUsed,
      cacheMetrics: {
        ...loopResult.cacheMetrics,
        cacheHitRate: loopResult.cacheMetrics.cacheReadTokens > 0
          ? (loopResult.cacheMetrics.cacheReadTokens / (loopResult.cacheMetrics.cacheReadTokens + loopResult.cacheMetrics.uncachedInputTokens)) * 100
          : 0,
      },
      loadedSkills: loopResult.loadedSkills,
    });
  } catch (error) {
    console.error('[chat-assistant] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit 2>&1 | grep "route.ts" | head -10`
Expected: Minimal or no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat-assistant/route.ts
git commit -m "feat: rewrite chat API route with skills-based agentic loop"
```

---

## Chunk 3: Reclassify + @ Mentions + Briefing

### Task 9: Reclassify Tool Handler

**Files:**
- Create: `src/lib/chat/reclassify.ts`
- Modify: `src/lib/tools/executor.ts` — add reclassify handler
- Modify: `src/lib/tools/domains/document.tools.ts` — add reclassify tool definition

- [ ] **Step 1: Add reclassify tool definition to document tools**

Add to the end of the `DOCUMENT_TOOLS` array in `src/lib/tools/domains/document.tools.ts`:

```typescript
  {
    name: 'reclassify',
    domain: 'document',
    action: 'read', // Read action because it returns data; writes happen internally
    description: 'Deep-analyze a document to find specific information. Pulls raw document content and runs thorough extraction focused on your query. Automatically saves any new findings to intelligence. Use this when simpler methods (queryIntelligence, loadReference) cannot answer the question.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The Convex document ID to deep-analyze',
        },
        focusQuery: {
          type: 'string',
          description: 'What specific information to look for in the document',
        },
        projectId: {
          type: 'string',
          description: 'Project ID to save intelligence findings to',
        },
        clientId: {
          type: 'string',
          description: 'Client ID to save intelligence findings to',
        },
      },
      required: ['documentId', 'focusQuery'],
    },
    requiresConfirmation: false,
    convexMapping: { type: 'query', path: '' }, // Custom handler in executor
    contextRelevance: ['document', 'intelligence'],
  },
```

- [ ] **Step 2: Implement reclassify handler**

```typescript
// src/lib/chat/reclassify.ts
import Anthropic from '@anthropic-ai/sdk';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';

const anthropic = new Anthropic();

export interface ReclassifyResult {
  found: boolean;
  answer?: string;
  newFields: Array<{ fieldPath: string; label: string; value: string; confidence: number }>;
  evidence?: { page?: number; quote?: string };
  documentName: string;
}

/**
 * Deep-analyze a document to find specific information.
 * Downloads full document content, runs focused extraction,
 * and saves new findings to intelligence.
 */
export async function handleReclassify(
  params: {
    documentId: string;
    focusQuery: string;
    projectId?: string;
    clientId?: string;
  },
  convexClient: ConvexHttpClient
): Promise<ReclassifyResult> {
  // 1. Fetch document metadata
  const doc = await convexClient.query(api.documents.get, { id: params.documentId as any });
  if (!doc) throw new Error(`Document not found: ${params.documentId}`);

  // 2. Get document content (from storage or existing extracted text)
  let documentContent = '';
  if (doc.extractedText) {
    documentContent = doc.extractedText;
  } else if (doc.storageId) {
    // Fetch from Convex storage
    const url = await convexClient.query(api.documents.getUrl, { storageId: doc.storageId });
    if (url) {
      const response = await fetch(url);
      documentContent = await response.text();
    }
  }

  if (!documentContent || documentContent.length < 10) {
    return {
      found: false,
      answer: undefined,
      newFields: [],
      documentName: doc.fileName || 'Unknown',
    };
  }

  // 3. Get current intelligence state (to avoid re-extracting known fields)
  let currentIntel: any = {};
  if (params.projectId) {
    currentIntel = await convexClient.query(api.intelligence.getProjectIntelligence, {
      projectId: params.projectId as any,
    }) || {};
  } else if (params.clientId) {
    currentIntel = await convexClient.query(api.intelligence.getClientIntelligence, {
      clientId: params.clientId as any,
    }) || {};
  }

  // 4. Run deep extraction focused on the query
  const extractionResponse = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are analyzing a document to find specific information and extract any other useful data points.

FOCUS QUERY: ${params.focusQuery}

DOCUMENT: ${doc.fileName}
CONTENT:
${documentContent}

ALREADY KNOWN (do not re-extract these):
${JSON.stringify(summarizeIntel(currentIntel), null, 2)}

Instructions:
1. First, try to answer the focus query. If found, provide the exact answer with page/section reference.
2. Then, extract ANY other useful data points you can find that are NOT already known.
3. For each new data point, provide: field path, label, value, confidence (0-1), and source quote.

Respond in this exact JSON format:
{
  "focusAnswer": "the specific answer or null if not found",
  "focusEvidence": { "page": null, "quote": "exact quote from doc" },
  "newFields": [
    { "fieldPath": "financials.loanAmount", "label": "Loan Amount", "value": "2400000", "confidence": 0.95, "sourceText": "quote" }
  ]
}`,
    }],
  });

  // 5. Parse response
  const textBlock = extractionResponse.content.find((b) => b.type === 'text');
  let parsed: any = {};
  try {
    const jsonStr = textBlock?.text?.match(/\{[\s\S]*\}/)?.[0] || '{}';
    parsed = JSON.parse(jsonStr);
  } catch {
    parsed = { focusAnswer: null, newFields: [] };
  }

  // 6. Save new fields to intelligence
  const savedFields: ReclassifyResult['newFields'] = [];
  if (parsed.newFields && Array.isArray(parsed.newFields)) {
    for (const field of parsed.newFields) {
      try {
        if (params.projectId || params.clientId) {
          await convexClient.mutation(api.intelligence.addKnowledgeItem, {
            ...(params.clientId ? { clientId: params.clientId as any } : {}),
            ...(params.projectId ? { projectId: params.projectId as any } : {}),
            fieldPath: field.fieldPath,
            category: field.fieldPath.split('.')[0] || 'other',
            label: field.label,
            value: String(field.value),
            valueType: 'string',
            sourceText: field.sourceText || '',
            sourceDocumentId: params.documentId as any,
            confidence: field.confidence || 0.8,
            extractedBy: 'chat-reclassify',
          });
          savedFields.push({
            fieldPath: field.fieldPath,
            label: field.label,
            value: String(field.value),
            confidence: field.confidence || 0.8,
          });
        }
      } catch (e) {
        // Skip individual field save errors
        console.warn(`[reclassify] Failed to save field ${field.fieldPath}:`, e);
      }
    }
  }

  return {
    found: !!parsed.focusAnswer,
    answer: parsed.focusAnswer || undefined,
    newFields: savedFields,
    evidence: parsed.focusEvidence || undefined,
    documentName: doc.fileName || 'Unknown',
  };
}

function summarizeIntel(intel: any): Record<string, any> {
  const summary: Record<string, any> = {};
  const skip = new Set(['_id', '_creationTime', 'clientId', 'projectId', 'clientType', 'lastUpdated', 'lastUpdatedBy', 'version']);
  for (const [key, value] of Object.entries(intel)) {
    if (skip.has(key)) continue;
    if (value && typeof value === 'object') {
      const filled = Object.entries(value as Record<string, any>)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${k}: ${v}`);
      if (filled.length > 0) summary[key] = filled.join(', ');
    }
  }
  return summary;
}
```

- [ ] **Step 3: Add reclassify handler to executor**

Add to the `handlers` object in `src/lib/tools/executor.ts`:

```typescript
  // Deep reclassify — handled by dedicated module
  reclassify: async (params, client) => {
    const { handleReclassify } = await import('../chat/reclassify');
    const result = await handleReclassify(params as any, client);
    const lines: string[] = [];
    if (result.found) {
      lines.push(`Found: ${result.answer}`);
      if (result.evidence?.quote) lines.push(`Source: "${result.evidence.quote}"`);
    } else {
      lines.push(`Did not find the specific answer in ${result.documentName}.`);
    }
    if (result.newFields.length > 0) {
      lines.push(`\nExtracted ${result.newFields.length} new data points saved to intelligence:`);
      for (const f of result.newFields) {
        lines.push(`- ${f.label}: ${f.value} (${Math.round(f.confidence * 100)}% confidence)`);
      }
    }
    return lines.join('\n');
  },
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/chat/reclassify.ts src/lib/tools/executor.ts src/lib/tools/domains/document.tools.ts
git commit -m "feat: add reclassify tool for deep document analysis with intelligence saving"
```

---

### Task 10: @ Mention Autocomplete Component

**Files:**
- Create: `src/components/MentionAutocomplete.tsx`
- Modify: `src/components/ChatInput.tsx`

- [ ] **Step 1: Create MentionAutocomplete component**

```typescript
// src/components/MentionAutocomplete.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Building2, FolderKanban } from 'lucide-react';

interface MentionAutocompleteProps {
  query: string;
  onSelect: (mention: { type: 'client' | 'project'; name: string; id: string }) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

export default function MentionAutocomplete({
  query,
  onSelect,
  onClose,
  position,
}: MentionAutocompleteProps) {
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter by query
  const q = query.toLowerCase();
  const filteredClients = (clients || [])
    .filter((c) => c.name?.toLowerCase().includes(q))
    .slice(0, 5)
    .map((c) => ({ type: 'client' as const, name: c.name, id: c._id }));

  const filteredProjects = (projects || [])
    .filter((p) => p.name?.toLowerCase().includes(q))
    .slice(0, 5)
    .map((p) => ({ type: 'project' as const, name: p.name, id: p._id }));

  const items = [...filteredClients, ...filteredProjects];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (items[selectedIndex]) {
          onSelect(items[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, onSelect, onClose]);

  if (items.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-60 overflow-y-auto w-64"
      style={{ bottom: position.top, left: position.left }}
    >
      {items.map((item, i) => (
        <button
          key={`${item.type}-${item.id}`}
          className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
            i === selectedIndex ? 'bg-zinc-100 dark:bg-zinc-800' : ''
          }`}
          onClick={() => onSelect(item)}
        >
          {item.type === 'client' ? (
            <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
          ) : (
            <FolderKanban className="w-4 h-4 text-green-500 shrink-0" />
          )}
          <span className="truncate">{item.name}</span>
          <span className="text-xs text-zinc-400 ml-auto shrink-0">
            {item.type}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite ChatInput with @ mention support**

Rewrite `src/components/ChatInput.tsx` to detect `@` and show the autocomplete:

Key changes:
- Track cursor position in textarea
- When `@` is typed, capture text after `@` as mention query
- Show `MentionAutocomplete` positioned near cursor
- On selection: insert `@[Name](type:id)` markup into message
- Display mentions as styled chips

```typescript
// Add to ChatInput.tsx imports
import { useState, useRef, useCallback } from 'react';
import MentionAutocomplete from './MentionAutocomplete';

// Add state inside component:
const [mentionQuery, setMentionQuery] = useState<string | null>(null);
const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
const textareaRef = useRef<HTMLTextAreaElement>(null);

// Add mention detection to onChange handler:
const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
  const value = e.target.value;
  const cursorPos = e.target.selectionStart;
  setText(value);

  // Detect @ mention
  const textBeforeCursor = value.slice(0, cursorPos);
  const atMatch = textBeforeCursor.match(/@(\w*)$/);
  if (atMatch) {
    setMentionQuery(atMatch[1]);
    // Position autocomplete above textarea
    setMentionPosition({ top: 40, left: 12 });
  } else {
    setMentionQuery(null);
  }
}, []);

// Handle mention selection:
const handleMentionSelect = useCallback((mention: { type: 'client' | 'project'; name: string; id: string }) => {
  const textarea = textareaRef.current;
  if (!textarea) return;

  const cursorPos = textarea.selectionStart;
  const textBeforeCursor = text.slice(0, cursorPos);
  const textAfterCursor = text.slice(cursorPos);

  // Replace @query with markup
  const atIndex = textBeforeCursor.lastIndexOf('@');
  const before = textBeforeCursor.slice(0, atIndex);
  const markup = `@[${mention.name}](${mention.type}:${mention.id})`;
  const newText = before + markup + ' ' + textAfterCursor;

  setText(newText);
  setMentionQuery(null);

  // Focus and set cursor after mention
  setTimeout(() => {
    textarea.focus();
    const newPos = before.length + markup.length + 1;
    textarea.setSelectionRange(newPos, newPos);
  }, 0);
}, [text]);

// In render, add autocomplete dropdown:
// {mentionQuery !== null && (
//   <MentionAutocomplete
//     query={mentionQuery}
//     onSelect={handleMentionSelect}
//     onClose={() => setMentionQuery(null)}
//     position={mentionPosition}
//   />
// )}
```

The full file rewrite should preserve existing file upload functionality while adding the mention system.

- [ ] **Step 3: Commit**

```bash
git add src/components/MentionAutocomplete.tsx src/components/ChatInput.tsx
git commit -m "feat: add @ mention autocomplete system for client/project scoping"
```

---

### Task 11: Proactive Briefing Component

**Files:**
- Create: `src/components/ChatBriefing.tsx`
- Modify: `src/components/ChatAssistantDrawer.tsx`

- [ ] **Step 1: Create ChatBriefing component**

```typescript
// src/components/ChatBriefing.tsx
'use client';

import { AlertTriangle, TrendingUp, CircleDot } from 'lucide-react';

export interface BriefingItem {
  type: 'update' | 'warning' | 'missing';
  text: string;
  action?: string; // Pre-fill text for chat input
}

interface ChatBriefingProps {
  items: BriefingItem[];
  entityName: string;
  entityType: 'client' | 'project';
  onAskAbout: (text: string) => void;
}

export default function ChatBriefing({ items, entityName, entityType, onAskAbout }: ChatBriefingProps) {
  if (items.length === 0) return null;

  const icons = {
    update: <TrendingUp className="w-3.5 h-3.5 text-blue-500" />,
    warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
    missing: <CircleDot className="w-3.5 h-3.5 text-zinc-400" />,
  };

  return (
    <div className="mx-3 mb-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="text-xs font-medium text-zinc-500 mb-2">
        {entityType === 'client' ? 'Client' : 'Project'}: {entityName}
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <button
            key={i}
            className="w-full text-left flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
            onClick={() => onAskAbout(item.action || `Tell me about: ${item.text}`)}
          >
            {icons[item.type]}
            <span>{item.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Generate briefing items from intelligence data.
 * This runs client-side — no API call needed.
 */
export function generateBriefingItems(intel: any): BriefingItem[] {
  if (!intel) return [];
  const items: BriefingItem[] = [];

  // Count filled fields
  let filledCount = 0;
  let totalFields = 0;
  const skip = new Set(['_id', '_creationTime', 'clientId', 'projectId', 'clientType', 'lastUpdated', 'lastUpdatedBy', 'version', 'extractedAttributes']);
  for (const [key, value] of Object.entries(intel)) {
    if (skip.has(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, any>);
      totalFields += entries.length;
      filledCount += entries.filter(([, v]) => v != null && v !== '').length;
    }
  }

  if (totalFields > 0) {
    const pct = Math.round((filledCount / totalFields) * 100);
    items.push({
      type: 'update',
      text: `${filledCount}/${totalFields} fields filled (${pct}%)`,
      action: 'What key fields are still missing?',
    });
  }

  // Check for missing critical financials
  const fin = intel.financials || {};
  const missingFinancials: string[] = [];
  if (!fin.loanAmount) missingFinancials.push('Loan Amount');
  if (!fin.ltv) missingFinancials.push('LTV');
  if (!fin.grossDevelopmentValue) missingFinancials.push('GDV');
  if (missingFinancials.length > 0) {
    items.push({
      type: 'missing',
      text: `Missing: ${missingFinancials.join(', ')}`,
      action: `Can you find the ${missingFinancials[0]} in the documents?`,
    });
  }

  return items;
}
```

- [ ] **Step 2: Add briefing to ChatAssistantDrawer**

In `src/components/ChatAssistantDrawer.tsx`, add:

1. Import `ChatBriefing` and `generateBriefingItems`
2. Query intelligence data for current context
3. Generate briefing items
4. Render `<ChatBriefing>` above the message list
5. Wire `onAskAbout` to pre-fill the chat input

Key additions:
```typescript
// Add imports
import ChatBriefing, { generateBriefingItems } from './ChatBriefing';

// Add intelligence query (near existing queries)
const clientIntel = useQuery(
  api.intelligence.getClientIntelligence,
  contextClientId ? { clientId: contextClientId } : 'skip'
);
const projectIntel = useQuery(
  api.intelligence.getProjectIntelligence,
  contextProjectId ? { projectId: contextProjectId } : 'skip'
);

// Generate briefing
const briefingItems = useMemo(() => {
  const intel = contextProjectId ? projectIntel : clientIntel;
  return generateBriefingItems(intel);
}, [clientIntel, projectIntel, contextProjectId]);

// In render, before message list:
// <ChatBriefing
//   items={briefingItems}
//   entityName={contextProjectId ? projectName : clientName}
//   entityType={contextProjectId ? 'project' : 'client'}
//   onAskAbout={(text) => { /* pre-fill input */ }}
// />
```

Also update the `handleSendMessage` function to pass `mentions` metadata to the API.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatBriefing.tsx src/components/ChatAssistantDrawer.tsx
git commit -m "feat: add proactive briefing and wire @ mentions to API"
```

---

## Chunk 4: Integration, Testing & Build

### Task 12: Convex Schema Update

**Files:**
- Modify: `convex/chatSessions.ts`

- [ ] **Step 1: Add mentions field to chat session**

In the `create` mutation args, add optional mentions field. In the `update` mutation, allow updating mentions.

```typescript
// In create mutation args, add:
mentions: v.optional(v.array(v.object({
  type: v.union(v.literal("client"), v.literal("project")),
  name: v.string(),
  id: v.string(),
}))),

// In handler, pass to insert:
mentions: args.mentions,
```

- [ ] **Step 2: Run Convex codegen**

Run: `npx convex codegen`
Expected: Types regenerated successfully

- [ ] **Step 3: Commit**

```bash
git add convex/chatSessions.ts
git commit -m "feat: add mentions field to chat session schema"
```

---

### Task 13: Convex Support — addKnowledgeItem Mutation

The reclassify tool needs to save extracted fields. Check if `addKnowledgeItem` mutation exists in `convex/intelligence.ts`, and if not, add it.

**Files:**
- Check/Modify: `convex/intelligence.ts`

- [ ] **Step 1: Verify addKnowledgeItem exists**

Run: `grep -n 'addKnowledgeItem' convex/intelligence.ts`
If not found, add:

```typescript
export const addKnowledgeItem = mutation({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    fieldPath: v.string(),
    category: v.string(),
    label: v.string(),
    value: v.string(),
    valueType: v.string(),
    sourceText: v.optional(v.string()),
    sourceDocumentId: v.optional(v.id("documents")),
    confidence: v.optional(v.float64()),
    extractedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Save to extractedAttributes on the intelligence record
    if (args.projectId) {
      const intel = await ctx.db
        .query("projectIntelligence")
        .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId!))
        .unique();
      if (intel) {
        const attrs = intel.extractedAttributes || {};
        attrs[args.label] = {
          value: args.value,
          confidence: args.confidence || 0.8,
          source: args.sourceDocumentId || 'chat-reclassify',
          sourceText: args.sourceText || '',
          extractedBy: args.extractedBy || 'chat',
          extractedAt: new Date().toISOString(),
        };
        await ctx.db.patch(intel._id, {
          extractedAttributes: attrs,
          lastUpdated: new Date().toISOString(),
        });
      }
    } else if (args.clientId) {
      const intel = await ctx.db
        .query("clientIntelligence")
        .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId!))
        .unique();
      if (intel) {
        const attrs = intel.extractedAttributes || {};
        attrs[args.label] = {
          value: args.value,
          confidence: args.confidence || 0.8,
          source: args.sourceDocumentId || 'chat-reclassify',
          sourceText: args.sourceText || '',
          extractedBy: args.extractedBy || 'chat',
          extractedAt: new Date().toISOString(),
        };
        await ctx.db.patch(intel._id, {
          extractedAttributes: attrs,
          lastUpdated: new Date().toISOString(),
        });
      }
    }
  },
});
```

- [ ] **Step 2: Run Convex codegen**

Run: `npx convex codegen`

- [ ] **Step 3: Commit**

```bash
git add convex/intelligence.ts
git commit -m "feat: add addKnowledgeItem mutation for reclassify intelligence saving"
```

---

### Task 14: Integration Test

**Files:**
- Create: `src/__tests__/agenticLoop.test.ts`

- [ ] **Step 1: Write integration tests for the agentic loop logic**

Test the tool injection logic without actual API calls (mock Anthropic client):

```typescript
// src/__tests__/agenticLoop.test.ts
import { describe, it, expect } from 'vitest';
import { resolveSkillSearch, getSkillTools } from '../lib/chat/skills';
import { formatClientReference, formatProjectReference } from '../lib/chat/references';
import { parseMentions, stripMentionMarkup } from '../lib/chat/mentionParser';
import { buildSystemPromptBlocks } from '../lib/chat/systemPrompt';

describe('Integration: Skills + References + System Prompt', () => {
  it('system prompt includes skill catalog', () => {
    const blocks = buildSystemPromptBlocks({});
    const instructionBlock = blocks[0].text;
    expect(instructionBlock).toContain('searchSkills');
    expect(instructionBlock).toContain('documents');
    expect(instructionBlock).toContain('Resolution Chain');
  });

  it('system prompt includes references when provided', () => {
    const blocks = buildSystemPromptBlocks({
      references: ['### Test Client\nStatus: Active'],
    });
    expect(blocks[1].text).toContain('Test Client');
    expect(blocks[1].text).toContain('References');
  });

  it('end-to-end: mention → parse → reference → system prompt', () => {
    const message = 'What is @[Acme](client:abc123) address?';
    const mentions = parseMentions(message);
    expect(mentions[0].name).toBe('Acme');

    const ref = formatClientReference(
      { name: 'Acme', status: 'active', type: 'borrower' },
      { identity: { legalName: 'Acme Ltd' }, addresses: { registered: '123 Main St' } }
    );
    expect(ref).toContain('123 Main St');

    const blocks = buildSystemPromptBlocks({ references: [ref] });
    expect(blocks[1].text).toContain('123 Main St');
  });

  it('skill search returns tools that can be formatted for Anthropic', () => {
    const skills = resolveSkillSearch('documents');
    expect(skills).toContain('documents');

    const tools = getSkillTools('documents');
    expect(tools.length).toBeGreaterThan(0);

    // Verify tools have required Anthropic fields
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
    }
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run src/__tests__/skills.test.ts src/__tests__/references.test.ts src/__tests__/mentionParser.test.ts src/__tests__/agenticLoop.test.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/agenticLoop.test.ts
git commit -m "test: add integration tests for skills-based chat architecture"
```

---

### Task 15: Build Verification & Final Commit

**Files:** All modified files

- [ ] **Step 1: Run Next.js build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 2: Fix any build errors**

If build fails, fix type errors, missing imports, or other issues.

- [ ] **Step 3: Run all tests one final time**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Final commit and push**

```bash
git add -A
git commit -m "feat: complete chat agent rework — skills-based architecture with @ mentions and reclassify"
git push
```

---

## Summary

| Chunk | Tasks | Key Deliverable |
|-------|-------|----------------|
| 1: Backend Foundation | Tasks 1-6 | Skills catalog, references, system prompt, mention parser, core tool defs |
| 2: Chat API Rewrite | Tasks 7-8 | Agentic loop with dynamic tool injection, route handler rewrite |
| 3: Reclassify + Frontend | Tasks 9-11 | Deep reclassify tool, @ mention autocomplete, proactive briefing |
| 4: Integration | Tasks 12-15 | Convex schema, addKnowledgeItem, integration tests, build |

**Total new files:** 12
**Total modified files:** 6
**Estimated token reduction:** 93% for simple queries (42K → ~3K)
