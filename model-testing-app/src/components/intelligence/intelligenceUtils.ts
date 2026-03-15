// src/components/intelligence/intelligenceUtils.ts

import {
  User,
  Building2,
  PoundSterling,
  ClipboardList,
  Search,
  Scale,
  FileText,
  Home,
  Ruler,
  Hammer,
  ScrollText,
  Shield,
  TrendingUp,
  Package,
  LayoutDashboard,
  MapPin,
  Calendar,
  Layers,
  Users,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

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

const CATEGORY_LUCIDE_ICONS: Record<string, LucideIcon> = {
  'Contact Info': User,
  'Company': Building2,
  'Financial': PoundSterling,
  'Experience': ClipboardList,
  'KYC / Due Diligence': Search,
  'Legal': Scale,
  'Loan Terms': FileText,
  'Valuation': Home,
  'Planning': Ruler,
  'Construction': Hammer,
  'Legal / Title': ScrollText,
  'Insurance': Shield,
  'Sales / Exit': TrendingUp,
  'Overview': LayoutDashboard,
  'Location': MapPin,
  'Timeline': Calendar,
  'Development': Layers,
  'Key Parties': Users,
  'Risk': AlertTriangle,
  'Other': Package,
};

export function getCategoryLucideIcon(category: string): LucideIcon {
  return CATEGORY_LUCIDE_ICONS[category] ?? Package;
}

/** @deprecated Use getCategoryLucideIcon instead */
export function getCategoryIcon(category: string): string {
  return category;
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

export interface EvidenceEntry {
  fieldPath: string;
  value: unknown;
  confidence: number;
  sourceDocumentName?: string;
  sourceDocumentId?: string;
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

// Re-export for consumers that need to render category icons
export type { LucideIcon };

// Field keys whose canonical type is 'currency'
const CURRENCY_PREFIXES = new Set([
  'loanAmount', 'netLoan', 'facilityAmount', 'arrangementFee', 'exitFee',
  'contractSum', 'groundRent', 'averageSalesPrice', 'totalSalesRevenue',
  'dayOneValue', 'marketValue', 'gdv', 'coverAmount', 'constructionCost',
  'netWorth', 'portfolioValue', 'totalAssets', 'annualIncome',
]);

// Field keys whose canonical type is 'percentage'
const PERCENTAGE_PREFIXES = new Set([
  'ltv', 'ltc', 'ltgdv', 'interestRate', 'currentProgress', 'retentionPercent',
]);

export interface ContributingDocument {
  id: string;
  name: string;
  fieldCount: number;
}

export function deriveContributingDocuments(
  activeItems: Array<{ sourceDocumentId?: unknown; sourceDocumentName?: string; fieldPath: string }>,
  supersededItems: Array<{ sourceDocumentId?: unknown; sourceDocumentName?: string; fieldPath: string }>,
): ContributingDocument[] {
  const docMap = new Map<string, ContributingDocument>();
  const allItems = [...activeItems, ...supersededItems];

  for (const item of allItems) {
    if (!item.sourceDocumentId) continue;
    const docId = String(item.sourceDocumentId);
    const existing = docMap.get(docId);
    if (existing) {
      existing.fieldCount++;
    } else {
      docMap.set(docId, {
        id: docId,
        name: item.sourceDocumentName || 'Unknown',
        fieldCount: 1,
      });
    }
  }

  return Array.from(docMap.values());
}

/**
 * Format a field value for display based on the field key.
 * Adds £ and commas for currency, % for percentages, commas for numbers.
 */
export function formatFieldValue(value: string | number, fieldKey: string): string {
  const fieldName = fieldKey.split('.').pop() ?? '';

  // Check if this is a numeric value we can format
  const numVal = typeof value === 'number' ? value : parseFloat(String(value));
  const isNumeric = !isNaN(numVal) && String(value).trim() !== '';

  if (isNumeric) {
    // Currency fields: £1,234,567
    if (CURRENCY_PREFIXES.has(fieldName) || fieldKey.includes('Amount') || fieldKey.includes('Cost') || fieldKey.includes('Price') || fieldKey.includes('Revenue') || fieldKey.includes('Value') || fieldKey.includes('Fee') || fieldKey.includes('Rent')) {
      return `£${numVal.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
    }

    // Percentage fields: 45.5%
    if (PERCENTAGE_PREFIXES.has(fieldName) || fieldKey.includes('Rate') || fieldKey.includes('Percent') || fieldKey.includes('Progress')) {
      return `${numVal}%`;
    }

    // Plain numbers: add commas
    if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) {
      return numVal.toLocaleString('en-GB');
    }
  }

  return String(value);
}
