import { NextRequest, NextResponse } from 'next/server';
import { extractProspectingContext } from '@/lib/togetherAI';
import { ProspectingContext, AnalysisResult } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentId, clientId, projectId, fileName, analysisResult, clientName, projectName, clientHistory, textContent } = body;

    if (!documentId || !analysisResult) {
      return NextResponse.json(
        { error: 'documentId and analysisResult are required' },
        { status: 400 }
      );
    }

    // Use the actual document text content if provided, otherwise fall back to summary/reasoning
    let contentForExtraction = '';
    if (textContent && textContent.length > 0) {
      // Use the full document content for better prospecting intelligence
      contentForExtraction = textContent;
    } else if (analysisResult) {
      // Fallback to summary and reasoning if text content not available
      contentForExtraction = `${analysisResult.summary}\n\n${analysisResult.reasoning}`;
      
      // If we have extracted data, include that context too
      if (analysisResult.extractedData) {
        contentForExtraction += `\n\nExtracted Data: ${JSON.stringify(analysisResult.extractedData, null, 2)}`;
      }
    } else {
      return NextResponse.json(
        { error: 'Analysis result or text content required' },
        { status: 400 }
      );
    }

    // Extract prospecting context
    try {
      const prospectingData = await extractProspectingContext(
        contentForExtraction,
        fileName || 'Unknown',
        clientName || null,
        projectName || null,
        clientHistory || ''
      );

      // Create prospecting context object
      const prospectingContext: ProspectingContext = {
        documentId,
        clientId: clientId || null,
        projectId: projectId || null,
        extractedAt: new Date().toISOString(),
        ...prospectingData,
      };

      // Save prospecting context (this will work client-side when called from browser)
      // Note: saveProspectingContext uses localStorage, so it needs to be called client-side
      // We'll return the context and let the client save it
      return NextResponse.json({
        success: true,
        prospectingContext,
      });
    } catch (error) {
      console.error('[API] Error extracting prospecting context:', error);
      return NextResponse.json(
        { 
          error: error instanceof Error ? error.message : 'Failed to extract prospecting context',
          details: error instanceof Error ? error.stack : undefined
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error processing prospecting context request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
