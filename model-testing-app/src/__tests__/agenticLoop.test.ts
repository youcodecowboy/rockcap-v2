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
