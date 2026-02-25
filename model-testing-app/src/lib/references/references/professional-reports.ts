// =============================================================================
// PROFESSIONAL REPORTS — DOCUMENT REFERENCES
// =============================================================================
// Rich reference data for Professional Reports category.
// Used across all AI features: classification, summarization, extraction,
// filing, chat, checklists.

import type { DocumentReference } from '../types';

export const PROFESSIONAL_REPORT_REFERENCES: DocumentReference[] = [
  // ---------------------------------------------------------------------------
  // 1. BUILDING SURVEY
  // ---------------------------------------------------------------------------
  {
    id: 'building-survey',
    fileType: 'Building Survey',
    category: 'Professional Reports',
    filing: {
      targetFolder: 'Professional Reports',
      targetLevel: 'project',
    },
    description:
      'A Building Survey (formerly known as a RICS Level 3 Survey or Full Structural Survey) is a comprehensive, ' +
      'professional assessment of a property\'s physical condition. Commissioned by lenders, purchasers, or developers ' +
      'prior to acquisition or lending, it is typically prepared by a RICS-qualified chartered surveyor. The survey ' +
      'provides a detailed inspection of the building fabric, structural elements, services, and external areas. ' +
      'Key sections cover the roof structure and coverings, external walls, foundations (where visible), damp-proof ' +
      'courses, internal floors and walls, joinery, plumbing, electrical installations, heating systems, and drainage. ' +
      'Each element is graded using a condition rating system (1 = no repair needed, 2 = defects requiring attention, ' +
      '3 = serious defects requiring urgent repair). The report highlights defects such as subsidence, rising damp, ' +
      'timber decay, structural cracking, and asbestos-containing materials. It will typically comment on the approximate ' +
      'age of the property, construction methods employed, and any non-standard features. For property finance purposes, ' +
      'the Building Survey is critical because it identifies latent defects that could materially affect the security value ' +
      'or require significant capital expenditure to remedy. Lenders rely on the survey to confirm that the property is in ' +
      'a condition consistent with the proposed loan-to-value ratio and that no defects would jeopardise the asset as ' +
      'security. The report often includes recommendations for further specialist investigations (e.g., drainage CCTV ' +
      'surveys, asbestos surveys, or structural engineer assessments) and estimated costs of repair where significant ' +
      'defects are identified. It is distinct from a Monitoring Report, which tracks ongoing construction progress rather ' +
      'than providing a one-time condition assessment of an existing building.',
    identificationRules: [
      'PRIMARY: Document title contains "Building Survey", "Full Structural Survey", or "RICS Level 3 Survey"',
      'PRIMARY: Prepared by a RICS-qualified chartered building surveyor with MRICS or FRICS designations',
      'CRITICAL: Contains condition ratings (1/2/3 or Green/Amber/Red) for individual building elements',
      'Systematic element-by-element inspection covering roof, walls, floors, services, and drainage',
      'Includes photographs of defects and building elements with condition commentary',
      'References to Building Research Establishment (BRE) standards or RICS Home Survey Standard',
      'Contains sections on damp, timber condition, structural movement, and asbestos risk',
      'Recommendations for further specialist investigations or remedial works',
      'Property description section with age, construction type, and accommodation details',
      'Site inspection date and limitations/restrictions on inspection noted',
      'May include estimated costs of significant repairs or a reinstatement cost assessment',
    ],
    disambiguation: [
      'A Building Survey is a one-time condition assessment of an existing property, NOT a Monitoring Report which tracks ongoing construction progress over multiple site visits.',
      'A Building Survey assesses the physical building fabric and defects, NOT a RedBook Valuation which determines market value (though both may be commissioned together).',
      'A Building Survey covers the building condition comprehensively, NOT an Environmental Report which focuses on contamination, ground conditions, and environmental liabilities.',
      'A Building Survey is a professional surveyor\'s report, NOT a Schedule of Condition which is a more limited photographic record used for lease purposes.',
    ],
    terminology: {
      'RICS': 'Royal Institution of Chartered Surveyors - the professional body governing surveying standards in the UK',
      'Level 3 Survey': 'The most detailed RICS home survey tier, providing comprehensive analysis of condition',
      'Condition Rating': 'Grading system (1-3) indicating severity of defects for each building element',
      'Rising Damp': 'Moisture ascending through masonry by capillary action due to failed or absent DPC',
      'DPC': 'Damp-Proof Course - a barrier in the wall to prevent moisture rising from the ground',
      'Subsidence': 'Downward movement of the ground beneath foundations causing structural damage',
      'Heave': 'Upward ground movement, often from clay expansion, causing foundation disturbance',
      'Lintel': 'Horizontal structural element spanning an opening such as a door or window',
      'Reinstatement Cost': 'Estimated cost to rebuild the property from scratch for insurance purposes',
    },
    tags: [
      { namespace: 'type', value: 'building-survey', weight: 1.0 },
      { namespace: 'domain', value: 'property-finance', weight: 0.8 },
      { namespace: 'domain', value: 'construction', weight: 0.6 },
      { namespace: 'signal', value: 'rics-branding', weight: 0.9 },
      { namespace: 'signal', value: 'condition-ratings', weight: 0.8 },
      { namespace: 'signal', value: 'defect-photographs', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.7 },
      { namespace: 'trigger', value: 'survey+condition+defects', weight: 0.9 },
    ],
    keywords: [
      'building survey', 'structural survey', 'RICS Level 3', 'condition report',
      'chartered surveyor', 'defect', 'subsidence', 'rising damp', 'timber decay',
      'roof condition', 'structural cracking', 'asbestos', 'DPC', 'drainage',
      'foundations', 'joinery', 'condition rating', 'reinstatement cost',
      'damp proof course', 'heave', 'settlement', 'pointing', 'rendered walls',
      'building fabric', 'MRICS',
    ],
    filenamePatterns: [
      'building.?survey',
      'structural.?survey',
      'rics.?level.?3',
      'full.?survey',
      'condition.?survey',
      'bldg.?survey',
    ],
    excludePatterns: [
      'monitoring.?report',
      'valuation',
      'appraisal',
      'environmental',
      'schedule.?of.?condition',
    ],
    decisionRules: [
      {
        condition: 'Document contains RICS condition ratings and element-by-element inspection',
        signals: ['condition-ratings', 'rics-branding', 'element-inspection'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document references building defects with photographic evidence',
        signals: ['defect-photographs', 'structural-defects'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document is a surveyor report on property condition',
        signals: ['surveyor-report', 'property-condition'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'property.address', 'property.type', 'property.age', 'property.constructionType',
      'surveyor.name', 'surveyor.firm', 'surveyor.ricsNumber',
      'inspection.date', 'inspection.limitations',
      'condition.overall', 'condition.roof', 'condition.walls', 'condition.structure',
      'defects.summary', 'recommendations.furtherInvestigations',
      'costs.estimatedRepairs', 'costs.reinstatement',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 2. REPORT ON TITLE
  // ---------------------------------------------------------------------------
  {
    id: 'report-on-title',
    fileType: 'Report on Title',
    category: 'Professional Reports',
    filing: {
      targetFolder: 'Professional Reports',
      targetLevel: 'project',
    },
    description:
      'A Report on Title is a solicitor\'s written analysis of a property\'s legal title, prepared for the lender to ' +
      'confirm that the title is acceptable as security for a loan. Typically produced by the borrower\'s solicitor (or the ' +
      'lender\'s solicitor in dual-representation arrangements), the report provides a structured review of the title ' +
      'documents registered at HM Land Registry. The report confirms the title number(s), the registered proprietor(s), ' +
      'the class of title (absolute, qualified, possessory, or good leasehold), and the tenure (freehold or leasehold). ' +
      'It identifies all encumbrances, charges, restrictions, and notices registered against the title, including existing ' +
      'mortgages, restrictive covenants, easements, rights of way, and any cautions or notices that could affect the ' +
      'lender\'s security. For leasehold properties, the report examines the term of the lease, ground rent provisions, ' +
      'service charge obligations, and any forfeiture clauses. The solicitor will raise observations on any title defects ' +
      'and advise whether they are capable of remedy or whether indemnity insurance is recommended. The report also ' +
      'addresses planning compliance (confirming lawful use), building regulation compliance, and any outstanding statutory ' +
      'notices. In the context of property finance, the Report on Title is an essential pre-completion deliverable. The ' +
      'lender\'s credit committee will review it to ensure the legal title supports the proposed loan structure and that the ' +
      'lender\'s charge can be registered as a first legal charge without impediment. Any issues flagged in the report may ' +
      'result in conditions precedent that must be satisfied before drawdown. The Certificate of Title (CML/BSA or Lender\'s ' +
      'Handbook form) is often provided alongside or as part of the Report on Title.',
    identificationRules: [
      'PRIMARY: Document title contains "Report on Title", "Certificate of Title", or "Title Report for Lender"',
      'PRIMARY: Prepared by a solicitor or law firm on headed notepaper with SRA regulation references',
      'CRITICAL: Contains title number(s) in Land Registry format (e.g., "Title Number: XX123456")',
      'Lists encumbrances, restrictions, charges, and notices registered against the title',
      'References to HM Land Registry, official copies of title, or title plan',
      'Analysis of tenure (freehold/leasehold), class of title, and registered proprietor details',
      'Identifies restrictive covenants, easements, rights of way, and their implications',
      'For leasehold: reviews lease term, ground rent, service charges, and forfeiture provisions',
      'Commentary on planning status, building regulation compliance, and statutory notices',
      'Recommendations regarding title insurance or indemnity policies for defects',
      'Addressed to the lender with confirmation of reliance and duty of care',
      'References to CML Handbook, BSA requirements, or Lender\'s Handbook compliance',
    ],
    disambiguation: [
      'A Report on Title is a solicitor\'s ANALYSIS of title quality and encumbrances, NOT a Title Deed which is the actual Land Registry document proving ownership.',
      'A Report on Title is a legal advisory report, NOT a Legal Opinion which addresses a specific legal question or issue rather than reviewing title comprehensively.',
      'A Report on Title is a pre-completion legal report on the property, NOT a Facility Letter which is the lender\'s binding loan agreement.',
      'A Report on Title is focused on the legal title, NOT a Building Survey which assesses the property\'s physical condition.',
    ],
    terminology: {
      'Title Number': 'Unique reference number assigned by HM Land Registry to each registered title',
      'Encumbrance': 'A burden on the title such as a mortgage, covenant, easement, or restriction',
      'Restrictive Covenant': 'A legally binding obligation restricting use of the land (e.g., no commercial use)',
      'Easement': 'A legal right to use another person\'s land for a specific purpose (e.g., right of way)',
      'First Legal Charge': 'A mortgage registered as the primary security interest, giving the lender priority',
      'Class of Title': 'Land Registry classification: absolute, qualified, possessory, or good leasehold',
      'CML Handbook': 'Council of Mortgage Lenders guidelines for solicitors acting on lender instructions',
      'Indemnity Insurance': 'Insurance policy covering a known title defect that cannot be easily remedied',
      'Official Copies': 'HM Land Registry documents comprising the register and title plan',
    },
    tags: [
      { namespace: 'type', value: 'report-on-title', weight: 1.0 },
      { namespace: 'domain', value: 'property-finance', weight: 0.9 },
      { namespace: 'domain', value: 'legal', weight: 0.9 },
      { namespace: 'signal', value: 'title-number', weight: 0.9 },
      { namespace: 'signal', value: 'solicitor-letterhead', weight: 0.8 },
      { namespace: 'signal', value: 'encumbrance-schedule', weight: 0.8 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.8 },
      { namespace: 'trigger', value: 'legal+title+encumbrances', weight: 0.9 },
    ],
    keywords: [
      'report on title', 'certificate of title', 'title number', 'encumbrances',
      'restrictive covenant', 'easement', 'first legal charge', 'registered proprietor',
      'freehold', 'leasehold', 'HM Land Registry', 'official copies', 'title plan',
      'class of title', 'charges register', 'property register', 'indemnity insurance',
      'CML handbook', 'right of way', 'ground rent', 'service charge', 'tenure',
      'solicitor', 'legal title', 'SRA',
    ],
    filenamePatterns: [
      'report.?on.?title',
      'certificate.?of.?title',
      'title.?report',
      'rot\\b',
      'cot\\b',
      'lender.?title.?report',
    ],
    excludePatterns: [
      'title.?deed',
      'title.?plan',
      'official.?cop',
      'land.?registry.?entry',
      'valuation',
    ],
    decisionRules: [
      {
        condition: 'Document contains title number analysis and encumbrance schedule from solicitor',
        signals: ['title-number', 'solicitor-letterhead', 'encumbrance-schedule'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document reviews legal title with registered proprietor and charges',
        signals: ['title-analysis', 'registered-proprietor', 'charges-register'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Legal document referencing property title and Land Registry',
        signals: ['land-registry', 'title-review'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'title.number', 'title.classOfTitle', 'title.tenure',
      'title.registeredProprietor', 'title.address',
      'encumbrances.charges', 'encumbrances.restrictiveCovenants',
      'encumbrances.easements', 'encumbrances.restrictions',
      'leasehold.term', 'leasehold.groundRent', 'leasehold.serviceCharge',
      'solicitor.firm', 'solicitor.name', 'solicitor.sraNumber',
      'observations.defects', 'observations.recommendations',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 3. LEGAL OPINION
  // ---------------------------------------------------------------------------
  {
    id: 'legal-opinion',
    fileType: 'Legal Opinion',
    category: 'Professional Reports',
    filing: {
      targetFolder: 'Professional Reports',
      targetLevel: 'project',
    },
    description:
      'A Legal Opinion is a formal written statement from a qualified solicitor or barrister providing professional ' +
      'legal advice on a specific legal question or issue relevant to a property finance transaction. Unlike a Report ' +
      'on Title (which comprehensively reviews the legal title), a Legal Opinion is commissioned to address a particular ' +
      'point of law, regulatory interpretation, or transactional risk. Common subjects include: the enforceability of ' +
      'security documents, the validity of corporate authorisations and guarantees, compliance with regulatory requirements ' +
      '(such as FCA consumer credit rules or money laundering regulations), interpretation of restrictive covenants, the ' +
      'legal effect of planning conditions, enforceability of development agreements, and the implications of insolvency ' +
      'on existing security. The opinion is structured around the specific instructions received, setting out the factual ' +
      'assumptions and documents reviewed, followed by the legal analysis and the solicitor\'s conclusions. Opinions ' +
      'typically contain express qualifications and limitations, including assumptions about the accuracy of factual ' +
      'information provided and restrictions on who may rely on the opinion. In the context of RockCap\'s lending ' +
      'operations, Legal Opinions are commonly required as conditions precedent to drawdown or as part of the credit ' +
      'committee due diligence package. They may address complex matters such as cross-border security enforcement, ' +
      'the priority of charges in a multi-lender structure, the capacity of a foreign entity to grant English law security, ' +
      'or the tax implications of a particular loan structure. The opinion provides the lender with comfort that specific ' +
      'legal risks have been identified and assessed by qualified counsel. Legal Opinions from Queen\'s Counsel (KC) or ' +
      'specialist practitioners carry particular weight for novel or contentious points of law.',
    identificationRules: [
      'PRIMARY: Document titled "Legal Opinion", "Advice", "Opinion Letter", or "Counsel\'s Opinion"',
      'PRIMARY: Authored by a solicitor, barrister, or law firm on professional headed notepaper',
      'CRITICAL: Structured around specific legal questions with reasoned analysis and conclusions',
      'Contains qualifications, assumptions, and limitations on reliance sections',
      'References to specific legislation, case law, or statutory provisions',
      'Addressed to a named party with express scope of instructions',
      'Contains professional duty of care language and terms of engagement',
      'Provides a definitive legal conclusion or recommendation on the matters addressed',
      'May contain references to regulatory frameworks (FCA, SRA, Companies Act)',
      'Formal legal language with numbered paragraphs and structured legal reasoning',
      'Often marked "Privileged and Confidential" or "Subject to Legal Professional Privilege"',
    ],
    disambiguation: [
      'A Legal Opinion addresses a SPECIFIC legal question, NOT a Report on Title which comprehensively reviews the entire property title.',
      'A Legal Opinion is advisory legal analysis, NOT a Facility Letter which is a binding contractual loan agreement.',
      'A Legal Opinion provides legal advice, NOT a Personal Guarantee or Corporate Guarantee which are security instruments.',
      'A Legal Opinion is formal legal counsel, NOT Meeting Minutes or Email/Correspondence which may informally discuss legal matters.',
    ],
    terminology: {
      'Counsel': 'A barrister or KC (King\'s Counsel) providing specialist legal advice',
      'KC': 'King\'s Counsel - a senior barrister appointed by the Crown, formerly QC (Queen\'s Counsel)',
      'Legal Professional Privilege': 'The right to withhold legal advice from disclosure in proceedings',
      'Duty of Care': 'The legal obligation owed by the adviser to the recipient of the opinion',
      'Conditions Precedent': 'Requirements that must be satisfied before a loan can be drawn down',
      'Capacity': 'The legal power of an entity to enter into a transaction or grant security',
      'Enforceability': 'Whether a legal document or obligation can be enforced through the courts',
      'Ultra Vires': 'Beyond the legal powers of a company or public body',
      'Reliance Letter': 'A letter confirming which parties may rely on the legal opinion',
    },
    tags: [
      { namespace: 'type', value: 'legal-opinion', weight: 1.0 },
      { namespace: 'domain', value: 'legal', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.7 },
      { namespace: 'signal', value: 'solicitor-letterhead', weight: 0.8 },
      { namespace: 'signal', value: 'legal-reasoning', weight: 0.9 },
      { namespace: 'signal', value: 'qualifications-limitations', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.6 },
      { namespace: 'trigger', value: 'legal+opinion+advice', weight: 0.9 },
    ],
    keywords: [
      'legal opinion', 'counsel opinion', 'legal advice', 'opinion letter',
      'enforceability', 'capacity', 'qualifications', 'assumptions', 'reliance',
      'duty of care', 'legal professional privilege', 'conditions precedent',
      'solicitor', 'barrister', 'KC', 'Queen\'s Counsel', 'legislation',
      'statutory provisions', 'case law', 'regulatory', 'FCA', 'Companies Act',
      'ultra vires', 'interpretation', 'conclusions',
    ],
    filenamePatterns: [
      'legal.?opinion',
      'counsel.?opinion',
      'opinion.?letter',
      'legal.?advice',
      'kc.?opinion',
      'qc.?opinion',
    ],
    excludePatterns: [
      'facility.?letter',
      'loan.?agreement',
      'report.?on.?title',
      'guarantee',
      'term.?sheet',
    ],
    decisionRules: [
      {
        condition: 'Document contains structured legal analysis with conclusions on specific questions',
        signals: ['legal-reasoning', 'solicitor-letterhead', 'qualifications-limitations'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document addresses a discrete legal question with professional opinion',
        signals: ['legal-question', 'professional-advice'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Formal legal correspondence providing advice on a legal matter',
        signals: ['legal-correspondence', 'advisory-content'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'opinion.subject', 'opinion.instructedBy', 'opinion.date',
      'opinion.solicitor', 'opinion.firm', 'opinion.sraNumber',
      'opinion.questionsAddressed', 'opinion.conclusions',
      'opinion.qualifications', 'opinion.assumptions',
      'opinion.legislation', 'opinion.caselaw',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 4. ENVIRONMENTAL REPORT
  // ---------------------------------------------------------------------------
  {
    id: 'environmental-report',
    fileType: 'Environmental Report',
    category: 'Professional Reports',
    filing: {
      targetFolder: 'Professional Reports',
      targetLevel: 'project',
    },
    description:
      'An Environmental Report is a professional assessment of the environmental condition and potential contamination ' +
      'risks associated with a property or site. In UK property finance, environmental due diligence typically follows a ' +
      'phased approach. A Phase 1 Environmental Assessment (also called a Preliminary Risk Assessment or Desktop Study) ' +
      'involves a review of historical maps, environmental databases, regulatory records, and a site walkover to identify ' +
      'potential contamination sources, pathways, and receptors. It produces a conceptual site model (CSM) and a risk ' +
      'assessment using the source-pathway-receptor framework. If the Phase 1 identifies potential contamination risks, ' +
      'a Phase 2 Environmental Assessment (Intrusive Investigation) follows, involving soil sampling, groundwater ' +
      'monitoring, gas monitoring, and laboratory analysis to quantify contamination levels against relevant assessment ' +
      'criteria. Reports reference the Environment Agency\'s contaminated land guidance, CIRIA documents, BS 10175 ' +
      '(Investigation of Potentially Contaminated Sites), and CLR 11 (Model Procedures for the Management of Land ' +
      'Contamination). Key concerns include: previous industrial or commercial use that may have left contaminated ' +
      'soils, proximity to landfill sites or fuel storage, presence of asbestos in ground, groundwater contamination, ' +
      'and ground gas (methane, carbon dioxide, radon) risks. The report concludes with a risk rating (low, moderate, ' +
      'high) and recommendations for remediation if required. For lenders, environmental risk is material because ' +
      'contamination can dramatically reduce land value, create remediation liabilities under Part 2A of the ' +
      'Environmental Protection Act 1990, and delay or prevent development. Environmental reports are typically ' +
      'prepared by specialist consultancies with geotechnical and environmental expertise and are required as part of ' +
      'the lending due diligence package.',
    identificationRules: [
      'PRIMARY: Document titled "Environmental Report", "Phase 1 Assessment", "Phase 2 Investigation", or "Contaminated Land Assessment"',
      'PRIMARY: Prepared by an environmental or geotechnical consultancy with relevant accreditations',
      'CRITICAL: Contains contamination risk assessment using source-pathway-receptor methodology',
      'References to Environment Agency guidance, BS 10175, CIRIA, or CLR 11 standards',
      'Includes review of historical Ordnance Survey maps showing past land use',
      'Contains environmental database search results (Envirocheck, Landmark, or similar)',
      'Phase 2 reports contain borehole logs, soil sample results, and gas monitoring data',
      'Risk classification matrix or risk rating (low/moderate/moderate-high/high)',
      'Conceptual Site Model (CSM) diagram or description',
      'References to Part 2A Environmental Protection Act 1990 or planning contamination conditions',
      'Recommendations for remediation strategy, further investigation, or monitoring',
    ],
    disambiguation: [
      'An Environmental Report assesses contamination and environmental liabilities, NOT a Building Survey which assesses the physical condition of the building fabric.',
      'An Environmental Report is a technical assessment of ground and groundwater conditions, NOT a Local Authority Search which provides planning and regulatory information from the council.',
      'An Environmental Report is specific to environmental risk, NOT a Planning Documentation set which covers planning permissions and conditions.',
      'A Phase 1 Environmental Assessment is a desk study and walkover, NOT a Phase 2 which involves intrusive investigation with soil and groundwater sampling.',
    ],
    terminology: {
      'Phase 1': 'Preliminary Risk Assessment - desk study, historical maps review, and site walkover',
      'Phase 2': 'Intrusive investigation - soil sampling, groundwater monitoring, laboratory analysis',
      'CSM': 'Conceptual Site Model - diagram linking contamination sources, pathways, and receptors',
      'Source-Pathway-Receptor': 'Risk framework: contamination must have a source, pathway to reach, and a receptor to harm',
      'Part 2A': 'Part 2A Environmental Protection Act 1990 - the contaminated land regulatory regime',
      'Remediation': 'The process of removing, reducing, or managing contamination to acceptable levels',
      'Borehole': 'A drilled hole in the ground for soil sampling or groundwater monitoring',
      'Ground Gas': 'Gases (methane, CO2, radon) present in the ground that may pose risk to buildings or occupants',
      'Envirocheck': 'Commercial environmental database report providing regulatory and risk data for a site',
    },
    tags: [
      { namespace: 'type', value: 'environmental-report', weight: 1.0 },
      { namespace: 'domain', value: 'property-finance', weight: 0.8 },
      { namespace: 'domain', value: 'construction', weight: 0.7 },
      { namespace: 'signal', value: 'contamination-assessment', weight: 0.9 },
      { namespace: 'signal', value: 'environmental-databases', weight: 0.8 },
      { namespace: 'signal', value: 'soil-sampling-data', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.7 },
      { namespace: 'trigger', value: 'environmental+contamination+phase', weight: 0.9 },
    ],
    keywords: [
      'environmental report', 'Phase 1', 'Phase 2', 'contamination', 'contaminated land',
      'environmental assessment', 'risk assessment', 'source pathway receptor',
      'conceptual site model', 'borehole', 'soil sampling', 'groundwater',
      'ground gas', 'methane', 'radon', 'asbestos', 'remediation',
      'Environment Agency', 'Part 2A', 'BS 10175', 'Envirocheck', 'historical maps',
      'landfill', 'geotechnical',
    ],
    filenamePatterns: [
      'environmental.?report',
      'phase.?[12]',
      'contamina',
      'env.?assessment',
      'geo.?environmental',
      'preliminary.?risk.?assessment',
      'desktop.?study',
    ],
    excludePatterns: [
      'building.?survey',
      'valuation',
      'monitoring.?report',
      'insurance',
      'epc',
    ],
    decisionRules: [
      {
        condition: 'Document contains contamination risk assessment with source-pathway-receptor model',
        signals: ['contamination-assessment', 'environmental-databases', 'risk-matrix'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document includes historical map review and environmental database searches',
        signals: ['historical-maps', 'environmental-databases'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Report discusses environmental conditions or contamination risk for a site',
        signals: ['environmental-risk', 'site-conditions'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'site.address', 'site.area', 'site.currentUse', 'site.historicalUse',
      'assessment.phase', 'assessment.date', 'assessment.consultant',
      'risk.overall', 'risk.contamination', 'risk.groundGas', 'risk.groundwater',
      'findings.contaminants', 'findings.exceedances',
      'recommendations.remediation', 'recommendations.furtherInvestigation',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 5. LOCAL AUTHORITY SEARCH
  // ---------------------------------------------------------------------------
  {
    id: 'local-authority-search',
    fileType: 'Local Authority Search',
    category: 'Professional Reports',
    filing: {
      targetFolder: 'Professional Reports',
      targetLevel: 'project',
    },
    description:
      'A Local Authority Search is a set of enquiries made to the local council (Local Planning Authority) regarding a ' +
      'property, forming a standard part of conveyancing due diligence in England and Wales. The search is submitted on a ' +
      'standard form (CON29R for required enquiries, CON29O for optional enquiries) and is accompanied by an LLC1 search ' +
      'of the Local Land Charges register. The LLC1 search reveals entries on the Local Land Charges register, including ' +
      'financial charges, planning charges, listed building designations, conservation area status, tree preservation orders, ' +
      'smoke control orders, and Article 4 directions. The CON29R enquiries cover planning and building regulation history ' +
      'for the property, including approved and pending applications, enforcement actions, building control completion ' +
      'certificates, roads adoption status, contaminated land register entries, and radon-affected area designations. The ' +
      'CON29O optional enquiries may cover additional matters such as public path orders, noise abatement zones, urban ' +
      'development areas, and hazardous substance consents. For property finance lenders, the Local Authority Search is ' +
      'essential because it reveals matters that could materially affect the property\'s value or development potential. ' +
      'A pending enforcement notice, unadopted road frontage, or contaminated land entry can significantly impact the ' +
      'security value and the borrower\'s ability to complete a proposed development. The search results also confirm ' +
      'planning history, which is cross-referenced against the Report on Title and any Planning Documentation to ensure ' +
      'the current use is lawful and any proposed development has the necessary consents. Local Authority Searches are ' +
      'typically valid for a limited period (commonly 6 months) and may need to be refreshed for long-running transactions. ' +
      'Personal searches (conducted by a search agent rather than the council) may also be accepted, particularly where ' +
      'council turnaround times are lengthy.',
    identificationRules: [
      'PRIMARY: Document contains "CON29R", "CON29O", "LLC1", or "Local Authority Search" in the title or header',
      'PRIMARY: Issued by a local council, local planning authority, or personal search company',
      'CRITICAL: Contains numbered enquiries matching the standard CON29R/CON29O format',
      'Lists Local Land Charges register entries with charge descriptions',
      'Contains planning history including application references, decisions, and dates',
      'References to roads adoption status (Section 38/Section 278 agreements)',
      'Includes building regulation completion certificates or outstanding notices',
      'Contains property-specific search results with the council\'s official responses',
      'References to conservation areas, listed buildings, or tree preservation orders',
      'Standard form layout with sequential question numbers and council responses',
      'May include a search map or plan showing the search boundary',
    ],
    disambiguation: [
      'A Local Authority Search provides planning and regulatory data from the local council, NOT an Environmental Report which assesses contamination and ground conditions.',
      'A Local Authority Search is the council\'s formal response to standard enquiries, NOT Planning Documentation which comprises the actual planning permissions and decision notices.',
      'A Local Authority Search is property-specific conveyancing due diligence, NOT a Company Search which is a corporate due diligence check at Companies House.',
      'An LLC1 search is of the Local Land Charges register, NOT a search of the HM Land Registry title register which is covered in Official Copies.',
    ],
    terminology: {
      'CON29R': 'Standard form for required local authority enquiries in conveyancing transactions',
      'CON29O': 'Standard form for optional local authority enquiries covering additional matters',
      'LLC1': 'Search of the Local Land Charges register maintained by the local authority',
      'Local Land Charges': 'Charges and restrictions registered against land by local and public authorities',
      'Article 4 Direction': 'Removes permitted development rights, requiring planning permission for otherwise permitted works',
      'TPO': 'Tree Preservation Order - legal protection preventing felling or pruning of specific trees',
      'Conservation Area': 'An area of special architectural or historic interest whose character is preserved',
      'Section 38 Agreement': 'Agreement for a developer to build a road to adoptable standards for the council to adopt',
      'Completion Certificate': 'Building control confirmation that works comply with Building Regulations',
    },
    tags: [
      { namespace: 'type', value: 'local-authority-search', weight: 1.0 },
      { namespace: 'domain', value: 'property-finance', weight: 0.9 },
      { namespace: 'domain', value: 'legal', weight: 0.7 },
      { namespace: 'signal', value: 'con29-format', weight: 0.9 },
      { namespace: 'signal', value: 'llc1-results', weight: 0.9 },
      { namespace: 'signal', value: 'planning-history', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.7 },
      { namespace: 'trigger', value: 'local-authority+search+con29', weight: 0.9 },
    ],
    keywords: [
      'local authority search', 'CON29R', 'CON29O', 'LLC1', 'local land charges',
      'planning history', 'building regulations', 'roads adoption', 'conservation area',
      'listed building', 'tree preservation order', 'TPO', 'Article 4',
      'enforcement notice', 'completion certificate', 'adopted road', 'unadopted',
      'smoke control', 'radon', 'contaminated land register', 'conveyancing search',
      'personal search', 'local council', 'Section 38',
    ],
    filenamePatterns: [
      'local.?authority.?search',
      'con29',
      'llc1',
      'la.?search',
      'council.?search',
      'land.?charges.?search',
    ],
    excludePatterns: [
      'environmental',
      'company.?search',
      'companies.?house',
      'land.?registry',
      'title.?search',
    ],
    decisionRules: [
      {
        condition: 'Document contains CON29R/CON29O enquiry responses from a local authority',
        signals: ['con29-format', 'llc1-results', 'council-responses'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document contains Local Land Charges register entries and planning history',
        signals: ['local-land-charges', 'planning-history'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Search results document from a local council or search agent',
        signals: ['council-search', 'conveyancing-search'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'search.type', 'search.date', 'search.authority', 'search.reference',
      'property.address', 'property.searchBoundary',
      'llc1.charges', 'llc1.financialCharges',
      'planning.history', 'planning.pendingApplications', 'planning.enforcement',
      'buildingControl.completionCertificates', 'buildingControl.outstandingNotices',
      'roads.adoptionStatus', 'roads.agreements',
      'designations.conservationArea', 'designations.listedBuilding', 'designations.tpo',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 6. PLANNING DOCUMENTATION
  // ---------------------------------------------------------------------------
  {
    id: 'planning-documentation',
    fileType: 'Planning Documentation',
    category: 'Professional Reports',
    filing: {
      targetFolder: 'Professional Reports',
      targetLevel: 'project',
    },
    description:
      'Planning Documentation encompasses the suite of documents associated with obtaining and evidencing planning ' +
      'permission for a development project. This includes the planning application itself, decision notices (grants of ' +
      'planning permission with conditions), planning officer\'s committee reports, Section 106 agreements, discharge of ' +
      'conditions applications and approvals, Community Infrastructure Levy (CIL) liability notices, and any associated ' +
      'planning appeal decisions. In England and Wales, planning permission is granted by the Local Planning Authority ' +
      '(LPA) under the Town and Country Planning Act 1990. The Decision Notice is the formal document confirming the ' +
      'grant (or refusal) of permission, specifying the approved development description and listing all planning ' +
      'conditions that must be complied with. Pre-commencement conditions must be discharged before works begin, while ' +
      'other conditions may require compliance during construction or prior to occupation. Section 106 agreements are ' +
      'planning obligations that require developers to provide affordable housing contributions, infrastructure payments, ' +
      'public open space, or other community benefits as a condition of the planning consent. CIL is a separate levy ' +
      'calculated on the net additional floor area of a development. For property finance lenders, Planning Documentation ' +
      'is fundamental because the value of a development site is largely determined by the planning consent it holds. ' +
      'Lenders verify that a valid, implementable planning permission exists for the proposed scheme, that conditions are ' +
      'being properly discharged, and that Section 106 obligations and CIL liabilities are understood and budgeted for. ' +
      'Any risk of planning permission lapsing (typically 3 years from the date of the decision notice for full permission) ' +
      'or being revoked is a material concern. Conditions requiring amendment through a Section 73 application or a ' +
      'non-material amendment under Section 96A are also tracked carefully.',
    identificationRules: [
      'PRIMARY: Document titled "Decision Notice", "Planning Permission", "Grant of Planning Permission", or "Planning Application"',
      'PRIMARY: Issued by a Local Planning Authority (LPA) with the council\'s name and planning reference number',
      'CRITICAL: Contains planning conditions with numbered conditions list and compliance requirements',
      'References planning application reference number (e.g., "Application No: 2024/1234")',
      'Contains formal approval language: "permission is hereby granted" or "planning permission is refused"',
      'Lists pre-commencement conditions, pre-occupation conditions, and compliance conditions',
      'References Town and Country Planning Act 1990, Section 57(1), or associated regulations',
      'Contains an "Informatives" or "Notes to Applicant" section with advisory guidance (building regs, highways, appeals)',
      'Application reference in council format (e.g., "23/01713/FULM" where suffix indicates application type)',
      'Section 106 agreement content with financial contributions, affordable housing, or other obligations',
      'CIL (Community Infrastructure Levy) liability notices or exemption applications',
      'Discharge of conditions applications with LPA approval responses',
      'May include approved drawings schedule or list of approved plans',
      'Planning officer\'s report with assessment against development plan policies',
    ],
    disambiguation: [
      'Planning Documentation comprises the planning permissions and decision notices, NOT a Building Contract (JCT or otherwise) which is the construction agreement between employer and contractor.',
      'Planning Documentation is about planning consent from the LPA, NOT a Local Authority Search which provides general conveyancing enquiry results from the council.',
      'Planning Documentation grants permission for development, NOT Building Regulations approval which confirms compliance with construction standards (Part A-P).',
      'A Section 106 agreement is a planning obligation, NOT a Facility Letter or loan agreement.',
    ],
    terminology: {
      'LPA': 'Local Planning Authority - the council department responsible for planning decisions',
      'Decision Notice': 'The formal document granting or refusing planning permission',
      'Section 106': 'Planning obligations under the Town and Country Planning Act 1990 requiring developer contributions',
      'CIL': 'Community Infrastructure Levy - a charge on new development to fund local infrastructure',
      'Pre-commencement Condition': 'A planning condition that must be discharged before any works begin on site',
      'Section 73': 'Application to vary or remove conditions attached to an existing planning permission',
      'Section 96A': 'Application for a non-material amendment to an existing planning permission',
      'Permitted Development': 'Development that can proceed without planning permission under the GPDO',
      'GPDO': 'General Permitted Development Order - defines development types not requiring planning permission',
      'Material Consideration': 'A factor the LPA must take into account when determining a planning application',
      'FULM': 'Full Planning Application (Major) - for developments of 10+ dwellings or site area 0.5+ hectares',
      'Informatives': 'Advisory notes on a decision notice that are not binding conditions but provide guidance to the applicant',
    },
    tags: [
      { namespace: 'type', value: 'planning-documentation', weight: 1.0 },
      { namespace: 'domain', value: 'property-finance', weight: 0.9 },
      { namespace: 'domain', value: 'construction', weight: 0.8 },
      { namespace: 'signal', value: 'planning-conditions', weight: 0.9 },
      { namespace: 'signal', value: 'lpa-branding', weight: 0.8 },
      { namespace: 'signal', value: 'section-106', weight: 0.8 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.8 },
      { namespace: 'trigger', value: 'planning+permission+conditions', weight: 0.9 },
    ],
    keywords: [
      'planning permission', 'decision notice', 'planning application', 'planning conditions',
      'Section 106', 'CIL', 'community infrastructure levy', 'discharge of conditions',
      'pre-commencement', 'Local Planning Authority', 'LPA', 'Town and Country Planning Act',
      'Section 73', 'Section 96A', 'planning officer', 'committee report',
      'approved drawings', 'planning reference', 'outline permission', 'full permission',
      'reserved matters', 'material amendment', 'GPDO', 'permitted development',
      'informatives', 'notes to applicant', 'FULM', 'planning approval',
      'grant of planning permission', 'application registered',
    ],
    filenamePatterns: [
      'planning.?permission',
      'decision.?notice',
      'planning.?app',
      's106',
      'section.?106',
      'discharge.?of.?condition',
      'planning.?doc',
      'planning.?approval',
      'cil.?notice',
    ],
    excludePatterns: [
      'building.?contract',
      'jct',
      'building.?reg',
      'facility.?letter',
      'loan.?agreement',
    ],
    decisionRules: [
      {
        condition: 'Document is a planning decision notice with numbered conditions from an LPA',
        signals: ['planning-conditions', 'lpa-branding', 'decision-notice'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document contains Section 106 obligations or CIL liability information',
        signals: ['section-106', 'cil-levy', 'planning-obligations'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Document relates to planning permission or conditions discharge',
        signals: ['planning-reference', 'conditions-discharge'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'planning.reference', 'planning.lpa', 'planning.decisionDate',
      'planning.registeredDate', 'planning.applicant', 'planning.siteAddress',
      'planning.type', 'planning.description', 'planning.decision',
      'planning.expiryDate', 'planning.implementationDeadline',
      'planning.unitMix', 'planning.applicationType',
      'conditions.total', 'conditions.preCommencement', 'conditions.preOccupation', 'conditions.compliance',
      'conditions.dischargeStatus',
      's106.obligations', 's106.affordableHousing', 's106.financialContributions',
      'cil.liability', 'cil.exemptions',
      'approvedPlans.schedule',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 7. CONTRACT SUM ANALYSIS
  // ---------------------------------------------------------------------------
  {
    id: 'contract-sum-analysis',
    fileType: 'Contract Sum Analysis',
    category: 'Professional Reports',
    filing: {
      targetFolder: 'Professional Reports',
      targetLevel: 'project',
    },
    description:
      'A Contract Sum Analysis (CSA) is a detailed cost breakdown of a construction project, typically prepared by a ' +
      'Quantity Surveyor (QS) or cost consultant. It itemises the total contract sum into its constituent elements, ' +
      'providing transparency on how the overall build cost is composed. The CSA is structured around the building ' +
      'elements or work packages that make up the project: substructure/foundations, superstructure (frame, upper floors, ' +
      'roof, stairs), external walls and cladding, windows and doors, internal walls and partitions, wall finishes, floor ' +
      'finishes, ceiling finishes, fittings and furnishings, mechanical services (HVAC, plumbing), electrical services, ' +
      'lift installations, external works (landscaping, drainage, parking), and preliminaries. The CSA also separately ' +
      'identifies the contractor\'s overhead and profit margin, design fees (where design and build), contingency ' +
      'allowances, and any provisional sums or prime cost items. Costs are typically presented on a per-unit basis ' +
      '(cost per apartment, cost per square foot) as well as total project cost. For property finance lenders, the CSA ' +
      'is a critical document because it enables the lender and their monitoring surveyor to assess whether the build ' +
      'cost is reasonable and in line with market benchmarks (e.g., BCIS cost data). The lender uses the CSA to structure ' +
      'the loan drawdown schedule, with tranches released against certified completion of specific work elements. The CSA ' +
      'also feeds into the Gross Development Value (GDV) appraisal and the calculation of profit on cost. Any significant ' +
      'variation between the CSA and actual costs incurred during construction may trigger a cost overrun review. The CSA ' +
      'is typically appended to or referenced within the Building Contract (commonly a JCT contract) and is used ' +
      'alongside the build programme to forecast cash flow requirements throughout the project.',
    identificationRules: [
      'PRIMARY: Document titled "Contract Sum Analysis", "CSA", "Cost Plan", "Cost Breakdown", or "Budget Summary"',
      'PRIMARY: Prepared by a Quantity Surveyor (QS), cost consultant, or construction cost management firm',
      'CRITICAL: Contains itemised cost breakdown by building element or work package with individual line values',
      'Includes preliminaries, contingency, overhead and profit as separately identified costs',
      'Contains total contract sum with clear summation of all cost elements',
      'May reference BCIS cost indices, RICS NRM (New Rules of Measurement), or elemental cost categories',
      'Includes provisional sums and prime cost items where applicable',
      'Cost figures presented per unit (per apartment/per sqft) alongside total project costs',
      'References to JCT contract, design and build, or other standard form of building contract',
      'Contains professional fee breakdown and VAT calculations',
      'May include cost comparison against benchmark data or previous cost plan iterations',
    ],
    disambiguation: [
      'A Contract Sum Analysis is a PROJECTED cost breakdown for construction, NOT an Invoice which is actual billing for work completed or services rendered.',
      'A Contract Sum Analysis shows the construction budget structure, NOT a Redemption Statement which shows the outstanding loan balance.',
      'A Contract Sum Analysis is a cost plan document, NOT a Building Contract (JCT) which is the legal agreement between employer and contractor.',
      'A Contract Sum Analysis breaks down build costs, NOT a Cashflow projection which forecasts the timing of income and expenditure over the project timeline.',
    ],
    terminology: {
      'QS': 'Quantity Surveyor - a construction cost professional who prepares and manages project budgets',
      'Preliminaries': 'Contractor\'s site-running costs: management, welfare, scaffolding, temporary works, insurance',
      'Contingency': 'An allowance (typically 5-10%) for unforeseen costs or design changes during construction',
      'Provisional Sum': 'An estimated allowance for work not yet fully specified at contract stage',
      'Prime Cost Item': 'An allowance for materials or goods to be selected by the employer during construction',
      'JCT': 'Joint Contracts Tribunal - publisher of the most widely used standard building contracts in the UK',
      'NRM': 'New Rules of Measurement - RICS standard for measuring and presenting construction costs',
      'BCIS': 'Building Cost Information Service - RICS cost benchmarking and indices database',
      'GDV': 'Gross Development Value - the projected market value of the completed development',
      'Overhead and Profit': 'The contractor\'s management fee and profit margin, typically expressed as a percentage',
    },
    tags: [
      { namespace: 'type', value: 'contract-sum-analysis', weight: 1.0 },
      { namespace: 'domain', value: 'construction', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.8 },
      { namespace: 'signal', value: 'cost-breakdown-table', weight: 0.9 },
      { namespace: 'signal', value: 'qs-branding', weight: 0.8 },
      { namespace: 'signal', value: 'financial-tables', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.8 },
      { namespace: 'trigger', value: 'construction+cost+budget', weight: 0.9 },
    ],
    keywords: [
      'contract sum analysis', 'CSA', 'cost plan', 'cost breakdown', 'quantity surveyor',
      'build cost', 'preliminaries', 'contingency', 'provisional sum', 'prime cost',
      'overhead and profit', 'JCT', 'contract sum', 'work packages', 'substructure',
      'superstructure', 'external works', 'mechanical services', 'electrical services',
      'BCIS', 'NRM', 'GDV', 'per unit cost', 'elemental cost',
    ],
    filenamePatterns: [
      'contract.?sum.?analysis',
      'csa\\b',
      'cost.?plan',
      'cost.?breakdown',
      'budget.?summary',
      'qs.?report',
      'build.?cost',
    ],
    excludePatterns: [
      'invoice',
      'payment.?certificate',
      'receipt',
      'valuation.?certificate',
      'interim.?payment',
    ],
    decisionRules: [
      {
        condition: 'Document contains itemised construction cost breakdown with building elements',
        signals: ['cost-breakdown-table', 'qs-branding', 'building-elements'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document includes preliminaries, contingency, and overhead/profit separately',
        signals: ['preliminaries', 'contingency-allowance', 'overhead-profit'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document presents projected construction costs for a development project',
        signals: ['construction-costs', 'budget-document'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'project.name', 'project.address', 'project.units',
      'costs.totalContractSum', 'costs.substructure', 'costs.superstructure',
      'costs.externalWalls', 'costs.mechanicalServices', 'costs.electricalServices',
      'costs.externalWorks', 'costs.preliminaries', 'costs.contingency',
      'costs.overheadAndProfit', 'costs.designFees', 'costs.vat',
      'costs.perUnit', 'costs.perSqFt',
      'qs.firm', 'qs.name', 'qs.date',
      'benchmarks.bcisComparison',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 8. COMPARABLES
  // ---------------------------------------------------------------------------
  {
    id: 'comparables',
    fileType: 'Comparables',
    category: 'Professional Reports',
    filing: {
      targetFolder: 'Professional Reports',
      targetLevel: 'project',
    },
    description:
      'Comparables (often referred to as "comps") are a compilation of market evidence used to support property ' +
      'valuations, rental assessments, and investment decisions in property finance. A Comparables document presents ' +
      'data on recent transactions (sales or lettings) of similar properties in the same or comparable locations, ' +
      'providing an evidential basis for market value or rental value opinions. For sales comparables, the data ' +
      'typically includes the property address, sale price (both asking and achieved where available), date of ' +
      'transaction, property type, size (square feet or square metres), number of bedrooms/units, price per square foot, ' +
      'condition at sale, tenure, and any relevant adjustments for differences in quality, location, or specification. ' +
      'For rental comparables, similar data is presented but focused on asking rents versus achieved rents, lease terms, ' +
      'incentive packages (rent-free periods, break clauses), and effective rent calculations. Sources of comparable ' +
      'evidence include Land Registry price paid data, Rightmove and Zoopla listings, CoStar commercial data, EPC ' +
      'registers, and direct agent feedback. In the context of RockCap\'s lending, Comparables are used to support or ' +
      'challenge the Gross Development Value (GDV) assumptions in a development appraisal. The lender\'s credit team and ' +
      'monitoring surveyor will review the comparable evidence to assess whether the developer\'s sales projections are ' +
      'realistic. Comparables are also used to support the existing use value of a property and to benchmark rental income ' +
      'assumptions for investment loans. The quality and proximity (both geographic and temporal) of comparable evidence is ' +
      'critical: recent, local, like-for-like transactions carry the greatest weight. Adjustments are made for differences ' +
      'in specification, condition, time elapsed, and market conditions. Comparables are distinct from a formal RedBook ' +
      'Valuation; they are the underlying market data rather than the professional valuation opinion itself.',
    identificationRules: [
      'PRIMARY: Document titled "Comparables", "Comparable Evidence", "Market Comparables", "Comps", or "Sales/Rental Evidence"',
      'PRIMARY: Contains a schedule or table of comparable property transactions with prices and dates',
      'CRITICAL: Lists multiple properties with sale prices or rental values as structured market evidence',
      'Includes property addresses, transaction dates, and price/rent figures for each comparable',
      'Contains price per square foot or price per square metre calculations',
      'Distinguishes between asking prices and achieved/transacted prices where available',
      'For rental comps: includes lease terms, rent-free periods, and effective rent calculations',
      'References data sources such as Land Registry, Rightmove, Zoopla, CoStar, or agent feedback',
      'May include a location map showing comparable properties relative to the subject property',
      'Contains commentary on adjustments for quality, specification, and market timing differences',
      'Often presented in tabular format with summary statistics (average, median, range)',
    ],
    disambiguation: [
      'Comparables are the underlying market EVIDENCE data, NOT a RedBook Valuation or Appraisal which is a formal professional opinion of value based on (among other things) comparable evidence.',
      'Comparables show actual transaction data and market prices, NOT a Cashflow which projects income and expenditure over time.',
      'Comparables present market evidence for similar properties, NOT a Contract Sum Analysis which breaks down construction costs.',
      'Comparables are property transaction data, NOT a Loan Statement which shows the financial position of a loan account.',
    ],
    terminology: {
      'Asking Price': 'The price at which a property is marketed, which may differ from the achieved price',
      'Achieved Price': 'The actual transacted sale price, often sourced from Land Registry records',
      'Price Per Square Foot': 'The standardised metric for comparing property values: total price divided by floor area',
      'GDV': 'Gross Development Value - the projected value of a completed development, supported by comparable evidence',
      'Rent-Free Period': 'A period at the start of a lease where the tenant pays no rent, used as a letting incentive',
      'Effective Rent': 'The true rental value after accounting for incentives such as rent-free periods',
      'Break Clause': 'A provision in a lease allowing either party to terminate before the contractual expiry date',
      'ERV': 'Estimated Rental Value - the projected market rent a property could achieve',
      'Yield': 'The annual rental income expressed as a percentage of the property value',
      'Land Registry': 'HM Land Registry - the official register of property ownership and transaction data in England and Wales',
    },
    tags: [
      { namespace: 'type', value: 'comparables', weight: 1.0 },
      { namespace: 'domain', value: 'property-finance', weight: 0.9 },
      { namespace: 'domain', value: 'valuation', weight: 0.8 },
      { namespace: 'signal', value: 'transaction-data', weight: 0.9 },
      { namespace: 'signal', value: 'price-per-sqft', weight: 0.8 },
      { namespace: 'signal', value: 'property-listings', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.8 },
      { namespace: 'trigger', value: 'market+evidence+comparable', weight: 0.9 },
    ],
    keywords: [
      'comparables', 'comps', 'comparable evidence', 'sales evidence', 'rental evidence',
      'asking price', 'achieved price', 'price per square foot', 'psf', 'transaction',
      'Land Registry', 'Rightmove', 'Zoopla', 'CoStar', 'market evidence',
      'GDV support', 'rental values', 'ERV', 'effective rent', 'rent-free',
      'yield', 'asking rent', 'achieved rent', 'sale price', 'letting',
    ],
    filenamePatterns: [
      'comparable',
      'comps\\b',
      'market.?evidence',
      'sales.?evidence',
      'rental.?evidence',
      'comp.?schedule',
      'transaction.?evidence',
    ],
    excludePatterns: [
      'valuation',
      'appraisal',
      'redbook',
      'cashflow',
      'cost.?plan',
      'invoice',
    ],
    decisionRules: [
      {
        condition: 'Document contains tabular market evidence with property addresses, dates, and prices',
        signals: ['transaction-data', 'price-per-sqft', 'property-listings'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document presents comparable sales or lettings with adjustment commentary',
        signals: ['comparable-analysis', 'market-evidence'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document contains property transaction or letting data for benchmarking',
        signals: ['property-transactions', 'benchmarking'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'subject.address', 'subject.type', 'subject.size',
      'comparables.count', 'comparables.averagePrice', 'comparables.averagePsf',
      'comparables.priceRange', 'comparables.dateRange',
      'sales.addresses', 'sales.prices', 'sales.dates', 'sales.sizes', 'sales.psfValues',
      'rentals.addresses', 'rentals.rents', 'rentals.leaseTerms', 'rentals.incentives',
      'sources.landRegistry', 'sources.portals', 'sources.agents',
      'summary.gdvSupport', 'summary.adjustments',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },
];
