// =============================================================================
// V4 SHARED REFERENCE LIBRARY
// =============================================================================
// Generalized reference library with tagging system.
// References are NOT locked to individual skills — any skill can query them.
// Uses a lightweight orchestrator to pull correct references based on hints.
//
// Sources:
// 1. Filesystem defaults (v4/skills/document-classify/references/*.md)
// 2. Convex database (user-created definitions with references)
// 3. Learned keywords from corrections (merged into reference tags)
//
// Cache: 1-hour TTL since only a few internal users.

import type {
  ReferenceDocument,
  ReferenceLibraryCache,
  DocumentHints,
  BatchDocument,
  REFERENCE_CACHE_TTL_MS,
} from '../types';

// =============================================================================
// IN-MEMORY CACHE
// =============================================================================

let _cache: ReferenceLibraryCache | null = null;

/**
 * Check if the cache is still valid (within TTL).
 */
function isCacheValid(ttlMs: number): boolean {
  if (!_cache) return false;
  return Date.now() - _cache.cachedAt < ttlMs;
}

/**
 * Clear the reference cache (e.g., after user adds/edits a reference).
 */
export function clearReferenceCache(): void {
  _cache = null;
}

// =============================================================================
// LOAD REFERENCES
// =============================================================================

/**
 * Load all active references, using cache if available.
 * Merges filesystem defaults with Convex user-created references.
 */
export async function loadReferences(
  convexClient?: any,
  ttlMs: number = 60 * 60 * 1000,
): Promise<ReferenceDocument[]> {
  const result = await loadReferencesWithMeta(convexClient, ttlMs);
  return result.references;
}

/**
 * Load references with metadata about cache status.
 */
export async function loadReferencesWithMeta(
  convexClient?: any,
  ttlMs: number = 60 * 60 * 1000,
): Promise<{ references: ReferenceDocument[]; cacheHit: boolean }> {
  // Return cached if valid
  if (isCacheValid(ttlMs) && _cache) {
    return { references: _cache.references, cacheHit: true };
  }

  // Load from both sources
  const [systemRefs, userRefs] = await Promise.all([
    loadSystemReferences(),
    convexClient ? loadConvexReferences(convexClient) : Promise.resolve([]),
  ]);

  // Merge: user refs override system refs with same fileType
  const merged = new Map<string, ReferenceDocument>();
  for (const ref of systemRefs) {
    merged.set(ref.fileType.toLowerCase(), ref);
  }
  for (const ref of userRefs) {
    const existing = merged.get(ref.fileType.toLowerCase());
    if (existing) {
      // Merge user content with system defaults
      merged.set(ref.fileType.toLowerCase(), {
        ...existing,
        ...ref,
        // Merge tags and keywords (union)
        tags: [...new Set([...existing.tags, ...ref.tags])],
        keywords: [...new Set([...existing.keywords, ...ref.keywords])],
      });
    } else {
      merged.set(ref.fileType.toLowerCase(), ref);
    }
  }

  const references = Array.from(merged.values()).filter(r => r.isActive);

  // Update cache
  _cache = {
    references,
    cachedAt: Date.now(),
    ttlMs,
  };

  return { references, cacheHit: false };
}

// =============================================================================
// TAG-BASED REFERENCE SELECTION
// =============================================================================

/**
 * Select relevant references for a batch of documents.
 * Uses lightweight tag matching from document hints to pull only what's needed.
 * This is the "orchestrator" that decides which references go into context.
 */
export function selectReferencesForBatch(
  documents: BatchDocument[],
  allReferences: ReferenceDocument[],
  maxReferences: number = 12,
): ReferenceDocument[] {
  // Collect all matched tags from all documents in the batch
  const allMatchedTags = new Set<string>();
  const allHintedTypes = new Set<string>();

  for (const doc of documents) {
    for (const tag of doc.hints.matchedTags) {
      allMatchedTags.add(tag.toLowerCase());
    }
    if (doc.hints.filenameTypeHint) {
      allHintedTypes.add(doc.hints.filenameTypeHint.toLowerCase());
    }
    // Add characteristic-based tags
    if (doc.hints.isFinancial) allMatchedTags.add('financial');
    if (doc.hints.isLegal) allMatchedTags.add('legal');
    if (doc.hints.isIdentity) allMatchedTags.add('kyc');
  }

  // Score each reference by relevance to this batch
  const scored = allReferences.map(ref => {
    let score = 0;

    // Direct type hint match (highest priority)
    if (allHintedTypes.has(ref.fileType.toLowerCase())) {
      score += 10;
    }

    // Tag overlap
    for (const tag of ref.tags) {
      if (allMatchedTags.has(tag.toLowerCase())) {
        score += 3;
      }
    }

    // Keyword overlap with matched tags
    for (const keyword of ref.keywords) {
      if (allMatchedTags.has(keyword.toLowerCase())) {
        score += 1;
      }
    }

    // Category-level matches
    if (allMatchedTags.has(ref.category.toLowerCase())) {
      score += 5;
    }

    return { ref, score };
  });

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score);

  // Always include at least some references even with no matches
  // (Claude needs some context about available types)
  const selected = scored.slice(0, maxReferences).map(s => s.ref);

  // If no good matches, include one reference per category as fallback
  if (selected.length === 0 || scored[0].score === 0) {
    const byCategory = new Map<string, ReferenceDocument>();
    for (const ref of allReferences) {
      if (!byCategory.has(ref.category)) {
        byCategory.set(ref.category, ref);
      }
    }
    return Array.from(byCategory.values()).slice(0, maxReferences);
  }

  return selected;
}

// =============================================================================
// SYSTEM REFERENCES (filesystem defaults)
// =============================================================================

/**
 * Load built-in reference documents from the filesystem.
 * These are the system defaults that ship with the application.
 */
async function loadSystemReferences(): Promise<ReferenceDocument[]> {
  // In production, these would be loaded from the references/ directory.
  // For now, we define them inline as the canonical set.
  // Users can override/extend via Convex.
  return SYSTEM_REFERENCES;
}

/**
 * Load user-created references from Convex database.
 */
async function loadConvexReferences(convexClient: any): Promise<ReferenceDocument[]> {
  try {
    // Dynamic import to avoid circular dependency with Convex generated types
    const { api } = await import('../../../convex/_generated/api');
    // Fetch active file type definitions from Convex
    const definitions = await convexClient.query(api.fileTypeDefinitions.getAll);
    if (!definitions || !Array.isArray(definitions)) return [];

    return definitions.map((def: any) => ({
      id: def._id,
      fileType: def.fileType,
      category: def.category,
      tags: [
        def.category.toLowerCase(),
        ...(def.targetFolderKey ? [def.targetFolderKey] : []),
        ...(def.filenamePatterns || []).map((p: string) => p.toLowerCase()),
        // Include learned keywords as tags
        ...(def.learnedKeywords || []).map((lk: any) => lk.keyword.toLowerCase()),
      ],
      content: def.description || '',
      keywords: [
        ...(def.keywords || []),
        ...(def.learnedKeywords || []).map((lk: any) => lk.keyword),
      ],
      source: 'user' as const,
      exampleFileStorageId: def.exampleFileStorageId,
      isActive: def.isActive ?? true,
      updatedAt: def.updatedAt || def.createdAt || new Date().toISOString(),
    }));
  } catch (error) {
    console.warn('[V4 ReferenceLibrary] Failed to load Convex references:', error);
    return [];
  }
}

// =============================================================================
// SYSTEM REFERENCE DEFINITIONS
// =============================================================================
// These are compact reference documents — NOT the 100-word descriptions from
// the old system. Each is a concise guide that tells Claude what to look for.
// Users can create their own references in the UI (stored in Convex).

const SYSTEM_REFERENCES: ReferenceDocument[] = [
  // ── APPRAISALS ──
  {
    id: 'redbook-valuation',
    fileType: 'RedBook Valuation',
    category: 'Appraisals',
    tags: ['appraisals', 'valuation', 'rics', 'financial', 'property'],
    keywords: ['RICS', 'red book', 'valuation', 'market value', 'surveyor', 'comparable'],
    content: 'A RICS-compliant property valuation report. Key indicators: RICS logo/reference, "Red Book" or "Valuation Standards", market value figure, comparable evidence, surveyor credentials (MRICS/FRICS). Usually from firms like Savills, Knight Frank, CBRE, JLL.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
  {
    id: 'appraisal',
    fileType: 'Appraisal',
    category: 'Appraisals',
    tags: ['appraisals', 'valuation', 'financial', 'property', 'development'],
    keywords: ['development appraisal', 'residual valuation', 'GDV', 'build cost', 'profit margin'],
    content: 'A development appraisal assessing project viability. Key indicators: GDV (Gross Development Value), total costs breakdown, profit on cost %, residual land value, construction timeline, funding assumptions.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
  {
    id: 'cashflow',
    fileType: 'Cashflow',
    category: 'Appraisals',
    tags: ['appraisals', 'financial', 'cashflow', 'projection'],
    keywords: ['cashflow', 'cash flow', 'monthly projection', 'drawdown', 'interest'],
    content: 'Cash flow projection for a property development. Key indicators: monthly/quarterly columns, drawdown schedule, interest calculations, S-curve, cumulative totals, peak debt figure.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },

  // ── KYC ──
  {
    id: 'passport',
    fileType: 'Passport',
    category: 'KYC',
    tags: ['kyc', 'identity', 'id'],
    keywords: ['passport', 'nationality', 'date of birth', 'expiry', 'MRZ'],
    content: 'Government-issued passport. Key indicators: photo ID page, MRZ code (machine-readable zone), nationality, date of birth, expiry date, passport number.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
  {
    id: 'driving-license',
    fileType: 'Driving License',
    category: 'KYC',
    tags: ['kyc', 'identity', 'id'],
    keywords: ['driving licence', 'driving license', 'DVLA', 'licence number'],
    content: 'Government-issued driving licence. Key indicators: photo, DVLA reference, licence number, categories, address, date of birth.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
  {
    id: 'bank-statement',
    fileType: 'Bank Statement',
    category: 'KYC',
    tags: ['kyc', 'financial', 'bank', 'proof-of-address'],
    keywords: ['bank statement', 'account number', 'sort code', 'balance', 'transactions'],
    content: 'Bank account statement showing transactions. Key indicators: bank logo, account number, sort code, statement period, opening/closing balance, transaction list. Can also serve as proof of address.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
  {
    id: 'utility-bill',
    fileType: 'Utility Bill',
    category: 'KYC',
    tags: ['kyc', 'proof-of-address', 'utility'],
    keywords: ['utility', 'electricity', 'gas', 'water', 'council tax', 'bill'],
    content: 'Utility bill used as proof of address. Key indicators: utility company logo, account holder name, service address, billing period, amount due.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
  {
    id: 'certificate-of-incorporation',
    fileType: 'Certificate of Incorporation',
    category: 'KYC',
    tags: ['kyc', 'corporate', 'company', 'registration'],
    keywords: ['certificate of incorporation', 'companies house', 'company number', 'registered'],
    content: 'Companies House certificate proving company registration. Key indicators: Companies House header, company number, date of incorporation, registered office address.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
  {
    id: 'tax-return',
    fileType: 'Tax Return',
    category: 'KYC',
    tags: ['kyc', 'financial', 'tax', 'hmrc'],
    keywords: ['tax return', 'SA100', 'HMRC', 'self assessment', 'tax year', 'income'],
    content: 'HMRC self-assessment tax return. Key indicators: SA100/SA302 form, HMRC header, UTR number, tax year, total income, tax due.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },

  // ── LEGAL DOCUMENTS ──
  {
    id: 'facility-letter',
    fileType: 'Facility Letter',
    category: 'Legal Documents',
    tags: ['legal', 'loan', 'facility', 'terms'],
    keywords: ['facility letter', 'facility agreement', 'loan agreement', 'borrower', 'lender', 'drawdown'],
    content: 'Loan facility agreement between lender and borrower. Key indicators: parties (borrower/lender), facility amount, interest rate, term, conditions precedent, covenants, events of default.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
  {
    id: 'title-deed',
    fileType: 'Title Deed',
    category: 'Legal Documents',
    tags: ['legal', 'property', 'land-registry', 'title'],
    keywords: ['title deed', 'land registry', 'title number', 'freehold', 'leasehold', 'registered proprietor'],
    content: 'Land Registry official title document. Key indicators: HM Land Registry header, title number, property description, registered proprietor, charges/restrictions.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
  {
    id: 'personal-guarantee',
    fileType: 'Personal Guarantee',
    category: 'Legal Documents',
    tags: ['legal', 'guarantee', 'security'],
    keywords: ['personal guarantee', 'guarantor', 'jointly and severally', 'indemnity'],
    content: 'Personal guarantee supporting a loan facility. Key indicators: guarantor details, guarantee amount, "jointly and severally liable", obligations, indemnity clauses.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },

  // ── LOAN TERMS ──
  {
    id: 'indicative-terms',
    fileType: 'Indicative Terms',
    category: 'Loan Terms',
    tags: ['loan', 'terms', 'proposal', 'financial'],
    keywords: ['indicative terms', 'term sheet', 'heads of terms', 'loan amount', 'interest rate', 'LTV'],
    content: 'Initial loan proposal / term sheet. Key indicators: facility amount, interest rate, LTV ratio, term/duration, arrangement fee, exit fee, security requirements. Usually non-binding.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
  {
    id: 'credit-backed-terms',
    fileType: 'Credit Backed Terms',
    category: 'Loan Terms',
    tags: ['loan', 'terms', 'credit', 'approved', 'financial'],
    keywords: ['credit backed', 'credit approved', 'credit committee', 'approved terms', 'binding'],
    content: 'Credit-committee-approved loan terms. Key indicators: "credit approved" or "credit backed", committee reference, more detailed conditions than indicative terms, binding commitments.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },

  // ── INSPECTIONS ──
  {
    id: 'initial-monitoring-report',
    fileType: 'Initial Monitoring Report',
    category: 'Inspections',
    tags: ['inspections', 'monitoring', 'construction', 'site'],
    keywords: ['monitoring report', 'initial inspection', 'site visit', 'construction progress', 'building inspector'],
    content: 'Initial site monitoring/inspection report. Key indicators: site visit date, inspector name, construction status assessment, photos, progress percentage, issues identified, next visit date.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
  {
    id: 'interim-monitoring-report',
    fileType: 'Interim Monitoring Report',
    category: 'Inspections',
    tags: ['inspections', 'monitoring', 'construction', 'progress'],
    keywords: ['interim monitoring', 'progress report', 'interim inspection', 'drawdown recommendation'],
    content: 'Follow-up monitoring report during construction. Key indicators: comparison to previous visit, progress since last report, drawdown recommendation, cost tracking, programme assessment.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },

  // ── PROFESSIONAL REPORTS ──
  {
    id: 'building-survey',
    fileType: 'Building Survey',
    category: 'Professional Reports',
    tags: ['reports', 'survey', 'property', 'condition'],
    keywords: ['building survey', 'condition report', 'structural', 'defects', 'surveyor'],
    content: 'Professional building survey/condition report. Key indicators: property condition assessment, structural observations, defects noted, recommendations, surveyor credentials.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
  {
    id: 'report-on-title',
    fileType: 'Report on Title',
    category: 'Professional Reports',
    tags: ['reports', 'legal', 'title', 'property'],
    keywords: ['report on title', 'title review', 'solicitor', 'encumbrances', 'good and marketable'],
    content: 'Solicitor\'s report on property title. Key indicators: title number, encumbrances, easements, restrictive covenants, planning permissions, "good and marketable title" opinion.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },

  // ── PLANS ──
  {
    id: 'floor-plans',
    fileType: 'Floor Plans',
    category: 'Plans',
    tags: ['plans', 'design', 'architecture', 'drawings'],
    keywords: ['floor plan', 'ground floor', 'first floor', 'layout', 'rooms', 'scale'],
    content: 'Architectural floor plan drawings. Key indicators: room layouts, dimensions/scale bar, room labels, door/window positions, north arrow, architect stamp.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
  {
    id: 'site-plans',
    fileType: 'Site Plans',
    category: 'Plans',
    tags: ['plans', 'design', 'site', 'layout'],
    keywords: ['site plan', 'site layout', 'boundary', 'red line', 'access', 'parking'],
    content: 'Site layout plan showing property boundaries. Key indicators: red line boundary, site access points, parking areas, landscaping, building footprints, OS map base.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },

  // ── INSURANCE ──
  {
    id: 'insurance-policy',
    fileType: 'Insurance Policy',
    category: 'Insurance',
    tags: ['insurance', 'policy', 'cover'],
    keywords: ['insurance policy', 'policy number', 'premium', 'cover', 'indemnity', 'insured'],
    content: 'Insurance policy document. Key indicators: policy number, insured party, policy period, sum insured, premium amount, excess, covered risks, exclusions.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },

  // ── FINANCIAL DOCUMENTS ──
  {
    id: 'invoice',
    fileType: 'Invoice',
    category: 'Financial Documents',
    tags: ['financial', 'invoice', 'payment'],
    keywords: ['invoice', 'invoice number', 'amount due', 'VAT', 'payment terms', 'net total'],
    content: 'Commercial invoice for goods or services. Key indicators: invoice number, supplier/client details, line items, VAT calculation, total amount, payment terms, bank details.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },

  // ── COMMUNICATIONS ──
  {
    id: 'email-correspondence',
    fileType: 'Email/Correspondence',
    category: 'Communications',
    tags: ['communications', 'email', 'correspondence'],
    keywords: ['email', 'from:', 'to:', 'subject:', 'dear', 'regards', 'correspondence'],
    content: 'Email or letter correspondence. Key indicators: from/to/subject headers, greeting, signature block, date, RE: or FW: prefixes.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },

  // ── PHOTOGRAPHS ──
  {
    id: 'site-photographs',
    fileType: 'Site Photographs',
    category: 'Photographs',
    tags: ['photographs', 'site', 'images', 'construction'],
    keywords: ['photograph', 'photo', 'site photo', 'construction photo', 'progress photo'],
    content: 'Site photographs showing property or construction. Key indicators: image file (JPG/PNG), construction/property subject matter, may have date stamps or location metadata.',
    source: 'system',
    isActive: true,
    updatedAt: '2025-01-01',
  },
];
