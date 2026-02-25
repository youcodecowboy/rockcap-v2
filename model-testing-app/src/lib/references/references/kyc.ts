// =============================================================================
// KYC (Know Your Customer) — DOCUMENT REFERENCES
// =============================================================================
// 9 document types covering identity verification, proof of address, financial
// standing, and corporate entity checks for UK property finance lending.
// All KYC documents file at CLIENT level in the "KYC" folder.

import type { DocumentReference } from '../types';

export const KYC_REFERENCES: DocumentReference[] = [
  // ---------------------------------------------------------------------------
  // 1. Passport
  // ---------------------------------------------------------------------------
  {
    id: 'passport',
    fileType: 'Passport',
    category: 'KYC',
    filing: { targetFolder: 'KYC', targetLevel: 'client' },
    description:
      'A government-issued passport serves as the primary photographic identity document in ' +
      'UK property finance KYC checks. Under the Money Laundering, Terrorist Financing and ' +
      'Transfer of Funds (Information on the Payer) Regulations 2017, lenders must verify ' +
      'the identity of every borrower, guarantor, and beneficial owner before entering into ' +
      'a regulated transaction. The passport is the strongest form of photo ID because it is ' +
      'issued by a sovereign authority, contains a machine-readable zone (MRZ), and includes ' +
      'biometric security features such as holograms, watermarks, and an embedded RFID chip ' +
      'in modern e-passports. When processing passport copies for KYC, the document should ' +
      'display the bearer\'s full legal name, date of birth, nationality, passport number, ' +
      'date of issue, and expiry date. A certified true copy or colour scan of the photo page ' +
      'is typically required. Lenders will cross-reference the name on the passport against ' +
      'the borrower\'s application form, the property title, and any corporate filings at ' +
      'Companies House if the borrower operates through an SPV. For PEP (Politically Exposed ' +
      'Person) screening and sanctions checks, the passport number is the key data point fed ' +
      'into automated AML screening platforms such as Onfido, Jumio, or ComplyAdvantage. ' +
      'Passports from all nationalities are accepted, though non-UK passports may trigger ' +
      'enhanced due diligence requirements. The document must be current (not expired) at the ' +
      'time of verification unless the firm\'s AML policy permits recently expired documents ' +
      'within a defined window. In the RockCap workflow, passports are filed at the client ' +
      'level because identity attaches to the individual, not to any specific loan or project.',
    identificationRules: [
      'PRIMARY: Contains a full-page photograph of the bearer alongside personal details (name, DOB, nationality)',
      'CRITICAL: Includes a machine-readable zone (MRZ) — two lines of chevron-delimited alphanumeric codes at the bottom of the photo page',
      'Displays the word "PASSPORT" or equivalent in the issuing country\'s language prominently on the cover or photo page',
      'Contains a passport number, date of issue, date of expiry, and issuing authority',
      'Bears holographic security features, watermarks, or UV-reactive elements visible even in scanned copies',
      'Shows the bearer\'s signature on the photo page',
      'Issued by a national government (e.g., "United Kingdom of Great Britain and Northern Ireland", "Republic of Ireland")',
      'Includes the International Civil Aviation Organization (ICAO) standard layout',
      'May include a biometric chip symbol (gold circle on the front cover) for e-passports',
      'Photo page is a single page with a standardised format — NOT a multi-page identity card or letter',
    ],
    disambiguation: [
      'This is a Passport, NOT a Driving Licence because it contains an MRZ zone, is issued by a sovereign government, and uses ICAO standard layout rather than DVLA card format.',
      'This is a Passport, NOT a generic ID Document because it specifically carries the title "PASSPORT", includes the MRZ, and is recognised internationally for travel.',
      'This is a Passport, NOT a visa — a visa is a separate document or stamp granting entry permission, whereas the passport is the identity booklet itself.',
    ],
    terminology: {
      MRZ: 'Machine Readable Zone — the two lines of codes at the bottom of the photo page used for automated scanning',
      'e-Passport': 'An electronic passport containing a biometric RFID chip storing the holder\'s facial image and fingerprints',
      PEP: 'Politically Exposed Person — individuals holding prominent public positions who require enhanced due diligence',
      AML: 'Anti-Money Laundering — regulations requiring identity verification to prevent financial crime',
      'Certified Copy': 'A photocopy signed and dated by a qualified professional (solicitor, accountant) confirming it is a true likeness of the original',
      ICAO: 'International Civil Aviation Organization — sets the global standard for passport format and security features',
    },
    tags: [
      { namespace: 'domain', value: 'kyc', weight: 1.0 },
      { namespace: 'signal', value: 'identity-photo', weight: 1.5 },
      { namespace: 'type', value: 'passport', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'identity-verification', weight: 1.2 },
    ],
    keywords: [
      'passport', 'MRZ', 'machine readable zone', 'photo ID', 'identity document',
      'date of birth', 'nationality', 'passport number', 'issuing authority',
      'expiry date', 'biometric', 'e-passport', 'ICAO', 'travel document',
      'photo page', 'hologram', 'certified copy', 'PEP screening', 'AML',
      'identity verification', 'KYC', 'bearer', 'immigration',
    ],
    filenamePatterns: [
      'passport',
      'pport',
      'bio[_\\-\\s]?data',
      'photo[_\\-\\s]?id',
      'id[_\\-\\s]?photo',
    ],
    excludePatterns: [
      'driving',
      'licence',
      'license',
      'utility',
      'bank[_\\-\\s]?statement',
    ],
    decisionRules: [
      {
        condition: 'Document contains an MRZ zone and full-page photo with government insignia',
        signals: ['mrz-detected', 'photo-page', 'government-insignia'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Filename contains "passport" or "photo ID"',
        signals: ['filename-passport'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document is part of a KYC or AML submission pack',
        signals: ['kyc-pack', 'aml-submission'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'filing', 'chat', 'checklist'],
    expectedFields: [
      'kyc.fullName',
      'kyc.dateOfBirth',
      'kyc.nationality',
      'kyc.passportNumber',
      'kyc.issueDate',
      'kyc.expiryDate',
      'kyc.issuingAuthority',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 2. Driving License
  // ---------------------------------------------------------------------------
  {
    id: 'driving-licence',
    fileType: 'Driving License',
    category: 'KYC',
    filing: { targetFolder: 'KYC', targetLevel: 'client' },
    description:
      'A UK driving licence issued by the Driver and Vehicle Licensing Agency (DVLA) is one ' +
      'of the most commonly submitted photographic identity documents in property finance KYC ' +
      'processes. The modern UK photocard driving licence is a credit-card-sized plastic card ' +
      'featuring the holder\'s photograph, full name, date of birth, address, licence number, ' +
      'issue and expiry dates, and vehicle entitlement categories. The licence number itself ' +
      'encodes the holder\'s surname and date of birth in a deterministic format, making it a ' +
      'strong cross-reference tool for identity verification. Unlike a passport, the UK driving ' +
      'licence also serves as proof of the holder\'s current residential address — a dual function ' +
      'that makes it particularly valuable in KYC checks. For AML compliance, the photocard is ' +
      'the accepted document; the old-style paper counterpart licence is generally no longer ' +
      'accepted on its own by most lenders. Lenders will compare the name and address on the ' +
      'licence against the loan application, property deeds, and Companies House filings for ' +
      'SPV directors. Where a borrower holds a non-UK driving licence, additional proof of ' +
      'address is typically required. In RockCap\'s workflow, a colour scan or certified copy ' +
      'of both sides of the photocard is requested. The reverse side shows the holder\'s vehicle ' +
      'categories and any endorsements. The driving licence is filed at the client level since ' +
      'it pertains to the individual borrower\'s identity rather than any specific project ' +
      'or loan facility.',
    identificationRules: [
      'PRIMARY: Credit-card-sized photocard displaying a photograph, DVLA logo, and UK flag/union symbol',
      'CRITICAL: Contains a DVLA-format licence number (e.g., JONES 710238 AB1CD) encoding surname and date of birth',
      'Shows the holder\'s current residential address printed on the front of the card',
      'Displays vehicle entitlement categories (A, B, C, D, etc.) on the reverse side',
      'Bears the wording "DRIVING LICENCE" or "DRIVING LICENSE" prominently',
      'Includes issue date (4a), expiry date (4b), and date of birth fields in a standardised EU/UK layout',
      'Contains a barcode or QR code on the reverse for electronic verification',
      'Shows the issuing authority as DVLA (Swansea) or DVA (Northern Ireland)',
      'Features holographic overlay and UV-reactive security features',
      'Paper counterpart licence (pre-1998) is a pink/green folded document with no photograph',
    ],
    disambiguation: [
      'This is a Driving Licence, NOT a Passport because it is a plastic photocard issued by DVLA, carries a DVLA licence number, and includes the holder\'s address — passports do not show address.',
      'This is a Driving Licence, NOT a generic ID Document because it specifically carries DVLA branding, vehicle categories, and the standardised UK/EU driving licence layout.',
      'This is a Driving Licence, NOT a Proof of Address document on its own — although it contains an address, its primary classification is as photographic identity.',
    ],
    terminology: {
      DVLA: 'Driver and Vehicle Licensing Agency — the UK government body that issues driving licences from its headquarters in Swansea',
      DVA: 'Driver & Vehicle Agency — the Northern Ireland equivalent of DVLA',
      'Photocard Licence': 'The modern credit-card format UK driving licence introduced in 1998, replacing the old paper counterpart',
      'Counterpart Licence': 'The older paper driving licence (pink/green) that preceded the photocard; no longer issued',
      'Licence Number': 'A unique alphanumeric code encoding the holder\'s surname and date of birth in a deterministic DVLA format',
      'Vehicle Categories': 'Letter codes (A, B, C, D, etc.) indicating which vehicle types the holder is entitled to drive',
    },
    tags: [
      { namespace: 'domain', value: 'kyc', weight: 1.0 },
      { namespace: 'signal', value: 'identity-photo', weight: 1.5 },
      { namespace: 'type', value: 'driving-licence', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'identity-verification', weight: 1.2 },
    ],
    keywords: [
      'driving licence', 'driving license', 'DVLA', 'photocard', 'photo card',
      'licence number', 'license number', 'vehicle categories', 'photo ID',
      'identity', 'date of birth', 'address', 'counterpart', 'DVA',
      'swansea', 'endorsements', 'provisional', 'full licence', 'UK licence',
      'KYC', 'AML', 'identity verification',
    ],
    filenamePatterns: [
      'driv(?:ing)?[_\\-\\s]?li[cs]en[cs]e',
      'dvla',
      'dl[_\\-\\s]?(?:front|back|copy)',
      'licence[_\\-\\s]?(?:front|back)',
    ],
    excludePatterns: [
      'passport',
      'utility',
      'bank[_\\-\\s]?statement',
      'incorporation',
    ],
    decisionRules: [
      {
        condition: 'Document shows a DVLA photocard with photograph and licence number',
        signals: ['dvla-branding', 'photocard-format', 'licence-number'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Filename contains "driving licence" or "DVLA"',
        signals: ['filename-driving-licence', 'filename-dvla'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document submitted as part of identity verification pack',
        signals: ['kyc-pack', 'identity-verification'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'filing', 'chat', 'checklist'],
    expectedFields: [
      'kyc.fullName',
      'kyc.dateOfBirth',
      'kyc.address',
      'kyc.licenceNumber',
      'kyc.issueDate',
      'kyc.expiryDate',
      'kyc.vehicleCategories',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 3. ID Document
  // ---------------------------------------------------------------------------
  {
    id: 'id-document',
    fileType: 'ID Document',
    category: 'KYC',
    filing: { targetFolder: 'KYC', targetLevel: 'client' },
    description:
      'An ID Document is a catch-all classification for identity verification documents that ' +
      'do not fall squarely into the Passport or Driving Licence categories. In UK property ' +
      'finance KYC workflows, this commonly includes national identity cards from EU/EEA ' +
      'member states, biometric residence permits (BRPs) issued by the UK Home Office, armed ' +
      'forces identity cards, and age verification cards bearing the PASS (Proof of Age ' +
      'Standards Scheme) hologram. Under the Money Laundering Regulations 2017, lenders may ' +
      'accept alternative photographic identity where a passport or driving licence is ' +
      'unavailable, provided the document meets the firm\'s internal AML policy standards ' +
      'for reliability and security features. National identity cards from EU countries such ' +
      'as France, Germany, Italy, and Spain typically contain a photograph, full name, date ' +
      'of birth, nationality, card number, and expiry date in a standardised format. Biometric ' +
      'residence permits include the holder\'s immigration status, right to work, and ' +
      'biometric data. These alternative identity documents still require PEP and sanctions ' +
      'screening, and the holder\'s details must be cross-referenced against the loan ' +
      'application and any Companies House filings. Enhanced due diligence may be triggered ' +
      'when accepting non-standard identity documents, particularly for non-UK nationals or ' +
      'where the document lacks internationally recognised security features. In RockCap\'s ' +
      'system, any identity document that is not specifically a passport or UK driving licence ' +
      'should be classified under this type. It is filed at the client level as it relates ' +
      'to the individual\'s identity rather than a specific property or project.',
    identificationRules: [
      'PRIMARY: A photographic identity document that is NOT a passport and NOT a UK driving licence',
      'CRITICAL: Contains a photograph of the holder alongside personal details (name, DOB) on a card or single-page document',
      'May be a national identity card from an EU/EEA country with standardised layout',
      'May be a UK Biometric Residence Permit (BRP) issued by the Home Office',
      'May bear a PASS hologram (Proof of Age Standards Scheme) for age verification cards',
      'Contains a unique document/card number, issue date, and expiry date',
      'Shows the issuing authority (government body, Home Office, etc.)',
      'Includes security features such as holograms, chip icons, or UV-reactive elements',
      'Does not contain an MRZ zone in the passport format (though BRPs may have a shortened MRZ)',
      'Does not show DVLA branding or vehicle categories',
    ],
    disambiguation: [
      'This is an ID Document, NOT a Passport because it lacks the ICAO passport format, the full two-line MRZ, and the "PASSPORT" title — it is an alternative form of photographic identity.',
      'This is an ID Document, NOT a Driving Licence because it does not carry DVLA branding, a DVLA licence number, or vehicle entitlement categories.',
      'This is an ID Document, NOT a Proof of Address — while some ID documents show an address, they are classified primarily as identity verification, not address proof.',
    ],
    terminology: {
      BRP: 'Biometric Residence Permit — a card issued by the UK Home Office to non-EEA nationals confirming their immigration status and right to remain',
      PASS: 'Proof of Age Standards Scheme — a UK accreditation scheme for age verification cards bearing a holographic PASS logo',
      'National Identity Card': 'A government-issued card used as primary identification in many EU/EEA countries (not issued in the UK)',
      EDD: 'Enhanced Due Diligence — additional AML checks triggered when standard ID documents are unavailable or risk indicators are present',
      'Home Office': 'The UK government department responsible for immigration, security, and law enforcement',
    },
    tags: [
      { namespace: 'domain', value: 'kyc', weight: 1.0 },
      { namespace: 'signal', value: 'identity-photo', weight: 1.3 },
      { namespace: 'type', value: 'id-document', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'identity-verification', weight: 1.0 },
    ],
    keywords: [
      'ID document', 'identity card', 'national ID', 'biometric residence permit',
      'BRP', 'photo ID', 'PASS card', 'age verification', 'identity verification',
      'Home Office', 'EU identity card', 'EEA', 'armed forces ID', 'military ID',
      'KYC', 'AML', 'photo identification', 'residency card', 'immigration status',
    ],
    filenamePatterns: [
      'id[_\\-\\s]?(?:doc|card|document)',
      'national[_\\-\\s]?id',
      'identity[_\\-\\s]?(?:card|doc)',
      'brp',
      'residence[_\\-\\s]?permit',
    ],
    excludePatterns: [
      'passport',
      'driv(?:ing)?[_\\-\\s]?li[cs]en[cs]e',
      'dvla',
      'utility',
      'bank[_\\-\\s]?statement',
    ],
    decisionRules: [
      {
        condition: 'Document is a photographic ID card that is not a passport or driving licence',
        signals: ['photo-id', 'identity-card', 'not-passport', 'not-driving-licence'],
        priority: 8,
        action: 'require',
      },
      {
        condition: 'Document is a Biometric Residence Permit or EU national ID card',
        signals: ['brp', 'eu-national-id', 'home-office-branding'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document submitted as fallback identity when passport is unavailable',
        signals: ['kyc-pack', 'alternative-id'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'filing', 'chat', 'checklist'],
    expectedFields: [
      'kyc.fullName',
      'kyc.dateOfBirth',
      'kyc.nationality',
      'kyc.documentNumber',
      'kyc.issueDate',
      'kyc.expiryDate',
      'kyc.issuingAuthority',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 4. Proof of Address
  // ---------------------------------------------------------------------------
  {
    id: 'proof-of-address',
    fileType: 'Proof of Address',
    category: 'KYC',
    filing: { targetFolder: 'KYC', targetLevel: 'client' },
    description:
      'A Proof of Address document is a generic classification for any document that verifies ' +
      'an individual\'s current residential address as part of UK property finance KYC ' +
      'procedures. Under the Money Laundering Regulations 2017, lenders must verify both ' +
      'identity and address for every borrower, guarantor, and UBO (Ultimate Beneficial ' +
      'Owner). While specific document types like utility bills and bank statements have ' +
      'their own dedicated categories, this generic Proof of Address classification covers ' +
      'documents that serve the same purpose but do not fit neatly into those sub-types. ' +
      'Common examples include council tax bills, HMRC correspondence such as tax coding ' +
      'notices (P2) or self-assessment statements (SA302), local authority correspondence, ' +
      'electoral roll confirmation letters, mortgage statements, and tenancy agreements. The ' +
      'critical requirement is that the document clearly shows the individual\'s full name and ' +
      'current residential address, is dated within the last three months (or twelve months ' +
      'for annual documents like council tax bills), and originates from a reputable institutional ' +
      'source. Lenders cross-reference the address shown against the borrower\'s application ' +
      'form and any other KYC documents on file. Where the borrower\'s address has recently ' +
      'changed, both old and new proof of address may be required. For corporate borrowers ' +
      'operating through SPVs, proof of address is still required for the individual directors ' +
      'and persons of significant control (PSCs). This document type is filed at the client ' +
      'level because address verification is tied to the individual, not to the loan project. ' +
      'Scans, PDFs, and digital copies are acceptable provided they are legible and clearly ' +
      'show the required details.',
    identificationRules: [
      'PRIMARY: A document from a recognised institutional source showing the holder\'s full name and current residential address',
      'CRITICAL: Dated within the last three months (or twelve months for annual documents such as council tax bills)',
      'Issued by a government body, local authority, utility provider, financial institution, or HMRC',
      'Contains a residential address (not a PO Box or business address, unless the business address is the registered home address)',
      'Shows the document date or statement period clearly',
      'May be a council tax bill, HMRC tax notice (P2, SA302), electoral roll confirmation, or tenancy agreement',
      'Is NOT a utility bill (classified separately) or bank statement (classified separately)',
      'Bears the issuing organisation\'s letterhead, logo, or reference number',
      'Addressed to the individual borrower by their full legal name',
      'May include an account number, tax reference, or council tax reference',
    ],
    disambiguation: [
      'This is a Proof of Address, NOT a Utility Bill — utility bills (gas, electric, water, council tax) have their own dedicated classification; this category covers other address-proving documents like HMRC letters, electoral roll confirmations, or tenancy agreements.',
      'This is a Proof of Address, NOT a Bank Statement — bank statements have their own classification; use this type for address-proving documents that are not bank or building society statements.',
      'This is a Proof of Address, NOT an identity document — proof of address verifies WHERE someone lives, not WHO they are.',
    ],
    terminology: {
      UBO: 'Ultimate Beneficial Owner — the individual who ultimately owns or controls 25% or more of a company',
      PSC: 'Person of Significant Control — a Companies House designation for individuals with significant influence over a company',
      'Council Tax Bill': 'An annual local authority bill for property-based taxation, commonly accepted as proof of address for up to 12 months',
      SA302: 'HMRC Self-Assessment Tax Calculation — a summary of income and tax for a given tax year',
      P2: 'HMRC Tax Coding Notice — a letter from HMRC confirming the tax code applied to an individual\'s income',
      'Electoral Roll': 'The register of voters maintained by local authorities, used to confirm an individual\'s registered address',
    },
    tags: [
      { namespace: 'domain', value: 'kyc', weight: 1.0 },
      { namespace: 'signal', value: 'proof-of-address', weight: 1.5 },
      { namespace: 'type', value: 'proof-of-address', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'address-verification', weight: 1.2 },
    ],
    keywords: [
      'proof of address', 'address verification', 'council tax', 'HMRC',
      'tax notice', 'P2', 'SA302', 'electoral roll', 'tenancy agreement',
      'local authority', 'residential address', 'KYC', 'AML',
      'current address', 'address confirmation', 'dated within three months',
      'mortgage statement', 'council tax bill', 'tax coding notice',
    ],
    filenamePatterns: [
      'proof[_\\-\\s]?(?:of[_\\-\\s]?)?address',
      'poa',
      'address[_\\-\\s]?(?:proof|verification|confirm)',
      'council[_\\-\\s]?tax',
      'electoral[_\\-\\s]?roll',
    ],
    excludePatterns: [
      'passport',
      'driv(?:ing)?[_\\-\\s]?li[cs]en[cs]e',
      'utility[_\\-\\s]?bill',
      'bank[_\\-\\s]?statement',
    ],
    decisionRules: [
      {
        condition: 'Document shows a residential address from a recognised institutional source and is recently dated',
        signals: ['residential-address', 'institutional-source', 'recent-date'],
        priority: 8,
        action: 'require',
      },
      {
        condition: 'Document is an HMRC notice, council tax bill, or electoral roll confirmation',
        signals: ['hmrc-branding', 'council-tax', 'electoral-roll'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document submitted as part of a KYC address verification pack',
        signals: ['kyc-pack', 'address-verification'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'filing', 'chat', 'checklist'],
    expectedFields: [
      'kyc.fullName',
      'kyc.address',
      'kyc.documentDate',
      'kyc.issuingOrganisation',
      'kyc.referenceNumber',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 5. Utility Bill
  // ---------------------------------------------------------------------------
  {
    id: 'utility-bill',
    fileType: 'Utility Bill',
    category: 'KYC',
    filing: { targetFolder: 'KYC', targetLevel: 'client' },
    description:
      'A utility bill is one of the most widely accepted documents for proving a borrower\'s ' +
      'current residential address in UK property finance KYC checks. Under the Money ' +
      'Laundering Regulations 2017 and FCA guidance, lenders accept recent utility bills — ' +
      'typically dated within three months — from gas, electricity, water, or landline ' +
      'telephone providers as reliable proof of address. Council tax bills are also commonly ' +
      'grouped under this classification, though they are annual rather than quarterly and are ' +
      'accepted for up to twelve months. A utility bill is a recurring periodic statement from ' +
      'a regulated utility provider addressed to the account holder at their residential ' +
      'address. It typically shows the provider\'s name and logo, the customer\'s full name, ' +
      'the supply or account address, the billing period, amounts due or paid, and a unique ' +
      'account or reference number. Mobile phone bills are generally NOT accepted as proof ' +
      'of address by most property finance lenders because they are not tied to a physical ' +
      'supply address. Similarly, broadband-only bills may not be accepted depending on the ' +
      'lender\'s AML policy. The key distinction between a utility bill and a receipt is that ' +
      'the bill is a formal periodic statement showing ongoing service provision at a specific ' +
      'address, whereas a receipt merely confirms a one-time payment. In the RockCap workflow, ' +
      'utility bills are filed at the client level under the KYC folder because they verify ' +
      'the individual borrower\'s address, not any specific loan or project. Lenders will ' +
      'cross-reference the address on the utility bill against the borrower\'s application ' +
      'form, driving licence, and property deeds. For SPV borrowers, utility bills must be ' +
      'in the name of the individual director or PSC, not the company.',
    identificationRules: [
      'PRIMARY: A periodic bill from a gas, electricity, water, or landline telephone provider addressed to a residential property',
      'CRITICAL: Shows the provider\'s name/logo, customer name, supply address, billing period, and amount due',
      'Dated within the last three months (or twelve months for council tax bills)',
      'Contains an account number or customer reference number unique to the supply point',
      'Displays usage or consumption figures (kWh, cubic metres, units) for gas/electricity/water',
      'Shows a supply address that is a residential property (not a PO Box)',
      'Bears the provider\'s regulatory registration details or Ofgem/Ofwat licence number',
      'Is a BILL or STATEMENT, not a receipt or payment confirmation',
      'May include a payment due date and payment method details',
      'May be a council tax bill from a local authority showing the property band and annual charge',
      'Should NOT be a mobile phone bill or broadband-only bill',
    ],
    disambiguation: [
      'This is a Utility Bill, NOT a receipt or payment confirmation — a utility bill is a formal recurring statement from a provider showing ongoing service at an address, not a one-time payment acknowledgement.',
      'This is a Utility Bill, NOT a Bank Statement — bank statements show financial transactions from a bank/building society; utility bills show charges for gas, electricity, water, or council tax at a specific address.',
      'This is a Utility Bill, NOT a generic Proof of Address — utility bills are a specific sub-type of proof of address from utility providers; other proof of address documents (HMRC letters, electoral roll) are classified separately.',
    ],
    terminology: {
      'Supply Address': 'The physical address where the utility service (gas, electricity, water) is provided — this is the address being verified',
      'Billing Period': 'The date range covered by the bill, typically monthly or quarterly',
      'Council Tax': 'A local authority tax on domestic properties, banded A to H based on property value — bills are annual but accepted for 12 months',
      'Ofgem': 'Office of Gas and Electricity Markets — the UK regulator for energy providers',
      'Ofwat': 'Water Services Regulation Authority — the UK regulator for water and sewerage companies',
      MPAN: 'Meter Point Administration Number — a unique 21-digit reference identifying an electricity supply point',
      MPRN: 'Meter Point Reference Number — a unique reference identifying a gas supply point',
    },
    tags: [
      { namespace: 'domain', value: 'kyc', weight: 1.0 },
      { namespace: 'signal', value: 'proof-of-address', weight: 1.5 },
      { namespace: 'type', value: 'utility-bill', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'address-verification', weight: 1.2 },
    ],
    keywords: [
      'utility bill', 'gas bill', 'electricity bill', 'electric bill', 'water bill',
      'council tax', 'council tax bill', 'energy bill', 'telephone bill',
      'landline bill', 'supply address', 'billing period', 'account number',
      'meter reading', 'kWh', 'MPAN', 'MPRN', 'Ofgem', 'Ofwat',
      'proof of address', 'KYC', 'AML', 'residential address', 'provider',
    ],
    filenamePatterns: [
      'utility[_\\-\\s]?bill',
      '(?:gas|electric(?:ity)?|water|council[_\\-\\s]?tax)[_\\-\\s]?bill',
      'energy[_\\-\\s]?(?:bill|statement)',
      'util[_\\-\\s]?bill',
    ],
    excludePatterns: [
      'bank[_\\-\\s]?statement',
      'receipt',
      'payment[_\\-\\s]?confirm',
      'passport',
      'mobile[_\\-\\s]?(?:phone)?[_\\-\\s]?bill',
    ],
    decisionRules: [
      {
        condition: 'Document is a periodic bill from a gas, electricity, water, or council tax provider showing a residential supply address',
        signals: ['utility-provider', 'supply-address', 'billing-period', 'amount-due'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Filename contains "utility bill", "gas bill", "electric bill", or "council tax"',
        signals: ['filename-utility-bill', 'filename-council-tax'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document is part of a KYC address verification submission',
        signals: ['kyc-pack', 'address-verification'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'filing', 'chat', 'checklist'],
    expectedFields: [
      'kyc.fullName',
      'kyc.address',
      'kyc.documentDate',
      'kyc.billingPeriod',
      'kyc.accountNumber',
      'kyc.provider',
      'kyc.amountDue',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 6. Bank Statement
  // ---------------------------------------------------------------------------
  {
    id: 'bank-statement-kyc',
    fileType: 'Bank Statement',
    category: 'KYC',
    filing: { targetFolder: 'KYC', targetLevel: 'client' },
    description:
      'A bank statement or building society statement is a key KYC document used in UK ' +
      'property finance to verify a borrower\'s residential address and, in some cases, to ' +
      'evidence financial standing. Under the Money Laundering Regulations 2017, lenders ' +
      'accept recent bank statements — typically dated within three months — as proof of ' +
      'address when they clearly show the account holder\'s full name and current residential ' +
      'address. The statement should originate from a UK-regulated bank or building society ' +
      'authorised by the Financial Conduct Authority (FCA) or the Prudential Regulation ' +
      'Authority (PRA). A bank statement typically shows the institution\'s name and logo, ' +
      'account holder name and address, sort code and account number, statement period, ' +
      'opening and closing balances, and a chronological list of transactions. For KYC ' +
      'purposes, the primary function is address verification — the transactional content is ' +
      'secondary. However, credit teams may also review statements for affordability ' +
      'assessment, source of funds verification, and unusual transaction patterns that might ' +
      'trigger enhanced due diligence. It is critical to distinguish a bank statement used ' +
      'for KYC from a loan statement or facility statement. A bank statement shows day-to-day ' +
      'current account or savings account transactions, whereas a loan statement shows the ' +
      'balance, interest, and repayment schedule of a specific borrowing facility. In the ' +
      'RockCap workflow, bank statements submitted for KYC purposes are filed at the client ' +
      'level under the KYC folder. If a bank statement is submitted to evidence project-level ' +
      'cash flow or development account activity, it may instead be classified as a financial ' +
      'document. Both certified paper copies and electronic PDF statements downloaded from ' +
      'online banking are acceptable, provided they clearly display the required information.',
    identificationRules: [
      'PRIMARY: A periodic statement from a bank or building society showing account transactions, balances, and the holder\'s name and address',
      'CRITICAL: Contains the institution\'s sort code and account number prominently displayed',
      'Shows the statement period (from/to dates) and opening/closing balances',
      'Bears the bank or building society\'s name, logo, and registered address',
      'Lists individual transactions with dates, descriptions, and amounts (debits and credits)',
      'Displays the account holder\'s full name and residential address at the top',
      'Dated within the last three months for KYC address verification purposes',
      'May show the FCA registration number or PRA authorisation of the institution',
      'Is a STATEMENT of a current account, savings account, or deposit account — NOT a loan or mortgage statement',
      'May be a printed/posted statement or a PDF downloaded from online banking',
    ],
    disambiguation: [
      'This is a Bank Statement (KYC), NOT a Loan Statement — a bank statement shows day-to-day account transactions and balances for address verification, whereas a loan statement shows the outstanding balance and repayment schedule of a borrowing facility.',
      'This is a Bank Statement, NOT a Utility Bill — bank statements come from banks/building societies and show financial transactions, not utility consumption charges.',
      'This is a Bank Statement for KYC purposes (address/identity verification), NOT a financial document for project-level cash flow analysis — context of submission determines classification.',
    ],
    terminology: {
      'Sort Code': 'A six-digit number identifying the bank branch, formatted as three pairs (e.g., 20-00-00)',
      'Building Society': 'A mutual financial institution that provides banking and mortgage services, similar to a bank but member-owned',
      FCA: 'Financial Conduct Authority — the UK regulator responsible for the conduct of financial services firms',
      PRA: 'Prudential Regulation Authority — the UK regulator responsible for the prudential regulation of banks and insurers',
      'Source of Funds': 'The origin of money used in a transaction — AML regulations require lenders to verify legitimate sources',
      'Opening/Closing Balance': 'The account balance at the start and end of the statement period',
    },
    tags: [
      { namespace: 'domain', value: 'kyc', weight: 1.0 },
      { namespace: 'signal', value: 'proof-of-address', weight: 1.3 },
      { namespace: 'signal', value: 'financial-kyc', weight: 1.2 },
      { namespace: 'type', value: 'bank-statement-kyc', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'address-verification', weight: 1.0 },
      { namespace: 'trigger', value: 'financial-verification', weight: 0.8 },
    ],
    keywords: [
      'bank statement', 'building society statement', 'current account', 'savings account',
      'sort code', 'account number', 'transactions', 'opening balance', 'closing balance',
      'statement period', 'FCA', 'PRA', 'debit', 'credit', 'proof of address',
      'KYC', 'AML', 'source of funds', 'online banking', 'bank account',
      'address verification', 'financial institution',
    ],
    filenamePatterns: [
      'bank[_\\-\\s]?statement',
      'bs[_\\-\\s]?(?:kyc|address|poa)',
      'building[_\\-\\s]?society[_\\-\\s]?statement',
      'account[_\\-\\s]?statement',
      'current[_\\-\\s]?account[_\\-\\s]?statement',
    ],
    excludePatterns: [
      'loan[_\\-\\s]?statement',
      'mortgage[_\\-\\s]?statement',
      'facility[_\\-\\s]?statement',
      'passport',
      'utility',
    ],
    decisionRules: [
      {
        condition: 'Document is a periodic bank/building society statement showing transactions and the holder\'s address',
        signals: ['bank-branding', 'sort-code', 'account-number', 'transaction-list'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Filename contains "bank statement" and context is KYC/address verification',
        signals: ['filename-bank-statement', 'kyc-context'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document submitted as part of a KYC address verification pack',
        signals: ['kyc-pack', 'address-verification'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'filing', 'chat', 'checklist', 'extraction'],
    expectedFields: [
      'kyc.fullName',
      'kyc.address',
      'kyc.documentDate',
      'kyc.statementPeriod',
      'kyc.accountNumber',
      'kyc.sortCode',
      'kyc.institution',
      'kyc.openingBalance',
      'kyc.closingBalance',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 7. Application Form
  // ---------------------------------------------------------------------------
  {
    id: 'application-form',
    fileType: 'Application Form',
    category: 'KYC',
    filing: { targetFolder: 'KYC', targetLevel: 'client' },
    description:
      'An application form in the context of UK property finance KYC is the initial document ' +
      'completed BY the borrower (or their broker) to apply for a loan facility, open an ' +
      'account, or request a financial product. It captures comprehensive personal and ' +
      'financial information used for identity verification, affordability assessment, and ' +
      'AML compliance. A typical bridging or development finance application form will ' +
      'collect the applicant\'s full legal name, date of birth, current and previous ' +
      'addresses, contact details, employment or business status, source of wealth, source ' +
      'of funds for the deposit and servicing, details of the proposed property (address, ' +
      'purchase price, estimated value, intended use), the loan amount sought, the proposed ' +
      'term, and the exit strategy. For corporate borrowers operating through SPVs, the form ' +
      'will also capture company name, registration number, registered office address, details ' +
      'of directors and PSCs, and ultimate beneficial ownership declarations. The application ' +
      'form is distinct from indicative terms or a facility letter — those are documents ' +
      'issued FROM the lender TO the borrower outlining proposed terms, whereas the application ' +
      'form is filled IN by the borrower and submitted TO the lender. It is a foundational ' +
      'KYC document because it establishes the borrower\'s declared identity, financial ' +
      'position, and purpose. Lenders use the information to populate their CRM, trigger ' +
      'AML screening, and initiate the underwriting process. PEP and sanctions screening ' +
      'is often first run against the details provided in the application form. In RockCap\'s ' +
      'system, application forms are filed at the client level because they relate to the ' +
      'borrower\'s identity and relationship with the lender, even though they reference ' +
      'specific properties or projects.',
    identificationRules: [
      'PRIMARY: A form filled IN by the borrower/applicant providing personal, financial, and property details for a loan or account application',
      'CRITICAL: Contains structured input fields for name, DOB, address, employment, income, and the loan/property details being applied for',
      'Includes borrower declarations, consents, and signature sections',
      'Shows sections for source of funds, source of wealth, and exit strategy',
      'May include corporate borrower sections for company details, directors, and PSCs',
      'Bears the lender\'s or broker\'s branding and form reference number',
      'Contains tick-boxes, dropdown selections, or free-text fields filled by the applicant',
      'Includes privacy notices, data protection statements, and FCA regulatory disclosures',
      'Is completed BY the borrower (input document), not issued TO the borrower (output document)',
      'May be a PDF form, printed and scanned handwritten form, or online submission printout',
    ],
    disambiguation: [
      'This is an Application Form, NOT Indicative Terms or a Facility Letter — the application form is filled IN by the borrower to request a loan, whereas indicative terms and facility letters are issued FROM the lender to the borrower outlining proposed/agreed terms.',
      'This is an Application Form, NOT a credit report or underwriting memo — the form captures the borrower\'s self-declared information, not the lender\'s assessment of it.',
      'This is an Application Form, NOT an Assets & Liabilities Statement — while the form may include a section on assets and liabilities, a standalone A&L statement is a separate dedicated document.',
    ],
    terminology: {
      'Exit Strategy': 'The borrower\'s planned method for repaying the loan (e.g., sale of the property, refinance to a term mortgage)',
      'Source of Funds': 'The specific origin of money being used for the deposit and loan servicing (e.g., savings, property sale proceeds)',
      'Source of Wealth': 'The broader explanation of how the applicant accumulated their overall wealth (e.g., career earnings, inheritance, business profits)',
      SPV: 'Special Purpose Vehicle — a limited company set up specifically to hold a property or development project',
      Broker: 'An intermediary who arranges loans between borrowers and lenders, often completing the application on behalf of the borrower',
      CRM: 'Customer Relationship Management — the lender\'s system for tracking borrower interactions and deal pipeline',
    },
    tags: [
      { namespace: 'domain', value: 'kyc', weight: 1.0 },
      { namespace: 'signal', value: 'financial-kyc', weight: 1.3 },
      { namespace: 'type', value: 'application-form', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'context', value: 'extraction', weight: 1.0 },
      { namespace: 'trigger', value: 'borrower-application', weight: 1.5 },
    ],
    keywords: [
      'application form', 'loan application', 'borrower application', 'applicant details',
      'personal details', 'source of funds', 'source of wealth', 'exit strategy',
      'property details', 'loan amount', 'term', 'declaration', 'consent',
      'broker', 'SPV', 'company details', 'directors', 'PSC', 'beneficial owner',
      'KYC', 'AML', 'underwriting', 'bridging loan', 'development finance',
    ],
    filenamePatterns: [
      'application[_\\-\\s]?form',
      'loan[_\\-\\s]?application',
      'borrower[_\\-\\s]?application',
      'app[_\\-\\s]?form',
      'application[_\\-\\s]?(?:v\\d|20\\d{2})',
    ],
    excludePatterns: [
      'indicative[_\\-\\s]?terms',
      'facility[_\\-\\s]?letter',
      'term[_\\-\\s]?sheet',
      'offer[_\\-\\s]?letter',
      'credit[_\\-\\s]?report',
    ],
    decisionRules: [
      {
        condition: 'Document is a structured form filled by the borrower with personal, financial, and property details',
        signals: ['borrower-input-form', 'personal-details-section', 'property-details-section', 'declarations'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Filename contains "application form" or "loan application"',
        signals: ['filename-application-form', 'filename-loan-application'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document is submitted at the start of a new loan enquiry',
        signals: ['new-enquiry', 'initial-submission'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'filing', 'chat', 'checklist', 'extraction', 'summarization'],
    expectedFields: [
      'kyc.fullName',
      'kyc.dateOfBirth',
      'kyc.address',
      'kyc.contactDetails',
      'kyc.employmentStatus',
      'kyc.sourceOfFunds',
      'kyc.sourceOfWealth',
      'loan.amount',
      'loan.term',
      'loan.exitStrategy',
      'property.address',
      'property.purchasePrice',
      'property.estimatedValue',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 8. Assets & Liabilities Statement
  // ---------------------------------------------------------------------------
  {
    id: 'assets-liabilities-statement',
    fileType: 'Assets & Liabilities Statement',
    category: 'KYC',
    filing: { targetFolder: 'KYC', targetLevel: 'client' },
    description:
      'An Assets & Liabilities Statement (A&L Statement) is a personal financial declaration ' +
      'completed by the borrower to provide lenders with a comprehensive snapshot of their ' +
      'net worth. In UK property finance, this document is a standard component of the KYC ' +
      'and underwriting pack, particularly for bridging loans, development finance, and ' +
      'mezzanine facilities where the borrower\'s personal wealth underpins the credit ' +
      'decision. The statement typically lists all of the borrower\'s assets — including ' +
      'property holdings (with current estimated values and outstanding mortgage balances), ' +
      'savings and investments, pension funds, business interests, vehicles, and any other ' +
      'significant assets — alongside all liabilities, including mortgages, personal loans, ' +
      'credit card balances, tax liabilities (income tax, capital gains tax, inheritance tax), ' +
      'guarantees given to third parties, and any contingent liabilities such as ongoing ' +
      'litigation. The resulting net worth figure (total assets minus total liabilities) is ' +
      'a key metric in credit assessment. Lenders use the A&L statement to assess the ' +
      'borrower\'s overall financial resilience, verify that the declared source of wealth ' +
      'is plausible and consistent with the borrower\'s background, and evaluate their ability ' +
      'to service debt or provide additional security if the primary exit strategy fails. ' +
      'For AML purposes, the A&L statement supports the source of wealth narrative — it ' +
      'demonstrates how the borrower accumulated their current financial position. The ' +
      'document is typically a self-declaration, sometimes on the lender\'s standard template, ' +
      'and may be supported by third-party evidence (property valuations, investment ' +
      'statements, tax returns). In RockCap\'s workflow, the A&L statement is filed at the ' +
      'client level because it relates to the individual borrower\'s overall financial ' +
      'position, not any single project.',
    identificationRules: [
      'PRIMARY: A tabular or structured declaration listing the borrower\'s personal assets and liabilities with values',
      'CRITICAL: Contains distinct sections for ASSETS (property, savings, investments, pensions) and LIABILITIES (mortgages, loans, credit cards, tax)',
      'Shows a calculated net worth or net asset figure (total assets minus total liabilities)',
      'Lists individual property holdings with estimated current market values and outstanding mortgage balances',
      'Includes the borrower\'s name and the date of the declaration',
      'May be on the lender\'s standard template or the borrower\'s own format',
      'Contains financial figures with currency (GBP) amounts for each asset and liability line item',
      'May include supporting notes on valuations, contingent liabilities, or guarantees given',
      'Shows totals for each section (total assets, total liabilities) and an overall net position',
      'Is a self-declaration document, typically signed by the borrower',
    ],
    disambiguation: [
      'This is an Assets & Liabilities Statement, NOT an Application Form — while an application form may include a brief A&L section, a standalone A&L statement is a dedicated financial declaration with comprehensive detail on every asset and liability.',
      'This is an Assets & Liabilities Statement, NOT a Bank Statement — bank statements show transactional activity in a single account, whereas an A&L statement aggregates the borrower\'s entire financial position across all assets and liabilities.',
      'This is an Assets & Liabilities Statement, NOT a Schedule of Assets (insurance) — an insurance schedule lists insured assets with policy details, whereas an A&L statement is a personal wealth declaration for credit assessment.',
    ],
    terminology: {
      'Net Worth': 'Total assets minus total liabilities — the key summary metric of the borrower\'s financial standing',
      'Contingent Liability': 'A potential future liability that may or may not materialise, such as a personal guarantee or ongoing legal claim',
      'Source of Wealth': 'The narrative explaining how the borrower accumulated their assets over time — supported by the A&L statement',
      'Personal Guarantee': 'A legal commitment by the borrower to personally repay a debt if the borrowing entity (e.g., SPV) defaults',
      'Mezzanine Finance': 'A subordinated layer of funding sitting between senior debt and equity, often requiring personal wealth backing',
      CGT: 'Capital Gains Tax — a tax on the profit from selling assets, relevant when assessing property portfolio liabilities',
    },
    tags: [
      { namespace: 'domain', value: 'kyc', weight: 1.0 },
      { namespace: 'signal', value: 'financial-kyc', weight: 1.5 },
      { namespace: 'type', value: 'assets-liabilities-statement', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'context', value: 'extraction', weight: 1.2 },
      { namespace: 'trigger', value: 'financial-verification', weight: 1.3 },
    ],
    keywords: [
      'assets and liabilities', 'A&L statement', 'assets & liabilities', 'net worth',
      'personal wealth', 'financial declaration', 'property portfolio', 'investments',
      'savings', 'pension', 'mortgages', 'loans', 'credit cards', 'liabilities',
      'total assets', 'total liabilities', 'net asset value', 'self-declaration',
      'guarantees', 'contingent liabilities', 'source of wealth', 'KYC',
    ],
    filenamePatterns: [
      'assets?[_\\-\\s]?(?:&|and)?[_\\-\\s]?liabilit(?:y|ies)',
      'a[_\\-\\s]?(?:&|and)[_\\-\\s]?l[_\\-\\s]?(?:statement|schedule)',
      'net[_\\-\\s]?worth',
      'personal[_\\-\\s]?(?:financial|wealth)[_\\-\\s]?(?:statement|declaration)',
    ],
    excludePatterns: [
      'application[_\\-\\s]?form',
      'bank[_\\-\\s]?statement',
      'insurance[_\\-\\s]?schedule',
      'loan[_\\-\\s]?statement',
    ],
    decisionRules: [
      {
        condition: 'Document is a structured declaration listing personal assets and liabilities with a net worth calculation',
        signals: ['assets-section', 'liabilities-section', 'net-worth-figure', 'financial-declaration'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Filename contains "assets" and "liabilities" or "net worth"',
        signals: ['filename-assets-liabilities', 'filename-net-worth'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document submitted as part of a credit assessment or underwriting pack',
        signals: ['credit-assessment', 'underwriting-pack'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'filing', 'chat', 'checklist', 'extraction', 'summarization'],
    expectedFields: [
      'kyc.fullName',
      'kyc.documentDate',
      'financial.totalAssets',
      'financial.totalLiabilities',
      'financial.netWorth',
      'financial.propertyPortfolio',
      'financial.savings',
      'financial.investments',
      'financial.pensions',
      'financial.outstandingMortgages',
      'financial.otherLiabilities',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 9. Certificate of Incorporation
  // ---------------------------------------------------------------------------
  {
    id: 'certificate-of-incorporation',
    fileType: 'Certificate of Incorporation',
    category: 'KYC',
    filing: { targetFolder: 'KYC', targetLevel: 'client' },
    description:
      'A Certificate of Incorporation is the official document issued by Companies House ' +
      'confirming that a company has been legally registered and incorporated under the ' +
      'Companies Act 2006. In UK property finance, this certificate is a fundamental KYC ' +
      'document for corporate borrowers, particularly SPVs (Special Purpose Vehicles) set ' +
      'up to hold property assets or undertake development projects. The certificate confirms ' +
      'the company\'s legal existence, its registered name, company number, date of ' +
      'incorporation, and whether it is a private limited company (Ltd), public limited ' +
      'company (PLC), limited liability partnership (LLP), or other entity type. Lenders ' +
      'require this document to verify that the borrowing entity is a validly registered ' +
      'company before entering into any loan agreement. The company number on the certificate ' +
      'is the key reference used to look up the entity on the Companies House register, ' +
      'where the lender can verify current directors, persons of significant control (PSCs), ' +
      'registered office address, filing history, and confirmation statements. For AML ' +
      'compliance, the Certificate of Incorporation supports the corporate identity ' +
      'verification process — it is the equivalent of a "birth certificate" for a company. ' +
      'Where the borrower operates through a chain of companies or overseas entities, ' +
      'certificates of incorporation may be required for each entity in the ownership ' +
      'structure to establish the ultimate beneficial ownership chain. The certificate is ' +
      'distinct from a company search or Companies House extract — the certificate is the ' +
      'original document issued at the time of incorporation, whereas a company search is ' +
      'a subsequent report pulled from the register. In RockCap\'s workflow, certificates ' +
      'of incorporation are filed at the client level because they verify the corporate ' +
      'entity\'s identity, which underpins the borrower relationship.',
    identificationRules: [
      'PRIMARY: An official certificate bearing the Companies House crest/logo confirming a company\'s registration',
      'CRITICAL: Contains the company\'s registered name, unique company number (typically 8 digits), and date of incorporation',
      'Bears the title "Certificate of Incorporation" or "Certificate of Incorporation on Change of Name"',
      'Shows the Registrar of Companies\' authentication (signature, seal, or electronic authentication)',
      'States the company type (private limited by shares, PLC, LLP, etc.) and the legislation under which it was incorporated',
      'References the Companies Act 2006 (or earlier Companies Acts for older incorporations)',
      'Contains a formal, single-page certificate layout with the Companies House crest',
      'The company number format is typically 8 digits (e.g., 12345678) or prefixed with letters for non-England/Wales registrations (SC, NI, OC)',
      'May include a statement that the company is registered in England and Wales, Scotland, or Northern Ireland',
      'Is an original certificate or certified copy — not a Companies House search printout or extract',
    ],
    disambiguation: [
      'This is a Certificate of Incorporation, NOT a company search or Companies House extract — the certificate is the original document issued by the Registrar at the time of incorporation, whereas a company search is a subsequent information report pulled from the register showing current directors, filings, etc.',
      'This is a Certificate of Incorporation, NOT an annual confirmation statement (CS01) — the confirmation statement is a periodic filing to Companies House updating company details, not the original registration certificate.',
      'This is a Certificate of Incorporation, NOT articles of association or a memorandum of association — those are the company\'s constitutional documents governing its rules and objectives, not the registration certificate.',
    ],
    terminology: {
      'Companies House': 'The UK government registrar of companies, responsible for incorporating and dissolving limited companies and maintaining the public register',
      'Company Number': 'A unique 8-digit reference assigned by Companies House at incorporation, used to identify the entity on the public register',
      SPV: 'Special Purpose Vehicle — a limited company established specifically to hold a property asset or undertake a development project, common in property finance',
      PSC: 'Person of Significant Control — an individual who holds more than 25% of shares or voting rights, or exercises significant influence over the company',
      LLP: 'Limited Liability Partnership — a partnership structure registered at Companies House offering limited liability to its members',
      'Registrar of Companies': 'The official at Companies House who authenticates certificates of incorporation and maintains the companies register',
    },
    tags: [
      { namespace: 'domain', value: 'kyc', weight: 1.0 },
      { namespace: 'signal', value: 'corporate-kyc', weight: 1.5 },
      { namespace: 'type', value: 'certificate-of-incorporation', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'corporate-identity', weight: 1.3 },
    ],
    keywords: [
      'certificate of incorporation', 'Companies House', 'company number',
      'date of incorporation', 'registered company', 'limited company', 'Ltd',
      'PLC', 'LLP', 'SPV', 'registrar', 'Companies Act', 'incorporation',
      'company registration', 'corporate entity', 'registered name',
      'registered office', 'PSC', 'directors', 'KYC', 'AML',
      'corporate identity', 'company certificate',
    ],
    filenamePatterns: [
      'cert(?:ificate)?[_\\-\\s]?(?:of[_\\-\\s]?)?incorporat(?:ion|ed)',
      'companies[_\\-\\s]?house[_\\-\\s]?cert',
      'incorporation[_\\-\\s]?cert',
      'company[_\\-\\s]?(?:registration|cert)',
      'coi(?:[_\\-\\s]|$)',
    ],
    excludePatterns: [
      'company[_\\-\\s]?search',
      'companies[_\\-\\s]?house[_\\-\\s]?(?:search|extract|report)',
      'confirmation[_\\-\\s]?statement',
      'articles[_\\-\\s]?of[_\\-\\s]?association',
      'memorandum',
    ],
    decisionRules: [
      {
        condition: 'Document is an official Companies House certificate showing company name, number, and incorporation date',
        signals: ['companies-house-branding', 'company-number', 'incorporation-date', 'registrar-authentication'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Filename contains "certificate of incorporation" or "COI"',
        signals: ['filename-certificate-incorporation', 'filename-coi'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document submitted as part of corporate KYC for an SPV borrower',
        signals: ['corporate-kyc', 'spv-borrower', 'company-verification'],
        priority: 6,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'filing', 'chat', 'checklist', 'extraction'],
    expectedFields: [
      'company.name',
      'company.number',
      'company.incorporationDate',
      'company.type',
      'company.registeredOffice',
      'company.jurisdiction',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },
];
