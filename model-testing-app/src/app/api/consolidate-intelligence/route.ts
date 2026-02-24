import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedConvexClient } from '@/lib/auth';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import {
  CLIENT_CANONICAL_FIELDS,
  PROJECT_CANONICAL_FIELDS,
  normalizeFieldLabel,
} from '@/lib/canonicalFields';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Together AI configuration for Llama consolidation
const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const LLAMA_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

interface KnowledgeItemForConsolidation {
  _id: string;
  fieldPath: string;
  isCanonical: boolean;
  category: string;
  label: string;
  value: unknown;
  valueType: string;
  sourceType: string;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  status: string;
  addedAt: string;
}

interface DuplicateRecommendation {
  fieldPath: string;
  keepId: string;
  removeIds: string[];
  reason: string;
}

interface ConflictDetection {
  fieldPath: string;
  itemIds: string[];
  values: unknown[];
  description: string;
}

interface ReclassificationSuggestion {
  itemId: string;
  currentPath: string;
  suggestedPath: string;
  reason: string;
  confidence: number;
}

interface ConsolidationResult {
  duplicates: DuplicateRecommendation[];
  conflicts: ConflictDetection[];
  reclassify: ReclassificationSuggestion[];
  summary: {
    totalItems: number;
    duplicatesFound: number;
    conflictsFound: number;
    reclassifySuggestions: number;
  };
}

/**
 * Run the Llama consolidation agent
 */
async function runConsolidationAgent(
  items: KnowledgeItemForConsolidation[],
  targetType: 'client' | 'project',
  apiKey: string
): Promise<ConsolidationResult> {
  const canonicalFields = targetType === 'client' ? CLIENT_CANONICAL_FIELDS : PROJECT_CANONICAL_FIELDS;
  const fieldPaths = Object.keys(canonicalFields);

  // Group items by field path to detect duplicates easily
  const itemsByPath: Record<string, KnowledgeItemForConsolidation[]> = {};
  for (const item of items) {
    if (!itemsByPath[item.fieldPath]) {
      itemsByPath[item.fieldPath] = [];
    }
    itemsByPath[item.fieldPath].push(item);
  }

  // Pre-compute duplicates (same path, multiple items)
  const precomputedDuplicates: DuplicateRecommendation[] = [];
  for (const [path, pathItems] of Object.entries(itemsByPath)) {
    if (pathItems.length > 1) {
      // Sort by preference: document source > ai_extraction > manual, then newer
      const sorted = [...pathItems].sort((a, b) => {
        const sourceOrder = { document: 0, ai_extraction: 1, data_library: 2, manual: 3, checklist: 4 };
        const aSource = sourceOrder[a.sourceType as keyof typeof sourceOrder] ?? 5;
        const bSource = sourceOrder[b.sourceType as keyof typeof sourceOrder] ?? 5;
        if (aSource !== bSource) return aSource - bSource;
        return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      });

      precomputedDuplicates.push({
        fieldPath: path,
        keepId: sorted[0]._id,
        removeIds: sorted.slice(1).map(i => i._id),
        reason: `Keeping ${sorted[0].sourceType} source (${sorted[0].sourceDocumentName || 'manual entry'}) as it has higher priority. Removing ${sorted.length - 1} duplicate(s).`,
      });
    }
  }

  // Pre-compute conflicts (same path, different values)
  const precomputedConflicts: ConflictDetection[] = [];
  for (const [path, pathItems] of Object.entries(itemsByPath)) {
    if (pathItems.length > 1) {
      const uniqueValues = new Set(pathItems.map(i => JSON.stringify(i.value)));
      if (uniqueValues.size > 1) {
        precomputedConflicts.push({
          fieldPath: path,
          itemIds: pathItems.map(i => i._id),
          values: pathItems.map(i => i.value),
          description: `Field "${path}" has ${uniqueValues.size} different values from different sources.`,
        });
      }
    }
  }

  // Use Llama for reclassification suggestions (custom → canonical)
  const customItems = items.filter(i => !i.isCanonical && i.fieldPath.startsWith('custom.'));

  let reclassifySuggestions: ReclassificationSuggestion[] = [];

  if (customItems.length > 0) {
    const systemPrompt = `You are an intelligence data normalization assistant for a real estate finance platform.

Your task is to analyze custom fields and determine if any of them should be reclassified to canonical fields.

CANONICAL FIELDS (standard fields in the system):
${fieldPaths.map(p => `- ${p}: ${canonicalFields[p]?.label}`).join('\n')}

RULES:
1. Only suggest reclassification if you're confident (>70%) the custom field matches a canonical field
2. Consider the field label, value, and semantic meaning
3. Return valid JSON only`;

    const userPrompt = `Analyze these custom fields and suggest which ones should be reclassified to canonical fields:

CUSTOM FIELDS:
${customItems.map(i => `- [ID: ${i._id}] ${i.fieldPath}: "${i.label}" = ${JSON.stringify(i.value)}`).join('\n')}

For each custom field that should be reclassified, provide:
- itemId: the ID of the item
- currentPath: the current custom.* path
- suggestedPath: the canonical field path it should map to
- reason: why this mapping makes sense
- confidence: 0.7-1.0 based on how confident you are

Respond with JSON:
{
  "reclassifications": [
    {
      "itemId": "...",
      "currentPath": "custom.company_reg",
      "suggestedPath": "company.registrationNumber",
      "reason": "The label 'Company Reg' clearly refers to company registration number",
      "confidence": 0.95
    }
  ]
}

If no reclassifications are needed, return: { "reclassifications": [] }`;

    try {
      const response = await fetch(TOGETHER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: LLAMA_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(content);

        if (parsed.reclassifications && Array.isArray(parsed.reclassifications)) {
          reclassifySuggestions = parsed.reclassifications.filter(
            (r: ReclassificationSuggestion) => r.confidence >= 0.7
          );
        }
      }
    } catch (error) {
      console.error('[Consolidation] Llama API error:', error);
      // Fall back to algorithmic reclassification
      for (const item of customItems) {
        const result = normalizeFieldLabel(item.label, targetType);
        if (result.canonicalPath && result.confidence >= 0.7) {
          reclassifySuggestions.push({
            itemId: item._id,
            currentPath: item.fieldPath,
            suggestedPath: result.canonicalPath,
            reason: result.matchedAlias
              ? `Label "${item.label}" matches alias "${result.matchedAlias}"`
              : `Label "${item.label}" is similar to canonical field`,
            confidence: result.confidence,
          });
        }
      }
    }
  }

  return {
    duplicates: precomputedDuplicates,
    conflicts: precomputedConflicts,
    reclassify: reclassifySuggestions,
    summary: {
      totalItems: items.length,
      duplicatesFound: precomputedDuplicates.length,
      conflictsFound: precomputedConflicts.length,
      reclassifySuggestions: reclassifySuggestions.length,
    },
  };
}

/**
 * POST /api/consolidate-intelligence
 * Analyze knowledge items and suggest consolidation actions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientId, projectId } = body;

    if (!clientId && !projectId) {
      return NextResponse.json(
        { error: 'Either clientId or projectId is required' },
        { status: 400 }
      );
    }

    const togetherApiKey = process.env.TOGETHER_API_KEY;
    if (!togetherApiKey) {
      return NextResponse.json(
        { error: 'TOGETHER_API_KEY not configured' },
        { status: 500 }
      );
    }

    const convexClient = await getAuthenticatedConvexClient();
    const targetType: 'client' | 'project' = projectId ? 'project' : 'client';

    // Get all knowledge items
    let items: KnowledgeItemForConsolidation[];
    if (projectId) {
      // @ts-ignore - Convex type instantiation is excessively deep
      const rawItems = await convexClient.query(api.knowledgeLibrary.getKnowledgeItemsByProject, {
        projectId: projectId as Id<"projects">,
      });
      items = rawItems.map(i => ({
        _id: i._id,
        fieldPath: i.fieldPath,
        isCanonical: i.isCanonical,
        category: i.category,
        label: i.label,
        value: i.value,
        valueType: i.valueType,
        sourceType: i.sourceType,
        sourceDocumentId: i.sourceDocumentId,
        sourceDocumentName: i.sourceDocumentName,
        status: i.status,
        addedAt: i.addedAt,
      }));
    } else {
      // @ts-ignore - Convex type instantiation
      const rawItems = await convexClient.query(api.knowledgeLibrary.getKnowledgeItemsByClient, {
        clientId: clientId as Id<"clients">,
      });
      items = rawItems.map((i: any) => ({
        _id: i._id,
        fieldPath: i.fieldPath,
        isCanonical: i.isCanonical,
        category: i.category,
        label: i.label,
        value: i.value,
        valueType: i.valueType,
        sourceType: i.sourceType,
        sourceDocumentId: i.sourceDocumentId,
        sourceDocumentName: i.sourceDocumentName,
        status: i.status,
        addedAt: i.addedAt,
      }));
    }

    // Filter to active items only
    const activeItems = items.filter(i => i.status === 'active');

    if (activeItems.length === 0) {
      return NextResponse.json({
        success: true,
        result: {
          duplicates: [],
          conflicts: [],
          reclassify: [],
          summary: {
            totalItems: 0,
            duplicatesFound: 0,
            conflictsFound: 0,
            reclassifySuggestions: 0,
          },
        },
        message: 'No active knowledge items to consolidate',
      });
    }

    console.log(`[Consolidation] Analyzing ${activeItems.length} items for ${targetType}`);

    const result = await runConsolidationAgent(activeItems, targetType, togetherApiKey);

    console.log(`[Consolidation] Found: ${result.summary.duplicatesFound} duplicates, ${result.summary.conflictsFound} conflicts, ${result.summary.reclassifySuggestions} reclassify suggestions`);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('[Consolidation] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Consolidation failed' },
      { status: 500 }
    );
  }
}
