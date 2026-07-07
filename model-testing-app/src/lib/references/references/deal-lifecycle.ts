// =============================================================================
// DEAL LIFECYCLE — DOCUMENT REFERENCES (Dark Mills exemplar pack)
// =============================================================================
// Grounded in the 59-file ground-truth corpus read 2026-07-07
// (docs/classification/dark-mills-exemplar-pack.md). Covers the docTypes that
// did not previously exist in the library: the producer-split appraisals,
// the RockCap Note family, the terms-analysis artifacts, the comps output
// deliverable, the statutory planning chain, third-party asset evidence, and
// the credit checklist. Content signals quote the pack's distinctive phrases;
// disambiguation rules are carried from the pack's decisive rules.
//
// Placement axes: every reference carries producer / audience /
// targetFolderKey — the deterministic placement engine
// (src/v4/lib/placement-rules.ts) is the final authority and agrees with
// these values.

import type { DocumentReference } from '../types';

export const DEAL_LIFECYCLE_REFERENCES: DocumentReference[] = [
  // ---------------------------------------------------------------------------
  // 1. Client Land Appraisal (pack §3.1)
  // ---------------------------------------------------------------------------
  {
    id: 'client-land-appraisal',
    fileType: 'Client Land Appraisal',
    category: 'Appraisals',
    filing: { targetFolder: 'Client Appraisals', targetLevel: 'project' },
    targetFolderKey: 'client_appraisals',
    producer: 'client',
    audience: 'internal',
    filenameGrammar:
      '"Land Appraisal - <Project> V<n> <freetext>" — spaces not underscores, hyphen after genre, whole-number version bumps, purpose-of-issue prose freetext. Tolerance: freetext may embed a ddmmyy date ("090126"); freetext is NOT unique per version (two versions can share "Final Budget for legals") — only the V<n> token is.',
    versionSemantics:
      'Whole-number filename versions; the workbook accretes rows over versions. The in-sheet version stamp can be frozen across versions — NEVER trust the in-sheet version cell; the filename V-token carries the real version. Latest V-token is operative.',
    description:
      "The developer's own multi-tab land appraisal / development budget workbook, mixing scheme " +
      'economics with operational actuals. This is the CLIENT\'s cost-and-profit view of the scheme ' +
      '(land, build, fees, revenue, profit), shared with RockCap and solicitors at budget-fix stage. ' +
      'It carries developer-ops DNA throughout: staff timesheets, invoice tabs, trade-level build-cost ' +
      'matrices, PAID TO DATE / cost-to-complete actuals, and profit expressed in developer metrics ' +
      '(Gross Profit / Gross Margin % / Return on Capital / Return on Sales). Finance appears as one ' +
      'lump "Total Finance Cost" line with no facility mechanics — no LTGDV, no drawdowns, no lender IRR. ' +
      'Typos and live #REF!/#DIV/0! errors corroborate a hand-grown workbook.',
    identificationRules: [
      'PRIMARY: "Appraisal Summary" block computing Gross Profit / Gross Margin % / Return on Capital / Return on Sales (developer profit vocabulary — NOT Profit on Cost %)',
      'PRIMARY: "Approved (Sign & Date)" block with housebuilder directorate titles (Commercial Director, Land Manager, MD)',
      'CRITICAL: trade-level housebuild cost matrix (GROUNDWORKS / SCAFFOLDING / BRICKLAYING - S/C … by house type £/ft2, FORECAST vs BUDGET)',
      'Operational actuals: Timesheet tab (staff-initials hour grid with "Cost Rate £/hr"), Invoice tab, PAID TO DATE / CTC columns',
      'Named counterparties in cell comments ("To be paid at end of project to …", "£6.7kpm")',
      'Finance as one lump line ("Total Finance Cost", "Intital Loan / Financial Backing" (sic)) with no LTGDV/LTC/drawdowns/lender IRR',
      'Typical tab set: Timesheet, Invoice, Summary, Revenue, Land, Finance, Offsite Works, Externals, House Build, Fees, Build Prelims, Sales Overheads, Planning Costs',
      'Live #REF!/#DIV/0! errors and typos corroborate a hand-grown client workbook',
    ],
    disambiguation: [
      'vs RockCap Appraisal Model: shared numbers do NOT distinguish producer — RockCap imports the client\'s category totals verbatim (same land cost, same housebuild cost, same unit count). Developer-ops DNA vs debt-structuring DNA does: Timesheet/Invoice/Gross Margin = client; Lender Dashboard/LTGDV/Checks panel/Profit on Cost % = RockCap.',
      '"Appraisal Summary" as a label appears in BOTH producers\' files — the surrounding metric vocabulary (Gross Margin vs Profit on Cost/LTGDV) discriminates.',
      'vs RedBook Valuation: this is the developer\'s own budget workbook, not an independent professional opinion of value — no RICS / Market Value / valuer-reliance language.',
    ],
    terminology: {
      'CTC': 'Cost to Complete — remaining spend, tracked as an operational actual in client workbooks',
      'Gross Margin %': 'Developer profit metric (profit over revenue) — a client-producer tell vs RockCap\'s Profit on Cost %',
      'Budget fix': 'The point at which the development budget is locked ("Final Budget for legals")',
      'Trade-level cost matrix': 'Build costs broken down by trade (groundworks, bricklaying…) × house type — developer-ops DNA',
    },
    tags: [
      { namespace: 'type', value: 'client-land-appraisal', weight: 1.5 },
      { namespace: 'type', value: 'land-appraisal', weight: 1.3 },
      { namespace: 'domain', value: 'property-finance', weight: 1.2 },
      { namespace: 'signal', value: 'developer-ops-dna', weight: 1.5 },
      { namespace: 'signal', value: 'financial-tables', weight: 1.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      'land appraisal', 'development budget', 'appraisal summary', 'gross margin', 'return on sales',
      'return on capital', 'paid to date', 'cost to complete', 'timesheet', 'invoice',
      'groundworks', 'bricklaying', 'build prelims', 'house build', 'final budget for legals',
      'total finance cost', 'approved sign & date',
    ],
    filenamePatterns: ['land.?appraisal', 'appraisal\\s*-\\s*\\w+\\s+V\\d'],
    excludePatterns: ['rockcap', 'lender.?dashboard', 'redbook', 'rics'],
    decisionRules: [
      {
        condition: 'Appraisal-genre workbook with developer-ops signals (timesheets, trade cost matrix, gross margin)',
        signals: ['developer-ops-dna', 'financial-tables'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Filename matches the client "Land Appraisal - <Project> V<n>" grammar',
        signals: ['filename-match-land-appraisal'],
        priority: 7,
        action: 'boost',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: ['financials.gdv', 'financials.totalDevelopmentCost', 'financials.constructionCost', 'financials.profitMargin', 'overview.unitCount'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },

  // ---------------------------------------------------------------------------
  // 2. RockCap Appraisal Model (pack §3.2 + §3.3 — one type, audience axis splits)
  // ---------------------------------------------------------------------------
  {
    id: 'rockcap-appraisal-model',
    fileType: 'RockCap Appraisal Model',
    category: 'Appraisals',
    filing: { targetFolder: 'Rockcap Appraisals', targetLevel: 'project' },
    targetFolderKey: 'rockcap_appraisals',
    producer: 'rockcap',
    audience: 'varies',
    filenameGrammar:
      '"<Project>_<Client>_RockCap_<II>_<II>_<[V]n.n>_<AUDIENCE>_<YYYYMMDD>" — the literal RockCap token in an underscore-delimited filename is by itself decisive. The V prefix appears only on EXTERNALs (INTERNALs use bare n.n) — weak but real. Tolerance: copy suffixes (" - 2").',
    versionSemantics:
      'INTERNALs iterate frequently (1.1 → 2.0 → 2.1 → 3.0) and are the source of truth; EXTERNALs exist only at issue points, cut same-day from the INTERNAL. Latest INTERNAL is operative internally; latest EXTERNAL is the operative outbound cut.',
    description:
      "RockCap's own debt-structured appraisal model built from the client's numbers — either the " +
      'INTERNAL macro-enabled .xlsm source-of-truth workbook (large, scenario machinery, VBA) or the ' +
      'EXTERNAL lender-facing .xlsx export (a ~3-tab, single-scenario, values-flavoured cut with a ' +
      'lender-branded dashboard). Both file to Rockcap Appraisals whatever the audience. The genre carries ' +
      'debt-structuring DNA: a "Lender Dashboard - <lender>" tab with Project View / Lender View panes, ' +
      'LTGDV / LTC / Lender IRR / Lender Money Multiple / Peak Drawn Loan / SONIA vocabulary, an Input ' +
      'Checks + Result Checks audit panel ("Fully Funded?", "Cashflow Signs Test" → OK), Working Cells / ' +
      'Input Cells keys, Bridge/Senior Dev/Stabilisation/Term facility columns, an Active Scenario cell, ' +
      'monthly drawdown/repayment cashflow with per-stakeholder IRRs, and the rockcap.uk URL. Profit is ' +
      'quoted as Profit on Cost %. INTERNAL .xlsm files may be unparseable — classify on mime + size + ' +
      'filename tokens (extraction failure is itself a soft signal).',
    identificationRules: [
      'PRIMARY: tab named "Lender Dashboard - <lender>" with split Project View / Lender View panes and a rockcap.uk URL cell',
      'PRIMARY: debt-metric vocabulary — LTGDV, LTC, Lender IRR, Lender Money Multiple, Peak Drawn Loan, margin floating over SONIA, Arrangement/Broker/Exit fees',
      'CRITICAL: Checks framework — Input Checks + Result Checks ("Fully Funded?", "Profit Metrics Match", "Cashflow Signs Test", "Fully Optimised?" → OK)',
      'Working Cells / Input Cells key + Bridge / Senior Dev / Stabilisation / Term facility columns + "Active Scenario" cell',
      'Monthly debt cashflow with Drawdowns/Repayments, per-stakeholder Money Multiple & IRR, mezz/equity waterfall',
      'Profit quoted as Profit on Cost % (not Gross Margin)',
      'Template placeholders may survive: "Insert Devleoper Logo Here" (sic), "Enter Development Address Here"',
      'The literal "RockCap" token in an underscore-delimited filename is by itself decisive',
      'INTERNAL variant: mime application/vnd.ms-excel.sheet.macroenabled.12, ~10MB+, INTERNAL filename token; extraction failure is a soft signal',
      'EXTERNAL variant: .xlsx around 30KB–1.2MB, exactly ~3 tabs (Lender Dashboard / Appraisal / Cashflow), single active scenario',
    ],
    disambiguation: [
      'vs Client Land Appraisal: developer-ops DNA vs debt-structuring DNA (the decisive rule). Shared numbers (land cost, build cost, unit count) do NOT distinguish — RockCap imports the client\'s totals verbatim.',
      'INTERNAL vs EXTERNAL (audience axis, not a different type): extension + size (>10x gap) + version-token style; never observed reversed. Both file to rockcap_appraisals.',
      'vs Lender Pack byte-copy: content-identical; the master lives in Rockcap Appraisals, the pack copy is a send artifact (dedup by createdTime cluster + createdTime > modifiedTime). The embedded lender name in the dashboard tab tells you who it was built FOR even in the master copy.',
      'vs legacy internal models in Notes: those use pre-convention space-delimited DDMMYYYY-prefixed names.',
    ],
    terminology: {
      'LTGDV': 'Loan to Gross Development Value — core RockCap lending metric',
      'Lender IRR': 'The lender\'s internal rate of return on the modelled facility',
      'Peak Drawn Loan': 'Maximum simultaneous facility exposure across the cashflow',
      'Active Scenario': 'The scenario cell selecting which case the single-scenario EXTERNAL cut shows',
      'Profit on Cost %': 'RockCap\'s profit metric (profit over total cost) — a rockcap-producer tell vs the client\'s Gross Margin %',
    },
    tags: [
      { namespace: 'type', value: 'rockcap-appraisal-model', weight: 1.5 },
      { namespace: 'type', value: 'appraisal-model', weight: 1.2 },
      { namespace: 'domain', value: 'property-finance', weight: 1.2 },
      { namespace: 'signal', value: 'debt-structuring-dna', weight: 1.5 },
      { namespace: 'signal', value: 'financial-tables', weight: 1.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      'lender dashboard', 'LTGDV', 'LTC', 'lender IRR', 'money multiple', 'peak drawn loan',
      'SONIA', 'arrangement fee', 'exit fee', 'input checks', 'result checks', 'fully funded',
      'working cells', 'input cells', 'active scenario', 'drawdown', 'profit on cost',
      'rockcap', 'senior dev', 'stabilisation',
    ],
    filenamePatterns: ['_RockCap_', '_INTERNAL_', '_EXTERNAL_'],
    excludePatterns: ['land.?appraisal\\s*-', 'timesheet'],
    decisionRules: [
      {
        condition: 'Appraisal-genre workbook with debt-structuring signals (Lender Dashboard, LTGDV, Checks panel)',
        signals: ['debt-structuring-dna', 'financial-tables'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Filename carries the RockCap producer token',
        signals: ['filename-match-rockcap'],
        priority: 8,
        action: 'require',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: ['financials.gdv', 'financials.loanAmount', 'financials.ltv', 'financials.ltc', 'financials.totalDevelopmentCost'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },

  // ---------------------------------------------------------------------------
  // 3. Lender Brief Note (pack §3.4)
  // ---------------------------------------------------------------------------
  {
    id: 'lender-brief-note',
    fileType: 'Lender Brief Note',
    category: 'Communications',
    filing: { targetFolder: 'Notes', targetLevel: 'project' },
    targetFolderKey: 'notes',
    producer: 'rockcap',
    audience: 'external',
    filenameGrammar:
      '"<Project>_LenderBrief_Note_<II>_<AUDIENCE>_V<maj.min>_<YYYYMMDD>" — "Note" as explicit genre token, dot-versioning. TRAP: filing copies can carry INTERNAL in the filename while the body name-stamp reads EXTERNAL — they are filing copies of the external brief, not distinct internal documents.',
    versionSemantics:
      'Version bumps = fact corrections + structure refinement with sections unchanged. The latest version stamped with a send date is operative. The pack send copy may be edited minutes after copy-in (final external polish).',
    description:
      "RockCap's ~1-page outbound deal memo pitching the financing opportunity to prospective lenders, " +
      'in the RockCap "Note" house template. The subject line literally begins "Lender Brief:" and the ' +
      'body opens "RockCap is pleased to present a residential development opportunity…" — pitch voice, ' +
      'sender RockCap, recipient a lender. It is lender-agnostic (briefs precede lender selection — no ' +
      'lender named anywhere) with labelled ask fields ("Borrower Entity:", "Funding Requirement: …") and ' +
      'a numbered section skeleton (Executive Summary → Project Background & JV Structure → Planning & ' +
      'Operational Status → Technical Intelligence & Timeline). The first body line embeds its own version ' +
      'string (the name-stamp). The final EXTERNAL copy is an operator-curated Lender Pack artifact ' +
      '(never auto-file there); INTERNAL-tokened filing copies live in Notes — audience is EXTERNAL by ' +
      'content even for those (body stamp wins).',
    identificationRules: [
      'PRIMARY: subject line literally begins "Lender Brief:"',
      'PRIMARY: opening "RockCap is pleased to present …" — promotional pitch voice, sender RockCap, recipient a lender',
      'CRITICAL: "Relationship Manager:" preamble field + numbered 4-section skeleton (Executive Summary → Project Background & JV Structure → Planning & Operational Status → Technical Intelligence & Timeline)',
      'Labelled ask fields: "Borrower Entity:", "Funding Requirement: …"',
      'First body line embeds its own version string as a name-stamp (e.g. Note_AL_EXTERNAL_V2.0_20260306)',
      'Lender-agnostic — no lender named anywhere (briefs precede lender selection)',
      'No docx header/footer parts — plain exported note, not a branded template',
    ],
    disambiguation: [
      'vs Initial Call Note: the brief is document-anchored ("Lender Brief:" subject), promotional, with no action items or citations; a call note is event-anchored with [User Note, cite: N] markers and Strategic Actions assigned to initials.',
      'vs genuinely internal notes: internal docs name candidate lenders side-by-side, assign actions to initials, and expose client sensitivities. The brief does none of these.',
      'Audience call: body name-stamp + register over filename token — an "_INTERNAL_" filename whose body stamp and register read EXTERNAL is a filing copy of the external brief.',
    ],
    terminology: {
      'Note template': 'RockCap house template: body name-stamp + Subject/Date/Relationship Manager + numbered sections',
      'Name-stamp': 'The document\'s own filename-format version string repeated as the first body line — it beats the filename on audience',
      'Lender Pack': 'Operator-curated outbound snapshot the final EXTERNAL brief is copied into at send time — never an auto-classification target',
    },
    tags: [
      { namespace: 'type', value: 'lender-brief-note', weight: 1.5 },
      { namespace: 'domain', value: 'property-finance', weight: 1.0 },
      { namespace: 'signal', value: 'note-template', weight: 1.3 },
      { namespace: 'signal', value: 'pitch-voice', weight: 1.2 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      'lender brief', 'rockcap is pleased to present', 'relationship manager', 'borrower entity',
      'funding requirement', 'executive summary', 'JV structure', 'note', 'outbound memo',
      'development opportunity',
    ],
    filenamePatterns: ['lender.?brief', '_Note_'],
    excludePatterns: ['initial.?call', 'meeting', 'minutes'],
    decisionRules: [
      {
        condition: 'RockCap Note-template document with "Lender Brief:" subject and pitch voice',
        signals: ['note-template', 'pitch-voice'],
        priority: 9,
        action: 'require',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'chat'],
    expectedFields: ['financials.loanAmount', 'overview.projectName', 'overview.unitCount'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },

  // ---------------------------------------------------------------------------
  // 4. Initial Call Note (pack §3.5)
  // ---------------------------------------------------------------------------
  {
    id: 'initial-call-note',
    fileType: 'Initial Call Note',
    category: 'Communications',
    filing: { targetFolder: 'Notes', targetLevel: 'project' },
    targetFolderKey: 'notes',
    producer: 'rockcap',
    audience: 'internal',
    filenameGrammar:
      '"<Project>_<Event:InitialCall>_Note_<II>_INTERNAL_V<maj.min>_<YYYYMMDD>" — an event token replaces the docType token in the Note grammar.',
    versionSemantics:
      'Event-anchored, single date, typically V1.0 only. A call note is a point-in-time record, not a living document — it may contain early/stale facts later superseded.',
    description:
      "RockCap's internal, machine-assisted record of a client call at deal origination, in the Note " +
      'house template, with cited provenance and owner-assigned actions. The decisive marker is ' +
      '"[User Note, cite: N]" citation artifacts on nearly every line, plus a "Strategic Actions" section ' +
      'assigning tasks to initials ("Lender Outreach (AL)", "Modeling (RS)") and a "Filing:" instruction. ' +
      'Multiple candidate lenders are named for the same need — pre-selection strategy talk that never ' +
      'appears in external documents — alongside client-sensitive candour.',
    identificationRules: [
      'PRIMARY: "[User Note, cite: N]" citation artifacts on nearly every line — decisive marker of an internal machine-assisted call/meeting note',
      'PRIMARY: "Strategic Actions" section assigning tasks to initials, plus a "Filing:" instruction',
      'CRITICAL: multiple candidate lenders named for the same need — pre-selection talk, never in external docs',
      'Client-sensitive candour (client cash-flow constraints, decoded workbook quirks)',
      'Shared Note-template skeleton: body name-stamp + Subject/Date/Relationship Manager + numbered sections',
      'Event token (InitialCall) in the filename where other Note docs carry a docType token',
    ],
    disambiguation: [
      'vs Lender Brief Note: both share the Note house template — discriminate on the event token, citations, actions, and multi-lender strategy talk vs sell-side prose.',
      'vs Meeting Minutes: the Initial Call Note is RockCap\'s origination-stage template with cite markers and Strategic Actions; generic minutes lack the name-stamp + citation apparatus.',
    ],
    terminology: {
      '[User Note, cite: N]': 'Provenance citation artifact from machine-assisted note capture — internal-only',
      'Strategic Actions': 'Action list assigning next steps to owner initials',
      'Relationship Manager': 'The RockCap owner of the client relationship, a preamble field in the Note template',
    },
    tags: [
      { namespace: 'type', value: 'initial-call-note', weight: 1.5 },
      { namespace: 'type', value: 'call-note', weight: 1.3 },
      { namespace: 'signal', value: 'note-template', weight: 1.2 },
      { namespace: 'signal', value: 'cite-markers', weight: 1.5 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      'initial call', 'call note', 'user note', 'cite', 'strategic actions', 'filing',
      'relationship manager', 'lender outreach', 'origination', 'client call',
    ],
    filenamePatterns: ['initial.?call', '_Note_.*INTERNAL'],
    excludePatterns: ['lender.?brief'],
    decisionRules: [
      {
        condition: 'Note-template document with citation markers and Strategic Actions',
        signals: ['note-template', 'cite-markers'],
        priority: 9,
        action: 'require',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'chat', 'meeting'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },

  // ---------------------------------------------------------------------------
  // 5. Lender Comparison Sheet (pack §3.8)
  // ---------------------------------------------------------------------------
  {
    id: 'lender-comparison-sheet',
    fileType: 'Lender Comparison Sheet',
    category: 'Loan Terms',
    filing: { targetFolder: 'Terms Analysis', targetLevel: 'project' },
    targetFolderKey: 'terms_analysis',
    producer: 'rockcap',
    audience: 'varies',
    filenameGrammar:
      '"<Project>_LenderComparison_<II>[_<II>]_<AUDIENCE>_V<maj.min>_<YYYYMMDD>". Initials accrete as reviewers join (RS → RS_AL). INTERNAL = .xlsm working model; EXTERNAL = .xlsx client cut.',
    versionSemantics:
      'The INTERNAL .xlsm is the source of truth; EXTERNAL cuts are progressively sanitised exports (each cut removes more workings — a 4-sheet 1.2MB V1.1 can become a 1-sheet 31KB V1.2). Numbers may be recalculated between cuts. Latest EXTERNAL is the client-operative deliverable.',
    description:
      "RockCap's like-for-like multi-lender comparison workbook — scheme constants held fixed while " +
      'lender pricing varies, run through the model. Three or more named lenders are arrayed as COLUMNS ' +
      'against identical criteria (Margin / Arrangement Fee / Exit Fee / Gross Loan / Term), with the ' +
      'scheme constants (Total Fundable Cost, Unlevered Profit) identical in every lender column — the ' +
      '"like-for-like" tell that this is a comparison, not an appraisal. Cross-reference language such as ' +
      '"Senior Debt - Outputs (to check against term sheet)" and a "Total Cost of Debt (incl fees)" ' +
      'ranking row that differs by lender complete the fingerprint. Placeholder lender columns can contain ' +
      'template junk (absurd IRRs, #NUM! rows) — not data.',
    identificationRules: [
      'PRIMARY: ≥3 named lenders arrayed against identical criteria as columns, with per-lender Margin / Arrangement Fee / Exit Fee / Gross Loan / Term',
      'PRIMARY: scheme constants held fixed across the lender axis (identical Total Fundable Cost / Unlevered Profit in every lender column) — the like-for-like tell',
      'CRITICAL: a "Total Cost of Debt (incl fees)" ranking row that differs by lender',
      'Fee-vocabulary cluster: Arrangement Fee, Exit Fee, Broker Fee, Non-Utilisation Fee, Monitoring £/month, PG %, benchmark rates (BoE Base + floor, SVR)',
      'Cross-reference language: "Senior Debt - Outputs (to check against term sheet)"',
      'Sheet named "Lender Comparison Sheet"; placeholder "Lender 7"–"Lender 10" columns with template junk (#NUM!, absurd IRRs) — parser hazard, not data',
    ],
    disambiguation: [
      'TRAP — vs appraisals (folder 1): an EXTERNAL comparison cut can embed full Appraisal/Cashflow sheets; the multi-lender comparison sheet TRUMPS embedded appraisal sheets. Do not demote to modelling/appraisal folders.',
      'vs Lender Indicative Terms (folder 2): RockCap-produced and multi-lender vs lender-authored and single-lender. The moment two-plus lenders appear side-by-side it is terms ANALYSIS.',
      'vs Lender Comparison Table (triage): the sheet is modelled like-for-like (fixed scheme constants, modelled IRR/proceeds rows); the triage table is a raw transcription grid, transposed (lenders as ROWS).',
    ],
    terminology: {
      'Like-for-like': 'Scheme constants held fixed while only lender pricing varies — the comparison methodology',
      'Total Cost of Debt': 'All-in facility cost including fees — the ranking metric across lenders',
      'Non-Utilisation Fee': 'Fee on undrawn committed facility amounts',
    },
    tags: [
      { namespace: 'type', value: 'lender-comparison-sheet', weight: 1.5 },
      { namespace: 'type', value: 'lender-comparison', weight: 1.3 },
      { namespace: 'domain', value: 'property-finance', weight: 1.2 },
      { namespace: 'signal', value: 'multi-lender-grid', weight: 1.5 },
      { namespace: 'signal', value: 'financial-tables', weight: 1.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      'lender comparison', 'comparison sheet', 'margin', 'arrangement fee', 'exit fee',
      'gross loan', 'total cost of debt', 'like for like', 'term sheet check', 'benchmark',
      'non-utilisation fee', 'monitoring fee', 'PG',
    ],
    filenamePatterns: ['lender.?comparison(?!.?table)'],
    excludePatterns: [],
    decisionRules: [
      {
        condition: 'Workbook arrays multiple named lenders against identical criteria with fixed scheme constants',
        signals: ['multi-lender-grid', 'financial-tables'],
        priority: 9,
        action: 'require',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: ['financials.loanAmount', 'financials.ltv'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },

  // ---------------------------------------------------------------------------
  // 6. Lender Comparison Table — triage (pack §3.9)
  // ---------------------------------------------------------------------------
  {
    id: 'lender-comparison-table',
    fileType: 'Lender Comparison Table',
    category: 'Loan Terms',
    filing: { targetFolder: 'Terms Analysis', targetLevel: 'project' },
    targetFolderKey: 'terms_analysis',
    producer: 'rockcap',
    audience: 'internal',
    filenameGrammar:
      'Bare "<Project>_<DocType>" — no initials, no AUDIENCE, no version, no date. Pre-dates the naming convention; un-versioned + bare DocType is itself the "early scratch triage" tell.',
    versionSemantics:
      'One-off snapshot superseded by the modelled LenderComparison V-series; retained as pre-negotiation evidence (early figures prove later concession narratives).',
    description:
      'The early scratch grid transcribing incoming term sheets RAW, before terms are run through the ' +
      'model like-for-like. TRANSPOSED vs the modelled comparison workbooks — lenders as ROWS, criteria as ' +
      'columns (Facility, Net Facility, Gross Loan, Day 1 LTV, Peak LTGDV, LTC, Margin % PA, Benchmark, ' +
      'Arr/Exit Fee % & £, Est. Gross Interest, Total Cost, Term, PG). Carries an "IC Status" column with ' +
      'values like "Indicative" and lender status "Declined", a header block of scheme constants, and ' +
      'free-text raw transcription notes from the term sheets. Pre-negotiation figures differ from later ' +
      'modelled versions — that difference is evidence, not error.',
    identificationRules: [
      'PRIMARY: comparison grid TRANSPOSED — lenders as ROWS, criteria as columns',
      'PRIMARY: "IC Status" column with values like "Indicative" / "Declined"',
      'CRITICAL: raw term-sheet transcription flavour — free-text notes per lender (commitment fees, DD cost estimates), no modelled IRR/proceeds rows',
      'Header block of scheme constants (GDV, Total Dev Costs)',
      'Un-versioned bare "<Project>_<DocType>" filename — pre-convention scratch artifact',
    ],
    disambiguation: [
      'vs Lender Comparison Sheet (modelled): transposed axis, raw transcription flavour, no modelled like-for-like constants or IRR rows. Still terms_analysis: ≥2 lenders share the grid.',
      'vs Lender Indicative Terms: multi-lender and RockCap-transcribed vs single-lender in lender voice.',
    ],
    terminology: {
      'IC Status': 'Investment-committee status tracker per lender (Indicative / Declined …)',
      'Triage': 'The pre-model stage: transcribe every quote raw, decide which to model properly',
    },
    tags: [
      { namespace: 'type', value: 'lender-comparison-table', weight: 1.5 },
      { namespace: 'signal', value: 'multi-lender-grid', weight: 1.3 },
      { namespace: 'signal', value: 'raw-transcription', weight: 1.2 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      'lender comparison table', 'IC status', 'declined', 'indicative', 'day 1 LTV', 'peak LTGDV',
      'margin % pa', 'benchmark', 'est gross interest', 'total cost', 'triage',
    ],
    filenamePatterns: ['lender.?comparison.?table'],
    excludePatterns: [],
    decisionRules: [
      {
        condition: 'Transposed multi-lender grid with IC Status and raw transcription notes',
        signals: ['multi-lender-grid', 'raw-transcription'],
        priority: 8,
        action: 'require',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'chat'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },

  // ---------------------------------------------------------------------------
  // 7. Lender Analysis Note (pack §3.10)
  // ---------------------------------------------------------------------------
  {
    id: 'lender-analysis-note',
    fileType: 'Lender Analysis Note',
    category: 'Loan Terms',
    filing: { targetFolder: 'Terms Analysis', targetLevel: 'project' },
    targetFolderKey: 'terms_analysis',
    producer: 'rockcap',
    audience: 'external',
    filenameGrammar:
      '"<Project>_LenderAnalysis_RockCap_<MonthYear>" — deviates from the spreadsheet grammar: no initials, no AUDIENCE token, no V-number, month-year instead of YYYYMMDD. Strip non-semantic " (1)" browser-duplicate suffixes before parsing.',
    versionSemantics:
      'Month-year dated, typically a single version — the stage-3 terminal deliverable (the recommendation memo).',
    description:
      "RockCap's narrative analysis-and-recommendation memo to the client, comparing the canvassed " +
      'lender panel and recommending one. Title block reads "Indicative Lender Terms — Analysis & ' +
      'Recommendation — Prepared by RockCap Ltd | … | Confidential" with a running CONFIDENTIAL header. ' +
      'Body states that RockCap "has canvassed the development finance market on behalf of" the client, ' +
      'cross-references "the accompanying Excel workbook", presents a one-row-per-lender comparison table, ' +
      'gives candid "Lender-by-Lender Assessment" sections, and closes with a named recommendation ' +
      'including negotiated deltas and an ask to "review this note… and revert". Note: client-facing does ' +
      'NOT mean sanitised — this external doc carries full lender candour; candour is not the ' +
      'internal/external axis here.',
    identificationRules: [
      'PRIMARY: title block "…Analysis & Recommendation — Prepared by RockCap Ltd … Confidential" with running CONFIDENTIAL header',
      'PRIMARY: "RockCap has canvassed the development finance market on behalf of …" + cross-reference to "the accompanying Excel workbook"',
      'CRITICAL: named recommendation with negotiated deltas (fee cut, term extended) and advisory voice ("our recommendation", "we have negotiated")',
      'One-row-per-lender Indicative Terms Comparison table (Gross Facility / Term / Interest Rate / Arrangement / Exit / Guarantee / Est. Finance Cost)',
      '"Lender-by-Lender Assessment" sections with candid qualitative views',
      'Disclaimer "prepared by RockCap Ltd for the exclusive use of the named client… not authorised or regulated by the Financial Conduct Authority…"',
      'Human-authorship tells: sloppy heading edits mixing up lender names',
    ],
    disambiguation: [
      'vs Lender Comparison Sheet/Table: narrative docx vs numeric grid — same folder, different docType.',
      'vs Lender Indicative Terms: multi-lender + RockCap advisory voice vs single-lender in lender voice.',
      'Candour is not the audience axis: this is EXTERNAL (client-addressed, Confidential) despite full lender candour.',
    ],
    terminology: {
      'Canvassed panel': 'The set of lenders RockCap approached for indicative terms',
      'Negotiated delta': 'A term improved between the raw quote and the recommendation (e.g. exit fee cut)',
    },
    tags: [
      { namespace: 'type', value: 'lender-analysis-note', weight: 1.5 },
      { namespace: 'signal', value: 'multi-lender-narrative', weight: 1.4 },
      { namespace: 'signal', value: 'recommendation', weight: 1.2 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      'lender analysis', 'analysis and recommendation', 'canvassed', 'confidential',
      'prepared by rockcap', 'lender-by-lender assessment', 'recommendation', 'indicative terms comparison',
      'accompanying excel workbook', 'revert',
    ],
    filenamePatterns: ['lender.?analysis'],
    excludePatterns: ['comparison.?table'],
    decisionRules: [
      {
        condition: 'Narrative multi-lender assessment with a named recommendation in RockCap advisory voice',
        signals: ['multi-lender-narrative', 'recommendation'],
        priority: 9,
        action: 'require',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat'],
    expectedFields: ['financials.loanAmount', 'parties.broker'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },

  // ---------------------------------------------------------------------------
  // 8. Comparable Schedule / Appendix A (pack §3.12)
  // ---------------------------------------------------------------------------
  {
    id: 'comparable-schedule',
    fileType: 'Comparable Schedule',
    category: 'Project Documents',
    filing: { targetFolder: 'Comps / Appendix', targetLevel: 'project' },
    targetFolderKey: 'comps_appendix',
    producer: 'rockcap',
    audience: 'external',
    filenameGrammar:
      '"<Project>_AppendixA[_ComparableSchedule]_<II>_V<n>_<m>_<YYYYMMDD>" — underscore version style throughout the series; long-form doctype in early versions, dropped later. TRAP: version tokens are not a reliable ordering key across name variants — two files can share a version under different name-forms and dates; ORDER BY THE DATE TOKEN.',
    versionSemantics:
      'Across versions: tiers pruned/merged (gaps in tier numbers are a version tell — tier numbering survives deletion), notes rewritten from verification-forensics toward lender-facing advocacy. Header/columns invariant. Latest date-token version is operative.',
    description:
      "RockCap's lender-facing master schedule of comparable transaction evidence for OTHER properties, " +
      'tier-banded and source-cited, compiled to support the subject scheme\'s GDV. Rows are keyed by ' +
      'postal addresses of other properties/schemes with other developers named; a Date column carries ' +
      'historic sold dates or "ASKING" flags ("excluded from psf averages"); an Evidence Link / source ' +
      'column cites Rightmove URLs, "RM Street"/"RM Postcode" tags, Realyse, EPC. Tiers band the evidence ' +
      'by scheme/distance ("Tier 1: … | Direct new build comp" … "Tier 5: Local resale … | Within 1 ' +
      'mile"). The header self-declares "Appendix A: Master Comparable Schedule … Comparable evidence for ' +
      'lender credit pack … Prepared by RockCap Ltd". Notes advocate, comparing each comp to the subject ' +
      'in third person.',
    identificationRules: [
      'PRIMARY: rows keyed by postal addresses / house names of OTHER properties, with other developers named',
      'PRIMARY: Date column with historic sold dates and/or "ASKING" flags with exclusion rules',
      'CRITICAL: Evidence Link / source column (Rightmove house-prices URLs, typed source tags "RM Street"/"RM Postcode"/"RM Area", Realyse, EPC, Land Registry)',
      'Tier banding by scheme/distance ("Tier 1: … Direct new build comp", "Tier 5: Local resale … Within 1 mile")',
      'Self-declaring header "Appendix A: Master Comparable Schedule … Comparable evidence for lender credit pack … Prepared by RockCap Ltd"',
      'Notes written as advocacy comparing each comp TO the subject in third person',
      'Workings tail of raw URLs — scratch comps not yet promoted into a tier',
    ],
    disambiguation: [
      'R1 — Row identity (decisive on its own): rows keyed by postal addresses of other properties → Comparable Schedule; rows keyed by small sequential Plot integers with unit-type codes → Accommodation Schedule.',
      'R2 — Time direction: historic transaction dates / ASKING flags → Comparable Schedule; no date column, prices as targets/opinions → Accommodation Schedule.',
      'R3 — Grouping axis: tiers of external evidence ranked by comparability/distance, no scheme-total row → Comparable Schedule; tenure bands with subtotals summing to a scheme GDV → Accommodation Schedule.',
      'R4 — Evidence column: Evidence Link / source citations present → Comparable Schedule; Accommodation Schedules cite nothing.',
      'R5 — Narrative direction: notes compare the row\'s property TO the subject in third person ("Sits at the same price as the <subject> 3 bed…") → Comparable Schedule; first-person justification of our own unit\'s price → Accommodation Schedule. Rule of thumb: if the project name appears repeatedly INSIDE row notes, the rows are not the project\'s own units.',
      'vs agent pricing report: the agent\'s report is third-party letterhead evidence INPUT; the Comparable Schedule is RockCap\'s compiled OUTPUT.',
    ],
    terminology: {
      'Appendix A': 'The credit pack appendix letter — the folder/deliverable slot this schedule fills',
      'Tier banding': 'Comparables ranked by comparability: direct new-build comps down to local resale baseline',
      'ASKING': 'Listed-not-sold price flag — excluded from psf averages',
      'Evidence Link': 'Per-row source citation (Rightmove, Realyse, EPC, Land Registry)',
    },
    tags: [
      { namespace: 'type', value: 'comparable-schedule', weight: 1.5 },
      { namespace: 'type', value: 'appendix-a', weight: 1.4 },
      { namespace: 'domain', value: 'property-finance', weight: 1.0 },
      { namespace: 'signal', value: 'address-keyed-rows', weight: 1.5 },
      { namespace: 'signal', value: 'evidence-links', weight: 1.3 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      'comparable schedule', 'appendix a', 'master comparable schedule', 'comparable evidence',
      'lender credit pack', 'tier 1', 'rightmove', 'realyse', 'EPC', 'asking', 'sold price',
      'psf', 'land registry', 'evidence link',
    ],
    filenamePatterns: ['appendix.?a', 'comparable.?schedule'],
    excludePatterns: ['accommodation.?schedule'],
    decisionRules: [
      {
        condition: 'Address-keyed evidence schedule with source citations and tier banding',
        signals: ['address-keyed-rows', 'evidence-links'],
        priority: 9,
        action: 'require',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: ['valuation.comparables'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },

  // ---------------------------------------------------------------------------
  // 9. Planning Permission Decision Notice (pack §3.14)
  // ---------------------------------------------------------------------------
  {
    id: 'planning-permission-decision-notice',
    fileType: 'Planning Permission Decision Notice',
    category: 'Professional Reports',
    filing: { targetFolder: 'Modelling Info and Terms Request', targetLevel: 'project' },
    targetFolderKey: 'modelling_info',
    producer: 'statutory_authority',
    audience: 'neutral',
    filenameGrammar:
      'RockCap-tidied legacy names: project abbreviation + full doc-type phrase + decision date in drifting formats (D-M-YYYY, D-M-YY, DD.MM.YYYY). No initials/version/audience tokens — statutory docs don\'t get them. Filename heterogeneity marks documents COLLECTED, not produced.',
    versionSemantics:
      'None — a dated statutory record; permanence is the point. Related later decisions (reserved matters, S106 variations) reference it rather than superseding it.',
    description:
      "The Local Planning Authority's statutory decision notice granting (outline) planning permission, " +
      'with conditions and reasons. The operative clause "HEREBY PERMITS the development described below ' +
      'subject to the conditions stated" under a "TOWN AND COUNTRY PLANNING ACT, 1990" header citation is ' +
      'decisive, alongside a planning reference matching S.\\d{2}/\\d+ patterns, an Applicant/Agent/Dated ' +
      'field block, and numbered Conditions followed by mirrored numbered Reasons. "Reserved matters" ' +
      'language marks an OUTLINE permission specifically. Dates may far predate the engagement — planning ' +
      'evidence is collected, not produced, at modelling stage.',
    identificationRules: [
      'PRIMARY: operative clause "HEREBY PERMITS the development described below subject to the conditions stated"',
      'PRIMARY: "TOWN AND COUNTRY PLANNING ACT, 1990" header citation',
      'CRITICAL: planning reference pattern like S.03/146 + Applicant/Agent/Dated field block',
      'Numbered Conditions followed by mirrored numbered Reasons',
      '"Reserved matters" token — outline-specific (distinguishes from full/detailed permission)',
      'Appeal-rights NOTES citing s.78/s.91/s.92 TCPA 1990',
      'Council letterhead with Our Ref/Your Ref pairs',
    ],
    disambiguation: [
      'vs full/detailed or reserved-matters permission: outline says "outline application" and defers "reserved matters"; a REM decision cites the parent outline reference.',
      'vs S106 decision: "HEREBY PERMITS" vs "HEREBY AGREES TO DISCHARGE" — different operative clauses.',
      'vs planning correspondence: a form document with Conditions/Reasons vs a Dear/Yours sincerely letter.',
    ],
    terminology: {
      'Outline permission': 'Permission in principle with reserved matters (details) to be approved later',
      'Reserved matters': 'Details (appearance, landscaping, layout, scale) deferred from an outline permission',
      'TCPA 1990': 'Town and Country Planning Act 1990 — the governing statute',
      'LPA': 'Local Planning Authority',
    },
    tags: [
      { namespace: 'type', value: 'planning-permission-decision-notice', weight: 1.5 },
      { namespace: 'type', value: 'planning-permission', weight: 1.3 },
      { namespace: 'domain', value: 'planning', weight: 1.2 },
      { namespace: 'signal', value: 'statutory-clauses', weight: 1.5 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      'hereby permits', 'town and country planning act', 'planning permission', 'outline planning',
      'reserved matters', 'conditions', 'reasons', 'decision notice', 'local planning authority',
      'appeal', 'planning reference',
    ],
    filenamePatterns: ['planning.?permission', 'decision.?notice', 'outline.?planning'],
    excludePatterns: ['s106', 'commencement'],
    decisionRules: [
      {
        condition: 'Statutory decision form with HEREBY PERMITS clause and Conditions/Reasons',
        signals: ['statutory-clauses'],
        priority: 9,
        action: 'require',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: ['planning.applicationRef', 'planning.status', 'planning.conditions', 'location.localAuthority'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },

  // ---------------------------------------------------------------------------
  // 10. S106 Discharge / Variation (pack §3.15)
  // ---------------------------------------------------------------------------
  {
    id: 's106-discharge-variation',
    fileType: 'S106 Discharge/Variation',
    category: 'Professional Reports',
    filing: { targetFolder: 'Modelling Info and Terms Request', targetLevel: 'project' },
    targetFolderKey: 'modelling_info',
    producer: 'statutory_authority',
    audience: 'neutral',
    filenameGrammar:
      'RockCap-tidied legacy shorthand (e.g. "<Proj> S106 Change <D-M-YYYY>") — informal doc-type phrase + drifting date formats, no convention tokens.',
    versionSemantics: 'None — a dated statutory record.',
    description:
      "The council's statutory decision varying or discharging a Section 106 planning obligation. " +
      'Decisive signals: citation of "The Town and Country Planning (Modification and Discharge of ' +
      'Planning Obligations) Regulations 1992", the operative clause "HEREBY AGREES TO DISCHARGE the ' +
      'Section 106 Agreement", a planning reference suffix in the /106R obligation-modification class, ' +
      'and NPPF planning-obligation tests quoted as grounds. Often deal-material at modelling stage (e.g. ' +
      'an occupancy-restriction removal unlocking open-market sales).',
    identificationRules: [
      'PRIMARY: "The Town and Country Planning (Modification and Discharge of Planning Obligations) Regulations 1992" citation',
      'PRIMARY: operative clause "HEREBY AGREES TO DISCHARGE the Section 106 Agreement"',
      'CRITICAL: "Section 106" / "S106 Agreement" title token + planning ref suffix "…/106R"',
      'NPPF planning-obligation tests (paras 204–205) quoted as grounds',
      'Substantive variation described (e.g. removal of an occupancy-restriction clause)',
    ],
    disambiguation: [
      'vs the original S106 deed: a deed is a long legal agreement with parties/recitals/covenants and solicitor execution blocks; this is the council\'s short DECISION varying it.',
      'vs planning permission: different operative clause ("HEREBY AGREES TO DISCHARGE" vs "HEREBY PERMITS") and different regulations.',
    ],
    terminology: {
      'S106': 'Section 106 TCPA 1990 planning obligation (affordable housing, contributions)',
      '/106R': 'Planning reference class for obligation modification/discharge applications',
      'NPPF': 'National Planning Policy Framework — its obligation tests ground discharge decisions',
    },
    tags: [
      { namespace: 'type', value: 's106-discharge-variation', weight: 1.5 },
      { namespace: 'type', value: 's106', weight: 1.3 },
      { namespace: 'domain', value: 'planning', weight: 1.2 },
      { namespace: 'signal', value: 'statutory-clauses', weight: 1.4 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      's106', 'section 106', 'discharge', 'variation', 'planning obligation', 'hereby agrees to discharge',
      'modification and discharge', 'NPPF', 'affordable housing', '106R',
    ],
    filenamePatterns: ['s.?106'],
    excludePatterns: ['planning.?permission', 'deed'],
    decisionRules: [
      {
        condition: 'Council decision discharging/varying a Section 106 obligation',
        signals: ['statutory-clauses', 's106-reference'],
        priority: 9,
        action: 'require',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: ['planning.s106Details', 'planning.applicationRef'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },

  // ---------------------------------------------------------------------------
  // 11. Commencement Confirmation Letter (pack §3.16)
  // ---------------------------------------------------------------------------
  {
    id: 'commencement-confirmation-letter',
    fileType: 'Commencement Confirmation Letter',
    category: 'Professional Reports',
    filing: { targetFolder: 'Modelling Info and Terms Request', targetLevel: 'project' },
    targetFolderKey: 'modelling_info',
    producer: 'statutory_authority',
    audience: 'external',
    filenameGrammar:
      'Tidied legacy name: full project name + descriptive doc type + short date (possibly two-digit year — expect date-format drift within tidied legacy names).',
    versionSemantics: 'None — dated correspondence record.',
    description:
      'Local Planning Authority officer correspondence confirming that works constitute lawful ' +
      'COMMENCEMENT of the approved development, keeping the planning permission EXTANT — a key ' +
      'underwriting fact at modelling stage. The defining payload is language like "constitutes a ' +
      'commencement of the overall approved development" and "the planning permissions will remain ' +
      'extant", in letter form (Dear/Yours sincerely from a planning officer) on council letterhead with ' +
      'an Our Ref/Your Ref planning-reference pair, cross-referencing the parent permission.',
    identificationRules: [
      'PRIMARY: "constitutes a commencement of the overall approved development" + "the planning permissions will remain extant"',
      'PRIMARY: council letterhead + Our Ref/Your Ref planning reference pair',
      'CRITICAL: letter apparatus (Dear/Yours sincerely) from a planning officer — NOT a decision form',
      'Cross-reference to the parent outline permission ("pursuant to outline permission …")',
      'May mention S106 payment triggers (e.g. affordable-housing contribution)',
    ],
    disambiguation: [
      'vs decision notices: letter format, no HEREBY clause, no Conditions/Reasons blocks.',
      'vs CIL/Building Control commencement notices: those are developer-served forms; this is the LPA CONFIRMING lawful commencement.',
      'vs generic planning correspondence: the extant-permission confirmation is the classifiable payload.',
    ],
    terminology: {
      'Extant': 'Still legally alive — a permission kept in force by lawful commencement',
      'Commencement': 'The start of works sufficient to implement a planning permission',
      'Our Ref/Your Ref': 'Paired council/agent planning references on LPA correspondence',
    },
    tags: [
      { namespace: 'type', value: 'commencement-confirmation-letter', weight: 1.5 },
      { namespace: 'domain', value: 'planning', weight: 1.2 },
      { namespace: 'signal', value: 'lpa-letter', weight: 1.3 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      'commencement', 'extant', 'lawful commencement', 'planning permission', 'principal planning officer',
      'our ref', 'your ref', 'pursuant to outline permission',
    ],
    filenamePatterns: ['commencement'],
    excludePatterns: ['CIL', 'building.?control'],
    decisionRules: [
      {
        condition: 'LPA letter confirming lawful commencement keeping the permission extant',
        signals: ['lpa-letter', 'commencement-language'],
        priority: 8,
        action: 'require',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'chat', 'checklist'],
    expectedFields: ['planning.applicationRef', 'planning.status'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },

  // ---------------------------------------------------------------------------
  // 12. Agent Pricing Report / Pricing Exercise (pack §3.17)
  // ---------------------------------------------------------------------------
  {
    id: 'agent-pricing-report',
    fileType: 'Agent Pricing Report',
    category: 'Professional Reports',
    filing: { targetFolder: 'Modelling Info and Terms Request', targetLevel: 'project' },
    targetFolderKey: 'modelling_info',
    producer: 'third_party_professional',
    audience: 'external',
    filenameGrammar:
      'Issuer-prefixed tidied names: "<Issuer initials> <DocType> - <Project> <DD.MM.YYYY>" for reports; plain "<Issuer> <DocType>.png" for screenshots (no project/date tokens at all). Date-format drift across sibling files. TRAP: the filename may say "Valuation" when the body is a pricing exercise — the body disclaimer wins.',
    versionSemantics:
      'Refreshed opinions over time at different price levels — versioned INPUTS to the model; each is a dated snapshot, the latest informs current modelling.',
    description:
      "An estate agent's sales-pricing opinion for the scheme — expressly NOT a valuation — in either " +
      'narrative letter-proposal form or standalone schedule form. Decisive signals: a literal "PRICING ' +
      'EXERCISE" / "Pricing proposal for…" heading and the disclaimer "does not constitute a valuation or ' +
      'appraisal and must not be construed or relied upon as such" + "produced in the course of, or in ' +
      'contemplation of, our estate agency role, as an informal document". Carries a Housetype/No./Sq ' +
      'ft/Guide price/£PSF schedule with Private vs Affordable split, agency-firm boilerplate (LLP ' +
      'registration footer, reference codes), and — critically — NO RICS/Red Book/Market Value language ' +
      'anywhere.',
    identificationRules: [
      'PRIMARY: literal heading "PRICING EXERCISE" / "Pricing proposal for…"',
      'PRIMARY: disclaimer "does not constitute a valuation or appraisal and must not be construed or relied upon as such"',
      'CRITICAL: "produced in the course of, or in contemplation of, our estate agency role, as an informal document"',
      'Housetype/No./Sq ft/Guide price/£PSF tabular schema with Private vs Affordable split (Marketing Price vs Net Price)',
      'Agency-firm boilerplate: LLP registration footer, firm reference pattern',
      'Numbered agency-proposal section sequence (credentials → site → market → development → comparables → pricing → conclusion)',
      '"GENERAL ASSUMPTIONS" numbered block',
      'NO RICS / Red Book / Market Value language anywhere',
    ],
    disambiguation: [
      'THE RED BOOK RULE (highest-risk confusion at modelling stage): a formal RICS Red Book Valuation cites "RICS Valuation – Global Standards", names an MRICS/FRICS valuer, states Market Value with a valuation date, and is addressed for reliance. A pricing exercise DISCLAIMS exactly that. Decide on presence/absence of RICS Red Book / "Market Value" / valuer-reliance language — the text-body disclaimer outranks filename tokens (a file named "Valuation" can be a pricing exercise).',
      'Schedule-only exercise vs narrative letter proposal: table + "Important Notice" vs salutation + numbered sections — both are this type.',
      'vs marketing brochure: addressed privately to one client with net pricing, not public marketing.',
      'vs Comparable Schedule: the agent report is third-party evidence INPUT (agent identity); the Comparable Schedule is RockCap\'s compiled OUTPUT (RockCap identity).',
    ],
    terminology: {
      'Pricing exercise': 'An agent\'s informal sales-pricing opinion — expressly not a valuation',
      'Guide price': 'Suggested asking price per unit in the agent schedule',
      '£PSF': 'Price per square foot — the pricing normalisation metric',
      'Red Book': 'RICS Valuation – Global Standards; its ABSENCE is what marks a pricing exercise',
    },
    tags: [
      { namespace: 'type', value: 'agent-pricing-report', weight: 1.5 },
      { namespace: 'type', value: 'pricing-exercise', weight: 1.4 },
      { namespace: 'domain', value: 'property-finance', weight: 1.0 },
      { namespace: 'signal', value: 'not-a-valuation-disclaimer', weight: 1.5 },
      { namespace: 'signal', value: 'pricing-schedule', weight: 1.2 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      'pricing exercise', 'pricing proposal', 'does not constitute a valuation', 'estate agency role',
      'guide price', 'psf', 'marketing price', 'net price', 'general assumptions', 'knight frank',
      'informal document', 'private and affordable',
    ],
    filenamePatterns: ['pricing.?report', 'pricing.?exercise', 'KF\\s'],
    excludePatterns: ['red.?book', 'rics.?valuation'],
    decisionRules: [
      {
        condition: 'Agent pricing schedule/letter with an explicit not-a-valuation disclaimer',
        signals: ['not-a-valuation-disclaimer', 'pricing-schedule'],
        priority: 9,
        action: 'require',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: ['financials.gdv', 'valuation.comparables', 'overview.unitCount'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },

  // ---------------------------------------------------------------------------
  // 13. Architect Drawing Pack / Site Plan Markup (pack §3.13)
  // ---------------------------------------------------------------------------
  {
    id: 'architect-drawing-pack',
    fileType: 'Architect Drawing Pack',
    category: 'Plans',
    filing: { targetFolder: 'Modelling Info and Terms Request', targetLevel: 'project' },
    targetFolderKey: 'modelling_info',
    producer: 'third_party_professional',
    audience: 'varies',
    filenameGrammar:
      '"<JobNo> <Project> <YYYYMMDD> [<II> <doc type>]" — space-separated, LEADING BARE NUMERIC JOB NUMBER (the architect\'s drawing-register number), no doctype/version/audience tokens. Completely different grammar from the RockCap convention. Tolerance: URL-encoded artifacts (%20 → _20) and doubled ".pdf.pdf" extensions on re-downloads.',
    versionSemantics:
      'Issue-date based; revisions tracked in the drawing pack\'s own revision tables, not filenames. A "Mark up" + initials + recent date marks a working annotated copy. The same bytes can serve two lifecycle roles (comps evidence and credit-submission attachment) — classify by content identity; folder gives lifecycle context only.',
    description:
      'Third-party architect drawing sets and annotated site plans — CAD-derived PDFs describing the ' +
      'physical scheme (site layout, unit sketch plans), sometimes marked up by a consultant. Extracted ' +
      'text is fragmentary labels only, with no sentence structure: plot numbers, housetype-plot codes, ' +
      '"PUBLIC FOOTPATH", room labels. Drawing-register apparatus is decisive: architect title blocks, ' +
      'drawing numbers (job-number prefixed like 4868-008), scales ("1:500 @A1"), revision tables, status ' +
      'stamps ("Sketch / CONCEPT ISSUE / DRAFT FOR COMMENT"), "IF IN DOUBT, ASK." Extraction may be ' +
      'garbled by symbol-font substitution — itself a CAD-PDF tell.',
    identificationRules: [
      'PRIMARY: extracted text is fragmentary labels only — no sentence structure (plot numbers, housetype codes, "PUBLIC FOOTPATH", room labels BED 01/KITCHEN)',
      'PRIMARY: drawing-register apparatus — architect title blocks, drawing numbers with job-number prefix, scales "1:500 @A1", revision tables, "IF IN DOUBT, ASK."',
      'CRITICAL: a leading bare numeric filename token is a third-party JOB NUMBER (the architect\'s register), never a valuer\'s reference',
      '"ACCOMODATION SCHEDULE:" legend (sic) with areas in m² and NO pricing — a drawing legend, not the spreadsheet class',
      'High proportion of all-caps short tokens and digits, no verbs — the low-text drawing profile',
      'Garbled extraction via symbol-font substitution is a CAD-PDF tell',
    ],
    disambiguation: [
      'THE JOB-NUMBER TRAP: files with a leading bare number were repeatedly mis-guessed as "formal valuation report, job no. NNNN" — the content is architect drawings. Never read a leading bare number as a valuer\'s reference.',
      'Third-wheel guard vs the two schedule classes: the phrase "ACCOMMODATION SCHEDULE" also appears as a legend inside drawing packs (unit mix in m², no pricing, drawing-number title blocks). A PDF with CAD/title-block features and areas in m² is a design drawing, not either spreadsheet.',
      'vs agent pricing schedules: shares housetype letters and plot counts but has no prices / sq ft price tables.',
      'Internal drawing inconsistencies (address variants, unit-letter typos) are normal for drawings — not classification signals.',
    ],
    terminology: {
      'Drawing register': 'The architect\'s numbered index of drawings (job number + sheet number + revision)',
      'Title block': 'The CAD sheet\'s corner block: firm, drawing number, scale, revision, status',
      'Concept issue': 'Drawing status stamp — pre-planning working issue',
      'Markup': 'An annotated working copy (initials + date) for the current re-appraisal',
    },
    tags: [
      { namespace: 'type', value: 'architect-drawing-pack', weight: 1.5 },
      { namespace: 'type', value: 'site-plan-markup', weight: 1.2 },
      { namespace: 'domain', value: 'construction', weight: 1.0 },
      { namespace: 'signal', value: 'low-text-drawing-profile', weight: 1.4 },
      { namespace: 'signal', value: 'drawing-register', weight: 1.4 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      'architect', 'drawing pack', 'site plan', 'sketch', 'concept issue', 'draft for comment',
      'if in doubt ask', 'revision', 'scale', 'title block', 'markup', 'plot', 'm²',
    ],
    filenamePatterns: ['^\\d{3,5}\\s', 'mark.?up'],
    excludePatterns: ['accommodation.?schedule.*xls', 'pricing'],
    decisionRules: [
      {
        condition: 'Low-text CAD PDF with drawing-register apparatus',
        signals: ['low-text-drawing-profile', 'drawing-register'],
        priority: 9,
        action: 'require',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'chat', 'checklist'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },

  // ---------------------------------------------------------------------------
  // 14. Credit Checklist (pack §3.18)
  // ---------------------------------------------------------------------------
  {
    id: 'credit-checklist',
    fileType: 'Credit Checklist',
    category: 'Project Documents',
    filing: { targetFolder: 'Credit', targetLevel: 'project' },
    targetFolderKey: 'credit',
    producer: 'rockcap',
    audience: 'internal',
    filenameGrammar:
      '"<Project>_<LENDER>_CreditChecklist_<II>_V<maj>_<min>_<YYYYMMDD>" — the EMBEDDED LENDER TOKEN is the tell: credit docs are lender-specific, so the lender appears where client-stage docs have none. Underscore minor-version drift (V1_1 vs V1.1) is within house convention.',
    versionSemantics:
      'Successive versions are PURE STATUS MIGRATION — identical requirement set, statuses moving Outstanding → Now Provided, with appended dated "Update DD/MM/YYYY:" notes. Early versions read prospective ("To be confirmed…"), later ones evidential ("Confirmed by…"). Distinguish versions by status-column deltas, not structure. Latest is operative.',
    description:
      "RockCap's internal tracker of a specific lender's credit information requests, with tri-state " +
      'status and dated evidence provenance. The unique marker is the tri-state status vocabulary ' +
      '"In Lender Pack | Now Provided | Outstanding" with a legend, under an explicit "Lender: <name> / ' +
      'Broker: RockCap Ltd" header block. Requirement rows are phrased as lender asks ("Confirmation of ' +
      'borrowing entity", "HoTs for affordable sale — golden-brick or turn-key", "Comparables to support ' +
      'GDV"); a Notes column carries dated evidence-trail entries naming individuals on both sides ' +
      '("Confirmed by <RM> to <lender contact> DD/MM/YYYY"); section rows mirror a credit paper (CLIENT / ' +
      'SITE AND PLANNING / CONSTRUCTION / COMPLETED UNITS / SALES & MARKETING); and candid broker-side ' +
      'flags ("flag to <lender contact>") mark internal working language.',
    identificationRules: [
      'PRIMARY: tri-state status vocabulary "In Lender Pack | Now Provided | Outstanding" with a legend — unique to a credit information checklist',
      'PRIMARY: explicit "Lender: <name> / Broker: RockCap Ltd" header block',
      'CRITICAL: requirement rows phrased as lender asks ("Confirmation of borrowing entity", "HoTs for affordable sale — golden-brick or turn-key", "Comparables to support GDV")',
      'Notes column of dated evidence-trail entries naming individuals on both sides',
      'Section rows mirroring a credit paper: CLIENT / SITE AND PLANNING / CONSTRUCTION / COMPLETED UNITS / SALES & MARKETING',
      'Candid broker-side flags ("… flag to <lender contact>") — internal working language',
      'Signature vocabulary: guarantor confirmations, A&Ls, HoTs golden-brick/turn-key, pre-commencement conditions',
    ],
    disambiguation: [
      'vs generic DD/document checklist: a generic checklist lists document names with received/missing states; this lists LENDER-POSED credit questions with a lender-pack-aware tri-state status and per-item provenance. Presence of a named lender + "In Lender Pack" status is decisive.',
      'vs Notes-folder docs: Credit docs are single-named-lender and obligation-tracking; Notes docs are lender-plural or lender-agnostic and process-reflective.',
    ],
    terminology: {
      'In Lender Pack': 'Status: the requested item was already in the outbound pack sent to the lender',
      'Now Provided': 'Status: supplied since submission, with a dated confirmation note',
      'Golden brick': 'Affordable-housing sale structure (VAT-driven staged transfer) — credit-stage HoTs vocabulary',
      'A&Ls': 'Assets & Liabilities statements — guarantor credit evidence',
    },
    tags: [
      { namespace: 'type', value: 'credit-checklist', weight: 1.5 },
      { namespace: 'domain', value: 'property-finance', weight: 1.0 },
      { namespace: 'signal', value: 'tri-state-status', weight: 1.5 },
      { namespace: 'signal', value: 'lender-token', weight: 1.2 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
    ],
    keywords: [
      'credit checklist', 'in lender pack', 'now provided', 'outstanding', 'lender', 'broker',
      'borrowing entity', 'golden brick', 'turn-key', 'pre-commencement conditions', 'guarantor',
      'A&L', 'comparables to support GDV',
    ],
    filenamePatterns: ['credit.?checklist'],
    excludePatterns: ['dd.?checklist'],
    decisionRules: [
      {
        condition: 'Lender-specific tracker with In Lender Pack / Now Provided / Outstanding statuses',
        signals: ['tri-state-status', 'lender-token'],
        priority: 9,
        action: 'require',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'chat', 'checklist'],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-07-07',
  },
];
