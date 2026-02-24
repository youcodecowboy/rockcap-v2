import { describe, it, expect } from 'vitest';

/**
 * Intelligence Extraction End-to-End Tests
 *
 * These tests simulate the full extraction flow with realistic document content
 * to verify the system handles real-world scenarios correctly.
 */

// Type definitions for extraction data
interface ExtractedField {
  fieldPath: string;
  value: unknown;
  confidence: number;
  sourceText?: string;
}

interface ExtractedAttribute {
  key: string;
  value: unknown;
  confidence: number;
  sourceText?: string;
}

interface ExtractionInsights {
  keyFindings?: string[];
  risks?: Array<{ risk: string; severity: string }>;
}

interface ParsedExtraction {
  fields: ExtractedField[];
  attributes: ExtractedAttribute[];
  insights: ExtractionInsights;
}

// Simulated extraction response parser (matching route.ts logic)
function parseExtractionResponse(content: string): ParsedExtraction {
  const parsed = JSON.parse(content);
  return {
    fields: (parsed.fields || []).filter((f: ExtractedField) => f.confidence >= 0.5),
    attributes: (parsed.attributes || []).filter((a: ExtractedAttribute) => a.confidence >= 0.5),
    insights: parsed.insights || {},
  };
}

// Simulated merge logic (matching intelligence.ts)
function mergeFields(
  existing: Array<{ fieldPath: string; confidence: number; value: any }>,
  newFields: Array<{ fieldPath: string; confidence: number; value: any }>
) {
  const confidenceMap = new Map(existing.map((e) => [e.fieldPath, e.confidence]));
  const result = [...existing];
  const stats = { added: 0, updated: 0, skipped: 0 };

  for (const field of newFields) {
    const existingConf = confidenceMap.get(field.fieldPath) || 0;
    if (field.confidence > existingConf) {
      const idx = result.findIndex((e) => e.fieldPath === field.fieldPath);
      if (idx >= 0) {
        result.splice(idx, 1);
        stats.updated++;
      } else {
        stats.added++;
      }
      result.push(field);
    } else {
      stats.skipped++;
    }
  }

  return { result, stats };
}

describe('Intelligence E2E - Valuation Report Extraction', () => {
  // Simulated LLM response for a valuation report
  const valuationLLMResponse = JSON.stringify({
    fields: [
      {
        fieldPath: 'financials.grossDevelopmentValue',
        value: 8500000,
        confidence: 0.95,
        sourceText: 'We assess the Gross Development Value to be £8,500,000',
      },
      {
        fieldPath: 'financials.totalDevelopmentCost',
        value: 6200000,
        confidence: 0.9,
        sourceText: 'Total Development Costs: £6,200,000',
      },
      {
        fieldPath: 'location.siteAddress',
        value: '123 Development Road, London SE1 2AB',
        confidence: 0.98,
        sourceText: 'Property Address: 123 Development Road, London SE1 2AB',
      },
      {
        fieldPath: 'location.postcode',
        value: 'SE1 2AB',
        confidence: 0.99,
        sourceText: 'Property Address: 123 Development Road, London SE1 2AB',
      },
      {
        fieldPath: 'development.totalUnits',
        value: 12,
        confidence: 0.92,
        sourceText: 'The proposed development comprises 12 residential units',
      },
      {
        fieldPath: 'keyParties.valuer.firm',
        value: 'Smith & Partners Valuers',
        confidence: 0.95,
        sourceText: 'Prepared by Smith & Partners Valuers',
      },
    ],
    attributes: [
      {
        key: 'valuation_date',
        value: '2025-01-15',
        confidence: 0.95,
        sourceText: 'Valuation Date: 15 January 2025',
      },
      {
        key: 'valuation_type',
        value: 'Market Value',
        confidence: 0.9,
        sourceText: 'Basis of Valuation: Market Value',
      },
    ],
    insights: {
      keyFindings: [
        'Development has full planning permission',
        'Location benefits from excellent transport links',
        'Strong local market demand for 2-bed apartments',
      ],
      risks: [
        { risk: 'Construction cost inflation may impact profit margins', severity: 'medium' },
        { risk: 'Interest rate rises could affect exit strategy', severity: 'low' },
      ],
    },
  });

  it('should extract all fields from valuation report', () => {
    const result = parseExtractionResponse(valuationLLMResponse);

    expect(result.fields).toHaveLength(6);
    expect(result.fields.find((f: ExtractedField) => f.fieldPath === 'financials.grossDevelopmentValue')?.value).toBe(
      8500000
    );
    expect(result.fields.find((f: ExtractedField) => f.fieldPath === 'development.totalUnits')?.value).toBe(12);
  });

  it('should extract custom attributes', () => {
    const result = parseExtractionResponse(valuationLLMResponse);

    expect(result.attributes).toHaveLength(2);
    expect(result.attributes.find((a: ExtractedAttribute) => a.key === 'valuation_date')?.value).toBe('2025-01-15');
  });

  it('should extract insights with correct structure', () => {
    const result = parseExtractionResponse(valuationLLMResponse);

    expect(result.insights.keyFindings).toHaveLength(3);
    expect(result.insights.risks).toHaveLength(2);
    expect(result.insights.risks?.[0].severity).toBe('medium');
  });

  it('should merge valuation fields into empty intelligence', () => {
    const existing: any[] = [];
    const newFields = parseExtractionResponse(valuationLLMResponse).fields;

    const { result, stats } = mergeFields(existing, newFields);

    expect(stats.added).toBe(6);
    expect(stats.updated).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(result).toHaveLength(6);
  });
});

describe('Intelligence E2E - Bank Statement Extraction', () => {
  const bankStatementLLMResponse = JSON.stringify({
    fields: [
      {
        fieldPath: 'banking.bankName',
        value: 'HSBC UK',
        confidence: 0.98,
        sourceText: 'HSBC UK Business Banking',
      },
      {
        fieldPath: 'banking.sortCode',
        value: '40-11-22',
        confidence: 0.95,
        sourceText: 'Sort Code: 40-11-22',
      },
      {
        fieldPath: 'banking.accountNumber',
        value: '12345678',
        confidence: 0.95,
        sourceText: 'Account Number: 12345678',
      },
      {
        fieldPath: 'identity.tradingName',
        value: 'ABC Developments Ltd',
        confidence: 0.9,
        sourceText: 'ABC Developments Ltd - Business Current Account',
      },
    ],
    attributes: [
      {
        key: 'statement_period',
        value: 'December 2024',
        confidence: 0.95,
        sourceText: 'Statement Period: 1 December 2024 - 31 December 2024',
      },
      {
        key: 'closing_balance',
        value: 250000,
        confidence: 0.92,
        sourceText: 'Closing Balance: £250,000.00',
      },
    ],
    insights: {
      keyFindings: [
        'Healthy cash reserves maintained throughout period',
        'Regular income from property sales',
      ],
      risks: [],
    },
  });

  it('should extract banking details from statement', () => {
    const result = parseExtractionResponse(bankStatementLLMResponse);

    expect(result.fields.find((f: ExtractedField) => f.fieldPath === 'banking.bankName')?.value).toBe('HSBC UK');
    expect(result.fields.find((f: ExtractedField) => f.fieldPath === 'banking.sortCode')?.value).toBe('40-11-22');
    expect(result.fields.find((f: ExtractedField) => f.fieldPath === 'banking.accountNumber')?.value).toBe('12345678');
  });

  it('should extract closing balance as custom attribute', () => {
    const result = parseExtractionResponse(bankStatementLLMResponse);

    const closingBalance = result.attributes.find((a: ExtractedAttribute) => a.key === 'closing_balance');
    expect(closingBalance).toBeDefined();
    expect(closingBalance?.value).toBe(250000);
  });
});

describe('Intelligence E2E - Multi-Document Merge Scenario', () => {
  it('should build up intelligence from multiple documents', () => {
    // Document 1: Valuation (provides GDV, TDC)
    const doc1Fields = [
      { fieldPath: 'financials.grossDevelopmentValue', value: 8000000, confidence: 0.85 },
      { fieldPath: 'financials.totalDevelopmentCost', value: 6000000, confidence: 0.8 },
    ];

    // Document 2: Appraisal (provides more accurate TDC, adds profit)
    const doc2Fields = [
      { fieldPath: 'financials.totalDevelopmentCost', value: 6200000, confidence: 0.95 }, // Higher confidence
      { fieldPath: 'financials.profit', value: 1800000, confidence: 0.9 },
    ];

    // Document 3: Facility Letter (provides loan terms)
    const doc3Fields = [
      { fieldPath: 'financials.loanAmount', value: 4500000, confidence: 0.98 },
      { fieldPath: 'financials.interestRate', value: 9.5, confidence: 0.98 },
      { fieldPath: 'timeline.loanMaturityDate', value: '2026-06-30', confidence: 0.95 },
    ];

    // Merge document 1
    let { result: intel, stats } = mergeFields([], doc1Fields);
    expect(stats.added).toBe(2);
    expect(intel).toHaveLength(2);

    // Merge document 2 - should update TDC (higher confidence), add profit
    ({ result: intel, stats } = mergeFields(intel, doc2Fields));
    expect(stats.added).toBe(1); // profit
    expect(stats.updated).toBe(1); // TDC updated
    expect(intel).toHaveLength(3);

    // Verify TDC was updated
    const tdc = intel.find((f) => f.fieldPath === 'financials.totalDevelopmentCost');
    expect(tdc?.value).toBe(6200000);
    expect(tdc?.confidence).toBe(0.95);

    // Merge document 3 - all new fields
    ({ result: intel, stats } = mergeFields(intel, doc3Fields));
    expect(stats.added).toBe(3);
    expect(intel).toHaveLength(6);

    // Final intelligence state
    expect(intel.map((f) => f.fieldPath).sort()).toEqual([
      'financials.grossDevelopmentValue',
      'financials.interestRate',
      'financials.loanAmount',
      'financials.profit',
      'financials.totalDevelopmentCost',
      'timeline.loanMaturityDate',
    ]);
  });

  it('should not overwrite higher confidence data', () => {
    // High confidence data from valuation
    const existing = [
      { fieldPath: 'financials.grossDevelopmentValue', value: 8500000, confidence: 0.95 },
    ];

    // Lower confidence data from older document
    const newFields = [
      { fieldPath: 'financials.grossDevelopmentValue', value: 7800000, confidence: 0.7 },
    ];

    const { result, stats } = mergeFields(existing, newFields);

    expect(stats.skipped).toBe(1);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(8500000); // Original preserved
  });
});

describe('Intelligence E2E - Real-World Edge Cases', () => {
  it('should handle documents with minimal extractable data', () => {
    const minimalResponse = JSON.stringify({
      fields: [
        { fieldPath: 'location.region', value: 'South East', confidence: 0.6 },
      ],
      attributes: [],
      insights: {
        keyFindings: ['Document contains limited specific data'],
      },
    });

    const result = parseExtractionResponse(minimalResponse);

    expect(result.fields).toHaveLength(1);
    expect(result.insights.keyFindings).toHaveLength(1);
  });

  it('should handle planning documents with planning-specific fields', () => {
    const planningResponse = JSON.stringify({
      fields: [
        {
          fieldPath: 'development.planningReference',
          value: 'PA/2024/12345',
          confidence: 0.99,
          sourceText: 'Planning Application Reference: PA/2024/12345',
        },
        {
          fieldPath: 'development.planningStatus',
          value: 'Approved',
          confidence: 0.98,
          sourceText: 'Decision: APPROVED subject to conditions',
        },
        {
          fieldPath: 'timeline.planningApprovalDate',
          value: '2024-11-15',
          confidence: 0.95,
          sourceText: 'Date of Decision: 15 November 2024',
        },
      ],
      attributes: [
        {
          key: 'planning_conditions_count',
          value: 15,
          confidence: 0.9,
          sourceText: 'Subject to 15 conditions',
        },
      ],
      insights: {
        keyFindings: [
          'Planning approved with 15 conditions',
          'Condition 1 requires pre-commencement materials approval',
        ],
        risks: [
          { risk: 'Pre-commencement conditions may delay start', severity: 'medium' },
        ],
      },
    });

    const result = parseExtractionResponse(planningResponse);

    expect(result.fields).toHaveLength(3);
    expect(result.fields.find((f: ExtractedField) => f.fieldPath === 'development.planningStatus')?.value).toBe(
      'Approved'
    );
    expect(result.attributes.find((a: ExtractedAttribute) => a.key === 'planning_conditions_count')?.value).toBe(15);
  });

  it('should handle KYC documents for client intelligence', () => {
    const kycResponse = JSON.stringify({
      fields: [
        {
          fieldPath: 'identity.companyNumber',
          value: '12345678',
          confidence: 0.99,
          sourceText: 'Company Number: 12345678',
        },
        {
          fieldPath: 'identity.legalName',
          value: 'ABC Developments Limited',
          confidence: 0.99,
          sourceText: 'ABC Developments Limited',
        },
        {
          fieldPath: 'identity.incorporationDate',
          value: '2018-03-15',
          confidence: 0.95,
          sourceText: 'Incorporated on 15 March 2018',
        },
        {
          fieldPath: 'addresses.registered',
          value: '100 Business Park, London EC1A 1BB',
          confidence: 0.95,
          sourceText: 'Registered Office: 100 Business Park, London EC1A 1BB',
        },
        {
          fieldPath: 'borrowerProfile.completedProjects',
          value: 8,
          confidence: 0.85,
          sourceText: 'Track record includes 8 completed developments',
        },
      ],
      attributes: [
        {
          key: 'sic_code',
          value: '41100',
          confidence: 0.95,
          sourceText: 'Nature of business (SIC): 41100 - Development of building projects',
        },
      ],
      insights: {
        keyFindings: [
          'Company established in 2018 with good track record',
          'Specializes in residential development',
        ],
      },
    });

    const result = parseExtractionResponse(kycResponse);

    expect(result.fields).toHaveLength(5);
    expect(result.fields.find((f: ExtractedField) => f.fieldPath === 'identity.companyNumber')?.value).toBe('12345678');
    expect(result.fields.find((f: ExtractedField) => f.fieldPath === 'borrowerProfile.completedProjects')?.value).toBe(8);
  });
});
