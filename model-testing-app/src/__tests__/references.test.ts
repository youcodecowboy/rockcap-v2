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

describe('formatContactListReference', () => {
  it('formats contacts compactly', () => {
    const contacts = [
      { name: 'John Smith', role: 'Director', email: 'john@example.com' },
    ];
    const result = formatContactListReference(contacts);
    expect(result).toContain('John Smith');
    expect(result).toContain('Director');
  });

  it('returns message for empty contacts', () => {
    const result = formatContactListReference([]);
    expect(result).toContain('No contacts');
  });
});

describe('formatNoteListReference', () => {
  it('formats notes compactly', () => {
    const notes = [
      { title: 'Call with borrower', content: 'Discussed LTV requirements', createdAt: '2026-03-14T10:00:00Z' },
    ];
    const result = formatNoteListReference(notes);
    expect(result).toContain('Call with borrower');
    expect(result).toContain('2026-03-14');
  });

  it('returns message for empty notes', () => {
    const result = formatNoteListReference([]);
    expect(result).toContain('No notes');
  });
});
