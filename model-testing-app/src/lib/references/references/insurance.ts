// =============================================================================
// INSURANCE — DOCUMENT REFERENCES
// =============================================================================

import type { DocumentReference } from '../types';

export const INSURANCE_REFERENCES: DocumentReference[] = [
  // ---------------------------------------------------------------------------
  // 1. Insurance Policy
  // ---------------------------------------------------------------------------
  {
    id: 'insurance-policy',
    fileType: 'Insurance Policy',
    category: 'Insurance',

    filing: {
      targetFolder: 'Insurance',
      targetLevel: 'project',
    },

    description:
      'An Insurance Policy is the full contractual document issued by an insurer (or via a broker) ' +
      'setting out the complete terms, conditions, exclusions, and endorsements of an insurance ' +
      'cover arrangement. In UK development finance, the lender typically requires the borrower to ' +
      'maintain several insurance policies across the life of the loan: Contractor\'s All Risks (CAR) ' +
      'insurance covering the construction works, materials, and temporary structures against physical ' +
      'loss or damage during the build phase; Professional Indemnity (PI) insurance protecting against ' +
      'claims arising from professional negligence by architects, engineers, or other consultants; ' +
      'buildings insurance covering the reinstatement value of the completed or existing structure; ' +
      'public liability insurance covering third-party injury or property damage claims; and employer\'s ' +
      'liability insurance where the borrower has employees on site. The policy document itself is ' +
      'considerably longer and more detailed than a certificate of insurance. It will contain the full ' +
      'policy wording, the policy schedule (summarising key details such as the insured parties, period ' +
      'of insurance, sums insured, excesses, and endorsements), general and specific conditions, and ' +
      'exclusion clauses. For lenders, it is critical that the policy includes a "noted interest" or ' +
      '"joint insured" clause ensuring the lender\'s interest in the property is protected. The sum ' +
      'insured must reflect the full reinstatement value plus professional fees and demolition costs. ' +
      'The policy excess must be reasonable and within parameters acceptable to the lender. Policies ' +
      'are typically arranged through an insurance broker and renewed annually, though CAR policies ' +
      'may run for the duration of the construction contract. The lender\'s solicitor will review the ' +
      'policy to confirm it meets the facility agreement requirements before drawdown is permitted.',

    identificationRules: [
      'PRIMARY: Document is titled "Policy Document", "Policy Wording", "Insurance Policy", or "Policy Schedule" and contains full terms and conditions',
      'PRIMARY: Contains detailed policy sections including insuring clauses, general conditions, exclusions, and endorsements',
      'CRITICAL: Includes a policy schedule with named insured, policy number, period of insurance, and sums insured',
      'Contains full policy wording with definitions section explaining key terms used throughout the policy',
      'Lists specific exclusions and limitations of cover in dedicated sections',
      'Includes endorsements or special conditions modifying the standard policy wording',
      'References specific types of cover such as CAR, buildings, PI, public liability, or employer\'s liability',
      'Contains claims notification procedures and conditions precedent to liability',
      'Document is typically 10+ pages in length with structured sections and legal language',
      'Includes excess/deductible amounts and basis of settlement (reinstatement, indemnity, or agreed value)',
      'May reference noted interest or joint insured provisions naming the lender',
      'Issued by an insurance company or underwriter, often via a broker or managing general agent',
    ],

    disambiguation: [
      'Insurance Policy vs Insurance Certificate: A policy is the FULL contractual document containing complete terms, conditions, exclusions, and endorsements (typically 10+ pages). A certificate is a brief SUMMARY confirmation (usually 1-2 pages) issued by the broker confirming cover is in place. If the document has full policy wording and exclusion clauses, it is a Policy.',
      'Insurance Policy vs NHBC Warranty: An insurance policy is arranged through an insurer/broker and covers risks like fire, flood, theft, or construction damage. An NHBC Buildmark warranty is a construction defects guarantee issued by the NHBC covering structural defects for 10 years post-completion. NHBC documents reference "Buildmark" and structural defects, not general insurance perils.',
      'Insurance Policy vs Collateral Warranty: An insurance policy provides indemnity against specified risks from an insurer. A collateral warranty is a contractual agreement from a construction professional (architect, contractor, engineer) giving a third party (typically the lender or buyer) direct rights to sue for defective work. Collateral warranties reference "duty of care" and "step-in rights", not premiums or sums insured.',
    ],

    terminology: {
      'CAR Insurance': 'Contractor\'s All Risks — covers physical loss or damage to the construction works, materials, and temporary structures during the build phase',
      'PI Insurance': 'Professional Indemnity — covers claims arising from professional negligence by architects, engineers, quantity surveyors, or other consultants',
      'Buildings Insurance': 'Covers the physical structure against perils such as fire, flood, storm, subsidence, and other insured events',
      'Public Liability': 'Covers third-party claims for bodily injury or property damage arising from the insured\'s activities',
      'Employer\'s Liability': 'Statutory insurance covering employees injured or made ill as a result of their employment',
      'Noted Interest': 'Endorsement noting the lender\'s financial interest in the insured property, ensuring the lender is notified of cancellation or material changes',
      'Joint Insured': 'Arrangement where the lender is named as a co-insured party on the policy, providing direct rights under the policy',
      'Sum Insured': 'The maximum amount the insurer will pay under the policy, typically based on the reinstatement value of the property',
      'Reinstatement Value': 'The cost of rebuilding or reinstating the property to its original condition, including professional fees and demolition costs',
      'Policy Excess': 'The amount the insured must bear before the insurer pays out on a claim, also known as the deductible',
      'Policy Schedule': 'The section of the policy summarising the key details: named insured, policy number, period, sums insured, excesses, and endorsements',
      'Insuring Clause': 'The core clause setting out what the insurer agrees to cover and under what circumstances',
      'Broker': 'Insurance intermediary who arranges cover on behalf of the insured and typically issues certificates of insurance',
    },

    tags: [
      { namespace: 'type', value: 'insurance-policy', weight: 1.0 },
      { namespace: 'domain', value: 'insurance', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.7 },
      { namespace: 'domain', value: 'construction', weight: 0.6 },
      { namespace: 'signal', value: 'policy-wording', weight: 0.9 },
      { namespace: 'signal', value: 'insurance-schedule', weight: 0.85 },
      { namespace: 'signal', value: 'exclusion-clauses', weight: 0.8 },
      { namespace: 'signal', value: 'sum-insured', weight: 0.7 },
      { namespace: 'signal', value: 'noted-interest', weight: 0.7 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'filing', weight: 0.8 },
      { namespace: 'context', value: 'extraction', weight: 0.7 },
      { namespace: 'trigger', value: 'insurance+policy-terms', weight: 0.9 },
    ],

    keywords: [
      'insurance policy',
      'policy wording',
      'policy schedule',
      'insuring clause',
      'exclusions',
      'endorsements',
      'sum insured',
      'reinstatement value',
      'policy excess',
      'deductible',
      'contractors all risks',
      'CAR insurance',
      'professional indemnity',
      'buildings insurance',
      'public liability',
      'employers liability',
      'noted interest',
      'joint insured',
      'period of insurance',
      'conditions precedent',
      'claims notification',
      'underwriter',
      'premium',
      'indemnity',
      'broker',
    ],

    filenamePatterns: [
      'insurance[_\\-\\s]?policy',
      'policy[_\\-\\s]?wording',
      'policy[_\\-\\s]?document',
      'policy[_\\-\\s]?schedule',
      'CAR[_\\-\\s]?policy',
      'PI[_\\-\\s]?policy',
      'buildings[_\\-\\s]?insurance',
      'public[_\\-\\s]?liability[_\\-\\s]?policy',
      'employers[_\\-\\s]?liability[_\\-\\s]?policy',
    ],

    excludePatterns: [
      'certificate[_\\-\\s]?of[_\\-\\s]?insurance',
      'insurance[_\\-\\s]?certificate',
      'NHBC',
      'buildmark',
      'collateral[_\\-\\s]?warranty',
      'warranty[_\\-\\s]?certificate',
    ],

    decisionRules: [
      {
        condition: 'Document contains full policy wording with terms, conditions, and exclusions',
        signals: ['policy-wording', 'exclusion-clauses', 'insuring-clause'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document includes a policy schedule with sums insured and policy number',
        signals: ['insurance-schedule', 'sum-insured', 'policy-number'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Document references CAR, PI, buildings, or liability insurance',
        signals: ['car-insurance', 'pi-insurance', 'buildings-insurance', 'liability-insurance'],
        priority: 7,
        action: 'include',
      },
      {
        condition: 'Document contains noted interest or joint insured provisions for the lender',
        signals: ['noted-interest', 'joint-insured', 'lender-protection'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Document is a brief 1-2 page summary — likely a certificate, not a full policy',
        signals: ['short-document', 'summary-format', 'certificate-format'],
        priority: 6,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'insurance.policyNumber',
      'insurance.insurer',
      'insurance.insured',
      'insurance.broker',
      'insurance.typeOfCover',
      'insurance.periodFrom',
      'insurance.periodTo',
      'insurance.sumInsured',
      'insurance.excess',
      'insurance.notedInterest',
      'insurance.endorsements',
      'insurance.premium',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2025-07-20',
  },

  // ---------------------------------------------------------------------------
  // 2. Insurance Certificate
  // ---------------------------------------------------------------------------
  {
    id: 'insurance-certificate',
    fileType: 'Insurance Certificate',
    category: 'Insurance',

    filing: {
      targetFolder: 'Insurance',
      targetLevel: 'project',
    },

    description:
      'An Insurance Certificate (also known as a Certificate of Insurance or Evidence of Insurance) ' +
      'is a concise summary document issued by an insurance broker or insurer confirming that an ' +
      'insurance policy is in force. Unlike the full policy document, a certificate is typically one ' +
      'to two pages and is designed to provide quick confirmation of cover to third parties — most ' +
      'commonly the lender, employer, or principal contractor. In UK development finance, the lender\'s ' +
      'solicitor will request insurance certificates as part of the conditions precedent to drawdown, ' +
      'confirming that the borrower has arranged adequate cover. The certificate will state the key ' +
      'details of the underlying policy: the name of the insured, the insurance company, the broker, ' +
      'the policy number, the period of insurance, the type of cover (e.g., CAR, buildings, PI, public ' +
      'liability, employer\'s liability), the sum insured or limit of indemnity, and the excess. It ' +
      'will confirm whether the lender\'s interest has been noted on the policy. Certificates are ' +
      'commonly issued when a new policy is bound, at renewal, or upon request from a party requiring ' +
      'proof of insurance. It is important to note that a certificate is NOT the policy itself — it ' +
      'does not contain the full terms, conditions, or exclusions. If there is a discrepancy between ' +
      'the certificate and the policy, the policy prevails. For lenders, the certificate serves as a ' +
      'quick verification tool, but the full policy document should also be obtained and reviewed for ' +
      'compliance with facility agreement requirements. Certificates are frequently used in construction ' +
      'finance to demonstrate that multiple insurance requirements (CAR, PI, public liability) are ' +
      'satisfied simultaneously without providing the full wording for each policy.',

    identificationRules: [
      'PRIMARY: Document is titled "Certificate of Insurance", "Insurance Certificate", or "Evidence of Insurance"',
      'PRIMARY: Brief document (1-2 pages) summarising key insurance details without full policy wording',
      'CRITICAL: Contains a summary of cover details — policy number, insured, period, sum insured — but no full terms and conditions',
      'Issued by an insurance broker or insurer as confirmation of cover for a third party',
      'Does not contain full exclusion clauses, conditions, or policy wording sections',
      'May state "This certificate is issued as a matter of information only and confers no rights upon the certificate holder"',
      'Includes a declaration that the named policy is currently in force',
      'References the underlying policy number and insurer without reproducing the policy terms',
      'May confirm that the lender\'s interest has been noted on the underlying policy',
      'Typically formatted as a structured summary or table rather than lengthy legal prose',
      'Often includes the broker\'s letterhead, stamp, or authorised signatory',
    ],

    disambiguation: [
      'Insurance Certificate vs Insurance Policy: A certificate is a SHORT SUMMARY (1-2 pages) confirming cover is in place, issued for the benefit of a third party. A policy is the FULL contractual document (10+ pages) with complete terms, conditions, exclusions, and endorsements. If the document contains full policy wording and exclusion clauses, it is a Policy, not a Certificate.',
      'Insurance Certificate vs Collateral Warranty: An insurance certificate confirms that an insurance policy is in force and summarises its key terms. A collateral warranty is a contractual agreement from a professional (architect, contractor) providing direct rights of action to a third party (lender/buyer). Collateral warranties contain "duty of care", "step-in rights", and contractual obligations — not insurance cover details.',
      'Insurance Certificate vs NHBC Warranty: An insurance certificate is a broker-issued confirmation of commercial insurance cover. An NHBC warranty certificate is a construction defects guarantee from the National House Building Council covering structural defects for 10 years. NHBC documents reference "Buildmark", building standards, and defect periods — not brokers, premiums, or policy numbers.',
    ],

    terminology: {
      'Certificate of Insurance': 'A document issued by a broker or insurer confirming that a specified policy is in force and summarising its key terms',
      'Noted Interest': 'Confirmation on the certificate that the lender\'s financial interest has been recorded on the underlying policy',
      'Limit of Indemnity': 'The maximum amount payable under the policy for any one claim or in aggregate, as stated on the certificate',
      'Period of Insurance': 'The dates between which the insurance cover is effective, as confirmed by the certificate',
      'Sum Insured': 'The amount of cover as stated on the certificate, reflecting the reinstatement value or agreed cover level',
      'Policy Excess': 'The first amount payable by the insured on any claim, as noted on the certificate',
      'Broker': 'The insurance intermediary who arranges the cover and typically issues the certificate on behalf of the insurer',
      'CAR Insurance': 'Contractor\'s All Risks — the certificate may confirm CAR cover is in place for the construction works',
      'PI Insurance': 'Professional Indemnity — the certificate may confirm PI cover for design professionals on the project',
      'Conditions Precedent': 'Requirements in the facility agreement that must be satisfied before drawdown, often including provision of insurance certificates',
    },

    tags: [
      { namespace: 'type', value: 'insurance-certificate', weight: 1.0 },
      { namespace: 'domain', value: 'insurance', weight: 0.9 },
      { namespace: 'domain', value: 'property-finance', weight: 0.7 },
      { namespace: 'domain', value: 'construction', weight: 0.5 },
      { namespace: 'signal', value: 'certificate-format', weight: 0.9 },
      { namespace: 'signal', value: 'insurance-confirmation', weight: 0.85 },
      { namespace: 'signal', value: 'summary-format', weight: 0.8 },
      { namespace: 'signal', value: 'broker-issued', weight: 0.7 },
      { namespace: 'signal', value: 'noted-interest', weight: 0.65 },
      { namespace: 'context', value: 'classification', weight: 0.8 },
      { namespace: 'context', value: 'filing', weight: 0.8 },
      { namespace: 'context', value: 'checklist', weight: 0.7 },
      { namespace: 'trigger', value: 'insurance+certificate-confirmation', weight: 0.9 },
    ],

    keywords: [
      'certificate of insurance',
      'insurance certificate',
      'evidence of insurance',
      'confirmation of cover',
      'cover note',
      'policy number',
      'sum insured',
      'limit of indemnity',
      'period of insurance',
      'noted interest',
      'broker',
      'excess',
      'insured party',
      'type of cover',
      'CAR certificate',
      'PI certificate',
      'buildings insurance certificate',
      'public liability certificate',
      'employers liability certificate',
      'renewal confirmation',
      'insurance confirmation',
      'cover confirmation',
    ],

    filenamePatterns: [
      'insurance[_\\-\\s]?certificate',
      'certificate[_\\-\\s]?of[_\\-\\s]?insurance',
      'evidence[_\\-\\s]?of[_\\-\\s]?insurance',
      'cover[_\\-\\s]?note',
      'confirmation[_\\-\\s]?of[_\\-\\s]?cover',
      'insurance[_\\-\\s]?confirmation',
      'COI',
    ],

    excludePatterns: [
      'policy[_\\-\\s]?wording',
      'policy[_\\-\\s]?document',
      'full[_\\-\\s]?policy',
      'terms[_\\-\\s]?and[_\\-\\s]?conditions',
      'NHBC',
      'buildmark',
      'collateral[_\\-\\s]?warranty',
    ],

    decisionRules: [
      {
        condition: 'Document is a short summary confirming insurance cover without full policy terms',
        signals: ['certificate-format', 'insurance-confirmation', 'summary-format'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Document is issued by a broker confirming cover is in place for a third party',
        signals: ['broker-issued', 'third-party-confirmation', 'noted-interest'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Document references specific policy number and confirms period of insurance',
        signals: ['policy-number', 'period-of-insurance', 'sum-insured'],
        priority: 7,
        action: 'include',
      },
      {
        condition: 'Document contains full policy wording and exclusion clauses — likely a policy not a certificate',
        signals: ['policy-wording', 'exclusion-clauses', 'full-terms'],
        priority: 8,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'summarization', 'filing', 'extraction', 'chat', 'checklist'],

    expectedFields: [
      'insurance.policyNumber',
      'insurance.insurer',
      'insurance.insured',
      'insurance.broker',
      'insurance.typeOfCover',
      'insurance.periodFrom',
      'insurance.periodTo',
      'insurance.sumInsured',
      'insurance.limitOfIndemnity',
      'insurance.excess',
      'insurance.notedInterest',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2025-07-20',
  },
];
