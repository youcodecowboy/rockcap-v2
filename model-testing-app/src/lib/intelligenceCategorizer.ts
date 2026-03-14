/**
 * Auto-categorizes an extracted attribute label into a display category.
 * Used as a fallback when an attribute doesn't match any canonical field.
 * Returns one of the standard category names for UI display.
 */

const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/\b(loan|interest\s*rate|ltv|ltgdv|facility|covenant|drawdown|bridging|mezzanine|senior\s*debt)\b/i, 'Loan Terms'],
  [/\b(planning|permitted\s*dev(elopment)?|s106|cil|use\s*class|planning\s*ref(erence)?|planning\s*condition)\b/i, 'Planning'],
  [/\b(valuation|gdv|comparable|market\s*value|day\s*one\s*value|apprai)/i, 'Valuation'],
  [/\b(contract\s*(sum|type|value)|build\s*(cost|programme)|contractor|construct|retention|defects|warranty\s*provider|nhbc|premier\s*guarantee)\b/i, 'Construction'],
  [/\b(title\s*(number|deed)|tenure|freehold|leasehold|solicitor|conveyancer|report\s*on\s*title|ground\s*rent)\b/i, 'Legal / Title'],
  [/\b(insurance|indemnity|liability|policy|all\s*risks|CAR)\b/i, 'Insurance'],
  [/\b(exit\s*strat(egy)?|sales?\s*(agent|revenue|price)|units?\s*reserved|reserved|exchanged|completion|disposal)\b/i, 'Sales / Exit'],
  [/\b(kyc|aml|pep|sanctions?\s*(check|screen)?|sanction|due\s*diligence|identity\s*verif|source\s*of\s*(funds|wealth)|money\s*launder)\b/i, 'KYC / Due Diligence'],
  [/\b(guarantee|dispute|bankrupt|ccj|litigation|insolvency|legal\s*action)\b/i, 'Legal'],
  [/\b(contact|email|phone|mobile|address|postcode)\b/i, 'Contact Info'],
  [/\b(company|director|shareholder|registration|vat|incorporat|trading\s*name|ubo|beneficial\s*owner)\b/i, 'Company'],
  [/\b(income|net\s*worth|assets?|debt|credit|bank|portfolio\s*value|liquid)\b/i, 'Financial'],
  [/\b(experience|track\s*record|projects?\s*completed|specializ|expertise)\b/i, 'Experience'],
];

export function categorizeAttribute(label: string): string {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(label)) {
      return category;
    }
  }
  return 'Other';
}
