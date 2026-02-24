// =============================================================================
// FILENAME MATCHER TYPES
// =============================================================================

export interface FilenameTypeHint {
  fileType: string;
  category: string;
  folder: string;
  confidence: number;
  reason: string;
}

export interface FilenameMatchResult {
  itemId: string;
  score: number;
  reason: string;
}

export interface FilenamePattern {
  keywords: string[];
  fileType: string;
  category: string;
  folder: string;
  excludeIf?: string[];
}
