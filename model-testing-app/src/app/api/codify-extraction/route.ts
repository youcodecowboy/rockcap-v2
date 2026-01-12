import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { 
  runFastPass, 
  runFastPassWithFuzzy,
  buildAliasLookupMap,
  extractItemsFromData,
  CodifiedItem 
} from '@/lib/fastPassCodification';
import { 
  runSmartPass, 
  applySmartPassSuggestions,
  ItemCode,
  ItemCodeAlias,
  CategoryInfo
} from '@/lib/smartPassCodification';
import { ExtractedData } from '@/types';
import { TOGETHER_API_URL, MODEL_CONFIG } from '@/lib/modelConfig';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds max

// Initialize Convex client
function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not set');
  }
  return new ConvexHttpClient(convexUrl);
}

/**
 * POST /api/codify-extraction
 * 
 * Main endpoint for codification. Supports three actions:
 * - fast-pass: Run Fast Pass alias lookup (instant)
 * - smart-pass: Run Smart Pass LLM codification (on-demand)
 * - confirm: Confirm item mappings (creates aliases)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    
    switch (action) {
      case 'fast-pass':
        return handleFastPass(body);
      case 'smart-pass':
        return handleSmartPass(body);
      case 'confirm':
        return handleConfirm(body);
      case 'confirm-all':
        return handleConfirmAll(body);
      case 'suggest-single':
        return handleSuggestSingle(body);
      case 'add-item':
        return handleAddItem(body);
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Codify API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Handle Fast Pass codification
 * Called immediately after extraction
 */
async function handleFastPass(body: {
  documentId: string;
  projectId?: string;
  extractedData: ExtractedData;
}): Promise<NextResponse> {
  const { documentId, projectId, extractedData } = body;
  
  if (!documentId || !extractedData) {
    return NextResponse.json(
      { error: 'documentId and extractedData are required' },
      { status: 400 }
    );
  }
  
  const client = getConvexClient();
  
  // Get all aliases from database
  const aliases = await client.query(api.itemCodeAliases.list, {});
  
  // Build lookup map
  const aliasLookup = buildAliasLookupMap(aliases.map(a => ({
    aliasNormalized: a.aliasNormalized,
    canonicalCode: a.canonicalCode,
    canonicalCodeId: a.canonicalCodeId as string,
    confidence: a.confidence,
    source: a.source,
  })));
  
  // Run Fast Pass with fuzzy matching
  const result = runFastPassWithFuzzy(extractedData, aliasLookup, 0.85);
  
  // Map items to Convex-compatible format (cast suggestedCodeId to proper Id type)
  const convexItems = result.items.map(item => ({
    ...item,
    suggestedCodeId: item.suggestedCodeId as Id<"extractedItemCodes"> | undefined,
  }));
  
  // Store codified extraction in database
  const extractionId = await client.mutation(api.codifiedExtractions.create, {
    documentId: documentId as Id<"documents">,
    projectId: projectId as Id<"projects"> | undefined,
    items: convexItems,
  });
  
  return NextResponse.json({
    success: true,
    extractionId,
    stats: result.stats,
    items: result.items,
  });
}

/**
 * Handle Smart Pass codification
 * Called when user opens Data Library with pending items
 * Set force=true to re-run even if already completed
 */
async function handleSmartPass(body: {
  documentId: string;
  extractionId?: string;
  force?: boolean;
}): Promise<NextResponse> {
  const { documentId, extractionId, force = false } = body;
  
  if (!documentId) {
    return NextResponse.json(
      { error: 'documentId is required' },
      { status: 400 }
    );
  }
  
  const client = getConvexClient();
  
  // Get the codified extraction
  let extraction;
  if (extractionId) {
    extraction = await client.query(api.codifiedExtractions.get, {
      id: extractionId as Id<"codifiedExtractions">,
    });
  } else {
    extraction = await client.query(api.codifiedExtractions.getByDocument, {
      documentId: documentId as Id<"documents">,
    });
  }
  
  if (!extraction) {
    return NextResponse.json(
      { error: 'No codified extraction found for this document' },
      { status: 404 }
    );
  }
  
  // Check if Smart Pass already ran (skip if force=true)
  if (extraction.smartPassCompleted && !force) {
    return NextResponse.json({
      success: true,
      message: 'Smart Pass already completed',
      extractionId: extraction._id,
      stats: extraction.mappingStats,
      items: extraction.items,
    });
  }
  
  // Get items that need processing (pending_review or suggested status)
  // On force retry, we also re-process 'suggested' items to try matching again
  const pendingItems = extraction.items.filter(
    (item: CodifiedItem) => 
      item.mappingStatus === 'pending_review' || 
      (force && item.mappingStatus === 'suggested')
  );
  
  if (pendingItems.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No pending items to process',
      extractionId: extraction._id,
      stats: extraction.mappingStats,
      items: extraction.items,
    });
  }
  
  try {
    // Get existing codes, aliases, and categories
    const [existingCodes, existingAliases, categories] = await Promise.all([
      client.query(api.extractedItemCodes.list, { activeOnly: true }),
      client.query(api.itemCodeAliases.list, {}),
      client.query(api.itemCategories.getForLLMPrompt, {}),
    ]);
    
    // Run Smart Pass with dynamic categories
    const smartResult = await runSmartPass(
      pendingItems as CodifiedItem[],
      (existingCodes || []) as ItemCode[],
      (existingAliases || []) as ItemCodeAlias[],
      (categories || []) as CategoryInfo[]
    );
    
    // Apply suggestions to items
    const updatedItems = applySmartPassSuggestions(
      extraction.items as CodifiedItem[],
      smartResult.suggestions
    );
    
    // Map items to Convex-compatible format (cast suggestedCodeId to proper Id type)
    const convexItems = updatedItems.map(item => ({
      ...item,
      suggestedCodeId: item.suggestedCodeId as Id<"extractedItemCodes"> | undefined,
    }));
    
    // Update the extraction
    await client.mutation(api.codifiedExtractions.updateAfterSmartPass, {
      id: extraction._id,
      items: convexItems,
    });
    
    return NextResponse.json({
      success: true,
      extractionId: extraction._id,
      suggestions: smartResult.suggestions,
      newCodeSuggestions: smartResult.newCodeSuggestions,
      tokensUsed: smartResult.tokensUsed,
      items: updatedItems,
    });
  } catch (smartPassError) {
    console.error('[SmartPass] Error during processing:', smartPassError);
    return NextResponse.json(
      { error: smartPassError instanceof Error ? smartPassError.message : 'Smart Pass processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Handle single item confirmation
 * Creates alias when user confirms a mapping
 */
async function handleConfirm(body: {
  extractionId: string;
  itemId: string;
  itemCode: string;
  codeId?: string;
  createNewCode?: boolean;
  newCodeData?: {
    displayName: string;
    category: string;
    dataType: 'currency' | 'number' | 'percentage' | 'string';
  };
}): Promise<NextResponse> {
  const { extractionId, itemId, itemCode, codeId, createNewCode, newCodeData } = body;
  
  if (!extractionId || !itemId || !itemCode) {
    return NextResponse.json(
      { error: 'extractionId, itemId, and itemCode are required' },
      { status: 400 }
    );
  }
  
  const client = getConvexClient();
  
  // Get the extraction to find the original name
  const extraction = await client.query(api.codifiedExtractions.get, {
    id: extractionId as Id<"codifiedExtractions">,
  });
  
  if (!extraction) {
    return NextResponse.json({ error: 'Extraction not found' }, { status: 404 });
  }
  
  const item = extraction.items.find((i: CodifiedItem) => i.id === itemId);
  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }
  
  let canonicalCodeId = codeId;
  
  // Create new code if requested
  if (createNewCode && newCodeData) {
    const newCode = await client.mutation(api.extractedItemCodes.create, {
      code: itemCode,
      displayName: newCodeData.displayName,
      category: newCodeData.category,
      dataType: newCodeData.dataType,
    });
    canonicalCodeId = newCode;
  }
  
  // Confirm the item
  const result = await client.mutation(api.codifiedExtractions.confirmItem, {
    extractionId: extractionId as Id<"codifiedExtractions">,
    itemId,
    itemCode,
    canonicalCodeId: canonicalCodeId as Id<"extractedItemCodes"> | undefined,
  });
  
  // Create alias for the original name
  if (canonicalCodeId) {
    await client.mutation(api.itemCodeAliases.create, {
      alias: item.originalName,
      canonicalCodeId: canonicalCodeId as Id<"extractedItemCodes">,
      confidence: 1.0,
      source: 'user_confirmed',
    });
  }
  
  return NextResponse.json({
    success: true,
    isFullyConfirmed: result.isFullyConfirmed,
    stats: result.stats,
  });
}

/**
 * Handle confirm all suggested items
 * Creates aliases for all confirmed items
 */
async function handleConfirmAll(body: {
  extractionId: string;
}): Promise<NextResponse> {
  const { extractionId } = body;
  
  if (!extractionId) {
    return NextResponse.json(
      { error: 'extractionId is required' },
      { status: 400 }
    );
  }
  
  const client = getConvexClient();
  
  // Get extraction before confirmation
  const extraction = await client.query(api.codifiedExtractions.get, {
    id: extractionId as Id<"codifiedExtractions">,
  });
  
  if (!extraction) {
    return NextResponse.json({ error: 'Extraction not found' }, { status: 404 });
  }
  
  // Find items that will be confirmed (currently suggested)
  const suggestedItems = extraction.items.filter(
    (i: CodifiedItem) => i.mappingStatus === 'suggested' && i.suggestedCode
  );
  
  // Confirm all suggested
  const result = await client.mutation(api.codifiedExtractions.confirmAllSuggested, {
    extractionId: extractionId as Id<"codifiedExtractions">,
  });
  
  // Create aliases for all confirmed items
  for (const item of suggestedItems) {
    if (item.suggestedCodeId) {
      await client.mutation(api.itemCodeAliases.create, {
        alias: item.originalName,
        canonicalCodeId: item.suggestedCodeId as Id<"extractedItemCodes">,
        confidence: 1.0,
        source: 'user_confirmed',
      });
    }
  }
  
  return NextResponse.json({
    success: true,
    isFullyConfirmed: result.isFullyConfirmed,
    stats: result.stats,
    aliasesCreated: suggestedItems.length,
  });
}

/**
 * Handle single item suggestion
 * Uses LLM to suggest a code for a manually entered item
 */
async function handleSuggestSingle(body: {
  itemName: string;
  itemValue?: number;
  itemCategory?: string;
}): Promise<NextResponse> {
  const { itemName, itemValue, itemCategory } = body;
  
  if (!itemName) {
    return NextResponse.json(
      { error: 'itemName is required' },
      { status: 400 }
    );
  }
  
  const client = getConvexClient();
  
  // Get existing codes and aliases for context
  const existingCodes = await client.query(api.extractedItemCodes.list, {}) as ItemCode[];
  const existingAliases = await client.query(api.itemCodeAliases.list, {}) as ItemCodeAlias[];
  
  // Build a simple prompt for single item suggestion
  const codesByCategory: Record<string, ItemCode[]> = {};
  existingCodes.forEach(code => {
    if (!codesByCategory[code.category]) {
      codesByCategory[code.category] = [];
    }
    codesByCategory[code.category].push(code);
  });
  
  const existingCodesText = existingCodes.length > 0 
    ? Object.entries(codesByCategory).map(([category, codes]) => 
        `${category}:\n${codes.map(c => `  - ${c.code} (${c.displayName})`).join('\n')}`
      ).join('\n\n')
    : 'No existing codes yet.';
  
  const prompt = `You are a financial data codification assistant.

EXISTING CODES IN THE SYSTEM:
${existingCodesText}

USER WANTS TO ADD THIS ITEM:
- Name: "${itemName}"
${itemValue !== undefined ? `- Value: ${itemValue}` : ''}
${itemCategory ? `- Category: ${itemCategory}` : ''}

TASK:
1. If an existing code matches this item, return that code
2. If no existing code matches, suggest a new code format: <category.name>

RESPOND IN JSON FORMAT ONLY:
{
  "suggestedCode": "<the.code>",
  "suggestedDisplayName": "Display Name",
  "suggestedCategory": "Category Name",
  "suggestedDataType": "currency|number|percentage|string",
  "confidence": 0.0-1.0,
  "isNewCode": true/false,
  "existingCodeId": "id if matching existing code, otherwise null",
  "reasoning": "Brief explanation"
}`;

  try {
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY not configured');
    }
    
    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_CONFIG.codification.model,
        messages: [
          { role: 'system', content: 'You are a financial data codification assistant. Always respond with valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1000, // Increased for more detailed suggestions
        temperature: MODEL_CONFIG.codification.temperature,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse the JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in LLM response');
    }
    
    const suggestion = JSON.parse(jsonMatch[0]);
    
    // Try to find the existing code ID if the LLM matched to an existing code
    if (!suggestion.isNewCode && suggestion.suggestedCode) {
      const matchingCode = existingCodes.find(c => c.code === suggestion.suggestedCode);
      if (matchingCode) {
        suggestion.existingCodeId = matchingCode._id;
      }
    }
    
    return NextResponse.json({
      success: true,
      suggestion,
    });
  } catch (error) {
    console.error('[SuggestSingle] Error:', error);
    
    // Return a fallback suggestion based on the item name
    const fallbackCode = `<${itemName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '.')}>`;
    
    return NextResponse.json({
      success: true,
      suggestion: {
        suggestedCode: fallbackCode,
        suggestedDisplayName: itemName,
        suggestedCategory: itemCategory || 'Manual Entry',
        suggestedDataType: 'currency',
        confidence: 0.5,
        isNewCode: true,
        existingCodeId: null,
        reasoning: 'Fallback suggestion based on item name (LLM unavailable)',
      },
    });
  }
}

/**
 * Handle adding a manual item to an extraction
 */
async function handleAddItem(body: {
  extractionId: string;
  documentId: string;
  item: {
    originalName: string;
    value: number;
    category: string;
    dataType: string;
    itemCode?: string;
    codeId?: string;
    isNewCode?: boolean;
  };
}): Promise<NextResponse> {
  const { extractionId, documentId, item } = body;
  
  if (!extractionId || !documentId || !item) {
    return NextResponse.json(
      { error: 'extractionId, documentId, and item are required' },
      { status: 400 }
    );
  }
  
  const client = getConvexClient();
  
  let canonicalCodeId = item.codeId;
  
  // Create new code if needed
  if (item.isNewCode && item.itemCode) {
    const newCode = await client.mutation(api.extractedItemCodes.create, {
      code: item.itemCode,
      displayName: item.originalName,
      category: item.category,
      dataType: item.dataType as 'currency' | 'number' | 'percentage' | 'string',
    });
    canonicalCodeId = newCode;
  }
  
  // Generate a unique ID for the new item
  const itemId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  // Add the item to the extraction
  const result = await client.mutation(api.codifiedExtractions.addItem, {
    extractionId: extractionId as Id<"codifiedExtractions">,
    item: {
      id: itemId,
      originalName: item.originalName,
      itemCode: item.itemCode,
      value: item.value,
      dataType: item.dataType,
      category: item.category,
      mappingStatus: item.itemCode ? 'confirmed' : 'pending_review',
      confidence: 1.0,
    },
  });
  
  // Create alias if we have a code
  if (canonicalCodeId) {
    await client.mutation(api.itemCodeAliases.create, {
      alias: item.originalName,
      canonicalCodeId: canonicalCodeId as Id<"extractedItemCodes">,
      confidence: 1.0,
      source: 'manual',
    });
  }
  
  return NextResponse.json({
    success: true,
    itemId,
    stats: result.stats,
  });
}

