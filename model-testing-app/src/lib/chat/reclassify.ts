// src/lib/chat/reclassify.ts
import Anthropic from '@anthropic-ai/sdk';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

const anthropic = new Anthropic();

export interface ReclassifyResult {
  found: boolean;
  answer?: string;
  newFields: Array<{ fieldPath: string; label: string; value: string; confidence: number }>;
  evidence?: { page?: number; quote?: string };
  documentName: string;
}

/**
 * Deep-analyze a document to find specific information.
 * Downloads full document content, runs focused extraction,
 * and saves new findings to intelligence.
 */
export async function handleReclassify(
  params: {
    documentId: string;
    focusQuery: string;
    projectId?: string;
    clientId?: string;
  },
  convexClient: ConvexHttpClient
): Promise<ReclassifyResult> {
  // 1. Fetch document metadata
  const doc = await convexClient.query(api.documents.get, { id: params.documentId as Id<"documents"> });
  if (!doc) throw new Error(`Document not found: ${params.documentId}`);

  // 2. Get document content (from existing extracted text or storage)
  let documentContent = '';
  if (doc.extractedText) {
    documentContent = doc.extractedText;
  } else if (doc.storageId) {
    // Fetch from Convex storage
    const url = await convexClient.query(api.documents.getFileUrl, { storageId: doc.storageId as Id<"_storage"> });
    if (url) {
      const response = await fetch(url);
      documentContent = await response.text();
    }
  }

  if (!documentContent || documentContent.length < 10) {
    return {
      found: false,
      answer: undefined,
      newFields: [],
      documentName: doc.fileName || 'Unknown',
    };
  }

  // 3. Get current intelligence state (to avoid re-extracting known fields)
  let currentIntel: any = {};
  if (params.projectId) {
    currentIntel = await convexClient.query(api.intelligence.getProjectIntelligence, {
      projectId: params.projectId as Id<"projects">,
    }) || {};
  } else if (params.clientId) {
    currentIntel = await convexClient.query(api.intelligence.getClientIntelligence, {
      clientId: params.clientId as Id<"clients">,
    }) || {};
  }

  // 4. Run deep extraction focused on the query
  const extractionResponse = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are analyzing a document to find specific information and extract any other useful data points.

FOCUS QUERY: ${params.focusQuery}

DOCUMENT: ${doc.fileName}
CONTENT:
${documentContent}

ALREADY KNOWN (do not re-extract these):
${JSON.stringify(summarizeIntel(currentIntel), null, 2)}

Instructions:
1. First, try to answer the focus query. If found, provide the exact answer with page/section reference.
2. Then, extract ANY other useful data points you can find that are NOT already known.
3. For each new data point, provide: field path, label, value, confidence (0-1), and source quote.

Respond in this exact JSON format:
{
  "focusAnswer": "the specific answer or null if not found",
  "focusEvidence": { "page": null, "quote": "exact quote from doc" },
  "newFields": [
    { "fieldPath": "financials.loanAmount", "label": "Loan Amount", "value": "2400000", "confidence": 0.95, "sourceText": "quote" }
  ]
}`,
    }],
  });

  // 5. Parse response
  const textBlock = extractionResponse.content.find((b) => b.type === 'text');
  let parsed: any = {};
  try {
    const jsonStr = textBlock?.text?.match(/\{[\s\S]*\}/)?.[0] || '{}';
    parsed = JSON.parse(jsonStr);
  } catch {
    parsed = { focusAnswer: null, newFields: [] };
  }

  // 6. Save new fields to intelligence via knowledgeLibrary.addKnowledgeItem
  const savedFields: ReclassifyResult['newFields'] = [];
  if (parsed.newFields && Array.isArray(parsed.newFields)) {
    for (const field of parsed.newFields) {
      try {
        if (params.projectId || params.clientId) {
          await convexClient.mutation(api.knowledgeLibrary.addKnowledgeItem, {
            ...(params.clientId ? { clientId: params.clientId as Id<"clients"> } : {}),
            ...(params.projectId ? { projectId: params.projectId as Id<"projects"> } : {}),
            fieldPath: field.fieldPath,
            isCanonical: false,
            category: field.fieldPath.split('.')[0] || 'other',
            label: field.label,
            value: String(field.value),
            valueType: 'string',
            sourceType: 'ai_extraction',
            sourceDocumentId: params.documentId as Id<"documents">,
            sourceDocumentName: doc.fileName || undefined,
            sourceText: field.sourceText || '',
            normalizationConfidence: field.confidence || 0.8,
            addedBy: 'chat-reclassify',
          });
          savedFields.push({
            fieldPath: field.fieldPath,
            label: field.label,
            value: String(field.value),
            confidence: field.confidence || 0.8,
          });
        }
      } catch (e) {
        // Skip individual field save errors
        console.warn(`[reclassify] Failed to save field ${field.fieldPath}:`, e);
      }
    }
  }

  return {
    found: !!parsed.focusAnswer,
    answer: parsed.focusAnswer || undefined,
    newFields: savedFields,
    evidence: parsed.focusEvidence || undefined,
    documentName: doc.fileName || 'Unknown',
  };
}

function summarizeIntel(intel: any): Record<string, any> {
  const summary: Record<string, any> = {};
  const skip = new Set(['_id', '_creationTime', 'clientId', 'projectId', 'clientType', 'lastUpdated', 'lastUpdatedBy', 'version']);
  for (const [key, value] of Object.entries(intel)) {
    if (skip.has(key)) continue;
    if (value && typeof value === 'object') {
      const filled = Object.entries(value as Record<string, any>)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${k}: ${v}`);
      if (filled.length > 0) summary[key] = filled.join(', ');
    }
  }
  return summary;
}
