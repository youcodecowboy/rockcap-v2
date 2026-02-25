// =============================================================================
// REFERENCE LIBRARY CACHE
// =============================================================================
// In-memory cache with TTL for loaded references.
// Generalized from the V4 cache pattern.

import type { DocumentReference } from './types';

interface CacheEntry {
  references: DocumentReference[];
  cachedAt: number;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

let _cache: CacheEntry | null = null;

export function getCachedReferences(ttlMs = DEFAULT_TTL_MS): DocumentReference[] | null {
  if (!_cache) return null;
  if (Date.now() - _cache.cachedAt > ttlMs) {
    _cache = null;
    return null;
  }
  return _cache.references;
}

export function setCachedReferences(references: DocumentReference[]): void {
  _cache = {
    references,
    cachedAt: Date.now(),
  };
}

export function clearReferenceCache(): void {
  _cache = null;
}

export function isCacheValid(ttlMs = DEFAULT_TTL_MS): boolean {
  return _cache !== null && (Date.now() - _cache.cachedAt) <= ttlMs;
}
