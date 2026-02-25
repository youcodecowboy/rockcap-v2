// =============================================================================
// FINANCIAL DOCUMENTS — DOCUMENT REFERENCES
// =============================================================================
// Covers: Loan Statement, Redemption Statement, Completion Statement,
//         Invoice, Receipt, Tax Return
// Context: UK property development finance (bridging, development, mezzanine)

import type { DocumentReference } from '../types';

export const FINANCIAL_REFERENCES: DocumentReference[] = [
  // ===========================================================================
  // 1. LOAN STATEMENT
  // ===========================================================================
  {
    id: 'loan-statement',
    fileType: 'Loan Statement',
    category: 'Financial Documents',
    filing: {
      targetFolder: 'Financial',
      targetLevel: 'project',
    },
    description:
      'A loan statement is a periodic financial document issued by a lender — typically a bridging, development, or mezzanine finance provider — that presents the current position of a borrower\'s loan account. In UK property development finance, loan statements serve as the primary record of the ongoing financial relationship between lender and borrower throughout the life of a facility.\n\n' +
      'The statement details the original loan advance, any subsequent drawdowns made against a facility (common in development finance where funds are released in tranches against completed works), and the cumulative interest that has accrued. In most bridging and development loans, interest is rolled up rather than serviced monthly, meaning it compounds and is added to the outstanding balance. The statement therefore shows both the principal balance and the total debt including rolled-up interest, giving the borrower a clear picture of their exposure at a point in time.\n\n' +
      'Key financial line items typically include the facility amount, net advance after deductions (arrangement fees, broker fees, legal costs), individual drawdown amounts with dates, the applicable interest rate (usually expressed as a monthly rate in bridging finance), daily or monthly interest accruals, any extension fees charged, default interest if applicable, and the total outstanding balance. Some lenders also show a projected redemption figure assuming a future repayment date.\n\n' +
      'Loan statements are essential for financial monitoring, covenant compliance, and audit purposes. They enable the lender\'s credit team to track utilisation against facility limits, verify that drawdowns align with approved schedules, and confirm that the loan-to-value ratio remains within acceptable parameters. For borrowers, the statement provides the information needed for their own accounting records and for planning the timing and amount of the eventual redemption.',
    identificationRules: [
      'PRIMARY: Shows loan account number or facility reference with outstanding balance and interest accrued',
      'PRIMARY: Contains drawdown schedule listing individual advances with dates and amounts',
      'CRITICAL: Displays rolled-up interest calculation showing how interest has been added to the principal balance',
      'Shows original facility amount alongside current utilised/outstanding balance',
      'Contains interest rate expressed as monthly or annual percentage applicable to the loan',
      'Lists fees deducted at drawdown such as arrangement fee, broker fee, legal retention',
      'Issued by a lending entity (fund, bank, bridging lender) on their headed paper',
      'Includes statement date or period covered (e.g., "as at" date)',
      'May show projected redemption figure or estimated payoff amount at a future date',
      'References the underlying loan agreement or facility letter by date',
      'Contains borrower entity name, property address, and sometimes the SPV details',
    ],
    disambiguation: [
      'A Loan Statement shows the ONGOING position of a loan (balance, drawdowns, accrued interest) — a Redemption Statement shows the specific amount needed to REPAY and CLOSE the loan on a given date.',
      'A Loan Statement is issued by the LENDER showing the loan account position — a Bank Statement is issued by a HIGH STREET BANK showing a current/savings account with deposits and withdrawals.',
      'A Loan Statement shows the lender\'s record of advances and interest — a Completion Statement is the FINAL accounting at loan exit showing all adjustments, penalties, and net settlement figures.',
      'A Loan Statement may reference drawdowns, but it is NOT a Drawdown Request (which is a borrower\'s formal request to release funds) nor a Drawdown Certificate.',
    ],
    terminology: {
      'Drawdown': 'Release of loan funds, either the initial advance or a subsequent tranche against approved works',
      'Rolled-up interest': 'Interest that accrues and is added to the loan balance rather than being paid monthly by the borrower',
      'Facility amount': 'The maximum total loan approved under the facility agreement',
      'Utilisation': 'The amount of the facility that has actually been drawn down and is outstanding',
      'Arrangement fee': 'Upfront fee charged by the lender for setting up the loan, usually 1-2% of the facility',
      'Default interest': 'Penalty interest rate applied when the loan is in breach or past its maturity date',
      'Net advance': 'The actual amount received by the borrower after deduction of fees and retentions',
      'Extension fee': 'Fee charged when the loan term is extended beyond the original maturity date',
    },
    tags: [
      { namespace: 'type', value: 'loan-statement', weight: 1.0 },
      { namespace: 'domain', value: 'property-finance', weight: 0.9 },
      { namespace: 'domain', value: 'lending', weight: 0.8 },
      { namespace: 'signal', value: 'financial-tables', weight: 0.7 },
      { namespace: 'signal', value: 'drawdown-schedule', weight: 0.9 },
      { namespace: 'signal', value: 'interest-accrual', weight: 0.8 },
      { namespace: 'signal', value: 'lender-branding', weight: 0.6 },
      { namespace: 'context', value: 'financial-monitoring', weight: 0.7 },
      { namespace: 'trigger', value: 'financial+lending', weight: 0.8 },
    ],
    keywords: [
      'loan statement', 'outstanding balance', 'drawdown', 'rolled-up interest',
      'facility amount', 'net advance', 'arrangement fee', 'interest accrued',
      'interest rate', 'monthly rate', 'loan account', 'utilisation',
      'principal balance', 'total debt', 'statement date', 'extension fee',
      'default interest', 'facility reference', 'tranche', 'maturity date',
      'lender statement', 'loan balance', 'accrued interest',
    ],
    filenamePatterns: [
      'loan.?statement',
      'loan.?account.?statement',
      'facility.?statement',
      'interest.?statement',
      'drawdown.?statement',
      'borrower.?statement',
    ],
    excludePatterns: [
      'bank.?statement',
      'redemption',
      'completion.?statement',
      'mortgage.?statement',
      'credit.?card',
    ],
    decisionRules: [
      {
        condition: 'Document shows drawdown schedule with rolled-up interest calculation',
        signals: ['drawdown-schedule', 'interest-accrual', 'lender-branding'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document contains facility reference and outstanding loan balance',
        signals: ['facility-reference', 'outstanding-balance'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Financial document from a lending entity showing loan figures',
        signals: ['financial-tables', 'lender-branding'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'lenderName', 'borrowerName', 'facilityAmount', 'outstandingBalance',
      'interestRate', 'interestAccrued', 'drawdownDates', 'drawdownAmounts',
      'netAdvance', 'arrangementFee', 'statementDate', 'propertyAddress',
      'loanAccountNumber', 'maturityDate',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ===========================================================================
  // 2. REDEMPTION STATEMENT
  // ===========================================================================
  {
    id: 'redemption-statement',
    fileType: 'Redemption Statement',
    category: 'Financial Documents',
    filing: {
      targetFolder: 'Financial',
      targetLevel: 'project',
    },
    description:
      'A redemption statement is a formal document issued by a lender setting out the exact amount required to fully repay and discharge a loan on a specified date. In UK property development and bridging finance, the redemption statement is a critical document in the exit process — it is the definitive figure that the borrower (or their solicitor) must pay to close the facility and trigger the release of the lender\'s security.\n\n' +
      'The statement breaks down the total redemption figure into its component parts: the outstanding principal, all rolled-up interest accrued to the redemption date, any exit fees due under the facility agreement, administration or discharge fees, and any other sums owed such as unpaid extension fees or legal costs incurred by the lender. Because interest accrues daily on most bridging facilities, the redemption figure is only valid for a specific date or short window (often stated as "valid until" a particular date), after which a fresh statement must be requested.\n\n' +
      'Redemption statements are typically requested by the borrower\'s solicitor when a sale is completing or when the borrower is refinancing with a new lender. The solicitor uses the redemption figure to calculate the net proceeds available to the borrower after repayment. The statement will include the lender\'s bank details for receipt of funds and instructions for confirming payment.\n\n' +
      'In development finance, the redemption may occur in stages if units within a scheme are being sold individually, with partial redemptions reducing the overall facility. Each partial or full redemption statement must be reconciled against the loan statement to ensure accuracy. The redemption statement is a key document in the lender\'s file, evidencing the amount received and forming the basis for releasing charges at the Land Registry.',
    identificationRules: [
      'PRIMARY: States a specific total redemption amount required to fully repay and close the loan',
      'PRIMARY: Includes a "valid until" or "redemption date" showing the date by which payment must be made',
      'CRITICAL: Breaks down the redemption figure into principal, rolled-up interest, exit fee, and other charges',
      'Contains the lender\'s bank account details for receipt of redemption funds',
      'References the underlying facility agreement and loan account number',
      'States daily interest rate or per-diem figure for calculating the cost of late redemption',
      'Includes instructions for the borrower\'s solicitor regarding payment and confirmation',
      'May reference the discharge of security (legal charge) upon receipt of cleared funds',
      'Often marked or titled "Redemption Statement" or "Redemption Figure"',
      'Shows the property address and borrower/SPV name as on the original facility',
      'May include a warning that the figure is only valid for the stated period',
    ],
    disambiguation: [
      'A Redemption Statement shows the amount to FULLY REPAY and CLOSE the loan — a Loan Statement shows the ONGOING balance and activity on the account without necessarily quoting a payoff figure.',
      'A Redemption Statement is the PAYOFF QUOTE for a specific date — a Completion Statement is the FINAL RECONCILIATION produced AFTER the loan has been repaid, showing all actual figures at settlement.',
      'A Redemption Statement is issued by the LENDER — it should not be confused with a Solicitor\'s Completion Statement which is produced by the borrower\'s legal team summarising all transaction costs.',
      'A Redemption Statement relates to LOAN repayment — not to a property sale completion or exchange of contracts (which are legal milestones).',
    ],
    terminology: {
      'Redemption': 'The full repayment and discharge of a loan, releasing the lender\'s security',
      'Exit fee': 'Fee payable to the lender upon redemption, typically 1-2% of the loan amount',
      'Per diem': 'Daily interest charge used to calculate the cost for each additional day before redemption',
      'Discharge': 'The formal release of the lender\'s legal charge over the property at the Land Registry',
      'Partial redemption': 'Repayment of part of the loan, typically when individual units in a scheme are sold',
      'Valid until date': 'The deadline by which the redemption amount must be paid before a new figure is required',
      'Cleared funds': 'Money that has been received and confirmed in the lender\'s account, not subject to recall',
      'DS1 form': 'Land Registry form used to discharge a registered charge after redemption',
    },
    tags: [
      { namespace: 'type', value: 'redemption-statement', weight: 1.0 },
      { namespace: 'domain', value: 'property-finance', weight: 0.9 },
      { namespace: 'domain', value: 'lending', weight: 0.8 },
      { namespace: 'signal', value: 'redemption-figure', weight: 1.0 },
      { namespace: 'signal', value: 'exit-fee', weight: 0.8 },
      { namespace: 'signal', value: 'discharge-instructions', weight: 0.7 },
      { namespace: 'signal', value: 'lender-branding', weight: 0.6 },
      { namespace: 'context', value: 'loan-exit', weight: 0.9 },
      { namespace: 'trigger', value: 'financial+exit', weight: 0.8 },
    ],
    keywords: [
      'redemption statement', 'redemption figure', 'payoff amount', 'exit fee',
      'total redemption', 'valid until', 'discharge', 'per diem', 'daily interest',
      'cleared funds', 'lender bank details', 'repay in full', 'loan closure',
      'partial redemption', 'DS1', 'release of charge', 'redemption date',
      'outstanding principal', 'settlement figure', 'pay off', 'loan repayment',
      'security release', 'final payment',
    ],
    filenamePatterns: [
      'redemption.?statement',
      'redemption.?figure',
      'payoff.?statement',
      'settlement.?figure',
      'loan.?payoff',
      'redemption.?quote',
    ],
    excludePatterns: [
      'bank.?statement',
      'completion.?statement',
      'loan.?statement',
      'mortgage.?redemption.?penalty',
    ],
    decisionRules: [
      {
        condition: 'Document states a total redemption figure with a valid-until date',
        signals: ['redemption-figure', 'valid-until-date', 'lender-branding'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document includes exit fee breakdown and lender bank details for payment',
        signals: ['exit-fee', 'bank-details', 'discharge-instructions'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Financial document referencing loan repayment and discharge of security',
        signals: ['financial-tables', 'loan-exit'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'lenderName', 'borrowerName', 'totalRedemptionAmount', 'outstandingPrincipal',
      'rolledUpInterest', 'exitFee', 'administrationFee', 'perDiemRate',
      'validUntilDate', 'redemptionDate', 'lenderBankDetails', 'propertyAddress',
      'loanAccountNumber', 'facilityAgreementDate',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ===========================================================================
  // 3. COMPLETION STATEMENT
  // ===========================================================================
  {
    id: 'completion-statement',
    fileType: 'Completion Statement',
    category: 'Financial Documents',
    filing: {
      targetFolder: 'Financial',
      targetLevel: 'project',
    },
    description:
      'A completion statement is a final financial reconciliation document produced at the conclusion of a property finance transaction. In the context of UK development and bridging lending, the completion statement represents the definitive accounting of all financial flows between lender and borrower over the life of the facility, produced once the loan has been fully redeemed and all outstanding matters settled.\n\n' +
      'The statement typically covers the full lifecycle of the loan: the original net advance, all drawdowns released, total interest charged (including any rolled-up interest and any default or penalty interest), all fees levied (arrangement fee, exit fee, extension fees, monitoring fees), any legal costs recharged to the borrower, and the total redemption payment received. The net position — confirming that the loan is fully discharged with no further sums owed by either party — is the key output of the document.\n\n' +
      'In development finance, where loans may involve multiple drawdowns over 12-24 months and partial redemptions as individual units sell, the completion statement can be a complex document reconciling dozens of transactions. The lender\'s operations team prepares it once all funds have been received and any retentions or holdbacks have been resolved. It may also include adjustments for overpayments, interest refunds, or retention releases.\n\n' +
      'Completion statements serve several important purposes: they provide the borrower with a final record for their accounts and tax filings, they form part of the lender\'s internal audit trail, and they support the formal release of all security. Solicitors on both sides rely on the completion statement to confirm that no outstanding liabilities remain before the lender\'s charges are formally discharged at the Land Registry. The document is typically produced within days or weeks of the final payment being received.',
    identificationRules: [
      'PRIMARY: Titled or described as a final or completion statement produced after loan redemption',
      'PRIMARY: Reconciles the ENTIRE loan lifecycle — advances, interest, fees, and redemption payment — to a net zero or final balance',
      'CRITICAL: Shows the full history of drawdowns and interest alongside the final redemption payment received',
      'Contains a confirmation that the loan is fully discharged and no further sums are owed',
      'Lists all fees charged over the life of the facility (arrangement, exit, extension, monitoring)',
      'May include adjustments for overpayments, retention releases, or interest refunds',
      'References the original facility agreement and all amendments or extensions',
      'Produced by the lender\'s operations or finance team after receipt of final cleared funds',
      'Typically dated after the redemption date, as it is a retrospective reconciliation',
      'May reference the formal discharge of security and release of Land Registry charges',
    ],
    disambiguation: [
      'A Completion Statement is the FINAL retrospective reconciliation AFTER the loan is repaid — a Redemption Statement is a FORWARD-LOOKING payoff quote stating what amount is needed to repay the loan.',
      'A Completion Statement covers the ENTIRE loan lifecycle from first advance to final payment — a Loan Statement shows the position at a POINT IN TIME during the life of the loan.',
      'A Completion Statement from the LENDER reconciles the loan — a Solicitor\'s Completion Statement from the borrower\'s lawyer reconciles the property purchase/sale transaction costs (different document).',
      'A Completion Statement is NOT the same as a completion certificate (which relates to building works or practical completion of construction).',
    ],
    terminology: {
      'Reconciliation': 'The process of matching all debits and credits to confirm the final position is correct',
      'Retention release': 'Return of funds held back by the lender as security, released after loan discharge',
      'Monitoring fee': 'Periodic fee charged by the lender for ongoing oversight of the development project',
      'Holdback': 'Portion of the facility withheld by the lender until specific conditions are met',
      'Net position': 'The final balance after all advances, fees, interest, and payments are reconciled',
      'Formal discharge': 'Official removal of the lender\'s legal charge over the property at the Land Registry',
      'Overpayment': 'Amount paid by the borrower in excess of the redemption figure, requiring a refund',
    },
    tags: [
      { namespace: 'type', value: 'completion-statement', weight: 1.0 },
      { namespace: 'domain', value: 'property-finance', weight: 0.9 },
      { namespace: 'domain', value: 'lending', weight: 0.8 },
      { namespace: 'signal', value: 'final-reconciliation', weight: 1.0 },
      { namespace: 'signal', value: 'loan-lifecycle-summary', weight: 0.9 },
      { namespace: 'signal', value: 'discharge-confirmation', weight: 0.8 },
      { namespace: 'signal', value: 'lender-branding', weight: 0.6 },
      { namespace: 'context', value: 'loan-exit', weight: 0.8 },
      { namespace: 'trigger', value: 'financial+completion', weight: 0.8 },
    ],
    keywords: [
      'completion statement', 'final statement', 'loan reconciliation', 'final account',
      'total interest charged', 'total fees', 'net position', 'fully discharged',
      'no further sums', 'redemption received', 'overpayment', 'retention release',
      'final settlement', 'loan lifecycle', 'all drawdowns', 'formal discharge',
      'exit reconciliation', 'closing statement', 'account closed',
      'monitoring fee', 'total advanced', 'total repaid',
    ],
    filenamePatterns: [
      'completion.?statement',
      'final.?statement',
      'loan.?reconciliation',
      'closing.?statement',
      'final.?account',
      'settlement.?statement',
    ],
    excludePatterns: [
      'redemption.?statement',
      'loan.?statement',
      'bank.?statement',
      'practical.?completion',
      'completion.?certificate',
      'solicitor.?completion',
    ],
    decisionRules: [
      {
        condition: 'Document reconciles the full loan lifecycle and confirms discharge',
        signals: ['final-reconciliation', 'discharge-confirmation', 'loan-lifecycle-summary'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document shows total advances, total interest, total fees, and final payment',
        signals: ['loan-lifecycle-summary', 'financial-tables'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Financial document produced after loan repayment summarising all figures',
        signals: ['financial-tables', 'loan-exit'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'lenderName', 'borrowerName', 'facilityAmount', 'totalAdvanced',
      'totalInterestCharged', 'totalFeesCharged', 'arrangementFee', 'exitFee',
      'extensionFees', 'monitoringFees', 'legalCosts', 'totalRedemptionReceived',
      'netPosition', 'propertyAddress', 'facilityAgreementDate', 'redemptionDate',
      'statementDate',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ===========================================================================
  // 4. INVOICE
  // ===========================================================================
  {
    id: 'invoice',
    fileType: 'Invoice',
    category: 'Financial Documents',
    filing: {
      targetFolder: 'Financial',
      targetLevel: 'project',
    },
    description:
      'An invoice is a commercial document issued by a supplier or service provider requesting payment for goods delivered or services rendered. In UK property development finance, invoices are encountered across virtually every aspect of a project — from construction contractors and subcontractors billing for completed works, to solicitors, surveyors, architects, engineers, project monitors, and other professional advisors billing for their fees.\n\n' +
      'Each invoice must contain specific information under UK tax law: the supplier\'s name, address, and VAT registration number (if VAT-registered), a unique invoice number, the date of issue, a description of the goods or services, the net amount, the VAT amount (typically at 20% standard rate), and the gross total payable. Construction industry invoices are subject to additional requirements under the Construction Industry Scheme (CIS), where the contractor must deduct tax at source from payments to subcontractors and account for this to HMRC. CIS invoices will show the gross amount, the CIS deduction (typically 20% or 30%), and the net payment due.\n\n' +
      'In the context of a development loan, invoices serve multiple purposes. They evidence expenditure against the approved project budget, support drawdown requests (lenders require sight of invoices before releasing tranche payments), and form part of the quantity surveyor\'s or monitoring surveyor\'s assessment of works completed. The lender will cross-reference invoices against the cost schedule in the facility agreement to verify that funds are being used for their intended purpose.\n\n' +
      'Invoices from different suppliers vary significantly in format — a builder\'s invoice may be a simple one-page document, while a solicitor\'s bill of costs can run to many pages with detailed time narratives. Regardless of format, the key information for lending purposes is the supplier identity, the amount, the VAT treatment, and the description of works or services that the payment relates to.',
    identificationRules: [
      'PRIMARY: Contains the word "Invoice" or "Tax Invoice" prominently, with a unique invoice number and date',
      'PRIMARY: Shows a net amount, VAT amount (or states VAT exempt/not registered), and gross total payable',
      'CRITICAL: Issued by a supplier/service provider TO the borrower or SPV, requesting payment for goods or services',
      'Includes the supplier\'s name, address, and VAT registration number',
      'Contains a description of goods delivered or services rendered',
      'States payment terms (e.g., "Net 30 days", "Due on receipt", "Payment within 14 days")',
      'May include CIS deduction details for construction industry payments',
      'Often includes the supplier\'s bank account details for payment',
      'May reference a purchase order number, contract reference, or project name',
      'Construction invoices may include application numbers or valuation references',
      'Professional fee invoices may include hourly rates, time entries, or fixed fee references',
    ],
    disambiguation: [
      'An Invoice is a REQUEST FOR PAYMENT from a supplier — a Receipt is PROOF THAT PAYMENT HAS BEEN MADE. An invoice is issued before or at the time of requesting payment; a receipt confirms payment has been received.',
      'An Invoice is a FINANCIAL document requesting payment — it is NOT a Loan Statement (which shows the position of a loan account with a lender).',
      'An Invoice from a solicitor for legal fees is a Financial Document — a Legal Opinion, Certificate of Title, or Report on Title are Legal Documents even though they may come from the same law firm.',
      'A construction application for payment (interim certificate) may accompany or be attached to an invoice but is technically a separate document — though for filing purposes both are treated as invoices.',
    ],
    terminology: {
      'VAT': 'Value Added Tax, currently 20% standard rate in the UK, charged on most goods and services',
      'CIS': 'Construction Industry Scheme — HMRC scheme requiring contractors to deduct tax from subcontractor payments',
      'CIS deduction': 'Tax withheld from a subcontractor payment, typically 20% (verified) or 30% (unverified)',
      'Net amount': 'The amount before VAT is added',
      'Gross amount': 'The total amount including VAT',
      'Payment terms': 'The period within which the invoice must be paid (e.g., Net 30, Due on receipt)',
      'Application for payment': 'Formal request from a contractor for an interim payment based on work completed',
      'Retention': 'Percentage of the invoice amount held back until defects liability period expires (typically 2.5-5%)',
      'Interim certificate': 'Document certifying the value of work completed to date, triggering an interim payment',
    },
    tags: [
      { namespace: 'type', value: 'invoice', weight: 1.0 },
      { namespace: 'domain', value: 'construction', weight: 0.7 },
      { namespace: 'domain', value: 'property-finance', weight: 0.6 },
      { namespace: 'domain', value: 'accounting', weight: 0.8 },
      { namespace: 'signal', value: 'vat-amounts', weight: 0.9 },
      { namespace: 'signal', value: 'invoice-number', weight: 0.9 },
      { namespace: 'signal', value: 'payment-terms', weight: 0.7 },
      { namespace: 'signal', value: 'cis-deduction', weight: 0.8 },
      { namespace: 'context', value: 'expenditure-tracking', weight: 0.7 },
      { namespace: 'trigger', value: 'financial+construction', weight: 0.7 },
    ],
    keywords: [
      'invoice', 'tax invoice', 'invoice number', 'VAT', 'net amount', 'gross amount',
      'payment terms', 'due date', 'CIS', 'CIS deduction', 'subcontractor',
      'application for payment', 'interim certificate', 'retention',
      'VAT registration', 'supply of services', 'bill of costs',
      'professional fees', 'construction works', 'payable', 'remittance',
      'purchase order', 'account payable', 'supplier',
    ],
    filenamePatterns: [
      'invoice',
      'inv[_\\-]?\\d+',
      'tax.?invoice',
      'bill.?of.?costs',
      'fee.?note',
      'application.?for.?payment',
      'payment.?certificate',
    ],
    excludePatterns: [
      'receipt',
      'proof.?of.?payment',
      'bank.?statement',
      'loan.?statement',
      'credit.?note',
      'remittance.?advice',
    ],
    decisionRules: [
      {
        condition: 'Document contains invoice number, VAT breakdown, and supplier details',
        signals: ['invoice-number', 'vat-amounts', 'supplier-details'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document shows CIS deduction from a construction subcontractor payment',
        signals: ['cis-deduction', 'construction-works'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document requests payment for goods or services with an amount due',
        signals: ['payment-terms', 'financial-tables'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'supplierName', 'supplierAddress', 'vatRegistrationNumber', 'invoiceNumber',
      'invoiceDate', 'description', 'netAmount', 'vatAmount', 'grossAmount',
      'paymentTerms', 'dueDate', 'cisDeduction', 'netPayable',
      'supplierBankDetails', 'purchaseOrderNumber', 'projectReference',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ===========================================================================
  // 5. RECEIPT
  // ===========================================================================
  {
    id: 'receipt',
    fileType: 'Receipt',
    category: 'Financial Documents',
    filing: {
      targetFolder: 'Financial',
      targetLevel: 'project',
    },
    description:
      'A receipt is a document that provides proof of payment, confirming that funds have been received by a payee in settlement of an obligation. In UK property development finance, receipts serve as evidence that project expenditure has actually been paid, distinguishing committed costs from invoiced-but-unpaid amounts. Lenders and monitoring surveyors routinely require receipts alongside invoices to verify that drawdown funds have been properly applied to project costs.\n\n' +
      'Receipts can take various forms depending on the payee and the nature of the transaction. A formal receipt may be issued by a supplier acknowledging payment of a specific invoice, marked with a "PAID" stamp or annotation. Bank transfer confirmations showing a payment to a named beneficiary also function as receipts. In the construction industry, a payment and withholding notice under the Housing Grants, Construction and Regeneration Act 1996 (as amended) confirms the amount paid to a contractor. Professional firms such as solicitors and surveyors may issue receipts on their headed paper confirming settlement of their fees.\n\n' +
      'For lender monitoring purposes, the receipt establishes the audit trail from drawdown request through to confirmed payment. When a borrower requests a tranche release, they submit invoices showing what the money is needed for. After the drawdown funds are received and payments made, the receipts confirm that the funds were used as intended. This trail — invoice, drawdown, payment receipt — is fundamental to the lender\'s cost monitoring and is reviewed by the quantity surveyor or monitoring surveyor at each drawdown stage.\n\n' +
      'Receipts are also important for VAT recovery purposes. Where a development project is registered for VAT, the developer needs valid VAT receipts to reclaim input VAT from HMRC. A valid VAT receipt must show the supplier\'s VAT registration number, the VAT amount, and other prescribed details. Incomplete or missing receipts can result in VAT recovery being denied, which has a direct impact on project cash flow and profitability.',
    identificationRules: [
      'PRIMARY: Confirms that payment HAS BEEN RECEIVED or made — contains language such as "received", "paid", "payment confirmed"',
      'PRIMARY: References a specific payment amount and the date on which it was received or processed',
      'CRITICAL: Links to a specific invoice, transaction, or obligation that the payment settles',
      'May bear a "PAID" stamp, watermark, or annotation on or alongside an invoice',
      'Shows the payee\'s confirmation of receipt rather than a request for payment',
      'May be a bank transfer confirmation showing the payment to a named beneficiary',
      'Contains the payer\'s and payee\'s details (names, potentially account numbers)',
      'Often references an invoice number, purchase order, or account reference',
      'May include a receipt number or transaction reference for tracking',
      'Professional firms may issue on headed paper with a confirmation of fee settlement',
      'VAT receipts will include the supplier\'s VAT registration number and VAT breakdown',
    ],
    disambiguation: [
      'A Receipt is PROOF THAT PAYMENT HAS BEEN MADE — an Invoice is a REQUEST FOR PAYMENT. The receipt confirms the financial obligation has been settled; the invoice creates the obligation.',
      'A Receipt confirms payment to a SUPPLIER or SERVICE PROVIDER — a Bank Statement shows ALL transactions on a bank account. A receipt is specific to one payment; a bank statement shows all account activity.',
      'A Receipt shows funds RECEIVED by the payee — a Drawdown Request is a borrower asking the LENDER to release funds. These are opposite directions of money flow.',
      'A payment confirmation from a bank (showing an outgoing transfer) can serve as a receipt — but a bank statement showing the same payment among many other transactions is classified as a Bank Statement.',
    ],
    terminology: {
      'Proof of payment': 'Documentary evidence that a financial obligation has been settled',
      'Remittance advice': 'Notice sent to a supplier confirming that payment has been made, often detailing which invoices are covered',
      'BACS payment': 'Bankers\' Automated Clearing Services — electronic bank-to-bank payment typically taking 3 working days',
      'CHAPS payment': 'Clearing House Automated Payment System — same-day electronic bank transfer for high-value payments',
      'Faster Payment': 'UK electronic payment system enabling near-instant bank transfers up to specified limits',
      'VAT receipt': 'Receipt containing prescribed VAT information enabling the recipient to reclaim input VAT from HMRC',
      'Payment notice': 'Formal notice under construction contracts stating the amount to be paid by a specified date',
    },
    tags: [
      { namespace: 'type', value: 'receipt', weight: 1.0 },
      { namespace: 'domain', value: 'property-finance', weight: 0.6 },
      { namespace: 'domain', value: 'accounting', weight: 0.8 },
      { namespace: 'signal', value: 'payment-confirmation', weight: 1.0 },
      { namespace: 'signal', value: 'paid-stamp', weight: 0.9 },
      { namespace: 'signal', value: 'transaction-reference', weight: 0.7 },
      { namespace: 'signal', value: 'vat-amounts', weight: 0.6 },
      { namespace: 'context', value: 'expenditure-tracking', weight: 0.7 },
      { namespace: 'trigger', value: 'financial+payment', weight: 0.8 },
    ],
    keywords: [
      'receipt', 'proof of payment', 'payment received', 'paid', 'payment confirmation',
      'remittance', 'remittance advice', 'BACS', 'CHAPS', 'faster payment',
      'bank transfer', 'transaction reference', 'payment date', 'settled',
      'VAT receipt', 'received with thanks', 'payment notice',
      'amount paid', 'funds received', 'cleared funds', 'confirmation of payment',
      'settlement', 'payment record',
    ],
    filenamePatterns: [
      'receipt',
      'payment.?receipt',
      'proof.?of.?payment',
      'payment.?confirmation',
      'remittance',
      'paid.?invoice',
      'payment.?advice',
    ],
    excludePatterns: [
      'invoice(?!.*paid)',
      'bank.?statement',
      'loan.?statement',
      'drawdown.?request',
      'credit.?note',
    ],
    decisionRules: [
      {
        condition: 'Document confirms payment received with amount and date',
        signals: ['payment-confirmation', 'transaction-reference'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document bears a PAID stamp or annotation on an existing invoice',
        signals: ['paid-stamp', 'invoice-number'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Bank transfer confirmation showing payment to a named beneficiary',
        signals: ['payment-confirmation', 'bank-transfer-details'],
        priority: 6,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'payeeName', 'payerName', 'amountPaid', 'paymentDate', 'receiptNumber',
      'transactionReference', 'invoiceReference', 'paymentMethod',
      'vatAmount', 'netAmount', 'grossAmount', 'vatRegistrationNumber',
      'description', 'projectReference',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },

  // ===========================================================================
  // 6. TAX RETURN
  // ===========================================================================
  {
    id: 'tax-return',
    fileType: 'Tax Return',
    category: 'Financial Documents',
    filing: {
      targetFolder: 'KYC',
      targetLevel: 'client',
    },
    description:
      'A tax return in the context of UK property finance lending refers to the HMRC self-assessment tax return filed by an individual borrower, guarantor, or director. The primary forms encountered are the SA100 (the main self-assessment tax return) and the SA302 (the tax calculation summary produced by HMRC based on the return). These documents are used extensively in know-your-customer (KYC) and affordability assessments as they provide an independently verified picture of an individual\'s income, tax liability, and financial position.\n\n' +
      'The SA100 is the full self-assessment form comprising a main return and supplementary pages. Supplementary pages relevant to property finance include the SA105 (UK property income), SA108 (capital gains), and SA103 (self-employment). The return shows total income from all sources — employment, self-employment, rental property, dividends, interest, and capital gains — along with allowable deductions, reliefs claimed, and the resulting tax liability. For lenders, the tax return provides a comprehensive and officially declared picture of the borrower\'s earnings that can be cross-referenced against bank statements and accountant\'s references.\n\n' +
      'The SA302 is a concise summary document produced by HMRC (or printed from the HMRC online portal) showing the individual\'s total income and tax calculation for a specific tax year. It is often the preferred document for lending decisions because it is short, standardised, and produced by HMRC rather than the taxpayer themselves. Lenders typically request SA302s for the most recent two or three tax years to assess income consistency and trends.\n\n' +
      'Tax returns are filed with HMRC using the individual\'s Unique Taxpayer Reference (UTR) number, a 10-digit identifier that appears on all correspondence and returns. The UTR, along with the National Insurance number, uniquely identifies the taxpayer. For property finance applications, tax returns help lenders verify declared income, assess the borrower\'s ability to service or repay the loan, and meet regulatory requirements around responsible lending and anti-money laundering checks.',
    identificationRules: [
      'PRIMARY: Contains HMRC branding, SA100 form reference, or SA302 tax calculation header',
      'PRIMARY: Shows a Unique Taxpayer Reference (UTR) number — a 10-digit numeric identifier',
      'CRITICAL: Displays income, tax liability, and National Insurance contributions for a specific tax year',
      'References a tax year in the format "Year to 5 April 20XX" or "20XX-XX"',
      'Contains sections for employment income, self-employment income, property income, capital gains',
      'SA302 format shows "Tax Calculation" as a title with total income and tax due figures',
      'Includes the taxpayer\'s full name and potentially their National Insurance number',
      'May include supplementary pages such as SA105 (property), SA108 (capital gains), SA103 (self-employment)',
      'Contains references to tax bands, personal allowance, and applicable tax rates',
      'May show payments on account, tax already paid, and the balancing payment due',
      'Filed or produced through HMRC systems — may show HMRC online portal formatting',
    ],
    disambiguation: [
      'A Tax Return is an HMRC self-assessment filing showing income and tax liability — a Bank Statement shows bank account transactions. Both can evidence income, but a tax return is the official declaration to HMRC.',
      'An SA302 is a TAX CALCULATION summary produced by HMRC — a Tax Return (SA100) is the FULL self-assessment form filed by the taxpayer. The SA302 is derived from the SA100 but is a separate, shorter document.',
      'A Tax Return shows an individual\'s personal tax position — a Company Accounts or Corporation Tax Return (CT600) is the equivalent for a limited company. These are different document types.',
      'A Tax Return is a Financial Document filed under KYC for verification purposes — it is not the same as a tax invoice (which is a commercial invoice showing VAT) despite both containing the word "tax".',
    ],
    terminology: {
      'SA100': 'The main HMRC self-assessment tax return form for individuals',
      'SA302': 'HMRC tax calculation summary showing total income and tax due for a tax year',
      'UTR': 'Unique Taxpayer Reference — a 10-digit number assigned by HMRC to identify each taxpayer',
      'Self-assessment': 'The UK system where individuals calculate and report their own tax liability to HMRC',
      'Tax year': 'The UK tax year runs from 6 April to 5 April the following year',
      'Personal allowance': 'The amount of income an individual can earn tax-free (currently GBP 12,570)',
      'Payments on account': 'Advance payments towards the next year\'s tax bill, each equal to 50% of the previous year\'s liability',
      'SA105': 'Supplementary page for UK property income on the self-assessment tax return',
      'National Insurance number': 'Unique identifier for an individual in the UK tax and benefits system',
      'HMRC': 'Her Majesty\'s Revenue & Customs — the UK government department responsible for tax collection',
    },
    tags: [
      { namespace: 'type', value: 'tax-return', weight: 1.0 },
      { namespace: 'domain', value: 'kyc', weight: 0.9 },
      { namespace: 'domain', value: 'tax', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.5 },
      { namespace: 'signal', value: 'hmrc-branding', weight: 1.0 },
      { namespace: 'signal', value: 'utr-number', weight: 0.9 },
      { namespace: 'signal', value: 'tax-calculation', weight: 0.9 },
      { namespace: 'signal', value: 'income-declaration', weight: 0.8 },
      { namespace: 'context', value: 'identity-verification', weight: 0.7 },
      { namespace: 'trigger', value: 'kyc+financial', weight: 0.8 },
    ],
    keywords: [
      'tax return', 'SA100', 'SA302', 'self-assessment', 'HMRC', 'UTR',
      'unique taxpayer reference', 'tax calculation', 'total income', 'tax liability',
      'national insurance', 'personal allowance', 'tax year', 'employment income',
      'self-employment income', 'property income', 'capital gains', 'SA105',
      'SA108', 'SA103', 'payments on account', 'tax due', 'tax bands',
      'balancing payment',
    ],
    filenamePatterns: [
      'tax.?return',
      'sa100',
      'sa302',
      'self.?assessment',
      'hmrc.?tax',
      'tax.?calculation',
      'tax.?summary',
    ],
    excludePatterns: [
      'bank.?statement',
      'tax.?invoice',
      'vat.?return',
      'corporation.?tax',
      'ct600',
      'company.?accounts',
    ],
    decisionRules: [
      {
        condition: 'Document contains HMRC branding with UTR number and tax calculation',
        signals: ['hmrc-branding', 'utr-number', 'tax-calculation'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document shows SA302 tax calculation or SA100 self-assessment form',
        signals: ['sa-form-reference', 'income-declaration'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Document contains income figures and tax year references from HMRC',
        signals: ['income-declaration', 'hmrc-branding'],
        priority: 5,
        action: 'include',
      },
    ],
    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],
    expectedFields: [
      'taxpayerName', 'utrNumber', 'nationalInsuranceNumber', 'taxYear',
      'employmentIncome', 'selfEmploymentIncome', 'propertyIncome', 'capitalGains',
      'totalIncome', 'personalAllowance', 'taxableIncome', 'incomeTaxDue',
      'nationalInsuranceContributions', 'totalTaxDue', 'paymentsOnAccount',
      'balancingPayment',
    ],
    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },
];
