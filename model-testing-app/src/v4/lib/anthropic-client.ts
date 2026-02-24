// =============================================================================
// V4 ANTHROPIC CLIENT
// =============================================================================
// Wrapper around @anthropic-ai/sdk for the V4 skills pipeline.
// Handles: batch document classification, multimodal content,
// structured output parsing, and prompt caching.

import type {
  BatchDocument,
  DocumentClassification,
  BatchClassifyResult,
  ChecklistItem,
  FolderInfo,
  CorrectionContext,
  ClientContext,
  ReferenceDocument,
  V4PipelineConfig,
  BATCH_LIMITS,
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
 * Build the system prompt for batch classification.
 * This is CACHED (changes only when references/skill instructions update).
 */
export function buildSystemPrompt(
  skillInstructions: string,
  references: ReferenceDocument[],
  folders: FolderInfo[],
): string {
  const folderList = folders
    .map(f => `- ${f.folderKey} (${f.name}, ${f.level}-level)`)
    .join('\n');

  const referenceSection = references.length > 0
    ? references.map(ref =>
        `### ${ref.fileType} (${ref.category})\n` +
        `Tags: ${ref.tags.join(', ')}\n` +
        `Keywords: ${ref.keywords.join(', ')}\n` +
        `${ref.content}`
      ).join('\n\n')
    : 'No reference documents loaded. Classify based on your knowledge.';

  return `${skillInstructions}

## Available Folders
${folderList}

## Reference Library
The following reference documents describe known file types. Use them to match uploaded documents.
${referenceSection}`;
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
            type: 'image',
            source: {
              type: 'base64',
              media_type: page.mediaType,
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
 */
export async function callAnthropicBatch(
  systemPrompt: string,
  userBlocks: ContentBlock[],
  config: V4PipelineConfig,
): Promise<{
  classifications: DocumentClassification[];
  usage: { inputTokens: number; outputTokens: number };
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
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: userBlocks,
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

  return {
    classifications,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
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
// UTILS
// =============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
