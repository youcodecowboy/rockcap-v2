/**
 * Tests for Template Interpolation Utility (Sprint 4)
 */

import {
  getFieldValue,
  getCategoryFields,
  interpolateTemplate,
  extractPlaceholders,
  analyzeTemplate,
  checkTemplateReadiness,
  getMissingFieldsSummary,
  KnowledgeItemForTemplate,
} from '../lib/templateInterpolation';

describe('Template Interpolation Utility', () => {
  // Sample knowledge items for testing
  const clientItems: KnowledgeItemForTemplate[] = [
    {
      fieldPath: 'contact.primaryName',
      value: 'John Smith',
      status: 'active',
      label: 'Primary Contact Name',
    },
    {
      fieldPath: 'contact.email',
      value: 'john@example.com',
      status: 'active',
      label: 'Email',
    },
    {
      fieldPath: 'company.name',
      value: 'Smith Developments Ltd',
      status: 'active',
      label: 'Company Name',
    },
    {
      fieldPath: 'financial.netWorth',
      value: 5000000,
      status: 'active',
      label: 'Net Worth',
    },
    {
      fieldPath: 'contact.archivedField',
      value: 'Old Value',
      status: 'archived',
      label: 'Archived Field',
    },
  ];

  const projectItems: KnowledgeItemForTemplate[] = [
    {
      fieldPath: 'overview.projectName',
      value: '123 High Street Development',
      status: 'active',
      label: 'Project Name',
    },
    {
      fieldPath: 'financials.gdv',
      value: 15000000,
      status: 'active',
      label: 'GDV',
    },
    {
      fieldPath: 'financials.loanAmount',
      value: 10000000,
      status: 'active',
      label: 'Loan Amount',
    },
    {
      fieldPath: 'location.siteAddress',
      value: '123 High Street, London, SW1A 1AA',
      status: 'active',
      label: 'Site Address',
    },
    {
      fieldPath: 'timeline.planningStatus',
      value: 'Approved',
      status: 'active',
      label: 'Planning Status',
    },
  ];

  describe('getFieldValue', () => {
    it('should return value for existing active field', () => {
      const value = getFieldValue(clientItems, 'contact.primaryName');
      expect(value).toBe('John Smith');
    });

    it('should return null for non-existent field', () => {
      const value = getFieldValue(clientItems, 'contact.nonExistent');
      expect(value).toBeNull();
    });

    it('should return null for archived field', () => {
      const value = getFieldValue(clientItems, 'contact.archivedField');
      expect(value).toBeNull();
    });

    it('should return numeric values correctly', () => {
      const value = getFieldValue(clientItems, 'financial.netWorth');
      expect(value).toBe(5000000);
    });
  });

  describe('getCategoryFields', () => {
    it('should return all fields in a category', () => {
      const fields = getCategoryFields(clientItems, 'contact');
      expect(fields).toHaveLength(2); // primaryName and email (not archived)
      expect(fields.map(f => f.fieldPath)).toContain('contact.primaryName');
      expect(fields.map(f => f.fieldPath)).toContain('contact.email');
    });

    it('should not include archived fields', () => {
      const fields = getCategoryFields(clientItems, 'contact');
      expect(fields.map(f => f.fieldPath)).not.toContain('contact.archivedField');
    });

    it('should return empty array for non-existent category', () => {
      const fields = getCategoryFields(clientItems, 'nonexistent');
      expect(fields).toHaveLength(0);
    });
  });

  describe('extractPlaceholders', () => {
    it('should extract client placeholders', () => {
      const template = 'Hello {{client.contact.primaryName}}';
      const placeholders = extractPlaceholders(template);
      expect(placeholders).toHaveLength(1);
      expect(placeholders[0]).toEqual({
        placeholder: '{{client.contact.primaryName}}',
        type: 'client',
        fieldPath: 'contact.primaryName',
      });
    });

    it('should extract project placeholders', () => {
      const template = 'Project: {{project.overview.projectName}}';
      const placeholders = extractPlaceholders(template);
      expect(placeholders).toHaveLength(1);
      expect(placeholders[0]).toEqual({
        placeholder: '{{project.overview.projectName}}',
        type: 'project',
        fieldPath: 'overview.projectName',
      });
    });

    it('should extract multiple mixed placeholders', () => {
      const template = 'Dear {{client.contact.primaryName}}, regarding {{project.overview.projectName}} at {{project.location.siteAddress}}';
      const placeholders = extractPlaceholders(template);
      expect(placeholders).toHaveLength(3);
      expect(placeholders.filter(p => p.type === 'client')).toHaveLength(1);
      expect(placeholders.filter(p => p.type === 'project')).toHaveLength(2);
    });

    it('should return empty array for template without placeholders', () => {
      const template = 'Hello World, no placeholders here!';
      const placeholders = extractPlaceholders(template);
      expect(placeholders).toHaveLength(0);
    });
  });

  describe('interpolateTemplate', () => {
    it('should interpolate simple template', () => {
      const template = 'Hello {{client.contact.primaryName}}';
      const result = interpolateTemplate(template, clientItems, projectItems);
      expect(result.text).toBe('Hello John Smith');
      expect(result.missingFields).toHaveLength(0);
      expect(result.populatedFields).toContain('client.contact.primaryName');
      expect(result.completeness).toBe(100);
    });

    it('should interpolate mixed client and project fields', () => {
      const template = 'Dear {{client.contact.primaryName}}, regarding {{project.overview.projectName}}';
      const result = interpolateTemplate(template, clientItems, projectItems);
      expect(result.text).toBe('Dear John Smith, regarding 123 High Street Development');
      expect(result.completeness).toBe(100);
    });

    it('should mark missing fields', () => {
      const template = 'Hello {{client.contact.primaryName}}, your phone is {{client.contact.phone}}';
      const result = interpolateTemplate(template, clientItems, projectItems);
      expect(result.text).toContain('John Smith');
      expect(result.text).toContain('[MISSING: {{client.contact.phone}}]');
      expect(result.missingFields).toHaveLength(1);
      expect(result.missingFields[0].fieldPath).toBe('contact.phone');
      expect(result.completeness).toBe(50);
    });

    it('should use custom missing marker', () => {
      const template = 'Phone: {{client.contact.phone}}';
      const result = interpolateTemplate(template, clientItems, projectItems, {
        markMissing: true,
        missingMarker: '___BLANK___',
      });
      expect(result.text).toBe('Phone: ___BLANK___');
    });

    it('should not mark missing when markMissing is false', () => {
      const template = 'Phone: {{client.contact.phone}}';
      const result = interpolateTemplate(template, clientItems, projectItems, {
        markMissing: false,
      });
      expect(result.text).toBe('Phone: ');
    });

    it('should format currency values', () => {
      const template = 'GDV: {{project.financials.gdv}}';
      const result = interpolateTemplate(template, clientItems, projectItems);
      expect(result.text).toBe('GDV: 15,000,000');
    });

    it('should handle complex template', () => {
      const template = `
LOAN PROPOSAL
=============
Borrower: {{client.contact.primaryName}}
Company: {{client.company.name}}
Project: {{project.overview.projectName}}
Location: {{project.location.siteAddress}}
GDV: £{{project.financials.gdv}}
Loan Amount: £{{project.financials.loanAmount}}
Planning: {{project.timeline.planningStatus}}
`;
      const result = interpolateTemplate(template, clientItems, projectItems);
      expect(result.text).toContain('John Smith');
      expect(result.text).toContain('Smith Developments Ltd');
      expect(result.text).toContain('123 High Street Development');
      expect(result.text).toContain('Approved');
      expect(result.completeness).toBe(100);
    });
  });

  describe('analyzeTemplate', () => {
    it('should identify required client fields', () => {
      const template = 'Hello {{client.contact.primaryName}} from {{client.company.name}}';
      const analysis = analyzeTemplate(template);
      expect(analysis.clientFields).toHaveLength(2);
      expect(analysis.projectFields).toHaveLength(0);
      expect(analysis.totalFields).toBe(2);
    });

    it('should identify required project fields', () => {
      const template = 'Project {{project.overview.projectName}} at {{project.location.siteAddress}}';
      const analysis = analyzeTemplate(template);
      expect(analysis.clientFields).toHaveLength(0);
      expect(analysis.projectFields).toHaveLength(2);
    });

    it('should deduplicate repeated fields', () => {
      const template = '{{client.contact.primaryName}} and again {{client.contact.primaryName}}';
      const analysis = analyzeTemplate(template);
      expect(analysis.clientFields).toHaveLength(1);
      expect(analysis.totalFields).toBe(1);
    });

    it('should identify canonical vs custom fields', () => {
      const template = '{{client.contact.primaryName}} and {{client.custom.specialField}}';
      const analysis = analyzeTemplate(template);
      const canonicalField = analysis.clientFields.find(f => f.fieldPath === 'contact.primaryName');
      const customField = analysis.clientFields.find(f => f.fieldPath === 'custom.specialField');
      expect(canonicalField?.isCanonical).toBe(true);
      expect(customField?.isCanonical).toBe(false);
    });
  });

  describe('checkTemplateReadiness', () => {
    it('should return ready=true when all fields are filled', () => {
      const template = 'Hello {{client.contact.primaryName}}';
      const readiness = checkTemplateReadiness(template, clientItems, projectItems);
      expect(readiness.ready).toBe(true);
      expect(readiness.completeness).toBe(100);
      expect(readiness.missingFields).toHaveLength(0);
    });

    it('should return ready=true at 90% threshold', () => {
      // 9 out of 10 fields filled = 90%
      const template = `
{{client.contact.primaryName}}
{{client.contact.email}}
{{client.company.name}}
{{project.overview.projectName}}
{{project.financials.gdv}}
{{project.financials.loanAmount}}
{{project.location.siteAddress}}
{{project.timeline.planningStatus}}
{{client.financial.netWorth}}
{{client.contact.phone}}
`;
      const readiness = checkTemplateReadiness(template, clientItems, projectItems);
      expect(readiness.completeness).toBe(90);
      expect(readiness.ready).toBe(true);
    });

    it('should return ready=false below 90% threshold', () => {
      const template = `
{{client.contact.primaryName}}
{{client.contact.phone}}
{{client.contact.mobile}}
`;
      const readiness = checkTemplateReadiness(template, clientItems, projectItems);
      expect(readiness.ready).toBe(false);
      expect(readiness.completeness).toBeLessThan(90);
    });

    it('should return ready=true for empty template', () => {
      const template = 'No placeholders here';
      const readiness = checkTemplateReadiness(template, clientItems, projectItems);
      expect(readiness.ready).toBe(true);
      expect(readiness.completeness).toBe(100);
    });
  });

  describe('getMissingFieldsSummary', () => {
    it('should group missing fields by category', () => {
      const template = `
{{client.contact.primaryName}}
{{client.contact.phone}}
{{client.company.sicCode}}
{{project.financials.ltv}}
`;
      const result = interpolateTemplate(template, clientItems, projectItems);
      const summary = getMissingFieldsSummary(result.missingFields);

      expect(Object.keys(summary)).toContain('client.contact');
      expect(Object.keys(summary)).toContain('client.company');
      expect(Object.keys(summary)).toContain('project.financials');
    });

    it('should return empty object when no missing fields', () => {
      const template = '{{client.contact.primaryName}}';
      const result = interpolateTemplate(template, clientItems, projectItems);
      const summary = getMissingFieldsSummary(result.missingFields);
      expect(Object.keys(summary)).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty items arrays', () => {
      const template = 'Hello {{client.contact.primaryName}}';
      const result = interpolateTemplate(template, [], []);
      expect(result.text).toContain('[MISSING:');
      expect(result.completeness).toBe(0);
    });

    it('should handle special characters in values', () => {
      const itemsWithSpecialChars: KnowledgeItemForTemplate[] = [
        {
          fieldPath: 'contact.primaryName',
          value: 'John "The Dev" O\'Smith & Co.',
          status: 'active',
          label: 'Name',
        },
      ];
      const template = 'Hello {{client.contact.primaryName}}';
      const result = interpolateTemplate(template, itemsWithSpecialChars, []);
      expect(result.text).toBe('Hello John "The Dev" O\'Smith & Co.');
    });

    it('should handle array values', () => {
      const itemsWithArray: KnowledgeItemForTemplate[] = [
        {
          fieldPath: 'contact.tags',
          value: ['VIP', 'Priority', 'Repeat Client'],
          status: 'active',
          label: 'Tags',
        },
      ];
      const template = 'Tags: {{client.contact.tags}}';
      const result = interpolateTemplate(template, itemsWithArray, []);
      expect(result.text).toBe('Tags: VIP, Priority, Repeat Client');
    });

    it('should handle boolean values', () => {
      const itemsWithBool: KnowledgeItemForTemplate[] = [
        {
          fieldPath: 'contact.verified',
          value: true,
          status: 'active',
          label: 'Verified',
        },
      ];
      const template = 'Verified: {{client.contact.verified}}';
      const result = interpolateTemplate(template, itemsWithBool, []);
      expect(result.text).toBe('Verified: Yes');
    });

    it('should handle null/undefined values as missing', () => {
      const itemsWithNull: KnowledgeItemForTemplate[] = [
        {
          fieldPath: 'contact.primaryName',
          value: null,
          status: 'active',
          label: 'Name',
        },
      ];
      const template = 'Hello {{client.contact.primaryName}}';
      const result = interpolateTemplate(template, itemsWithNull, []);
      expect(result.text).toContain('[MISSING:');
      expect(result.missingFields).toHaveLength(1);
    });

    it('should handle empty string values as missing', () => {
      const itemsWithEmpty: KnowledgeItemForTemplate[] = [
        {
          fieldPath: 'contact.primaryName',
          value: '',
          status: 'active',
          label: 'Name',
        },
      ];
      const template = 'Hello {{client.contact.primaryName}}';
      const result = interpolateTemplate(template, itemsWithEmpty, []);
      expect(result.text).toContain('[MISSING:');
      expect(result.missingFields).toHaveLength(1);
    });
  });
});
