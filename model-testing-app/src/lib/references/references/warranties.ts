// =============================================================================
// WARRANTIES — DOCUMENT REFERENCES
// =============================================================================
// Rich reference data for the Warranties category:
//   - NHBC Warranty (Buildmark new-build residential warranty)
//   - Latent Defects Insurance (structural warranty for commercial/non-standard)

import type { DocumentReference } from '../types';

export const WARRANTY_REFERENCES: DocumentReference[] = [
  // ---------------------------------------------------------------------------
  // 1. NHBC WARRANTY
  // ---------------------------------------------------------------------------
  {
    id: 'nhbc-warranty',
    fileType: 'NHBC Warranty',
    category: 'Warranties',
    filing: {
      targetFolder: 'Warranties',
      targetLevel: 'project',
    },

    description:
      'An NHBC Warranty is a structural warranty and insurance policy issued by the National ' +
      'House-Building Council (NHBC) under its Buildmark product for new-build residential ' +
      'properties in the United Kingdom. The NHBC is the leading warranty provider for new homes, ' +
      'covering the vast majority of new-build houses and flats. The Buildmark policy provides ' +
      'three distinct layers of protection over a 10-year period from the date of legal completion: ' +
      'during years 1-2, the builder is directly responsible for remedying defects that breach NHBC ' +
      'Standards under the builder warranty period; during years 3-10, the NHBC insurance policy ' +
      'covers the cost of repairing physical damage caused by defects in specified structural ' +
      'elements including foundations, load-bearing walls, external render and cladding, roof ' +
      'structure, floor structures, and flue installations. The warranty is issued only after the ' +
      'NHBC has conducted a series of building control inspections at key stages of construction ' +
      '(foundations, superstructure, pre-plaster, and final inspection) to verify compliance with ' +
      'NHBC Standards, which incorporate and often exceed the Building Regulations.\n\n' +
      'For RockCap\'s development lending, the NHBC Warranty is a critical document for several ' +
      'reasons. First, it is a requirement of the Council of Mortgage Lenders (CML) Lenders\' ' +
      'Handbook that new-build properties carry an acceptable structural warranty before individual ' +
      'unit mortgages can be granted, meaning end-buyers cannot obtain mortgage finance without it. ' +
      'This directly affects the borrower\'s exit strategy and the lender\'s ability to realise ' +
      'security. Second, NHBC registration confirms that the site has been enrolled with the NHBC ' +
      'prior to construction commencement and that building control inspections are being carried ' +
      'out throughout the build programme. The NHBC Buildmark certificate is typically issued upon ' +
      'practical completion of each plot, and the lender will require evidence of registration at ' +
      'drawdown stage and certificates at repayment. The document bears the distinctive NHBC logo, ' +
      'references the Buildmark policy number, and identifies the registered builder, site address, ' +
      'and individual plot numbers covered.',

    identificationRules: [
      'PRIMARY: NHBC logo or "National House-Building Council" branding on the document.',
      'PRIMARY: Reference to Buildmark policy, Buildmark cover, or NHBC Buildmark product name.',
      'CRITICAL: If NHBC branding is present combined with warranty or insurance cover language, treat as NHBC Warranty even without explicit "Buildmark" mention.',
      'Contains a 10-year structural warranty period commencing from legal completion date.',
      'Distinguishes between builder warranty period (years 1-2) and NHBC insurance period (years 3-10).',
      'References NHBC Standards or NHBC building control inspections at key construction stages.',
      'Identifies specific structural elements covered: foundations, load-bearing walls, roof structure, floor structures.',
      'Contains an NHBC registration number or Buildmark policy number for the site or individual plots.',
      'Names the registered builder and site address with individual plot or unit numbers.',
      'References CML Lenders\' Handbook compliance or mortgage lender acceptance.',
      'Includes NHBC inspection stages: foundations, superstructure, pre-plaster, final inspection.',
      'Issued upon or shortly after practical completion of the residential unit.',
    ],

    disambiguation: [
      'This is an NHBC Warranty, NOT a general Insurance Policy — it is a construction warranty scheme specific to new-build residential properties administered by the NHBC, not a commercial insurance contract from a general insurer.',
      'This is an NHBC Warranty, NOT a Latent Defects Insurance policy — NHBC Buildmark is specific to NHBC-registered new-build residential developments with NHBC building control, whereas LDI is a broader structural warranty product available for commercial or non-standard developments from other providers.',
      'This is an NHBC Warranty, NOT an Insurance Certificate — the full Buildmark warranty document contains the policy terms, cover periods, and exclusions, whereas an insurance certificate is a summary confirmation of cover.',
      'This is an NHBC Warranty, NOT a Collateral Warranty — a collateral warranty is a contractual agreement from a professional (architect, contractor) giving the lender direct rights to sue, whereas the NHBC Warranty is an insurance-backed structural guarantee.',
    ],

    terminology: {
      'NHBC': 'National House-Building Council — the UK\'s leading warranty and insurance provider for new-build homes, also acting as an Approved Inspector for building control.',
      'Buildmark': 'The NHBC\'s warranty and insurance product for new homes, providing 10-year cover against structural defects.',
      'Builder Warranty Period': 'Years 1-2 of Buildmark cover where the registered builder is directly responsible for remedying defects breaching NHBC Standards.',
      'NHBC Insurance Period': 'Years 3-10 of Buildmark cover where the NHBC insurance policy covers physical damage caused by structural defects.',
      'NHBC Standards': 'Technical requirements published by the NHBC that registered builders must comply with, incorporating and exceeding Building Regulations.',
      'CML Lenders\' Handbook': 'The Council of Mortgage Lenders\' guidance that requires new-build properties to carry an acceptable structural warranty before mortgage finance is granted.',
      'Approved Inspector': 'A private-sector building control body authorised to carry out building control functions as an alternative to local authority building control.',
      'Buildmark Policy Number': 'The unique reference number assigned to the Buildmark warranty for a specific site or plot.',
      'Registered Builder': 'A housebuilder registered with the NHBC who has agreed to build to NHBC Standards and is covered by the Buildmark scheme.',
      'Key Stage Inspections': 'Mandatory NHBC site inspections at foundations, superstructure, pre-plaster, and final stages to verify compliance.',
      'Plot Number': 'The individual unit identifier within a development, each receiving its own Buildmark certificate upon completion.',
    },

    tags: [
      { namespace: 'type', value: 'nhbc-warranty', weight: 3.0 },
      { namespace: 'signal', value: 'nhbc-branding', weight: 2.5 },
      { namespace: 'signal', value: 'buildmark-reference', weight: 2.5 },
      { namespace: 'signal', value: 'structural-warranty-cover', weight: 2.0 },
      { namespace: 'signal', value: '10-year-warranty-period', weight: 1.8 },
      { namespace: 'signal', value: 'new-build-residential', weight: 1.5 },
      { namespace: 'signal', value: 'building-control-inspections', weight: 1.2 },
      { namespace: 'domain', value: 'property-finance', weight: 1.5 },
      { namespace: 'domain', value: 'construction-warranty', weight: 2.0 },
      { namespace: 'domain', value: 'residential-development', weight: 1.5 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'summarization', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'extraction', weight: 1.0 },
      { namespace: 'context', value: 'chat', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'nhbc+buildmark+structural-warranty', weight: 2.5 },
    ],

    keywords: [
      'NHBC', 'National House-Building Council', 'Buildmark', 'structural warranty',
      'new-build warranty', '10-year warranty', 'builder warranty period',
      'NHBC Standards', 'NHBC registration', 'NHBC inspection',
      'building control', 'approved inspector', 'structural defects',
      'CML', 'Council of Mortgage Lenders', 'Lenders\' Handbook',
      'plot number', 'registered builder', 'key stage inspection',
      'foundations inspection', 'pre-plaster inspection', 'practical completion',
      'new homes warranty', 'residential warranty', 'defects liability',
    ],

    filenamePatterns: [
      'nhbc',
      'buildmark',
      'nhbc.*warranty',
      'nhbc.*certificate',
      'buildmark.*policy',
      'nhbc.*cover',
      'new.*home.*warranty',
      'structural.*warranty.*nhbc',
    ],

    excludePatterns: [
      'latent.*defect',
      'ldi\\b',
      'premier.*guarantee',
      'labc.*warranty',
      'zurich.*warranty',
      'collateral.*warranty',
      'insurance.*policy(?!.*nhbc)',
      'professional.*indemnity',
    ],

    decisionRules: [
      {
        condition: 'NHBC logo or branding detected in document header, footer, or cover page',
        signals: ['nhbc-branding', 'nhbc-logo', 'national-house-building-council'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'Reference to Buildmark policy or Buildmark cover in warranty context',
        signals: ['buildmark-reference', 'structural-warranty-cover'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'NHBC branding present combined with 10-year structural warranty language — classify as NHBC Warranty',
        signals: ['nhbc-branding', '10-year-warranty-period', 'structural-warranty-cover'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'Document references NHBC Standards compliance and key stage building control inspections',
        signals: ['nhbc-standards', 'building-control-inspections', 'key-stage-inspections'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Document identifies registered builder and individual plot numbers with warranty cover',
        signals: ['registered-builder', 'plot-numbers', 'new-build-residential'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'References CML Lenders\' Handbook or mortgage lender warranty requirements',
        signals: ['cml-reference', 'lenders-handbook', 'mortgage-lender-requirement'],
        priority: 6,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'warranty.provider',
      'warranty.policyNumber',
      'warranty.registeredBuilder',
      'warranty.siteAddress',
      'warranty.plotNumbers',
      'warranty.coverStartDate',
      'warranty.coverEndDate',
      'warranty.coverPeriodYears',
      'warranty.builderWarrantyExpiry',
      'warranty.insurancePeriodExpiry',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 2. LATENT DEFECTS INSURANCE
  // ---------------------------------------------------------------------------
  {
    id: 'latent-defects-insurance',
    fileType: 'Latent Defects Insurance',
    category: 'Warranties',
    filing: {
      targetFolder: 'Warranties',
      targetLevel: 'project',
    },

    description:
      'Latent Defects Insurance (LDI) is a structural warranty policy that provides cover against ' +
      'hidden defects in the design, materials, or workmanship of a building that are not apparent ' +
      'at the time of practical completion but manifest later during the policy term. LDI is the ' +
      'primary alternative to NHBC Buildmark for developments that fall outside the NHBC scheme, ' +
      'including commercial properties, mixed-use schemes, conversions, refurbishments, and ' +
      'non-standard residential developments. The policy is typically written for a 10-year or ' +
      '12-year period and is issued by specialist warranty providers such as Premier Guarantee, ' +
      'LABC Warranty, Zurich, Checkmate, BLP Insurance, or Protek. Unlike NHBC Buildmark, which ' +
      'is a combined building control and warranty product, LDI is a standalone insurance policy ' +
      'that may be underwritten by Lloyd\'s syndicates or specialist insurers.\n\n' +
      'The policy covers the cost of complete or partial rebuilding, or rectification of the ' +
      'affected parts of the building, where the damage is caused by a latent defect in the ' +
      'structure. Cover typically extends to the load-bearing framework, foundations, weather ' +
      'envelope (external walls, roof, and windows), and below-ground drainage. The insurer ' +
      'appoints a technical auditor to carry out inspections during the construction phase to ' +
      'monitor compliance with approved plans and building regulations, and the policy is only ' +
      'issued upon satisfactory completion of these audits.\n\n' +
      'For RockCap\'s development lending, LDI serves a similar function to the NHBC Warranty: it ' +
      'satisfies the CML Lenders\' Handbook requirement for an acceptable structural warranty, ' +
      'enabling end-buyers to obtain mortgage finance. This is critical to the borrower\'s exit ' +
      'strategy, particularly for developments where NHBC registration is unavailable or ' +
      'impractical. The lender will typically require evidence that the LDI policy has been ' +
      'arranged and that technical audit inspections are being carried out during the build ' +
      'programme. The policy document itself identifies the insured parties (usually the developer ' +
      'and successors in title), the property address, the policy period, the limit of indemnity, ' +
      'the excess, and any exclusions or endorsements specific to the development. LDI policies ' +
      'are transferable to subsequent owners, which is essential for maintaining the warranty ' +
      'protection through the sales chain.',

    identificationRules: [
      'PRIMARY: Explicit reference to "Latent Defects Insurance", "LDI", "structural warranty", or "building warranty" as the policy type.',
      'PRIMARY: Issued by a recognised warranty provider such as Premier Guarantee, LABC Warranty, Zurich, Checkmate, BLP Insurance, or Protek.',
      'CRITICAL: If the document provides 10-year or 12-year structural defect cover from a non-NHBC provider, classify as Latent Defects Insurance rather than NHBC Warranty.',
      'Contains a policy schedule identifying the insured, property address, policy period, limit of indemnity, and excess.',
      'Defines "latent defect" as a defect in design, materials, or workmanship not apparent at practical completion.',
      'Specifies covered structural elements: foundations, load-bearing framework, weather envelope, roof, below-ground drainage.',
      'References technical audit inspections carried out during the construction phase by the insurer\'s appointed auditor.',
      'Contains policy terms, conditions, exclusions, and endorsements typical of an insurance contract.',
      'States that cover is transferable to successors in title without additional premium.',
      'May reference compliance with the CML Lenders\' Handbook or acceptance by UK mortgage lenders.',
      'Does NOT carry NHBC or Buildmark branding — distinguishing it from an NHBC Warranty.',
      'May reference the defects liability period and how LDI cover commences after this period expires.',
    ],

    disambiguation: [
      'This is a Latent Defects Insurance policy, NOT an NHBC Warranty — LDI is issued by non-NHBC providers (Premier Guarantee, LABC, Zurich, etc.) for commercial or non-standard residential developments, whereas NHBC Buildmark is specific to NHBC-registered new-build residential schemes.',
      'This is a Latent Defects Insurance policy, NOT a general Insurance Certificate — the full LDI policy contains the complete terms, conditions, exclusions, and schedule, whereas an insurance certificate is a brief summary confirmation of cover.',
      'This is a Latent Defects Insurance policy, NOT a Collateral Warranty — LDI is an insurance product covering structural defects in the building itself, whereas a collateral warranty is a contractual agreement from a professional (architect, engineer, contractor) giving the lender direct rights of action.',
      'This is a Latent Defects Insurance policy, NOT a Professional Indemnity Insurance policy — LDI covers defects in the building structure, whereas PI insurance covers professionals against claims arising from their negligent advice or services.',
    ],

    terminology: {
      'Latent Defect': 'A hidden defect in design, materials, or workmanship that is not discoverable by reasonable inspection at the time of practical completion but manifests later.',
      'Structural Warranty': 'An insurance-backed warranty covering the structural integrity of a building, typically for 10 or 12 years from completion.',
      'Technical Audit': 'Inspections carried out during construction by the warranty provider\'s appointed auditor to verify compliance with approved plans and building regulations.',
      'Limit of Indemnity': 'The maximum amount the insurer will pay under the policy, typically equal to the reinstatement cost or contract value.',
      'Defects Liability Period': 'The initial period after practical completion (usually 12 months) during which the contractor is contractually obliged to rectify defects at their own cost.',
      'Weather Envelope': 'The external elements of a building that provide protection from the elements: external walls, roof, windows, and doors.',
      'Premier Guarantee': 'A leading UK structural warranty and building control provider, offering 10-year and 12-year latent defects policies.',
      'LABC Warranty': 'A structural warranty product provided by Local Authority Building Control, offering latent defects cover for residential and commercial developments.',
      'Successors in Title': 'Subsequent owners of the property who inherit the benefit of the warranty policy without requiring assignment.',
      'Excess': 'The amount the policyholder must pay towards each claim before the insurer\'s liability commences.',
      'Building Regulations': 'Statutory minimum standards for design and construction of buildings in England and Wales, enforced through building control.',
    },

    tags: [
      { namespace: 'type', value: 'latent-defects-insurance', weight: 3.0 },
      { namespace: 'signal', value: 'latent-defects-cover', weight: 2.5 },
      { namespace: 'signal', value: 'structural-warranty-cover', weight: 2.0 },
      { namespace: 'signal', value: 'non-nhbc-warranty-provider', weight: 2.0 },
      { namespace: 'signal', value: '10-year-warranty-period', weight: 1.8 },
      { namespace: 'signal', value: 'technical-audit-inspections', weight: 1.5 },
      { namespace: 'signal', value: 'policy-schedule', weight: 1.2 },
      { namespace: 'domain', value: 'property-finance', weight: 1.5 },
      { namespace: 'domain', value: 'construction-warranty', weight: 2.0 },
      { namespace: 'domain', value: 'construction-insurance', weight: 1.5 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'summarization', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'extraction', weight: 1.0 },
      { namespace: 'context', value: 'chat', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'latent-defects+structural-warranty+non-nhbc', weight: 2.5 },
    ],

    keywords: [
      'latent defects insurance', 'LDI', 'structural warranty', 'building warranty',
      'latent defect', 'structural defect', '10-year warranty', '12-year warranty',
      'Premier Guarantee', 'LABC Warranty', 'Zurich', 'Checkmate', 'BLP Insurance', 'Protek',
      'technical audit', 'limit of indemnity', 'defects liability period',
      'weather envelope', 'load-bearing framework', 'below-ground drainage',
      'successors in title', 'transferable warranty', 'building regulations',
      'CML', 'Lenders\' Handbook', 'structural cover', 'reinstatement cost',
      'policy schedule', 'practical completion',
    ],

    filenamePatterns: [
      'latent.*defect',
      'ldi\\b',
      'structural.*warranty',
      'building.*warranty',
      'premier.*guarantee',
      'labc.*warranty',
      'zurich.*warranty',
      'checkmate.*warranty',
      'blp.*insurance',
      'protek.*warranty',
      'defects.*insurance',
    ],

    excludePatterns: [
      'nhbc',
      'buildmark',
      'national.*house.*building',
      'collateral.*warranty',
      'professional.*indemnity',
      'pi\\s+insurance',
      'public.*liability',
      'employers.*liability',
    ],

    decisionRules: [
      {
        condition: 'Document explicitly references "Latent Defects Insurance" or "LDI" as policy type',
        signals: ['latent-defects-cover', 'structural-warranty-cover', 'insurance-policy'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'Issued by a recognised non-NHBC warranty provider (Premier Guarantee, LABC, Zurich, etc.)',
        signals: ['non-nhbc-warranty-provider', 'premier-guarantee', 'labc-warranty', 'zurich-warranty'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Non-NHBC structural warranty with 10-year or 12-year cover period — classify as LDI',
        signals: ['structural-warranty-cover', '10-year-warranty-period', 'non-nhbc-warranty-provider'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'Policy schedule present with limit of indemnity, excess, and insured parties',
        signals: ['policy-schedule', 'limit-of-indemnity', 'insured-parties'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Technical audit inspections referenced during construction phase',
        signals: ['technical-audit-inspections', 'construction-phase-monitoring'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Cover stated as transferable to successors in title',
        signals: ['transferable-cover', 'successors-in-title'],
        priority: 5,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'warranty.provider',
      'warranty.policyNumber',
      'warranty.insuredParties',
      'warranty.propertyAddress',
      'warranty.policyPeriodYears',
      'warranty.coverStartDate',
      'warranty.coverEndDate',
      'warranty.limitOfIndemnity',
      'warranty.excess',
      'warranty.technicalAuditor',
      'warranty.coveredElements',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },
];
