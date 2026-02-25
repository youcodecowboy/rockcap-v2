import type { DocumentReference } from '../types';

// =============================================================================
// LEGAL DOCUMENTS — DOCUMENT REFERENCES
// =============================================================================
// Rich reference data for all Legal Documents category types.
// Used across classification, summarization, filing, extraction, and chat.

export const LEGAL_REFERENCES: DocumentReference[] = [
  // ---------------------------------------------------------------------------
  // 1. Facility Letter
  // ---------------------------------------------------------------------------
  {
    id: 'facility-letter',
    fileType: 'Facility Letter',
    category: 'Legal Documents',
    filing: { targetFolder: 'Legal', targetLevel: 'project' },

    description:
      'A facility letter (also called a facility agreement or loan agreement) is the binding legal contract between RockCap as lender and the borrower setting out the definitive terms under which credit is extended for a property development project. Unlike indicative terms or heads of terms which are non-binding proposals, the facility letter is a fully executed legal document that creates enforceable obligations on both parties. ' +
      'The facility letter specifies the total facility amount, the loan tranches (including land acquisition tranche and development/build tranche), interest rates (typically a margin over SONIA or Bank of England base rate), arrangement fees, exit fees, default interest provisions, and the loan term. It details the Conditions Precedent (CPs) that must be satisfied before each drawdown, such as receipt of satisfactory valuation, insurance evidence, legal title review, and building contract review. ' +
      'Key sections include representations and warranties by the borrower, covenants (both financial covenants like LTV and LTGDV ratios and information covenants requiring periodic reporting), Events of Default and their consequences, security requirements (typically first legal charge over the property, debenture, share charge, and personal guarantees), and the mechanics for drawdown requests, interest payments, and repayment. ' +
      'The facility letter is prepared by the lender\'s solicitors and will cross-reference the property security, corporate structure of the borrower (usually an SPV), and the approved development scheme. It is one of the most critical documents in any lending transaction and forms the backbone of the legal security package. All other legal documents (guarantees, charges, debentures) derive their context from the facility letter.',

    identificationRules: [
      'PRIMARY: Document is titled "Facility Agreement", "Facility Letter", or "Loan Agreement" and establishes lending terms between a lender and borrower',
      'PRIMARY: Contains defined terms for "Facility", "Borrower", "Lender", "Security" and sets out a total facility/commitment amount',
      'CRITICAL: Includes Conditions Precedent (CPs) section listing requirements before drawdown',
      'Contains Events of Default section with remedies and acceleration clauses',
      'Specifies interest rate structure (margin over SONIA/base rate), arrangement fees, and exit fees',
      'References security package including legal charge, debenture, guarantees',
      'Contains representations and warranties section from the borrower',
      'Includes financial covenants such as LTV ratio, LTGDV ratio, or interest cover',
      'Contains drawdown mechanics and utilisation request procedures',
      'References the Property or Development by specific address and title number',
      'Executed by both lender and borrower with witness signatures',
      'Prepared by solicitors acting for the lender, often with law firm letterhead or branding',
    ],

    disambiguation: [
      'This is a Facility Letter, NOT Indicative Terms — the facility letter is a binding legal agreement with full legal clauses and execution blocks, whereas indicative terms are a non-binding proposal or term sheet with headline commercial terms only.',
      'This is a Facility Letter, NOT a Drawdown Request — the facility letter establishes the overall loan facility, whereas a drawdown request is a subsequent notice to draw funds under an existing facility.',
      'This is a Facility Letter, NOT a Personal Guarantee — although the facility letter references guarantees as required security, the guarantee itself is a separate standalone document.',
      'This is a Facility Letter, NOT a Debenture — the facility letter may require a debenture as security but the debenture is its own instrument creating fixed and floating charges.',
    ],

    terminology: {
      'Facility': 'The total loan commitment made available by the lender to the borrower',
      'Conditions Precedent': 'Requirements that must be satisfied before the borrower can draw down funds (CPs)',
      'Events of Default': 'Specified events which, if they occur, allow the lender to accelerate the loan and enforce security',
      'SONIA': 'Sterling Overnight Index Average — the benchmark interest rate for sterling lending',
      'LTV': 'Loan to Value — ratio of loan amount to property value',
      'LTGDV': 'Loan to Gross Development Value — ratio of loan amount to projected completed value',
      'SPV': 'Special Purpose Vehicle — a company set up specifically to hold the property and borrow',
      'Drawdown': 'The act of the borrower requesting and receiving funds from the facility',
      'Utilisation': 'Alternative term for drawdown; a utilisation request is the formal notice to draw funds',
      'Security Package': 'The suite of legal documents giving the lender security over borrower assets',
    },

    tags: [
      { namespace: 'type', value: 'facility-letter', weight: 1.0 },
      { namespace: 'domain', value: 'legal', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.8 },
      { namespace: 'signal', value: 'legal-clauses', weight: 0.8 },
      { namespace: 'signal', value: 'loan-terms', weight: 0.7 },
      { namespace: 'signal', value: 'conditions-precedent', weight: 0.9 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.8 },
      { namespace: 'trigger', value: 'legal+loan-terms', weight: 0.9 },
    ],

    keywords: [
      'facility agreement', 'facility letter', 'loan agreement', 'borrower', 'lender',
      'conditions precedent', 'events of default', 'drawdown', 'utilisation',
      'security package', 'legal charge', 'LTV', 'LTGDV', 'SONIA', 'margin',
      'arrangement fee', 'exit fee', 'default interest', 'acceleration',
      'representations and warranties', 'covenants', 'SPV', 'facility amount',
      'repayment date', 'term',
    ],

    filenamePatterns: [
      'facility[\\s_-]*(letter|agreement)',
      'loan[\\s_-]*(agreement|facility)',
      'credit[\\s_-]*(agreement|facility)',
      'FA[\\s_-]',
    ],

    excludePatterns: [
      'indicative[\\s_-]*terms',
      'term[\\s_-]*sheet',
      'heads[\\s_-]*of[\\s_-]*terms',
      'proposal',
    ],

    decisionRules: [
      { condition: 'Document contains binding loan terms with CPs and Events of Default', signals: ['legal-clauses', 'conditions-precedent', 'loan-terms'], priority: 9, action: 'require' },
      { condition: 'Filename mentions facility or loan agreement', signals: ['filename-facility', 'filename-loan-agreement'], priority: 8, action: 'boost' },
      { condition: 'Context is legal document classification for property finance', signals: ['legal', 'property-finance'], priority: 6, action: 'include' },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'legalDocuments.facilityAmount',
      'legalDocuments.interestRate',
      'legalDocuments.loanTerm',
      'legalDocuments.borrowerName',
      'legalDocuments.lenderName',
      'legalDocuments.ltv',
      'legalDocuments.ltgdv',
      'legalDocuments.propertyAddress',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 2. Title Deed
  // ---------------------------------------------------------------------------
  {
    id: 'title-deed',
    fileType: 'Title Deed',
    category: 'Legal Documents',
    filing: { targetFolder: 'Legal', targetLevel: 'project' },

    description:
      'A title deed is the official Land Registry document that records ownership of a property or parcel of land in England and Wales. Issued by HM Land Registry, the title deed comprises the official copy of the register (also known as the official copy entries) and the title plan. These documents together form the definitive proof of the registered proprietor\'s ownership and any encumbrances on the title. ' +
      'The official copy of the register is divided into three parts: the Property Register (describing the land, its address, and whether it is freehold or leasehold), the Proprietorship Register (naming the current registered owner and any restrictions on their power to deal with the property), and the Charges Register (listing all mortgages, charges, restrictive covenants, easements, and other encumbrances affecting the title). Each entry has a date and is sequentially numbered. ' +
      'The title plan is an Ordnance Survey-based map with the property boundaries edged in red, showing the extent of the registered title. Title plans use standard Land Registry conventions for indicating different interests (red edging for the registered title, blue for areas subject to rights, green for excluded land). ' +
      'For RockCap as a development lender, the title deed is essential for confirming the borrower\'s ownership, checking for prior charges that must be discharged, identifying restrictive covenants that could affect development, and ensuring the title supports the proposed security (first legal charge). The lender\'s solicitors will conduct a full title review as part of the Conditions Precedent process. Title deeds carry a unique title number (e.g., NGL123456) which uniquely identifies the registered title at Land Registry.',

    identificationRules: [
      'PRIMARY: Document is an official copy from HM Land Registry bearing the Land Registry logo or header',
      'PRIMARY: Contains a title number in the format of letters followed by digits (e.g., NGL123456, TGL789012)',
      'CRITICAL: Divided into Property Register, Proprietorship Register, and Charges Register',
      'Contains "Official Copy of Register of Title" or "Official Copy (Register)" heading',
      'Shows edition date and states "This official copy shows the entries in the register of title"',
      'References tenure as freehold or leasehold',
      'Includes a title plan with red edging showing property boundaries on an OS map',
      'Lists registered proprietor(s) with date of registration',
      'Shows any charges or restrictions in the Charges Register section',
      'Contains the Land Registry disclaimer text about accuracy of boundaries',
      'May include entries for easements, covenants, or Section 106 agreements',
    ],

    disambiguation: [
      'This is a Title Deed, NOT a Lease — the title deed is the Land Registry record of ownership, whereas a lease is a contractual right to occupy for a term of years. A leasehold title will reference the underlying lease but they are separate documents.',
      'This is a Title Deed, NOT a Property Valuation — although both reference the same property address, the title deed records legal ownership while a valuation assesses market value.',
      'This is a Title Deed, NOT a Planning Permission — planning documents relate to development rights from the local authority, whereas title deeds record ownership and encumbrances at Land Registry.',
      'This is a Title Deed, NOT a Transfer Document (TR1) — a transfer is the instrument used to convey ownership, whereas the title deed is the registry record that results from a transfer.',
    ],

    terminology: {
      'HM Land Registry': 'Government body that registers ownership of land and property in England and Wales',
      'Title Number': 'Unique alphanumeric identifier assigned by Land Registry to each registered title',
      'Freehold': 'Absolute ownership of land and buildings with no time limit',
      'Leasehold': 'Right to occupy property for a fixed term under a lease',
      'Charges Register': 'Section of the register listing mortgages, charges, and other encumbrances',
      'Proprietorship Register': 'Section of the register naming the owner and any restrictions on dealing',
      'Property Register': 'Section of the register describing the land and its tenure',
      'Restrictive Covenant': 'A binding obligation on the land restricting its use',
      'Easement': 'A right over another person\'s land (e.g., right of way)',
      'Title Plan': 'Official Ordnance Survey-based map showing the extent of the registered title',
    },

    tags: [
      { namespace: 'type', value: 'title-deed', weight: 1.0 },
      { namespace: 'domain', value: 'legal', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.8 },
      { namespace: 'signal', value: 'land-registry', weight: 1.0 },
      { namespace: 'signal', value: 'title-number', weight: 0.9 },
      { namespace: 'signal', value: 'property-ownership', weight: 0.8 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.7 },
    ],

    keywords: [
      'title deed', 'official copy', 'land registry', 'HM Land Registry', 'title number',
      'freehold', 'leasehold', 'property register', 'proprietorship register',
      'charges register', 'title plan', 'registered proprietor', 'restrictive covenant',
      'easement', 'legal charge', 'encumbrance', 'Ordnance Survey', 'red edging',
      'edition date', 'register of title', 'boundary', 'tenure', 'Section 106',
    ],

    filenamePatterns: [
      'title[\\s_-]*(deed|register|document)',
      'official[\\s_-]*cop(y|ies)',
      'OC[12][\\s_-]',
      'land[\\s_-]*registry',
      '[A-Z]{2,4}\\d{5,7}',
    ],

    excludePatterns: [
      'valuation',
      'planning',
      'lease[\\s_-]*agreement',
      'TR1',
    ],

    decisionRules: [
      { condition: 'Document bears Land Registry branding and contains a title number', signals: ['land-registry', 'title-number'], priority: 9, action: 'require' },
      { condition: 'Contains Property/Proprietorship/Charges Register structure', signals: ['register-sections', 'property-ownership'], priority: 8, action: 'boost' },
      { condition: 'Legal context with property ownership signals', signals: ['legal', 'property-finance'], priority: 6, action: 'include' },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'legalDocuments.titleNumber',
      'legalDocuments.tenure',
      'legalDocuments.registeredProprietor',
      'legalDocuments.propertyAddress',
      'legalDocuments.existingCharges',
      'legalDocuments.restrictiveCovenants',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 3. Personal Guarantee
  // ---------------------------------------------------------------------------
  {
    id: 'personal-guarantee',
    fileType: 'Personal Guarantee',
    category: 'Legal Documents',
    filing: { targetFolder: 'Legal', targetLevel: 'client' },

    description:
      'A personal guarantee is a legally binding document in which an individual (the guarantor) personally guarantees repayment of a loan made by RockCap to a borrower company (typically a Special Purpose Vehicle or SPV). In property development finance, personal guarantees are a standard part of the security package because borrower companies are often newly incorporated SPVs with no assets beyond the development site itself. The personal guarantee provides the lender with recourse to the individual\'s personal assets if the borrower defaults. ' +
      'The guarantee typically covers the full facility amount plus accrued interest, fees, and enforcement costs. It may be limited to a specific monetary cap or be unlimited. Key provisions include the guarantor\'s covenant to pay on demand, a waiver of the guarantor\'s right to require the lender to pursue the borrower first (waiver of the right of subrogation until the lender is repaid in full), and representations from the guarantor regarding their personal financial position. ' +
      'Personal guarantees often include an indemnity clause which creates an independent primary obligation on the guarantor, surviving even if the underlying loan is found to be unenforceable. The guarantor may also provide a legal charge over personal property (such as their residence) as additional security, though this is a separate document. ' +
      'For RockCap, the personal guarantee is filed at the client level because the guarantor (typically the principal director or shareholder) may guarantee multiple project loans. The guarantee is usually supported by a personal financial statement or statement of assets and liabilities from the guarantor. It is critical to ensure the guarantor has received independent legal advice, which is typically certified by a solicitor\'s certificate attached to or endorsed on the guarantee.',

    identificationRules: [
      'PRIMARY: Document is titled "Personal Guarantee" or "Guarantee and Indemnity" and identifies an individual person as guarantor',
      'PRIMARY: Contains a covenant by an individual to guarantee repayment of a loan/facility to a named lender',
      'CRITICAL: The guarantor is identified as a natural person (individual) with personal details, not a company',
      'References the underlying facility agreement or loan to which the guarantee relates',
      'Contains demand clause — lender can demand payment from guarantor on borrower default',
      'Includes waiver of guarantor\'s rights of subrogation, set-off, or counterclaim',
      'Contains indemnity clause creating primary obligation independent of the guaranteed debt',
      'May reference independent legal advice certificate or solicitor\'s confirmation',
      'Executed by the individual guarantor with witness signature',
      'May specify a guarantee limit (capped amount) or state it is unlimited',
      'Contains representations about the guarantor\'s financial position and capacity to pay',
    ],

    disambiguation: [
      'This is a Personal Guarantee, NOT a Corporate Guarantee — the key distinction is that the guarantor is a named individual person, not a company. Look for personal details (address, date of birth) rather than company registration number.',
      'This is a Personal Guarantee, NOT a Facility Letter — although the guarantee references the underlying loan, it is a separate security document that creates obligations on a third party (the guarantor), not the borrower itself.',
      'This is a Personal Guarantee, NOT a Statement of Assets and Liabilities — a personal financial statement lists the guarantor\'s wealth, whereas the guarantee is the legal commitment to pay.',
      'This is a Personal Guarantee, NOT a Directors\' Certificate — a directors\' certificate is a corporate representation, whereas a personal guarantee creates personal financial liability.',
    ],

    terminology: {
      'Guarantor': 'The individual person who guarantees repayment of the borrower\'s debt',
      'Indemnity': 'An independent primary obligation to pay, surviving even if the underlying debt is unenforceable',
      'Subrogation': 'The right of a guarantor who has paid the debt to step into the lender\'s shoes against the borrower',
      'Demand': 'A formal written notice requiring the guarantor to pay under the guarantee',
      'Independent Legal Advice': 'Requirement for the guarantor to have received separate legal advice before signing',
      'Guarantee Limit': 'A cap on the maximum amount payable under the guarantee',
      'Principal Debtor Clause': 'Clause treating the guarantor as if they were the primary borrower',
      'Continuing Security': 'Clause confirming the guarantee remains in force until all debts are fully repaid',
    },

    tags: [
      { namespace: 'type', value: 'personal-guarantee', weight: 1.0 },
      { namespace: 'domain', value: 'legal', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.7 },
      { namespace: 'signal', value: 'guarantee', weight: 0.9 },
      { namespace: 'signal', value: 'personal-liability', weight: 0.8 },
      { namespace: 'signal', value: 'legal-clauses', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.7 },
      { namespace: 'trigger', value: 'guarantee+personal', weight: 0.9 },
    ],

    keywords: [
      'personal guarantee', 'guarantee and indemnity', 'guarantor', 'individual guarantee',
      'demand', 'subrogation', 'indemnity', 'independent legal advice', 'guarantee limit',
      'principal debtor', 'continuing security', 'personal liability', 'covenant to pay',
      'waiver', 'set-off', 'enforcement', 'default', 'borrower', 'lender',
      'solicitor\'s certificate', 'witness', 'capacity',
    ],

    filenamePatterns: [
      'personal[\\s_-]*guarantee',
      'PG[\\s_-]',
      'guarantee[\\s_-]*and[\\s_-]*indemnity',
      'individual[\\s_-]*guarantee',
    ],

    excludePatterns: [
      'corporate[\\s_-]*guarantee',
      'company[\\s_-]*guarantee',
      'parent[\\s_-]*company',
      'group[\\s_-]*guarantee',
    ],

    decisionRules: [
      { condition: 'Document is a guarantee executed by a named individual person', signals: ['guarantee', 'personal-liability'], priority: 9, action: 'require' },
      { condition: 'Filename contains personal guarantee', signals: ['filename-personal-guarantee'], priority: 8, action: 'boost' },
      { condition: 'Legal security document in property finance context', signals: ['legal', 'property-finance'], priority: 5, action: 'include' },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'legalDocuments.guarantorName',
      'legalDocuments.guarantorAddress',
      'legalDocuments.guaranteeLimit',
      'legalDocuments.facilityReference',
      'legalDocuments.borrowerName',
      'legalDocuments.lenderName',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 4. Corporate Guarantee
  // ---------------------------------------------------------------------------
  {
    id: 'corporate-guarantee',
    fileType: 'Corporate Guarantee',
    category: 'Legal Documents',
    filing: { targetFolder: 'Legal', targetLevel: 'project' },

    description:
      'A corporate guarantee is a legally binding document in which a company (the corporate guarantor) guarantees the obligations of another company (the borrower) under a loan facility. In RockCap\'s development finance context, the corporate guarantor is typically a parent company, holding company, or another entity within the borrower\'s corporate group that has a stronger balance sheet or asset base than the SPV borrower. ' +
      'The corporate guarantee serves a similar function to a personal guarantee but the obligor is a legal entity rather than an individual. The guarantor company covenants to pay all sums due under the facility agreement if the borrower fails to pay. Like personal guarantees, the corporate guarantee typically includes an indemnity provision creating a primary obligation, waiver of the guarantor\'s rights of subrogation until the lender is repaid, and continuing security provisions. ' +
      'Key considerations specific to corporate guarantees include confirming the guarantor company\'s authority to enter into the guarantee (evidenced by a board resolution or Companies House filings), checking that the guarantee does not exceed the company\'s borrowing powers under its articles of association, and ensuring the guarantee constitutes a valid corporate benefit to the guarantor (to avoid challenges on the basis that the guarantee was ultra vires or a transaction at undervalue). ' +
      'The corporate guarantee will reference the guarantor by its registered company name, company registration number, and registered office address. It is filed at the project level because it typically relates to a specific loan facility for a particular development scheme, unlike personal guarantees which may span multiple projects. RockCap\'s legal team will verify the corporate guarantor\'s financial capacity through review of its accounts filed at Companies House.',

    identificationRules: [
      'PRIMARY: Document is titled "Corporate Guarantee", "Company Guarantee", or "Parent Company Guarantee" with a company as guarantor',
      'PRIMARY: The guarantor is identified as a company with company registration number and registered office',
      'CRITICAL: Contains a covenant by a corporate entity (not an individual) to guarantee repayment of a loan facility',
      'References the underlying facility agreement to which the guarantee relates',
      'Contains demand clause allowing lender to call upon the corporate guarantor',
      'Includes indemnity provisions and waiver of subrogation rights',
      'May reference board resolution or corporate authority for entering into the guarantee',
      'References Companies House registration details of the guarantor company',
      'Contains representations about the guarantor company\'s capacity, authority, and solvency',
      'Executed under the company seal or by authorised directors/company secretary',
      'May specify a guarantee limit or be unlimited in amount',
    ],

    disambiguation: [
      'This is a Corporate Guarantee, NOT a Personal Guarantee — the guarantor is a company (identified by company registration number and registered office), not a named individual person.',
      'This is a Corporate Guarantee, NOT a Debenture — a guarantee is a promise to pay another party\'s debt, whereas a debenture creates security charges over the guarantor\'s own assets.',
      'This is a Corporate Guarantee, NOT Corporate Authorisations — board resolutions authorise actions; the corporate guarantee is the substantive legal commitment itself.',
      'This is a Corporate Guarantee, NOT a Facility Letter — the facility letter is the primary loan agreement with the borrower; the corporate guarantee is a secondary security document.',
    ],

    terminology: {
      'Corporate Guarantor': 'A company that guarantees the borrower\'s obligations under the loan',
      'Parent Company Guarantee': 'A guarantee given by the borrower\'s parent or holding company',
      'Ultra Vires': 'Beyond the company\'s legal powers — a guarantee may be challenged if ultra vires',
      'Corporate Benefit': 'The benefit the guarantor company derives from giving the guarantee, needed for validity',
      'Board Resolution': 'Formal decision by the company\'s board of directors authorising the guarantee',
      'Articles of Association': 'The company\'s constitutional document governing its powers and procedures',
      'Companies House': 'UK government register of companies where corporate details are publicly filed',
      'Registered Office': 'The official address of a company as registered at Companies House',
    },

    tags: [
      { namespace: 'type', value: 'corporate-guarantee', weight: 1.0 },
      { namespace: 'domain', value: 'legal', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.7 },
      { namespace: 'signal', value: 'guarantee', weight: 0.9 },
      { namespace: 'signal', value: 'corporate-entity', weight: 0.8 },
      { namespace: 'signal', value: 'legal-clauses', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.7 },
      { namespace: 'trigger', value: 'guarantee+corporate', weight: 0.9 },
    ],

    keywords: [
      'corporate guarantee', 'company guarantee', 'parent company guarantee', 'group guarantee',
      'corporate guarantor', 'company registration number', 'registered office',
      'board resolution', 'corporate authority', 'articles of association',
      'guarantee and indemnity', 'corporate benefit', 'ultra vires', 'continuing security',
      'demand', 'subrogation', 'Companies House', 'company seal', 'authorised signatories',
      'borrower', 'lender', 'solvency',
    ],

    filenamePatterns: [
      'corporate[\\s_-]*guarantee',
      'company[\\s_-]*guarantee',
      'parent[\\s_-]*company[\\s_-]*guarantee',
      'group[\\s_-]*guarantee',
      'CG[\\s_-]',
    ],

    excludePatterns: [
      'personal[\\s_-]*guarantee',
      'individual[\\s_-]*guarantee',
      'PG[\\s_-]',
    ],

    decisionRules: [
      { condition: 'Document is a guarantee executed by a company (corporate entity)', signals: ['guarantee', 'corporate-entity'], priority: 9, action: 'require' },
      { condition: 'Filename references corporate or company guarantee', signals: ['filename-corporate-guarantee'], priority: 8, action: 'boost' },
      { condition: 'Legal security document in lending context', signals: ['legal', 'property-finance'], priority: 5, action: 'include' },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'legalDocuments.guarantorCompanyName',
      'legalDocuments.guarantorCompanyNumber',
      'legalDocuments.guarantorRegisteredOffice',
      'legalDocuments.guaranteeLimit',
      'legalDocuments.facilityReference',
      'legalDocuments.borrowerName',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 5. Debenture
  // ---------------------------------------------------------------------------
  {
    id: 'debenture',
    fileType: 'Debenture',
    category: 'Legal Documents',
    filing: { targetFolder: 'Legal', targetLevel: 'project' },

    description:
      'A debenture is a security instrument that creates fixed and floating charges over all or substantially all of a company\'s assets in favour of the lender. In UK property development finance, the debenture is a fundamental component of the lender\'s security package, granting RockCap priority claims over the borrower company\'s entire undertaking — including its property, plant, equipment, receivables, bank accounts, intellectual property, goodwill, and uncalled capital. ' +
      'The debenture creates two types of charge: a fixed charge over specific, identifiable assets (such as the development property, specific bank accounts subject to account charge notices, and book debts assigned to the lender) and a floating charge over all other assets and the company\'s general undertaking. The floating charge "crystallises" into a fixed charge upon the occurrence of a crystallisation event, which typically includes appointment of a receiver, commencement of winding up, or service of a crystallisation notice by the lender. ' +
      'Key provisions include the company\'s negative pledge (covenant not to create other security over its assets), restrictions on disposal of charged assets without lender consent, the power for the lender to appoint an administrative receiver or administrator, and the right to appropriate financial collateral. The debenture also typically contains a legal mortgage over freehold and leasehold property, an assignment of insurance policies, and an assignment of contractual rights (including rights under building contracts and professional appointments). ' +
      'The debenture must be registered at Companies House within 21 days of creation under the Companies Act 2006, and if the company holds registered land, the charges must also be registered at HM Land Registry. Failure to register renders the charge void against a liquidator or other creditors. For RockCap, the debenture ensures comprehensive security coverage beyond just the first legal charge over the development site.',

    identificationRules: [
      'PRIMARY: Document is titled "Debenture" or "Debenture and Deed of Charge" creating fixed and floating charges over company assets',
      'PRIMARY: Creates both fixed charge and floating charge over the company\'s undertaking and assets',
      'CRITICAL: The chargor is a company (not an individual) granting security over all its assets to the lender',
      'Contains schedule of charged assets and/or description of the company\'s undertaking',
      'Includes negative pledge — covenant not to create further security without lender consent',
      'Contains provisions for crystallisation of the floating charge',
      'References power to appoint administrative receiver or administrator',
      'Includes assignment of insurance policies, contracts, and receivables',
      'Contains requirement to register at Companies House within 21 days',
      'References the underlying facility agreement as the secured obligation',
      'Executed as a deed with appropriate execution blocks and dating',
      'May contain a legal mortgage over specific freehold/leasehold property',
    ],

    disambiguation: [
      'This is a Debenture, NOT a Share Charge — a debenture creates charges over the company\'s own assets and undertaking, whereas a share charge is granted by a shareholder over their shares in the company.',
      'This is a Debenture, NOT a Legal Charge (standalone) — while a debenture may contain a legal mortgage over property, it is a comprehensive security document covering all company assets, not just a charge over a single property.',
      'This is a Debenture, NOT a Facility Letter — the debenture is a security instrument, whereas the facility letter is the underlying loan agreement it secures.',
      'This is a Debenture, NOT a Corporate Guarantee — a debenture grants real security over assets, whereas a guarantee is a personal/corporate promise to pay a debt.',
    ],

    terminology: {
      'Fixed Charge': 'A charge over specific identifiable assets, preventing disposal without lender consent',
      'Floating Charge': 'A charge over a class of assets that the company can deal with in ordinary course until crystallisation',
      'Crystallisation': 'The event that converts a floating charge into a fixed charge, fixing on specific assets',
      'Negative Pledge': 'A covenant by the company not to create further security interests over its assets',
      'Administrative Receiver': 'A person appointed by a debenture holder to manage company assets and repay secured debt',
      'Undertaking': 'The entirety of the company\'s business, assets, and property',
      'Companies Act 2006': 'The primary legislation governing UK company law, including registration of charges',
      'Assignment': 'Transfer of contractual rights (e.g., insurance, building contracts) to the lender as security',
    },

    tags: [
      { namespace: 'type', value: 'debenture', weight: 1.0 },
      { namespace: 'domain', value: 'legal', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.8 },
      { namespace: 'signal', value: 'fixed-floating-charge', weight: 1.0 },
      { namespace: 'signal', value: 'legal-clauses', weight: 0.8 },
      { namespace: 'signal', value: 'security-instrument', weight: 0.9 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.8 },
      { namespace: 'trigger', value: 'legal+security-charge', weight: 0.9 },
    ],

    keywords: [
      'debenture', 'deed of charge', 'fixed charge', 'floating charge', 'crystallisation',
      'negative pledge', 'undertaking', 'administrative receiver', 'administrator',
      'Companies House', 'Companies Act 2006', 'charged assets', 'security interest',
      'assignment', 'legal mortgage', 'book debts', 'receivables', 'insurance assignment',
      'winding up', 'liquidator', 'registration of charges', 'chargor', 'chargee',
      'financial collateral',
    ],

    filenamePatterns: [
      'debenture',
      'deed[\\s_-]*of[\\s_-]*charge',
      'fixed[\\s_-]*and[\\s_-]*floating[\\s_-]*charge',
    ],

    excludePatterns: [
      'share[\\s_-]*charge',
      'account[\\s_-]*charge',
      'personal[\\s_-]*guarantee',
    ],

    decisionRules: [
      { condition: 'Document creates fixed and floating charges over company assets', signals: ['fixed-floating-charge', 'security-instrument'], priority: 9, action: 'require' },
      { condition: 'Filename mentions debenture or deed of charge', signals: ['filename-debenture'], priority: 8, action: 'boost' },
      { condition: 'Legal security context in property finance', signals: ['legal', 'property-finance'], priority: 6, action: 'include' },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'legalDocuments.chargorCompanyName',
      'legalDocuments.chargorCompanyNumber',
      'legalDocuments.chargedAssets',
      'legalDocuments.facilityReference',
      'legalDocuments.lenderName',
      'legalDocuments.companiesHouseRegistrationDate',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 6. Share Charge
  // ---------------------------------------------------------------------------
  {
    id: 'share-charge',
    fileType: 'Share Charge',
    category: 'Legal Documents',
    filing: { targetFolder: 'Legal', targetLevel: 'project' },

    description:
      'A share charge (also known as a charge over shares or share pledge) is a security document in which a shareholder grants a charge over their shares in a company to the lender as security for a loan. In RockCap\'s development finance structure, the borrower is typically a Special Purpose Vehicle (SPV) established solely to hold the development site and undertake the project. The share charge is granted by the SPV\'s shareholders (often the developer\'s holding company or the individual developers) over their shares in the borrower SPV. ' +
      'The purpose of the share charge is to give the lender the ability to take control of the borrower company in an enforcement scenario without needing to take possession of or sell the underlying property directly. By enforcing the share charge, the lender can acquire the shares in the SPV and thereby gain indirect ownership of the development site and all the company\'s assets, contracts, and permissions. This can be a faster and more tax-efficient enforcement route than selling the property itself (avoiding Stamp Duty Land Tax and potential complications with planning permissions and building contracts that may not be assignable). ' +
      'The share charge typically requires the shareholder to deposit their share certificates with the lender (or the lender\'s solicitors) along with signed but undated stock transfer forms, allowing the lender to complete the transfer upon enforcement. Key provisions include restrictions on dealing with the shares (no sale, transfer, or encumbrance without lender consent), voting rights (usually the shareholder retains voting rights until default), and dividend rights. ' +
      'The share charge must be registered as a charge at Companies House. It is a critical piece of the security package that complements the legal charge over the property and the debenture over the company\'s assets.',

    identificationRules: [
      'PRIMARY: Document is titled "Share Charge", "Charge over Shares", or "Share Pledge" creating security over shares in a company',
      'PRIMARY: Identifies specific shares being charged (number and class of shares in a named company)',
      'CRITICAL: The chargor is a shareholder (individual or company) pledging their shares to the lender',
      'References delivery of share certificates and signed stock transfer forms to the lender',
      'Contains restrictions on dealing with the charged shares (no sale, transfer, or encumbrance)',
      'Includes provisions on voting rights, dividend rights, and new shares',
      'Contains enforcement provisions allowing the lender to sell or transfer the shares on default',
      'References the underlying facility agreement as the secured obligation',
      'Identifies the company whose shares are being charged by name and registration number',
      'Executed as a deed by the shareholder(s) granting the charge',
      'May include a power of attorney in favour of the lender for share transfers',
    ],

    disambiguation: [
      'This is a Share Charge, NOT a Debenture — a share charge is granted by a shareholder over their shares in a company, whereas a debenture is granted by the company itself over its own assets. The chargor is different.',
      'This is a Share Charge, NOT a Shareholders Agreement — a shareholders agreement governs the relationship between shareholders, whereas a share charge pledges the shares as security to a lender.',
      'This is a Share Charge, NOT a Stock Transfer Form — a stock transfer form (J30) is the instrument for transferring shares; a share charge creates security over them without immediate transfer.',
      'This is a Share Charge, NOT Corporate Authorisations — board resolutions may authorise the share charge but the charge itself is the substantive security document.',
    ],

    terminology: {
      'Chargor': 'The shareholder who grants the charge over their shares',
      'Charged Shares': 'The specific shares subject to the security charge',
      'Stock Transfer Form': 'A J30 form used to transfer share ownership, signed in blank and held by the lender',
      'Share Certificate': 'Certificate evidencing ownership of shares, deposited with the lender',
      'SPV': 'Special Purpose Vehicle — the borrower company whose shares are being charged',
      'Enforcement': 'The process by which the lender exercises its rights to sell or acquire the charged shares',
      'Power of Attorney': 'Authority granted to the lender to execute share transfers upon enforcement',
      'SDLT': 'Stamp Duty Land Tax — avoided when shares are transferred instead of property',
    },

    tags: [
      { namespace: 'type', value: 'share-charge', weight: 1.0 },
      { namespace: 'domain', value: 'legal', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.7 },
      { namespace: 'signal', value: 'security-instrument', weight: 0.9 },
      { namespace: 'signal', value: 'share-security', weight: 1.0 },
      { namespace: 'signal', value: 'legal-clauses', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.7 },
      { namespace: 'trigger', value: 'legal+share-security', weight: 0.9 },
    ],

    keywords: [
      'share charge', 'charge over shares', 'share pledge', 'charged shares',
      'stock transfer form', 'share certificate', 'shareholder', 'chargor',
      'SPV', 'special purpose vehicle', 'enforcement', 'power of attorney',
      'voting rights', 'dividend rights', 'new shares', 'security over shares',
      'Companies House', 'registration', 'J30', 'blank transfer',
      'share capital', 'ordinary shares',
    ],

    filenamePatterns: [
      'share[\\s_-]*charge',
      'charge[\\s_-]*over[\\s_-]*shares',
      'share[\\s_-]*pledge',
      'SC[\\s_-]',
    ],

    excludePatterns: [
      'debenture',
      'shareholders[\\s_-]*agreement',
      'share[\\s_-]*purchase',
      'share[\\s_-]*transfer',
    ],

    decisionRules: [
      { condition: 'Document creates a charge over shares in a company', signals: ['share-security', 'security-instrument'], priority: 9, action: 'require' },
      { condition: 'Filename references share charge or pledge', signals: ['filename-share-charge'], priority: 8, action: 'boost' },
      { condition: 'Legal security context', signals: ['legal', 'property-finance'], priority: 5, action: 'include' },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'legalDocuments.chargorName',
      'legalDocuments.targetCompanyName',
      'legalDocuments.targetCompanyNumber',
      'legalDocuments.numberOfShares',
      'legalDocuments.classOfShares',
      'legalDocuments.facilityReference',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 7. Shareholders Agreement
  // ---------------------------------------------------------------------------
  {
    id: 'shareholders-agreement',
    fileType: 'Shareholders Agreement',
    category: 'Legal Documents',
    filing: { targetFolder: 'Legal', targetLevel: 'client' },

    description:
      'A shareholders agreement is a private contract between the shareholders of a company that governs their relationship, rights, and obligations in respect of the company and their shareholdings. In property development finance, shareholders agreements are particularly important when the borrower SPV has multiple shareholders — for example, a joint venture between two developers, or a developer and an investor. RockCap reviews the shareholders agreement as part of its due diligence to understand the governance and control dynamics of the borrower company. ' +
      'The agreement typically covers share ownership percentages and capital contributions, appointment and removal of directors, reserved matters requiring unanimous or supermajority consent (such as changes to the business plan, additional borrowing, disposal of assets, or admission of new shareholders), dividend policy, transfer restrictions (pre-emption rights, tag-along and drag-along provisions), deadlock resolution mechanisms, and exit provisions including put and call options. ' +
      'For a development lender, key areas of concern include whether any shareholder has a veto over development decisions that could delay the project, whether the shareholders agreement restricts the company\'s ability to grant security to the lender, whether there are change of control provisions that could trigger a default under the facility agreement, and whether any shareholder can be compelled to inject further equity if the project requires additional funding. ' +
      'The shareholders agreement is filed at the client level because it relates to the corporate structure of the borrower group and may apply across multiple development projects undertaken by the same joint venture partners. Unlike the company\'s articles of association (which are a public document filed at Companies House), the shareholders agreement is a private document that is not publicly accessible. It supplements and may override certain provisions of the articles.',

    identificationRules: [
      'PRIMARY: Document is titled "Shareholders Agreement" or "Shareholders\' Agreement" between multiple named shareholders of a company',
      'PRIMARY: Governs the relationship between shareholders regarding their ownership and management of a company',
      'CRITICAL: Identifies multiple parties as shareholders with specified shareholding percentages or numbers of shares',
      'Contains reserved matters or consent provisions requiring shareholder approval for key decisions',
      'Includes provisions on appointment and removal of directors',
      'Contains share transfer restrictions, pre-emption rights, or tag-along/drag-along provisions',
      'Includes deadlock resolution procedures (step-up negotiations, mediation, buy-out)',
      'References the company\'s articles of association and their interaction with the agreement',
      'Contains provisions on capital contributions, funding obligations, and dividend policy',
      'Executed by all shareholders and may also be executed by the company itself',
      'May include schedules showing the business plan, shareholding structure, or initial budget',
    ],

    disambiguation: [
      'This is a Shareholders Agreement, NOT a Share Charge — a shareholders agreement governs the relationship between shareholders, whereas a share charge pledges shares as security to a lender.',
      'This is a Shareholders Agreement, NOT Articles of Association — articles are the company\'s public constitutional document filed at Companies House, whereas the shareholders agreement is a private contract between shareholders.',
      'This is a Shareholders Agreement, NOT a Joint Venture Agreement — although functionally similar, a JV agreement may establish the joint venture structure from scratch, whereas a shareholders agreement governs an existing company.',
      'This is a Shareholders Agreement, NOT Corporate Authorisations — board resolutions and shareholder resolutions are formal corporate acts, whereas the shareholders agreement is the contractual framework governing those decisions.',
    ],

    terminology: {
      'Pre-emption Rights': 'Right of existing shareholders to be offered shares before they can be sold to a third party',
      'Tag-along': 'Right of a minority shareholder to join a sale initiated by the majority on the same terms',
      'Drag-along': 'Right of a majority shareholder to force minority shareholders to join a sale',
      'Reserved Matters': 'Key decisions requiring specific shareholder consent (often unanimous)',
      'Deadlock': 'Situation where shareholders cannot agree on a decision requiring joint approval',
      'Put Option': 'Right of a shareholder to require another party to buy their shares',
      'Call Option': 'Right to require a shareholder to sell their shares',
      'Capital Contribution': 'Equity funding injected by a shareholder into the company',
    },

    tags: [
      { namespace: 'type', value: 'shareholders-agreement', weight: 1.0 },
      { namespace: 'domain', value: 'legal', weight: 0.9 },
      { namespace: 'domain', value: 'corporate', weight: 0.8 },
      { namespace: 'signal', value: 'corporate-governance', weight: 0.9 },
      { namespace: 'signal', value: 'legal-clauses', weight: 0.7 },
      { namespace: 'signal', value: 'shareholder-rights', weight: 0.9 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.7 },
      { namespace: 'trigger', value: 'legal+corporate-governance', weight: 0.8 },
    ],

    keywords: [
      'shareholders agreement', 'shareholder', 'shareholding', 'pre-emption rights',
      'tag-along', 'drag-along', 'reserved matters', 'deadlock', 'capital contribution',
      'dividend policy', 'put option', 'call option', 'articles of association',
      'joint venture', 'majority', 'minority', 'voting rights', 'board of directors',
      'transfer restrictions', 'exit provisions', 'good leaver', 'bad leaver',
      'business plan',
    ],

    filenamePatterns: [
      'shareholders?[\\s_-]*agreement',
      'SHA[\\s_-]',
      'JV[\\s_-]*agreement',
      'joint[\\s_-]*venture[\\s_-]*agreement',
    ],

    excludePatterns: [
      'share[\\s_-]*charge',
      'share[\\s_-]*purchase',
      'stock[\\s_-]*transfer',
      'articles[\\s_-]*of[\\s_-]*association',
    ],

    decisionRules: [
      { condition: 'Document governs shareholder rights and company governance between multiple shareholders', signals: ['corporate-governance', 'shareholder-rights'], priority: 9, action: 'require' },
      { condition: 'Filename references shareholders agreement or JV agreement', signals: ['filename-shareholders-agreement'], priority: 8, action: 'boost' },
      { condition: 'Legal corporate governance context', signals: ['legal', 'corporate'], priority: 5, action: 'include' },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'legalDocuments.shareholders',
      'legalDocuments.companyName',
      'legalDocuments.shareholdingPercentages',
      'legalDocuments.reservedMatters',
      'legalDocuments.transferRestrictions',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 8. Corporate Authorisations
  // ---------------------------------------------------------------------------
  {
    id: 'corporate-authorisations',
    fileType: 'Corporate Authorisations',
    category: 'Legal Documents',
    filing: { targetFolder: 'Legal', targetLevel: 'project' },

    description:
      'Corporate authorisations are the formal corporate governance documents that evidence a company\'s authority to enter into a transaction. In RockCap\'s development lending, these documents are a standard Condition Precedent (CP) that must be delivered before the loan can be drawn down. The lender needs assurance that the borrower company (and any guarantor company) has the legal power and internal authority to borrow, grant security, and perform its obligations under the loan documents. ' +
      'The most common form of corporate authorisation is a board resolution (also called board minutes) recording the directors\' decision to approve the loan transaction, authorise the execution of the facility agreement, debenture, share charge, and all other security documents, and appoint specific individuals to sign on behalf of the company. The board resolution will typically include a certificate confirming the company\'s solvency and that the transaction is for the company\'s corporate benefit. ' +
      'Other documents that fall under corporate authorisations include: shareholder resolutions or written resolutions (required where the transaction exceeds the directors\' delegated authority or involves related party transactions), certificates of incumbency (confirming the current directors and secretary), company constitutional documents (memorandum and articles of association, certificate of incorporation), and Companies House filings confirming the company\'s active status and current officers. ' +
      'Corporate authorisations are essential to ensure the loan documents are validly executed and enforceable. If a company enters into a transaction without proper authority, the documents could be challenged as ultra vires or voidable. RockCap\'s solicitors will carefully review these documents to confirm the chain of authority from the company\'s constitution through to the individuals who sign the loan documents. They are filed at the project level as they relate to the specific transaction being authorised.',

    identificationRules: [
      'PRIMARY: Document is a board resolution, board minutes, or directors\' resolution authorising a company to enter into a transaction',
      'PRIMARY: Contains formal corporate language resolving or authorising specific actions by named directors',
      'CRITICAL: References approval of specific legal documents (facility agreement, debenture, guarantee, charges)',
      'Identifies the company by name and registration number and names the current directors',
      'Contains recitals explaining the transaction being authorised',
      'Includes authority for named individuals to execute documents on behalf of the company',
      'May include solvency certificate or confirmation of corporate benefit',
      'References the company\'s articles of association or powers under the Companies Act',
      'May be accompanied by certificate of incorporation or Companies House filings',
      'Signed by the chairman or company secretary certifying the resolution as a true copy',
      'May include written shareholder resolution for matters requiring member approval',
    ],

    disambiguation: [
      'This is Corporate Authorisations, NOT a Facility Letter — corporate authorisations grant the company authority to enter into the facility; the facility letter is the substantive loan agreement itself.',
      'This is Corporate Authorisations, NOT a Corporate Guarantee — a guarantee is a substantive legal commitment by a company to pay; corporate authorisations are the governance documents approving that commitment.',
      'This is Corporate Authorisations, NOT a Shareholders Agreement — the shareholders agreement is a commercial contract between shareholders; corporate authorisations are formal resolutions of the board or shareholders.',
      'This is Corporate Authorisations, NOT a Certificate of Title — a certificate of title is a solicitor\'s opinion on property ownership; corporate authorisations relate to company governance.',
    ],

    terminology: {
      'Board Resolution': 'A formal decision made by the board of directors at a meeting or by written resolution',
      'Written Resolution': 'A resolution passed by directors or shareholders without a formal meeting',
      'Certificate of Incumbency': 'Document confirming the current directors and officers of a company',
      'Certificate of Incorporation': 'Companies House document confirming the company\'s creation and registration',
      'Ultra Vires': 'Beyond the company\'s legal powers — transactions without proper authority may be challenged',
      'Corporate Benefit': 'Requirement that a transaction provides identifiable benefit to the company entering it',
      'Quorum': 'The minimum number of directors required to transact business at a board meeting',
      'Company Secretary': 'Officer responsible for the company\'s compliance with statutory obligations',
    },

    tags: [
      { namespace: 'type', value: 'corporate-authorisations', weight: 1.0 },
      { namespace: 'domain', value: 'legal', weight: 0.8 },
      { namespace: 'domain', value: 'corporate', weight: 0.9 },
      { namespace: 'signal', value: 'corporate-governance', weight: 1.0 },
      { namespace: 'signal', value: 'board-resolution', weight: 0.9 },
      { namespace: 'signal', value: 'conditions-precedent', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.6 },
      { namespace: 'trigger', value: 'corporate+authorisation', weight: 0.9 },
    ],

    keywords: [
      'board resolution', 'board minutes', 'directors resolution', 'written resolution',
      'corporate authorisation', 'certificate of incumbency', 'certificate of incorporation',
      'company secretary', 'articles of association', 'memorandum', 'quorum',
      'authorised signatory', 'corporate benefit', 'solvency certificate',
      'Companies House', 'Companies Act', 'ultra vires', 'resolved that',
      'it was resolved', 'authority to execute', 'company seal',
    ],

    filenamePatterns: [
      'corporate[\\s_-]*auth',
      'board[\\s_-]*(resolution|minutes)',
      'directors?[\\s_-]*(resolution|minutes)',
      'certificate[\\s_-]*of[\\s_-]*incumbency',
      'written[\\s_-]*resolution',
    ],

    excludePatterns: [
      'corporate[\\s_-]*guarantee',
      'shareholders[\\s_-]*agreement',
      'facility[\\s_-]*letter',
    ],

    decisionRules: [
      { condition: 'Document is a board resolution or corporate resolution authorising a transaction', signals: ['board-resolution', 'corporate-governance'], priority: 9, action: 'require' },
      { condition: 'Filename references board resolution or corporate authorisation', signals: ['filename-corporate-auth'], priority: 8, action: 'boost' },
      { condition: 'Corporate governance context in lending transaction', signals: ['corporate', 'conditions-precedent'], priority: 5, action: 'include' },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'legalDocuments.companyName',
      'legalDocuments.companyNumber',
      'legalDocuments.directors',
      'legalDocuments.authorisedSignatories',
      'legalDocuments.resolutionDate',
      'legalDocuments.transactionAuthorised',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 9. Building Contract
  // ---------------------------------------------------------------------------
  {
    id: 'building-contract',
    fileType: 'Building Contract',
    category: 'Legal Documents',
    filing: { targetFolder: 'Legal', targetLevel: 'project' },

    description:
      'A building contract is the legal agreement between the employer (typically the borrower SPV or developer) and the building contractor for the construction or refurbishment of a development project. In UK property development, the most widely used standard form contracts are published by the Joint Contracts Tribunal (JCT), with the JCT Design and Build Contract (DB) and JCT Standard Building Contract (SBC) being the most common for RockCap-funded developments. For smaller projects, the JCT Minor Works or Intermediate Building Contract may be used. ' +
      'The building contract sets out the contractor\'s obligations to carry out and complete the works in accordance with the contract documents (drawings, specifications, bills of quantities, or employer\'s requirements), the contract sum or pricing mechanism, the programme and completion date, provisions for extensions of time, liquidated and ascertained damages for late completion, retention provisions (typically 5% reducing to 2.5% at practical completion), defects liability period (usually 12 months), and payment mechanisms including interim valuations, certificates, and final accounts. ' +
      'For RockCap as development lender, the building contract is a critical document because it governs the delivery of the development that underpins the loan security. Key areas of lender concern include: the fixed price or guaranteed maximum price protecting against cost overruns, the contractor\'s obligation to maintain insurance (contractor\'s all risks, public liability), provisions allowing the lender to step in and complete the works if the borrower defaults (step-in rights via a collateral warranty or direct agreement), and the payment schedule aligning with the lender\'s drawdown mechanics. ' +
      'The lender\'s solicitors will review the building contract to ensure it is on acceptable terms, that the contractor has provided a performance bond or parent company guarantee where required, and that collateral warranties have been procured in favour of the lender.',

    identificationRules: [
      'PRIMARY: Document is a JCT building contract or other standard form construction contract between an employer and contractor',
      'PRIMARY: Contains articles of agreement, conditions of contract, and schedules specific to construction works',
      'CRITICAL: Identifies a building contractor and an employer (developer/borrower) with a defined contract sum for construction works',
      'References JCT (Joint Contracts Tribunal) standard form or other recognised construction contract forms (NEC, FIDIC)',
      'Contains provisions for practical completion, extensions of time, and liquidated damages',
      'Includes retention provisions (typically 5% / 2.5%) and defects liability period',
      'Contains interim payment and valuation provisions with payment certificates',
      'Specifies the works by reference to drawings, specifications, or employer\'s requirements',
      'Includes insurance obligations on the contractor (CAR, public liability, employer\'s liability)',
      'Contains provisions for variations, loss and expense, and determination (termination)',
      'May include contract particulars or appendix with key dates, amounts, and named parties',
      'References the site or development by specific address',
    ],

    disambiguation: [
      'This is a Building Contract, NOT a Professional Appointment — a building contract is for physical construction works by a contractor, whereas a professional appointment is for professional consultancy services (architect, engineer, QS).',
      'This is a Building Contract, NOT a Collateral Warranty — the building contract is the primary agreement with the contractor, whereas a collateral warranty is a secondary document giving the lender direct rights against the contractor.',
      'This is a Building Contract, NOT a Development Appraisal — a development appraisal is a financial model projecting costs and values, whereas the building contract is the legal commitment to carry out the works.',
      'This is a Building Contract, NOT an Insurance Policy — although the building contract requires insurance, the insurance policy itself is a separate document issued by an insurer.',
    ],

    terminology: {
      'JCT': 'Joint Contracts Tribunal — the body that publishes standard form building contracts in the UK',
      'Practical Completion': 'The point at which the works are substantially complete and the employer can take possession',
      'Liquidated Damages': 'Pre-agreed damages payable by the contractor for late completion (often called LADs)',
      'Retention': 'A percentage of each payment withheld by the employer as security for defects (typically 5%/2.5%)',
      'Defects Liability Period': 'Period after practical completion (usually 12 months) during which the contractor must remedy defects',
      'Extension of Time': 'Additional time granted to the contractor for completing the works due to specified events',
      'Contractor\'s All Risks': 'Insurance covering physical damage to the works during construction',
      'Performance Bond': 'A bond (typically 10% of contract sum) guaranteeing the contractor\'s performance',
      'Step-in Rights': 'Rights allowing the lender to step in and continue the contract if the employer defaults',
    },

    tags: [
      { namespace: 'type', value: 'building-contract', weight: 1.0 },
      { namespace: 'domain', value: 'legal', weight: 0.8 },
      { namespace: 'domain', value: 'construction', weight: 0.9 },
      { namespace: 'signal', value: 'construction-contract', weight: 1.0 },
      { namespace: 'signal', value: 'JCT', weight: 0.9 },
      { namespace: 'signal', value: 'legal-clauses', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.8 },
      { namespace: 'trigger', value: 'legal+construction', weight: 0.9 },
    ],

    keywords: [
      'building contract', 'JCT', 'construction contract', 'contractor', 'employer',
      'contract sum', 'practical completion', 'liquidated damages', 'retention',
      'defects liability', 'extension of time', 'interim payment', 'valuation',
      'contractor\'s all risks', 'performance bond', 'works', 'specifications',
      'bills of quantities', 'employer\'s requirements', 'design and build',
      'standard building contract', 'minor works', 'step-in rights', 'determination',
    ],

    filenamePatterns: [
      'building[\\s_-]*contract',
      'construction[\\s_-]*contract',
      'JCT',
      'design[\\s_-]*and[\\s_-]*build',
      'DB[\\s_-]*contract',
    ],

    excludePatterns: [
      'professional[\\s_-]*appointment',
      'consultant[\\s_-]*agreement',
      'collateral[\\s_-]*warranty',
      'insurance[\\s_-]*policy',
    ],

    decisionRules: [
      { condition: 'Document is a construction contract between employer and contractor for building works', signals: ['construction-contract', 'JCT'], priority: 9, action: 'require' },
      { condition: 'Filename references building or construction contract', signals: ['filename-building-contract'], priority: 8, action: 'boost' },
      { condition: 'Legal context with construction signals', signals: ['legal', 'construction'], priority: 6, action: 'include' },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist', 'meeting'],

    expectedFields: [
      'legalDocuments.contractorName',
      'legalDocuments.employerName',
      'legalDocuments.contractSum',
      'legalDocuments.contractForm',
      'legalDocuments.completionDate',
      'legalDocuments.defectsLiabilityPeriod',
      'legalDocuments.retentionPercentage',
      'legalDocuments.liquidatedDamagesRate',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 10. Professional Appointment
  // ---------------------------------------------------------------------------
  {
    id: 'professional-appointment',
    fileType: 'Professional Appointment',
    category: 'Legal Documents',
    filing: { targetFolder: 'Legal', targetLevel: 'project' },

    description:
      'A professional appointment is the formal engagement letter or consultancy agreement appointing a professional consultant to provide services on a development project. In UK property development, the key professional team members typically include the architect (who designs the scheme), the quantity surveyor or QS (who manages costs and prepares cost plans), the structural engineer, the mechanical and electrical (M&E) engineer, the project manager, the planning consultant, and the employer\'s agent (who administers the building contract on behalf of the developer). ' +
      'Professional appointments are usually based on industry standard forms. The RIBA Standard Professional Services Contract is common for architects, the RICS Short Form of Consultant\'s Appointment for surveyors, and the ACE Agreement for engineers. Bespoke appointments are also widely used. The appointment will specify the scope of services (often by reference to RIBA work stages or a detailed schedule of services), the fee basis (fixed fee, percentage of construction cost, or time charge), the programme for delivery of services, and the consultant\'s obligations regarding professional indemnity insurance. ' +
      'For RockCap as development lender, professional appointments are important because the quality of the professional team directly affects the success of the development. The lender will require collateral warranties from key consultants (architect, QS, structural engineer) giving the lender direct contractual rights against the consultant if their work is defective. The professional appointment must include a duty of care that can be extended to the lender through the collateral warranty. ' +
      'Key provisions include the consultant\'s liability (often capped at a multiple of their fees or their PI insurance level), intellectual property and copyright provisions (ensuring the developer has a licence to use the consultant\'s designs), termination provisions, and net contribution clauses limiting the consultant\'s liability to their proportionate share of any loss.',

    identificationRules: [
      'PRIMARY: Document appoints a named professional consultant (architect, engineer, QS, project manager) to provide services on a development project',
      'PRIMARY: Contains defined scope of services, fee arrangements, and professional liability provisions',
      'CRITICAL: The appointed party is a professional consultancy firm or individual providing design, engineering, or advisory services (not construction works)',
      'References standard appointment forms (RIBA, RICS, ACE) or is a bespoke consultancy agreement',
      'Contains professional indemnity insurance requirements (minimum cover level and maintenance period)',
      'Includes duty of care provisions and liability cap or net contribution clause',
      'Specifies fee basis (fixed, percentage, or time charge) and payment terms',
      'References RIBA work stages or other recognised framework for service delivery',
      'Contains intellectual property and copyright licence provisions',
      'Includes termination provisions for both parties',
      'May reference the requirement to provide a collateral warranty to the lender/funder',
    ],

    disambiguation: [
      'This is a Professional Appointment, NOT a Building Contract — a professional appointment is for consultancy and design services, whereas a building contract is for physical construction works. The consultant designs; the contractor builds.',
      'This is a Professional Appointment, NOT a Collateral Warranty — the professional appointment is the primary engagement agreement with the consultant, whereas a collateral warranty is a secondary document extending duties to a third party such as the lender.',
      'This is a Professional Appointment, NOT a Professional Report — a professional appointment engages the consultant; a professional report (e.g., valuation, survey) is the output of their work.',
      'This is a Professional Appointment, NOT an Insurance Certificate — although the appointment requires PI insurance, the insurance certificate is a separate document issued by the insurer.',
    ],

    terminology: {
      'RIBA': 'Royal Institute of British Architects — publishes standard appointment forms and work stages',
      'RICS': 'Royal Institution of Chartered Surveyors — professional body for surveyors',
      'ACE': 'Association for Consultancy and Engineering — publishes standard forms for engineers',
      'Professional Indemnity Insurance': 'Insurance covering professionals against claims for negligent advice or design (PI)',
      'Duty of Care': 'The legal obligation to exercise reasonable skill and care in performing services',
      'Net Contribution Clause': 'A clause limiting the consultant\'s liability to their fair share of any loss',
      'Employer\'s Agent': 'Consultant who administers a design and build contract on behalf of the developer',
      'QS': 'Quantity Surveyor — consultant who manages construction costs and valuations',
      'Copyright Licence': 'Permission to use the consultant\'s designs for the specific project',
    },

    tags: [
      { namespace: 'type', value: 'professional-appointment', weight: 1.0 },
      { namespace: 'domain', value: 'legal', weight: 0.7 },
      { namespace: 'domain', value: 'construction', weight: 0.8 },
      { namespace: 'signal', value: 'consultancy-agreement', weight: 0.9 },
      { namespace: 'signal', value: 'professional-services', weight: 0.9 },
      { namespace: 'signal', value: 'legal-clauses', weight: 0.6 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.7 },
      { namespace: 'trigger', value: 'legal+professional-services', weight: 0.8 },
    ],

    keywords: [
      'professional appointment', 'consultancy agreement', 'consultant', 'architect',
      'quantity surveyor', 'QS', 'structural engineer', 'M&E engineer', 'project manager',
      'employer\'s agent', 'RIBA', 'RICS', 'ACE', 'scope of services', 'fee basis',
      'professional indemnity', 'PI insurance', 'duty of care', 'net contribution',
      'copyright licence', 'work stages', 'design services', 'liability cap',
      'termination', 'collateral warranty',
    ],

    filenamePatterns: [
      'professional[\\s_-]*appointment',
      'consultant[\\s_-]*(agreement|appointment)',
      'architect[\\s_-]*(agreement|appointment)',
      'QS[\\s_-]*(agreement|appointment)',
      'engineer[\\s_-]*(agreement|appointment)',
      'RIBA[\\s_-]*appointment',
    ],

    excludePatterns: [
      'building[\\s_-]*contract',
      'construction[\\s_-]*contract',
      'collateral[\\s_-]*warranty',
      'valuation[\\s_-]*report',
    ],

    decisionRules: [
      { condition: 'Document appoints a professional consultant for design or advisory services', signals: ['consultancy-agreement', 'professional-services'], priority: 9, action: 'require' },
      { condition: 'Filename references professional appointment or consultant agreement', signals: ['filename-professional-appointment'], priority: 8, action: 'boost' },
      { condition: 'Legal context with professional services signals', signals: ['legal', 'construction'], priority: 5, action: 'include' },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist', 'meeting'],

    expectedFields: [
      'legalDocuments.consultantName',
      'legalDocuments.consultantRole',
      'legalDocuments.scopeOfServices',
      'legalDocuments.feeAmount',
      'legalDocuments.feeBasis',
      'legalDocuments.piInsuranceLevel',
      'legalDocuments.liabilityCap',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 11. Collateral Warranty
  // ---------------------------------------------------------------------------
  {
    id: 'collateral-warranty',
    fileType: 'Collateral Warranty',
    category: 'Legal Documents',
    filing: { targetFolder: 'Legal', targetLevel: 'project' },

    description:
      'A collateral warranty is a contract under which a building contractor, sub-contractor, or professional consultant (the warrantor) gives a direct contractual duty of care to a third party (the beneficiary) who is not a party to the underlying building contract or professional appointment. In development finance, the key beneficiary is RockCap as the funding institution, and the warrantors are the main contractor, the architect, the structural engineer, the quantity surveyor, and any other key consultants or sub-contractors on the project. ' +
      'The purpose of a collateral warranty is to bridge the privity of contract gap. Without a collateral warranty, the lender has no direct contractual relationship with the contractor or consultants — only the borrower/developer does through the building contract and professional appointments. If the contractor or consultant is negligent, the lender would have no direct claim against them. The collateral warranty creates that direct contractual link, allowing the lender to pursue the warrantor for losses arising from defective work or negligent design. ' +
      'Standard forms include the JCT Contractor Collateral Warranty (CWa/F for funder, CWa/P&T for purchaser and tenant), the RIBA Form of Collateral Warranty, and the British Property Federation (BPF) Collateral Warranty. Key provisions include the warrantor\'s duty of care, professional indemnity insurance maintenance obligations, restrictions on the use of deleterious materials (such as asbestos, high-alumina cement, or calcium silicate bricks), assignment rights (allowing the beneficiary to assign the warranty, typically up to two times), step-in rights (allowing the lender to step into the underlying contract if the developer defaults), and provisions regarding intellectual property and copyright. ' +
      'For RockCap, collateral warranties are a standard CP for drawdown. The lender will require warranties from all key members of the professional team and the main contractor. Without these warranties, the lender\'s security package is considered incomplete, as the lender would have no remedy against parties whose negligence could diminish the value of the development.',

    identificationRules: [
      'PRIMARY: Document is titled "Collateral Warranty" and creates a direct duty of care from a contractor or consultant to a third-party beneficiary (funder/lender)',
      'PRIMARY: Identifies three key parties: the warrantor (contractor/consultant), the employer/developer, and the beneficiary (lender/funder)',
      'CRITICAL: Contains a duty of care clause whereby the warrantor warrants to the beneficiary that they have performed their obligations with reasonable skill and care',
      'References the underlying building contract or professional appointment to which the warranty relates',
      'Contains deleterious materials clause prohibiting use of specified harmful materials',
      'Includes step-in rights allowing the beneficiary to step into the underlying contract',
      'Contains professional indemnity insurance maintenance obligations',
      'Includes assignment provisions (typically allowing assignment up to two times)',
      'References standard warranty forms (JCT CWa/F, RIBA, BPF)',
      'Contains intellectual property and copyright provisions granting the beneficiary a licence',
      'Executed as a deed by the warrantor, and often by the employer/developer as well',
    ],

    disambiguation: [
      'This is a Collateral Warranty, NOT an Insurance Policy — a collateral warranty is a contractual duty of care from a contractor or consultant; an insurance policy is coverage provided by an insurer in exchange for premiums.',
      'This is a Collateral Warranty, NOT a Building Contract — the building contract is the primary agreement between employer and contractor; the collateral warranty extends duties to a third-party beneficiary.',
      'This is a Collateral Warranty, NOT a Professional Appointment — the professional appointment engages the consultant; the collateral warranty gives the lender rights against that consultant.',
      'This is a Collateral Warranty, NOT a Performance Bond — a performance bond is a financial guarantee from a surety; a collateral warranty creates direct contractual duties from the warrantor.',
    ],

    terminology: {
      'Warrantor': 'The contractor or consultant giving the warranty (creating the duty of care)',
      'Beneficiary': 'The third party receiving the warranty — typically the lender or funder',
      'Duty of Care': 'The contractual obligation to perform services or works with reasonable skill and care',
      'Deleterious Materials': 'Harmful building materials prohibited from use (asbestos, high-alumina cement, etc.)',
      'Step-in Rights': 'Rights allowing the beneficiary to step into the underlying contract and direct the works',
      'CWa/F': 'JCT standard form Collateral Warranty for a Funder',
      'BPF': 'British Property Federation — publishes standard form collateral warranties',
      'Assignment': 'The right to transfer the benefit of the warranty to a successor (e.g., purchaser)',
      'Privity of Contract': 'Legal principle that only parties to a contract can enforce it — warranties overcome this',
    },

    tags: [
      { namespace: 'type', value: 'collateral-warranty', weight: 1.0 },
      { namespace: 'domain', value: 'legal', weight: 0.8 },
      { namespace: 'domain', value: 'construction', weight: 0.8 },
      { namespace: 'signal', value: 'warranty-document', weight: 1.0 },
      { namespace: 'signal', value: 'duty-of-care', weight: 0.9 },
      { namespace: 'signal', value: 'legal-clauses', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.7 },
      { namespace: 'trigger', value: 'legal+warranty', weight: 0.9 },
    ],

    keywords: [
      'collateral warranty', 'warrantor', 'beneficiary', 'funder', 'duty of care',
      'deleterious materials', 'step-in rights', 'CWa/F', 'CWa/P&T', 'BPF',
      'RIBA warranty', 'JCT warranty', 'privity of contract', 'assignment',
      'professional indemnity', 'copyright licence', 'reasonable skill and care',
      'contractor warranty', 'consultant warranty', 'third party rights',
      'asbestos', 'high-alumina cement', 'calcium silicate',
    ],

    filenamePatterns: [
      'collateral[\\s_-]*warranty',
      'CW[\\s_-]',
      'CWa',
      'warranty[\\s_-]*for[\\s_-]*funder',
      'funder[\\s_-]*warranty',
    ],

    excludePatterns: [
      'insurance[\\s_-]*policy',
      'NHBC[\\s_-]*warranty',
      'product[\\s_-]*warranty',
      'manufacturer[\\s_-]*warranty',
      'building[\\s_-]*warranty',
    ],

    decisionRules: [
      { condition: 'Document creates a duty of care from a contractor/consultant to a third-party beneficiary', signals: ['warranty-document', 'duty-of-care'], priority: 9, action: 'require' },
      { condition: 'Filename references collateral warranty or CWa', signals: ['filename-collateral-warranty'], priority: 8, action: 'boost' },
      { condition: 'Legal context with warranty and construction signals', signals: ['legal', 'construction'], priority: 6, action: 'include' },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'legalDocuments.warrantorName',
      'legalDocuments.warrantorRole',
      'legalDocuments.beneficiaryName',
      'legalDocuments.underlyingContract',
      'legalDocuments.piInsuranceLevel',
      'legalDocuments.assignmentRights',
      'legalDocuments.stepInRights',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 12. Lease
  // ---------------------------------------------------------------------------
  {
    id: 'lease',
    fileType: 'Lease',
    category: 'Legal Documents',
    filing: { targetFolder: 'Legal', targetLevel: 'project' },

    description:
      'A lease is a legal document that grants the tenant (lessee) the right to occupy and use a property for a specified period in exchange for rent, while the landlord (lessor) retains the freehold or superior leasehold interest. In RockCap\'s development finance context, leases are relevant in several scenarios: the development site may be held on a long lease (ground lease) rather than freehold, completed units may be let to tenants generating rental income, or the development may involve the grant of new leases to purchasers (as is standard with flats and apartments which are almost always sold on long leasehold terms in England and Wales). ' +
      'A lease contains several key components: the demise (the grant of the property rights), the term (length of the lease), the rent and rent review provisions, the tenant\'s and landlord\'s covenants (obligations), permitted use provisions, alienation provisions (whether the tenant can assign, sublet, or charge the lease), repair and insurance obligations, service charge provisions (in multi-let buildings), break clauses (options to terminate early), and forfeiture provisions (the landlord\'s right to terminate the lease for breach). ' +
      'For development lending, the lease is critical in several ways. If the borrower holds the site on a ground lease, the unexpired term must be long enough to provide adequate security (lenders typically require at least 75-125 years unexpired). The lease must not contain onerous restrictions that would prevent the proposed development or the grant of security. If the development involves creating new leases, the form of lease must be acceptable and saleable. The lender will also review whether landlord\'s consent is required for the proposed development works and whether such consent has been obtained or is obtainable. ' +
      'Leases for terms exceeding seven years must be registered at HM Land Registry with their own title number. The lease will be registered against both the freehold title and will have its own leasehold title entry.',

    identificationRules: [
      'PRIMARY: Document is titled "Lease", "Underlease", "Sublease", or "Agreement for Lease" and grants a right to occupy property for a term of years',
      'PRIMARY: Contains a demise clause granting exclusive possession of a defined property to a tenant for a specified term',
      'CRITICAL: Identifies a landlord (lessor) and a tenant (lessee) with a defined lease term and rent',
      'Contains rent provisions specifying the initial rent and rent review mechanism',
      'Includes tenant\'s covenants (to pay rent, repair, insure, not to alter, restrict use)',
      'Contains landlord\'s covenants (quiet enjoyment, insurance of the building)',
      'Includes alienation provisions governing assignment, subletting, and charging',
      'Contains forfeiture clause allowing the landlord to terminate for breach',
      'Specifies the permitted use of the property (often by reference to Use Classes Order)',
      'May include a plan showing the demised premises edged or coloured',
      'Contains provisions for service charge in multi-let buildings',
      'Executed as a deed by landlord and tenant',
    ],

    disambiguation: [
      'This is a Lease, NOT a Title Deed — a lease is a contractual document granting the right to occupy for a term of years, whereas a title deed is the Land Registry record of ownership. A leasehold title at Land Registry references the underlying lease.',
      'This is a Lease, NOT a Licence to Occupy — a lease grants exclusive possession for a term and creates an estate in land, whereas a licence is a personal permission to use land that does not create property rights.',
      'This is a Lease, NOT a Tenancy Agreement (Assured Shorthold) — while technically a lease, an AST is a short-term residential tenancy governed by the Housing Act; this reference covers longer commercial or ground leases relevant to development finance.',
      'This is a Lease, NOT a Facility Letter — a lease concerns property occupation rights, whereas a facility letter is a loan agreement. However, a lease may be assigned as security under the facility.',
    ],

    terminology: {
      'Demise': 'The grant of property rights from landlord to tenant in a lease',
      'Term': 'The length of the lease (e.g., 125 years, 999 years for ground leases)',
      'Rent Review': 'Mechanism for adjusting rent during the lease term (open market, RPI, fixed increases)',
      'Alienation': 'The tenant\'s ability to assign, sublet, or charge the lease',
      'Forfeiture': 'The landlord\'s right to terminate the lease for tenant breach (e.g., non-payment of rent)',
      'Service Charge': 'Charges payable by tenants towards the cost of maintaining common areas and the building',
      'Ground Lease': 'A long lease of land, typically at a low rent, on which the tenant builds',
      'Break Clause': 'Option for one or both parties to terminate the lease before the contractual expiry date',
      'Quiet Enjoyment': 'Landlord\'s covenant not to interfere with the tenant\'s lawful use and occupation',
      'Section 25/26 Notice': 'Statutory notices under the Landlord and Tenant Act 1954 relating to lease renewal',
    },

    tags: [
      { namespace: 'type', value: 'lease', weight: 1.0 },
      { namespace: 'domain', value: 'legal', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.8 },
      { namespace: 'signal', value: 'lease-document', weight: 1.0 },
      { namespace: 'signal', value: 'property-occupation', weight: 0.8 },
      { namespace: 'signal', value: 'legal-clauses', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.8 },
      { namespace: 'trigger', value: 'legal+lease', weight: 0.9 },
    ],

    keywords: [
      'lease', 'underlease', 'sublease', 'agreement for lease', 'landlord', 'tenant',
      'lessee', 'lessor', 'demise', 'term', 'rent', 'rent review', 'alienation',
      'forfeiture', 'service charge', 'ground lease', 'break clause', 'quiet enjoyment',
      'permitted use', 'repair covenant', 'insurance covenant', 'assignment',
      'subletting', 'leasehold', 'long lease', 'commercial lease',
    ],

    filenamePatterns: [
      'lease(?!hold)',
      'underlease',
      'sublease',
      'agreement[\\s_-]*for[\\s_-]*lease',
      'ground[\\s_-]*lease',
      'tenancy[\\s_-]*agreement',
    ],

    excludePatterns: [
      'title[\\s_-]*deed',
      'land[\\s_-]*registry',
      'official[\\s_-]*copy',
      'licence[\\s_-]*to[\\s_-]*occupy',
      'AST',
      'assured[\\s_-]*shorthold',
    ],

    decisionRules: [
      { condition: 'Document grants a right to occupy property for a defined term with rent provisions', signals: ['lease-document', 'property-occupation'], priority: 9, action: 'require' },
      { condition: 'Filename references lease, underlease, or agreement for lease', signals: ['filename-lease'], priority: 8, action: 'boost' },
      { condition: 'Legal context with property occupation signals', signals: ['legal', 'property-finance'], priority: 6, action: 'include' },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'legalDocuments.landlordName',
      'legalDocuments.tenantName',
      'legalDocuments.propertyAddress',
      'legalDocuments.leaseTerm',
      'legalDocuments.commencementDate',
      'legalDocuments.annualRent',
      'legalDocuments.rentReviewPattern',
      'legalDocuments.permittedUse',
      'legalDocuments.breakClause',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },
];
