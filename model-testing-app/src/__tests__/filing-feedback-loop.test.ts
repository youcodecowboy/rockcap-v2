/**
 * Filing Feedback Loop Tests
 *
 * Tests the self-teaching feedback loop system:
 * 1. Content hashing - consistent hashes for same content
 * 2. Filename normalization - pattern matching for similar files
 * 3. Corrections storage - verify corrections are captured correctly
 * 4. Corrections retrieval - verify relevant corrections are fetched
 * 5. Cache operations - verify cache hit/miss/invalidation
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================================
// UNIT TESTS - Pure Functions
// ============================================================================

// Copy of the hash function from filingFeedback.ts for testing
function generateContentHash(content: string): string {
  const normalizedContent = content.slice(0, 10000).toLowerCase().trim();
  let hash = 5381;
  for (let i = 0; i < normalizedContent.length; i++) {
    hash = ((hash << 5) + hash) + normalizedContent.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// Copy of normalize function from filingFeedback.ts for testing
function normalizeFilename(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-\.]/g, ' ')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('Content Hashing', () => {
  it('should produce consistent hashes for identical content', () => {
    const content = 'This is a test document about a passport verification.';
    const hash1 = generateContentHash(content);
    const hash2 = generateContentHash(content);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(8); // Should be 8 hex chars
  });

  it('should produce different hashes for different content', () => {
    const content1 = 'This is a passport document.';
    const content2 = 'This is a bank statement document.';

    const hash1 = generateContentHash(content1);
    const hash2 = generateContentHash(content2);

    expect(hash1).not.toBe(hash2);
  });

  it('should be case-insensitive', () => {
    const content1 = 'PASSPORT DOCUMENT';
    const content2 = 'passport document';

    const hash1 = generateContentHash(content1);
    const hash2 = generateContentHash(content2);

    expect(hash1).toBe(hash2);
  });

  it('should ignore leading/trailing whitespace', () => {
    const content1 = '  passport document  ';
    const content2 = 'passport document';

    const hash1 = generateContentHash(content1);
    const hash2 = generateContentHash(content2);

    expect(hash1).toBe(hash2);
  });

  it('should only use first 10KB of content', () => {
    const baseContent = 'This is test content. ';
    const shortContent = baseContent.repeat(10); // ~220 chars
    const longContent = baseContent.repeat(1000); // ~22KB

    // Both should hash based on first 10KB
    const longTruncated = longContent.slice(0, 10000);

    const hashLong = generateContentHash(longContent);
    const hashTruncated = generateContentHash(longTruncated);

    expect(hashLong).toBe(hashTruncated);
  });
});

describe('Filename Normalization', () => {
  it('should lowercase filenames', () => {
    const result = normalizeFilename('PASSPORT.pdf');
    expect(result).toBe('passport');
  });

  it('should remove file extensions', () => {
    const result = normalizeFilename('document.pdf');
    expect(result).toBe('document');

    const result2 = normalizeFilename('spreadsheet.xlsx');
    expect(result2).toBe('spreadsheet');
  });

  it('should replace separators with spaces', () => {
    const result1 = normalizeFilename('john_smith_passport.pdf');
    expect(result1).toBe('john smith passport');

    const result2 = normalizeFilename('john-smith-passport.pdf');
    expect(result2).toBe('john smith passport');
  });

  it('should replace numbers with placeholder', () => {
    const result = normalizeFilename('passport_2024_01_15.pdf');
    expect(result).toBe('passport # # #');
  });

  it('should normalize similar filenames to same pattern', () => {
    const files = [
      'John_Smith_Passport_2024.pdf',
      'jane-doe-passport-2023.pdf',
      'MIKE.JONES.PASSPORT.2025.pdf',
    ];

    const normalized = files.map(normalizeFilename);

    // All should follow pattern: "name name passport #"
    normalized.forEach(n => {
      expect(n).toMatch(/passport/);
      expect(n).toContain('#');
    });
  });

  it('should collapse multiple spaces', () => {
    const result = normalizeFilename('john   smith   passport.pdf');
    expect(result).toBe('john smith passport');
  });
});

// ============================================================================
// CORRECTION MATCHING TESTS
// ============================================================================

describe('Correction Relevance Scoring', () => {
  // Simulate the relevance scoring logic
  function scoreCorrection(
    correction: { aiPrediction: { fileType: string; category: string }; fileName: string },
    query: { fileType: string; category: string; fileName: string }
  ): { score: number; reason: string } {
    // Same file type - highest relevance
    if (correction.aiPrediction.fileType === query.fileType) {
      return { score: 1.0, reason: 'Same AI-predicted file type' };
    }

    // Same category - medium relevance
    if (correction.aiPrediction.category === query.category) {
      return { score: 0.8, reason: 'Same AI-predicted category' };
    }

    // Similar filename pattern - lower relevance
    const correctionPattern = normalizeFilename(correction.fileName);
    const queryPattern = normalizeFilename(query.fileName);

    // Simple similarity check - share words
    const correctionWords = new Set(correctionPattern.split(' '));
    const queryWords = new Set(queryPattern.split(' '));
    const sharedWords = [...correctionWords].filter(w => queryWords.has(w) && w !== '#');

    if (sharedWords.length > 0) {
      return { score: 0.7, reason: 'Similar filename pattern' };
    }

    return { score: 0, reason: 'No relevance' };
  }

  it('should score same file type corrections highest', () => {
    const correction = {
      aiPrediction: { fileType: 'Site Plan', category: 'Plans' },
      fileName: 'LOC_plan_01.pdf',
    };

    const query = {
      fileType: 'Site Plan',
      category: 'Plans',
      fileName: 'different_file.pdf',
    };

    const result = scoreCorrection(correction, query);
    expect(result.score).toBe(1.0);
  });

  it('should score same category corrections medium', () => {
    const correction = {
      aiPrediction: { fileType: 'Floor Plans', category: 'Plans' },
      fileName: 'floor_plan.pdf',
    };

    const query = {
      fileType: 'Site Plan',
      category: 'Plans',
      fileName: 'site_plan.pdf',
    };

    const result = scoreCorrection(correction, query);
    expect(result.score).toBe(0.8);
  });

  it('should score similar filename patterns lower', () => {
    const correction = {
      aiPrediction: { fileType: 'Passport', category: 'KYC' },
      fileName: 'john_smith_passport_2024.pdf',
    };

    const query = {
      fileType: 'Bank Statement',
      category: 'KYC',
      fileName: 'jane_doe_passport_2023.pdf',
    };

    const result = scoreCorrection(correction, query);
    // Different file type, but "passport" appears in both filenames
    // Category match should win here
    expect(result.score).toBeGreaterThan(0);
  });
});

// ============================================================================
// MOCK DATA FOR INTEGRATION TESTS
// ============================================================================

interface MockCorrection {
  _id: string;
  fileName: string;
  fileNameNormalized: string;
  contentHash: string;
  contentSummary: string;
  aiPrediction: {
    fileType: string;
    category: string;
    targetFolder: string;
    confidence: number;
  };
  userCorrection: {
    fileType?: string;
    category?: string;
    targetFolder?: string;
  };
  correctedFields: string[];
  createdAt: string;
}

interface MockCacheEntry {
  contentHash: string;
  classification: {
    fileType: string;
    category: string;
    targetFolder: string;
    confidence: number;
  };
  isValid: boolean;
  hitCount: number;
}

// Simulate the correction store
class MockCorrectionStore {
  private corrections: MockCorrection[] = [];
  private cache: MockCacheEntry[] = [];

  addCorrection(correction: Omit<MockCorrection, '_id' | 'createdAt'>): string {
    const id = `correction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.corrections.push({
      ...correction,
      _id: id,
      createdAt: new Date().toISOString(),
    });

    // Invalidate any cache with matching content hash
    this.cache = this.cache.map(c =>
      c.contentHash === correction.contentHash
        ? { ...c, isValid: false }
        : c
    );

    return id;
  }

  getRelevantCorrections(
    fileType: string,
    category: string,
    _fileName: string,
    limit: number = 5
  ): MockCorrection[] {
    // Priority 1: Same file type
    const fileTypeMatches = this.corrections
      .filter(c => c.aiPrediction.fileType === fileType)
      .slice(0, 2);

    // Priority 2: Same category (excluding already matched)
    const categoryMatches = this.corrections
      .filter(c =>
        c.aiPrediction.category === category &&
        !fileTypeMatches.some(f => f._id === c._id)
      )
      .slice(0, 2);

    return [...fileTypeMatches, ...categoryMatches].slice(0, limit);
  }

  checkCache(contentHash: string): MockCacheEntry | null {
    return this.cache.find(c => c.contentHash === contentHash && c.isValid) || null;
  }

  addToCache(entry: Omit<MockCacheEntry, 'hitCount'>): void {
    const existing = this.cache.findIndex(c => c.contentHash === entry.contentHash);
    if (existing >= 0) {
      this.cache[existing] = { ...entry, hitCount: this.cache[existing].hitCount + 1, isValid: true };
    } else {
      this.cache.push({ ...entry, hitCount: 0 });
    }
  }

  getCorrectionCount(): number {
    return this.corrections.length;
  }

  getCacheHitRate(): { hits: number; total: number } {
    const hits = this.cache.reduce((sum, c) => sum + c.hitCount, 0);
    return { hits, total: this.cache.length };
  }

  clear(): void {
    this.corrections = [];
    this.cache = [];
  }
}

describe('Mock Correction Store', () => {
  let store: MockCorrectionStore;

  beforeEach(() => {
    store = new MockCorrectionStore();
  });

  it('should store corrections', () => {
    const id = store.addCorrection({
      fileName: 'LOC_plan.pdf',
      fileNameNormalized: 'loc plan',
      contentHash: 'abc12345',
      contentSummary: 'Location plan for site',
      aiPrediction: {
        fileType: 'Site Plan',
        category: 'Plans',
        targetFolder: 'plans',
        confidence: 0.85,
      },
      userCorrection: {
        fileType: 'Location Plans',
      },
      correctedFields: ['fileType'],
    });

    expect(id).toBeTruthy();
    expect(store.getCorrectionCount()).toBe(1);
  });

  it('should retrieve relevant corrections by file type', () => {
    // Add a correction for Site Plan
    store.addCorrection({
      fileName: 'LOC_plan_01.pdf',
      fileNameNormalized: 'loc plan #',
      contentHash: 'hash1',
      contentSummary: 'This is a location plan',
      aiPrediction: {
        fileType: 'Site Plan',
        category: 'Plans',
        targetFolder: 'plans',
        confidence: 0.75,
      },
      userCorrection: {
        fileType: 'Location Plans',
      },
      correctedFields: ['fileType'],
    });

    // Query for Site Plan corrections
    const corrections = store.getRelevantCorrections('Site Plan', 'Plans', 'test.pdf');

    expect(corrections).toHaveLength(1);
    expect(corrections[0].aiPrediction.fileType).toBe('Site Plan');
    expect(corrections[0].userCorrection.fileType).toBe('Location Plans');
  });

  it('should invalidate cache when correction is added', () => {
    const contentHash = 'test_hash_123';

    // Add to cache
    store.addToCache({
      contentHash,
      classification: {
        fileType: 'Site Plan',
        category: 'Plans',
        targetFolder: 'plans',
        confidence: 0.85,
      },
      isValid: true,
    });

    // Verify cache hit
    expect(store.checkCache(contentHash)).toBeTruthy();

    // Add correction for same content hash
    store.addCorrection({
      fileName: 'test.pdf',
      fileNameNormalized: 'test',
      contentHash, // Same hash!
      contentSummary: 'test content',
      aiPrediction: {
        fileType: 'Site Plan',
        category: 'Plans',
        targetFolder: 'plans',
        confidence: 0.85,
      },
      userCorrection: {
        fileType: 'Location Plans',
      },
      correctedFields: ['fileType'],
    });

    // Cache should be invalidated
    expect(store.checkCache(contentHash)).toBeNull();
  });

  it('should return corrections in priority order', () => {
    // Add multiple corrections
    store.addCorrection({
      fileName: 'file1.pdf',
      fileNameNormalized: 'file #',
      contentHash: 'hash1',
      contentSummary: 'content 1',
      aiPrediction: { fileType: 'Site Plan', category: 'Plans', targetFolder: 'plans', confidence: 0.8 },
      userCorrection: { fileType: 'Location Plans' },
      correctedFields: ['fileType'],
    });

    store.addCorrection({
      fileName: 'file2.pdf',
      fileNameNormalized: 'file #',
      contentHash: 'hash2',
      contentSummary: 'content 2',
      aiPrediction: { fileType: 'Floor Plans', category: 'Plans', targetFolder: 'background', confidence: 0.7 },
      userCorrection: { targetFolder: 'plans' },
      correctedFields: ['targetFolder'],
    });

    store.addCorrection({
      fileName: 'file3.pdf',
      fileNameNormalized: 'file #',
      contentHash: 'hash3',
      contentSummary: 'content 3',
      aiPrediction: { fileType: 'Passport', category: 'KYC', targetFolder: 'kyc', confidence: 0.9 },
      userCorrection: { category: 'Legal Documents' },
      correctedFields: ['category'],
    });

    // Query for Site Plan should return Site Plan correction first
    const sitePlanCorrections = store.getRelevantCorrections('Site Plan', 'Plans', 'test.pdf');
    expect(sitePlanCorrections[0].aiPrediction.fileType).toBe('Site Plan');

    // Query for different file type but same category
    const floorPlanCorrections = store.getRelevantCorrections('Elevations', 'Plans', 'test.pdf');
    // Should get Plans category matches (Site Plan and Floor Plans)
    expect(floorPlanCorrections.some(c => c.aiPrediction.category === 'Plans')).toBe(true);
  });
});

// ============================================================================
// INTEGRATION FLOW TEST
// ============================================================================

describe('Full Feedback Loop Flow', () => {
  let store: MockCorrectionStore;

  beforeEach(() => {
    store = new MockCorrectionStore();
  });

  it('should demonstrate the complete feedback loop', () => {
    // STEP 1: First document is classified
    const doc1Content = 'This document shows a location plan for the development site at 123 Main St.';
    const doc1Hash = generateContentHash(doc1Content);

    // AI classifies as "Site Plan" (incorrect)
    const aiClassification = {
      fileType: 'Site Plan',
      category: 'Plans',
      targetFolder: 'plans',
      confidence: 0.78,
    };

    // Check cache - should be miss
    expect(store.checkCache(doc1Hash)).toBeNull();

    // Cache the result
    store.addToCache({
      contentHash: doc1Hash,
      classification: aiClassification,
      isValid: true,
    });

    // STEP 2: User corrects it to "Location Plans"
    store.addCorrection({
      fileName: 'LOC_Site_Plan_01.pdf',
      fileNameNormalized: normalizeFilename('LOC_Site_Plan_01.pdf'),
      contentHash: doc1Hash,
      contentSummary: doc1Content.slice(0, 500),
      aiPrediction: aiClassification,
      userCorrection: {
        fileType: 'Location Plans',
      },
      correctedFields: ['fileType'],
    });

    // Cache should now be invalidated
    expect(store.checkCache(doc1Hash)).toBeNull();
    expect(store.getCorrectionCount()).toBe(1);

    // STEP 3: Second similar document arrives
    const doc2Content = 'Location plan showing the property boundaries and access roads.';
    const doc2FileName = 'LOC_Plan_Project_B.pdf';

    // AI would classify as "Site Plan" again
    const doc2AiClassification = {
      fileType: 'Site Plan',
      category: 'Plans',
      targetFolder: 'plans',
      confidence: 0.72,
    };

    // STEP 4: System fetches relevant corrections
    const corrections = store.getRelevantCorrections(
      doc2AiClassification.fileType,
      doc2AiClassification.category,
      doc2FileName
    );

    // Should find the previous correction
    expect(corrections).toHaveLength(1);
    expect(corrections[0].aiPrediction.fileType).toBe('Site Plan');
    expect(corrections[0].userCorrection.fileType).toBe('Location Plans');

    // STEP 5: Critic agent uses this to make better decision
    // (In real system, this would be in the Critic prompt)
    const learnedCorrection = corrections[0];

    // Apply learned correction
    const improvedClassification = {
      ...doc2AiClassification,
      fileType: learnedCorrection.userCorrection.fileType || doc2AiClassification.fileType,
    };

    expect(improvedClassification.fileType).toBe('Location Plans');

    // STEP 6: Result is cached
    const doc2Hash = generateContentHash(doc2Content);
    store.addToCache({
      contentHash: doc2Hash,
      classification: improvedClassification,
      isValid: true,
    });

    // STEP 7: Third identical document should hit cache
    const doc3Content = doc2Content; // Same content
    const doc3Hash = generateContentHash(doc3Content);

    const cachedResult = store.checkCache(doc3Hash);
    expect(cachedResult).toBeTruthy();
    expect(cachedResult?.classification.fileType).toBe('Location Plans');
  });

  it('should handle multiple corrections for same error pattern', () => {
    // AI keeps making the same mistake
    const mistakes = [
      { fileName: 'LOC_01.pdf', content: 'Location plan 1' },
      { fileName: 'LOC_02.pdf', content: 'Location plan 2' },
      { fileName: 'LOC_03.pdf', content: 'Location plan 3' },
    ];

    mistakes.forEach((mistake, i) => {
      store.addCorrection({
        fileName: mistake.fileName,
        fileNameNormalized: normalizeFilename(mistake.fileName),
        contentHash: generateContentHash(mistake.content),
        contentSummary: mistake.content,
        aiPrediction: {
          fileType: 'Site Plan',
          category: 'Plans',
          targetFolder: 'plans',
          confidence: 0.75 + (i * 0.02),
        },
        userCorrection: { fileType: 'Location Plans' },
        correctedFields: ['fileType'],
      });
    });

    expect(store.getCorrectionCount()).toBe(3);

    // Query should return relevant corrections
    const corrections = store.getRelevantCorrections('Site Plan', 'Plans', 'LOC_04.pdf');

    // Should have corrections for Site Plan type
    expect(corrections.length).toBeGreaterThan(0);
    expect(corrections.every(c => c.aiPrediction.fileType === 'Site Plan')).toBe(true);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty content gracefully', () => {
    const hash = generateContentHash('');
    expect(hash).toBeTruthy();
    expect(hash).toHaveLength(8);
  });

  it('should handle special characters in filenames', () => {
    const normalized = normalizeFilename('John\'s Passport (Copy) [2024].pdf');
    // Numbers should be replaced with #
    expect(normalized).toContain('#');
    // Should be lowercase
    expect(normalized).toBe(normalized.toLowerCase());
    // Should not have extension
    expect(normalized).not.toContain('.pdf');
  });

  it('should handle unicode in content', () => {
    const hash1 = generateContentHash('Document with émojis 🏠 and accénts');
    const hash2 = generateContentHash('Document with émojis 🏠 and accénts');
    expect(hash1).toBe(hash2);
  });

  it('should handle very long filenames', () => {
    const longName = 'a'.repeat(500) + '.pdf';
    const normalized = normalizeFilename(longName);
    expect(normalized.length).toBeLessThan(longName.length);
  });
});
