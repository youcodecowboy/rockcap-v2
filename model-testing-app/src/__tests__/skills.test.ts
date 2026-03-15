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
