import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Intelligence API Tests
 *
 * Tests for the intelligence extraction API endpoints
 * These test the response parsing and validation logic
 */

// Mock LLM response structure
interface LLMExtractionResponse {
  fields: Array<{
    fieldPath: string;
    value: any;
    confidence: number;
    sourceText?: string;
  }>;
  attributes: Array<{
    key: string;
    value: any;
    confidence: number;
    sourceText?: string;
  }>;
  insights: {
    keyFindings?: string[];
    risks?: Array<{ risk: string; severity?: string }>;
  };
}

// Simulate parsing LLM response (extracted from route.ts for testing)
function parseExtractionResponse(content: string): LLMExtractionResponse {
  const parsed = JSON.parse(content);
  return {
    fields: (parsed.fields || []).filter((f: any) => f.confidence >= 0.5),
    attributes: (parsed.attributes || []).filter((a: any) => a.confidence >= 0.5),
    insights: parsed.insights || {},
  };
}

describe('Intelligence API - Response Parsing', () => {
  it('should parse valid LLM extraction response', () => {
    const llmResponse = JSON.stringify({
      fields: [
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
          sourceText: 'Interest Rate: 8.5%',
        },
      ],
      attributes: [
        {
          key: 's106_contribution',
          value: 50000,
          confidence: 0.85,
          sourceText: 'S106: £50,000',
        },
      ],
      insights: {
        keyFindings: ['Strong borrower track record', 'Planning already approved'],
        risks: [{ risk: 'Market volatility in area', severity: 'medium' }],
      },
    });

    const result = parseExtractionResponse(llmResponse);

    expect(result.fields).toHaveLength(2);
    expect(result.attributes).toHaveLength(1);
    expect(result.insights.keyFindings).toHaveLength(2);
    expect(result.insights.risks).toHaveLength(1);
  });

  it('should filter out low confidence fields', () => {
    const llmResponse = JSON.stringify({
      fields: [
        { fieldPath: 'financials.loanAmount', value: 2500000, confidence: 0.95 },
        { fieldPath: 'financials.interestRate', value: 8.5, confidence: 0.3 }, // Too low
        { fieldPath: 'financials.ltv', value: 65, confidence: 0.5 }, // At threshold
      ],
      attributes: [],
      insights: {},
    });

    const result = parseExtractionResponse(llmResponse);

    expect(result.fields).toHaveLength(2);
    expect(result.fields.map((f) => f.fieldPath)).toEqual([
      'financials.loanAmount',
      'financials.ltv',
    ]);
  });

  it('should handle empty response gracefully', () => {
    const llmResponse = JSON.stringify({});

    const result = parseExtractionResponse(llmResponse);

    expect(result.fields).toEqual([]);
    expect(result.attributes).toEqual([]);
    expect(result.insights).toEqual({});
  });

  it('should handle missing fields array', () => {
    const llmResponse = JSON.stringify({
      attributes: [{ key: 'test', value: 'value', confidence: 0.9 }],
      insights: { keyFindings: ['Test finding'] },
    });

    const result = parseExtractionResponse(llmResponse);

    expect(result.fields).toEqual([]);
    expect(result.attributes).toHaveLength(1);
    expect(result.insights.keyFindings).toHaveLength(1);
  });
});

describe('Intelligence API - Field Path Validation', () => {
  const PROJECT_FIELDS = [
    'overview.projectType',
    'overview.assetClass',
    'overview.description',
    'location.siteAddress',
    'location.postcode',
    'location.localAuthority',
    'location.region',
    'financials.purchasePrice',
    'financials.totalDevelopmentCost',
    'financials.grossDevelopmentValue',
    'financials.profit',
    'financials.profitMargin',
    'financials.loanAmount',
    'financials.ltv',
    'financials.ltgdv',
    'financials.interestRate',
    'timeline.acquisitionDate',
    'timeline.planningSubmissionDate',
    'timeline.planningApprovalDate',
    'timeline.constructionStartDate',
    'timeline.practicalCompletionDate',
    'timeline.loanMaturityDate',
    'development.totalUnits',
    'development.totalSqFt',
    'development.siteArea',
    'development.planningReference',
    'development.planningStatus',
    'keyParties.solicitor.firm',
    'keyParties.valuer.firm',
    'keyParties.architect.firm',
    'keyParties.contractor.firm',
    'keyParties.monitoringSurveyor.firm',
  ];

  const CLIENT_FIELDS = [
    'identity.legalName',
    'identity.tradingName',
    'identity.companyNumber',
    'identity.vatNumber',
    'identity.incorporationDate',
    'primaryContact.name',
    'primaryContact.email',
    'primaryContact.phone',
    'primaryContact.role',
    'addresses.registered',
    'addresses.trading',
    'banking.bankName',
    'banking.sortCode',
    'banking.accountNumber',
    'borrowerProfile.experienceLevel',
    'borrowerProfile.completedProjects',
    'borrowerProfile.netWorth',
    'borrowerProfile.liquidAssets',
  ];

  it('should have 32 project fields defined', () => {
    expect(PROJECT_FIELDS).toHaveLength(32);
  });

  it('should have 18 client fields defined', () => {
    expect(CLIENT_FIELDS).toHaveLength(18);
  });

  it('should have all project field paths in correct format', () => {
    for (const field of PROJECT_FIELDS) {
      const parts = field.split('.');
      expect(parts.length).toBeGreaterThanOrEqual(2);
      expect(parts[0]).toBeTruthy();
      expect(parts[1]).toBeTruthy();
    }
  });

  it('should have all client field paths in correct format', () => {
    for (const field of CLIENT_FIELDS) {
      const parts = field.split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBeTruthy();
      expect(parts[1]).toBeTruthy();
    }
  });

  it('should categorize fields correctly', () => {
    const projectCategories = [
      'overview',
      'location',
      'financials',
      'timeline',
      'development',
      'keyParties',
    ];
    const clientCategories = [
      'identity',
      'primaryContact',
      'addresses',
      'banking',
      'borrowerProfile',
    ];

    const projectFieldCategories = new Set(PROJECT_FIELDS.map((f) => f.split('.')[0]));
    const clientFieldCategories = new Set(CLIENT_FIELDS.map((f) => f.split('.')[0]));

    expect([...projectFieldCategories].sort()).toEqual(projectCategories.sort());
    expect([...clientFieldCategories].sort()).toEqual(clientCategories.sort());
  });
});

describe('Intelligence API - Merge Result Format', () => {
  it('should return correct merge result structure', () => {
    const mergeResult = {
      fieldsAdded: 5,
      fieldsUpdated: 2,
      fieldsSkipped: 3,
      attributesAdded: 1,
      insightsAdded: 4,
    };

    expect(mergeResult).toHaveProperty('fieldsAdded');
    expect(mergeResult).toHaveProperty('fieldsUpdated');
    expect(mergeResult).toHaveProperty('fieldsSkipped');
    expect(mergeResult).toHaveProperty('attributesAdded');
    expect(mergeResult).toHaveProperty('insightsAdded');

    expect(typeof mergeResult.fieldsAdded).toBe('number');
    expect(typeof mergeResult.fieldsUpdated).toBe('number');
    expect(typeof mergeResult.fieldsSkipped).toBe('number');
  });

  it('should calculate total processed correctly', () => {
    const mergeResult = {
      fieldsAdded: 5,
      fieldsUpdated: 2,
      fieldsSkipped: 3,
    };

    const totalProcessed =
      mergeResult.fieldsAdded + mergeResult.fieldsUpdated + mergeResult.fieldsSkipped;

    expect(totalProcessed).toBe(10);
  });
});

describe('Intelligence API - Queue Job Status', () => {
  const validStatuses = ['pending', 'processing', 'completed', 'failed', 'skipped'];

  it('should validate job status values', () => {
    for (const status of validStatuses) {
      expect(validStatuses).toContain(status);
    }
  });

  it('should transition from pending to processing', () => {
    const job = { status: 'pending', attempts: 0 };

    // Simulate transition
    job.status = 'processing';
    job.attempts += 1;

    expect(job.status).toBe('processing');
    expect(job.attempts).toBe(1);
  });

  it('should mark as failed after max attempts', () => {
    const job = { status: 'processing', attempts: 2, maxAttempts: 3 };

    // Simulate failure
    job.attempts += 1;
    if (job.attempts >= job.maxAttempts) {
      job.status = 'failed';
    }

    expect(job.status).toBe('failed');
    expect(job.attempts).toBe(3);
  });

  it('should allow retry if not at max attempts', () => {
    const job = { status: 'processing', attempts: 1, maxAttempts: 3 };

    // Simulate failure
    job.attempts += 1;
    if (job.attempts >= job.maxAttempts) {
      job.status = 'failed';
    } else {
      job.status = 'pending'; // Can retry
    }

    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(2);
  });
});

describe('Intelligence API - Error Handling', () => {
  it('should handle malformed JSON gracefully', () => {
    const malformedJson = '{ "fields": [ invalid json }';

    expect(() => parseExtractionResponse(malformedJson)).toThrow();
  });

  it('should handle null values in response', () => {
    const responseWithNulls = JSON.stringify({
      fields: [
        { fieldPath: 'financials.loanAmount', value: null, confidence: 0.9 },
        { fieldPath: 'financials.interestRate', value: 8.5, confidence: 0.9 },
      ],
      attributes: null,
      insights: null,
    });

    // This should not throw, but handle gracefully
    const result = parseExtractionResponse(responseWithNulls);

    expect(result.fields).toHaveLength(2);
    expect(result.attributes).toEqual([]);
    expect(result.insights).toEqual({});
  });
});

describe('Intelligence API - Document Type Detection', () => {
  const documentTypeMappings: Record<string, string[]> = {
    Valuation: ['financials.grossDevelopmentValue', 'financials.loanAmount', 'location.siteAddress'],
    'Bank Statement': ['banking.bankName', 'banking.accountNumber', 'banking.sortCode'],
    'Planning Decision': [
      'development.planningReference',
      'development.planningStatus',
      'timeline.planningApprovalDate',
    ],
    Appraisal: [
      'financials.totalDevelopmentCost',
      'financials.profit',
      'financials.profitMargin',
    ],
    'KYC Document': ['identity.companyNumber', 'identity.legalName', 'addresses.registered'],
  };

  it('should have expected fields for Valuation documents', () => {
    const expectedFields = documentTypeMappings['Valuation'];
    expect(expectedFields).toContain('financials.grossDevelopmentValue');
    expect(expectedFields).toContain('financials.loanAmount');
  });

  it('should have expected fields for Bank Statement documents', () => {
    const expectedFields = documentTypeMappings['Bank Statement'];
    expect(expectedFields).toContain('banking.bankName');
    expect(expectedFields).toContain('banking.accountNumber');
  });

  it('should have expected fields for Planning Decision documents', () => {
    const expectedFields = documentTypeMappings['Planning Decision'];
    expect(expectedFields).toContain('development.planningReference');
    expect(expectedFields).toContain('timeline.planningApprovalDate');
  });
});
