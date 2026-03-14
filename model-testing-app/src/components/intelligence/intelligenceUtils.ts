// src/components/intelligence/intelligenceUtils.ts

export type ConfidenceLevel = 'green' | 'amber' | 'red';

export function getConfidenceColor(confidence: number): ConfidenceLevel {
  if (confidence >= 0.85) return 'green';
  if (confidence >= 0.60) return 'amber';
  return 'red';
}

export function getConfidenceLabel(confidence: number): string {
  return `${Math.floor(confidence * 100)}%`;
}

export function getRelativeTimeString(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

const CATEGORY_ICONS: Record<string, string> = {
  'Contact Info': '👤',
  'Company': '🏢',
  'Financial': '💰',
  'Experience': '📋',
  'KYC / Due Diligence': '🔍',
  'Legal': '⚖️',
  'Loan Terms': '📑',
  'Valuation': '🏠',
  'Planning': '📐',
  'Construction': '🔨',
  'Legal / Title': '📜',
  'Insurance': '🛡️',
  'Sales / Exit': '📈',
  'Other': '📦',
};

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? '📦';
}

const FIELD_PREFIX_TO_CATEGORY: Record<string, string> = {
  'contact': 'Contact Info',
  'company': 'Company',
  'financial': 'Financial',
  'financials': 'Financial',
  'experience': 'Experience',
  'kyc': 'KYC / Due Diligence',
  'clientLegal': 'Legal',
  'legal': 'Legal / Title',
  'loanTerms': 'Loan Terms',
  'valuation': 'Valuation',
  'planning': 'Planning',
  'construction': 'Construction',
  'title': 'Legal / Title',
  'insurance': 'Insurance',
  'exit': 'Sales / Exit',
  'overview': 'Overview',
  'location': 'Location',
  'timeline': 'Timeline',
  'development': 'Development',
  'parties': 'Key Parties',
  'conditions': 'Loan Terms',
  'risk': 'Risk',
};

export function getCategoryForField(fieldKey: string): string {
  const prefix = fieldKey.split('.')[0];
  return FIELD_PREFIX_TO_CATEGORY[prefix] ?? 'Other';
}

interface EvidenceEntry {
  fieldPath: string;
  value: unknown;
  confidence: number;
  [key: string]: unknown;
}

export function detectConflicts(
  evidenceTrail: EvidenceEntry[],
  fieldPath: string
): EvidenceEntry[] {
  const entries = evidenceTrail.filter(e => e.fieldPath === fieldPath);
  if (entries.length <= 1) return [];

  // Sort by confidence desc; the first is the "current" value
  const sorted = [...entries].sort((a, b) => b.confidence - a.confidence);
  const current = sorted[0];

  // Return entries with different values (conflicts)
  return sorted.slice(1).filter(e =>
    String(e.value).toLowerCase() !== String(current.value).toLowerCase()
  );
}

// Confidence color CSS classes for card left border
export const CONFIDENCE_BORDER_COLORS = {
  green: 'border-l-green-500',
  amber: 'border-l-amber-500',
  red: 'border-l-red-500',
} as const;

export const CONFIDENCE_BADGE_STYLES = {
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
} as const;
