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
  ItemCodeAlias 
} from '@/lib/smartPassCodification';
import { ExtractedData } from '@/types';

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
  
  console.log('[FastPass] Starting for document:', documentId);
  const startTime = Date.now();
  
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
  
  const elapsed = Date.now() - startTime;
  console.log('[FastPass] Completed in', elapsed, 'ms');
  console.log('[FastPass] Stats:', result.stats);
  
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
 */
async function handleSmartPass(body: {
  documentId: string;
  extractionId?: string;
}): Promise<NextResponse> {
  const { documentId, extractionId } = body;
  
  if (!documentId) {
    return NextResponse.json(
      { error: 'documentId is required' },
      { status: 400 }
    );
  }
  
  console.log('[SmartPass] Starting for document:', documentId);
  const startTime = Date.now();
  
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
  
  // Check if Smart Pass already ran
  if (extraction.smartPassCompleted) {
    return NextResponse.json({
      success: true,
      message: 'Smart Pass already completed',
      extractionId: extraction._id,
      stats: extraction.mappingStats,
      items: extraction.items,
    });
  }
  
  // Get pending items
  const pendingItems = extraction.items.filter(
    (item: CodifiedItem) => item.mappingStatus === 'pending_review'
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
  
  // Get existing codes and aliases
  const [existingCodes, existingAliases] = await Promise.all([
    client.query(api.extractedItemCodes.list, { activeOnly: true }),
    client.query(api.itemCodeAliases.list, {}),
  ]);
  
  // Run Smart Pass
  const smartResult = await runSmartPass(
    pendingItems as CodifiedItem[],
    existingCodes as ItemCode[],
    existingAliases as ItemCodeAlias[]
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
  
  const elapsed = Date.now() - startTime;
  console.log('[SmartPass] Completed in', elapsed, 'ms');
  
  return NextResponse.json({
    success: true,
    extractionId: extraction._id,
    suggestions: smartResult.suggestions,
    newCodeSuggestions: smartResult.newCodeSuggestions,
    tokensUsed: smartResult.tokensUsed,
    items: updatedItems,
  });
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

