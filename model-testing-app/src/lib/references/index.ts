// =============================================================================
// SHARED REFERENCE LIBRARY — PUBLIC API
// =============================================================================
// Import this module from anywhere in the app:
//   import { resolveReferences, getAllReferences } from '@/lib/references';

export type {
  DocumentReference,
  DocumentCategory,
  AIContext,
  TagNamespace,
  ReferenceTag,
  DecisionRule,
  ResolveOptions,
  ResolvedResult,
  ResolvedReference,
  BatchDocumentInput,
} from './types';

export { resolveReferences, resolveReferencesForBatch } from './resolver';
export { formatForPrompt } from './formatter';
export { clearReferenceCache } from './cache';

// =============================================================================
// REFERENCE REGISTRY
// =============================================================================
// All system references are loaded from category files at import time.
// This is fast (no DB/file I/O) and git-versioned.

import type { DocumentReference } from './types';

import { APPRAISAL_REFERENCES } from './references/appraisals';
import { KYC_REFERENCES } from './references/kyc';
import { LEGAL_REFERENCES } from './references/legal-documents';
import { LOAN_TERMS_REFERENCES } from './references/loan-terms';
import { INSPECTION_REFERENCES } from './references/inspections';
import { PROFESSIONAL_REPORT_REFERENCES } from './references/professional-reports';
import { PLAN_REFERENCES } from './references/plans';
import { INSURANCE_REFERENCES } from './references/insurance';
import { FINANCIAL_REFERENCES } from './references/financial-documents';
import { COMMUNICATION_REFERENCES } from './references/communications';
import { WARRANTY_REFERENCES } from './references/warranties';
import { PROJECT_DOCUMENT_REFERENCES } from './references/project-documents';
import { PHOTOGRAPH_REFERENCES } from './references/photographs';

/**
 * All system references, indexed at module load time.
 */
const ALL_SYSTEM_REFERENCES: DocumentReference[] = [
  ...APPRAISAL_REFERENCES,
  ...KYC_REFERENCES,
  ...LEGAL_REFERENCES,
  ...LOAN_TERMS_REFERENCES,
  ...INSPECTION_REFERENCES,
  ...PROFESSIONAL_REPORT_REFERENCES,
  ...PLAN_REFERENCES,
  ...INSURANCE_REFERENCES,
  ...FINANCIAL_REFERENCES,
  ...COMMUNICATION_REFERENCES,
  ...WARRANTY_REFERENCES,
  ...PROJECT_DOCUMENT_REFERENCES,
  ...PHOTOGRAPH_REFERENCES,
];

/**
 * Get all active system references.
 */
export function getAllReferences(): DocumentReference[] {
  return ALL_SYSTEM_REFERENCES.filter((ref) => ref.isActive);
}

/**
 * Get references by category.
 */
export function getReferencesByCategory(category: string): DocumentReference[] {
  return ALL_SYSTEM_REFERENCES.filter(
    (ref) => ref.isActive && ref.category.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Get a single reference by ID.
 */
export function getReferenceById(id: string): DocumentReference | undefined {
  return ALL_SYSTEM_REFERENCES.find((ref) => ref.id === id);
}

/**
 * Get a single reference by file type name.
 */
export function getReferenceByType(fileType: string): DocumentReference | undefined {
  return ALL_SYSTEM_REFERENCES.find(
    (ref) => ref.isActive && ref.fileType.toLowerCase() === fileType.toLowerCase()
  );
}

/**
 * Get all unique categories.
 */
export function getCategories(): string[] {
  const cats = new Set(ALL_SYSTEM_REFERENCES.filter((r) => r.isActive).map((r) => r.category));
  return Array.from(cats).sort();
}

/**
 * Get all file types (for dropdowns, etc).
 */
export function getFileTypes(): Array<{ id: string; fileType: string; category: string }> {
  return ALL_SYSTEM_REFERENCES
    .filter((r) => r.isActive)
    .map((r) => ({ id: r.id, fileType: r.fileType, category: r.category }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.fileType.localeCompare(b.fileType));
}
