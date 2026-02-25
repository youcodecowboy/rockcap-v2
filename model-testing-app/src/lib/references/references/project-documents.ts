// =============================================================================
// PROJECT DOCUMENTS — DOCUMENT REFERENCES
// =============================================================================
// Rich reference data for the Project Documents category:
//   - Accommodation Schedule (unit mix, sizes, values)
//   - Build Programme (construction timeline/Gantt)
//   - Specification (technical construction spec)
//   - Tender (contractor bid/pricing)
//   - CGI/Renders (computer-generated marketing visuals)

import type { DocumentReference } from '../types';

export const PROJECT_DOCUMENT_REFERENCES: DocumentReference[] = [
  // ---------------------------------------------------------------------------
  // 1. ACCOMMODATION SCHEDULE
  // ---------------------------------------------------------------------------
  {
    id: 'accommodation-schedule',
    fileType: 'Accommodation Schedule',
    category: 'Project Documents',
    filing: {
      targetFolder: 'Project Documents',
      targetLevel: 'project',
    },

    description:
      'An Accommodation Schedule is a tabular document that provides a complete breakdown of all ' +
      'units within a residential or mixed-use development scheme. It is one of the most fundamental ' +
      'project documents in UK development finance, as it defines the unit mix that underpins the ' +
      'Gross Development Value (GDV) calculation and the lender\'s security assessment. The schedule ' +
      'typically lists every individual unit — flats, houses, duplexes, or commercial units — with ' +
      'columns for unit number or plot number, unit type (1-bed flat, 2-bed house, 3-bed duplex, etc.), ' +
      'floor level, net internal area (NIA) in square feet and/or square metres, and the anticipated ' +
      'sale price or rental value. Aggregated rows show the total number of units by type, the overall ' +
      'unit mix percentage, average price per square foot, and the total GDV for each unit type and ' +
      'for the scheme as a whole. For RockCap\'s lending purposes, the accommodation schedule is ' +
      'cross-referenced against the RedBook Valuation to ensure consistency between the valuer\'s ' +
      'adopted GDV and the borrower\'s sales assumptions. The schedule also feeds into the development ' +
      'appraisal and cashflow models. Changes to the accommodation schedule — such as re-planning units ' +
      'to increase the number of smaller flats or swapping houses for apartments — can materially affect ' +
      'both the GDV and the build cost, making it a document that is carefully monitored throughout the ' +
      'loan term. The schedule is commonly prepared by the architect, the borrower\'s development manager, ' +
      'or the selling agent, and may be presented as a standalone spreadsheet, a table within the ' +
      'planning application, or an appendix to the valuation or appraisal. In affordable housing ' +
      'schemes, the schedule will also distinguish between private sale, shared ownership, and ' +
      'affordable rent units, with separate pricing columns for each tenure type.',

    identificationRules: [
      'PRIMARY: Tabular format listing individual units with columns for unit number/plot, type, size (sqft/sqm), and price/value.',
      'PRIMARY: Contains a unit mix summary showing the count and proportion of each unit type (1-bed, 2-bed, 3-bed, etc.).',
      'CRITICAL: Presence of both unit sizes (NIA in sqft or sqm) and individual unit values/prices in a structured table.',
      'Shows total GDV or aggregate sales value calculated from individual unit prices.',
      'Includes floor level or block designation for each unit in a multi-storey scheme.',
      'Contains net internal area (NIA) measurements, possibly with gross internal area (GIA) for comparison.',
      'May distinguish between tenure types: private sale, shared ownership, affordable rent, or commercial.',
      'Includes average price per square foot or per square metre calculations.',
      'Often includes plot numbers or unit identifiers that correspond to floor plans or site layouts.',
      'May be prepared by architect, selling agent, or borrower\'s development team.',
      'Presented as a spreadsheet, table, or appendix — not a graphical layout or floor plan.',
      'Contains summary/total rows aggregating unit counts, areas, and values by type.',
    ],

    disambiguation: [
      'This is an Accommodation Schedule, NOT a Floor Plan — the accommodation schedule is a data table listing units, sizes, and values, whereas a floor plan is a graphical architectural drawing showing spatial layouts.',
      'This is an Accommodation Schedule, NOT a Development Appraisal — while both reference GDV, the accommodation schedule is a unit-level table of sizes and prices, not a full cost-and-revenue financial model.',
      'This is an Accommodation Schedule, NOT a Sales/Reservation Schedule — a sales schedule tracks buyer reservations, exchange dates, and completion status, whereas the accommodation schedule defines the planned unit mix and target pricing.',
      'This is an Accommodation Schedule, NOT a Specification — the schedule describes what units exist and their sizes/values, not the materials or finishes used in construction.',
    ],

    terminology: {
      'Unit Mix': 'The breakdown of different unit types (e.g., 1-bed flats, 2-bed houses) within a development scheme, expressed as counts and percentages.',
      'NIA': 'Net Internal Area — the usable floor area of a unit measured to the internal face of perimeter walls, excluding common areas and structure.',
      'GIA': 'Gross Internal Area — the total floor area measured to the internal face of external walls, including lobbies and plant rooms.',
      'GDV': 'Gross Development Value — the total anticipated sales revenue from all units in the completed scheme.',
      'Plot Number': 'A unique identifier assigned to each house or unit within the development, often corresponding to the site layout plan.',
      'Affordable Housing': 'Units provided below market rate under planning obligations, typically split into shared ownership and affordable rent tenures.',
      'Shared Ownership': 'A tenure type where the buyer purchases a percentage share (typically 25-75%) and pays rent on the remainder.',
      'Price Per Square Foot': 'The unit sale price divided by the NIA, used as a benchmark for value comparison across units and competing schemes.',
      'Tenure Split': 'The proportion of units designated as private sale versus affordable (shared ownership, affordable rent, social rent).',
    },

    tags: [
      { namespace: 'type', value: 'accommodation-schedule', weight: 3.0 },
      { namespace: 'signal', value: 'unit-mix-table', weight: 2.5 },
      { namespace: 'signal', value: 'unit-sizes-and-values', weight: 2.2 },
      { namespace: 'signal', value: 'gdv-breakdown-by-unit', weight: 2.0 },
      { namespace: 'signal', value: 'plot-number-listing', weight: 1.5 },
      { namespace: 'signal', value: 'nia-measurements', weight: 1.5 },
      { namespace: 'domain', value: 'property-finance', weight: 1.5 },
      { namespace: 'domain', value: 'development-planning', weight: 1.8 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'summarization', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'extraction', weight: 1.0 },
      { namespace: 'context', value: 'chat', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'unit-mix+sizes+values', weight: 2.5 },
    ],

    keywords: [
      'accommodation schedule', 'unit mix', 'unit schedule', 'plot schedule',
      'unit type', '1-bed', '2-bed', '3-bed', 'flat', 'apartment', 'house',
      'duplex', 'net internal area', 'NIA', 'gross internal area', 'GIA',
      'square feet', 'square metres', 'sqft', 'sqm', 'price per sqft',
      'GDV', 'gross development value', 'unit value', 'sales value',
      'affordable housing', 'shared ownership', 'private sale', 'tenure split',
      'plot number',
    ],

    filenamePatterns: [
      'accomm(odation)?[_\\s-]?sched',
      'unit[_\\s-]?mix',
      'unit[_\\s-]?sched',
      'plot[_\\s-]?sched',
      'schedule[_\\s-]?of[_\\s-]?accomm',
      'accommodation[_\\s-]?table',
      'unit[_\\s-]?breakdown',
    ],

    excludePatterns: [
      'floor[_\\s-]?plan',
      'site[_\\s-]?plan',
      'layout[_\\s-]?plan',
      'sales[_\\s-]?reservation',
      'reservation[_\\s-]?schedule',
      'appraisal',
      'cashflow',
      'specification',
    ],

    decisionRules: [
      {
        condition: 'Document contains a tabular listing of units with sizes (sqft/sqm) and individual values/prices',
        signals: ['unit-mix-table', 'unit-sizes-and-values', 'gdv-breakdown-by-unit'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'Unit mix summary showing count and percentage breakdown by type (1-bed, 2-bed, etc.)',
        signals: ['unit-mix-table', 'unit-type-breakdown'],
        priority: 9,
        action: 'boost',
      },
      {
        condition: 'NIA or GIA measurements listed alongside plot/unit numbers',
        signals: ['nia-measurements', 'plot-number-listing'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Tenure split between private and affordable units is documented',
        signals: ['tenure-split', 'affordable-housing-breakdown'],
        priority: 6,
        action: 'include',
      },
      {
        condition: 'Price per square foot analysis or average values by unit type',
        signals: ['price-per-sqft', 'unit-value-analysis'],
        priority: 5,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'overview.unitCount',
      'overview.unitMix',
      'financials.gdv',
      'overview.totalArea',
      'overview.averagePricePerSqft',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 2. BUILD PROGRAMME
  // ---------------------------------------------------------------------------
  {
    id: 'build-programme',
    fileType: 'Build Programme',
    category: 'Project Documents',
    filing: {
      targetFolder: 'Project Documents',
      targetLevel: 'project',
    },

    description:
      'A Build Programme is a construction timeline document that maps out the sequencing, duration, ' +
      'and interdependencies of all work activities required to deliver a development from site start ' +
      'through to practical completion. In UK development finance, it is most commonly presented as a ' +
      'Gantt chart — a horizontal bar chart where each task (enabling works, foundations, superstructure, ' +
      'roofing, M&E first fix, plastering, second fix, external works, etc.) is represented as a bar ' +
      'spanning its planned start and finish dates. The programme establishes the critical path: the ' +
      'longest sequence of dependent activities that determines the minimum overall project duration. ' +
      'Any delay to a critical-path activity directly extends the completion date. Build programmes are ' +
      'typically prepared by the main contractor or the project manager using software such as Microsoft ' +
      'Project, Primavera P6, or Asta Powerproject, and may range from a simple single-page summary ' +
      'programme to a detailed multi-page document with hundreds of linked activities. For RockCap\'s ' +
      'lending, the build programme is a critical document because the loan term, interest reserve, ' +
      'and drawdown phasing are all calibrated to the projected construction duration. The programme ' +
      'is reviewed by the monitoring surveyor in the Initial Monitoring Report to assess whether the ' +
      'proposed timeline is realistic, and progress against the programme is tracked in every Interim ' +
      'Monitoring Report. Key milestones that the lender monitors include start on site, substructure ' +
      'completion, wind and watertight, first fix completion, practical completion, and the longstop ' +
      'date (the contractual backstop by which the project must be finished). The programme may also ' +
      'show phasing for multi-phase schemes — where blocks or plots are delivered sequentially — and ' +
      'include float (buffer time) on non-critical activities. Extensions of time (EOT) claims and ' +
      'programme revisions are tracked against the original baseline programme to quantify delay.',

    identificationRules: [
      'PRIMARY: Gantt chart format showing horizontal bars representing task durations across a timeline.',
      'PRIMARY: Lists construction activities/tasks (enabling works, substructure, superstructure, fit-out, external works) with start and finish dates.',
      'CRITICAL: Shows a critical path or identifies critical-path activities through the construction sequence.',
      'Contains key milestones: start on site, practical completion, handover, and possibly longstop date.',
      'May be produced in Microsoft Project, Primavera P6, Asta Powerproject, or similar scheduling software.',
      'Shows task dependencies and linked activities (finish-to-start, start-to-start relationships).',
      'Includes a timeline axis (weeks, months, or quarters) with calendar dates.',
      'May show float or slack on non-critical activities.',
      'For phased developments, shows separate timelines or overlapping phases for each block/phase.',
      'Often includes a summary bar or milestone diamond markers for key dates.',
      'May reference a baseline programme versus the current/revised programme.',
      'Does NOT contain financial figures, cost breakdowns, or monetary values as primary content.',
    ],

    disambiguation: [
      'This is a Build Programme, NOT a Cashflow — the build programme shows construction task durations and dependencies on a timeline, whereas a cashflow shows period-by-period financial projections with costs and drawdowns in monetary terms.',
      'This is a Build Programme, NOT a Development Appraisal — the programme is a timeline of construction activities, not a financial cost/revenue model.',
      'This is a Build Programme, NOT an Interim Monitoring Report — the programme is the planned timeline, whereas a monitoring report assesses actual progress against that plan.',
      'This is a Build Programme, NOT a Specification — the programme defines when activities happen, not how they are carried out or what materials are used.',
      'This is a Build Programme, NOT a Tender — the tender is a contractor\'s bid with pricing and methodology, whereas the programme is purely the time schedule for works.',
    ],

    terminology: {
      'Gantt Chart': 'A horizontal bar chart showing project activities plotted against time, the standard format for construction programmes.',
      'Critical Path': 'The longest sequence of dependent tasks through the programme that determines the minimum project duration — any delay to a critical-path task delays the whole project.',
      'Practical Completion': 'The contractual milestone when construction is substantially finished and the building is fit for occupation, triggering the defects liability period.',
      'Longstop Date': 'The contractual backstop date by which the project must be completed, beyond which the lender may take enforcement action.',
      'Float': 'The amount of time a non-critical activity can be delayed without affecting the overall programme completion date.',
      'Extension of Time (EOT)': 'A contractual mechanism allowing the contractor additional time to complete works due to qualifying delays (e.g., adverse weather, design changes).',
      'Wind and Watertight': 'The construction milestone when the building envelope (roof, walls, windows) is complete and the interior is protected from weather.',
      'First Fix': 'The installation of concealed building services (plumbing, electrical, heating) before plastering and decoration.',
      'Second Fix': 'The installation of visible fixtures and fittings (sockets, sanitaryware, kitchens) after plastering.',
      'Enabling Works': 'Preliminary activities such as demolition, site clearance, hoarding, and temporary services before main construction begins.',
      'Baseline Programme': 'The original agreed programme against which actual progress and any delays are measured.',
    },

    tags: [
      { namespace: 'type', value: 'build-programme', weight: 3.0 },
      { namespace: 'signal', value: 'gantt-chart', weight: 2.5 },
      { namespace: 'signal', value: 'construction-timeline', weight: 2.2 },
      { namespace: 'signal', value: 'critical-path-analysis', weight: 2.0 },
      { namespace: 'signal', value: 'milestone-markers', weight: 1.8 },
      { namespace: 'signal', value: 'task-dependencies', weight: 1.5 },
      { namespace: 'domain', value: 'property-finance', weight: 1.5 },
      { namespace: 'domain', value: 'construction-management', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'summarization', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'extraction', weight: 1.0 },
      { namespace: 'context', value: 'chat', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'gantt+milestones+critical-path', weight: 2.5 },
    ],

    keywords: [
      'build programme', 'construction programme', 'Gantt chart', 'Gantt',
      'critical path', 'practical completion', 'start on site', 'wind and watertight',
      'first fix', 'second fix', 'enabling works', 'substructure', 'superstructure',
      'external works', 'milestone', 'longstop date', 'extension of time', 'EOT',
      'float', 'baseline programme', 'task duration', 'programme schedule',
      'Microsoft Project', 'Primavera', 'Asta Powerproject', 'phasing',
    ],

    filenamePatterns: [
      'build[_\\s-]?programme',
      'construction[_\\s-]?programme',
      'programme[_\\s-]?schedule',
      'gantt',
      'project[_\\s-]?programme',
      'master[_\\s-]?programme',
      'works[_\\s-]?programme',
      'programme[_\\s-]?rev',
    ],

    excludePatterns: [
      'cashflow',
      'cash[_\\s-]?flow',
      'appraisal',
      'valuation',
      'monitoring[_\\s-]?report',
      'specification',
      'tender',
      'invoice',
      'cost[_\\s-]?plan',
    ],

    decisionRules: [
      {
        condition: 'Document is a Gantt chart or bar chart showing construction activities with start/finish dates',
        signals: ['gantt-chart', 'construction-timeline', 'task-dependencies'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'Critical path is identified or highlighted through the construction sequence',
        signals: ['critical-path-analysis', 'construction-timeline'],
        priority: 9,
        action: 'boost',
      },
      {
        condition: 'Key construction milestones are marked (practical completion, wind and watertight, etc.)',
        signals: ['milestone-markers', 'practical-completion-date'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Document is produced in scheduling software (MS Project, Primavera, Asta)',
        signals: ['ms-project-output', 'primavera-output', 'scheduling-software'],
        priority: 7,
        action: 'include',
      },
      {
        condition: 'Phased delivery programme showing sequential block or plot handovers',
        signals: ['phased-delivery', 'multi-phase-programme'],
        priority: 6,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'overview.startOnSiteDate',
      'overview.practicalCompletionDate',
      'overview.programmeDuration',
      'overview.keyMilestones',
      'overview.phases',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 3. SPECIFICATION
  // ---------------------------------------------------------------------------
  {
    id: 'specification',
    fileType: 'Specification',
    category: 'Project Documents',
    filing: {
      targetFolder: 'Project Documents',
      targetLevel: 'project',
    },

    description:
      'A Specification (commonly abbreviated to "spec") is a technical construction document that ' +
      'defines the materials, products, workmanship standards, and quality requirements for a ' +
      'development project. It is the definitive written instruction on how the building is to be ' +
      'constructed, complementing the architectural drawings which show what is to be built. In UK ' +
      'practice, specifications are often prepared in accordance with the National Building ' +
      'Specification (NBS) system — a nationally recognised framework that provides standard clauses ' +
      'organised by work sections (e.g., D20 Excavating and filling, E10 In-situ concrete, H60 ' +
      'Clay/concrete roof tiling, L10 Windows/rooflights, M60 Painting/clear finishing). Each section ' +
      'details the specific products to be used (including manufacturer, model, colour, and grade), ' +
      'the standards to be met (British Standards, Eurocodes, Building Regulations), and the methods ' +
      'of workmanship required. For residential developments, the specification will typically cover ' +
      'everything from the foundation type and structural frame through to internal finishes such as ' +
      'kitchen fittings, bathroom sanitaryware, flooring, and decoration. A separate or appended ' +
      'unit-by-unit specification may detail the variations between unit types — for example, different ' +
      'kitchen layouts for 1-bed versus 3-bed units, or upgraded finishes for penthouse apartments. ' +
      'For RockCap\'s lending, the specification is important because it directly affects the build ' +
      'cost, the quality and saleability of the finished product, and the achievable GDV. The monitoring ' +
      'surveyor reviews the specification to ensure the cost plan is consistent with the specified ' +
      'materials and finishes. Any value engineering or specification downgrades during construction ' +
      'are flagged as they may impact both cost savings and GDV. The specification is typically a ' +
      'multi-page document or series of documents prepared by the architect or employer\'s agent, and ' +
      'forms part of the contract documents issued to the main contractor under a JCT or similar ' +
      'building contract.',

    identificationRules: [
      'PRIMARY: Lists construction materials, products, and finishes with specific manufacturers, models, grades, or standards.',
      'PRIMARY: Organised by work sections or construction elements (foundations, structure, envelope, M&E, internal finishes).',
      'CRITICAL: References NBS (National Building Specification) work sections, British Standards (BS), Eurocodes, or Building Regulations as quality benchmarks.',
      'Contains detailed descriptions of workmanship requirements and installation methods.',
      'Specifies products by manufacturer name, product code, colour, finish, or performance grade.',
      'Covers multiple construction disciplines: structural, architectural, mechanical, electrical, and finishing.',
      'May include a unit-by-unit spec showing finish variations between different unit types or standard vs. premium units.',
      'References JCT contract terms, architect\'s instructions, or employer\'s requirements.',
      'Contains clauses on quality control, sampling, testing, and approval procedures.',
      'Typically a text-heavy document with numbered clauses, not primarily graphical or tabular.',
      'May include schedules of finishes listing room-by-room specifications for flooring, walls, and ceilings.',
    ],

    disambiguation: [
      'This is a Specification, NOT a Contract Sum Analysis (CSA) — the specification defines what materials and standards are required, whereas a CSA is a financial breakdown of how much each element costs.',
      'This is a Specification, NOT a Build Programme — the specification describes how the building is constructed (materials, methods), whereas the programme describes when activities occur (timeline).',
      'This is a Specification, NOT a Floor Plan or Drawing — the specification is a written text document describing materials and standards, not a graphical architectural drawing.',
      'This is a Specification, NOT a Tender — the tender is the contractor\'s bid and pricing response, whereas the specification is the employer\'s requirement for what must be built.',
      'This is a Specification, NOT an Accommodation Schedule — the accommodation schedule lists unit types, sizes, and values, whereas the specification details the materials and finishes in those units.',
    ],

    terminology: {
      'NBS': 'National Building Specification — the UK\'s standard system of specification clauses for construction, organised by work section codes.',
      'Work Section': 'A division of construction work by trade or element (e.g., E10 In-situ concrete, L10 Windows, M60 Painting) used in NBS-formatted specifications.',
      'British Standards (BS)': 'National standards published by BSI Group setting minimum quality, safety, and performance requirements for construction materials and methods.',
      'JCT': 'Joint Contracts Tribunal — the standard form building contract widely used in UK construction, to which the specification is appended.',
      'Value Engineering': 'The process of reviewing the specification to reduce cost without unacceptable loss of quality or function.',
      'Schedule of Finishes': 'A room-by-room or unit-by-unit table listing the specified floor, wall, and ceiling finishes.',
      'Employer\'s Requirements': 'The complete package of design and specification documents issued by the client under a design-and-build contract.',
      'Building Regulations': 'The statutory minimum standards for building design and construction in England and Wales, covering structure, fire safety, ventilation, energy, and accessibility.',
      'Prelims': 'Preliminary items in the specification covering site setup, management, temporary works, and general contract obligations.',
    },

    tags: [
      { namespace: 'type', value: 'specification', weight: 3.0 },
      { namespace: 'signal', value: 'material-specifications', weight: 2.5 },
      { namespace: 'signal', value: 'nbs-work-sections', weight: 2.2 },
      { namespace: 'signal', value: 'workmanship-requirements', weight: 2.0 },
      { namespace: 'signal', value: 'product-manufacturer-references', weight: 1.8 },
      { namespace: 'signal', value: 'british-standards-references', weight: 1.5 },
      { namespace: 'domain', value: 'property-finance', weight: 1.5 },
      { namespace: 'domain', value: 'construction-specification', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'summarization', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'extraction', weight: 1.0 },
      { namespace: 'context', value: 'chat', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'materials+standards+work-sections', weight: 2.5 },
    ],

    keywords: [
      'specification', 'spec', 'NBS', 'National Building Specification',
      'work section', 'British Standard', 'BS', 'Eurocode',
      'Building Regulations', 'materials', 'finishes', 'workmanship',
      'schedule of finishes', 'manufacturer', 'product code',
      'JCT', 'employer\'s requirements', 'value engineering',
      'kitchen specification', 'bathroom specification', 'sanitaryware',
      'flooring', 'internal finishes', 'external finishes', 'cladding',
    ],

    filenamePatterns: [
      'spec(ification)?',
      'technical[_\\s-]?spec',
      'construction[_\\s-]?spec',
      'nbs[_\\s-]?spec',
      'building[_\\s-]?spec',
      'employer.*requirements',
      'schedule[_\\s-]?of[_\\s-]?finishes',
      'finish(es)?[_\\s-]?schedule',
    ],

    excludePatterns: [
      'tender',
      'cost[_\\s-]?plan',
      'contract[_\\s-]?sum',
      'valuation',
      'appraisal',
      'programme',
      'gantt',
      'floor[_\\s-]?plan',
      'invoice',
    ],

    decisionRules: [
      {
        condition: 'Document lists construction materials with manufacturer names, product codes, and quality standards',
        signals: ['material-specifications', 'product-manufacturer-references', 'british-standards-references'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'Document is organised by NBS work sections or construction element headings',
        signals: ['nbs-work-sections', 'material-specifications'],
        priority: 9,
        action: 'boost',
      },
      {
        condition: 'Workmanship clauses and installation method statements are present',
        signals: ['workmanship-requirements', 'installation-methods'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Schedule of finishes listing room-by-room floor, wall, and ceiling finishes',
        signals: ['schedule-of-finishes', 'room-by-room-finishes'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'References to JCT contract, employer\'s requirements, or architect\'s instructions',
        signals: ['jct-contract-reference', 'employers-requirements'],
        priority: 5,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'overview.specificationStandard',
      'overview.keyMaterials',
      'overview.finishLevel',
      'overview.kitchenSpec',
      'overview.bathroomSpec',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 4. TENDER
  // ---------------------------------------------------------------------------
  {
    id: 'tender',
    fileType: 'Tender',
    category: 'Project Documents',
    filing: {
      targetFolder: 'Project Documents',
      targetLevel: 'project',
    },

    description:
      'A Tender is a formal bid or quotation submitted by a building contractor in response to an ' +
      'invitation to tender for the construction works on a development project. In UK development ' +
      'finance, the tender document is a core project document because it establishes the construction ' +
      'cost that underpins the development appraisal, the cashflow model, and ultimately the loan ' +
      'facility structure. The tender typically comprises a Form of Tender (the contractor\'s formal ' +
      'offer to carry out the works for a stated lump sum or on a measured basis), a priced Bill of ' +
      'Quantities (BoQ) or Schedule of Works showing the contractor\'s rates and prices for each ' +
      'element of the construction, a construction methodology statement describing how the works ' +
      'will be executed, a proposed programme for the works, and a schedule of qualifications or ' +
      'exclusions setting out what is and is not included in the price. The tender may also include ' +
      'the contractor\'s preliminary costs (site management, scaffolding, temporary works, welfare ' +
      'facilities), design fees if the contract is on a design-and-build basis, and a breakdown of ' +
      'specialist subcontractor packages. For RockCap, the tender is scrutinised to assess whether ' +
      'the total contract sum is realistic and competitive, whether the contractor\'s proposed ' +
      'programme aligns with the borrower\'s business plan, and whether there are qualifications or ' +
      'exclusions that create unfunded cost exposure. The monitoring surveyor typically reviews the ' +
      'tender as part of the Initial Monitoring Report to compare the contractor\'s pricing against ' +
      'industry benchmarks (BCIS cost data) and to identify any gaps between the tender allowance ' +
      'and the full development cost plan. In a competitive tender process, the borrower may receive ' +
      'multiple bids and present a tender analysis or comparison table showing the relative pricing ' +
      'and scope of each contractor\'s submission. The accepted tender forms the basis of the ' +
      'building contract — typically a JCT Standard Building Contract, JCT Design and Build Contract, ' +
      'or a bespoke form — and any subsequent variations or claims are measured against the original ' +
      'tender pricing.',

    identificationRules: [
      'PRIMARY: Contains a Form of Tender or contractor\'s formal offer stating a lump sum price or tendered amount for the construction works.',
      'PRIMARY: Includes a priced Bill of Quantities (BoQ) or Schedule of Works with itemised rates and prices.',
      'CRITICAL: Submitted by a building contractor in response to an invitation to tender — represents a bid for future works, not a bill for completed works.',
      'Contains a construction methodology or method statement describing how the contractor proposes to carry out the works.',
      'Includes a proposed programme or construction timeline submitted as part of the bid.',
      'Lists qualifications, exclusions, or assumptions that define the scope boundary of the tender.',
      'Breaks down preliminary costs (site setup, management, scaffolding, temporary works, welfare).',
      'May include subcontractor package prices or specialist trade quotations.',
      'References a JCT, NEC, or bespoke contract form under which the works will be carried out.',
      'May present a tender comparison or analysis table if multiple bids have been received.',
      'Contains a validity period stating how long the tender offer remains open for acceptance.',
      'Addresses the client/employer and references the project name, site address, and specification.',
    ],

    disambiguation: [
      'This is a Tender, NOT an Invoice or Application for Payment — the tender is a contractor\'s bid/quotation for future works, whereas an invoice is a bill for work already completed or goods delivered.',
      'This is a Tender, NOT a Development Appraisal — while both contain cost figures, the tender is a contractor\'s priced offer, whereas an appraisal is a financial viability model including GDV, profit, and land value.',
      'This is a Tender, NOT a Specification — the specification defines what materials and standards are required, whereas the tender is the contractor\'s response with pricing and methodology for delivering those requirements.',
      'This is a Tender, NOT a Contract Sum Analysis — the CSA is a post-contract cost breakdown used for interim valuations, whereas the tender is the pre-contract bid document.',
      'This is a Tender, NOT a Monitoring Report — monitoring reports assess actual construction progress, whereas the tender is a pre-construction commercial document.',
    ],

    terminology: {
      'Form of Tender': 'The formal document in which the contractor states their offer to carry out the works for a specified sum, signed by the contractor.',
      'Bill of Quantities (BoQ)': 'A detailed schedule listing every item of work with measured quantities and the contractor\'s unit rates, producing an itemised total price.',
      'Schedule of Works': 'An alternative to a BoQ used in smaller projects, describing work packages with lump-sum prices rather than measured quantities.',
      'Preliminaries': 'The contractor\'s costs for general site management, setup, scaffolding, temporary works, plant, and welfare facilities.',
      'Qualifications': 'Conditions, assumptions, or exclusions stated by the contractor that limit or modify their tender offer.',
      'BCIS': 'Building Cost Information Service — an RICS service providing construction cost data and benchmarks used to assess tender competitiveness.',
      'Design and Build': 'A procurement route where the contractor takes responsibility for both design and construction, typically priced against employer\'s requirements.',
      'Lump Sum Contract': 'A contract where the contractor agrees to complete the works for a single fixed price.',
      'Tender Validity': 'The period during which the contractor\'s offer remains open for acceptance by the employer.',
      'Tender Analysis': 'A comparison table evaluating multiple contractor bids on price, programme, qualifications, and scope.',
    },

    tags: [
      { namespace: 'type', value: 'tender', weight: 3.0 },
      { namespace: 'signal', value: 'contractor-bid-pricing', weight: 2.5 },
      { namespace: 'signal', value: 'bill-of-quantities', weight: 2.2 },
      { namespace: 'signal', value: 'form-of-tender', weight: 2.2 },
      { namespace: 'signal', value: 'construction-methodology', weight: 1.8 },
      { namespace: 'signal', value: 'tender-qualifications', weight: 1.5 },
      { namespace: 'domain', value: 'property-finance', weight: 1.5 },
      { namespace: 'domain', value: 'construction-procurement', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'summarization', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'extraction', weight: 1.0 },
      { namespace: 'context', value: 'chat', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'contractor-bid+pricing+methodology', weight: 2.5 },
    ],

    keywords: [
      'tender', 'bid', 'quotation', 'form of tender', 'tendered sum',
      'contract sum', 'Bill of Quantities', 'BoQ', 'Schedule of Works',
      'preliminaries', 'contractor', 'method statement', 'methodology',
      'qualifications', 'exclusions', 'lump sum', 'tender analysis',
      'tender comparison', 'design and build', 'JCT', 'NEC',
      'subcontractor packages', 'BCIS', 'tender validity',
      'invitation to tender', 'competitive tender',
    ],

    filenamePatterns: [
      'tender',
      'contractor[_\\s-]?bid',
      'tender[_\\s-]?return',
      'tender[_\\s-]?submission',
      'bill[_\\s-]?of[_\\s-]?quantities',
      'BoQ',
      'tender[_\\s-]?analysis',
      'tender[_\\s-]?comparison',
      'form[_\\s-]?of[_\\s-]?tender',
      'pricing[_\\s-]?document',
    ],

    excludePatterns: [
      'invoice',
      'payment[_\\s-]?certificate',
      'application[_\\s-]?for[_\\s-]?payment',
      'valuation[_\\s-]?report',
      'appraisal',
      'cashflow',
      'monitoring[_\\s-]?report',
      'specification',
      'receipt',
    ],

    decisionRules: [
      {
        condition: 'Document contains a Form of Tender or contractor\'s formal bid with a stated lump sum or tendered amount',
        signals: ['form-of-tender', 'contractor-bid-pricing', 'lump-sum-offer'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'Priced Bill of Quantities or Schedule of Works with itemised rates and totals',
        signals: ['bill-of-quantities', 'contractor-bid-pricing'],
        priority: 9,
        action: 'boost',
      },
      {
        condition: 'Construction methodology or method statement describing the proposed approach to works',
        signals: ['construction-methodology', 'method-statement'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Tender qualifications, exclusions, or assumptions limiting the scope of the offer',
        signals: ['tender-qualifications', 'scope-exclusions'],
        priority: 6,
        action: 'boost',
      },
      {
        condition: 'Tender comparison table evaluating multiple contractor submissions',
        signals: ['tender-analysis', 'multi-bid-comparison'],
        priority: 5,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'financials.contractSum',
      'financials.constructionCost',
      'overview.contractor',
      'overview.programmeDuration',
      'overview.qualifications',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 5. CGI/RENDERS
  // ---------------------------------------------------------------------------
  {
    id: 'cgi-renders',
    fileType: 'CGI/Renders',
    category: 'Project Documents',
    filing: {
      targetFolder: 'Project Documents',
      targetLevel: 'project',
    },

    description:
      'CGI/Renders (Computer Generated Images) are digitally produced visual representations showing ' +
      'how a proposed development will look upon completion. They are a standard deliverable in UK ' +
      'property development, used across planning applications, marketing campaigns, investor ' +
      'presentations, and lender due diligence packs. CGIs are created by specialist visualisation ' +
      'studios or architectural practices using 3D modelling software such as 3ds Max, SketchUp, ' +
      'Lumion, or Unreal Engine, and are rendered to photorealistic quality showing the proposed ' +
      'buildings in their context — including landscaping, street scenes, lighting conditions, and ' +
      'sometimes populated with people and vehicles to convey a sense of place and scale. A typical ' +
      'CGI package for a residential development will include exterior elevation renders from key ' +
      'viewpoints (street approach, aerial perspective, courtyard view), interior renders of show-flat ' +
      'quality kitchens, living spaces, and bathrooms, and contextual views showing how the scheme ' +
      'integrates with its surroundings. For RockCap\'s lending, CGIs serve several important functions. ' +
      'They provide the credit team with an immediate visual understanding of the product being funded — ' +
      'the design quality, density, and aesthetic character of the scheme. They are used in marketing ' +
      'materials and sales brochures that evidence the borrower\'s sales strategy and support the GDV ' +
      'assumptions in the valuation and appraisal. High-quality CGIs indicate that the borrower has ' +
      'invested in professional marketing preparation, which is a positive signal for pre-sales and ' +
      'scheme desirability. The CGIs should be consistent with the approved planning drawings and the ' +
      'specification — any significant deviation between the rendered images and the actual build scope ' +
      'may indicate specification changes or misleading marketing. CGIs are typically supplied as ' +
      'high-resolution image files (JPEG, PNG, TIFF) or within a PDF brochure, and may include both ' +
      'daytime and dusk/nighttime versions to showcase architectural lighting design.',

    identificationRules: [
      'PRIMARY: Photorealistic or artistic digital images showing a proposed building/development that does not yet exist.',
      'PRIMARY: Computer-generated exterior or interior views of a future development, clearly not photographs of a completed building.',
      'CRITICAL: Images show a development in its planned completed state — buildings, landscaping, and context that are proposed, not existing.',
      'May include captions such as "artist\'s impression", "computer generated image", "CGI", "visualisation", or "indicative only".',
      'Shows exterior elevation renders from key viewpoints (street level, aerial, courtyard).',
      'May include interior renders showing kitchens, living rooms, bathrooms, or bedrooms in show-flat quality.',
      'Rendered with contextual elements: landscaping, trees, people, vehicles, sky, and surrounding buildings.',
      'May include both daytime and dusk/nighttime versions with architectural lighting effects.',
      'Often incorporated into a marketing brochure, sales pack, or planning application document.',
      'Produced by a visualisation studio or architectural practice — may carry their branding or watermark.',
      'High-resolution image files (JPEG, PNG, TIFF) or embedded within a PDF document.',
      'Does NOT show real photographs of an existing building or construction site.',
    ],

    disambiguation: [
      'These are CGI/Renders, NOT Site Photographs — CGIs are computer-generated images of a proposed/future development, whereas site photographs are real photographs of an existing or under-construction site.',
      'These are CGI/Renders, NOT Floor Plans or Architectural Drawings — CGIs are photorealistic or artistic visual representations, not technical measured drawings with dimensions and annotations.',
      'These are CGI/Renders, NOT a Marketing Brochure — while CGIs are often included in brochures, the renders themselves are the images; a brochure is a broader document including text, pricing, specifications, and multiple images.',
      'These are CGI/Renders, NOT Planning Drawings — planning drawings are formal technical submissions to the local authority, whereas CGIs are illustrative images that may accompany the planning application but are not the statutory drawings.',
    ],

    terminology: {
      'CGI': 'Computer Generated Image — a digitally created visual representation of a building or space produced using 3D modelling and rendering software.',
      'Render': 'The process or output of generating a photorealistic image from a 3D model, applying materials, lighting, and environmental effects.',
      'Artist\'s Impression': 'A common disclaimer on CGIs indicating that the image is illustrative and the final development may differ in appearance.',
      'Visualisation': 'The broader discipline of creating visual representations of proposed developments, encompassing CGIs, animations, and virtual reality experiences.',
      'Elevation Render': 'A CGI showing the external face of a building from a specific viewpoint, typically front, side, or rear.',
      'Show Flat': 'A finished and furnished unit used for marketing purposes; interior CGIs often replicate show-flat quality styling.',
      'Streetscene': 'A CGI view showing how the development appears from street level in the context of surrounding buildings and landscaping.',
      'Massing Model': 'A simplified 3D representation showing the volume and scale of a proposed development, often used in early planning stages before detailed CGIs are produced.',
      'Verified View': 'A CGI overlaid onto a real photograph from a specific camera position, used in planning applications to demonstrate visual impact.',
    },

    tags: [
      { namespace: 'type', value: 'cgi-renders', weight: 3.0 },
      { namespace: 'signal', value: 'computer-generated-images', weight: 2.5 },
      { namespace: 'signal', value: 'artists-impression', weight: 2.2 },
      { namespace: 'signal', value: 'photorealistic-visualisation', weight: 2.0 },
      { namespace: 'signal', value: 'exterior-render', weight: 1.8 },
      { namespace: 'signal', value: 'interior-render', weight: 1.5 },
      { namespace: 'domain', value: 'property-finance', weight: 1.5 },
      { namespace: 'domain', value: 'property-marketing', weight: 1.8 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'summarization', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'extraction', weight: 1.0 },
      { namespace: 'context', value: 'chat', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'cgi+visualisation+proposed-development', weight: 2.5 },
    ],

    keywords: [
      'CGI', 'computer generated image', 'render', 'renders', '3D render',
      'artist\'s impression', 'visualisation', 'visualization',
      'exterior render', 'interior render', 'elevation render',
      'streetscene', 'aerial view', 'courtyard view',
      'show flat', 'marketing visual', 'sales brochure',
      'photorealistic', '3D model', 'verified view',
      'proposed development', 'indicative image', 'massing model',
      'daytime render', 'dusk render', 'nighttime render',
    ],

    filenamePatterns: [
      'cgi',
      'render',
      'visual(isation|ization)',
      'artist.*impression',
      '3d.*view',
      'exterior.*render',
      'interior.*render',
      'marketing.*image',
      'elevation.*render',
      'streetscene',
    ],

    excludePatterns: [
      'photograph',
      'photo',
      'site[_\\s-]?visit',
      'inspection',
      'progress[_\\s-]?photo',
      'floor[_\\s-]?plan',
      'planning[_\\s-]?drawing',
      'elevation[_\\s-]?drawing',
      'section[_\\s-]?drawing',
    ],

    decisionRules: [
      {
        condition: 'Document contains photorealistic digital images of a proposed/future development',
        signals: ['computer-generated-images', 'photorealistic-visualisation', 'proposed-development-view'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'Images labelled as "artist\'s impression", "CGI", "visualisation", or "indicative"',
        signals: ['artists-impression', 'cgi-label', 'indicative-disclaimer'],
        priority: 9,
        action: 'boost',
      },
      {
        condition: 'Exterior or interior renders showing completed building with landscaping and context',
        signals: ['exterior-render', 'interior-render', 'contextual-elements'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Produced by a visualisation studio or embedded in a marketing brochure',
        signals: ['visualisation-studio-branding', 'marketing-brochure-context'],
        priority: 6,
        action: 'include',
      },
      {
        condition: 'High-resolution image files (JPEG, PNG, TIFF) of proposed buildings',
        signals: ['image-file-format', 'proposed-development-view'],
        priority: 5,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'overview.renderType',
      'overview.viewpoints',
      'overview.visualisationStudio',
      'overview.projectName',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },
];
