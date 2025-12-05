import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';

export const runtime = 'nodejs';

// Initialize Convex client
function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not set');
  }
  return new ConvexHttpClient(convexUrl);
}

/**
 * Category normalizations (must match codifiedTemplatePopulator.ts)
 */
const CATEGORY_NORMALIZATIONS: Record<string, string> = {
  // Site Costs / Land Acquisition
  'site costs': 'site.costs',
  'purchase costs': 'site.costs',
  'land costs': 'site.costs',
  'land acquisition': 'site.costs',
  'acquisition costs': 'site.costs',
  'site': 'site.costs',
  
  // Professional Fees
  'professional fees': 'professional.fees',
  'professional': 'professional.fees',
  'fees': 'professional.fees',
  'consultants': 'professional.fees',
  'consultant fees': 'professional.fees',
  
  // Construction Costs
  'construction costs': 'construction.costs',
  'net construction costs': 'construction.costs',
  'build costs': 'construction.costs',
  'construction': 'construction.costs',
  'building costs': 'construction.costs',
  'build': 'construction.costs',
  
  // Financing Costs
  'financing costs': 'financing.costs',
  'financing/legal fees': 'financing.costs',
  'financing': 'financing.costs',
  'finance': 'financing.costs',
  'finance costs': 'financing.costs',
  'loan costs': 'financing.costs',
  'interest': 'financing.costs',
  
  // Disposal Costs / Sales Costs
  'disposal costs': 'disposal.costs',
  'disposal fees': 'disposal.costs',
  'disposal': 'disposal.costs',
  'sales costs': 'disposal.costs',
  'selling costs': 'disposal.costs',
  'marketing': 'disposal.costs',
  
  // Plots / Units / Development
  'plots': 'plots',
  'plot': 'plots',
  'units': 'plots',
  'unit': 'plots',
  'houses': 'plots',
  'house': 'plots',
  'development': 'plots',
  'developments': 'plots',
  'homes': 'plots',
  'home': 'plots',
  'properties': 'plots',
  'property': 'plots',
  'dwellings': 'plots',
  
  // Revenue
  'revenue': 'revenue',
  'sales': 'revenue',
  'income': 'revenue',
  'gross development value': 'revenue',
  'gdv': 'revenue',
  
  // Profit
  'profit': 'profit',
  'profits': 'profit',
  'margin': 'profit',
  'returns': 'profit',
  
  // Other / Uncategorized
  'other': 'other',
  'uncategorized': 'other',
  'miscellaneous': 'other',
  'misc': 'other',
  'general': 'other',
};

function normalizeCategory(category: string): string {
  const lower = category.toLowerCase().trim();
  return CATEGORY_NORMALIZATIONS[lower] || lower.replace(/\s+/g, '.');
}

/**
 * GET /api/debug-codification?documentId=xxx
 * 
 * Debug endpoint for troubleshooting codification issues.
 * Returns detailed information about:
 * - Current extraction items with their categories and statuses
 * - What category each item normalizes to
 * - Which items would match fallback rows
 * - Summary statistics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    
    if (!documentId) {
      return NextResponse.json(
        { error: 'documentId query parameter is required' },
        { status: 400 }
      );
    }
    
    const client = getConvexClient();
    
    // Get the codified extraction for this document
    const extraction = await client.query(api.codifiedExtractions.getByDocument, {
      documentId: documentId as Id<"documents">,
    });
    
    if (!extraction) {
      return NextResponse.json({
        error: 'No codified extraction found for this document',
        documentId,
        suggestion: 'Try uploading a new file or clicking "Codify" in the Data Library',
      }, { status: 404 });
    }
    
    // Analyze items
    const items = extraction.items || [];
    
    // Group by status
    const byStatus: Record<string, any[]> = {
      matched: [],
      confirmed: [],
      suggested: [],
      pending_review: [],
      unmatched: [],
    };
    
    items.forEach((item: any) => {
      const status = item.mappingStatus || 'unknown';
      if (!byStatus[status]) byStatus[status] = [];
      byStatus[status].push({
        originalName: item.originalName,
        itemCode: item.itemCode,
        suggestedCode: item.suggestedCode,
        value: item.value,
        category: item.category,
        confidence: item.confidence,
      });
    });
    
    // Group by raw category
    const byRawCategory: Record<string, any[]> = {};
    items.forEach((item: any) => {
      const cat = item.category || 'Unknown';
      if (!byRawCategory[cat]) byRawCategory[cat] = [];
      byRawCategory[cat].push({
        originalName: item.originalName,
        mappingStatus: item.mappingStatus,
        value: item.value,
      });
    });
    
    // Analyze category normalization
    const categoryNormalization: Record<string, { normalized: string; usable: number; total: number }> = {};
    items.forEach((item: any) => {
      const rawCat = item.category || 'Unknown';
      const normalizedCat = normalizeCategory(rawCat);
      
      if (!categoryNormalization[rawCat]) {
        categoryNormalization[rawCat] = { normalized: normalizedCat, usable: 0, total: 0 };
      }
      categoryNormalization[rawCat].total++;
      
      if (item.mappingStatus === 'confirmed' || item.mappingStatus === 'matched') {
        categoryNormalization[rawCat].usable++;
      }
    });
    
    // Usable items by normalized category (for fallback matching)
    const usableByNormalizedCategory: Record<string, any[]> = {};
    items.forEach((item: any) => {
      if (item.mappingStatus === 'confirmed' || item.mappingStatus === 'matched') {
        const normalizedCat = normalizeCategory(item.category || 'Unknown');
        if (!usableByNormalizedCategory[normalizedCat]) {
          usableByNormalizedCategory[normalizedCat] = [];
        }
        usableByNormalizedCategory[normalizedCat].push({
          originalName: item.originalName,
          itemCode: item.itemCode,
          value: item.value,
        });
      }
    });
    
    // Calculate stats
    const stats = {
      total: items.length,
      matched: byStatus.matched.length,
      confirmed: byStatus.confirmed.length,
      suggested: byStatus.suggested.length,
      pending_review: byStatus.pending_review.length,
      unmatched: byStatus.unmatched.length,
      usable: byStatus.matched.length + byStatus.confirmed.length,
      notUsable: items.length - (byStatus.matched.length + byStatus.confirmed.length),
    };
    
    // Return debug info
    return NextResponse.json({
      documentId,
      extractionId: extraction._id,
      isFullyConfirmed: extraction.isFullyConfirmed,
      fastPassCompleted: extraction.fastPassCompleted,
      smartPassCompleted: extraction.smartPassCompleted,
      
      stats,
      
      categoryNormalization: Object.entries(categoryNormalization).map(([raw, info]) => ({
        rawCategory: raw,
        normalizedCategory: info.normalized,
        totalItems: info.total,
        usableItems: info.usable,
        wouldMatchFallback: `<all.${info.normalized}.name>`,
      })),
      
      usableByNormalizedCategory: Object.entries(usableByNormalizedCategory).map(([cat, catItems]) => ({
        normalizedCategory: cat,
        fallbackPattern: `<all.${cat}.name>`,
        itemCount: catItems.length,
        items: catItems,
      })),
      
      itemsByStatus: {
        matched: byStatus.matched,
        confirmed: byStatus.confirmed,
        suggested: byStatus.suggested,
        pending_review: byStatus.pending_review,
        unmatched: byStatus.unmatched,
      },
      
      itemsByRawCategory: byRawCategory,
      
      // Known fallback patterns that templates use
      supportedFallbackPatterns: [
        '<all.site.costs.name>', '<all.site.costs.value>',
        '<all.professional.fees.name>', '<all.professional.fees.value>',
        '<all.construction.costs.name>', '<all.construction.costs.value>',
        '<all.financing.costs.name>', '<all.financing.costs.value>',
        '<all.disposal.costs.name>', '<all.disposal.costs.value>',
        '<all.plots.name>', '<all.plots.value>',
        '<all.revenue.name>', '<all.revenue.value>',
        '<all.other.name>', '<all.other.value>',
      ],
      
      // Troubleshooting tips
      tips: {
        plotsNotPopulating: items.some((i: any) => 
          (i.category || '').toLowerCase().includes('plot') || 
          (i.category || '').toLowerCase().includes('unit')
        ) ? 
          `Items with category containing 'plot' or 'unit' found. Check if their status is 'confirmed' or 'matched'.` :
          `No items with category containing 'plot' found. Check if the extraction correctly identified plots.`,
        
        itemsNotUsable: stats.notUsable > 0 ?
          `${stats.notUsable} items have status other than 'confirmed' or 'matched'. Confirm these in the Data Library to use them.` :
          `All items are usable (confirmed or matched).`,
      },
    });
    
  } catch (error) {
    console.error('[DebugCodification] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}





