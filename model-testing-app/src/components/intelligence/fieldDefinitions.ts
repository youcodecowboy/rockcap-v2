// Intelligence Field Definitions
// Centralized field definitions for client and project intelligence

import type { FieldDefinition } from './types';

// ============================================================================
// CLIENT FIELD DEFINITIONS
// ============================================================================

export const clientBasicFields: FieldDefinition[] = [
  { key: 'identity.legalName', label: 'Legal Name', priority: 'critical', expectedSource: 'Certificate of Incorporation' },
  { key: 'identity.tradingName', label: 'Trading Name', priority: 'optional' },
  { key: 'identity.companyNumber', label: 'Company Number', priority: 'critical', expectedSource: 'Company Search' },
  { key: 'identity.vatNumber', label: 'VAT Number', priority: 'optional' },
  { key: 'identity.incorporationDate', label: 'Incorporation Date', priority: 'important', expectedSource: 'Certificate of Incorporation' },
  { key: 'primaryContact.name', label: 'Primary Contact Name', priority: 'critical' },
  { key: 'primaryContact.role', label: 'Primary Contact Role', priority: 'important' },
  { key: 'primaryContact.email', label: 'Primary Contact Email', type: 'email', priority: 'critical' },
  { key: 'primaryContact.phone', label: 'Primary Contact Phone', type: 'tel', priority: 'important' },
  { key: 'addresses.registered', label: 'Registered Address', multiline: true, priority: 'critical' },
  { key: 'addresses.trading', label: 'Trading Address', multiline: true, priority: 'optional' },
];

export const clientFinancialFields: FieldDefinition[] = [
  { key: 'banking.bankName', label: 'Bank Name', priority: 'important' },
  { key: 'banking.accountName', label: 'Account Name', priority: 'important' },
  { key: 'banking.accountNumber', label: 'Account Number', priority: 'critical', expectedSource: 'Bank Statement' },
  { key: 'banking.sortCode', label: 'Sort Code', priority: 'critical', expectedSource: 'Bank Statement' },
  { key: 'banking.iban', label: 'IBAN', priority: 'optional' },
  { key: 'banking.swift', label: 'SWIFT/BIC', priority: 'optional' },
];

export const borrowerProfileFields: FieldDefinition[] = [
  { key: 'borrowerProfile.experienceLevel', label: 'Experience Level', priority: 'critical' },
  { key: 'borrowerProfile.completedProjects', label: 'Completed Projects', type: 'number', priority: 'important', expectedSource: 'Track Record' },
  { key: 'borrowerProfile.totalDevelopmentValue', label: 'Total Development Value (£)', type: 'number', priority: 'important' },
  { key: 'borrowerProfile.netWorth', label: 'Net Worth (£)', type: 'number', priority: 'critical', expectedSource: 'Assets & Liabilities Statement' },
  { key: 'borrowerProfile.liquidAssets', label: 'Liquid Assets (£)', type: 'number', priority: 'critical', expectedSource: 'Bank Statement' },
];

export const lenderProfileFields: FieldDefinition[] = [
  { key: 'lenderProfile.dealSizeMin', label: 'Min Deal Size (£)', type: 'number', priority: 'important' },
  { key: 'lenderProfile.dealSizeMax', label: 'Max Deal Size (£)', type: 'number', priority: 'important' },
  { key: 'lenderProfile.preferredDealSize', label: 'Preferred Deal Size (£)', type: 'number', priority: 'optional' },
  { key: 'lenderProfile.typicalLTV', label: 'Typical LTV (%)', type: 'number', priority: 'important' },
  { key: 'lenderProfile.decisionSpeed', label: 'Decision Speed', priority: 'optional' },
];

// ============================================================================
// PROJECT FIELD DEFINITIONS
// ============================================================================

export const projectOverviewFields: FieldDefinition[] = [
  { key: 'overview.projectName', label: 'Project Name', priority: 'critical' },
  { key: 'overview.projectType', label: 'Project Type', priority: 'critical' },
  { key: 'overview.siteArea', label: 'Site Area', priority: 'important', expectedSource: 'Site Plans' },
  { key: 'overview.existingUse', label: 'Existing Use', priority: 'optional' },
  { key: 'overview.proposedUse', label: 'Proposed Use', priority: 'important' },
  { key: 'overview.numberOfUnits', label: 'Number of Units', type: 'number', priority: 'critical', expectedSource: 'Accommodation Schedule' },
  { key: 'overview.totalGIA', label: 'Total GIA (sq ft)', type: 'number', priority: 'important', expectedSource: 'Floor Plans' },
];

export const projectLocationFields: FieldDefinition[] = [
  { key: 'location.address', label: 'Address', multiline: true, priority: 'critical' },
  { key: 'location.postcode', label: 'Postcode', priority: 'critical' },
  { key: 'location.localAuthority', label: 'Local Authority', priority: 'important' },
  { key: 'location.region', label: 'Region', priority: 'optional' },
  { key: 'location.titleNumber', label: 'Title Number', priority: 'critical', expectedSource: 'Title Deed' },
  { key: 'location.tenure', label: 'Tenure', priority: 'critical', expectedSource: 'Report on Title' },
];

export const projectFinancialsFields: FieldDefinition[] = [
  { key: 'financials.purchasePrice', label: 'Purchase Price (£)', type: 'number', priority: 'critical', expectedSource: 'Purchase Agreement' },
  { key: 'financials.currentValue', label: 'Current Value (£)', type: 'number', priority: 'important', expectedSource: 'Appraisal' },
  { key: 'financials.buildCost', label: 'Build Cost (£)', type: 'number', priority: 'critical', expectedSource: 'Contract Sum Analysis' },
  { key: 'financials.contingency', label: 'Contingency (£)', type: 'number', priority: 'important' },
  { key: 'financials.professionalFees', label: 'Professional Fees (£)', type: 'number', priority: 'important' },
  { key: 'financials.totalDevelopmentCost', label: 'Total Development Cost (£)', type: 'number', priority: 'critical', isCritical: true },
  { key: 'financials.gdv', label: 'Gross Development Value (£)', type: 'number', priority: 'critical', expectedSource: 'Appraisal', isCritical: true },
  { key: 'financials.profit', label: 'Expected Profit (£)', type: 'number', priority: 'important' },
  { key: 'financials.profitMargin', label: 'Profit Margin (%)', type: 'number', priority: 'important' },
];

export const projectTimelineFields: FieldDefinition[] = [
  { key: 'timeline.startDate', label: 'Start Date', priority: 'critical', expectedSource: 'Build Programme' },
  { key: 'timeline.expectedCompletion', label: 'Expected Completion', priority: 'critical', expectedSource: 'Build Programme' },
  { key: 'timeline.projectDuration', label: 'Project Duration (months)', type: 'number', priority: 'important' },
  { key: 'timeline.planningStatus', label: 'Planning Status', priority: 'critical', expectedSource: 'Planning Documentation' },
  { key: 'timeline.planningReference', label: 'Planning Reference', priority: 'important' },
];

export const projectDevelopmentFields: FieldDefinition[] = [
  { key: 'development.totalUnits', label: 'Total Units', type: 'number', priority: 'critical', expectedSource: 'Accommodation Schedule' },
  { key: 'development.totalSqFt', label: 'Total Sq Ft', type: 'number', priority: 'important', expectedSource: 'Floor Plans' },
  { key: 'development.siteArea', label: 'Site Area (acres)', type: 'number', priority: 'important' },
  { key: 'development.planningReference', label: 'Planning Reference', priority: 'important' },
  { key: 'development.planningStatus', label: 'Planning Status', priority: 'critical' },
];

// ============================================================================
// KEY PARTIES FIELD DEFINITIONS
// ============================================================================

export const keyPartiesFields = {
  borrower: [
    { key: 'keyParties.borrower.name', label: 'Company Name', priority: 'critical' as const },
    { key: 'keyParties.borrower.contactName', label: 'Contact Name', priority: 'important' as const },
    { key: 'keyParties.borrower.contactEmail', label: 'Email', type: 'email' as const, priority: 'important' as const },
  ],
  lender: [
    { key: 'keyParties.lender.name', label: 'Lender Name', priority: 'critical' as const },
    { key: 'keyParties.lender.contactName', label: 'Contact Name', priority: 'important' as const },
    { key: 'keyParties.lender.contactEmail', label: 'Email', type: 'email' as const, priority: 'important' as const },
  ],
  solicitor: [
    { key: 'keyParties.solicitor.firm', label: 'Firm Name', priority: 'important' as const },
    { key: 'keyParties.solicitor.contactName', label: 'Contact Name', priority: 'optional' as const },
    { key: 'keyParties.solicitor.contactEmail', label: 'Email', type: 'email' as const, priority: 'optional' as const },
  ],
  valuer: [
    { key: 'keyParties.valuer.firm', label: 'Firm Name', priority: 'important' as const },
    { key: 'keyParties.valuer.contactName', label: 'Contact Name', priority: 'optional' as const },
  ],
  architect: [
    { key: 'keyParties.architect.firm', label: 'Firm Name', priority: 'optional' as const },
    { key: 'keyParties.architect.contactName', label: 'Contact Name', priority: 'optional' as const },
  ],
  contractor: [
    { key: 'keyParties.contractor.firm', label: 'Firm Name', priority: 'critical' as const, expectedSource: 'Build Contract' },
    { key: 'keyParties.contractor.contactName', label: 'Contact Name', priority: 'important' as const },
    { key: 'keyParties.contractor.contractValue', label: 'Contract Value (£)', type: 'number' as const, priority: 'critical' as const, expectedSource: 'Build Contract' },
  ],
  monitoringSurveyor: [
    { key: 'keyParties.monitoringSurveyor.firm', label: 'Firm Name', priority: 'important' as const },
    { key: 'keyParties.monitoringSurveyor.contactName', label: 'Contact Name', priority: 'optional' as const },
  ],
};

// ============================================================================
// AI INSIGHTS FIELD DEFINITIONS
// ============================================================================

export const clientInsightsFields: FieldDefinition[] = [
  { key: 'aiSummary.executiveSummary', label: 'Executive Summary', multiline: true, priority: 'important' },
];

export const projectInsightsFields: FieldDefinition[] = [
  { key: 'aiSummary.executiveSummary', label: 'Executive Summary', multiline: true, priority: 'important' },
];

// ============================================================================
// ALL FIELDS COMBINED (for completeness calculations)
// ============================================================================

export const getAllClientFields = (isLender: boolean): FieldDefinition[] => [
  ...clientBasicFields,
  ...clientFinancialFields,
  ...(isLender ? lenderProfileFields : borrowerProfileFields),
];

export const getAllProjectFields = (): FieldDefinition[] => [
  ...projectOverviewFields,
  ...projectLocationFields,
  ...projectFinancialsFields,
  ...projectTimelineFields,
  ...projectDevelopmentFields,
];
