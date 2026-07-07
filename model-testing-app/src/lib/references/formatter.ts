// =============================================================================
// REFERENCE PROMPT FORMATTER
// =============================================================================
// Formats references for injection into different AI prompts.
// Different contexts need different levels of detail to stay within token budgets.

import type { DocumentReference, AIContext } from './types';

/**
 * Format references for prompt injection, optimized for the given AI context.
 *
 * Token budgets per reference (approximate):
 * - classification: ~400 tokens (full detail)
 * - extraction:     ~300 tokens (description + fields + terminology)
 * - summarization:  ~200 tokens (description + key indicators)
 * - filing:         ~150 tokens (filing rules + disambiguation)
 * - chat:           ~100 tokens (compact description + terminology)
 * - checklist:      ~150 tokens (type + category + key indicators)
 * - meeting:        ~100 tokens (compact awareness)
 */
export function formatForPrompt(
  references: DocumentReference[],
  context: AIContext,
): string {
  if (references.length === 0) return '';

  let header = '## Reference Library\nThe following reference documents describe known file types. Use these to inform your analysis.\n\n';

  // For classification context, list valid type names so the model knows exactly what to return
  if (context === 'classification' && references.length > 0) {
    const typeNames = references.map((r) => `"${r.fileType}"`).join(', ');
    header += `**Valid fileType values from these references:** ${typeNames}\nYou MUST return one of these exact strings as the fileType. Do not use synonyms or subtypes.\n\n`;
  }

  const formatted = references.map((ref) => formatSingle(ref, context)).join('\n\n');

  return header + formatted;
}

function formatSingle(ref: DocumentReference, context: AIContext): string {
  switch (context) {
    case 'classification':
      return formatClassification(ref);
    case 'extraction':
      return formatExtraction(ref);
    case 'summarization':
      return formatSummarization(ref);
    case 'filing':
      return formatFiling(ref);
    case 'chat':
      return formatChat(ref);
    case 'checklist':
      return formatChecklist(ref);
    case 'meeting':
      return formatChat(ref); // Same compact format
    default:
      return formatCompact(ref);
  }
}

// =============================================================================
// CONTEXT-SPECIFIC FORMATTERS
// =============================================================================

/**
 * Classification: Compact but sufficient for distinguishing between all types.
 * First paragraph of description + placement axes + top identification rules
 * + disambiguation (prominent — the near-miss pairs are where classification
 * fails). Filename grammar is included as an explicitly WEAK prior (pack §4:
 * filenames lie; body content wins). Omits terminology and full descriptions
 * to keep the prompt cacheable across bulk uploads.
 */
function formatClassification(ref: DocumentReference): string {
  // First paragraph only — enough to understand the type
  const shortDesc = ref.description.split('\n\n')[0];

  const parts = [
    `### ${ref.fileType} (${ref.category})`,
    `Keywords: ${ref.keywords.slice(0, 8).join(', ')}`,
    `Filing: ${ref.targetFolderKey ?? ref.filing.targetFolder} (${ref.filing.targetLevel}-level)`,
  ];

  // Placement axes — producer/audience drive subfolder placement
  if (ref.producer || ref.audience) {
    const axes: string[] = [];
    if (ref.producer) axes.push(`producer=${ref.producer}`);
    if (ref.audience) axes.push(`audience=${ref.audience}`);
    parts.push(`Axes: ${axes.join(', ')}`);
  }

  parts.push(shortDesc);

  // Top 3 identification rules (prioritize PRIMARY/CRITICAL)
  if (ref.identificationRules.length > 0) {
    const prioritized = [
      ...ref.identificationRules.filter((r) => r.startsWith('PRIMARY:') || r.startsWith('CRITICAL:')),
      ...ref.identificationRules.filter((r) => !r.startsWith('PRIMARY:') && !r.startsWith('CRITICAL:')),
    ].slice(0, 3);
    prioritized.forEach((rule) => parts.push(`- ${rule}`));
  }

  // Disambiguation is critical for similar types — always include, headed so
  // the near-miss rules stand out from the identification rules.
  if (ref.disambiguation.length > 0) {
    parts.push('**Disambiguation:**');
    ref.disambiguation.slice(0, 5).forEach((d) => parts.push(`- ${d}`));
  }

  // Filename grammar / patterns — WEAK PRIOR only (filenames lie)
  if (ref.filenameGrammar) {
    parts.push(`Filename grammar (weak prior — body content wins): ${ref.filenameGrammar}`);
  } else if (ref.filenamePatterns.length > 0) {
    parts.push(`Filename hints (weak prior — body content wins): ${ref.filenamePatterns.slice(0, 4).join(', ')}`);
  }

  // Version semantics — which version is operative
  if (ref.versionSemantics) {
    parts.push(`Versions: ${ref.versionSemantics}`);
  }

  return parts.join('\n');
}

/**
 * Extraction: Description + expected fields + full terminology.
 * The model needs to know what data to look for.
 */
function formatExtraction(ref: DocumentReference): string {
  const parts = [
    `### ${ref.fileType} (${ref.category})`,
    '',
    ref.description,
  ];

  if (ref.expectedFields && ref.expectedFields.length > 0) {
    parts.push('', '**Expected Fields:**');
    ref.expectedFields.forEach((f) => parts.push(`- ${f}`));
  }

  if (Object.keys(ref.terminology).length > 0) {
    parts.push('', '**Terminology:**');
    for (const [term, def] of Object.entries(ref.terminology)) {
      parts.push(`- **${term}**: ${def}`);
    }
  }

  return parts.join('\n');
}

/**
 * Summarization: Description + key identification indicators.
 * Helps the model identify what's important in the document.
 */
function formatSummarization(ref: DocumentReference): string {
  const keyRules = ref.identificationRules
    .filter((r) => r.startsWith('PRIMARY:') || r.startsWith('CRITICAL:'))
    .slice(0, 3);

  const parts = [
    `### ${ref.fileType} (${ref.category})`,
    '',
    ref.description.split('\n\n')[0], // First paragraph only
  ];

  if (keyRules.length > 0) {
    parts.push('', '**Key Indicators:**');
    keyRules.forEach((r) => parts.push(`- ${r}`));
  }

  return parts.join('\n');
}

/**
 * Filing: Filing rules + disambiguation only.
 * The model already classified — just needs folder guidance.
 */
function formatFiling(ref: DocumentReference): string {
  const parts = [
    `### ${ref.fileType} → ${ref.targetFolderKey ?? ref.filing.targetFolder} (${ref.filing.targetLevel})`,
  ];

  if (ref.producer || ref.audience) {
    const axes: string[] = [];
    if (ref.producer) axes.push(`producer=${ref.producer}`);
    if (ref.audience) axes.push(`audience=${ref.audience}`);
    parts.push(`Axes: ${axes.join(', ')}`);
  }

  if (ref.disambiguation.length > 0) {
    ref.disambiguation.slice(0, 2).forEach((d) => parts.push(`- ${d}`));
  }

  return parts.join('\n');
}

/**
 * Chat: Compact description + terminology.
 * Don't bloat the conversation context.
 */
function formatChat(ref: DocumentReference): string {
  const shortDesc = ref.description.split('\n\n')[0]; // First paragraph

  const parts = [`### ${ref.fileType} (${ref.category})`, '', shortDesc];

  const terms = Object.entries(ref.terminology).slice(0, 3);
  if (terms.length > 0) {
    parts.push('', '**Terms:**');
    terms.forEach(([t, d]) => parts.push(`- ${t}: ${d}`));
  }

  return parts.join('\n');
}

/**
 * Checklist: Type + category + key indicators for matching.
 */
function formatChecklist(ref: DocumentReference): string {
  const parts = [
    `### ${ref.fileType} (${ref.category})`,
    `Keywords: ${ref.keywords.slice(0, 10).join(', ')}`,
    `Filing: ${ref.filing.targetFolder} (${ref.filing.targetLevel})`,
  ];

  const primaryRules = ref.identificationRules
    .filter((r) => r.startsWith('PRIMARY:'))
    .slice(0, 2);
  if (primaryRules.length > 0) {
    primaryRules.forEach((r) => parts.push(`- ${r}`));
  }

  return parts.join('\n');
}

/**
 * Generic compact format (fallback).
 */
function formatCompact(ref: DocumentReference): string {
  return [
    `### ${ref.fileType} (${ref.category})`,
    `Tags: ${ref.tags.map((t) => t.value).join(', ')}`,
    `Keywords: ${ref.keywords.slice(0, 10).join(', ')}`,
    '',
    ref.description.split('\n\n')[0],
  ].join('\n');
}
