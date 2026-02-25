// =============================================================================
// COMMUNICATIONS — DOCUMENT REFERENCES
// =============================================================================
// Covers: Email/Correspondence, Meeting Minutes
// Filing target: Communications folder at project level

import type { DocumentReference } from '../types';

export const COMMUNICATION_REFERENCES: DocumentReference[] = [
  // ---------------------------------------------------------------------------
  // 1. Email / Correspondence
  // ---------------------------------------------------------------------------
  {
    id: 'email-correspondence',
    fileType: 'Email/Correspondence',
    category: 'Communications',

    filing: {
      targetFolder: 'Communications',
      targetLevel: 'project',
    },

    description:
      'Emails and written correspondence form the connective tissue of every property finance transaction at RockCap. ' +
      'These documents capture the ongoing dialogue between borrowers, brokers, solicitors, valuers, insurers, and the ' +
      'internal lending team throughout the lifecycle of a deal — from initial enquiry through to drawdown and eventual ' +
      'redemption. Correspondence may arrive as forwarded email chains (often exported as .eml, .msg, or PDF printouts), ' +
      'formal letters on headed paper, or informal written communications sent via email.\n\n' +
      'Typical contents include deal negotiation threads, requests for further information (RFI), confirmation of terms, ' +
      'instructions to solicitors, broker introductions, borrower updates on construction progress, and day-to-day ' +
      'operational communications. Emails frequently contain attachments — valuations, legal documents, insurance ' +
      'certificates, and financial statements — but the email itself should be classified as correspondence, not as ' +
      'the document type of its attachment.\n\n' +
      'In the context of UK property finance lending, correspondence serves as an audit trail demonstrating that proper ' +
      'due diligence was followed, that conditions precedent were communicated and acknowledged, and that all parties ' +
      'were informed of material changes. Regulatory frameworks such as FCA guidelines on record-keeping make it ' +
      'essential to retain and organise these communications. RockCap files correspondence at the project level within ' +
      'the Communications folder so that the full narrative of each deal can be reconstructed chronologically when ' +
      'needed for audits, disputes, or internal reviews.',

    identificationRules: [
      'PRIMARY: Contains email headers — From, To, Date, Subject fields — or is formatted as an email chain with reply/forward markers',
      'PRIMARY: Written as a letter with salutation ("Dear..."), sign-off, and sender contact details on headed notepaper',
      'CRITICAL: Must be the correspondence itself, NOT an attachment to correspondence — if the document is a valuation report that was emailed, classify it as the valuation, not as correspondence',
      'Contains conversational language between two or more parties discussing deal-related matters',
      'Includes email thread markers such as "Re:", "Fwd:", "From: ... Sent: ... To: ... Subject:" blocks',
      'May contain email disclaimers, confidentiality notices, or company signature blocks at the bottom',
      'References specific deal terms, property addresses, or borrower names in an informal or semi-formal tone',
      'Often PDF printouts of email chains with metadata headers visible at the top of each message',
      'May include broker introductions or referral language ("I am pleased to introduce...", "Further to our conversation...")',
      'Contains dates and timestamps consistent with ongoing communication rather than a single formal report',
    ],

    disambiguation: [
      'Email/Correspondence vs Application Form: An email discussing a potential deal or enquiry is correspondence; a structured form with fields for loan amount, LTV, property details, and borrower information is an Application Form. Correspondence is conversational; application forms are structured data collection.',
      'Email/Correspondence vs any attached document: Emails frequently carry attachments (valuations, certificates, legal documents). Always classify the email wrapper as Email/Correspondence and classify each attachment by its own document type independently.',
      'Email/Correspondence vs Meeting Minutes: Emails are asynchronous written exchanges between parties. Meeting Minutes are formal records of a specific convened meeting with agenda items, attendees, and action points. An email summarising what was discussed in a meeting is still correspondence unless it follows a structured minutes format.',
      'Email/Correspondence vs Facility Letter or Loan Terms: A letter from the lender offering terms is a Facility Letter (Loan Terms), not mere correspondence, even though it arrives as a letter. Look for binding offer language and formal term sheets.',
    ],

    terminology: {
      'RFI': 'Request for Further Information — a formal or informal request asking a borrower or third party to supply additional documents or data',
      'CP': 'Condition Precedent — a requirement that must be satisfied before funds are released; often communicated and tracked via correspondence',
      'FCA': 'Financial Conduct Authority — UK regulator whose record-keeping rules require retention of material communications',
      'EML / MSG': 'Email file formats (Outlook .msg, generic .eml) that preserve full email metadata and attachments',
      'chain': 'An email thread containing multiple replies and forwards building a chronological conversation',
      'headed paper': 'Formal stationery with company logo and contact details, used for official written letters',
      'broker introduction': 'Initial communication from a finance broker introducing a borrower and a potential deal to the lender',
    },

    tags: [
      { namespace: 'type', value: 'email-correspondence', weight: 1.5 },
      { namespace: 'domain', value: 'property-finance' },
      { namespace: 'signal', value: 'email-headers' },
      { namespace: 'signal', value: 'letter-format' },
      { namespace: 'signal', value: 'conversational-tone' },
      { namespace: 'context', value: 'classification' },
      { namespace: 'context', value: 'filing' },
      { namespace: 'context', value: 'chat' },
      { namespace: 'trigger', value: 'email+deal-reference' },
    ],

    keywords: [
      'email', 'correspondence', 'letter', 'from', 'to', 'subject', 'dear',
      'regards', 'kind regards', 'further to', 'please find attached', 'Re:',
      'Fwd:', 'forwarded message', 'sent from', 'broker introduction',
      'enquiry', 'request for information', 'RFI', 'confirm', 'update',
      'headed paper', 'confidentiality notice', 'disclaimer', 'chain',
      'thread',
    ],

    filenamePatterns: [
      'email', 'correspondence', 'letter', 'eml$', 'msg$',
      'fwd', 'fw[_\\-\\s]', 're[_\\-\\s]',
      'broker[_\\-]?intro',
    ],

    excludePatterns: [
      'minutes', 'meeting[_\\-]?minutes', 'agenda',
      'valuation', 'certificate', 'report',
      'application[_\\-]?form', 'facility[_\\-]?letter',
    ],

    decisionRules: [
      {
        condition: 'Document contains email headers (From/To/Subject/Date)',
        signals: ['email-headers', 'from-to-subject'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document is formatted as a formal letter on headed paper',
        signals: ['letter-format', 'headed-paper', 'salutation'],
        priority: 8,
        action: 'include',
      },
      {
        condition: 'Conversational language discussing deal matters without structured report format',
        signals: ['conversational-tone', 'deal-reference', 'no-report-structure'],
        priority: 7,
        action: 'include',
      },
      {
        condition: 'File extension is .eml or .msg indicating native email format',
        signals: ['eml-extension', 'msg-extension'],
        priority: 10,
        action: 'require',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'chat'],

    expectedFields: [
      'sender',
      'recipient',
      'date',
      'subject',
      'dealReference',
      'propertyAddress',
      'keyPoints',
      'actionItems',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 2. Meeting Minutes
  // ---------------------------------------------------------------------------
  {
    id: 'meeting-minutes',
    fileType: 'Meeting Minutes',
    category: 'Communications',

    filing: {
      targetFolder: 'Communications',
      targetLevel: 'project',
    },

    description:
      'Meeting Minutes are the formal written record of proceedings, decisions, and action items arising from a ' +
      'convened meeting. In the context of RockCap\'s property finance operations, these documents capture the ' +
      'outcomes of credit committee meetings, board meetings, project review meetings, progress meetings with ' +
      'borrowers or contractors, and internal team meetings where lending decisions are discussed and ratified.\n\n' +
      'A well-structured set of meeting minutes typically includes the meeting title or purpose, date and time, ' +
      'a list of attendees (and apologies for absence), an agenda or list of items discussed, a record of key ' +
      'discussion points under each agenda item, formal decisions or resolutions reached, and a clearly delineated ' +
      'list of action items with owners and deadlines. Minutes from credit committee meetings are particularly ' +
      'significant as they document the rationale behind lending approvals, conditions attached to approvals, ' +
      'and any dissenting views — all of which are important for regulatory compliance and internal governance.\n\n' +
      'In UK property finance, meeting minutes serve both operational and regulatory functions. They provide ' +
      'evidence that proper governance procedures were followed, that risks were discussed and assessed, and ' +
      'that decisions were made with appropriate authority. FCA-regulated firms and those following Senior ' +
      'Managers and Certification Regime (SM&CR) principles rely on meeting minutes to demonstrate ' +
      'accountability. Construction-related progress meetings also generate minutes that track milestones, ' +
      'variations, and drawdown triggers — connecting directly to monitoring surveyor reports and quantity ' +
      'surveyor assessments. RockCap files meeting minutes in the project-level Communications folder alongside ' +
      'related correspondence to maintain a complete record of stakeholder interactions for each deal.',

    identificationRules: [
      'PRIMARY: Document titled or headed as "Minutes", "Meeting Minutes", "Minutes of Meeting", or "Record of Meeting"',
      'PRIMARY: Contains a structured attendees list — names, roles, and sometimes "Present" / "Apologies" sections',
      'CRITICAL: Must follow a formal meeting structure (agenda items, decisions, actions) — an email summarising a call is correspondence, not minutes',
      'Includes numbered or bulleted agenda items with discussion notes recorded against each item',
      'Contains an "Action Items" or "Actions Arising" section with assigned owners and target dates',
      'References a specific meeting date, time, and location (or virtual meeting platform)',
      'May include approval or resolution language ("It was resolved that...", "The committee approved...")',
      'Often references previous minutes or actions from a prior meeting ("Matters arising from previous minutes")',
      'Formatted with clear section headings separating agenda items, discussion, decisions, and next steps',
      'May carry a "Draft" or "Approved" watermark indicating the document\'s status in the approval cycle',
    ],

    disambiguation: [
      'Meeting Minutes vs Email/Correspondence: Meeting minutes are a structured, formal record of a convened meeting with defined sections (attendees, agenda, decisions, actions). An email summarising discussion points from a call or meeting is correspondence. The key differentiator is formal structure — minutes have attendee lists, numbered agenda items, and action tables.',
      'Meeting Minutes vs Progress Report: A monitoring surveyor\'s site visit report or a project progress report is a Professional Report or Inspection document, not meeting minutes, even if it records discussions on site. Minutes specifically record a formal meeting with multiple attendees.',
      'Meeting Minutes vs Board Resolution: A standalone board resolution or written resolution is a Legal Document. Full board meeting minutes that contain resolutions within them are Meeting Minutes. If the document is solely a resolution without meeting context, classify it as a legal document.',
      'Meeting Minutes vs Credit Committee Paper: A credit paper or credit proposal submitted for committee review is a Project Document. The minutes recording the committee\'s discussion and decision on that paper are Meeting Minutes.',
    ],

    terminology: {
      'credit committee': 'Internal body that reviews and approves (or declines) lending proposals; its meeting minutes document the decision rationale',
      'SM&CR': 'Senior Managers and Certification Regime — FCA framework requiring clear accountability and documented decision-making',
      'matters arising': 'Standing agenda item reviewing action items and decisions from the previous meeting',
      'quorum': 'Minimum number of attendees required for a meeting to be valid and its decisions binding',
      'resolution': 'A formal decision recorded in minutes, often using prescribed language ("It was resolved that...")',
      'action item': 'A task assigned to a specific person with a deadline, arising from meeting discussion',
      'progress meeting': 'Regular meeting (often monthly) between lender, borrower, and project team to review construction or refurbishment progress',
      'apologies': 'Record of invited attendees who were unable to attend the meeting',
    },

    tags: [
      { namespace: 'type', value: 'meeting-minutes', weight: 1.5 },
      { namespace: 'domain', value: 'property-finance' },
      { namespace: 'domain', value: 'governance' },
      { namespace: 'signal', value: 'attendees-list' },
      { namespace: 'signal', value: 'agenda-items' },
      { namespace: 'signal', value: 'action-items' },
      { namespace: 'context', value: 'classification' },
      { namespace: 'context', value: 'filing' },
      { namespace: 'context', value: 'chat' },
      { namespace: 'trigger', value: 'attendees+agenda+actions' },
    ],

    keywords: [
      'minutes', 'meeting minutes', 'record of meeting', 'attendees', 'present',
      'apologies', 'agenda', 'matters arising', 'action items', 'actions arising',
      'resolved', 'resolution', 'quorum', 'chairperson', 'chair',
      'credit committee', 'board meeting', 'progress meeting', 'next meeting',
      'AOB', 'any other business', 'it was agreed', 'approved',
      'noted', 'discussed',
    ],

    filenamePatterns: [
      'minutes', 'meeting[_\\-]?minutes', 'mom[_\\-]',
      'board[_\\-]?minutes', 'credit[_\\-]?committee[_\\-]?minutes',
      'progress[_\\-]?meeting', 'record[_\\-]?of[_\\-]?meeting',
    ],

    excludePatterns: [
      'email', 'correspondence', 'letter',
      'valuation', 'report', 'certificate',
      'resolution[_\\-]?only', 'written[_\\-]?resolution',
    ],

    decisionRules: [
      {
        condition: 'Document contains attendees list and agenda items',
        signals: ['attendees-list', 'agenda-items'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document titled as "Minutes" or "Meeting Minutes"',
        signals: ['title-minutes', 'heading-minutes'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'Contains action items with owners and deadlines arising from discussion',
        signals: ['action-items', 'assigned-owners', 'deadlines'],
        priority: 8,
        action: 'include',
      },
      {
        condition: 'Includes formal resolution or approval language from a committee',
        signals: ['resolution-language', 'committee-approval'],
        priority: 7,
        action: 'boost',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'chat'],

    expectedFields: [
      'meetingTitle',
      'meetingDate',
      'attendees',
      'apologies',
      'agendaItems',
      'decisions',
      'actionItems',
      'nextMeetingDate',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },
];
