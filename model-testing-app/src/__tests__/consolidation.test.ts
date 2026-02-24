/**
 * Consolidation Feature Tests (Sprint 4)
 *
 * Tests for the consolidation logic including:
 * - Duplicate detection
 * - Conflict detection
 * - Reclassification suggestions
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Types (matching the API route)
// ============================================================================

interface KnowledgeItemForConsolidation {
  _id: string;
  fieldPath: string;
  isCanonical: boolean;
  category: string;
  label: string;
  value: unknown;
  valueType: string;
  sourceType: string;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  status: string;
  addedAt: string;
}

interface DuplicateRecommendation {
  fieldPath: string;
  keepId: string;
  removeIds: string[];
  reason: string;
}

interface ConflictDetection {
  fieldPath: string;
  itemIds: string[];
  values: unknown[];
  description: string;
}

// ============================================================================
// Consolidation Logic (extracted from API route for testing)
// ============================================================================

/**
 * Detect duplicates: multiple items at the same field path
 */
function detectDuplicates(items: KnowledgeItemForConsolidation[]): DuplicateRecommendation[] {
  // Group items by field path
  const itemsByPath: Record<string, KnowledgeItemForConsolidation[]> = {};
  for (const item of items) {
    if (!itemsByPath[item.fieldPath]) {
      itemsByPath[item.fieldPath] = [];
    }
    itemsByPath[item.fieldPath].push(item);
  }

  const duplicates: DuplicateRecommendation[] = [];
  for (const [path, pathItems] of Object.entries(itemsByPath)) {
    if (pathItems.length > 1) {
      // Sort by preference: document source > ai_extraction > manual, then newer
      const sorted = [...pathItems].sort((a, b) => {
        const sourceOrder = { document: 0, ai_extraction: 1, data_library: 2, manual: 3, checklist: 4 };
        const aSource = sourceOrder[a.sourceType as keyof typeof sourceOrder] ?? 5;
        const bSource = sourceOrder[b.sourceType as keyof typeof sourceOrder] ?? 5;
        if (aSource !== bSource) return aSource - bSource;
        return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      });

      duplicates.push({
        fieldPath: path,
        keepId: sorted[0]._id,
        removeIds: sorted.slice(1).map(i => i._id),
        reason: `Keeping ${sorted[0].sourceType} source (${sorted[0].sourceDocumentName || 'manual entry'}) as it has higher priority. Removing ${sorted.length - 1} duplicate(s).`,
      });
    }
  }

  return duplicates;
}

/**
 * Detect conflicts: same field path but different values
 */
function detectConflicts(items: KnowledgeItemForConsolidation[]): ConflictDetection[] {
  // Group items by field path
  const itemsByPath: Record<string, KnowledgeItemForConsolidation[]> = {};
  for (const item of items) {
    if (!itemsByPath[item.fieldPath]) {
      itemsByPath[item.fieldPath] = [];
    }
    itemsByPath[item.fieldPath].push(item);
  }

  const conflicts: ConflictDetection[] = [];
  for (const [path, pathItems] of Object.entries(itemsByPath)) {
    if (pathItems.length > 1) {
      const uniqueValues = new Set(pathItems.map(i => JSON.stringify(i.value)));
      if (uniqueValues.size > 1) {
        conflicts.push({
          fieldPath: path,
          itemIds: pathItems.map(i => i._id),
          values: pathItems.map(i => i.value),
          description: `Field "${path}" has ${uniqueValues.size} different values from different sources.`,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Get custom items that might need reclassification
 */
function getCustomItemsForReclassification(items: KnowledgeItemForConsolidation[]): KnowledgeItemForConsolidation[] {
  return items.filter(i => !i.isCanonical && i.fieldPath.startsWith('custom.'));
}

// ============================================================================
// Tests
// ============================================================================

describe('Consolidation - Duplicate Detection', () => {
  it('should detect duplicates at same field path', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'contact.primaryName',
        isCanonical: true,
        category: 'contact',
        label: 'Primary Name',
        value: 'John Smith',
        valueType: 'string',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
      {
        _id: 'item2',
        fieldPath: 'contact.primaryName',
        isCanonical: true,
        category: 'contact',
        label: 'Primary Name',
        value: 'John Smith',
        valueType: 'string',
        sourceType: 'ai_extraction',
        sourceDocumentName: 'ID Document.pdf',
        status: 'active',
        addedAt: '2024-01-02T00:00:00Z',
      },
    ];

    const duplicates = detectDuplicates(items);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].fieldPath).toBe('contact.primaryName');
    expect(duplicates[0].keepId).toBe('item2'); // AI extraction preferred
    expect(duplicates[0].removeIds).toEqual(['item1']);
  });

  it('should prefer document source over ai_extraction', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'financials.gdv',
        isCanonical: true,
        category: 'financials',
        label: 'GDV',
        value: 15000000,
        valueType: 'currency',
        sourceType: 'document',
        sourceDocumentName: 'Valuation.pdf',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
      {
        _id: 'item2',
        fieldPath: 'financials.gdv',
        isCanonical: true,
        category: 'financials',
        label: 'GDV',
        value: 15000000,
        valueType: 'currency',
        sourceType: 'ai_extraction',
        sourceDocumentName: 'Appraisal.pdf',
        status: 'active',
        addedAt: '2024-01-02T00:00:00Z',
      },
    ];

    const duplicates = detectDuplicates(items);
    expect(duplicates[0].keepId).toBe('item1'); // Document source preferred
  });

  it('should prefer newer item when source types are equal', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'contact.email',
        isCanonical: true,
        category: 'contact',
        label: 'Email',
        value: 'old@example.com',
        valueType: 'string',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
      {
        _id: 'item2',
        fieldPath: 'contact.email',
        isCanonical: true,
        category: 'contact',
        label: 'Email',
        value: 'new@example.com',
        valueType: 'string',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-15T00:00:00Z',
      },
    ];

    const duplicates = detectDuplicates(items);
    expect(duplicates[0].keepId).toBe('item2'); // Newer item preferred
  });

  it('should not flag unique fields as duplicates', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'contact.primaryName',
        isCanonical: true,
        category: 'contact',
        label: 'Primary Name',
        value: 'John Smith',
        valueType: 'string',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
      {
        _id: 'item2',
        fieldPath: 'contact.email',
        isCanonical: true,
        category: 'contact',
        label: 'Email',
        value: 'john@example.com',
        valueType: 'string',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
    ];

    const duplicates = detectDuplicates(items);
    expect(duplicates).toHaveLength(0);
  });

  it('should handle multiple duplicates at same path', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'financials.loanAmount',
        isCanonical: true,
        category: 'financials',
        label: 'Loan Amount',
        value: 1000000,
        valueType: 'currency',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
      {
        _id: 'item2',
        fieldPath: 'financials.loanAmount',
        isCanonical: true,
        category: 'financials',
        label: 'Loan Amount',
        value: 1000000,
        valueType: 'currency',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-02T00:00:00Z',
      },
      {
        _id: 'item3',
        fieldPath: 'financials.loanAmount',
        isCanonical: true,
        category: 'financials',
        label: 'Loan Amount',
        value: 1000000,
        valueType: 'currency',
        sourceType: 'ai_extraction',
        sourceDocumentName: 'Term Sheet.pdf',
        status: 'active',
        addedAt: '2024-01-03T00:00:00Z',
      },
    ];

    const duplicates = detectDuplicates(items);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].keepId).toBe('item3'); // AI extraction preferred
    expect(duplicates[0].removeIds).toHaveLength(2);
    expect(duplicates[0].removeIds).toContain('item1');
    expect(duplicates[0].removeIds).toContain('item2');
  });
});

describe('Consolidation - Conflict Detection', () => {
  it('should detect conflicts when values differ', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'financials.gdv',
        isCanonical: true,
        category: 'financials',
        label: 'GDV',
        value: 15000000,
        valueType: 'currency',
        sourceType: 'ai_extraction',
        sourceDocumentName: 'Appraisal.pdf',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
      {
        _id: 'item2',
        fieldPath: 'financials.gdv',
        isCanonical: true,
        category: 'financials',
        label: 'GDV',
        value: 16500000,
        valueType: 'currency',
        sourceType: 'ai_extraction',
        sourceDocumentName: 'Valuation.pdf',
        status: 'active',
        addedAt: '2024-01-02T00:00:00Z',
      },
    ];

    const conflicts = detectConflicts(items);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].fieldPath).toBe('financials.gdv');
    expect(conflicts[0].values).toContain(15000000);
    expect(conflicts[0].values).toContain(16500000);
    expect(conflicts[0].description).toContain('2 different values');
  });

  it('should not flag as conflict when values are same', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'financials.gdv',
        isCanonical: true,
        category: 'financials',
        label: 'GDV',
        value: 15000000,
        valueType: 'currency',
        sourceType: 'ai_extraction',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
      {
        _id: 'item2',
        fieldPath: 'financials.gdv',
        isCanonical: true,
        category: 'financials',
        label: 'GDV',
        value: 15000000,
        valueType: 'currency',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-02T00:00:00Z',
      },
    ];

    const conflicts = detectConflicts(items);
    expect(conflicts).toHaveLength(0);
  });

  it('should handle multiple different values', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'timeline.planningStatus',
        isCanonical: true,
        category: 'timeline',
        label: 'Planning Status',
        value: 'Pending',
        valueType: 'string',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
      {
        _id: 'item2',
        fieldPath: 'timeline.planningStatus',
        isCanonical: true,
        category: 'timeline',
        label: 'Planning Status',
        value: 'Approved',
        valueType: 'string',
        sourceType: 'ai_extraction',
        status: 'active',
        addedAt: '2024-01-02T00:00:00Z',
      },
      {
        _id: 'item3',
        fieldPath: 'timeline.planningStatus',
        isCanonical: true,
        category: 'timeline',
        label: 'Planning Status',
        value: 'Appeal',
        valueType: 'string',
        sourceType: 'document',
        status: 'active',
        addedAt: '2024-01-03T00:00:00Z',
      },
    ];

    const conflicts = detectConflicts(items);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].description).toContain('3 different values');
  });

  it('should handle string value comparisons correctly', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'contact.primaryName',
        isCanonical: true,
        category: 'contact',
        label: 'Primary Name',
        value: 'John Smith',
        valueType: 'string',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
      {
        _id: 'item2',
        fieldPath: 'contact.primaryName',
        isCanonical: true,
        category: 'contact',
        label: 'Primary Name',
        value: 'John Smith', // Same value
        valueType: 'string',
        sourceType: 'ai_extraction',
        status: 'active',
        addedAt: '2024-01-02T00:00:00Z',
      },
    ];

    const conflicts = detectConflicts(items);
    expect(conflicts).toHaveLength(0); // Same value, no conflict
  });
});

describe('Consolidation - Reclassification', () => {
  it('should identify custom fields for reclassification', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'custom.contact.borrower_name',
        isCanonical: false,
        category: 'contact',
        label: 'Borrower Name',
        value: 'John Smith',
        valueType: 'string',
        sourceType: 'ai_extraction',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
      {
        _id: 'item2',
        fieldPath: 'contact.primaryName',
        isCanonical: true,
        category: 'contact',
        label: 'Primary Name',
        value: 'Jane Doe',
        valueType: 'string',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
    ];

    const customItems = getCustomItemsForReclassification(items);
    expect(customItems).toHaveLength(1);
    expect(customItems[0]._id).toBe('item1');
  });

  it('should not include canonical fields', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'contact.primaryName',
        isCanonical: true,
        category: 'contact',
        label: 'Primary Name',
        value: 'John Smith',
        valueType: 'string',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
    ];

    const customItems = getCustomItemsForReclassification(items);
    expect(customItems).toHaveLength(0);
  });

  it('should handle items with isCanonical false but non-custom path', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'contact.primaryName', // Not a custom.* path
        isCanonical: false, // Incorrectly marked
        category: 'contact',
        label: 'Primary Name',
        value: 'John Smith',
        valueType: 'string',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
    ];

    const customItems = getCustomItemsForReclassification(items);
    expect(customItems).toHaveLength(0); // Path doesn't start with custom.
  });
});

describe('Consolidation - Source Priority', () => {
  const createItem = (
    id: string,
    sourceType: string,
    addedAt: string
  ): KnowledgeItemForConsolidation => ({
    _id: id,
    fieldPath: 'financials.gdv',
    isCanonical: true,
    category: 'financials',
    label: 'GDV',
    value: 15000000,
    valueType: 'currency',
    sourceType,
    status: 'active',
    addedAt,
  });

  it('should prioritize document > ai_extraction > data_library > manual > checklist', () => {
    const items = [
      createItem('checklist', 'checklist', '2024-01-05T00:00:00Z'),
      createItem('manual', 'manual', '2024-01-04T00:00:00Z'),
      createItem('data_library', 'data_library', '2024-01-03T00:00:00Z'),
      createItem('ai_extraction', 'ai_extraction', '2024-01-02T00:00:00Z'),
      createItem('document', 'document', '2024-01-01T00:00:00Z'),
    ];

    const duplicates = detectDuplicates(items);
    expect(duplicates[0].keepId).toBe('document');
  });

  it('should use date as tiebreaker when source types are equal', () => {
    const items = [
      createItem('old', 'manual', '2024-01-01T00:00:00Z'),
      createItem('new', 'manual', '2024-01-15T00:00:00Z'),
    ];

    const duplicates = detectDuplicates(items);
    expect(duplicates[0].keepId).toBe('new');
  });
});

describe('Consolidation - Edge Cases', () => {
  it('should handle empty items array', () => {
    const duplicates = detectDuplicates([]);
    const conflicts = detectConflicts([]);
    const customItems = getCustomItemsForReclassification([]);

    expect(duplicates).toHaveLength(0);
    expect(conflicts).toHaveLength(0);
    expect(customItems).toHaveLength(0);
  });

  it('should handle single item', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'contact.primaryName',
        isCanonical: true,
        category: 'contact',
        label: 'Primary Name',
        value: 'John Smith',
        valueType: 'string',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
    ];

    const duplicates = detectDuplicates(items);
    const conflicts = detectConflicts(items);

    expect(duplicates).toHaveLength(0);
    expect(conflicts).toHaveLength(0);
  });

  it('should handle complex object values for conflict detection', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'contact.address',
        isCanonical: true,
        category: 'contact',
        label: 'Address',
        value: { street: '123 Main St', city: 'London' },
        valueType: 'object',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
      {
        _id: 'item2',
        fieldPath: 'contact.address',
        isCanonical: true,
        category: 'contact',
        label: 'Address',
        value: { street: '456 Other St', city: 'London' },
        valueType: 'object',
        sourceType: 'ai_extraction',
        status: 'active',
        addedAt: '2024-01-02T00:00:00Z',
      },
    ];

    const conflicts = detectConflicts(items);
    expect(conflicts).toHaveLength(1); // Different object values
  });

  it('should handle array values for conflict detection', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'company.directors',
        isCanonical: true,
        category: 'company',
        label: 'Directors',
        value: ['John Smith', 'Jane Doe'],
        valueType: 'array',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
      {
        _id: 'item2',
        fieldPath: 'company.directors',
        isCanonical: true,
        category: 'company',
        label: 'Directors',
        value: ['John Smith', 'Jane Doe', 'Bob Wilson'],
        valueType: 'array',
        sourceType: 'ai_extraction',
        status: 'active',
        addedAt: '2024-01-02T00:00:00Z',
      },
    ];

    const conflicts = detectConflicts(items);
    expect(conflicts).toHaveLength(1); // Different array values
  });

  it('should handle null and undefined values', () => {
    const items: KnowledgeItemForConsolidation[] = [
      {
        _id: 'item1',
        fieldPath: 'contact.phone',
        isCanonical: true,
        category: 'contact',
        label: 'Phone',
        value: null,
        valueType: 'string',
        sourceType: 'manual',
        status: 'active',
        addedAt: '2024-01-01T00:00:00Z',
      },
      {
        _id: 'item2',
        fieldPath: 'contact.phone',
        isCanonical: true,
        category: 'contact',
        label: 'Phone',
        value: '+44 123 456 7890',
        valueType: 'string',
        sourceType: 'ai_extraction',
        status: 'active',
        addedAt: '2024-01-02T00:00:00Z',
      },
    ];

    const conflicts = detectConflicts(items);
    expect(conflicts).toHaveLength(1); // null vs string is a conflict
  });
});
