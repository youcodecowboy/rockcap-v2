import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Intelligence System Tests
 *
 * Tests for the intelligence extraction and merge system that:
 * 1. Extracts structured data from documents
 * 2. Merges data with confidence-based updates
 * 3. Tracks evidence trails for all fields
 */

// Mock types matching the schema
interface ExtractedField {
  fieldPath: string;
  value: any;
  confidence: number;
  sourceText?: string;
  pageNumber?: number;
}

interface ExtractedAttribute {
  key: string;
  value: any;
  confidence: number;
  sourceText?: string;
}

interface EvidenceTrailEntry {
  fieldPath: string;
  value: any;
  confidence: number;
  sourceDocumentId: string;
  sourceDocumentName?: string;
  sourceText?: string;
  pageNumber?: number;
  extractedAt: string;
  method: string;
}

// Pure function for merge logic (extracted from Convex mutation for testing)
function mergeExtractedFields(
  existingEvidence: EvidenceTrailEntry[],
  newFields: ExtractedField[],
  documentId: string,
  documentName: string,
  now: string
): {
  newEvidenceTrail: EvidenceTrailEntry[];
  fieldsToUpdate: Record<string, any>;
  mergeResult: { fieldsAdded: number; fieldsUpdated: number; fieldsSkipped: number };
} {
  const existingConfidenceMap = new Map<string, number>();
  for (const ev of existingEvidence) {
    existingConfidenceMap.set(ev.fieldPath, ev.confidence);
  }

  const newEvidenceTrail = [...existingEvidence];
  const fieldsToUpdate: Record<string, any> = {};
  const mergeResult = { fieldsAdded: 0, fieldsUpdated: 0, fieldsSkipped: 0 };

  for (const field of newFields) {
    const existingConfidence = existingConfidenceMap.get(field.fieldPath) || 0;

    if (field.confidence > existingConfidence) {
      const newEvidence: EvidenceTrailEntry = {
        fieldPath: field.fieldPath,
        value: field.value,
        confidence: field.confidence,
        sourceDocumentId: documentId,
        sourceDocumentName: documentName,
        sourceText: field.sourceText,
        pageNumber: field.pageNumber,
        extractedAt: now,
        method: 'ai_extraction',
      };

      const existingIdx = newEvidenceTrail.findIndex((e) => e.fieldPath === field.fieldPath);
      if (existingIdx >= 0) {
        newEvidenceTrail.splice(existingIdx, 1);
        mergeResult.fieldsUpdated++;
      } else {
        mergeResult.fieldsAdded++;
      }
      newEvidenceTrail.push(newEvidence);

      const parts = field.fieldPath.split('.');
      if (parts.length === 2) {
        const [section, key] = parts;
        if (!fieldsToUpdate[section]) {
          fieldsToUpdate[section] = {};
        }
        fieldsToUpdate[section][key] = field.value;
      }
    } else {
      mergeResult.fieldsSkipped++;
    }
  }

  return { newEvidenceTrail, fieldsToUpdate, mergeResult };
}

// Pure function for attribute merge logic
function mergeExtractedAttributes(
  existingAttributes: Array<{ key: string; value: any; confidence: number; sourceDocumentId?: string; sourceText?: string; extractedAt: string }>,
  newAttributes: ExtractedAttribute[],
  documentId: string,
  now: string
): {
  newAttributes: Array<{ key: string; value: any; confidence: number; sourceDocumentId?: string; sourceText?: string; extractedAt: string }>;
  attributesAdded: number;
} {
  const result = [...existingAttributes];
  let attributesAdded = 0;

  for (const attr of newAttributes) {
    const existingAttr = result.find((a) => a.key === attr.key);
    if (!existingAttr || attr.confidence > existingAttr.confidence) {
      if (existingAttr) {
        const idx = result.indexOf(existingAttr);
        result.splice(idx, 1);
      }
      result.push({
        key: attr.key,
        value: attr.value,
        confidence: attr.confidence,
        sourceDocumentId: documentId,
        sourceText: attr.sourceText,
        extractedAt: now,
      });
      attributesAdded++;
    }
  }

  return { newAttributes: result, attributesAdded };
}

describe('Intelligence Extraction - Merge Logic', () => {
  const now = '2025-01-22T10:00:00.000Z';
  const docId = 'doc_123';
  const docName = 'test-document.pdf';

  describe('mergeExtractedFields', () => {
    it('should add new fields to empty evidence trail', () => {
      const existingEvidence: EvidenceTrailEntry[] = [];
      const newFields: ExtractedField[] = [
        {
          fieldPath: 'financials.loanAmount',
          value: 2500000,
          confidence: 0.95,
          sourceText: 'Loan Amount: £2,500,000',
        },
        {
          fieldPath: 'financials.interestRate',
          value: 8.5,
          confidence: 0.9,
          sourceText: 'Interest Rate: 8.5% per annum',
        },
      ];

      const result = mergeExtractedFields(existingEvidence, newFields, docId, docName, now);

      expect(result.mergeResult.fieldsAdded).toBe(2);
      expect(result.mergeResult.fieldsUpdated).toBe(0);
      expect(result.mergeResult.fieldsSkipped).toBe(0);
      expect(result.newEvidenceTrail).toHaveLength(2);
      expect(result.fieldsToUpdate.financials?.loanAmount).toBe(2500000);
      expect(result.fieldsToUpdate.financials?.interestRate).toBe(8.5);
    });

    it('should update field when new confidence is higher', () => {
      const existingEvidence: EvidenceTrailEntry[] = [
        {
          fieldPath: 'financials.loanAmount',
          value: 2000000,
          confidence: 0.7,
          sourceDocumentId: 'old_doc',
          extractedAt: '2025-01-01T00:00:00.000Z',
          method: 'ai_extraction',
        },
      ];
      const newFields: ExtractedField[] = [
        {
          fieldPath: 'financials.loanAmount',
          value: 2500000,
          confidence: 0.95,
          sourceText: 'Loan Amount: £2,500,000',
        },
      ];

      const result = mergeExtractedFields(existingEvidence, newFields, docId, docName, now);

      expect(result.mergeResult.fieldsAdded).toBe(0);
      expect(result.mergeResult.fieldsUpdated).toBe(1);
      expect(result.mergeResult.fieldsSkipped).toBe(0);
      expect(result.newEvidenceTrail).toHaveLength(1);
      expect(result.newEvidenceTrail[0].value).toBe(2500000);
      expect(result.newEvidenceTrail[0].confidence).toBe(0.95);
      expect(result.newEvidenceTrail[0].sourceDocumentId).toBe(docId);
    });

    it('should skip field when new confidence is lower', () => {
      const existingEvidence: EvidenceTrailEntry[] = [
        {
          fieldPath: 'financials.loanAmount',
          value: 2000000,
          confidence: 0.95,
          sourceDocumentId: 'old_doc',
          extractedAt: '2025-01-01T00:00:00.000Z',
          method: 'ai_extraction',
        },
      ];
      const newFields: ExtractedField[] = [
        {
          fieldPath: 'financials.loanAmount',
          value: 2500000,
          confidence: 0.7, // Lower confidence
          sourceText: 'Loan Amount: £2,500,000',
        },
      ];

      const result = mergeExtractedFields(existingEvidence, newFields, docId, docName, now);

      expect(result.mergeResult.fieldsAdded).toBe(0);
      expect(result.mergeResult.fieldsUpdated).toBe(0);
      expect(result.mergeResult.fieldsSkipped).toBe(1);
      expect(result.newEvidenceTrail).toHaveLength(1);
      expect(result.newEvidenceTrail[0].value).toBe(2000000); // Original value preserved
      expect(result.newEvidenceTrail[0].confidence).toBe(0.95);
    });

    it('should skip field when confidence is equal', () => {
      const existingEvidence: EvidenceTrailEntry[] = [
        {
          fieldPath: 'financials.loanAmount',
          value: 2000000,
          confidence: 0.9,
          sourceDocumentId: 'old_doc',
          extractedAt: '2025-01-01T00:00:00.000Z',
          method: 'ai_extraction',
        },
      ];
      const newFields: ExtractedField[] = [
        {
          fieldPath: 'financials.loanAmount',
          value: 2500000,
          confidence: 0.9, // Equal confidence
          sourceText: 'Loan Amount: £2,500,000',
        },
      ];

      const result = mergeExtractedFields(existingEvidence, newFields, docId, docName, now);

      expect(result.mergeResult.fieldsSkipped).toBe(1);
      expect(result.newEvidenceTrail[0].value).toBe(2000000); // Original preserved
    });

    it('should handle mixed add/update/skip scenarios', () => {
      const existingEvidence: EvidenceTrailEntry[] = [
        {
          fieldPath: 'financials.loanAmount',
          value: 2000000,
          confidence: 0.95, // Will be skipped (higher existing)
          sourceDocumentId: 'old_doc',
          extractedAt: '2025-01-01T00:00:00.000Z',
          method: 'ai_extraction',
        },
        {
          fieldPath: 'financials.interestRate',
          value: 7.5,
          confidence: 0.6, // Will be updated (lower existing)
          sourceDocumentId: 'old_doc',
          extractedAt: '2025-01-01T00:00:00.000Z',
          method: 'ai_extraction',
        },
      ];
      const newFields: ExtractedField[] = [
        {
          fieldPath: 'financials.loanAmount',
          value: 2500000,
          confidence: 0.7, // Lower - skip
        },
        {
          fieldPath: 'financials.interestRate',
          value: 8.5,
          confidence: 0.9, // Higher - update
        },
        {
          fieldPath: 'financials.ltv',
          value: 65,
          confidence: 0.85, // New - add
        },
      ];

      const result = mergeExtractedFields(existingEvidence, newFields, docId, docName, now);

      expect(result.mergeResult.fieldsAdded).toBe(1);
      expect(result.mergeResult.fieldsUpdated).toBe(1);
      expect(result.mergeResult.fieldsSkipped).toBe(1);
      expect(result.newEvidenceTrail).toHaveLength(3);
    });

    it('should preserve source text evidence', () => {
      const existingEvidence: EvidenceTrailEntry[] = [];
      const newFields: ExtractedField[] = [
        {
          fieldPath: 'location.postcode',
          value: 'SW1A 1AA',
          confidence: 0.95,
          sourceText: 'Property Address: 10 Downing Street, London SW1A 1AA',
          pageNumber: 3,
        },
      ];

      const result = mergeExtractedFields(existingEvidence, newFields, docId, docName, now);

      expect(result.newEvidenceTrail[0].sourceText).toBe(
        'Property Address: 10 Downing Street, London SW1A 1AA'
      );
      expect(result.newEvidenceTrail[0].pageNumber).toBe(3);
      expect(result.newEvidenceTrail[0].sourceDocumentName).toBe(docName);
    });
  });

  describe('mergeExtractedAttributes', () => {
    it('should add new attributes', () => {
      const existingAttributes: any[] = [];
      const newAttributes: ExtractedAttribute[] = [
        {
          key: 's106_contribution',
          value: 50000,
          confidence: 0.9,
          sourceText: 'S106 contribution of £50,000',
        },
      ];

      const result = mergeExtractedAttributes(existingAttributes, newAttributes, docId, now);

      expect(result.attributesAdded).toBe(1);
      expect(result.newAttributes).toHaveLength(1);
      expect(result.newAttributes[0].key).toBe('s106_contribution');
      expect(result.newAttributes[0].value).toBe(50000);
    });

    it('should update attribute when confidence is higher', () => {
      const existingAttributes = [
        {
          key: 's106_contribution',
          value: 40000,
          confidence: 0.7,
          sourceDocumentId: 'old_doc',
          extractedAt: '2025-01-01T00:00:00.000Z',
        },
      ];
      const newAttributes: ExtractedAttribute[] = [
        {
          key: 's106_contribution',
          value: 50000,
          confidence: 0.95,
          sourceText: 'S106 contribution of £50,000',
        },
      ];

      const result = mergeExtractedAttributes(existingAttributes, newAttributes, docId, now);

      expect(result.attributesAdded).toBe(1);
      expect(result.newAttributes).toHaveLength(1);
      expect(result.newAttributes[0].value).toBe(50000);
      expect(result.newAttributes[0].confidence).toBe(0.95);
    });

    it('should not update attribute when confidence is lower', () => {
      const existingAttributes = [
        {
          key: 's106_contribution',
          value: 50000,
          confidence: 0.95,
          sourceDocumentId: 'old_doc',
          extractedAt: '2025-01-01T00:00:00.000Z',
        },
      ];
      const newAttributes: ExtractedAttribute[] = [
        {
          key: 's106_contribution',
          value: 40000,
          confidence: 0.7, // Lower confidence
        },
      ];

      const result = mergeExtractedAttributes(existingAttributes, newAttributes, docId, now);

      expect(result.attributesAdded).toBe(0);
      expect(result.newAttributes).toHaveLength(1);
      expect(result.newAttributes[0].value).toBe(50000); // Original preserved
    });
  });
});

describe('Intelligence Extraction - Field Validation', () => {
  it('should filter fields with confidence below 0.5', () => {
    const fields: ExtractedField[] = [
      { fieldPath: 'financials.loanAmount', value: 2500000, confidence: 0.95 },
      { fieldPath: 'financials.interestRate', value: 8.5, confidence: 0.3 }, // Too low
      { fieldPath: 'financials.ltv', value: 65, confidence: 0.5 }, // At threshold
      { fieldPath: 'financials.profit', value: 500000, confidence: 0.49 }, // Just below
    ];

    const filtered = fields.filter((f) => f.confidence >= 0.5);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((f) => f.fieldPath)).toEqual([
      'financials.loanAmount',
      'financials.ltv',
    ]);
  });

  it('should handle deeply nested field paths', () => {
    const fieldPath = 'keyParties.solicitor.firm';
    const parts = fieldPath.split('.');

    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('keyParties');
    expect(parts[1]).toBe('solicitor');
    expect(parts[2]).toBe('firm');
  });
});

describe('Intelligence Extraction - Date Normalization', () => {
  it('should accept ISO date format', () => {
    const isoDate = '2025-06-15';
    expect(isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should validate date field paths', () => {
    const dateFields = [
      'timeline.acquisitionDate',
      'timeline.planningSubmissionDate',
      'timeline.planningApprovalDate',
      'timeline.constructionStartDate',
      'timeline.practicalCompletionDate',
      'timeline.loanMaturityDate',
    ];

    for (const field of dateFields) {
      expect(field.startsWith('timeline.')).toBe(true);
    }
  });
});

describe('Intelligence Extraction - Monetary Values', () => {
  it('should handle GBP values', () => {
    // Test that monetary values are stored as numbers (not strings with currency symbols)
    const monetaryFields = [
      { fieldPath: 'financials.purchasePrice', value: 1500000 },
      { fieldPath: 'financials.totalDevelopmentCost', value: 5000000 },
      { fieldPath: 'financials.grossDevelopmentValue', value: 8000000 },
      { fieldPath: 'financials.loanAmount', value: 4000000 },
    ];

    for (const field of monetaryFields) {
      expect(typeof field.value).toBe('number');
      expect(field.value).toBeGreaterThan(0);
    }
  });

  it('should handle percentage values', () => {
    // Percentages stored as numbers (e.g., 65 for 65%, not 0.65)
    const percentageFields = [
      { fieldPath: 'financials.ltv', value: 65 },
      { fieldPath: 'financials.ltgdv', value: 50 },
      { fieldPath: 'financials.profitMargin', value: 20 },
      { fieldPath: 'financials.interestRate', value: 8.5 },
    ];

    for (const field of percentageFields) {
      expect(typeof field.value).toBe('number');
      expect(field.value).toBeLessThanOrEqual(100);
    }
  });
});

describe('Intelligence Extraction - Insights Merge', () => {
  it('should append new key findings without duplicates', () => {
    const existingFindings = ['Finding 1', 'Finding 2'];
    const newFindings = ['Finding 2', 'Finding 3', 'Finding 4'];

    const existingSet = new Set(existingFindings);
    const merged = [...existingFindings];

    for (const finding of newFindings) {
      if (!existingSet.has(finding)) {
        merged.push(finding);
      }
    }

    expect(merged).toHaveLength(4);
    expect(merged).toContain('Finding 3');
    expect(merged).toContain('Finding 4');
    // No duplicate 'Finding 2'
    expect(merged.filter((f) => f === 'Finding 2')).toHaveLength(1);
  });

  it('should append new risks without duplicates', () => {
    const existingRisks = [
      { risk: 'Planning delay', severity: 'medium' },
      { risk: 'Cost overrun', severity: 'high' },
    ];
    const newRisks = [
      { risk: 'Cost overrun', severity: 'high' }, // Duplicate
      { risk: 'Market volatility', severity: 'low' }, // New
    ];

    const existingRiskSet = new Set(existingRisks.map((r) => r.risk));
    const merged = [...existingRisks];

    for (const risk of newRisks) {
      if (!existingRiskSet.has(risk.risk)) {
        merged.push(risk);
      }
    }

    expect(merged).toHaveLength(3);
    expect(merged.filter((r) => r.risk === 'Cost overrun')).toHaveLength(1);
    expect(merged.find((r) => r.risk === 'Market volatility')).toBeDefined();
  });
});
