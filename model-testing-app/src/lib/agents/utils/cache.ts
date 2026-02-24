// =============================================================================
// CACHE UTILITIES FOR CLASSIFICATION CACHING
// =============================================================================

/**
 * Generate a content hash for cache lookup
 * Uses a simple but effective hash algorithm
 */
export function generateContentHash(content: string): string {
  let hash = 0;
  const str = content.substring(0, 10000); // Use first 10k chars for hash

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to hex string with consistent length
  const hashStr = Math.abs(hash).toString(16).padStart(8, '0');
  return `content_${hashStr}_${str.length}`;
}

/**
 * Normalize filename for cache pattern matching
 * Removes unique identifiers while preserving semantic patterns
 */
export function normalizeFilenameForCache(fileName: string): string {
  return fileName
    .toLowerCase()
    // Remove common date patterns
    .replace(/\d{4}[-_]\d{2}[-_]\d{2}/g, 'DATE')
    .replace(/\d{2}[-_]\d{2}[-_]\d{4}/g, 'DATE')
    // Remove timestamps
    .replace(/\d{10,}/g, 'TIMESTAMP')
    // Remove UUIDs
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID')
    // Remove random hex strings
    .replace(/[a-f0-9]{16,}/gi, 'HEX')
    // Normalize multiple underscores/hyphens
    .replace(/[_-]+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '')
    // Remove file extension for pattern matching
    .replace(/\.[^.]+$/, '');
}

/**
 * Check if two content hashes are similar enough to be a cache hit
 * This allows for minor variations in document content
 */
export function areHashesSimilar(hash1: string, hash2: string): boolean {
  // For now, exact match only
  // Could be extended to use fuzzy matching if needed
  return hash1 === hash2;
}
