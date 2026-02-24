import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile, validateFile, convertSpreadsheetToMarkdown } from '@/lib/fileProcessor';
import { extractSpreadsheetData } from '@/lib/dataExtraction';
import { normalizeExtractedData } from '@/lib/dataNormalization';
import { verifyExtractedData } from '@/lib/dataVerification';
import { classifySpreadsheet } from '@/lib/spreadsheetClassifier';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { ErrorResponses } from '@/lib/api/errorResponse';
import { getAllAliasesServer } from '@/lib/convexServer';
import { runFastPassWithFuzzy, buildAliasLookupMap } from '@/lib/fastPassCodification';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes max for extraction (can be slow for large files)

/**
 * API endpoint to run the full extraction pipeline on a file
 * Used by bulk upload when extraction is enabled
 * 
 * Pipeline:
 * 1. Extract text from file
 * 2. Convert to markdown (for spreadsheets)
 * 3. Classify spreadsheet type
 * 4. Run data extraction (LLM call)
 * 5. Normalize extracted data (LLM call)
 * 6. Verify extracted data (LLM call)
 * 7. Run Fast Pass codification preview
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const client = await getAuthenticatedConvexClient();
    try {
      await requireAuth(client);
    } catch (authError) {
      return ErrorResponses.unauthenticated();
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const forceExtraction = formData.get('forceExtraction') === 'true';

    if (!file) {
      return ErrorResponses.badRequest('No file provided');
    }

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return ErrorResponses.badRequest(validation.error || 'Invalid file');
    }

    // Check if file is a spreadsheet
    const fileNameLower = file.name.toLowerCase();
    const fileTypeLower = file.type.toLowerCase();
    const isSpreadsheet = 
      fileTypeLower.includes('spreadsheet') ||
      fileTypeLower.includes('excel') ||
      fileTypeLower.includes('csv') ||
      fileNameLower.endsWith('.xlsx') ||
      fileNameLower.endsWith('.xls') ||
      fileNameLower.endsWith('.csv');

    if (!isSpreadsheet && !forceExtraction) {
      return NextResponse.json({
        success: false,
        error: 'File is not a spreadsheet. Use forceExtraction=true to extract anyway.',
        extractedData: null,
      });
    }

    // Extract text from file
    let textContent: string;
    try {
      textContent = await extractTextFromFile(file);
      if (!textContent || textContent.trim().length === 0) {
        return ErrorResponses.badRequest('File appears to be empty or could not extract text');
      }
    } catch (error) {
      return ErrorResponses.badRequest(
        error instanceof Error ? error.message : 'Failed to extract text from file'
      );
    }

    // Convert spreadsheet to Markdown
    let markdownContent: string | null = null;
    if (isSpreadsheet) {
      try {
        markdownContent = await convertSpreadsheetToMarkdown(file);
      } catch (error) {
        console.error('[Bulk Extract] Error converting spreadsheet to Markdown (non-fatal):', error);
        markdownContent = null;
      }
    }

    // Classify the spreadsheet to determine extraction type
    let classification = null;
    if (isSpreadsheet) {
      classification = classifySpreadsheet(textContent, markdownContent, file.name);
      
      // If classification says no extraction needed and not forced, skip
      if (!classification.requiresExtraction && !forceExtraction) {
        return NextResponse.json({
          success: false,
          error: `File does not require extraction. Reason: ${classification.reason}`,
          classification,
          extractedData: null,
        });
      }
    }

    // Run the extraction pipeline
    let extractedData = null;
    let extractionError = null;

    try {
      // Use markdown content if available, otherwise fallback to textContent
      const contentForExtraction = markdownContent || textContent;
      
      console.log('[Bulk Extract] Starting extraction for:', file.name);
      
      // Step 1: Extract data from spreadsheet
      const extractionResult = await extractSpreadsheetData(contentForExtraction, file.name);
      
      if (!extractionResult.extractedData) {
        return NextResponse.json({
          success: false,
          error: 'Extraction returned no data',
          extractedData: null,
        });
      }

      console.log('[Bulk Extract] Initial extraction complete, normalizing...');
      
      // Step 2: Normalize the extracted data
      let normalizedData = extractionResult.extractedData;
      try {
        const contentForNormalization = markdownContent || textContent;
        normalizedData = await normalizeExtractedData(
          extractionResult.extractedData,
          contentForNormalization,
          file.name
        );
        console.log('[Bulk Extract] Normalization complete, verifying...');
      } catch (normalizationError) {
        console.error('[Bulk Extract] Normalization error (non-fatal):', normalizationError);
        // Continue with un-normalized data
      }

      // Step 3: Verify the normalized data
      try {
        const contentForVerification = markdownContent || textContent;
        extractedData = await verifyExtractedData(
          normalizedData,
          contentForVerification,
          file.name
        );
        console.log('[Bulk Extract] Verification complete');
      } catch (verificationError) {
        console.error('[Bulk Extract] Verification error (non-fatal):', verificationError);
        extractedData = normalizedData;
      }

    } catch (error) {
      console.error('[Bulk Extract] Extraction pipeline error:', error);
      extractionError = error instanceof Error ? error.message : 'Unknown extraction error';
      extractedData = {
        extractionNotes: 'Data extraction failed: ' + extractionError,
        confidence: 0.0,
        tokensUsed: 0,
      };
    }

    // Step 4: Run Fast Pass codification preview if we have costs data
    let codificationPreview = null;
    if (extractedData && extractedData.costs && extractedData.costs.length > 0) {
      try {
        console.log('[Bulk Extract] Running Fast Pass codification preview...');
        const aliases = await getAllAliasesServer();
        const aliasLookup = buildAliasLookupMap(aliases.map((a: any) => ({
          aliasNormalized: a.aliasNormalized,
          canonicalCode: a.canonicalCode,
          canonicalCodeId: a.canonicalCodeId,
          confidence: a.confidence,
          source: a.source,
        })));
        const fastPassResult = runFastPassWithFuzzy(extractedData, aliasLookup, 0.85);
        codificationPreview = {
          items: fastPassResult.items,
          stats: fastPassResult.stats,
          aliasesAvailable: aliases.length,
        };
        console.log('[Bulk Extract] Fast Pass complete:', fastPassResult.stats);
      } catch (fastPassError) {
        console.error('[Bulk Extract] Fast Pass error (non-fatal):', fastPassError);
      }
    }

    // Calculate extraction stats
    const stats = {
      costsCount: extractedData?.costs?.length || 0,
      hasCostsTotal: !!(extractedData?.costsTotal),
      hasUnits: !!(extractedData?.units),
      hasPlots: !!(extractedData?.plots?.length),
      hasRevenue: !!(extractedData?.revenue),
      confidence: extractedData?.confidence || 0,
      tokensUsed: extractedData?.tokensUsed || 0,
    };

    return NextResponse.json({
      success: true,
      extractedData,
      codificationPreview,
      classification,
      stats,
      fileName: file.name,
    });

  } catch (error) {
    console.error('[Bulk Extract] Unexpected error:', error);
    return ErrorResponses.internalError(
      error instanceof Error ? error.message : 'Failed to extract data from file'
    );
  }
}
