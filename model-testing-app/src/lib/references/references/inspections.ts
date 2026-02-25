// =============================================================================
// INSPECTIONS — DOCUMENT REFERENCES
// =============================================================================
// Covers construction monitoring and inspection reports used in UK property
// development finance. These reports are central to the drawdown process,
// providing the lender with independent verification of construction progress
// and cost compliance before releasing further funds.

import type { DocumentReference } from '../types';

export const INSPECTION_REFERENCES: DocumentReference[] = [
  // ---------------------------------------------------------------------------
  // 1. Initial Monitoring Report
  // ---------------------------------------------------------------------------
  {
    id: 'initial-monitoring-report',
    fileType: 'Initial Monitoring Report',
    category: 'Inspections',

    filing: {
      targetFolder: 'Inspections',
      targetLevel: 'project',
    },

    description:
      'An Initial Monitoring Report (IMR) is the foundational pre-funding due diligence document ' +
      'produced before a development finance loan is advanced. Commissioned by the lender and ' +
      'prepared by a qualified monitoring surveyor (MS), quantity surveyor (QS), or project ' +
      'manager, the report provides an independent assessment of the proposed development\'s ' +
      'construction costs, build programme, and overall project viability. It is a one-time ' +
      'assessment carried out at project inception, typically as a condition precedent (CP) to ' +
      'first drawdown.\n\n' +
      'The IMR scrutinises the borrower\'s submitted cost plan, breaking it down by trade package ' +
      'and construction phase to verify that the total build cost is realistic and achievable ' +
      'within the proposed budget. The surveyor reviews the build programme, assessing whether the ' +
      'timeline is credible given the scope of works, planning conditions, and procurement ' +
      'strategy. The report comments on the professional team\'s competence, the main contractor\'s ' +
      'track record, and the adequacy of warranties, insurances, and collateral agreements in ' +
      'place.\n\n' +
      'A key deliverable within the IMR is a proposed drawdown schedule — a recommended phasing ' +
      'of loan releases aligned to construction milestones. This schedule becomes the benchmark ' +
      'against which all subsequent interim monitoring reports are measured. The surveyor also ' +
      'flags any risks or concerns that may affect delivery, such as ground conditions, party wall ' +
      'issues, planning constraints, or gaps in the design information.\n\n' +
      'For the lender, the IMR is a critical risk management tool. It confirms that the proposed ' +
      'development can be delivered for the stated cost within the stated timeframe, and that the ' +
      'loan facility is appropriately structured. Without a satisfactory IMR, most UK development ' +
      'finance lenders will not release funds. The report is typically 15-40 pages and includes ' +
      'appendices with cost breakdowns, programme summaries, and site photographs.',

    identificationRules: [
      'PRIMARY: One-time pre-funding monitoring assessment — NOT a recurring monthly report',
      'PRIMARY: Contains a proposed drawdown schedule or recommended phasing of loan releases',
      'CRITICAL: Produced before construction lending begins, as a condition precedent to first drawdown',
      'Reviews and validates the borrower\'s total build cost plan and budget breakdown',
      'Assesses the proposed build programme and construction timeline for feasibility',
      'Comments on the professional team, main contractor capability, and procurement strategy',
      'Includes risk assessment of ground conditions, planning constraints, and design gaps',
      'References conditions precedent (CPs) or pre-advance requirements',
      'Contains site photographs from a pre-commencement or early-stage inspection',
      'Prepared by a monitoring surveyor, quantity surveyor, or project manager on behalf of the lender',
      'Typically 15-40 pages with cost breakdown appendices and programme summary',
      'Does NOT contain certified completion percentages or drawdown authorisation for ongoing works',
    ],

    disambiguation: [
      'This is an Initial Monitoring Report, NOT an Interim Monitoring Report. Initial reports are one-time pre-funding assessments; interim reports are recurring monthly progress updates during construction.',
      'Unlike interim reports, initial reports focus on validating the PROPOSED cost plan and build programme — they do not track work completed or recommend drawdown releases for ongoing construction.',
      'Do not confuse with a RedBook Valuation — the IMR assesses construction cost and deliverability, not market value or loan security.',
      'Do not confuse with a Project Appraisal or Credit Paper — those are internal lender documents, whereas the IMR is an independent third-party assessment.',
      'Distinguished from a building survey or condition report by its focus on development finance viability rather than existing building condition.',
    ],

    terminology: {
      'Monitoring Surveyor (MS)': 'Independent professional appointed by the lender to inspect and report on construction progress and costs',
      'Build Programme': 'The proposed construction schedule showing sequencing and duration of works from start to practical completion',
      'Drawdown Schedule': 'The recommended phasing of loan fund releases aligned to construction milestones',
      'Conditions Precedent (CPs)': 'Requirements that must be satisfied before a lender will advance funds',
      'Cost Plan': 'Detailed budget breakdown of all construction costs by trade package and phase',
      'Quantity Surveyor (QS)': 'Professional specialising in construction cost management and verification',
      'Procurement Strategy': 'The method by which the main contractor and subcontractors are engaged',
      'Collateral Warranties': 'Legal agreements providing the lender with direct rights against the professional team and contractors',
    },

    tags: [
      { namespace: 'type', value: 'initial-monitoring-report', weight: 1.0 },
      { namespace: 'domain', value: 'construction-monitoring', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.8 },
      { namespace: 'signal', value: 'pre-funding-assessment', weight: 0.95 },
      { namespace: 'signal', value: 'cost-plan-review', weight: 0.8 },
      { namespace: 'signal', value: 'build-programme-assessment', weight: 0.8 },
      { namespace: 'signal', value: 'drawdown-schedule-proposal', weight: 0.85 },
      { namespace: 'context', value: 'due-diligence', weight: 0.7 },
      { namespace: 'trigger', value: 'monitoring+pre-funding', weight: 0.9 },
    ],

    keywords: [
      'initial monitoring report',
      'pre-funding assessment',
      'monitoring surveyor',
      'build cost review',
      'cost plan assessment',
      'build programme review',
      'drawdown schedule',
      'conditions precedent',
      'project viability',
      'pre-advance',
      'first drawdown',
      'construction budget',
      'procurement strategy',
      'professional team review',
      'contractor assessment',
      'development monitoring',
      'collateral warranties',
      'ground conditions',
      'planning constraints',
      'party wall',
      'quantity surveyor',
      'QS report',
      'construction timeline',
      'pre-commencement',
    ],

    filenamePatterns: [
      'initial[_\\s-]?monitoring',
      'IMR[_\\s-]',
      'pre[_\\s-]?fund(ing)?[_\\s-]?monitor',
      'initial[_\\s-]?MS[_\\s-]?report',
      'monitoring[_\\s-]?report[_\\s-]?initial',
      'pre[_\\s-]?advance[_\\s-]?monitor',
    ],

    excludePatterns: [
      'interim[_\\s-]?monitoring',
      'monthly[_\\s-]?monitoring',
      'progress[_\\s-]?report[_\\s-]?\\d+',
      'drawdown[_\\s-]?\\d+',
      'report[_\\s-]?no\\.?\\s*\\d{2,}',
      'visit[_\\s-]?\\d+',
    ],

    decisionRules: [
      {
        condition: 'Document references pre-funding assessment or conditions precedent with monitoring scope',
        signals: ['pre-funding-assessment', 'conditions-precedent', 'monitoring-report'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document contains proposed drawdown schedule and cost plan validation',
        signals: ['drawdown-schedule-proposal', 'cost-plan-review'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Document is a monitoring report with no report number or visit number sequence',
        signals: ['monitoring-report', 'single-assessment'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document reviews build programme feasibility and construction timeline',
        signals: ['build-programme-assessment', 'timeline-review'],
        priority: 6,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'monitoringSurveyor',
      'inspectionDate',
      'projectAddress',
      'borrowerName',
      'totalBuildCost',
      'buildProgrammeDuration',
      'proposedDrawdownSchedule',
      'riskAssessment',
      'professionalTeamAssessment',
      'recommendations',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 2. Interim Monitoring Report
  // ---------------------------------------------------------------------------
  {
    id: 'interim-monitoring-report',
    fileType: 'Interim Monitoring Report',
    category: 'Inspections',

    filing: {
      targetFolder: 'Inspections',
      targetLevel: 'project',
    },

    description:
      'An Interim Monitoring Report is a recurring progress report produced monthly (or at each ' +
      'drawdown request) by the lender-appointed monitoring surveyor during the construction ' +
      'phase of a development finance loan. Its primary purpose is to independently verify the ' +
      'percentage of work completed on site, confirm that the borrower\'s drawdown request is ' +
      'supported by actual progress, and recommend whether the lender should release the next ' +
      'tranche of funding.\n\n' +
      'Each interim report follows a standardised structure that tracks cumulative progress ' +
      'against the cost plan and build programme established in the Initial Monitoring Report. ' +
      'The surveyor conducts a physical site inspection, recording the status of each trade ' +
      'package and work element. Progress is typically expressed as a certified completion ' +
      'percentage for the overall project and for individual cost headings. The report compares ' +
      'actual expenditure against the original budget, flagging any cost overruns, variations, or ' +
      'claims that could affect the total outturn cost.\n\n' +
      'A critical section of every interim report is the drawdown recommendation — the surveyor\'s ' +
      'professional opinion on the amount of funding that should be released based on verified ' +
      'progress. This recommendation considers retention, contingency, and any previously ' +
      'identified defects or incomplete work. The report also assesses programme compliance, ' +
      'noting any delays against the original build programme and their likely impact on the ' +
      'projected completion date.\n\n' +
      'Interim monitoring reports are sequentially numbered (Report No. 1, 2, 3, etc.) and form ' +
      'a continuous audit trail of the development from commencement through to practical ' +
      'completion. They are essential to the lender\'s ongoing risk management, providing early ' +
      'warning of problems such as contractor insolvency, design changes, or programme slippage. ' +
      'Reports are typically 8-20 pages with site photographs, cost tracking tables, and a ' +
      'drawdown recommendation summary.',

    identificationRules: [
      'PRIMARY: Recurring monthly or per-drawdown progress report — NOT a one-time pre-funding assessment',
      'PRIMARY: Contains a certified completion percentage for overall project or individual work packages',
      'CRITICAL: Includes a drawdown recommendation with a specific funding amount to be released',
      'Sequentially numbered (Report No. 1, 2, 3 or Visit No. 1, 2, 3)',
      'Tracks cumulative progress against the cost plan and build programme from the Initial Monitoring Report',
      'Contains a physical site inspection record with trade-by-trade status updates',
      'Includes cost tracking tables comparing actual expenditure against budget',
      'References retention, contingency deductions, or previously flagged defects',
      'Assesses programme compliance and notes any delays against the original build programme',
      'Contains site photographs documenting current construction progress',
      'Prepared by the lender-appointed monitoring surveyor during the active construction phase',
      'Reports on variations, claims, or cost overruns affecting the total outturn cost',
    ],

    disambiguation: [
      'This is an Interim Monitoring Report, NOT an Initial Monitoring Report. Interim reports are recurring monthly progress updates during construction; initial reports are one-time pre-funding assessments before construction starts.',
      'Unlike initial reports, interim reports focus on VERIFYING completed work and recommending specific drawdown amounts — they do not validate the original cost plan or build programme.',
      'Do not confuse with a contractor\'s application for payment — interim monitoring reports are independent lender assessments, not contractor payment claims.',
      'Do not confuse with a practical completion certificate — interim reports track ongoing progress; completion certificates confirm the project is finished.',
      'Distinguished from a snagging list or defects report by its broader scope covering cost, programme, and drawdown recommendations, not just defect identification.',
    ],

    terminology: {
      'Certified Completion Percentage': 'The independently verified proportion of total construction work completed to date',
      'Drawdown': 'A release of funds from the committed loan facility, authorised after monitoring verification',
      'Retention': 'A percentage of each payment withheld by the lender until defects liability period expires',
      'Outturn Cost': 'The projected final total cost of the development including all variations and claims',
      'Practical Completion': 'The stage at which construction is substantially finished and the building is fit for occupation',
      'Defects Liability Period': 'A contractual period (typically 6-12 months) after practical completion during which the contractor must rectify defects',
      'Variation': 'A change to the original scope of works that affects cost or programme',
      'Programme Slippage': 'Delay in the construction timeline compared to the agreed build programme',
      'Contingency': 'An allowance within the cost plan for unforeseen expenses',
    },

    tags: [
      { namespace: 'type', value: 'interim-monitoring-report', weight: 1.0 },
      { namespace: 'domain', value: 'construction-monitoring', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.8 },
      { namespace: 'signal', value: 'drawdown-recommendation', weight: 0.95 },
      { namespace: 'signal', value: 'certified-completion-percentage', weight: 0.9 },
      { namespace: 'signal', value: 'progress-inspection', weight: 0.85 },
      { namespace: 'signal', value: 'sequential-report-number', weight: 0.8 },
      { namespace: 'context', value: 'ongoing-monitoring', weight: 0.7 },
      { namespace: 'trigger', value: 'monitoring+drawdown+progress', weight: 0.9 },
    ],

    keywords: [
      'interim monitoring report',
      'progress report',
      'drawdown recommendation',
      'certified completion',
      'completion percentage',
      'site inspection',
      'monitoring visit',
      'report number',
      'visit number',
      'cost tracking',
      'programme compliance',
      'programme slippage',
      'practical completion',
      'retention',
      'outturn cost',
      'trade package progress',
      'construction progress',
      'funding release',
      'tranche',
      'defects',
      'variations',
      'site photographs',
      'cumulative expenditure',
      'budget variance',
      'monthly monitoring',
    ],

    filenamePatterns: [
      'interim[_\\s-]?monitoring',
      'monitoring[_\\s-]?report[_\\s-]?\\d+',
      'MS[_\\s-]?report[_\\s-]?\\d+',
      'progress[_\\s-]?report[_\\s-]?\\d+',
      'monthly[_\\s-]?monitoring',
      'visit[_\\s-]?\\d+[_\\s-]?report',
      'drawdown[_\\s-]?\\d+[_\\s-]?report',
      'monitoring[_\\s-]?visit[_\\s-]?\\d+',
    ],

    excludePatterns: [
      'initial[_\\s-]?monitoring',
      'pre[_\\s-]?fund(ing)?',
      'pre[_\\s-]?advance',
      'pre[_\\s-]?commencement',
      'valuation[_\\s-]?report',
      'building[_\\s-]?survey',
    ],

    decisionRules: [
      {
        condition: 'Document contains drawdown recommendation with certified completion percentage',
        signals: ['drawdown-recommendation', 'certified-completion-percentage'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document is a sequentially numbered monitoring report during active construction',
        signals: ['sequential-report-number', 'progress-inspection'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Document tracks cumulative expenditure against budget with cost variance analysis',
        signals: ['cost-tracking', 'budget-variance'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document contains site photographs and trade-by-trade progress assessment',
        signals: ['site-photographs', 'trade-package-progress'],
        priority: 6,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'monitoringSurveyor',
      'reportNumber',
      'inspectionDate',
      'projectAddress',
      'borrowerName',
      'certifiedCompletionPercentage',
      'drawdownRecommendation',
      'cumulativeExpenditure',
      'budgetVariance',
      'programmeStatus',
      'delaysNoted',
      'defectsIdentified',
      'nextInspectionDate',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },
];
