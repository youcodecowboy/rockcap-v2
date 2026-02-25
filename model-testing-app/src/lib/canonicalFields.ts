/**
 * Canonical Fields Library
 *
 * Defines the standard taxonomy of fields for client and project intelligence.
 * Used for:
 * - Extraction normalization (flexible input → canonical storage)
 * - Template retrieval (predictable field paths for document generation)
 * - Checklist field hints (what data a document type typically provides)
 */

// =============================================================================
// TYPES
// =============================================================================

export type FieldType = 'string' | 'number' | 'currency' | 'date' | 'percentage' | 'array' | 'text' | 'boolean';

export interface CanonicalFieldConfig {
  label: string;
  type: FieldType;
  description?: string;
  aliases: string[];
}

export interface NormalizationResult {
  canonicalPath: string | null;
  customPath: string | null;
  confidence: number;
  matchedAlias?: string;
}

// =============================================================================
// CLIENT CANONICAL FIELDS (35 fields)
// =============================================================================

export const CLIENT_CANONICAL_FIELDS: Record<string, CanonicalFieldConfig> = {
  // === CONTACT (10 fields) ===
  'contact.primaryName': {
    label: 'Primary Contact Name',
    type: 'string',
    description: 'Main point of contact for this client',
    aliases: ['name', 'contact name', 'primary name', 'main contact', 'key contact', 'full name', 'client name', 'borrower name', 'principal name']
  },
  'contact.email': {
    label: 'Email Address',
    type: 'string',
    description: 'Primary email for correspondence',
    aliases: ['email', 'email address', 'contact email', 'primary email', 'e-mail', 'mail']
  },
  'contact.phone': {
    label: 'Phone Number',
    type: 'string',
    description: 'Primary phone number',
    aliases: ['phone', 'telephone', 'mobile', 'cell', 'contact number', 'tel', 'phone number', 'mobile number', 'cell phone']
  },
  'contact.secondaryName': {
    label: 'Secondary Contact',
    type: 'string',
    description: 'Alternative contact person',
    aliases: ['secondary contact', 'alternate contact', 'other contact', 'additional contact', 'co-borrower']
  },
  'contact.secondaryEmail': {
    label: 'Secondary Email',
    type: 'string',
    aliases: ['alternate email', 'other email', 'secondary email', 'additional email']
  },
  'contact.secondaryPhone': {
    label: 'Secondary Phone',
    type: 'string',
    aliases: ['alternate phone', 'other phone', 'secondary phone', 'additional phone']
  },
  'contact.role': {
    label: 'Role/Title',
    type: 'string',
    description: 'Job title or role of primary contact',
    aliases: ['title', 'job title', 'position', 'role', 'occupation', 'profession']
  },
  'contact.preferredContactMethod': {
    label: 'Preferred Contact Method',
    type: 'string',
    aliases: ['contact preference', 'best way to reach', 'preferred method', 'preferred contact']
  },
  'contact.personalAddress': {
    label: 'Personal Address',
    type: 'string',
    aliases: ['home address', 'residential address', 'personal address', 'address', 'resident at']
  },
  'contact.nationality': {
    label: 'Nationality',
    type: 'string',
    aliases: ['citizenship', 'country of origin', 'nationality', 'national']
  },

  // === COMPANY (12 fields) ===
  'company.name': {
    label: 'Company Name',
    type: 'string',
    description: 'Legal registered company name',
    aliases: ['company', 'business name', 'entity name', 'legal name', 'registered name', 'company name', 'corporate name', 'firm name', 'organization']
  },
  'company.tradingName': {
    label: 'Trading Name',
    type: 'string',
    aliases: ['trading as', 'dba', 'doing business as', 't/a', 'trade name', 'operating as']
  },
  'company.registrationNumber': {
    label: 'Company Registration Number',
    type: 'string',
    description: 'Companies House registration number',
    aliases: ['company number', 'reg number', 'registration no', 'companies house number', 'crn', 'company reg', 'registration number', 'registered number', 'co number', 'co. no']
  },
  'company.registeredAddress': {
    label: 'Registered Office Address',
    type: 'string',
    description: 'Official registered address',
    aliases: ['registered address', 'office address', 'company address', 'business address', 'registered office', 'corporate address', 'head office']
  },
  'company.incorporationDate': {
    label: 'Date of Incorporation',
    type: 'date',
    aliases: ['incorporation date', 'date incorporated', 'formed date', 'established', 'date of formation', 'formation date', 'founded']
  },
  'company.companyType': {
    label: 'Company Type',
    type: 'string',
    description: 'Ltd, LLP, PLC, etc.',
    aliases: ['entity type', 'business type', 'legal structure', 'company structure', 'corporate structure', 'legal form']
  },
  'company.sicCode': {
    label: 'SIC Code',
    type: 'string',
    aliases: ['sic', 'industry code', 'sector code', 'sic code', 'nature of business']
  },
  'company.vatNumber': {
    label: 'VAT Number',
    type: 'string',
    aliases: ['vat', 'vat registration', 'vat no', 'vat number', 'tax number']
  },
  'company.directors': {
    label: 'Directors',
    type: 'array',
    description: 'List of company directors',
    aliases: ['director names', 'board members', 'company directors', 'director', 'officers']
  },
  'company.shareholders': {
    label: 'Shareholders',
    type: 'array',
    description: 'List of shareholders with ownership %',
    aliases: ['owners', 'ownership', 'shareholder structure', 'equity holders', 'shareholders', 'members', 'partners']
  },
  'company.ultimateBeneficialOwner': {
    label: 'Ultimate Beneficial Owner',
    type: 'string',
    aliases: ['ubo', 'beneficial owner', 'ultimate owner', 'controlling party', 'psc', 'person of significant control']
  },
  'company.parentCompany': {
    label: 'Parent Company',
    type: 'string',
    aliases: ['holding company', 'parent entity', 'group company', 'parent', 'group']
  },

  // === FINANCIAL (8 fields) ===
  'financial.netWorth': {
    label: 'Net Worth',
    type: 'currency',
    description: 'Total net worth of client/principals',
    aliases: ['net worth', 'total worth', 'wealth', 'assets minus liabilities', 'net assets', 'total assets']
  },
  'financial.liquidAssets': {
    label: 'Liquid Assets',
    type: 'currency',
    aliases: ['liquid assets', 'cash available', 'available funds', 'liquidity', 'cash', 'liquid funds', 'cash reserves']
  },
  'financial.annualIncome': {
    label: 'Annual Income',
    type: 'currency',
    aliases: ['income', 'yearly income', 'annual earnings', 'salary', 'annual income', 'yearly earnings', 'revenue']
  },
  'financial.propertyPortfolioValue': {
    label: 'Property Portfolio Value',
    type: 'currency',
    aliases: ['portfolio value', 'property holdings', 'real estate value', 'total property value', 'property value', 'portfolio', 'real estate portfolio']
  },
  'financial.existingDebt': {
    label: 'Existing Debt/Borrowing',
    type: 'currency',
    aliases: ['current debt', 'existing loans', 'borrowings', 'liabilities', 'debt', 'outstanding loans', 'existing borrowing']
  },
  'financial.creditScore': {
    label: 'Credit Score',
    type: 'number',
    aliases: ['credit rating', 'credit history', 'credit score', 'credit']
  },
  'financial.bankName': {
    label: 'Primary Bank',
    type: 'string',
    aliases: ['bank', 'banking relationship', 'main bank', 'bank name', 'banker']
  },
  'financial.accountantContact': {
    label: 'Accountant/Financial Advisor',
    type: 'string',
    aliases: ['accountant', 'financial advisor', 'cpa', 'tax advisor', 'accountant name', 'auditor']
  },

  // === EXPERIENCE (5 fields) ===
  'experience.developmentHistory': {
    label: 'Development Experience',
    type: 'text',
    description: 'Summary of past development projects',
    aliases: ['track record', 'past projects', 'development history', 'experience', 'previous developments', 'cv', 'background']
  },
  'experience.projectsCompleted': {
    label: 'Number of Projects Completed',
    type: 'number',
    aliases: ['projects completed', 'deals done', 'completed developments', 'number of projects', 'completions']
  },
  'experience.totalGDV': {
    label: 'Total GDV Delivered',
    type: 'currency',
    description: 'Cumulative GDV of completed projects',
    aliases: ['total gdv', 'cumulative gdv', 'gdv track record', 'gdv delivered', 'historical gdv']
  },
  'experience.specializations': {
    label: 'Specializations',
    type: 'array',
    description: 'Types of projects they specialize in',
    aliases: ['specialty', 'focus areas', 'expertise', 'specialization', 'sector focus', 'specialism']
  },
  'experience.geographicFocus': {
    label: 'Geographic Focus',
    type: 'string',
    aliases: ['locations', 'markets', 'regions', 'geographic area', 'area', 'geography', 'location focus']
  },
};

// =============================================================================
// PROJECT CANONICAL FIELDS (25 fields)
// =============================================================================

export const PROJECT_CANONICAL_FIELDS: Record<string, CanonicalFieldConfig> = {
  // === OVERVIEW (6 fields) ===
  'overview.projectName': {
    label: 'Project Name',
    type: 'string',
    aliases: ['project', 'development name', 'scheme name', 'site name', 'project name', 'development', 'scheme']
  },
  'overview.projectType': {
    label: 'Project Type',
    type: 'string',
    description: 'new-build, refurbishment, conversion, etc.',
    aliases: ['type', 'development type', 'scheme type', 'project type', 'build type']
  },
  'overview.assetClass': {
    label: 'Asset Class',
    type: 'string',
    description: 'residential, commercial, mixed-use, etc.',
    aliases: ['asset type', 'property type', 'use class', 'sector', 'asset class', 'use', 'category']
  },
  'overview.description': {
    label: 'Project Description',
    type: 'text',
    aliases: ['description', 'summary', 'overview', 'scheme description', 'project description', 'details']
  },
  'overview.unitCount': {
    label: 'Number of Units',
    type: 'number',
    aliases: ['units', 'unit count', 'number of homes', 'dwellings', 'number of units', 'unit number', 'no. of units', 'total units']
  },
  'overview.totalSqft': {
    label: 'Total Square Footage',
    type: 'number',
    aliases: ['sqft', 'square feet', 'area', 'floor area', 'nia', 'gia', 'square footage', 'sq ft', 'size', 'total area']
  },

  // === LOCATION (4 fields) ===
  'location.siteAddress': {
    label: 'Site Address',
    type: 'string',
    aliases: ['address', 'property address', 'site location', 'development address', 'site address', 'location', 'site']
  },
  'location.postcode': {
    label: 'Postcode',
    type: 'string',
    aliases: ['post code', 'zip', 'postal code', 'postcode', 'zip code']
  },
  'location.localAuthority': {
    label: 'Local Authority',
    type: 'string',
    aliases: ['council', 'la', 'local council', 'planning authority', 'local authority', 'lpa', 'borough']
  },
  'location.titleNumber': {
    label: 'Title Number',
    type: 'string',
    aliases: ['land registry title', 'title no', 'land registry number', 'title number', 'title', 'lr number']
  },

  // === FINANCIALS (10 fields) ===
  'financials.purchasePrice': {
    label: 'Purchase Price',
    type: 'currency',
    aliases: ['acquisition price', 'land price', 'site cost', 'purchase cost', 'purchase price', 'acquisition cost', 'land cost', 'site price']
  },
  'financials.currentValue': {
    label: 'Current Market Value',
    type: 'currency',
    aliases: ['cmv', 'market value', 'current value', 'valuation', 'current market value', 'open market value', 'omv']
  },
  'financials.totalDevelopmentCost': {
    label: 'Total Development Cost',
    type: 'currency',
    aliases: ['tdc', 'total cost', 'development cost', 'all-in cost', 'total development cost', 'total project cost', 'total costs']
  },
  'financials.constructionCost': {
    label: 'Construction Cost',
    type: 'currency',
    aliases: ['build cost', 'construction budget', 'hard costs', 'construction cost', 'building cost', 'works cost', 'build costs']
  },
  'financials.gdv': {
    label: 'Gross Development Value',
    type: 'currency',
    aliases: ['gdv', 'end value', 'completed value', 'gross value', 'gross development value', 'sales value', 'exit value']
  },
  'financials.loanAmount': {
    label: 'Loan Amount Requested',
    type: 'currency',
    aliases: ['loan required', 'funding required', 'borrowing', 'debt amount', 'facility size', 'loan amount', 'loan', 'debt', 'facility', 'loan request', 'funding']
  },
  'financials.ltv': {
    label: 'Loan to Value',
    type: 'percentage',
    aliases: ['ltv', 'loan to value', 'leverage', 'gearing']
  },
  'financials.ltc': {
    label: 'Loan to Cost',
    type: 'percentage',
    aliases: ['ltc', 'loan to cost', 'ltgdv', 'loan to gdv']
  },
  'financials.equityContribution': {
    label: 'Equity Contribution',
    type: 'currency',
    aliases: ['equity', 'cash in', 'deposit', 'client contribution', 'equity contribution', 'equity input', 'cash contribution', 'client equity']
  },
  'financials.profitMargin': {
    label: 'Expected Profit Margin',
    type: 'percentage',
    aliases: ['profit', 'margin', 'profit on cost', 'poc', 'developer profit', 'profit margin', 'developer margin', 'return']
  },

  // === TIMELINE (5 fields) ===
  'timeline.acquisitionDate': {
    label: 'Acquisition Date',
    type: 'date',
    aliases: ['purchase date', 'completion date', 'exchange date', 'acquisition date', 'acquisition', 'land purchase date']
  },
  'timeline.planningStatus': {
    label: 'Planning Status',
    type: 'string',
    aliases: ['planning', 'planning permission', 'consent status', 'planning status', 'pp status', 'planning consent']
  },
  'timeline.constructionStart': {
    label: 'Construction Start Date',
    type: 'date',
    aliases: ['start date', 'build start', 'commencement', 'construction start', 'start on site', 'site start', 'works start']
  },
  'timeline.practicalCompletion': {
    label: 'Practical Completion Date',
    type: 'date',
    aliases: ['completion date', 'pc date', 'end date', 'finish date', 'practical completion', 'pc', 'completion', 'target completion']
  },
  'timeline.projectDuration': {
    label: 'Project Duration (months)',
    type: 'number',
    aliases: ['duration', 'build period', 'construction period', 'term', 'project duration', 'build time', 'loan term', 'facility term']
  },

  // === LEGAL (7 fields) ===
  'legal.titleDetails': {
    label: 'Title Details',
    type: 'text',
    description: 'Title ownership and registration details',
    aliases: ['title details', 'title report', 'land registry', 'title ownership', 'registered title', 'title information']
  },
  'legal.charges': {
    label: 'Charges / Encumbrances',
    type: 'text',
    description: 'Charges, liens, and encumbrances on title',
    aliases: ['charges', 'encumbrances', 'liens', 'registered charges', 'mortgages on title', 'existing charges', 'prior charges']
  },
  'legal.covenants': {
    label: 'Restrictive Covenants',
    type: 'text',
    description: 'Restrictive covenants affecting the property',
    aliases: ['covenants', 'restrictive covenants', 'restrictions', 'land covenants', 'deed restrictions']
  },
  'legal.leaseTerms': {
    label: 'Lease Terms',
    type: 'text',
    description: 'Lease terms if leasehold (term, ground rent, reviews)',
    aliases: ['lease terms', 'lease', 'leasehold', 'ground rent', 'lease length', 'unexpired term', 'head lease']
  },
  'legal.guarantees': {
    label: 'Guarantees',
    type: 'text',
    description: 'Personal or corporate guarantees provided',
    aliases: ['guarantees', 'guarantee details', 'personal guarantee', 'pg', 'corporate guarantee', 'guarantor details']
  },
  'legal.conditionsPrecedent': {
    label: 'Conditions Precedent',
    type: 'text',
    description: 'Legal conditions precedent for drawdown',
    aliases: ['conditions precedent', 'cps', 'cp', 'pre-conditions', 'drawdown conditions', 'conditions before drawdown']
  },
  'legal.conditionsSubsequent': {
    label: 'Conditions Subsequent',
    type: 'text',
    description: 'Conditions subsequent (post-completion obligations)',
    aliases: ['conditions subsequent', 'cs', 'post-completion conditions', 'subsequent conditions', 'ongoing obligations']
  },

  // === INSURANCE (5 fields) ===
  'insurance.policyNumber': {
    label: 'Insurance Policy Number',
    type: 'string',
    description: 'Insurance policy reference number',
    aliases: ['policy number', 'policy ref', 'insurance reference', 'policy no', 'certificate number']
  },
  'insurance.insurer': {
    label: 'Insurer',
    type: 'string',
    description: 'Name of insurance company/underwriter',
    aliases: ['insurer', 'insurance company', 'underwriter', 'insurance provider', 'insured by']
  },
  'insurance.coverAmount': {
    label: 'Cover Amount',
    type: 'currency',
    description: 'Total insurance cover amount',
    aliases: ['cover amount', 'sum insured', 'insurance cover', 'indemnity limit', 'cover level', 'insured amount']
  },
  'insurance.expiryDate': {
    label: 'Policy Expiry Date',
    type: 'date',
    description: 'Insurance policy expiry/renewal date',
    aliases: ['expiry date', 'renewal date', 'policy expiry', 'insurance expiry', 'expires', 'valid until']
  },
  'insurance.coverType': {
    label: 'Cover Type',
    type: 'string',
    description: 'Type of insurance cover (CAR, PI, public liability, etc.)',
    aliases: ['cover type', 'type of cover', 'insurance type', 'car insurance', 'contractors all risks', 'public liability', 'professional indemnity']
  },

  // === PLANNING (6 fields) ===
  'planning.applicationRef': {
    label: 'Planning Application Reference',
    type: 'string',
    description: 'Planning application reference number',
    aliases: ['planning ref', 'application reference', 'planning number', 'application number', 'planning application', 'ref number']
  },
  'planning.status': {
    label: 'Planning Status',
    type: 'string',
    description: 'Current status of planning application',
    aliases: ['planning status', 'application status', 'consent status', 'permission status', 'planning decision']
  },
  'planning.conditions': {
    label: 'Planning Conditions',
    type: 'text',
    description: 'Summary of planning conditions attached',
    aliases: ['planning conditions', 'conditions attached', 'planning requirements', 'conditions of consent', 'condition details']
  },
  'planning.s106Details': {
    label: 'S106 Agreement Details',
    type: 'text',
    description: 'Section 106 agreement obligations and amounts',
    aliases: ['s106', 'section 106', 's106 agreement', 's106 contribution', 's106 obligation', 'planning obligation']
  },
  'planning.cil': {
    label: 'CIL Liability',
    type: 'currency',
    description: 'Community Infrastructure Levy amount',
    aliases: ['cil', 'community infrastructure levy', 'cil charge', 'cil liability', 'cil payment']
  },
  'planning.permittedDevelopment': {
    label: 'Permitted Development Rights',
    type: 'text',
    description: 'Permitted development rights status',
    aliases: ['permitted development', 'pd rights', 'permitted development rights', 'prior approval', 'class ma', 'class q']
  },

  // === VALUATION (7 fields) ===
  'valuation.marketValue': {
    label: 'Market Value',
    type: 'currency',
    description: 'Current market value from valuation report',
    aliases: ['market value', 'mv', 'current value', 'open market value', 'omv', 'as-is value', 'day one value']
  },
  'valuation.gdv': {
    label: 'GDV (Valuation)',
    type: 'currency',
    description: 'Gross Development Value from valuation report',
    aliases: ['gdv', 'gross development value', 'completed value', 'end value', 'residual value']
  },
  'valuation.specialAssumptions': {
    label: 'Special Assumptions',
    type: 'text',
    description: 'Special assumptions applied in valuation',
    aliases: ['special assumptions', 'assumptions', 'valuation assumptions', 'key assumptions', 'basis assumptions']
  },
  'valuation.comparables': {
    label: 'Comparable Evidence',
    type: 'text',
    description: 'Comparable evidence used in valuation',
    aliases: ['comparables', 'comparable evidence', 'comps', 'comparable sales', 'market evidence', 'comparable transactions']
  },
  'valuation.valuer': {
    label: 'Valuer',
    type: 'string',
    description: 'Valuer name or firm',
    aliases: ['valuer', 'surveyor', 'valuation firm', 'instructed valuer', 'rics surveyor', 'valuation surveyor']
  },
  'valuation.valuationDate': {
    label: 'Valuation Date',
    type: 'date',
    description: 'Date of valuation report',
    aliases: ['valuation date', 'date of valuation', 'report date', 'inspection date', 'valued as at']
  },
  'valuation.basisOfValue': {
    label: 'Basis of Value',
    type: 'string',
    description: 'Basis on which valuation was carried out',
    aliases: ['basis of value', 'valuation basis', 'market value basis', 'reinstatement', 'existing use value', 'euv', 'hope value']
  },

  // === RISK (4 fields) ===
  'risk.description': {
    label: 'Risk Description',
    type: 'text',
    description: 'Description of an identified risk',
    aliases: ['risk', 'risk description', 'identified risk', 'key risk', 'risk factor', 'concern']
  },
  'risk.severity': {
    label: 'Risk Severity',
    type: 'string',
    description: 'Severity rating of identified risk',
    aliases: ['severity', 'risk level', 'risk rating', 'risk severity', 'impact level', 'risk score']
  },
  'risk.mitigant': {
    label: 'Risk Mitigant',
    type: 'text',
    description: 'Mitigation strategy for an identified risk',
    aliases: ['mitigant', 'mitigation', 'risk mitigation', 'mitigating factor', 'risk control', 'risk response']
  },
  'risk.riskCategory': {
    label: 'Risk Category',
    type: 'string',
    description: 'Category of risk (market, construction, planning, exit, borrower)',
    aliases: ['risk category', 'risk type', 'type of risk', 'risk classification']
  },

  // === CONDITIONS (4 fields) ===
  'conditions.precedent': {
    label: 'Conditions Precedent',
    type: 'text',
    description: 'Loan conditions precedent for first drawdown',
    aliases: ['conditions precedent', 'cps', 'cp list', 'drawdown requirements', 'pre-drawdown conditions', 'initial conditions']
  },
  'conditions.subsequent': {
    label: 'Conditions Subsequent',
    type: 'text',
    description: 'Post-drawdown conditions and obligations',
    aliases: ['conditions subsequent', 'cs', 'post-drawdown conditions', 'subsequent requirements', 'post-completion conditions']
  },
  'conditions.ongoing': {
    label: 'Ongoing Conditions',
    type: 'text',
    description: 'Ongoing covenants and conditions throughout loan term',
    aliases: ['ongoing conditions', 'ongoing covenants', 'continuing obligations', 'financial covenants', 'information covenants']
  },
  'conditions.waivers': {
    label: 'Waiver Requests',
    type: 'text',
    description: 'Waiver requests or granted waivers',
    aliases: ['waivers', 'waiver request', 'condition waiver', 'waived conditions', 'waiver granted']
  },

  // === PARTIES (7 fields) ===
  'parties.solicitor': {
    label: 'Solicitor',
    type: 'string',
    description: 'Solicitor or law firm acting',
    aliases: ['solicitor', 'lawyer', 'law firm', 'legal advisor', 'legal counsel', 'borrowers solicitor', 'lenders solicitor']
  },
  'parties.valuer': {
    label: 'Valuer',
    type: 'string',
    description: 'Valuer or surveyor firm',
    aliases: ['valuer', 'surveyor', 'valuation surveyor', 'rics surveyor', 'appointed valuer']
  },
  'parties.architect': {
    label: 'Architect',
    type: 'string',
    description: 'Architect firm',
    aliases: ['architect', 'architect firm', 'design architect', 'project architect', 'planning architect']
  },
  'parties.contractor': {
    label: 'Main Contractor',
    type: 'string',
    description: 'Main contractor or builder',
    aliases: ['contractor', 'main contractor', 'builder', 'building contractor', 'construction company', 'works contractor']
  },
  'parties.monitoringSurveyor': {
    label: 'Monitoring Surveyor',
    type: 'string',
    description: 'Project monitoring surveyor (PMS)',
    aliases: ['monitoring surveyor', 'pms', 'project monitor', 'independent monitor', 'construction monitor', 'quantity surveyor']
  },
  'parties.broker': {
    label: 'Broker',
    type: 'string',
    description: 'Broker or introducer',
    aliases: ['broker', 'introducer', 'intermediary', 'finance broker', 'mortgage broker', 'introducing broker']
  },
  'parties.guarantor': {
    label: 'Guarantor',
    type: 'string',
    description: 'Personal or corporate guarantor',
    aliases: ['guarantor', 'personal guarantor', 'corporate guarantor', 'guarantee provider', 'surety']
  },
};

// =============================================================================
// CHECKLIST → FIELD HINTS MAPPING
// =============================================================================

/**
 * Maps checklist item names to the canonical fields they typically provide.
 * Used by the extraction pipeline to give the AI hints about what to look for.
 */
export const CHECKLIST_FIELD_HINTS: Record<string, string[]> = {
  // Client documents
  'Company Search': ['company.name', 'company.registrationNumber', 'company.incorporationDate', 'company.registeredAddress', 'company.directors', 'company.shareholders', 'company.companyType', 'company.sicCode'],
  'Proof of Address': ['contact.personalAddress', 'company.registeredAddress'],
  'Passport/ID': ['contact.primaryName', 'contact.nationality'],
  'Passport': ['contact.primaryName', 'contact.nationality'],
  'ID': ['contact.primaryName', 'contact.nationality'],
  'Photo ID': ['contact.primaryName', 'contact.nationality'],
  'Financial Statement': ['financial.netWorth', 'financial.liquidAssets', 'financial.annualIncome', 'financial.existingDebt'],
  'Personal Financial Statement': ['financial.netWorth', 'financial.liquidAssets', 'financial.annualIncome', 'financial.existingDebt', 'financial.propertyPortfolioValue'],
  'Bank Statements': ['financial.bankName', 'financial.liquidAssets'],
  'Bank Statement': ['financial.bankName', 'financial.liquidAssets'],
  'Tax Returns': ['financial.annualIncome'],
  'CV': ['experience.developmentHistory', 'experience.projectsCompleted', 'experience.totalGDV', 'experience.specializations'],
  'Track Record': ['experience.developmentHistory', 'experience.projectsCompleted', 'experience.totalGDV', 'experience.geographicFocus'],

  // Project documents
  'Development Appraisal': ['financials.gdv', 'financials.totalDevelopmentCost', 'financials.constructionCost', 'financials.profitMargin', 'financials.purchasePrice', 'overview.unitCount'],
  'Appraisal': ['financials.gdv', 'financials.totalDevelopmentCost', 'financials.constructionCost', 'financials.profitMargin'],
  'Valuation Report': ['financials.currentValue', 'financials.gdv', 'location.siteAddress', 'valuation.marketValue', 'valuation.gdv', 'valuation.specialAssumptions', 'valuation.comparables', 'valuation.valuer', 'valuation.valuationDate', 'valuation.basisOfValue'],
  'RedBook Valuation': ['valuation.marketValue', 'valuation.gdv', 'valuation.specialAssumptions', 'valuation.comparables', 'valuation.valuer', 'valuation.valuationDate', 'valuation.basisOfValue', 'financials.currentValue', 'financials.gdv', 'location.siteAddress'],
  'Valuation': ['financials.currentValue', 'financials.gdv', 'valuation.marketValue', 'valuation.valuer', 'valuation.valuationDate'],
  'Title Documents': ['location.titleNumber', 'location.siteAddress', 'legal.titleDetails', 'legal.charges', 'legal.covenants'],
  'Title': ['location.titleNumber', 'location.siteAddress', 'legal.titleDetails', 'legal.charges'],
  'Certificate of Title': ['legal.titleDetails', 'legal.charges', 'legal.covenants', 'legal.leaseTerms', 'location.titleNumber', 'location.siteAddress'],
  'Land Registry': ['location.titleNumber', 'location.siteAddress', 'legal.titleDetails', 'legal.charges'],
  'Planning Permission': ['timeline.planningStatus', 'overview.unitCount', 'overview.totalSqft', 'planning.applicationRef', 'planning.status', 'planning.conditions', 'planning.s106Details', 'planning.cil'],
  'Planning Decision Notice': ['planning.applicationRef', 'planning.status', 'planning.conditions', 'planning.s106Details', 'planning.cil', 'planning.permittedDevelopment'],
  'Planning': ['timeline.planningStatus', 'overview.unitCount', 'planning.applicationRef', 'planning.status', 'planning.conditions'],
  'Schedule of Works': ['financials.constructionCost', 'timeline.constructionStart', 'timeline.practicalCompletion', 'timeline.projectDuration'],
  'Build Contract': ['financials.constructionCost', 'timeline.constructionStart', 'timeline.practicalCompletion', 'parties.contractor'],
  'JCT Contract': ['financials.constructionCost', 'timeline.constructionStart', 'timeline.practicalCompletion', 'parties.contractor'],
  'Heads of Terms': ['financials.loanAmount', 'financials.ltv', 'financials.ltc', 'timeline.projectDuration', 'conditions.precedent', 'conditions.subsequent'],
  'Term Sheet': ['financials.loanAmount', 'financials.ltv', 'financials.ltc', 'timeline.projectDuration', 'conditions.precedent'],
  'Facility Agreement': ['financials.loanAmount', 'financials.ltv', 'financials.ltc', 'timeline.projectDuration', 'conditions.precedent', 'conditions.subsequent', 'conditions.ongoing', 'legal.guarantees'],
  'Facility Letter': ['financials.loanAmount', 'financials.ltv', 'conditions.precedent', 'conditions.subsequent', 'legal.guarantees'],
  'Insurance Certificate': ['insurance.policyNumber', 'insurance.insurer', 'insurance.coverAmount', 'insurance.expiryDate', 'insurance.coverType'],
  'Insurance': ['insurance.policyNumber', 'insurance.insurer', 'insurance.coverAmount', 'insurance.expiryDate', 'insurance.coverType'],
  'Monitoring Report': ['risk.description', 'risk.severity', 'risk.mitigant', 'conditions.ongoing'],
  'Sales Evidence': ['financials.gdv', 'overview.unitCount', 'valuation.comparables'],
  'Comparables': ['financials.gdv', 'financials.currentValue', 'valuation.comparables'],
  'Legal Report': ['legal.titleDetails', 'legal.charges', 'legal.covenants', 'legal.leaseTerms', 'legal.guarantees'],
  'Legal Opinion': ['legal.titleDetails', 'legal.charges', 'legal.covenants', 'legal.conditionsPrecedent'],
};

// =============================================================================
// NORMALIZATION FUNCTIONS
// =============================================================================

/**
 * Simple Levenshtein distance calculation for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalizes an extracted field label to a canonical path.
 *
 * @param label - The label extracted by the AI (e.g., "Company Reg Number")
 * @param targetType - Whether this is for 'client' or 'project' intelligence
 * @returns NormalizationResult with canonical path or custom path
 */
export function normalizeFieldLabel(
  label: string,
  targetType: 'client' | 'project'
): NormalizationResult {
  const fields = targetType === 'client' ? CLIENT_CANONICAL_FIELDS : PROJECT_CANONICAL_FIELDS;
  const normalizedLabel = label.toLowerCase().trim();

  // 1. Check for exact canonical path match (if AI already uses canonical path)
  if (fields[normalizedLabel]) {
    return { canonicalPath: normalizedLabel, customPath: null, confidence: 1.0 };
  }

  // Also check if the label IS a canonical path (e.g., "company.registrationNumber")
  for (const path of Object.keys(fields)) {
    if (normalizedLabel === path.toLowerCase()) {
      return { canonicalPath: path, customPath: null, confidence: 1.0 };
    }
  }

  // 2. Check aliases for exact match
  for (const [path, config] of Object.entries(fields)) {
    for (const alias of config.aliases) {
      if (normalizedLabel === alias.toLowerCase()) {
        return { canonicalPath: path, customPath: null, confidence: 0.95, matchedAlias: alias };
      }
    }
  }

  // 3. Check aliases for contains match (more lenient)
  for (const [path, config] of Object.entries(fields)) {
    for (const alias of config.aliases) {
      const normalizedAlias = alias.toLowerCase();
      // Check if the label contains the alias or vice versa
      if (normalizedLabel.includes(normalizedAlias) || normalizedAlias.includes(normalizedLabel)) {
        // Longer matches are more confident
        const matchLength = Math.min(normalizedLabel.length, normalizedAlias.length);
        const confidence = Math.min(0.9, 0.7 + (matchLength / 30));
        return { canonicalPath: path, customPath: null, confidence, matchedAlias: alias };
      }
    }
  }

  // 4. Check field labels for contains match
  for (const [path, config] of Object.entries(fields)) {
    const fieldLabel = config.label.toLowerCase();
    if (normalizedLabel.includes(fieldLabel) || fieldLabel.includes(normalizedLabel)) {
      return { canonicalPath: path, customPath: null, confidence: 0.75 };
    }
  }

  // 5. Fuzzy match using Levenshtein distance
  let bestMatch: { path: string; distance: number; alias: string } | null = null;

  for (const [path, config] of Object.entries(fields)) {
    // Check against label
    const labelDistance = levenshteinDistance(normalizedLabel, config.label.toLowerCase());
    if (labelDistance <= 3 && (!bestMatch || labelDistance < bestMatch.distance)) {
      bestMatch = { path, distance: labelDistance, alias: config.label };
    }

    // Check against aliases
    for (const alias of config.aliases) {
      const aliasDistance = levenshteinDistance(normalizedLabel, alias.toLowerCase());
      if (aliasDistance <= 2 && (!bestMatch || aliasDistance < bestMatch.distance)) {
        bestMatch = { path, distance: aliasDistance, alias };
      }
    }
  }

  if (bestMatch) {
    const confidence = Math.max(0.6, 0.9 - (bestMatch.distance * 0.1));
    return { canonicalPath: bestMatch.path, customPath: null, confidence, matchedAlias: bestMatch.alias };
  }

  // 6. No match - create custom field path
  const customKey = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 50);

  return {
    canonicalPath: null,
    customPath: `custom.${customKey}`,
    confidence: 0.5
  };
}

/**
 * Batch normalize multiple extracted fields
 */
export function normalizeExtractedFields(
  fields: Array<{ label: string; value: any; sourceText?: string }>,
  targetType: 'client' | 'project'
): Array<{
  originalLabel: string;
  fieldPath: string;
  isCanonical: boolean;
  value: any;
  sourceText?: string;
  confidence: number;
  matchedAlias?: string;
}> {
  return fields.map(field => {
    const result = normalizeFieldLabel(field.label, targetType);
    return {
      originalLabel: field.label,
      fieldPath: result.canonicalPath || result.customPath!,
      isCanonical: result.canonicalPath !== null,
      value: field.value,
      sourceText: field.sourceText,
      confidence: result.confidence,
      matchedAlias: result.matchedAlias,
    };
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get field configuration by canonical path
 */
export function getFieldConfig(path: string, targetType: 'client' | 'project'): CanonicalFieldConfig | null {
  const fields = targetType === 'client' ? CLIENT_CANONICAL_FIELDS : PROJECT_CANONICAL_FIELDS;
  return fields[path] || null;
}

/**
 * Get all fields in a category
 */
export function getFieldsByCategory(category: string, targetType: 'client' | 'project'): Record<string, CanonicalFieldConfig> {
  const fields = targetType === 'client' ? CLIENT_CANONICAL_FIELDS : PROJECT_CANONICAL_FIELDS;
  const result: Record<string, CanonicalFieldConfig> = {};

  for (const [path, config] of Object.entries(fields)) {
    if (path.startsWith(`${category}.`)) {
      result[path] = config;
    }
  }

  return result;
}

/**
 * Get all categories for a target type
 */
export function getCategories(targetType: 'client' | 'project'): string[] {
  const fields = targetType === 'client' ? CLIENT_CANONICAL_FIELDS : PROJECT_CANONICAL_FIELDS;
  const categories = new Set<string>();

  for (const path of Object.keys(fields)) {
    const category = path.split('.')[0];
    categories.add(category);
  }

  return Array.from(categories);
}

/**
 * Get field hints for a document category/checklist item
 */
export function getFieldHintsForDocument(documentCategory: string): string[] {
  // Try exact match first
  if (CHECKLIST_FIELD_HINTS[documentCategory]) {
    return CHECKLIST_FIELD_HINTS[documentCategory];
  }

  // Try partial match
  const normalizedCategory = documentCategory.toLowerCase();
  for (const [key, hints] of Object.entries(CHECKLIST_FIELD_HINTS)) {
    if (normalizedCategory.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedCategory)) {
      return hints;
    }
  }

  return [];
}

/**
 * Get human-readable label for a field path
 */
export function getFieldLabel(path: string, targetType: 'client' | 'project'): string {
  const config = getFieldConfig(path, targetType);
  if (config) {
    return config.label;
  }

  // For custom fields, convert path to readable label
  if (path.startsWith('custom.')) {
    return path
      .replace('custom.', '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  return path;
}

/**
 * Extract category from field path
 */
export function getCategoryFromPath(path: string): string {
  return path.split('.')[0];
}

// =============================================================================
// FIELD DESCRIPTIONS FOR EXTRACTION PROMPTS
// =============================================================================

/**
 * Generate field descriptions for extraction prompts
 */
export function generateFieldDescriptions(targetType: 'client' | 'project', fieldPaths?: string[]): string {
  const fields = targetType === 'client' ? CLIENT_CANONICAL_FIELDS : PROJECT_CANONICAL_FIELDS;

  const filteredFields = fieldPaths
    ? Object.entries(fields).filter(([path]) => fieldPaths.includes(path))
    : Object.entries(fields);

  return filteredFields
    .map(([path, config]) => {
      const desc = config.description || config.label;
      const examples = config.aliases.slice(0, 3).join(', ');
      return `- ${path}: ${desc} (also known as: ${examples})`;
    })
    .join('\n');
}

/**
 * Get all canonical field paths
 */
export function getAllCanonicalPaths(targetType: 'client' | 'project'): string[] {
  const fields = targetType === 'client' ? CLIENT_CANONICAL_FIELDS : PROJECT_CANONICAL_FIELDS;
  return Object.keys(fields);
}

// =============================================================================
// FIELD SCOPE MAPPING
// =============================================================================

/**
 * Defines the "natural scope" of canonical fields.
 * - 'client': Always stored at client level (company info, KYC data)
 * - 'project': Always stored at project level (deal-specific data)
 * - 'context': Scope depends on document context
 */
export const FIELD_NATURAL_SCOPE: Record<string, 'client' | 'project' | 'context'> = {
  // === ALWAYS CLIENT-LEVEL (company/entity info) ===
  'company.name': 'client',
  'company.tradingName': 'client',
  'company.registrationNumber': 'client',
  'company.registeredAddress': 'client',
  'company.incorporationDate': 'client',
  'company.companyType': 'client',
  'company.sicCode': 'client',
  'company.vatNumber': 'client',
  'company.directors': 'client',
  'company.shareholders': 'client',
  'company.ultimateBeneficialOwner': 'client',
  'company.parentCompany': 'client',
  'contact.primaryName': 'client',
  'contact.email': 'client',
  'contact.phone': 'client',
  'contact.secondaryName': 'client',
  'contact.secondaryEmail': 'client',
  'contact.secondaryPhone': 'client',
  'contact.role': 'client',
  'contact.preferredContactMethod': 'client',
  'contact.personalAddress': 'client',
  'contact.nationality': 'client',
  'financial.netWorth': 'client',
  'financial.liquidAssets': 'client',
  'financial.annualIncome': 'client',
  'financial.propertyPortfolioValue': 'client',
  'financial.existingDebt': 'client',
  'financial.creditScore': 'client',
  'financial.bankName': 'client',
  'financial.accountantContact': 'client',
  'experience.developmentHistory': 'client',
  'experience.projectsCompleted': 'client',
  'experience.totalGDV': 'client',
  'experience.specializations': 'client',
  'experience.geographicFocus': 'client',

  // === ALWAYS PROJECT-LEVEL (deal-specific) ===
  'overview.projectName': 'project',
  'overview.projectType': 'project',
  'overview.assetClass': 'project',
  'overview.description': 'project',
  'overview.unitCount': 'project',
  'overview.totalSqft': 'project',
  'location.siteAddress': 'project',
  'location.postcode': 'project',
  'location.localAuthority': 'project',
  'location.titleNumber': 'project',
  'financials.purchasePrice': 'project',
  'financials.currentValue': 'project',
  'financials.totalDevelopmentCost': 'project',
  'financials.constructionCost': 'project',
  'financials.gdv': 'project',
  'financials.loanAmount': 'project',
  'financials.ltv': 'project',
  'financials.ltc': 'project',
  'financials.equityContribution': 'project',
  'financials.profitMargin': 'project',
  'timeline.acquisitionDate': 'project',
  'timeline.planningStatus': 'project',
  'timeline.constructionStart': 'project',
  'timeline.practicalCompletion': 'project',
  'timeline.projectDuration': 'project',

  // === LEGAL ===
  'legal.titleDetails': 'project',
  'legal.charges': 'project',
  'legal.covenants': 'project',
  'legal.leaseTerms': 'project',
  'legal.guarantees': 'project',
  'legal.conditionsPrecedent': 'project',
  'legal.conditionsSubsequent': 'project',

  // === INSURANCE ===
  'insurance.policyNumber': 'project',
  'insurance.insurer': 'project',
  'insurance.coverAmount': 'project',
  'insurance.expiryDate': 'project',
  'insurance.coverType': 'project',

  // === PLANNING ===
  'planning.applicationRef': 'project',
  'planning.status': 'project',
  'planning.conditions': 'project',
  'planning.s106Details': 'project',
  'planning.cil': 'project',
  'planning.permittedDevelopment': 'project',

  // === VALUATION ===
  'valuation.marketValue': 'project',
  'valuation.gdv': 'project',
  'valuation.specialAssumptions': 'project',
  'valuation.comparables': 'project',
  'valuation.valuer': 'project',
  'valuation.valuationDate': 'project',
  'valuation.basisOfValue': 'project',

  // === RISK ===
  'risk.description': 'project',
  'risk.severity': 'project',
  'risk.mitigant': 'project',
  'risk.riskCategory': 'project',

  // === CONDITIONS ===
  'conditions.precedent': 'project',
  'conditions.subsequent': 'project',
  'conditions.ongoing': 'project',
  'conditions.waivers': 'project',

  // === PARTIES ===
  'parties.solicitor': 'project',
  'parties.valuer': 'project',
  'parties.architect': 'project',
  'parties.contractor': 'project',
  'parties.monitoringSurveyor': 'project',
  'parties.broker': 'project',
  'parties.guarantor': 'project',
};

/**
 * Document categories that indicate client-level intelligence
 */
const CLIENT_LEVEL_CATEGORIES = [
  'KYC',
  'Background',
  'Corporate',
  'Identity',
  'Financial Statement',
  'Bank Statement',
  'Tax',
  'CV',
  'Track Record',
];

/**
 * Determines the appropriate scope for a field based on:
 * 1. The field's natural scope (if canonical)
 * 2. The document's category
 * 3. Whether a project context exists
 */
export function determineFieldScope(
  fieldPath: string,
  hasProjectContext: boolean,
  documentCategory?: string
): 'client' | 'project' {
  // 1. Check if this is a canonical field with a defined natural scope
  const naturalScope = FIELD_NATURAL_SCOPE[fieldPath];

  if (naturalScope === 'client') {
    return 'client';
  }

  if (naturalScope === 'project') {
    // Project-level fields go to project if we have a project context
    return hasProjectContext ? 'project' : 'client';
  }

  // 2. For context-dependent or custom fields, check document category
  if (documentCategory) {
    const isClientCategory = CLIENT_LEVEL_CATEGORIES.some(
      cat => documentCategory.toLowerCase().includes(cat.toLowerCase())
    );
    if (isClientCategory) {
      return 'client';
    }
  }

  // 3. Default: use project if available, otherwise client
  return hasProjectContext ? 'project' : 'client';
}

// =============================================================================
// SMART VALUE PARSING
// =============================================================================

/**
 * Parse currency strings into numeric values
 * Examples: "£12.5m" → 12500000, "£2,500,000" → 2500000, "2.5 million" → 2500000
 */
export function parseCurrencyValue(value: string): number | null {
  if (!value || typeof value !== 'string') return null;

  // Remove currency symbols and whitespace
  let cleaned = value.replace(/[£$€,\s]/g, '').toLowerCase();

  // Handle multipliers
  let multiplier = 1;
  if (cleaned.includes('m') || cleaned.includes('million')) {
    multiplier = 1000000;
    cleaned = cleaned.replace(/m(illion)?/g, '');
  } else if (cleaned.includes('k') || cleaned.includes('thousand')) {
    multiplier = 1000;
    cleaned = cleaned.replace(/k|thousand/g, '');
  } else if (cleaned.includes('bn') || cleaned.includes('b') || cleaned.includes('billion')) {
    multiplier = 1000000000;
    cleaned = cleaned.replace(/bn|b(illion)?/g, '');
  }

  // Parse the number
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  return Math.round(num * multiplier);
}

/**
 * Parse percentage strings into numeric values
 * Examples: "75%" → 75, "0.75" → 75 (if looks like decimal), "75" → 75
 */
export function parsePercentageValue(value: string): number | null {
  if (!value || typeof value !== 'string') return null;

  // Remove % symbol and whitespace
  let cleaned = value.replace(/[%\s]/g, '');

  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  // If it's a decimal less than 1, assume it's a ratio and convert
  // e.g., 0.75 → 75%
  if (num > 0 && num < 1) {
    return Math.round(num * 100);
  }

  return num;
}

/**
 * Parse date strings into ISO format
 * Examples: "June 2025" → "2025-06-01", "15/06/2025" → "2025-06-15"
 */
export function parseDateValue(value: string): string | null {
  if (!value || typeof value !== 'string') return null;

  // Try native Date parsing first
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  // Handle UK format DD/MM/YYYY
  const ukMatch = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ukMatch) {
    const [, day, month, year] = ukMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Handle "Month Year" format
  const monthYearMatch = value.match(/([A-Za-z]+)\s+(\d{4})/);
  if (monthYearMatch) {
    const [, monthStr, year] = monthYearMatch;
    const monthIndex = new Date(`${monthStr} 1, 2000`).getMonth();
    if (!isNaN(monthIndex)) {
      return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    }
  }

  return null;
}

// =============================================================================
// STRUCTURED DATA EXTRACTION FROM DOCUMENT ANALYSIS
// =============================================================================

export interface ExtractedField {
  fieldPath: string;
  label: string;
  value: any;
  valueType: FieldType;
  isCanonical: boolean;
  confidence: number;
  sourceText?: string;
  scope: 'client' | 'project';
  category: string;
}

/**
 * Parse a keyAmount string into a structured field
 * Examples: "GDV: £12.5m", "Loan Amount: £2,000,000", "LTV: 75%"
 */
export function parseKeyAmount(
  amountString: string,
  hasProjectContext: boolean,
  documentCategory?: string
): ExtractedField | null {
  // Parse the contextual amount string (e.g., "GDV: £12.5m" → label: "GDV", value: "£12.5m")
  const colonIndex = amountString.indexOf(':');

  let label: string;
  let rawValue: string;

  if (colonIndex > 0) {
    label = amountString.substring(0, colonIndex).trim();
    rawValue = amountString.substring(colonIndex + 1).trim();
  } else {
    // No context provided - try to infer or skip
    return null;
  }

  // Try to normalize the label to a canonical field
  // First check project fields, then client fields
  let normResult = normalizeFieldLabel(label, 'project');
  let targetType: 'client' | 'project' = 'project';

  // If no good project match, try client
  if (!normResult.canonicalPath && normResult.confidence < 0.7) {
    const clientResult = normalizeFieldLabel(label, 'client');
    if (clientResult.canonicalPath || clientResult.confidence > normResult.confidence) {
      normResult = clientResult;
      targetType = 'client';
    }
  }

  const fieldPath = normResult.canonicalPath || normResult.customPath || `custom.${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  const isCanonical = normResult.canonicalPath !== null;

  // Determine value type and parse
  let value: any = rawValue;
  let valueType: FieldType = 'string';

  // Check if it's a percentage
  if (rawValue.includes('%') || ['ltv', 'ltc', 'profit', 'margin', 'yield', 'return'].some(p => label.toLowerCase().includes(p))) {
    const parsed = parsePercentageValue(rawValue);
    if (parsed !== null) {
      value = parsed;
      valueType = 'percentage';
    }
  }
  // Check if it's a currency
  else if (rawValue.match(/[£$€]/) || rawValue.match(/\d.*[mk]/i)) {
    const parsed = parseCurrencyValue(rawValue);
    if (parsed !== null) {
      value = parsed;
      valueType = 'currency';
    }
  }
  // Check if it's a number
  else {
    const num = parseFloat(rawValue.replace(/,/g, ''));
    if (!isNaN(num)) {
      value = num;
      valueType = 'number';
    }
  }

  // Determine scope
  const scope = isCanonical
    ? determineFieldScope(fieldPath, hasProjectContext, documentCategory)
    : (hasProjectContext ? 'project' : 'client');

  return {
    fieldPath,
    label: isCanonical ? getFieldLabel(fieldPath, targetType) : label,
    value,
    valueType,
    isCanonical,
    confidence: normResult.confidence,
    sourceText: amountString,
    scope,
    category: getCategoryFromPath(fieldPath),
  };
}

/**
 * Parse a keyDate string into a structured field
 * Examples: "Completion: June 2025", "Start Date: 15/03/2024"
 */
export function parseKeyDate(
  dateString: string,
  hasProjectContext: boolean,
  documentCategory?: string
): ExtractedField | null {
  const colonIndex = dateString.indexOf(':');

  let label: string;
  let rawValue: string;

  if (colonIndex > 0) {
    label = dateString.substring(0, colonIndex).trim();
    rawValue = dateString.substring(colonIndex + 1).trim();
  } else {
    return null;
  }

  // Try to normalize the label
  let normResult = normalizeFieldLabel(label, 'project');
  let targetType: 'client' | 'project' = 'project';

  if (!normResult.canonicalPath && normResult.confidence < 0.7) {
    const clientResult = normalizeFieldLabel(label, 'client');
    if (clientResult.canonicalPath || clientResult.confidence > normResult.confidence) {
      normResult = clientResult;
      targetType = 'client';
    }
  }

  const fieldPath = normResult.canonicalPath || normResult.customPath || `custom.${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  const isCanonical = normResult.canonicalPath !== null;

  // Parse the date
  const parsedDate = parseDateValue(rawValue);
  const value = parsedDate || rawValue;
  const valueType: FieldType = parsedDate ? 'date' : 'string';

  const scope = isCanonical
    ? determineFieldScope(fieldPath, hasProjectContext, documentCategory)
    : (hasProjectContext ? 'project' : 'client');

  return {
    fieldPath,
    label: isCanonical ? getFieldLabel(fieldPath, targetType) : label,
    value,
    valueType,
    isCanonical,
    confidence: normResult.confidence,
    sourceText: dateString,
    scope,
    category: getCategoryFromPath(fieldPath),
  };
}

/**
 * Extract entities (companies, people) from document analysis
 */
export function parseEntities(
  entities: {
    companies?: string[];
    people?: string[];
    locations?: string[];
    projects?: string[];
  },
  hasProjectContext: boolean,
  documentCategory?: string
): ExtractedField[] {
  const fields: ExtractedField[] = [];

  // Companies are typically client-level
  if (entities.companies && entities.companies.length > 0) {
    // First company could be the main entity
    fields.push({
      fieldPath: 'company.name',
      label: 'Company Name',
      value: entities.companies[0],
      valueType: 'string',
      isCanonical: true,
      confidence: 0.7,
      sourceText: `Entities: ${entities.companies.join(', ')}`,
      scope: 'client',
      category: 'company',
    });
  }

  // People - primary contact
  if (entities.people && entities.people.length > 0) {
    fields.push({
      fieldPath: 'contact.primaryName',
      label: 'Primary Contact Name',
      value: entities.people[0],
      valueType: 'string',
      isCanonical: true,
      confidence: 0.6, // Lower confidence since it's inferred
      sourceText: `Entities: ${entities.people.join(', ')}`,
      scope: 'client',
      category: 'contact',
    });
  }

  // Locations - could be site address if project context
  if (entities.locations && entities.locations.length > 0 && hasProjectContext) {
    fields.push({
      fieldPath: 'location.siteAddress',
      label: 'Site Address',
      value: entities.locations[0],
      valueType: 'string',
      isCanonical: true,
      confidence: 0.6,
      sourceText: `Entities: ${entities.locations.join(', ')}`,
      scope: 'project',
      category: 'location',
    });
  }

  return fields;
}

/**
 * Extract key findings/insights from document analysis
 */
export function parseKeyFindings(
  executiveSummary: string,
  keyTerms: string[],
  hasProjectContext: boolean
): ExtractedField[] {
  const fields: ExtractedField[] = [];

  // Store executive summary as an insight
  if (executiveSummary && executiveSummary.length > 50) {
    fields.push({
      fieldPath: 'insights.executive_summary',
      label: 'Executive Summary',
      value: executiveSummary,
      valueType: 'text',
      isCanonical: false,
      confidence: 0.9,
      scope: hasProjectContext ? 'project' : 'client',
      category: 'insights',
    });
  }

  // Store key terms as tags
  if (keyTerms && keyTerms.length > 0) {
    fields.push({
      fieldPath: 'insights.key_terms',
      label: 'Key Terms',
      value: keyTerms,
      valueType: 'array',
      isCanonical: false,
      confidence: 0.8,
      scope: hasProjectContext ? 'project' : 'client',
      category: 'insights',
    });
  }

  return fields;
}

/**
 * Main function: Extract all intelligence from documentAnalysis on confirmed filing
 * This is called during the filing process to extract structured intelligence
 */
export function extractIntelligenceFromDocumentAnalysis(
  documentAnalysis: {
    keyAmounts?: string[];
    keyDates?: string[];
    keyTerms?: string[];
    entities?: {
      companies?: string[];
      people?: string[];
      locations?: string[];
      projects?: string[];
    };
    executiveSummary?: string;
    detailedSummary?: string;
  },
  hasProjectContext: boolean,
  documentCategory?: string
): ExtractedField[] {
  const allFields: ExtractedField[] = [];

  // 1. Parse key amounts (GDV, loan amount, etc.)
  if (documentAnalysis.keyAmounts) {
    for (const amount of documentAnalysis.keyAmounts) {
      const parsed = parseKeyAmount(amount, hasProjectContext, documentCategory);
      if (parsed) {
        allFields.push(parsed);
      }
    }
  }

  // 2. Parse key dates
  if (documentAnalysis.keyDates) {
    for (const dateStr of documentAnalysis.keyDates) {
      const parsed = parseKeyDate(dateStr, hasProjectContext, documentCategory);
      if (parsed) {
        allFields.push(parsed);
      }
    }
  }

  // 3. Parse entities
  if (documentAnalysis.entities) {
    const entityFields = parseEntities(documentAnalysis.entities, hasProjectContext, documentCategory);
    allFields.push(...entityFields);
  }

  // 4. Parse key findings
  if (documentAnalysis.executiveSummary || documentAnalysis.keyTerms) {
    const findingsFields = parseKeyFindings(
      documentAnalysis.executiveSummary || '',
      documentAnalysis.keyTerms || [],
      hasProjectContext
    );
    allFields.push(...findingsFields);
  }

  // Deduplicate by fieldPath, keeping highest confidence
  const fieldMap = new Map<string, ExtractedField>();
  for (const field of allFields) {
    const existing = fieldMap.get(field.fieldPath);
    if (!existing || field.confidence > existing.confidence) {
      fieldMap.set(field.fieldPath, field);
    }
  }

  return Array.from(fieldMap.values());
}
