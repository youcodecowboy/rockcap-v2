// =============================================================================
// LOAN TERMS — DOCUMENT REFERENCES
// =============================================================================
// Covers: Indicative Terms, Credit Backed Terms, Term Sheet
// Domain: UK property development finance (bridging, development, mezzanine)

import type { DocumentReference } from '../types';

export const LOAN_TERMS_REFERENCES: DocumentReference[] = [
  // ---------------------------------------------------------------------------
  // 1. Indicative Terms
  // ---------------------------------------------------------------------------
  {
    id: 'indicative-terms',
    fileType: 'Indicative Terms',
    category: 'Loan Terms',
    filing: {
      targetFolder: 'Loan Terms',
      targetLevel: 'project',
    },
    description:
      'Indicative Terms (also referred to as Heads of Terms, Indicative Offer, or Preliminary ' +
      'Terms) are the initial non-binding loan proposal issued by a lender to a prospective ' +
      'borrower in UK property development finance. This document is produced early in the ' +
      'origination process, typically after an initial credit screening but before full ' +
      'underwriting or credit committee approval. It outlines the lender\'s preliminary view of ' +
      'the key commercial parameters under which they would be willing to provide funding. ' +
      'Standard contents include the proposed facility amount, loan-to-value (LTV) or ' +
      'loan-to-gross-development-value (LTGDV) ratio, interest rate (usually expressed as a ' +
      'margin over SONIA or as a fixed monthly rate), arrangement fee, exit fee, proposed loan ' +
      'term, and a high-level summary of required security (typically a first legal charge over ' +
      'the property and a personal guarantee from the principal borrower). Indicative Terms ' +
      'will usually carry an explicit disclaimer or caveat stating that the offer is "subject to ' +
      'credit approval", "subject to satisfactory due diligence", or "indicative and non-binding". ' +
      'They may reference conditions precedent (CPs) at a headline level but will not contain ' +
      'the exhaustive CP schedule found in a credit-backed offer. The document may also outline ' +
      'a preliminary tranche structure (e.g., a land tranche and build tranche) for development ' +
      'facilities. In the RockCap workflow, Indicative Terms serve as the basis for initial ' +
      'client discussions and project modelling before the deal is escalated to credit committee. ' +
      'They are superseded by Credit Backed Terms once credit approval is obtained, and ' +
      'ultimately by the formal Facility Agreement prepared by solicitors.',

    identificationRules: [
      'PRIMARY: Document is titled "Indicative Terms", "Heads of Terms", "Indicative Offer", or "Preliminary Terms"',
      'PRIMARY: Contains an explicit non-binding disclaimer such as "subject to credit approval", "indicative only", or "non-binding"',
      'CRITICAL: Proposes loan facility parameters (amount, LTV, interest rate, fees) without referencing credit committee approval',
      'Contains proposed loan amount, LTV/LTGDV ratio, and interest rate in a structured summary format',
      'References arrangement fee and/or exit fee as proposed percentages',
      'Outlines high-level security requirements (first legal charge, personal guarantee) without exhaustive detail',
      'May include a validity period or expiry date for the indicative offer',
      'Does not contain a formal credit committee approval stamp, reference number, or approval date',
      'May reference preliminary conditions precedent without a full detailed CP schedule',
      'Typically 2-5 pages in length with a commercial terms summary table or bullet-point structure',
      'May include borrower and property details at a summary level alongside proposed terms',
    ],

    disambiguation: [
      'Indicative Terms are NON-BINDING proposals issued BEFORE credit approval. If the document references credit committee sign-off or contains a credit approval reference, it is Credit Backed Terms instead.',
      'Indicative Terms are issued BY THE LENDER. If the document is a borrower\'s request for funding with project details and a business plan, it is a Loan Application or Application Form, not Indicative Terms.',
      'Indicative Terms present headline commercial parameters. If the document is a comprehensive multi-page legal agreement with extensive covenants, representations, and detailed drawdown mechanics, it is a Facility Agreement (Legal Documents category), not Indicative Terms.',
      'Indicative Terms may resemble a Term Sheet, but a Term Sheet can be either indicative or credit-backed. If the document explicitly states it is non-binding and pre-credit, classify as Indicative Terms. If binding status is ambiguous, classify as Term Sheet.',
    ],

    terminology: {
      'Indicative Terms': 'Non-binding preliminary loan proposal issued before credit committee approval',
      'Heads of Terms': 'Alternative name for Indicative Terms; outlines key deal parameters',
      'Subject to Credit': 'Caveat indicating the offer requires formal credit committee approval before becoming binding',
      'LTV': 'Loan to Value ratio, the facility amount expressed as a percentage of the property\'s current market value',
      'LTGDV': 'Loan to Gross Development Value, the facility amount as a percentage of the projected completed value',
      'Arrangement Fee': 'One-off fee charged by the lender at loan drawdown, typically 1-2% of the facility',
      'Exit Fee': 'Fee payable on repayment of the loan, sometimes expressed as a percentage of the facility or GDV',
      'SONIA': 'Sterling Overnight Index Average, the benchmark interest rate replacing LIBOR for GBP lending',
      'First Legal Charge': 'Primary security interest over the property, giving the lender first priority on enforcement',
      'Personal Guarantee': 'A guarantee from the individual borrower or director backing the loan with personal assets',
    },

    tags: [
      { namespace: 'type', value: 'indicative-terms', weight: 1.5 },
      { namespace: 'type', value: 'heads-of-terms', weight: 1.3 },
      { namespace: 'domain', value: 'property-finance', weight: 1.2 },
      { namespace: 'domain', value: 'lending', weight: 1.0 },
      { namespace: 'signal', value: 'non-binding-disclaimer', weight: 1.4 },
      { namespace: 'signal', value: 'loan-parameters', weight: 1.0 },
      { namespace: 'signal', value: 'fee-schedule', weight: 0.8 },
      { namespace: 'signal', value: 'security-requirements', weight: 0.8 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'trigger', value: 'non-binding+loan-parameters', weight: 1.3 },
    ],

    keywords: [
      'indicative terms',
      'heads of terms',
      'indicative offer',
      'preliminary terms',
      'non-binding',
      'subject to credit',
      'subject to credit approval',
      'proposed facility',
      'loan to value',
      'LTV',
      'LTGDV',
      'arrangement fee',
      'exit fee',
      'interest rate',
      'SONIA margin',
      'first legal charge',
      'personal guarantee',
      'facility amount',
      'loan term',
      'indicative only',
      'proposed terms',
      'tranche structure',
      'security package',
      'conditions precedent',
    ],

    filenamePatterns: [
      'indicative.?terms',
      'heads.?of.?terms',
      'indicative.?offer',
      'preliminary.?terms',
      'HOT[_\\s-]',
      'indicative.?proposal',
    ],

    excludePatterns: [
      'credit.?backed',
      'credit.?approved',
      'facility.?agreement',
      'facility.?letter',
      'loan.?agreement',
      'application.?form',
    ],

    decisionRules: [
      {
        condition: 'Document contains non-binding disclaimer and proposed loan parameters',
        signals: ['non-binding-disclaimer', 'loan-parameters'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Filename matches indicative terms or heads of terms pattern',
        signals: ['filename-match-indicative-terms'],
        priority: 8,
        action: 'require',
      },
      {
        condition: 'Document contains fee schedule and security requirements without credit approval',
        signals: ['fee-schedule', 'security-requirements', 'no-credit-approval'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document references proposed loan amount and LTV/LTGDV',
        signals: ['loan-parameters', 'ltv-reference'],
        priority: 6,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'financials.loanAmount',
      'financials.ltv',
      'financials.ltc',
      'timeline.projectDuration',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 2. Credit Backed Terms
  // ---------------------------------------------------------------------------
  {
    id: 'credit-backed-terms',
    fileType: 'Credit Backed Terms',
    category: 'Loan Terms',
    filing: {
      targetFolder: 'Loan Terms',
      targetLevel: 'project',
    },
    description:
      'Credit Backed Terms (also known as a Credit Approved Offer, Formal Offer, or Binding ' +
      'Terms) represent the definitive loan terms issued by a lender after the transaction has ' +
      'received formal approval from the credit committee. In UK property development finance, ' +
      'this document marks a critical milestone: the transition from preliminary commercial ' +
      'discussion to a binding commitment (subject only to the satisfaction of conditions ' +
      'precedent and execution of legal documentation). The Credit Backed Terms set out the ' +
      'approved facility amount, confirmed LTV or LTGDV ratio, the agreed interest rate ' +
      '(expressed as SONIA plus a margin, or a fixed monthly/annual rate), arrangement fee, exit ' +
      'fee, and the full security package required. Unlike Indicative Terms, this document will ' +
      'contain an explicit reference to credit committee approval — often including the credit ' +
      'committee date, a credit reference or approval number, and confirmation that the terms are ' +
      '"credit approved" or "binding subject to CPs". The conditions precedent schedule is ' +
      'significantly more detailed than in an indicative offer, typically itemising valuation ' +
      'requirements, legal title checks, insurance stipulations, planning consent confirmations, ' +
      'KYC/AML completion, and any borrower-specific conditions. The document may also detail the ' +
      'tranche structure for development facilities (land tranche, build tranche) with specific ' +
      'drawdown mechanics, monitoring surveyor requirements, and cost-to-complete triggers. For ' +
      'RockCap, Credit Backed Terms are the key document against which the legal team drafts the ' +
      'Facility Agreement. They serve as the authoritative reference for agreed commercial terms ' +
      'and form the basis of the project file\'s loan terms record. Any subsequent material ' +
      'change to terms requires a credit committee variation or amendment.',

    identificationRules: [
      'PRIMARY: Document explicitly states "credit approved", "credit committee approved", or "binding terms"',
      'PRIMARY: Contains a credit committee approval date, credit reference number, or approval stamp',
      'CRITICAL: Presents finalised (not proposed) loan terms with confirmed facility amount, LTV, interest rate, and fees',
      'Contains a detailed conditions precedent (CP) schedule listing specific pre-drawdown requirements',
      'References the security package in detail: first legal charge, debenture, personal guarantee, assignment of insurances',
      'May include detailed tranche structure with drawdown mechanics and monitoring surveyor triggers',
      'Language uses definitive phrasing: "the Lender will provide", "the Facility shall be", rather than "proposed" or "indicative"',
      'Typically includes a formal validity/acceptance period requiring borrower signature within a set timeframe',
      'Often longer and more detailed than Indicative Terms, typically 4-10 pages',
      'May reference specific solicitor panels or instruct named solicitors to prepare facility documentation',
      'Includes financial covenants or undertakings the borrower must maintain during the loan term',
    ],

    disambiguation: [
      'Credit Backed Terms have RECEIVED credit committee approval and are BINDING (subject to CPs). If the document contains "subject to credit approval" or "indicative only" disclaimers, it is Indicative Terms instead.',
      'Credit Backed Terms are a COMMERCIAL document summarising approved parameters. If the document is a full legal agreement with extensive representations, warranties, boilerplate clauses, and execution pages, it is a Facility Agreement (Legal Documents category).',
      'Credit Backed Terms are issued BY THE LENDER after internal approval. If the document is a borrower submission seeking approval, it is a Credit Paper or Loan Application, not Credit Backed Terms.',
      'Credit Backed Terms differ from a generic Term Sheet in that they explicitly evidence credit committee approval. If the document summarises loan terms but does not reference credit approval, classify as Term Sheet.',
    ],

    terminology: {
      'Credit Backed Terms': 'Loan terms that have received formal credit committee approval and are binding subject to CPs',
      'Credit Committee': 'Internal lender body that formally approves or declines loan applications',
      'Conditions Precedent': 'Specific requirements that must be satisfied before the facility can be drawn down',
      'Debenture': 'Security instrument granting a floating charge over the borrower company\'s assets',
      'Monitoring Surveyor': 'Independent surveyor appointed to verify construction progress before build tranche drawdowns',
      'Drawdown Mechanics': 'The procedural and documentary requirements for releasing loan tranches',
      'Cost to Complete': 'Remaining expenditure required to finish the development, monitored against the approved budget',
      'Assignment of Insurances': 'Security requirement where insurance policy benefits are legally assigned to the lender',
      'Land Tranche': 'Initial portion of the facility used to acquire or refinance the site',
      'Build Tranche': 'Subsequent portion of the facility released in stages to fund construction costs',
      'SONIA + Margin': 'Interest rate structure where the rate is the Sterling Overnight Index Average plus a lender spread',
      'Variation': 'A formal amendment to credit-approved terms requiring credit committee re-approval',
    },

    tags: [
      { namespace: 'type', value: 'credit-backed-terms', weight: 1.5 },
      { namespace: 'type', value: 'credit-approved-offer', weight: 1.3 },
      { namespace: 'domain', value: 'property-finance', weight: 1.2 },
      { namespace: 'domain', value: 'lending', weight: 1.0 },
      { namespace: 'signal', value: 'credit-approval-reference', weight: 1.5 },
      { namespace: 'signal', value: 'loan-parameters', weight: 1.0 },
      { namespace: 'signal', value: 'detailed-cp-schedule', weight: 1.2 },
      { namespace: 'signal', value: 'security-requirements', weight: 0.9 },
      { namespace: 'signal', value: 'binding-language', weight: 1.1 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'trigger', value: 'credit-approval+loan-parameters', weight: 1.4 },
      { namespace: 'trigger', value: 'binding-language+detailed-cp-schedule', weight: 1.2 },
    ],

    keywords: [
      'credit backed terms',
      'credit approved',
      'credit committee',
      'binding terms',
      'formal offer',
      'credit approved offer',
      'conditions precedent',
      'CP schedule',
      'approved facility',
      'confirmed LTV',
      'LTGDV',
      'arrangement fee',
      'exit fee',
      'debenture',
      'first legal charge',
      'personal guarantee',
      'drawdown mechanics',
      'monitoring surveyor',
      'build tranche',
      'land tranche',
      'SONIA margin',
      'credit reference',
      'approval date',
      'binding subject to',
      'assignment of insurances',
    ],

    filenamePatterns: [
      'credit.?backed',
      'credit.?approved',
      'formal.?offer',
      'binding.?terms',
      'approved.?terms',
      'CBT[_\\s-]',
    ],

    excludePatterns: [
      'indicative',
      'preliminary',
      'non.?binding',
      'subject.?to.?credit',
      'facility.?agreement',
      'facility.?letter',
      'loan.?agreement',
    ],

    decisionRules: [
      {
        condition: 'Document contains explicit credit committee approval reference and finalised loan parameters',
        signals: ['credit-approval-reference', 'loan-parameters'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Filename matches credit backed or credit approved pattern',
        signals: ['filename-match-credit-backed-terms'],
        priority: 8,
        action: 'require',
      },
      {
        condition: 'Document contains detailed CP schedule with binding language',
        signals: ['detailed-cp-schedule', 'binding-language'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document references tranche structure with drawdown mechanics and monitoring surveyor',
        signals: ['tranche-structure', 'drawdown-mechanics', 'monitoring-surveyor'],
        priority: 6,
        action: 'boost',
      },
      {
        condition: 'Document contains loan terms with security package detail',
        signals: ['loan-parameters', 'security-requirements'],
        priority: 5,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'financials.loanAmount',
      'financials.ltv',
      'financials.ltc',
      'timeline.projectDuration',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 3. Term Sheet
  // ---------------------------------------------------------------------------
  {
    id: 'term-sheet',
    fileType: 'Term Sheet',
    category: 'Loan Terms',
    filing: {
      targetFolder: 'Loan Terms',
      targetLevel: 'project',
    },
    description:
      'A Term Sheet in UK property development finance is a concise document summarising the ' +
      'principal commercial terms of a proposed or approved loan facility. It serves as a ' +
      'structured overview of the deal parameters and may be issued at various stages of the ' +
      'origination process — from early-stage indicative discussions through to post-credit ' +
      'approval. The term "Term Sheet" is used broadly across the industry and can describe ' +
      'either a non-binding indicative summary or a credit-backed binding document, depending on ' +
      'the lender\'s conventions and the stage of the transaction. A typical Term Sheet contains ' +
      'the borrower entity name, property address, facility amount, loan-to-value (LTV) or ' +
      'loan-to-gross-development-value (LTGDV) ratio, loan-to-cost (LTC) ratio, interest rate ' +
      '(expressed as a fixed rate, SONIA plus margin, or monthly equivalent), arrangement fee, ' +
      'exit fee, loan term, repayment basis, and a summary of required security. For development ' +
      'facilities, it will typically outline the tranche structure (land tranche and build ' +
      'tranche), construction monitoring arrangements, and cost-to-complete requirements. The ' +
      'security section will reference a first legal charge over the development site, a ' +
      'debenture over the borrower SPV, personal guarantees from directors or principals, and ' +
      'assignment of professional team appointments and insurances. Term Sheets are used ' +
      'extensively in RockCap\'s workflow for both internal deal tracking and external broker or ' +
      'borrower communication. They provide a single-page or short-form reference for the key ' +
      'economics of a deal. When a document is labelled "Term Sheet" without clear indication of ' +
      'whether it is pre- or post-credit approval, it should be classified under this generic ' +
      'Term Sheet type rather than as Indicative Terms or Credit Backed Terms, preserving the ' +
      'document\'s own labelling. The Term Sheet is distinct from a Facility Letter or Facility ' +
      'Agreement, which are legal documents drafted by solicitors containing full contractual ' +
      'terms, representations, warranties, and covenants.',

    identificationRules: [
      'PRIMARY: Document is explicitly titled "Term Sheet" or "Terms Sheet"',
      'PRIMARY: Presents a structured summary of loan terms (facility amount, LTV, rate, fees, security) in a condensed format',
      'CRITICAL: Does not clearly fall into either Indicative Terms (non-binding) or Credit Backed Terms (credit-approved) categories, or its binding status is ambiguous',
      'Typically formatted as a table, grid, or concise bullet-point summary rather than discursive paragraphs',
      'Contains the core commercial parameters: facility amount, interest rate, arrangement fee, exit fee, loan term',
      'References LTV, LTGDV, or LTC ratios alongside the facility amount',
      'Outlines the security package: first legal charge, debenture, personal guarantee',
      'May include a tranche breakdown (land tranche, build tranche) for development facilities',
      'Typically 1-4 pages, shorter and more condensed than a full credit-backed offer',
      'May or may not include conditions precedent; if present, usually at a summary level',
      'May carry the lender\'s letterhead or branding but without extensive legal boilerplate',
    ],

    disambiguation: [
      'A Term Sheet is a GENERIC summary of loan terms. If the document explicitly states it is "indicative", "non-binding", or "subject to credit approval", prefer classifying as Indicative Terms. If it explicitly references credit committee approval, prefer Credit Backed Terms.',
      'A Term Sheet summarises COMMERCIAL terms only. If the document is a full legal agreement with representations, warranties, events of default, and execution clauses, it is a Facility Agreement or Facility Letter (Legal Documents category), not a Term Sheet.',
      'A Term Sheet is issued BY THE LENDER (or prepared by a broker on behalf of the lender). If the document is a borrower\'s application or request for funding containing a business plan and development appraisal, it is a Loan Application or Project Summary, not a Term Sheet.',
      'A Term Sheet may resemble an Investment Memo or Credit Paper in content, but Credit Papers are internal underwriting documents with risk analysis. If the document contains detailed risk commentary, comparable transactions, or credit scoring, it is likely a Credit Paper rather than a Term Sheet.',
    ],

    terminology: {
      'Term Sheet': 'Concise summary document setting out the principal commercial terms of a loan facility',
      'Facility Amount': 'The total quantum of the loan being offered or approved',
      'LTV': 'Loan to Value, expressing the facility as a percentage of the property\'s current market value',
      'LTGDV': 'Loan to Gross Development Value, expressing the facility as a percentage of the estimated completed value',
      'LTC': 'Loan to Cost, expressing the facility as a percentage of the total project cost including land and build costs',
      'Margin': 'The lender\'s spread above the reference rate (SONIA), representing the lender\'s return',
      'Repayment Basis': 'Whether interest is serviced monthly, rolled up, or retained from the facility at drawdown',
      'Rolled-Up Interest': 'Interest that accrues and compounds during the loan term, payable on repayment rather than monthly',
      'Retained Interest': 'Interest deducted from the facility amount upfront and held by the lender',
      'SPV': 'Special Purpose Vehicle, the borrowing entity established specifically for the development project',
      'Tranche': 'A distinct portion of the total facility allocated for a specific purpose (land acquisition or construction)',
    },

    tags: [
      { namespace: 'type', value: 'term-sheet', weight: 1.5 },
      { namespace: 'domain', value: 'property-finance', weight: 1.2 },
      { namespace: 'domain', value: 'lending', weight: 1.0 },
      { namespace: 'signal', value: 'loan-parameters', weight: 1.2 },
      { namespace: 'signal', value: 'fee-schedule', weight: 1.0 },
      { namespace: 'signal', value: 'security-requirements', weight: 0.9 },
      { namespace: 'signal', value: 'tabular-terms-layout', weight: 1.1 },
      { namespace: 'signal', value: 'tranche-structure', weight: 0.8 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'trigger', value: 'loan-parameters+tabular-terms-layout', weight: 1.2 },
    ],

    keywords: [
      'term sheet',
      'terms sheet',
      'facility amount',
      'loan amount',
      'LTV',
      'LTGDV',
      'LTC',
      'interest rate',
      'arrangement fee',
      'exit fee',
      'loan term',
      'security package',
      'first legal charge',
      'debenture',
      'personal guarantee',
      'SONIA',
      'margin',
      'tranche',
      'land tranche',
      'build tranche',
      'rolled up interest',
      'retained interest',
      'repayment basis',
      'facility term',
    ],

    filenamePatterns: [
      'term.?sheet',
      'terms.?sheet',
      'TS[_\\s-]',
      'deal.?terms',
      'loan.?terms',
    ],

    excludePatterns: [
      'facility.?agreement',
      'facility.?letter',
      'loan.?agreement',
      'credit.?paper',
      'credit.?memo',
      'application.?form',
      'investment.?memo',
    ],

    decisionRules: [
      {
        condition: 'Document is titled "Term Sheet" and contains structured loan parameter summary',
        signals: ['title-term-sheet', 'loan-parameters'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Filename matches term sheet pattern',
        signals: ['filename-match-term-sheet'],
        priority: 8,
        action: 'require',
      },
      {
        condition: 'Document contains loan terms in tabular/summary format with ambiguous binding status',
        signals: ['loan-parameters', 'tabular-terms-layout', 'ambiguous-binding-status'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document references facility amount, interest rate, and security package',
        signals: ['loan-parameters', 'fee-schedule', 'security-requirements'],
        priority: 6,
        action: 'include',
      },
      {
        condition: 'Document contains tranche structure with LTV/LTGDV ratios',
        signals: ['tranche-structure', 'ltv-reference'],
        priority: 5,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'financials.loanAmount',
      'financials.ltv',
      'financials.ltc',
      'timeline.projectDuration',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },
];
