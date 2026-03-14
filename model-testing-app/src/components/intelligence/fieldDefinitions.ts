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
// CLIENT KYC FIELD DEFINITIONS
// ============================================================================

export const clientKycFields: FieldDefinition[] = [
  { key: 'kyc.idVerificationStatus', label: 'ID Verification Status', priority: 'critical' },
  { key: 'kyc.amlCheckDate', label: 'AML Check Date', priority: 'critical' },
  { key: 'kyc.pepScreening', label: 'PEP Screening', priority: 'important' },
  { key: 'kyc.sourceOfFunds', label: 'Source of Funds', multiline: true, priority: 'critical', expectedSource: 'Source of Funds Declaration' },
  { key: 'kyc.sourceOfWealth', label: 'Source of Wealth', multiline: true, priority: 'important' },
  { key: 'kyc.riskRating', label: 'Risk Rating', priority: 'important' },
  { key: 'kyc.sanctionsCheck', label: 'Sanctions Screening', priority: 'important' },
  { key: 'kyc.enhancedDueDiligence', label: 'Enhanced Due Diligence Notes', multiline: true, priority: 'optional' },
];

// ============================================================================
// CLIENT LEGAL FIELD DEFINITIONS
// ============================================================================

export const clientLegalFields: FieldDefinition[] = [
  { key: 'clientLegal.personalGuarantees', label: 'Personal Guarantees', multiline: true, priority: 'critical' },
  { key: 'clientLegal.legalDisputes', label: 'Legal Disputes', multiline: true, priority: 'important' },
  { key: 'clientLegal.bankruptcyHistory', label: 'Bankruptcy History', priority: 'critical' },
  { key: 'clientLegal.ccjs', label: 'County Court Judgements', priority: 'critical' },
  { key: 'clientLegal.restrictions', label: 'Legal Restrictions', multiline: true, priority: 'optional' },
];

// ============================================================================
// PROJECT LOAN TERMS FIELD DEFINITIONS
// ============================================================================

export const projectLoanTermsFields: FieldDefinition[] = [
  { key: 'loanTerms.facilityAmount', label: 'Facility Amount (£)', type: 'number', priority: 'critical', expectedSource: 'Facility Letter' },
  { key: 'loanTerms.netLoan', label: 'Net Loan (£)', type: 'number', priority: 'important' },
  { key: 'loanTerms.ltgdv', label: 'Loan to GDV (%)', type: 'number', priority: 'critical' },
  { key: 'loanTerms.interestRate', label: 'Interest Rate (%)', type: 'number', priority: 'critical', expectedSource: 'Facility Letter' },
  { key: 'loanTerms.arrangementFee', label: 'Arrangement Fee (£)', type: 'number', priority: 'important' },
  { key: 'loanTerms.exitFee', label: 'Exit Fee (£)', type: 'number', priority: 'important' },
  { key: 'loanTerms.termMonths', label: 'Facility Term (months)', type: 'number', priority: 'critical', expectedSource: 'Facility Letter' },
  { key: 'loanTerms.facilityType', label: 'Facility Type', priority: 'critical' },
  { key: 'loanTerms.drawdownSchedule', label: 'Drawdown Schedule', multiline: true, priority: 'important' },
  { key: 'loanTerms.covenantsSummary', label: 'Covenants Summary', multiline: true, priority: 'important' },
  { key: 'loanTerms.redemptionDate', label: 'Redemption Date', priority: 'important' },
];

// ============================================================================
// PROJECT CONSTRUCTION FIELD DEFINITIONS
// ============================================================================

export const projectConstructionFields: FieldDefinition[] = [
  { key: 'construction.contractType', label: 'Contract Type', priority: 'important' },
  { key: 'construction.contractSum', label: 'Contract Sum (£)', type: 'number', priority: 'critical', expectedSource: 'Build Contract' },
  { key: 'construction.programmeDuration', label: 'Programme Duration (months)', type: 'number', priority: 'important', expectedSource: 'Build Programme' },
  { key: 'construction.currentProgress', label: 'Current Progress (%)', type: 'number', priority: 'important' },
  { key: 'construction.defectsLiability', label: 'Defects Liability Period', priority: 'optional' },
  { key: 'construction.buildWarrantyProvider', label: 'Build Warranty Provider', priority: 'important' },
  { key: 'construction.retentionPercent', label: 'Retention (%)', type: 'number', priority: 'optional' },
  { key: 'construction.clerkOfWorks', label: 'Clerk of Works', priority: 'optional' },
];

// ============================================================================
// PROJECT TITLE FIELD DEFINITIONS
// ============================================================================

export const projectTitleFields: FieldDefinition[] = [
  { key: 'title.tenure', label: 'Tenure', priority: 'critical', expectedSource: 'Report on Title' },
  { key: 'title.leaseTermRemaining', label: 'Lease Term Remaining (years)', type: 'number', priority: 'important' },
  { key: 'title.groundRent', label: 'Ground Rent (£)', type: 'number', priority: 'optional' },
  { key: 'title.reportOnTitleStatus', label: 'Report on Title Status', priority: 'important' },
];

// ============================================================================
// PROJECT EXIT/SALES FIELD DEFINITIONS
// ============================================================================

export const projectExitFields: FieldDefinition[] = [
  { key: 'exit.strategy', label: 'Exit Strategy', priority: 'critical' },
  { key: 'exit.unitsReserved', label: 'Units Reserved', type: 'number', priority: 'important' },
  { key: 'exit.unitsExchanged', label: 'Units Exchanged', type: 'number', priority: 'important' },
  { key: 'exit.unitsCompleted', label: 'Units Completed', type: 'number', priority: 'important' },
  { key: 'exit.averageSalesPrice', label: 'Average Sales Price (£)', type: 'number', priority: 'important' },
  { key: 'exit.totalSalesRevenue', label: 'Total Sales Revenue (£)', type: 'number', priority: 'important' },
  { key: 'exit.salesAgent', label: 'Sales Agent', priority: 'optional' },
];

// ============================================================================
// PROJECT VALUATION FIELD DEFINITIONS
// ============================================================================

export const projectValuationFields: FieldDefinition[] = [
  { key: 'valuation.dayOneValue', label: 'Day One Value (£)', type: 'number', priority: 'important' },
  { key: 'valuation.reinspectionDate', label: 'Reinspection Date', priority: 'important' },
];

// ============================================================================
// PROJECT PLANNING FIELD DEFINITIONS
// ============================================================================

export const projectPlanningFields: FieldDefinition[] = [
  { key: 'planning.expiryDate', label: 'Planning Expiry Date', priority: 'important' },
  { key: 'planning.useClass', label: 'Use Class', priority: 'important' },
  { key: 'planning.conservationArea', label: 'Conservation Area', priority: 'optional' },
];

// ============================================================================
// PROJECT INSURANCE FIELD DEFINITIONS
// ============================================================================

export const projectInsuranceFields: FieldDefinition[] = [
  { key: 'insurance.buildingWorksPolicy', label: 'Building Works Policy', priority: 'important' },
  { key: 'insurance.professionalIndemnity', label: 'Professional Indemnity', priority: 'optional' },
  { key: 'insurance.contractorsAllRisks', label: 'Contractors All Risks', priority: 'important' },
  { key: 'insurance.publicLiability', label: 'Public Liability', priority: 'optional' },
  { key: 'insurance.structuralWarranty', label: 'Structural Warranty', priority: 'important' },
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
  ...clientKycFields,
  ...clientLegalFields,
];

export const getAllProjectFields = (): FieldDefinition[] => [
  ...projectOverviewFields,
  ...projectLocationFields,
  ...projectFinancialsFields,
  ...projectTimelineFields,
  ...projectDevelopmentFields,
  ...projectLoanTermsFields,
  ...projectConstructionFields,
  ...projectTitleFields,
  ...projectExitFields,
  ...projectValuationFields,
  ...projectPlanningFields,
  ...projectInsuranceFields,
];
