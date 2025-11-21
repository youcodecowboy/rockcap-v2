export interface FileTypeDefinition {
  fileType: string;
  category: string;
  keywords: string[]; // Keywords that identify this file type
  description: string; // What the model should look for
  identificationRules: string[]; // Specific rules for identifying this file type
  categoryRules?: string; // Why it belongs to this category
}

export const FILE_TYPE_DEFINITIONS: FileTypeDefinition[] = [
  {
    fileType: 'RedBook Valuation',
    category: 'Appraisals',
    keywords: [
      'rics',
      'royal institution of chartered surveyors',
      'valuation report',
      'chartered surveyor',
      'property valuation',
      'market value',
      'valuation methodology',
      'vps',
      'vpga',
      'valuation standards',
      'redbook',
      'red book',
    ],
    description:
      'RICS RedBook valuation reports are professional property valuations conducted by RICS (Royal Institution of Chartered Surveyors) qualified surveyors following the RedBook standards. These are formal, standardized appraisals used for lending, financial reporting, and professional purposes. Note: Most RICS valuations follow RedBook standards even if "RedBook" is not explicitly mentioned in the document.',
    identificationRules: [
      'Look for "RICS" or "Royal Institution of Chartered Surveyors" branding or logos - this is the PRIMARY indicator',
      'Contains formal valuation methodology section (e.g., Comparable Method, Investment Method, Residual Method, Profits Method)',
      'Includes comprehensive property details: full address, tenure (freehold/leasehold), size (sq ft/sq m), condition assessment',
      'Provides a formal "Market Value" figure or other valuation basis (Investment Value, Fair Value, etc.)',
      'Contains surveyor\'s professional qualifications, RICS membership numbers, or registration details',
      'May include "Valuation Assumptions" and "Special Assumptions" sections',
      'May reference specific valuation standards (VPS 1-5, VPGA guidelines)',
      'Often includes limiting conditions, disclaimers, and scope of work sections',
      'Contains date of valuation and date of inspection',
      'May include comparable evidence or market analysis sections',
      'CRITICAL: If RICS branding is present AND formal valuation methodology is used, this is likely a RedBook Valuation even if "RedBook" is not explicitly mentioned',
      'Look for "RedBook" or "Red Book" references in the document header or title (if present, confirms RedBook, but absence does not exclude it)',
    ],
    categoryRules:
      'RedBook valuations are professional property appraisals prepared to RICS standards and should ALWAYS be categorized under "Appraisals". They are distinct from informal valuations, broker opinions, or automated valuation models. If RICS branding and formal valuation methodology are present, classify as RedBook Valuation.',
  },
  {
    fileType: 'Initial Monitoring Report',
    category: 'Inspections',
    keywords: [
      'initial monitoring report',
      'initial monitoring',
      'initial report',
      'monitoring surveyor',
      'lender monitoring',
      'monitoring surveyor initial',
      'pre-funding monitoring',
      'due diligence monitoring',
      'pre-construction monitoring',
      'monitoring report initial',
      'construction cost estimate',
      'build cost estimate',
      'construction timeline',
      'build programme',
      'project cost estimate',
    ],
    description:
      'Initial Monitoring Reports are formal due diligence reports prepared before a project is funded. They assess construction costs, timelines, and project viability to inform funding decisions. These reports are typically one-time assessments done at the project inception stage.',
    identificationRules: [
      'Look for "Initial Monitoring Report" or "Initial Monitoring" in the document title or header',
      'Contains construction cost estimates or build cost breakdowns',
      'Includes project timeline or build programme (how long construction will take)',
      'Prepared as part of formal due diligence process before funding',
      'May reference "pre-funding", "pre-construction", or "due diligence" context',
      'Typically includes cost analysis, timeline assessment, and project viability evaluation',
      'May include site conditions assessment and construction methodology review',
      'Often prepared by quantity surveyors, project managers, or construction consultants',
      'Document date should be early in project lifecycle (before construction starts or very early stages)',
      'Distinguish from Interim Monitoring Reports: Initial reports are one-time pre-funding assessments, not monthly progress reports',
    ],
    categoryRules:
      'Initial Monitoring Reports are inspection/monitoring documents prepared during due diligence and should be categorized under "Inspections". They are distinct from Interim Monitoring Reports which are ongoing monthly reports.',
  },
  {
    fileType: 'Interim Monitoring Report',
    category: 'Inspections',
    keywords: [
      'interim monitoring report',
      'interim monitoring',
      'monthly monitoring report',
      'monthly monitoring',
      'progress monitoring report',
      'construction progress report',
      'funding drawdown report',
      'drawdown monitoring',
      'monthly sign-off',
      'construction sign-off',
    ],
    description:
      'Interim Monitoring Reports are monthly progress reports prepared during construction to sign off on funding for additional construction works. These are ongoing reports that track project progress, verify completed work, and authorize further funding releases.',
    identificationRules: [
      'Look for "Interim Monitoring Report" or "Interim Monitoring" in the document title or header',
      'May include "Monthly" in the title (e.g., "Monthly Interim Monitoring Report")',
      'Contains progress updates on construction work completed since last report',
      'Includes verification of completed work and quality assessment',
      'Authorizes or recommends funding release for next phase of construction',
      'Prepared monthly or at regular intervals during construction',
      'May reference previous monitoring reports or report numbers (e.g., "Report #3", "Month 3")',
      'Includes percentage completion or milestone tracking',
      'May include photographs or evidence of completed work',
      'Document date should be during active construction phase',
      'Distinguish from Initial Monitoring Reports: Interim reports are ongoing monthly assessments during construction, not one-time pre-funding reports',
    ],
    categoryRules:
      'Interim Monitoring Reports are inspection/monitoring documents prepared during construction to authorize funding releases and should be categorized under "Inspections". They are distinct from Initial Monitoring Reports which are one-time pre-funding due diligence reports.',
  },
  {
    fileType: 'Plans',
    category: 'Property Documents',
    keywords: [
      'site location plan',
      'location plan',
      'site plan',
      'architectural plans',
      'engineering plans',
      'blueprint',
      'blueprints',
      'technical drawing',
      'technical drawings',
      'architectural drawing',
      'architectural drawings',
      'building plans',
      'construction plans',
      'floor plan',
      'floor plans',
      'elevation',
      'elevations',
      'section',
      'sections',
      'drawing',
      'drawings',
      'plan',
      'plans',
      'architect',
      'architects',
      'architectural firm',
      'sheet number',
      'sheet scale',
      'project address',
      'client',
      'revision',
      'rev',
    ],
    description:
      'Plans are architectural and engineering technical drawings including site location plans, blueprints, floor plans, elevations, sections, and other construction drawings. These documents typically contain visual technical drawings with metadata blocks showing architectural firm details, project information (client, location, project name), sheet numbers, scales, dates, and revision history.',
    identificationRules: [
      'Look for technical drawings, blueprints, or architectural/engineering plans as visual content',
      'Contains site location plans showing roads, buildings, and project site boundaries',
      'May include floor plans, elevations, sections, or other architectural drawings',
      'Typically includes an information block or title block with architectural firm details (firm name, address, contact)',
      'Contains project metadata: project name, project address, client name, sheet number, sheet name, scale (e.g., "1:1250 @ A1"), date',
      'May include revision tables with columns for "Rev", "Description", "Date", "Issued", "Checked"',
      'Often contains site-specific information: property address, location details, site boundaries',
      'May reference architectural standards, building regulations, or planning references',
      'Visual content is primarily technical line drawings, maps, or architectural renderings',
      'File may be PDF, image format (PNG, JPG), or CAD file format',
      'Distinguish from other documents: Plans are visual technical drawings, not written reports or text documents',
    ],
    categoryRules:
      'Plans are property-related technical documents showing architectural and engineering designs for construction projects and should be categorized under "Property Documents". They are distinct from written reports, appraisals, or monitoring documents.',
  },
  {
    fileType: 'Legal Documents',
    category: 'Legal Documents',
    keywords: [
      'legal document',
      'legal documents',
      'contract',
      'contracts',
      'resolution',
      'resolutions',
      'facility letter',
      'facility letters',
      'request',
      'requests',
      'board minutes',
      'board meeting',
      'shareholder agreement',
      'shareholder agreements',
      'banking details',
      'bank mandate',
      'mandate',
      'mandates',
      'sale and purchase agreement',
      'sale and purchase agreements',
      'spa',
      'purchase agreement',
      'purchase agreements',
      'notice',
      'notices',
      'eviction',
      'evictions',
      'terms and conditions',
      'terms of service',
      'amendment',
      'amendments',
      'offer letter',
      'offer letters',
      'guarantee',
      'guarantees',
      'legal',
      'solicitor',
      'solicitors',
      'law firm',
      'legal firm',
      'agreement',
      'agreements',
      'deed',
      'deeds',
      'covenant',
      'covenants',
    ],
    description:
      'Legal Documents are formal legal documents including contracts, resolutions, facility letters, requests, board minutes, shareholder agreements, banking details, mandates, sale and purchase agreements, notices, evictions, terms and conditions, amendments, offer letters, and guarantees. These documents are prepared by legal professionals and contain binding legal terms, obligations, and agreements.',
    identificationRules: [
      'Look for formal legal language, terms, conditions, and binding agreements',
      'May contain references to legal entities, parties, obligations, and rights',
      'Often includes signatures, execution dates, and witness requirements',
      'May reference legal statutes, regulations, or governing law',
      'Contains legal document structure: parties, recitals, terms, conditions, signatures',
      'May include legal firm letterhead, solicitor details, or legal professional information',
      'Look for specific document types: contracts, facility letters, board minutes, shareholder agreements, etc.',
      'May contain legal terminology: "hereby", "whereas", "notwithstanding", "pursuant to", etc.',
      'Often includes clauses, sections, schedules, and appendices',
      'May reference property addresses, loan amounts, interest rates, or financial terms',
      'Distinguish from other documents: Legal Documents contain binding legal terms, not just informational content',
    ],
    categoryRules:
      'Legal Documents should be categorized under "Legal Documents". When a specific subcategory can be identified, use the format "Legal Documents - [Subcategory]" for the fileType field. Available subcategories: Contracts, Resolutions, Facility Letters, Requests, Board Minutes, Shareholder Agreements, Banking Details, Mandates, Sale and Purchase Agreements, Notices, Evictions, Terms and Conditions, Amendments, Offer Letters, Guarantees. If no specific subcategory is clear, use "Legal Documents" as the fileType.',
  },
  {
    fileType: 'Indicative Terms',
    category: 'Loan Terms',
    keywords: [
      'indicative terms',
      'indicative term',
      'development finance',
      'development finance deal',
      'development loan',
      'bridging loan',
      'bridging finance',
      'loan terms',
      'finance terms',
      'loan facility',
      'facility terms',
      'ltgdv',
      'lgdv',
      'loan to gdv',
      'loan to gross development value',
      'land loan',
      'development loan',
      'land advance',
      'arrangement fee',
      'arr fee',
      'broker fee',
      'exit fee',
      'interest allowance',
      'base rate',
      'bbr',
      'per annum',
      'pa',
      'all in',
      'option 1',
      'option 2',
      'loan structure',
      'day 1 lending',
      'credit committee',
      'due diligence',
      'subject to',
      'in principle',
      'indicative pricing',
      'loan amount',
      'facility amount',
      'term',
      'months',
      'sancus',
      'development facility',
    ],
    description:
      'Indicative Terms are preliminary loan offers for development finance deals (bridging loans). These documents outline proposed loan terms including facility amounts, interest rates, fees (arrangement fees, broker fees, exit fees), loan structure breakdowns (land advance, build costs, professional fees, contingency), loan-to-value ratios (LTGDV, LGDV), and terms. These are typically "in principle" offers subject to further due diligence and Credit Committee approval.',
    identificationRules: [
      'Look for "Indicative Terms" or "Indicative Term" in the document title or header',
      'Contains development finance or bridging loan terminology',
      'Includes loan facility amounts and terms (e.g., "£2,503,000 over 17 months")',
      'Contains interest rate information (e.g., "5.25% per annum plus BBR", "7.25% above Base rate", "10.5% all in")',
      'Includes fee breakdowns: arrangement fees, broker fees, exit fees (often expressed as percentages)',
      'Contains loan structure breakdown: Land advance, Professional Fees, S106/CIL, Build costs, Contingency, PMS Fees, Interest Allowance',
      'May reference loan-to-value ratios: LTGDV (Loan to Gross Development Value), LGDV, or percentage of Land Market Value',
      'May include multiple options (e.g., "Option 1 - 65% LTGDV", "Option 2 - 70% LTGDV")',
      'Often states "in principle", "subject to further due diligence", or "subject to Credit Committee approval"',
      'May reference "Day 1 lending" limits or maximum lending amounts',
      'Contains development finance specific terminology: "development facility", "land loan", "development loan"',
      'May include project assessment or location comments',
      'Distinguish from formal loan agreements: Indicative Terms are preliminary offers, not final binding agreements',
    ],
    categoryRules:
      'Indicative Terms are preliminary loan offers for development finance deals and should be categorized under "Loan Terms". They are distinct from formal loan agreements, facility letters, or legal contracts. These represent initial terms subject to approval, not final binding documents.',
  },
  // More file types will be added here as needed
];

/**
 * Get relevant file type hints based on content analysis
 * Returns an array of formatted guidance strings for file types that match the content
 * Also checks filename for keyword matches
 * Can accept additional database-backed definitions to merge with hardcoded ones
 */
export function getRelevantFileTypeHints(
  textContent: string,
  fileName?: string,
  databaseDefinitions?: Array<{
    fileType: string;
    category: string;
    keywords: string[];
    description: string;
    identificationRules: string[];
    categoryRules?: string;
  }>
): string[] {
  const contentLower = textContent.toLowerCase();
  const fileNameLower = fileName ? fileName.toLowerCase() : '';
  const combinedText = `${contentLower} ${fileNameLower}`; // Combine for matching
  
  // Merge hardcoded definitions with database definitions
  const allDefinitions = [
    ...FILE_TYPE_DEFINITIONS,
    ...(databaseDefinitions || []).map((dbDef) => ({
      fileType: dbDef.fileType,
      category: dbDef.category,
      keywords: dbDef.keywords,
      description: dbDef.description,
      identificationRules: dbDef.identificationRules,
      categoryRules: dbDef.categoryRules,
    })),
  ];
  
  const relevantDefs = allDefinitions.filter((def) =>
    def.keywords.some((keyword) => combinedText.includes(keyword.toLowerCase()))
  );

  if (relevantDefs.length === 0) {
    return []; // No specific hints, model uses general knowledge
  }

  return relevantDefs.map(
    (def) =>
      `**${def.fileType}** (Category: ${def.category}):\n` +
      `- ${def.description}\n` +
      `- Identification: ${def.identificationRules.join('; ')}\n` +
      (def.categoryRules ? `- ${def.categoryRules}` : '')
  );
}

/**
 * Get file type definition by file type name
 */
export function getFileTypeDefinition(fileType: string): FileTypeDefinition | undefined {
  return FILE_TYPE_DEFINITIONS.find(
    (def) => def.fileType.toLowerCase() === fileType.toLowerCase()
  );
}

