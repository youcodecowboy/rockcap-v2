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
import { getAllReferences } from '../../lib/references';

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
 * Load built-in reference documents from the shared reference library.
 * Maps rich DocumentReference format to V4's ReferenceDocument format.
 */
async function loadSystemReferences(): Promise<ReferenceDocument[]> {
  const sharedRefs = getAllReferences();
  return sharedRefs.map((ref) => ({
    id: ref.id,
    fileType: ref.fileType,
    category: ref.category,
    tags: ref.tags.map((t) => t.value),
    content: ref.description,
    keywords: ref.keywords,
    source: ref.source,
    isActive: ref.isActive,
    updatedAt: ref.updatedAt,
  }));
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
// System references are now loaded from the shared reference library at
// src/lib/references/. The rich DocumentReference format is mapped to V4's
// ReferenceDocument format in loadSystemReferences() above.
// Users can still override/extend via Convex.
