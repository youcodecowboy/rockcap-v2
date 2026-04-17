import { describe, it, expect } from 'vitest';
import { normalizeCompanyName, dedupeAssociationIds, extractRootDomain } from '../normalize';

describe('normalizeCompanyName', () => {
  it('lowercases and strips legal suffixes', () => {
    expect(normalizeCompanyName('Funding 365 Ltd')).toBe('funding 365');
    expect(normalizeCompanyName('BAYFIELD HOMES LIMITED')).toBe('bayfield homes');
    expect(normalizeCompanyName('Apollo House Partners LLC')).toBe('apollo house');
  });

  it('strips punctuation and collapses whitespace', () => {
    expect(normalizeCompanyName('Smith, Jones & Co.')).toBe('smith jones');
    expect(normalizeCompanyName('  ACME   Services  ')).toBe('acme');
  });

  it('handles empty and undefined input', () => {
    expect(normalizeCompanyName(undefined)).toBe('');
    expect(normalizeCompanyName(null)).toBe('');
    expect(normalizeCompanyName('')).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeCompanyName('Bayfield Homes Ltd');
    const twice = normalizeCompanyName(once);
    expect(twice).toBe(once);
  });
});

describe('dedupeAssociationIds', () => {
  it('removes exact-duplicate IDs from HubSpot dual-association response', () => {
    const input = [{ id: '123' }, { id: '456' }, { id: '123' }];
    expect(dedupeAssociationIds(input)).toEqual(['123', '456']);
  });

  it('handles empty array', () => {
    expect(dedupeAssociationIds([])).toEqual([]);
  });

  it('preserves first-occurrence order', () => {
    const input = [{ id: 'c' }, { id: 'a' }, { id: 'b' }, { id: 'a' }];
    expect(dedupeAssociationIds(input)).toEqual(['c', 'a', 'b']);
  });
});

describe('extractRootDomain', () => {
  it('strips protocol and www', () => {
    expect(extractRootDomain('https://www.bayfieldhomes.co.uk/about')).toBe('bayfieldhomes.co.uk');
  });

  it('extracts domain from email', () => {
    expect(extractRootDomain('steve@rushmon.co.uk')).toBe('rushmon.co.uk');
  });

  it('handles bare domains', () => {
    expect(extractRootDomain('talbothomes.co.uk')).toBe('talbothomes.co.uk');
  });

  it('returns null for invalid input', () => {
    expect(extractRootDomain(undefined)).toBeNull();
    expect(extractRootDomain('')).toBeNull();
    expect(extractRootDomain('not a url')).toBeNull();
  });
});
