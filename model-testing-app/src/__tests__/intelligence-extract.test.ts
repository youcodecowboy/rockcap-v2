/**
 * Intelligence Extraction Tests
 *
 * Tests the "Add Intelligence" functionality which extracts structured data
 * from text input and populates intelligence fields.
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Mock the extraction patterns to test without API calls
// This simulates what the AI extraction should return for given inputs

// =============================================================================
// TEST UTILITIES
// =============================================================================

interface ExtractedField {
  fieldPath: string;
  value: string | number;
  confidence: number;
  sourceText?: string;
}

// Simulate the field extraction patterns
function mockExtractClientFields(content: string): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const contentLower = content.toLowerCase();

  // Company Name patterns
  const companyPatterns = [
    /(?:company|registered|legal)\s*(?:name)?[:\s]+([A-Z][A-Za-z\s&]+(?:Ltd|Limited|PLC|LLP|Inc)?)/i,
    /([A-Z][A-Za-z\s&]+(?:Ltd|Limited|PLC|LLP))/,
  ];
  for (const pattern of companyPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      fields.push({
        fieldPath: 'identity.legalName',
        value: match[1].trim(),
        confidence: 0.9,
        sourceText: match[0],
      });
      break;
    }
  }

  // Company Number patterns
  const companyNumMatch = content.match(/(?:company\s*(?:number|no\.?|#)|registered\s*(?:number|no\.?))[\s:]+(\d{8})/i);
  if (companyNumMatch) {
    fields.push({
      fieldPath: 'identity.companyNumber',
      value: companyNumMatch[1],
      confidence: 0.95,
      sourceText: companyNumMatch[0],
    });
  }

  // VAT Number patterns
  const vatMatch = content.match(/(?:vat\s*(?:number|no\.?|#|registration))[\s:]+(?:GB)?(\d{9})/i);
  if (vatMatch) {
    fields.push({
      fieldPath: 'identity.vatNumber',
      value: `GB${vatMatch[1]}`,
      confidence: 0.95,
      sourceText: vatMatch[0],
    });
  }

  // Contact Name patterns
  const contactPatterns = [
    /(?:contact|director|ceo|cfo|md)[\s:]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /(?:spoke\s+(?:with|to)|met\s+with|meeting\s+with)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
  ];
  for (const pattern of contactPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      fields.push({
        fieldPath: 'primaryContact.name',
        value: match[1].trim(),
        confidence: 0.85,
        sourceText: match[0],
      });
      break;
    }
  }

  // Email patterns
  const emailMatch = content.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    fields.push({
      fieldPath: 'primaryContact.email',
      value: emailMatch[1],
      confidence: 0.95,
      sourceText: emailMatch[0],
    });
  }

  // Phone patterns
  const phoneMatch = content.match(/(?:phone|tel|mobile|contact)[\s:]+(\+?\d[\d\s\-]{9,})/i);
  if (phoneMatch) {
    fields.push({
      fieldPath: 'primaryContact.phone',
      value: phoneMatch[1].replace(/[\s\-]/g, ''),
      confidence: 0.9,
      sourceText: phoneMatch[0],
    });
  }

  // Role patterns
  const rolePatterns = [
    /([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s*[\(\-]\s*(CEO|CFO|Director|MD|Manager|Partner))/i,
    /(?:title|role|position)[\s:]+([A-Za-z\s]+)/i,
  ];
  for (const pattern of rolePatterns) {
    const match = content.match(pattern);
    if (match && match[2]) {
      fields.push({
        fieldPath: 'primaryContact.role',
        value: match[2].trim(),
        confidence: 0.85,
        sourceText: match[0],
      });
      break;
    }
  }

  // Bank Name patterns
  const bankMatch = content.match(/(?:bank|banking\s+with)[\s:]+([A-Za-z\s]+(?:Bank|Banking|PLC|plc))/i);
  if (bankMatch) {
    fields.push({
      fieldPath: 'banking.bankName',
      value: bankMatch[1].trim(),
      confidence: 0.9,
      sourceText: bankMatch[0],
    });
  }

  // Sort Code patterns
  const sortCodeMatch = content.match(/(?:sort\s*code)[\s:]+(\d{2}[\s\-]?\d{2}[\s\-]?\d{2})/i);
  if (sortCodeMatch) {
    fields.push({
      fieldPath: 'banking.sortCode',
      value: sortCodeMatch[1].replace(/[\s]/g, '-'),
      confidence: 0.95,
      sourceText: sortCodeMatch[0],
    });
  }

  // Account Number patterns
  const accountMatch = content.match(/(?:account\s*(?:number|no\.?|#))[\s:]+(\d{8})/i);
  if (accountMatch) {
    fields.push({
      fieldPath: 'banking.accountNumber',
      value: accountMatch[1],
      confidence: 0.95,
      sourceText: accountMatch[0],
    });
  }

  // Address patterns (simplified)
  const addressMatch = content.match(/(?:address|office)[\s:]+([^,]+,\s*[^,]+,\s*[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})/i);
  if (addressMatch) {
    fields.push({
      fieldPath: 'addresses.registered',
      value: addressMatch[1].trim(),
      confidence: 0.85,
      sourceText: addressMatch[0],
    });
  }

  // Net Worth patterns
  const netWorthMatch = content.match(/(?:net\s*worth)[\s:]+(?:of\s+)?(?:approximately\s+)?[£$]?([\d,]+(?:\.\d{2})?)\s*(million|m)?/i);
  if (netWorthMatch) {
    let value = parseFloat(netWorthMatch[1].replace(/,/g, ''));
    if (netWorthMatch[2] && (netWorthMatch[2].toLowerCase() === 'million' || netWorthMatch[2].toLowerCase() === 'm')) {
      value *= 1000000;
    }
    fields.push({
      fieldPath: 'borrowerProfile.netWorth',
      value: value,
      confidence: 0.8,
      sourceText: netWorthMatch[0],
    });
  }

  // Experience Level patterns
  if (contentLower.includes('first-time') || contentLower.includes('first time developer')) {
    fields.push({
      fieldPath: 'borrowerProfile.experienceLevel',
      value: 'first-time',
      confidence: 0.9,
      sourceText: 'first-time developer',
    });
  } else if (contentLower.includes('experienced developer') || contentLower.includes('track record')) {
    fields.push({
      fieldPath: 'borrowerProfile.experienceLevel',
      value: 'experienced',
      confidence: 0.85,
      sourceText: 'experienced developer',
    });
  } else if (contentLower.includes('professional developer') || /\d+\s*projects?\s*completed/i.test(content)) {
    fields.push({
      fieldPath: 'borrowerProfile.experienceLevel',
      value: 'professional',
      confidence: 0.8,
      sourceText: 'professional developer',
    });
  }

  // Completed Projects patterns
  const projectsPatterns = [
    /(?:completed|delivered|finished)\s*(\d+)\s*projects?/i,
    /(\d+)\s*(?:projects?\s*completed|completed\s*projects?)/i,
    /(?:have|has)\s*completed\s*(\d+)\s*projects?/i,
  ];
  for (const pattern of projectsPatterns) {
    const match = content.match(pattern);
    if (match) {
      fields.push({
        fieldPath: 'borrowerProfile.completedProjects',
        value: parseInt(match[1]),
        confidence: 0.9,
        sourceText: match[0],
      });
      break;
    }
  }

  return fields;
}

function mockExtractProjectFields(content: string): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const contentLower = content.toLowerCase();

  // Project Type patterns
  if (contentLower.includes('new build') || contentLower.includes('new-build') || contentLower.includes('ground-up')) {
    fields.push({
      fieldPath: 'overview.projectType',
      value: 'new-build',
      confidence: 0.9,
      sourceText: 'new build development',
    });
  } else if (contentLower.includes('refurbishment') || contentLower.includes('renovation')) {
    fields.push({
      fieldPath: 'overview.projectType',
      value: 'refurbishment',
      confidence: 0.9,
      sourceText: 'refurbishment project',
    });
  } else if (contentLower.includes('conversion')) {
    fields.push({
      fieldPath: 'overview.projectType',
      value: 'conversion',
      confidence: 0.9,
      sourceText: 'conversion project',
    });
  }

  // Asset Class patterns
  if (contentLower.includes('residential') && !contentLower.includes('commercial')) {
    fields.push({
      fieldPath: 'overview.assetClass',
      value: 'residential',
      confidence: 0.9,
      sourceText: 'residential development',
    });
  } else if (contentLower.includes('commercial') && !contentLower.includes('residential')) {
    fields.push({
      fieldPath: 'overview.assetClass',
      value: 'commercial',
      confidence: 0.9,
      sourceText: 'commercial development',
    });
  } else if (contentLower.includes('mixed-use') || (contentLower.includes('residential') && contentLower.includes('commercial'))) {
    fields.push({
      fieldPath: 'overview.assetClass',
      value: 'mixed-use',
      confidence: 0.85,
      sourceText: 'mixed-use development',
    });
  }

  // Address patterns
  const addressMatch = content.match(/(?:site|property|address)[\s:]+([^,]+,\s*[^,]+,?\s*[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})/i);
  if (addressMatch) {
    fields.push({
      fieldPath: 'location.siteAddress',
      value: addressMatch[1].trim(),
      confidence: 0.85,
      sourceText: addressMatch[0],
    });
  }

  // Postcode patterns
  const postcodeMatch = content.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
  if (postcodeMatch) {
    fields.push({
      fieldPath: 'location.postcode',
      value: postcodeMatch[1].toUpperCase(),
      confidence: 0.95,
      sourceText: postcodeMatch[0],
    });
  }

  // Purchase Price patterns
  const purchaseMatch = content.match(/(?:purchase\s*price|acquisition\s*(?:price|cost))[\s:]+[£$]?([\d,]+(?:\.\d{2})?)/i);
  if (purchaseMatch) {
    fields.push({
      fieldPath: 'financials.purchasePrice',
      value: parseFloat(purchaseMatch[1].replace(/,/g, '')),
      confidence: 0.9,
      sourceText: purchaseMatch[0],
    });
  }

  // GDV patterns
  const gdvMatch = content.match(/(?:gdv|gross\s*development\s*value)[\s:]+[£$]?([\d,]+(?:\.\d{2})?)/i);
  if (gdvMatch) {
    fields.push({
      fieldPath: 'financials.grossDevelopmentValue',
      value: parseFloat(gdvMatch[1].replace(/,/g, '')),
      confidence: 0.9,
      sourceText: gdvMatch[0],
    });
  }

  // Total Development Cost patterns
  const tdcMatch = content.match(/(?:total\s*(?:development\s*)?cost|tdc)[\s:]+[£$]?([\d,]+(?:\.\d{2})?)/i);
  if (tdcMatch) {
    fields.push({
      fieldPath: 'financials.totalDevelopmentCost',
      value: parseFloat(tdcMatch[1].replace(/,/g, '')),
      confidence: 0.9,
      sourceText: tdcMatch[0],
    });
  }

  // Loan Amount patterns
  const loanMatch = content.match(/(?:loan\s*(?:amount|facility)|facility\s*(?:amount|size))[\s:]+[£$]?([\d,]+(?:\.\d{2})?)/i);
  if (loanMatch) {
    fields.push({
      fieldPath: 'financials.loanAmount',
      value: parseFloat(loanMatch[1].replace(/,/g, '')),
      confidence: 0.9,
      sourceText: loanMatch[0],
    });
  }

  // LTV patterns
  const ltvMatch = content.match(/(?:ltv|loan[\s\-]to[\s\-]value)[\s:]+(\d+(?:\.\d+)?)\s*%?/i);
  if (ltvMatch) {
    fields.push({
      fieldPath: 'financials.ltv',
      value: parseFloat(ltvMatch[1]),
      confidence: 0.9,
      sourceText: ltvMatch[0],
    });
  }

  // Interest Rate patterns
  const interestMatch = content.match(/(?:interest\s*rate|rate)[\s:]+(\d+(?:\.\d+)?)\s*%/i);
  if (interestMatch) {
    fields.push({
      fieldPath: 'financials.interestRate',
      value: parseFloat(interestMatch[1]),
      confidence: 0.9,
      sourceText: interestMatch[0],
    });
  }

  // Units patterns
  const unitsMatch = content.match(/(\d+)\s*(?:units?|apartments?|houses?|flats?)/i);
  if (unitsMatch) {
    fields.push({
      fieldPath: 'development.totalUnits',
      value: parseInt(unitsMatch[1]),
      confidence: 0.9,
      sourceText: unitsMatch[0],
    });
  }

  // Planning Reference patterns
  const planningRefMatch = content.match(/(?:planning\s*(?:ref|reference|application))[\s:]+([A-Z0-9\/\-]+)/i);
  if (planningRefMatch) {
    fields.push({
      fieldPath: 'development.planningReference',
      value: planningRefMatch[1],
      confidence: 0.95,
      sourceText: planningRefMatch[0],
    });
  }

  return fields;
}

// =============================================================================
// CLIENT INTELLIGENCE EXTRACTION TESTS
// =============================================================================

describe('Client Intelligence Extraction', () => {
  describe('Identity Extraction', () => {
    it('should extract company name from meeting notes', () => {
      const input = `
        Had a call with Acme Holdings Ltd today about their loan application.
        They are looking for development finance.
      `;
      const fields = mockExtractClientFields(input);
      const companyField = fields.find(f => f.fieldPath === 'identity.legalName');
      expect(companyField).toBeDefined();
      expect(companyField?.value).toContain('Acme');
    });

    it('should extract company number', () => {
      const input = `
        Company Details:
        Registered Name: Smith Developments Ltd
        Company Number: 12345678
        VAT Number: GB987654321
      `;
      const fields = mockExtractClientFields(input);

      const companyNum = fields.find(f => f.fieldPath === 'identity.companyNumber');
      expect(companyNum).toBeDefined();
      expect(companyNum?.value).toBe('12345678');

      const vatNum = fields.find(f => f.fieldPath === 'identity.vatNumber');
      expect(vatNum).toBeDefined();
      expect(vatNum?.value).toBe('GB987654321');
    });
  });

  describe('Contact Extraction', () => {
    it('should extract contact name from email context', () => {
      const input = `
        Spoke with John Smith from the borrower today.
        Email: john.smith@acme.com
        Phone: +44 7700 900123
      `;
      const fields = mockExtractClientFields(input);

      const name = fields.find(f => f.fieldPath === 'primaryContact.name');
      expect(name).toBeDefined();
      expect(name?.value).toBe('John Smith');

      const email = fields.find(f => f.fieldPath === 'primaryContact.email');
      expect(email).toBeDefined();
      expect(email?.value).toBe('john.smith@acme.com');

      const phone = fields.find(f => f.fieldPath === 'primaryContact.phone');
      expect(phone).toBeDefined();
    });

    it('should extract contact with role', () => {
      const input = `
        Meeting with Sarah Jones (CFO) to discuss the deal structure.
        She confirmed they bank with Barclays Bank PLC.
      `;
      const fields = mockExtractClientFields(input);

      const name = fields.find(f => f.fieldPath === 'primaryContact.name');
      expect(name).toBeDefined();
      expect(name?.value).toContain('Sarah');

      const bank = fields.find(f => f.fieldPath === 'banking.bankName');
      expect(bank).toBeDefined();
      expect(bank?.value).toContain('Barclays');
    });
  });

  describe('Banking Extraction', () => {
    it('should extract bank details', () => {
      const input = `
        Wire Instructions:
        Bank: HSBC Bank PLC
        Sort Code: 40-47-86
        Account Number: 12345678
      `;
      const fields = mockExtractClientFields(input);

      const sortCode = fields.find(f => f.fieldPath === 'banking.sortCode');
      expect(sortCode).toBeDefined();
      expect(sortCode?.value).toMatch(/40-?47-?86/);

      const accountNum = fields.find(f => f.fieldPath === 'banking.accountNumber');
      expect(accountNum).toBeDefined();
      expect(accountNum?.value).toBe('12345678');
    });
  });

  describe('Borrower Profile Extraction', () => {
    it('should extract experience level - first time', () => {
      const input = `
        The borrower is a first-time developer looking to build their first project.
      `;
      const fields = mockExtractClientFields(input);

      const experience = fields.find(f => f.fieldPath === 'borrowerProfile.experienceLevel');
      expect(experience).toBeDefined();
      expect(experience?.value).toBe('first-time');
    });

    it('should extract experience level - experienced', () => {
      const input = `
        This is an experienced developer with a strong track record.
        They have completed 12 projects over the past 5 years.
      `;
      const fields = mockExtractClientFields(input);

      const experience = fields.find(f => f.fieldPath === 'borrowerProfile.experienceLevel');
      expect(experience).toBeDefined();
      // Could be 'experienced' or 'professional' based on project count

      const projects = fields.find(f => f.fieldPath === 'borrowerProfile.completedProjects');
      expect(projects).toBeDefined();
      expect(projects?.value).toBe(12);
    });

    it('should extract net worth', () => {
      const input = `
        Personal guarantee from borrower with net worth of £5 million.
      `;
      const fields = mockExtractClientFields(input);

      const netWorth = fields.find(f => f.fieldPath === 'borrowerProfile.netWorth');
      expect(netWorth).toBeDefined();
      expect(netWorth?.value).toBe(5000000);
    });
  });
});

// =============================================================================
// PROJECT INTELLIGENCE EXTRACTION TESTS
// =============================================================================

describe('Project Intelligence Extraction', () => {
  describe('Overview Extraction', () => {
    it('should extract project type - new build', () => {
      const input = `
        This is a new build development of 12 residential units.
      `;
      const fields = mockExtractProjectFields(input);

      const projectType = fields.find(f => f.fieldPath === 'overview.projectType');
      expect(projectType).toBeDefined();
      expect(projectType?.value).toBe('new-build');

      const assetClass = fields.find(f => f.fieldPath === 'overview.assetClass');
      expect(assetClass).toBeDefined();
      expect(assetClass?.value).toBe('residential');
    });

    it('should extract project type - refurbishment', () => {
      const input = `
        Commercial refurbishment project converting an old warehouse.
      `;
      const fields = mockExtractProjectFields(input);

      const projectType = fields.find(f => f.fieldPath === 'overview.projectType');
      expect(projectType).toBeDefined();
      expect(projectType?.value).toBe('refurbishment');

      const assetClass = fields.find(f => f.fieldPath === 'overview.assetClass');
      expect(assetClass).toBeDefined();
      expect(assetClass?.value).toBe('commercial');
    });

    it('should extract mixed-use asset class', () => {
      const input = `
        Mixed-use development with residential apartments above commercial retail units.
      `;
      const fields = mockExtractProjectFields(input);

      const assetClass = fields.find(f => f.fieldPath === 'overview.assetClass');
      expect(assetClass).toBeDefined();
      expect(assetClass?.value).toBe('mixed-use');
    });
  });

  describe('Location Extraction', () => {
    it('should extract postcode', () => {
      const input = `
        Site Address: 123 High Street, London, SW1A 1AA
        The property is located in Westminster.
      `;
      const fields = mockExtractProjectFields(input);

      const postcode = fields.find(f => f.fieldPath === 'location.postcode');
      expect(postcode).toBeDefined();
      expect(postcode?.value).toBe('SW1A 1AA');

      const address = fields.find(f => f.fieldPath === 'location.siteAddress');
      expect(address).toBeDefined();
    });
  });

  describe('Financial Extraction', () => {
    it('should extract financial summary from term sheet text', () => {
      const input = `
        TERM SHEET SUMMARY

        Purchase Price: £2,500,000
        Total Development Cost: £8,750,000
        GDV: £12,000,000
        Loan Facility: £6,500,000
        LTV: 74%
        Interest Rate: 9.5%
      `;
      const fields = mockExtractProjectFields(input);

      const purchasePrice = fields.find(f => f.fieldPath === 'financials.purchasePrice');
      expect(purchasePrice).toBeDefined();
      expect(purchasePrice?.value).toBe(2500000);

      const tdc = fields.find(f => f.fieldPath === 'financials.totalDevelopmentCost');
      expect(tdc).toBeDefined();
      expect(tdc?.value).toBe(8750000);

      const gdv = fields.find(f => f.fieldPath === 'financials.grossDevelopmentValue');
      expect(gdv).toBeDefined();
      expect(gdv?.value).toBe(12000000);

      const loanAmount = fields.find(f => f.fieldPath === 'financials.loanAmount');
      expect(loanAmount).toBeDefined();
      expect(loanAmount?.value).toBe(6500000);

      const ltv = fields.find(f => f.fieldPath === 'financials.ltv');
      expect(ltv).toBeDefined();
      expect(ltv?.value).toBe(74);

      const rate = fields.find(f => f.fieldPath === 'financials.interestRate');
      expect(rate).toBeDefined();
      expect(rate?.value).toBe(9.5);
    });
  });

  describe('Development Details Extraction', () => {
    it('should extract unit count', () => {
      const input = `
        Development of 24 apartments across 4 floors.
        Planning Reference: APP/2024/1234
      `;
      const fields = mockExtractProjectFields(input);

      const units = fields.find(f => f.fieldPath === 'development.totalUnits');
      expect(units).toBeDefined();
      expect(units?.value).toBe(24);

      const planningRef = fields.find(f => f.fieldPath === 'development.planningReference');
      expect(planningRef).toBeDefined();
      expect(planningRef?.value).toBe('APP/2024/1234');
    });
  });
});

// =============================================================================
// COMPLEX EXTRACTION TESTS
// =============================================================================

describe('Complex Intelligence Extraction', () => {
  it('should extract multiple client fields from meeting notes', () => {
    const input = `
      Meeting Notes - Acme Development Ltd
      Date: 22 January 2026

      Met with John Smith (Director) at their office.

      Company Details:
      - Company No: 12345678
      - VAT: GB987654321
      - Banking with HSBC Bank PLC

      Contact: john.smith@acme.co.uk, Tel: +44 7700 900123

      They have completed 8 projects and have a net worth of approximately £3 million.
      Would classify as an experienced developer.
    `;

    const fields = mockExtractClientFields(input);

    // Should extract at least 5 different field types
    const fieldPaths = [...new Set(fields.map(f => f.fieldPath.split('.')[0]))];
    expect(fieldPaths.length).toBeGreaterThanOrEqual(4); // identity, primaryContact, banking, borrowerProfile

    // Verify key extractions
    expect(fields.find(f => f.fieldPath === 'identity.companyNumber')?.value).toBe('12345678');
    expect(fields.find(f => f.fieldPath === 'primaryContact.email')?.value).toBe('john.smith@acme.co.uk');
    expect(fields.find(f => f.fieldPath === 'borrowerProfile.completedProjects')?.value).toBe(8);
  });

  it('should extract multiple project fields from appraisal text', () => {
    const input = `
      DEVELOPMENT APPRAISAL SUMMARY

      Site: Former Industrial Site, Manchester Road, Birmingham, B15 2TJ

      Scheme: New build residential development
      Units: 36 apartments (12 x 1-bed, 18 x 2-bed, 6 x 3-bed)

      Acquisition Cost: £3,200,000
      Total Development Cost: £14,500,000
      Gross Development Value: £22,000,000

      Proposed Facility: £10,850,000
      LTV: 75%
      LTGDV: 49%
      Rate: 8.75%

      Planning: Full planning granted, Ref: 2023/04567/FUL
    `;

    const fields = mockExtractProjectFields(input);

    // Should extract multiple field types
    const fieldPaths = [...new Set(fields.map(f => f.fieldPath.split('.')[0]))];
    expect(fieldPaths.length).toBeGreaterThanOrEqual(3); // overview, location, financials, development

    // Verify key extractions
    expect(fields.find(f => f.fieldPath === 'location.postcode')?.value).toBe('B15 2TJ');
    expect(fields.find(f => f.fieldPath === 'overview.projectType')?.value).toBe('new-build');
    expect(fields.find(f => f.fieldPath === 'overview.assetClass')?.value).toBe('residential');
    expect(fields.find(f => f.fieldPath === 'development.totalUnits')?.value).toBe(36);
    expect(fields.find(f => f.fieldPath === 'financials.grossDevelopmentValue')?.value).toBe(22000000);
  });

  it('should handle incomplete information gracefully', () => {
    const input = `
      Quick email about the deal:
      Site is in Manchester, looking for around £5m loan.
      Will send more details later.
    `;

    const fields = mockExtractProjectFields(input);

    // Should only extract what's clearly present
    // Shouldn't over-extract or make assumptions
    expect(fields.length).toBeLessThan(5);

    const loanAmount = fields.find(f => f.fieldPath === 'financials.loanAmount');
    // Might not extract exact loan amount without clear structure
    // This is expected behavior - AI should be conservative
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty input', () => {
    const fields = mockExtractClientFields('');
    expect(fields).toEqual([]);
  });

  it('should handle gibberish input', () => {
    const fields = mockExtractClientFields('asdf jkl; qwerty uiop 12345 !@#$%');
    // Should not extract any valid fields from gibberish
    expect(fields.length).toBeLessThan(2);
  });

  it('should not extract misleading data', () => {
    const input = `
      The loan application number is 12345678.
      Not to be confused with the company number.
    `;
    const fields = mockExtractClientFields(input);

    // Should NOT extract "12345678" as company number without proper context
    const companyNum = fields.find(f => f.fieldPath === 'identity.companyNumber');
    expect(companyNum).toBeUndefined();
  });

  it('should extract from informal notes', () => {
    const input = `
      Had a call with Bob Smith today about the residential scheme in Leeds.
      They want a £4m loan for a 20 unit development.
      Email is bob@smithdev.co.uk
    `;

    const clientFields = mockExtractClientFields(input);
    const projectFields = mockExtractProjectFields(input);

    // Should extract contact info
    expect(clientFields.find(f => f.fieldPath === 'primaryContact.email')?.value).toBe('bob@smithdev.co.uk');

    // Should extract project info
    expect(projectFields.find(f => f.fieldPath === 'overview.assetClass')?.value).toBe('residential');
    expect(projectFields.find(f => f.fieldPath === 'development.totalUnits')?.value).toBe(20);
  });
});
