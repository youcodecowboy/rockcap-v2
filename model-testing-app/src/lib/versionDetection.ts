import type { Id } from '../../convex/_generated/dataModel';

// Date patterns to strip and capture
const DATE_PATTERNS = [
  // YYYY-MM-DD or YYYY/MM/DD
  /(\d{4}[-/]\d{2}[-/]\d{2})/g,
  // DD-MM-YYYY or DD/MM/YYYY
  /(\d{2}[-/]\d{2}[-/]\d{4})/g,
  // DD.MM.YY or DD.MM.YYYY
  /(\d{2}\.\d{2}\.\d{2,4})/g,
  // YYYYMMDD (8 consecutive digits that look like a date)
  /(?<!\d)(20\d{6})(?!\d)/g,
  // Month YYYY or Mon YYYY (e.g., "March 2024", "Dec 2022")
  /((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/gi,
  // DD Month YYYY
  /(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/gi,
];

// Version patterns to strip and capture
const VERSION_PATTERNS = [
  // V1, V1.0, V2.5, v1, version 2
  /\b[Vv](?:ersion\s*)?(\d+(?:\.\d+)?)\b/g,
];

// Copy/status suffixes to strip (not captured)
const COPY_SUFFIXES = /\b(copy|final|revised|updated|draft)\b/gi;
const BRACKET_SUFFIXES = /\((\d+)\)|\[(\d+)\]/g;

// File extensions
const FILE_EXTENSION = /\.\w{2,5}$/;

export interface ParsedVersionInfo {
  normalized: string;
  extractedDate?: string;
  extractedVersion?: string;
}

/**
 * Parse a filename to extract a normalized base name (for grouping)
 * and any date/version information (for ordering).
 */
export function parseVersionInfo(filename: string): ParsedVersionInfo {
  let name = filename;
  let extractedDate: string | undefined;
  let extractedVersion: string | undefined;

  // Strip file extension first
  name = name.replace(FILE_EXTENSION, '');

  // Extract and strip dates
  for (const pattern of DATE_PATTERNS) {
    // Reset lastIndex since patterns use /g flag
    pattern.lastIndex = 0;
    const match = name.match(pattern);
    if (match && !extractedDate) {
      extractedDate = match[0];
    }
    pattern.lastIndex = 0;
    name = name.replace(pattern, ' ');
  }

  // Extract and strip version numbers
  for (const pattern of VERSION_PATTERNS) {
    // Match against original-ish name (after date stripping) to capture version
    pattern.lastIndex = 0;
    const match = name.match(pattern);
    if (match && !extractedVersion) {
      extractedVersion = match[0];
    }
    pattern.lastIndex = 0;
    name = name.replace(pattern, ' ');
  }

  // Strip copy suffixes and bracket numbers
  name = name.replace(COPY_SUFFIXES, ' ');
  name = name.replace(BRACKET_SUFFIXES, ' ');

  // Normalize: replace separators with spaces, collapse, lowercase, trim
  name = name
    .replace(/[_\-./\\,;:]+/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

  return {
    normalized: name,
    extractedDate,
    extractedVersion,
  };
}

export interface VersionCandidateGroup {
  normalizedName: string;
  items: Array<{
    _id: Id<'bulkUploadItems'>;
    fileName: string;
    extractedDate?: string;
    extractedVersion?: string;
  }>;
}

/**
 * Group bulk upload items into version candidate clusters.
 * Only returns groups with 2+ items that share the same normalized filename.
 */
export function buildVersionCandidateGroups(
  items: Array<{
    _id: Id<'bulkUploadItems'>;
    fileName: string;
    itemProjectId?: string;
    status: string;
  }>,
): VersionCandidateGroup[] {
  // Only consider items that are ready for review
  const reviewItems = items.filter(i => i.status === 'ready_for_review');

  // Group by normalized name + project scope
  const groups = new Map<string, VersionCandidateGroup>();

  for (const item of reviewItems) {
    const parsed = parseVersionInfo(item.fileName);
    if (!parsed.normalized) continue;

    // Group key includes project to prevent cross-project grouping
    const projectKey = item.itemProjectId || '__unassigned__';
    const groupKey = `${projectKey}::${parsed.normalized}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        normalizedName: parsed.normalized,
        items: [],
      });
    }

    groups.get(groupKey)!.items.push({
      _id: item._id,
      fileName: item.fileName,
      extractedDate: parsed.extractedDate,
      extractedVersion: parsed.extractedVersion,
    });
  }

  // Only return groups with 2+ items, sorted by size descending
  return Array.from(groups.values())
    .filter(g => g.items.length >= 2)
    .sort((a, b) => b.items.length - a.items.length);
}
