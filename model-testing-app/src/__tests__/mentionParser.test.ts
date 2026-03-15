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
