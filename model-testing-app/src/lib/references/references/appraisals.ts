// =============================================================================
// APPRAISALS — DOCUMENT REFERENCES
// =============================================================================
// Rich reference data for the Appraisals category:
//   - RedBook Valuation (RICS-compliant)
//   - Appraisal (general property/development appraisal)
//   - Cashflow (development cash flow projections)

import type { DocumentReference } from '../types';

export const APPRAISAL_REFERENCES: DocumentReference[] = [
  // ---------------------------------------------------------------------------
  // 1. REDBOOK VALUATION
  // ---------------------------------------------------------------------------
  {
    id: 'redbook-valuation',
    fileType: 'RedBook Valuation',
    category: 'Appraisals',
    filing: {
      targetFolder: 'Appraisals',
      targetLevel: 'project',
    },

    description:
      'A RedBook Valuation is a formal property valuation report prepared in accordance with the RICS ' +
      '(Royal Institution of Chartered Surveyors) Valuation — Global Standards, commonly known as the ' +
      '"Red Book". These reports are the gold standard in UK property finance and are relied upon by ' +
      'lenders, investors, and regulators to establish defensible property values. In development lending, ' +
      'a RedBook Valuation typically provides both a Current Market Value (CMV) of the site in its ' +
      'existing state and a Gross Development Value (GDV) representing the projected value of the ' +
      'completed scheme. The report is structured around the Valuation Practice Statements (VPS) and ' +
      'Valuation Practice Guidance Applications (VPGA) frameworks, which mandate specific disclosures ' +
      'including the basis of value, valuation approach (comparable, investment, or residual method), ' +
      'material assumptions, special assumptions, and any departure from standard methodology. ' +
      'RedBook Valuations are typically produced by RICS-registered firms such as Savills, Knight Frank, ' +
      'CBRE, JLL, or Cushman & Wakefield, and bear the RICS logo or Regulated by RICS badge. The ' +
      'report will identify the instructing party (usually the lender), state compliance with applicable ' +
      'VPS standards, reference the property\'s Land Registry title number, and include site inspection ' +
      'details. For RockCap\'s development lending, the RedBook Valuation is a critical credit document ' +
      'used to calculate key lending metrics including Loan to Value (LTV), Loan to Gross Development ' +
      'Value (LTGDV), and day-one security cover. The valuation date, any caveats on contamination or ' +
      'planning risk, and commentary on market conditions all feed directly into the credit assessment ' +
      'and ongoing covenant monitoring throughout the loan term.',

    identificationRules: [
      'PRIMARY: RICS logo, "Regulated by RICS" badge, or explicit RICS registration number on the document.',
      'PRIMARY: Reference to RICS Valuation — Global Standards or "Red Book" compliance statement.',
      'CRITICAL: If RICS branding is present combined with formal valuation methodology, treat as RedBook even without explicit "RedBook" mention.',
      'Contains a "Basis of Value" section specifying Market Value per RICS VPS 4 or another recognised basis.',
      'Includes Valuation Practice Statements (VPS) and/or VPGA compliance declarations.',
      'Reports both a Current Market Value (CMV) and a Gross Development Value (GDV) for development sites.',
      'Authored by a RICS-registered firm (e.g., Savills, Knight Frank, CBRE, JLL, Cushman & Wakefield) with named RICS surveyor.',
      'Contains a specific valuation date, inspection date, and statement of the purpose of the valuation.',
      'References Land Registry title number(s) and includes a site/property description with tenure details.',
      'Includes material assumptions, special assumptions, and departure disclosures per VPS 3.',
      'Contains a comparables analysis or residual appraisal supporting the stated value.',
      'Addressed to a specific lending institution (the "instructing party") for secured lending purposes.',
    ],

    disambiguation: [
      'This is a RedBook Valuation, NOT a general Appraisal — it carries explicit RICS compliance, formal basis of value, and VPS/VPGA disclosures that a general appraisal lacks.',
      'This is a RedBook Valuation, NOT a Cashflow — it focuses on property value opinion with supporting market evidence, not on projected income and expenditure over time.',
      'This is a RedBook Valuation, NOT an Estate Agent Market Appraisal — estate agent appraisals are informal, non-RICS, and typically a one-page letter without formal methodology.',
      'This is a RedBook Valuation, NOT a Monitoring Surveyor Report — monitoring reports assess construction progress, not property value.',
    ],

    terminology: {
      'RICS': 'Royal Institution of Chartered Surveyors — the professional body governing UK chartered surveyors and valuers.',
      'Red Book': 'The RICS Valuation — Global Standards publication, the mandatory framework for RICS-compliant valuations.',
      'VPS': 'Valuation Practice Statements — mandatory standards within the Red Book that all RICS valuations must follow.',
      'VPGA': 'Valuation Practice Guidance Applications — guidance on applying VPS to specific asset types or contexts.',
      'Market Value': 'The estimated amount for which an asset should exchange on the valuation date between a willing buyer and seller in an arm\'s length transaction.',
      'GDV': 'Gross Development Value — the projected market value of a development scheme upon completion of all units/buildings.',
      'CMV': 'Current Market Value — the value of the property in its present condition at the valuation date.',
      'LTGDV': 'Loan to Gross Development Value — a key lending metric expressing the loan amount as a percentage of the projected completed value.',
      'LTV': 'Loan to Value — the ratio of the loan amount to the current market value of the security property.',
      'Special Assumption': 'An assumption that differs from actual facts at the valuation date, e.g., assuming planning permission is granted.',
      'Residual Method': 'A valuation approach that calculates land value by deducting development costs and profit from GDV.',
      'Comparables': 'Recent transaction evidence of similar properties used to support the valuer\'s opinion of value.',
      'Tenure': 'The legal basis of property ownership — freehold or leasehold — confirmed via Land Registry.',
    },

    tags: [
      { namespace: 'type', value: 'redbook-valuation', weight: 3.0 },
      { namespace: 'signal', value: 'rics-branding', weight: 2.5 },
      { namespace: 'signal', value: 'formal-valuation-methodology', weight: 2.0 },
      { namespace: 'signal', value: 'property-value-opinion', weight: 1.5 },
      { namespace: 'signal', value: 'land-registry-reference', weight: 1.2 },
      { namespace: 'domain', value: 'property-finance', weight: 1.5 },
      { namespace: 'domain', value: 'property-valuation', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'summarization', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'extraction', weight: 1.0 },
      { namespace: 'context', value: 'chat', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'rics+valuation-methodology', weight: 2.5 },
    ],

    keywords: [
      'RICS', 'Red Book', 'RedBook', 'valuation', 'market value', 'gross development value',
      'GDV', 'current market value', 'CMV', 'basis of value', 'VPS', 'VPGA',
      'valuation date', 'inspection date', 'comparables', 'residual method',
      'special assumption', 'material assumption', 'LTGDV', 'LTV',
      'tenure', 'freehold', 'leasehold', 'Land Registry', 'title number',
    ],

    filenamePatterns: [
      'red\\s*book',
      'rics.*valuation',
      'valuation.*report',
      'valuation.*rics',
      'val.*report',
      'property.*valuation',
      'development.*valuation',
      '(savills|knight.frank|cbre|jll|cushman).*val',
    ],

    excludePatterns: [
      'estate.*agent.*appraisal',
      'market.*appraisal.*letter',
      'monitoring.*report',
      'progress.*report',
      'cashflow',
      'cash.*flow',
    ],

    decisionRules: [
      {
        condition: 'RICS branding detected in document header, footer, or cover page',
        signals: ['rics-branding', 'rics-logo', 'regulated-by-rics'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'Formal valuation methodology (VPS/VPGA references, basis of value declaration)',
        signals: ['formal-valuation-methodology', 'vps-reference', 'basis-of-value'],
        priority: 9,
        action: 'boost',
      },
      {
        condition: 'RICS branding present combined with formal methodology — classify as RedBook',
        signals: ['rics-branding', 'formal-valuation-methodology'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'Document reports market value and GDV with supporting comparables',
        signals: ['property-value-opinion', 'gdv-stated', 'comparables-analysis'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Authored by a recognised RICS-registered valuation firm',
        signals: ['savills', 'knight-frank', 'cbre', 'jll', 'cushman-wakefield'],
        priority: 6,
        action: 'include',
      },
      {
        condition: 'Land Registry title reference and tenure disclosure present',
        signals: ['land-registry-reference', 'tenure-disclosure'],
        priority: 5,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'financials.currentValue',
      'financials.gdv',
      'location.siteAddress',
      'financials.purchasePrice',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 2. APPRAISAL
  // ---------------------------------------------------------------------------
  {
    id: 'appraisal',
    fileType: 'Appraisal',
    category: 'Appraisals',
    filing: {
      targetFolder: 'Appraisals',
      targetLevel: 'project',
    },

    description:
      'A Development Appraisal is a financial assessment of a proposed property development scheme, ' +
      'evaluating whether the project is commercially viable and identifying the key cost and revenue ' +
      'drivers. Unlike a RedBook Valuation, which is an independent opinion of value governed by RICS ' +
      'standards, an appraisal is typically prepared by the borrower, their consultant, or the lender\'s ' +
      'own credit team to stress-test a scheme\'s economics. The appraisal starts with the Gross ' +
      'Development Value (GDV) — the estimated total sales revenue on completion — and works backwards ' +
      'through build costs (including preliminaries, contingency, and professional fees), planning and ' +
      'Section 106/CIL obligations, finance costs, and the developer\'s profit margin to arrive at a ' +
      'Residual Land Value or to confirm the scheme\'s viability given a known land purchase price. ' +
      'Appraisals are commonly produced in Argus Developer, ProDev, or bespoke Excel models and ' +
      'present line-item cost breakdowns across categories such as substructure, superstructure, ' +
      'external works, services, and abnormals. For RockCap\'s lending decisions, the appraisal ' +
      'demonstrates that the development profit margin (typically 15-25% on GDV for residential) is ' +
      'sufficient to absorb market downturns, cost overruns, and time delays. The appraisal may ' +
      'include sensitivity analyses showing the impact of GDV reductions, cost increases, or programme ' +
      'extensions on the bottom-line profit. It is a living document, often updated as costs are ' +
      'firmed or planning conditions are discharged, and forms a core part of the credit pack alongside ' +
      'the RedBook Valuation and the cashflow projection.',

    identificationRules: [
      'PRIMARY: Contains a detailed cost breakdown with line items for construction, professional fees, contingency, and finance costs.',
      'PRIMARY: Shows a Gross Development Value (GDV) at the top and works through deductions to arrive at profit or residual land value.',
      'Contains a profit margin calculation (absolute and as % of GDV or cost).',
      'Includes categories such as build cost, preliminaries, substructure, superstructure, external works, abnormals, and professional fees.',
      'References Section 106, CIL (Community Infrastructure Levy), or planning obligations as cost line items.',
      'May be produced in Argus Developer, ProDev, or an Excel-based appraisal model.',
      'Presents a residual land value calculation or confirms viability against a stated land price.',
      'Includes sensitivity analysis tables showing GDV or cost variations.',
      'Does NOT carry RICS branding, VPS compliance, or formal basis of value — distinguishing it from a RedBook Valuation.',
      'May include a development programme (timeline) but the primary focus is cost and revenue, not periodic cashflow.',
      'Often prepared by the borrower or their quantity surveyor rather than an independent valuer.',
    ],

    disambiguation: [
      'This is an Appraisal, NOT a RedBook Valuation — it does not carry RICS branding, formal VPS/VPGA compliance, or an independent surveyor\'s opinion of market value.',
      'This is an Appraisal, NOT a Cashflow — it contains a static cost breakdown and profit calculation rather than period-by-period cash flow projections and drawdown schedules.',
      'This is an Appraisal, NOT a Quantity Surveyor Cost Report — while it includes build costs, it also covers revenue (GDV), profit, and land value, which a QS report does not.',
      'This is an Appraisal, NOT a Loan Facility Letter — it models project economics rather than loan terms and conditions.',
    ],

    terminology: {
      'GDV': 'Gross Development Value — the total projected sales revenue of the completed development.',
      'Residual Land Value': 'The value of the land calculated by deducting all development costs and profit from the GDV.',
      'Build Cost': 'The total construction cost including preliminaries, contingency, substructure, superstructure, and external works.',
      'Profit Margin': 'The developer\'s return expressed as a percentage of GDV (typically 15-25% for residential) or of total cost.',
      'Section 106': 'Planning obligations under the Town and Country Planning Act 1990 requiring developers to contribute to local infrastructure.',
      'CIL': 'Community Infrastructure Levy — a fixed charge per square metre of new development to fund local infrastructure.',
      'Contingency': 'A cost allowance (typically 5-10% of build cost) to cover unforeseen construction expenses.',
      'Professional Fees': 'Fees for architects, engineers, quantity surveyors, planning consultants, and project managers.',
      'Abnormals': 'Unusual or site-specific costs such as demolition, remediation, piling, or retaining structures.',
      'Argus Developer': 'Industry-standard software for development appraisals and cashflow modelling.',
      'Sensitivity Analysis': 'Stress-testing the appraisal by varying key inputs (GDV, build cost, programme) to assess downside risk.',
    },

    tags: [
      { namespace: 'type', value: 'appraisal', weight: 3.0 },
      { namespace: 'signal', value: 'cost-breakdown', weight: 2.0 },
      { namespace: 'signal', value: 'gdv-stated', weight: 1.8 },
      { namespace: 'signal', value: 'profit-margin-calculation', weight: 1.8 },
      { namespace: 'signal', value: 'residual-land-value', weight: 1.5 },
      { namespace: 'signal', value: 'sensitivity-analysis', weight: 1.2 },
      { namespace: 'domain', value: 'property-finance', weight: 1.5 },
      { namespace: 'domain', value: 'development-economics', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'summarization', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'extraction', weight: 1.0 },
      { namespace: 'context', value: 'chat', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'gdv+cost-breakdown+profit', weight: 2.5 },
    ],

    keywords: [
      'appraisal', 'development appraisal', 'GDV', 'gross development value',
      'build cost', 'construction cost', 'residual land value', 'profit margin',
      'developer profit', 'contingency', 'professional fees', 'Section 106', 'CIL',
      'abnormals', 'preliminaries', 'substructure', 'superstructure', 'external works',
      'sensitivity analysis', 'Argus Developer', 'ProDev', 'viability',
      'cost plan', 'development economics',
    ],

    filenamePatterns: [
      'appraisal',
      'dev(elopment)?.*appraisal',
      'scheme.*appraisal',
      'viability.*appraisal',
      'argus.*appraisal',
      'residual.*appraisal',
      'cost.*appraisal',
    ],

    excludePatterns: [
      'red\\s*book',
      'rics.*val',
      'valuation.*report',
      'cashflow',
      'cash.*flow',
      'drawdown',
      'monitoring.*report',
      'qs.*report',
      'quantity.*surveyor',
    ],

    decisionRules: [
      {
        condition: 'Document contains GDV and detailed cost breakdown with profit margin — classic appraisal format',
        signals: ['gdv-stated', 'cost-breakdown', 'profit-margin-calculation'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Residual land value calculation is present',
        signals: ['residual-land-value', 'cost-breakdown'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Sensitivity analysis varying GDV or build cost',
        signals: ['sensitivity-analysis', 'gdv-stated'],
        priority: 6,
        action: 'boost',
      },
      {
        condition: 'Argus Developer or ProDev output detected',
        signals: ['argus-developer', 'prodev-output'],
        priority: 7,
        action: 'include',
      },
      {
        condition: 'No RICS branding or VPS compliance — rules out RedBook',
        signals: ['no-rics-branding', 'no-vps-reference'],
        priority: 5,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'financials.gdv',
      'financials.totalDevelopmentCost',
      'financials.constructionCost',
      'financials.profitMargin',
      'financials.purchasePrice',
      'overview.unitCount',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ---------------------------------------------------------------------------
  // 3. CASHFLOW
  // ---------------------------------------------------------------------------
  {
    id: 'cashflow',
    fileType: 'Cashflow',
    category: 'Appraisals',
    filing: {
      targetFolder: 'Appraisals',
      targetLevel: 'project',
    },

    description:
      'A Development Cashflow is a time-phased financial projection showing how money flows into and ' +
      'out of a property development project over its lifecycle. Unlike a static appraisal that presents ' +
      'a single-point cost and revenue summary, the cashflow maps expenditure and income across monthly ' +
      'or quarterly periods, making it essential for determining the loan drawdown schedule, peak debt ' +
      'exposure, and interest costs. The cashflow typically follows an S-curve profile: slow initial ' +
      'spend during enabling works and substructure, accelerating through superstructure and fit-out, ' +
      'then tapering as sales or lettings revenue begins. Key outputs include the drawdown schedule ' +
      '(when and how much the borrower will draw from the loan facility), cumulative expenditure, ' +
      'cumulative receipts, the peak debt figure (the maximum outstanding loan balance), and the total ' +
      'rolled-up interest cost. For RockCap\'s development lending, the cashflow is critical for ' +
      'structuring the facility: it determines the total facility size, the drawdown tranches, interest ' +
      'reserve requirements, and the projected repayment date. The cashflow must align with the ' +
      'construction programme (Gantt chart) provided by the project manager or contractor, and the ' +
      'cost figures should reconcile to the development appraisal and the quantity surveyor\'s cost ' +
      'plan. During the loan term, actual drawdowns are monitored against the projected cashflow to ' +
      'identify variance and potential overruns. Cashflows are typically produced in Excel, Argus ' +
      'Developer, or bespoke lending models and may include separate tabs for base case, downside, ' +
      'and upside scenarios. The format usually features a columnar period-by-period layout with rows ' +
      'for each cost category and summary rows for cumulative totals, net cashflow, and debt balance.',

    identificationRules: [
      'PRIMARY: Period-by-period (monthly or quarterly) columnar financial projection with cost categories as rows.',
      'PRIMARY: Contains a drawdown schedule showing when loan funds are drawn over the development programme.',
      'CRITICAL: Shows peak debt figure — the maximum outstanding loan balance at any point during the project.',
      'Contains cumulative expenditure and cumulative receipts tracking across all periods.',
      'Shows interest roll-up or capitalisation calculations period by period.',
      'Includes an S-curve profile or references to S-curve spending pattern.',
      'Contains rows for land cost, construction costs, professional fees, contingency, and finance costs spread over time.',
      'May include sales receipts or letting income phased across the programme.',
      'Includes a net cashflow row showing the surplus or deficit each period.',
      'Often produced in Excel with one tab per scenario (base case, downside) or as an Argus Developer cashflow export.',
      'Contains a facility utilisation or debt balance row tracking the outstanding loan over time.',
    ],

    disambiguation: [
      'This is a Cashflow, NOT an Appraisal — it contains period-by-period financial projections with time-phased costs and drawdowns, whereas an appraisal is a static cost/revenue summary without time dimension.',
      'This is a Cashflow, NOT a RedBook Valuation — it is a pure financial projection model, not a surveyor\'s opinion of property value with RICS methodology.',
      'This is a Cashflow, NOT a Bank/Loan Statement — it contains projected future figures, not historical transaction records of actual payments made.',
      'This is a Cashflow, NOT a Construction Programme/Gantt Chart — it shows financial figures over time, not task durations and dependencies.',
      'This is a Cashflow, NOT a Cost Plan — a cost plan is a static cost breakdown by element, whereas a cashflow adds the time dimension showing when those costs are incurred.',
    ],

    terminology: {
      'Drawdown Schedule': 'The planned sequence of loan draws specifying the amount and timing of each advance from the facility.',
      'Peak Debt': 'The maximum outstanding loan balance at any point during the development, a key metric for lender exposure.',
      'Interest Roll-Up': 'Capitalisation of interest — accrued interest is added to the loan balance rather than paid periodically, increasing the outstanding debt.',
      'S-Curve': 'The characteristic spending profile of a construction project: slow start, steep middle, and tapering end, producing an S-shaped cumulative cost line.',
      'Cumulative Expenditure': 'Running total of all project costs incurred from inception to the current period.',
      'Net Cashflow': 'The difference between cash inflows (drawdowns, sales) and cash outflows (costs) in each period.',
      'Facility Utilisation': 'The proportion of the total loan facility that has been drawn at any given point.',
      'Base Case': 'The primary cashflow scenario using the most likely assumptions for costs, revenue, and programme.',
      'Downside Scenario': 'A stress-tested cashflow incorporating adverse assumptions such as cost overruns, sales delays, or GDV reductions.',
      'Tranche': 'A distinct portion of the loan facility drawn at a specific milestone or period.',
      'Interest Reserve': 'A ring-fenced portion of the facility set aside to cover accrued interest during the development period.',
    },

    tags: [
      { namespace: 'type', value: 'cashflow', weight: 3.0 },
      { namespace: 'signal', value: 'periodic-financial-projection', weight: 2.5 },
      { namespace: 'signal', value: 'drawdown-schedule', weight: 2.2 },
      { namespace: 'signal', value: 'peak-debt-figure', weight: 2.0 },
      { namespace: 'signal', value: 's-curve-profile', weight: 1.5 },
      { namespace: 'signal', value: 'interest-roll-up', weight: 1.5 },
      { namespace: 'signal', value: 'financial-tables', weight: 1.2 },
      { namespace: 'domain', value: 'property-finance', weight: 1.5 },
      { namespace: 'domain', value: 'development-lending', weight: 2.0 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'summarization', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'extraction', weight: 1.0 },
      { namespace: 'context', value: 'chat', weight: 1.0 },
      { namespace: 'context', value: 'checklist', weight: 1.0 },
      { namespace: 'trigger', value: 'drawdown+peak-debt+periodic-projection', weight: 2.5 },
    ],

    keywords: [
      'cashflow', 'cash flow', 'drawdown schedule', 'drawdown', 'peak debt',
      'interest roll-up', 'interest capitalisation', 'S-curve', 'cumulative expenditure',
      'cumulative receipts', 'net cashflow', 'facility utilisation', 'debt balance',
      'tranche', 'monthly projection', 'quarterly projection', 'base case', 'downside',
      'interest reserve', 'development cashflow', 'project cashflow',
      'loan drawdown', 'cumulative cost', 'finance cost',
    ],

    filenamePatterns: [
      'cash\\s*flow',
      'cf\\b',
      'drawdown.*schedule',
      'development.*cashflow',
      'project.*cashflow',
      'loan.*cashflow',
      'peak.*debt',
      'cashflow.*model',
    ],

    excludePatterns: [
      'appraisal',
      'valuation',
      'red\\s*book',
      'rics',
      'bank.*statement',
      'loan.*statement',
      'account.*statement',
      'gantt',
      'programme',
    ],

    decisionRules: [
      {
        condition: 'Period-by-period financial projection with drawdown schedule and peak debt',
        signals: ['periodic-financial-projection', 'drawdown-schedule', 'peak-debt-figure'],
        priority: 10,
        action: 'require',
      },
      {
        condition: 'S-curve expenditure profile across monthly or quarterly columns',
        signals: ['s-curve-profile', 'periodic-financial-projection'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Interest roll-up or capitalisation calculations present',
        signals: ['interest-roll-up', 'periodic-financial-projection'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Cumulative cost and debt balance rows tracking facility utilisation',
        signals: ['cumulative-expenditure', 'debt-balance-tracking'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Multiple scenario tabs (base case, downside) in financial model',
        signals: ['base-case-scenario', 'downside-scenario'],
        priority: 5,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'financials.gdv',
      'financials.totalDevelopmentCost',
      'financials.constructionCost',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },
];
