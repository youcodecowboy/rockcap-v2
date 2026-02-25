// =============================================================================
// REFERENCE RESOLVER
// =============================================================================
// Smart lookup system that finds the correct references based on tags,
// signals, filename patterns, keywords, and decision rules.

import type {
  DocumentReference,
  ResolveOptions,
  ResolvedResult,
  ResolvedReference,
  BatchDocumentInput,
  AIContext,
} from './types';
import { getAllReferences } from './index';

// =============================================================================
// SCORING WEIGHTS
// =============================================================================

const SCORE_DIRECT_TYPE_MATCH = 20;
const SCORE_FILENAME_PATTERN = 15;
const SCORE_CATEGORY_MATCH = 8;
const SCORE_CONTEXT_TAG = 5;
const SCORE_SIGNAL_TAG = 4;
const SCORE_DOMAIN_TAG = 3;
const SCORE_KEYWORD = 1;
const SCORE_DECISION_RULE_BASE = 3;

// =============================================================================
// MAIN RESOLVER
// =============================================================================

/**
 * Resolve references for a single document/query.
 * Returns scored, sorted references filtered by context.
 */
export function resolveReferences(options: ResolveOptions): ResolvedResult {
  const {
    context,
    signals = [],
    documentType,
    category,
    textSample,
    fileName,
    maxResults = 12,
  } = options;

  const allRefs = getAllReferences();

  // Filter to active refs applicable to this context
  const applicable = allRefs.filter(
    (ref) => ref.isActive && ref.applicableContexts.includes(context)
  );

  // Score each reference
  const scored: ResolvedReference[] = applicable.map((ref) => {
    const reasons: string[] = [];
    let score = 0;

    // 1. Direct type match (highest priority)
    if (documentType && ref.fileType.toLowerCase() === documentType.toLowerCase()) {
      score += SCORE_DIRECT_TYPE_MATCH;
      reasons.push(`type-match:${documentType}`);
    }

    // 2. Filename pattern match
    if (fileName) {
      const fileNameLower = fileName.toLowerCase();
      for (const pattern of ref.filenamePatterns) {
        try {
          if (new RegExp(pattern, 'i').test(fileNameLower)) {
            score += SCORE_FILENAME_PATTERN;
            reasons.push(`filename-pattern:${pattern}`);
            break; // One match is enough
          }
        } catch {
          // Invalid regex, skip
        }
      }
      // Check exclude patterns (negative scoring)
      for (const pattern of ref.excludePatterns) {
        try {
          if (new RegExp(pattern, 'i').test(fileNameLower)) {
            score -= SCORE_FILENAME_PATTERN;
            reasons.push(`excluded:${pattern}`);
            break;
          }
        } catch {
          // Invalid regex, skip
        }
      }
    }

    // 3. Category match
    if (category && ref.category.toLowerCase() === category.toLowerCase()) {
      score += SCORE_CATEGORY_MATCH;
      reasons.push(`category:${category}`);
    }

    // 4. Tag matching by namespace
    const signalSet = new Set(signals.map((s) => s.toLowerCase()));

    for (const tag of ref.tags) {
      const tagValue = tag.value.toLowerCase();
      const weight = tag.weight ?? 1.0;

      switch (tag.namespace) {
        case 'context':
          if (tagValue === context.toLowerCase()) {
            score += SCORE_CONTEXT_TAG * weight;
            reasons.push(`context-tag:${tagValue}`);
          }
          break;
        case 'signal':
          if (signalSet.has(tagValue)) {
            score += SCORE_SIGNAL_TAG * weight;
            reasons.push(`signal-tag:${tagValue}`);
          }
          break;
        case 'domain':
          if (signalSet.has(tagValue)) {
            score += SCORE_DOMAIN_TAG * weight;
            reasons.push(`domain-tag:${tagValue}`);
          }
          break;
        case 'type':
          if (documentType && tagValue === documentType.toLowerCase().replace(/\s+/g, '-')) {
            score += SCORE_DIRECT_TYPE_MATCH * weight;
            reasons.push(`type-tag:${tagValue}`);
          }
          break;
        case 'trigger':
          // Compound triggers: check if ALL parts are in signals
          const parts = tagValue.split('+');
          if (parts.every((p) => signalSet.has(p))) {
            score += SCORE_SIGNAL_TAG * 2 * weight;
            reasons.push(`trigger:${tagValue}`);
          }
          break;
      }
    }

    // 5. Keyword matching against text sample
    if (textSample) {
      const textLower = textSample.toLowerCase();
      let keywordHits = 0;
      for (const keyword of ref.keywords) {
        if (textLower.includes(keyword.toLowerCase())) {
          keywordHits++;
        }
      }
      if (keywordHits > 0) {
        score += keywordHits * SCORE_KEYWORD;
        reasons.push(`keywords:${keywordHits}`);
      }
    }

    // 6. Decision rules
    for (const rule of ref.decisionRules) {
      const ruleSignals = rule.signals.map((s) => s.toLowerCase());
      const matched = ruleSignals.some((s) => signalSet.has(s));
      if (matched) {
        const ruleScore = SCORE_DECISION_RULE_BASE * rule.priority;
        if (rule.action === 'require') {
          score += ruleScore * 2;
          reasons.push(`decision-require:${rule.condition.slice(0, 50)}`);
        } else if (rule.action === 'boost') {
          score += ruleScore;
          reasons.push(`decision-boost:${rule.condition.slice(0, 50)}`);
        } else {
          score += ruleScore;
          reasons.push(`decision-include:${rule.condition.slice(0, 50)}`);
        }
      }
    }

    return { reference: ref, score, matchReasons: reasons };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Filter by relevance: keep references that score at least 30% of the top scorer,
  // or have a score >= 8 (at least a category match + context tag).
  // This prevents loading 12 irrelevant references when only 1-3 are useful.
  const topScore = scored[0]?.score ?? 0;
  const minThreshold = Math.max(8, Math.floor(topScore * 0.3));
  const relevant = topScore > 0
    ? scored.filter(s => s.score >= minThreshold)
    : scored;

  // Take top N from relevant set
  let selected = relevant.slice(0, maxResults);

  // Fallback: if no good matches, include one per category
  if (selected.length === 0 || (selected[0]?.score ?? 0) === 0) {
    const seenCategories = new Set<string>();
    const fallback: ResolvedReference[] = [];
    for (const entry of applicable.map((ref) => ({
      reference: ref,
      score: 0,
      matchReasons: ['fallback'],
    }))) {
      if (!seenCategories.has(entry.reference.category)) {
        seenCategories.add(entry.reference.category);
        fallback.push(entry);
        if (fallback.length >= maxResults) break;
      }
    }
    selected = fallback;
  }

  return {
    references: selected.map((s) => s.reference),
    scores: selected,
    cacheHit: false, // Cache tracking is handled at the loading level
  };
}

/**
 * Resolve references for a batch of documents.
 * Unions signals from all documents and deduplicates results.
 */
export function resolveReferencesForBatch(
  documents: BatchDocumentInput[],
  context: AIContext,
  maxResults = 12,
): ResolvedResult {
  // Aggregate all signals, filenames, and text from the batch
  const allSignals = new Set<string>();
  const allFileNames: string[] = [];
  let combinedText = '';

  for (const doc of documents) {
    if (doc.signals) {
      doc.signals.forEach((s) => allSignals.add(s));
    }
    allFileNames.push(doc.fileName);
    if (doc.textSample) {
      combinedText += ' ' + doc.textSample.slice(0, 500); // First 500 chars per doc
    }
  }

  // Run per-document resolution and merge scores
  const scoreMap = new Map<string, ResolvedReference>();

  for (const doc of documents) {
    const result = resolveReferences({
      context,
      signals: doc.signals,
      fileName: doc.fileName,
      textSample: doc.textSample,
      maxResults: maxResults * 2, // Get extra candidates for merging
    });

    for (const scored of result.scores) {
      const existing = scoreMap.get(scored.reference.id);
      if (existing) {
        // Take the higher score and merge reasons
        if (scored.score > existing.score) {
          existing.score = scored.score;
        }
        const reasonSet = new Set([...existing.matchReasons, ...scored.matchReasons]);
        existing.matchReasons = Array.from(reasonSet);
      } else {
        scoreMap.set(scored.reference.id, { ...scored });
      }
    }
  }

  // Sort and take top N
  const merged = Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);
  const selected = merged.slice(0, maxResults);

  return {
    references: selected.map((s) => s.reference),
    scores: selected,
    cacheHit: false,
  };
}
