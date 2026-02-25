// =============================================================================
// V4 ANTHROPIC CLIENT
// =============================================================================
// Wrapper around @anthropic-ai/sdk for the V4 skills pipeline.
// Handles: batch document classification, multimodal content,
// structured output parsing, and prompt caching.

import type {
  BatchDocument,
  DocumentClassification,
  IntelligenceField,
  ChecklistItem,
  FolderInfo,
  CorrectionContext,
  ClientContext,
  V4PipelineConfig,
} from '../types';

// =============================================================================
// MESSAGE TYPES (compatible with Anthropic SDK)
// =============================================================================

interface TextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

interface ImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface DocumentBlock {
  type: 'document';
  source: {
    type: 'base64';
    media_type: 'application/pdf';
    data: string;
  };
  cache_control?: { type: 'ephemeral' };
}

type ContentBlock = TextBlock | ImageBlock | DocumentBlock;

interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

// =============================================================================
// BATCH CLASSIFY REQUEST BUILDER
// =============================================================================

/**
 * Two-part system prompt for prompt caching.
 *
 * - stableBlock: Skill instructions (~2K tokens). Same across all batches.
 *   Gets cache_control: ephemeral so Anthropic caches it.
 * - dynamicBlock: References + folders (~6K tokens). Changes per batch.
 *   No cache_control — always sent fresh.
 *
 * Cache savings: ~2K tokens cached on subsequent calls.
 * Minimum for Haiku caching: 1024 tokens.
 */
export interface SystemPromptBlocks {
  stableBlock: string;
  dynamicBlock: string;
}

/**
 * Build the system prompt for batch classification as two blocks.
 *
 * @param referenceText — Pre-formatted reference text from the shared formatter.
 *   Context-specific formatting (classification gets full descriptions,
 *   identification rules, disambiguation; other contexts get compact formats).
 */
export function buildSystemPrompt(
  skillInstructions: string,
  referenceText: string,
  folders: FolderInfo[],
): SystemPromptBlocks {
  const folderList = folders
    .map(f => `- ${f.folderKey} (${f.name}, ${f.level}-level)`)
    .join('\n');

  return {
    stableBlock: skillInstructions,
    dynamicBlock: `## Available Folders\n${folderList}\n\n${referenceText || 'No reference documents loaded. Classify based on your knowledge.'}`,
  };
}

/**
 * Build the user message for a batch of documents.
 * Each document includes its processed content (text, images, or PDF pages).
 */
export function buildBatchUserMessage(
  documents: BatchDocument[],
  checklistItems: ChecklistItem[],
  clientContext: ClientContext,
  corrections: CorrectionContext[],
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Context header
  let contextText = `## Batch Classification Request\n\n`;
  contextText += `Classify the following ${documents.length} document(s).\n\n`;

  if (clientContext.clientName) {
    contextText += `**Client:** ${clientContext.clientName}`;
    if (clientContext.clientType) contextText += ` (${clientContext.clientType})`;
    contextText += '\n';
  }

  // Checklist items (only missing ones)
  const missingItems = checklistItems.filter(i => i.status === 'missing');
  if (missingItems.length > 0) {
    contextText += `\n## Missing Checklist Items (match documents to these)\n`;
    contextText += missingItems.map(item =>
      `- [${item.id}] "${item.name}" (${item.category})` +
      (item.matchingDocumentTypes?.length
        ? ` — matches: ${item.matchingDocumentTypes.join(', ')}`
        : '')
    ).join('\n');
    contextText += '\n';
  }

  // Corrections context (compact)
  if (corrections.length > 0) {
    contextText += `\n## Past Corrections (learn from these)\n`;
    contextText += corrections.slice(0, 5).map(c =>
      `- "${c.fileName}": AI said "${c.aiPredicted.fileType}" → User corrected to "${c.userCorrected.fileType}" (${c.correctionCount}x)`
    ).join('\n');
    contextText += '\n';
  }

  blocks.push({ type: 'text', text: contextText });

  // Add each document
  for (const doc of documents) {
    // Document header
    blocks.push({
      type: 'text',
      text: `\n---\n## Document ${doc.index + 1}: "${doc.fileName}" (${formatFileSize(doc.fileSize)}, ${doc.mediaType})\n` +
        (doc.hints.filenameTypeHint
          ? `Filename hint: possibly "${doc.hints.filenameTypeHint}"\n`
          : '') +
        (doc.hints.matchedTags.length > 0
          ? `Matched tags: ${doc.hints.matchedTags.join(', ')}\n`
          : ''),
    });

    // Document content (multimodal or text)
    switch (doc.processedContent.type) {
      case 'text':
        blocks.push({
          type: 'text',
          text: `Content:\n\`\`\`\n${doc.processedContent.text}\n\`\`\``,
        });
        break;

      case 'pdf_pages':
        for (const page of doc.processedContent.pages) {
          blocks.push({
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: page.base64,
            },
          });
        }
        break;

      case 'image':
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: doc.processedContent.mediaType,
            data: doc.processedContent.base64,
          },
        });
        break;

      case 'spreadsheet':
        const ss = doc.processedContent.summary;
        let ssText = `Sheets: ${ss.sheetNames.join(', ')}\n`;
        for (const preview of ss.sheetPreviews) {
          ssText += `\nSheet "${preview.sheetName}" (${preview.totalRows} rows):\n`;
          ssText += `Headers: ${preview.headers.join(' | ')}\n`;
          for (const row of preview.sampleRows.slice(0, 5)) {
            ssText += `  ${row.join(' | ')}\n`;
          }
        }
        blocks.push({ type: 'text', text: `Spreadsheet content:\n\`\`\`\n${ssText}\n\`\`\`` });
        break;
    }
  }

  // Output format instruction
  blocks.push({
    type: 'text',
    text: `\n---\n## Required Output Format\n` +
      `Return a JSON array with one object per document, in the same order as above.\n` +
      `Each object must match this schema exactly:\n` +
      '```json\n' +
      `[
  {
    "documentIndex": 0,
    "fileName": "example.pdf",
    "classification": {
      "fileType": "RedBook Valuation",
      "category": "Appraisals",
      "suggestedFolder": "appraisals",
      "targetLevel": "project",
      "confidence": 0.92,
      "reasoning": "Contains RICS valuation methodology...",
      "alternativeTypes": [{"fileType": "Appraisal", "category": "Appraisals", "confidence": 0.7}]
    },
    "summary": {
      "executiveSummary": "...",
      "documentPurpose": "...",
      "keyEntities": {"people": [], "companies": [], "locations": [], "projects": []},
      "keyTerms": ["RICS", "market value"],
      "keyDates": ["2024-01-15"],
      "keyAmounts": ["£2,500,000"]
    },
    "checklistMatches": [
      {"itemId": "abc123", "itemName": "Valuation Report", "category": "Appraisals", "confidence": 0.95, "reasoning": "..."}
    ],
    "intelligenceFields": [
      {"fieldPath": "financials.propertyValue", "label": "Property Value", "value": "2500000", "valueType": "currency", "confidence": 0.9, "sourceText": "Market value: £2,500,000", "templateTags": ["lenders_note", "perspective"]}
    ]
  }
]\n` +
      '```\n' +
      `IMPORTANT: Return ONLY the JSON array. No markdown, no explanation, just valid JSON.`,
  });

  return blocks;
}

// =============================================================================
// API CALL
// =============================================================================

/**
 * Make a single batch classification API call to Anthropic.
 * Returns parsed DocumentClassification[] for all documents in the batch.
 *
 * System prompt is split into two blocks for caching:
 * - stableBlock (skill instructions) gets cache_control → cached across calls
 * - dynamicBlock (refs + folders) sent fresh each time
 */
export async function callAnthropicBatch(
  systemPrompt: SystemPromptBlocks,
  userBlocks: ContentBlock[],
  config: V4PipelineConfig,
): Promise<{
  classifications: DocumentClassification[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };
  latencyMs: number;
}> {
  const startTime = Date.now();

  // Dynamic import to avoid build issues if SDK not yet installed
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const response = await client.messages.create({
    model: config.primaryModel,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    system: [
      {
        type: 'text',
        text: systemPrompt.stableBlock,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: systemPrompt.dynamicBlock,
      },
    ],
    messages: [
      {
        role: 'user',
        content: userBlocks as any,
      },
    ],
  });

  const latencyMs = Date.now() - startTime;

  // Extract text response
  const textContent = response.content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('');

  // Parse JSON response
  const classifications = parseClassificationResponse(textContent);

  const cacheRead = (response.usage as any)?.cache_read_input_tokens ?? 0;
  const cacheCreation = (response.usage as any)?.cache_creation_input_tokens ?? 0;
  if (cacheRead > 0) {
    console.log(`[ANTHROPIC] Cache hit: ${cacheRead} tokens read from cache`);
  }

  return {
    classifications,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      cacheReadTokens: cacheRead,
      cacheCreationTokens: cacheCreation,
    },
    latencyMs,
  };
}

// =============================================================================
// RESPONSE PARSING
// =============================================================================

/**
 * Parse Claude's JSON response into DocumentClassification[].
 * Handles common issues: markdown code blocks, trailing commas, etc.
 */
function parseClassificationResponse(text: string): DocumentClassification[] {
  // Strip markdown code blocks if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      // If Claude returned a single object, wrap it
      return [parsed];
    }
    return parsed;
  } catch (e) {
    // Try to extract JSON array from response
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall through to error
      }
    }
    throw new Error(`Failed to parse classification response: ${(e as Error).message}\nResponse: ${text.slice(0, 500)}`);
  }
}

// =============================================================================
// INTELLIGENCE EXTRACTION API CALL
// =============================================================================

/**
 * Call Claude for deep intelligence extraction on a single classified document.
 * This is the SECOND call — after classification. Uses full document text (up to 12K chars).
 *
 * Same cache split pattern: skill instructions are cached, document text is dynamic.
 */
export async function callAnthropicIntelligence(
  skillInstructions: string,
  documentText: string,
  documentType: string,
  documentCategory: string,
  expectedFields: string[],
  config: V4PipelineConfig,
): Promise<{
  fields: IntelligenceField[];
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}> {
  const startTime = Date.now();

  // Truncate text to 12K chars for intelligence extraction (more than classification's 4K)
  const MAX_INTELLIGENCE_TEXT = 12_000;
  let text = documentText;
  if (text.length > MAX_INTELLIGENCE_TEXT) {
    const headLen = Math.floor(MAX_INTELLIGENCE_TEXT * 0.8);
    const tailLen = MAX_INTELLIGENCE_TEXT - headLen;
    text = `${text.slice(0, headLen)}\n\n[... ${text.length - MAX_INTELLIGENCE_TEXT} characters truncated ...]\n\n${text.slice(-tailLen)}`;
  }

  // Build user message with document context
  let userMessage = `## Document Details\n`;
  userMessage += `- **Type:** ${documentType}\n`;
  userMessage += `- **Category:** ${documentCategory}\n`;
  if (expectedFields.length > 0) {
    userMessage += `- **Expected fields for this type:** ${expectedFields.join(', ')}\n`;
  }
  userMessage += `\n## Document Text\n\`\`\`\n${text}\n\`\`\`\n`;
  userMessage += `\nExtract ALL intelligence fields from this document. Return ONLY a JSON array.`;

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const response = await client.messages.create({
    model: config.primaryModel,
    max_tokens: 4096,
    temperature: 0.1,
    system: [
      {
        type: 'text',
        text: skillInstructions,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  const latencyMs = Date.now() - startTime;

  const textContent = response.content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('');

  const fields = parseIntelligenceResponse(textContent);

  return {
    fields,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
    latencyMs,
  };
}

/**
 * Parse Claude's intelligence extraction response into IntelligenceField[].
 * Post-processes each field to ensure required fields have defaults.
 */
function parseIntelligenceResponse(text: string): IntelligenceField[] {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  let raw: any[];
  try {
    const parsed = JSON.parse(cleaned);
    raw = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        raw = JSON.parse(jsonMatch[0]);
      } catch {
        console.error(`[INTELLIGENCE] Failed to parse response: ${(e as Error).message}`);
        return [];
      }
    } else {
      console.error(`[INTELLIGENCE] Failed to parse response: ${(e as Error).message}`);
      return [];
    }
  }

  // Post-process: ensure required fields have defaults
  return raw.map((field: any) => ({
    ...field,
    category: field.category || field.fieldPath?.split('.')[0] || 'custom',
    originalLabel: field.originalLabel || field.label || '',
    templateTags: Array.isArray(field.templateTags) && field.templateTags.length > 0
      ? field.templateTags
      : ['general'],
    sourceText: field.sourceText || '',
    isCanonical: field.isCanonical ?? !field.fieldPath?.startsWith('custom.'),
    scope: field.scope || 'project',
  }));
}

// =============================================================================
// BATCH INTELLIGENCE EXTRACTION
// =============================================================================

interface IntelligenceBatchDocument {
  index: number;
  text: string;
  fileName: string;
  documentType: string;
  documentCategory: string;
  expectedFields: string[];
}

/**
 * Batch intelligence extraction — process multiple documents in a single API call.
 * Up to 5 documents per call, each truncated to 8K chars.
 * System prompt (skill instructions) is cached across calls.
 *
 * Returns a keyed record: { [documentIndex]: IntelligenceField[] }
 */
export async function callAnthropicIntelligenceBatch(
  skillInstructions: string,
  documents: IntelligenceBatchDocument[],
  config: V4PipelineConfig,
): Promise<{
  results: Record<number, IntelligenceField[]>;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  latencyMs: number;
}> {
  const startTime = Date.now();
  const MAX_TEXT = 8_000; // INTEL_MAX_TEXT_PER_DOC

  // Build user message with all documents
  let userMessage = `## Batch Intelligence Extraction\n\n`;
  userMessage += `Extract structured intelligence fields from the following ${documents.length} document(s).\n`;
  userMessage += `Return a JSON object keyed by document index.\n\n`;

  for (const doc of documents) {
    // Truncate text using 80/20 head/tail split
    let text = doc.text;
    if (text.length > MAX_TEXT) {
      const headLen = Math.floor(MAX_TEXT * 0.8);
      const tailLen = MAX_TEXT - headLen;
      text = `${text.slice(0, headLen)}\n\n[... ${text.length - MAX_TEXT} characters truncated ...]\n\n${text.slice(-tailLen)}`;
    }

    userMessage += `---\n## Document ${doc.index}: "${doc.fileName}"\n`;
    userMessage += `- **Type:** ${doc.documentType}\n`;
    userMessage += `- **Category:** ${doc.documentCategory}\n`;
    if (doc.expectedFields.length > 0) {
      userMessage += `- **Expected fields:** ${doc.expectedFields.join(', ')}\n`;
    }
    userMessage += `\n\`\`\`\n${text}\n\`\`\`\n\n`;
  }

  userMessage += `---\n## Required Output Format\n\n`;
  userMessage += `Return a JSON object keyed by document index. Each value is an array of intelligence fields.\n`;
  userMessage += `Example: { "0": [ { "fieldPath": "financials.gdv", ... } ], "1": [ ... ] }\n\n`;
  userMessage += `IMPORTANT: Return ONLY the JSON object. No markdown, no explanation, just valid JSON.`;

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const response = await client.messages.create({
    model: config.primaryModel,
    max_tokens: 8_192, // INTEL_MAX_OUTPUT_TOKENS
    temperature: 0.1,
    system: [
      {
        type: 'text',
        text: skillInstructions,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  const latencyMs = Date.now() - startTime;

  const textContent = response.content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('');

  const results = parseIntelligenceBatchResponse(textContent, documents.map(d => d.index));

  const cacheRead = (response.usage as any)?.cache_read_input_tokens ?? 0;
  if (cacheRead > 0) {
    console.log(`[ANTHROPIC] Intelligence batch cache hit: ${cacheRead} tokens from cache`);
  }

  return {
    results,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      cacheReadTokens: cacheRead,
    },
    latencyMs,
  };
}

/**
 * Parse Claude's batch intelligence response into a keyed record.
 * Expects: { "0": [...fields], "1": [...fields] }
 * Falls back gracefully: if Claude returns an array, tries to split by documentIndex.
 */
function parseIntelligenceBatchResponse(
  text: string,
  expectedIndices: number[],
): Record<number, IntelligenceField[]> {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const results: Record<number, IntelligenceField[]> = {};
  // Initialize all expected indices with empty arrays
  for (const idx of expectedIndices) {
    results[idx] = [];
  }

  try {
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      // Claude returned an array — try to group by documentIndex field
      for (const field of parsed) {
        const idx = field.documentIndex ?? expectedIndices[0] ?? 0;
        if (!results[idx]) results[idx] = [];
        results[idx].push(postProcessField(field));
      }
    } else if (typeof parsed === 'object') {
      // Expected format: keyed by document index
      for (const [key, fields] of Object.entries(parsed)) {
        const idx = parseInt(key, 10);
        if (isNaN(idx)) continue;
        results[idx] = Array.isArray(fields)
          ? (fields as any[]).map(postProcessField)
          : [];
      }
    }
  } catch (e) {
    // Try to extract JSON object from response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const [key, fields] of Object.entries(parsed)) {
          const idx = parseInt(key, 10);
          if (isNaN(idx)) continue;
          results[idx] = Array.isArray(fields)
            ? (fields as any[]).map(postProcessField)
            : [];
        }
      } catch {
        console.error(`[INTELLIGENCE BATCH] Failed to parse response: ${(e as Error).message}`);
      }
    } else {
      console.error(`[INTELLIGENCE BATCH] Failed to parse response: ${(e as Error).message}`);
    }
  }

  return results;
}

/** Post-process a single field to ensure required fields have defaults */
function postProcessField(field: any): IntelligenceField {
  return {
    ...field,
    category: field.category || field.fieldPath?.split('.')[0] || 'custom',
    originalLabel: field.originalLabel || field.label || '',
    templateTags: Array.isArray(field.templateTags) && field.templateTags.length > 0
      ? field.templateTags
      : ['general'],
    sourceText: field.sourceText || '',
    isCanonical: field.isCanonical ?? !field.fieldPath?.startsWith('custom.'),
    scope: field.scope || 'project',
  };
}

// =============================================================================
// UTILS
// =============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
