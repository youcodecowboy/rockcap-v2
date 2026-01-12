import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile, validateFile, convertSpreadsheetToMarkdown } from '@/lib/fileProcessor';
import { analyzeFileContent } from '@/lib/togetherAI';
import { extractSpreadsheetData } from '@/lib/dataExtraction';
import { normalizeExtractedData } from '@/lib/dataNormalization';
import { verifyExtractedData } from '@/lib/dataVerification';
// Note: API route uses server-side Convex client for reading data
// Enrichment suggestions are created on client-side after document is saved
import { getClientsServer, getProjectsServer, getAllAliasesServer } from '@/lib/convexServer';
import { classifySpreadsheet } from '@/lib/spreadsheetClassifier';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { ErrorResponses } from '@/lib/api/errorResponse';
import { runFastPassWithFuzzy, buildAliasLookupMap } from '@/lib/fastPassCodification';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds max for file processing

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
    const customInstructions = formData.get('customInstructions') as string | null;
    const forceExtraction = formData.get('forceExtraction') === 'true';

    if (!file) {
      return ErrorResponses.badRequest('No file provided');
    }

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return ErrorResponses.badRequest(validation.error || 'Invalid file');
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

    // Convert spreadsheet to Markdown if it's a spreadsheet file
    let markdownContent: string | null = null;
    const fileNameLower = file.name.toLowerCase();
    const fileTypeLower = file.type.toLowerCase();
    const isSpreadsheet = 
      fileTypeLower.includes('spreadsheet') ||
      fileTypeLower.includes('excel') ||
      fileTypeLower.includes('csv') ||
      fileNameLower.endsWith('.xlsx') ||
      fileNameLower.endsWith('.xls') ||
      fileNameLower.endsWith('.csv');

    if (isSpreadsheet) {
      try {
        markdownContent = await convertSpreadsheetToMarkdown(file);
      } catch (error) {
        console.error('[API] Error converting spreadsheet to Markdown (non-fatal):', error);
        markdownContent = null;
      }
    }

    // Get clients with their projects from Convex
    let clientsWithProjects: Array<{ id: string; name: string; projects: Array<{ id: string; name: string }> }> = [];
    try {
      const clients = await getClientsServer();
      for (const client of clients) {
        const projects = await getProjectsServer(client._id as any);
        clientsWithProjects.push({
          id: client._id as any,
          name: client.name,
          projects: projects.map((p: any) => ({ id: p._id as any, name: p.name })),
        });
      }
    } catch (error) {
      console.error('[API] Error fetching clients from Convex:', error);
      // Fallback to empty array - analysis will still work
      clientsWithProjects = [];
    }

    // Analyze file with Together.ai
    try {
      const analysisResult = await analyzeFileContent(
        textContent,
        file.name,
        clientsWithProjects,
        customInstructions || null
      );

      // Find matching client ID if client name was detected
      let clientId: string | null = null;
      if (analysisResult.clientName) {
        const matchingClient = clientsWithProjects.find(
          c => c.name.toLowerCase() === analysisResult.clientName?.toLowerCase()
        );
        clientId = matchingClient?.id || null;
      }

      // Find matching project ID if project name was detected
      let projectId: string | null = null;
      if (analysisResult.projectName && clientId) {
        const clientProjects = clientsWithProjects.find(c => c.id === clientId)?.projects || [];
        const matchingProject = clientProjects.find(
          p => p.name.toLowerCase() === analysisResult.projectName?.toLowerCase()
        );
        projectId = matchingProject?.id || null;
      }

      // Check if file is a spreadsheet and classify whether it needs extraction
      let extractedData = null;
      const fileTypeLower = analysisResult.fileType.toLowerCase();
      const fileNameLower = file.name.toLowerCase();
      const isSpreadsheet = 
        fileTypeLower.includes('spreadsheet') ||
        fileTypeLower.includes('excel') ||
        fileTypeLower.includes('csv') ||
        fileNameLower.endsWith('.xlsx') ||
        fileNameLower.endsWith('.xls') ||
        fileNameLower.endsWith('.csv');

      // Determine if extraction should run
      let shouldRunExtraction = false;
      
      if (forceExtraction) {
        // User explicitly requested extraction - always run it
        shouldRunExtraction = true;
      } else if (isSpreadsheet) {
        // Classify the spreadsheet to determine if extraction is needed
        const classification = classifySpreadsheet(textContent, markdownContent, file.name);
        shouldRunExtraction = classification.requiresExtraction;
      }

      if (shouldRunExtraction) {
        try {
          // Use markdown content if available, otherwise fallback to textContent
          const contentForExtraction = markdownContent || textContent;
          const extractionResult = await extractSpreadsheetData(contentForExtraction, file.name);
          
          // Normalize the extracted data (third call)
          if (extractionResult.extractedData) {
            try {
              const contentForNormalization = markdownContent || textContent;
              const normalizedData = await normalizeExtractedData(
                extractionResult.extractedData,
                contentForNormalization,
                file.name
              );
              
              // Verify the normalized data (fourth call)
              try {
                const contentForVerification = markdownContent || textContent;
                const verifiedData = await verifyExtractedData(
                  normalizedData,
                  contentForVerification,
                  file.name
                );
                extractedData = verifiedData;
              } catch (verificationError) {
                console.error('[API] Error during verification (non-fatal):', verificationError);
                extractedData = normalizedData;
              }
            } catch (normalizationError) {
              console.error('[API] Error during normalization (non-fatal):', normalizationError);
              extractedData = extractionResult.extractedData;
            }
          } else {
            extractedData = extractionResult.extractedData;
          }
        } catch (error) {
          console.error('[API] Error during data extraction (non-fatal):', error);
          extractedData = {
            extractionNotes: 'Data extraction failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
            confidence: 0.0,
            tokensUsed: 0,
          };
        }
      }

      // Calculate total tokens used (analysis + extraction + normalization + verification)
      const totalTokensUsed = analysisResult.tokensUsed + (extractedData?.tokensUsed || 0);

      // Note: Enrichment suggestions are now created on the client-side after the document is saved
      // This allows us to link them to the actual document ID from Convex
      const enrichmentSuggestions = analysisResult.enrichmentSuggestions || [];

      // Run Fast Pass codification preview if we have extracted data
      let codificationPreview = null;
      if (extractedData && extractedData.costs && extractedData.costs.length > 0) {
        try {
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
        } catch (fastPassError) {
          console.error('[API] Error during Fast Pass preview (non-fatal):', fastPassError);
        }
      }

      // Return unified output format
      return NextResponse.json({
        summary: analysisResult.summary,
        fileType: analysisResult.fileType,
        clientId,
        clientName: analysisResult.clientName,
        suggestedClientName: analysisResult.suggestedClientName,
        projectId,
        projectName: analysisResult.projectName,
        suggestedProjectName: analysisResult.suggestedProjectName,
        category: analysisResult.category,
        reasoning: analysisResult.reasoning,
        confidence: analysisResult.confidence,
        tokensUsed: totalTokensUsed,
        extractedData,
        enrichmentSuggestions: enrichmentSuggestions.length > 0 ? enrichmentSuggestions : undefined,
        codificationPreview,
      });
    } catch (error) {
      console.error('Error analyzing file:', error);
      return ErrorResponses.internalError(
        error instanceof Error ? error : 'Failed to analyze file',
        error instanceof Error ? { stack: error.stack } : undefined
      );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return ErrorResponses.internalError('Internal server error');
  }
}

