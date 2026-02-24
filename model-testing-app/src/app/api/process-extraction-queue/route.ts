import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { extractTextFromFile, convertSpreadsheetToMarkdown } from '@/lib/fileProcessor';
import { extractSpreadsheetData } from '@/lib/dataExtraction';
import { normalizeExtractedData } from '@/lib/dataNormalization';
import { verifyExtractedData } from '@/lib/dataVerification';
import { getAllAliasesServer } from '@/lib/convexServer';
import { runFastPassWithFuzzy, buildAliasLookupMap, CodifiedItem } from '@/lib/fastPassCodification';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max for batch processing

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL not set');
  }
  return new ConvexHttpClient(convexUrl);
}

/**
 * POST /api/process-extraction-queue
 * 
 * Process pending extraction jobs from the queue.
 * Each job:
 * 1. Fetches the file from Convex storage
 * 2. Runs the extraction pipeline
 * 3. Runs FastPass codification with the correct projectId
 * 4. Creates the codified extraction
 * 5. Updates the job status
 */
export async function POST(request: NextRequest) {
  const client = getConvexClient();
  
  try {
    const body = await request.json().catch(() => ({}));
    const limit = body.limit || 5; // Process up to 5 jobs at a time
    const jobId = body.jobId; // Optionally process a specific job
    
    let jobs;
    if (jobId) {
      // Process specific job
      const job = await client.query(api.extractionJobs.getByDocument, { 
        documentId: jobId as Id<"documents"> 
      });
      jobs = job ? [job] : [];
    } else {
      // Get pending jobs
      jobs = await client.query(api.extractionJobs.getPending, { limit });
    }
    
    if (jobs.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No pending jobs',
        processed: 0 
      });
    }
    
    const results: { 
      jobId: string; 
      documentId: string;
      success: boolean; 
      error?: string;
      itemsExtracted?: number;
    }[] = [];
    
    for (const job of jobs) {
      try {
        // Mark as processing
        await client.mutation(api.extractionJobs.startProcessing, { 
          jobId: job._id 
        });
        
        // Fetch file from storage
        const storageUrl = await client.query(api.fileQueue.getFileUrl, {
          storageId: job.fileStorageId
        });
        
        if (!storageUrl) {
          throw new Error('File not found in storage');
        }
        
        // Download the file
        const fileResponse = await fetch(storageUrl);
        if (!fileResponse.ok) {
          throw new Error('Failed to download file from storage');
        }
        
        const blob = await fileResponse.blob();
        const file = new File([blob], job.fileName, { 
          type: blob.type || 'application/octet-stream' 
        });
        
        // Extract text from file
        const textContent = await extractTextFromFile(file);
        if (!textContent || textContent.trim().length === 0) {
          throw new Error('File appears to be empty');
        }
        
        // Convert to markdown for spreadsheets
        let markdownContent: string | null = null;
        try {
          markdownContent = await convertSpreadsheetToMarkdown(file);
        } catch (err) {
          console.log('[ExtractionQueue] Markdown conversion failed (non-fatal)');
        }
        
        // Run extraction pipeline
        const contentForExtraction = markdownContent || textContent;
        const extractionResult = await extractSpreadsheetData(contentForExtraction, job.fileName);
        
        if (!extractionResult.extractedData) {
          throw new Error('Extraction returned no data');
        }
        
        // Normalize the data
        let normalizedData = extractionResult.extractedData;
        try {
          normalizedData = await normalizeExtractedData(
            extractionResult.extractedData,
            contentForExtraction,
            job.fileName
          );
        } catch (err) {
          console.log('[ExtractionQueue] Normalization failed (non-fatal)');
        }
        
        // Verify the data
        let extractedData = normalizedData;
        try {
          extractedData = await verifyExtractedData(
            normalizedData,
            contentForExtraction,
            job.fileName
          );
        } catch (err) {
          console.log('[ExtractionQueue] Verification failed (non-fatal)');
        }
        
        // Run FastPass codification if we have costs data
        let codifiedExtractionId: Id<"codifiedExtractions"> | undefined;
        
        if (extractedData && extractedData.costs && extractedData.costs.length > 0) {
          // Get aliases for FastPass
          const aliases = await getAllAliasesServer();
          const aliasLookup = buildAliasLookupMap(aliases.map((a: any) => ({
            aliasNormalized: a.aliasNormalized,
            canonicalCode: a.canonicalCode,
            canonicalCodeId: a.canonicalCodeId,
            confidence: a.confidence,
            source: a.source,
          })));
          
          // Run FastPass with fuzzy matching
          const fastPassResult = runFastPassWithFuzzy(extractedData, aliasLookup, 0.85);
          
          // Create codified extraction with the CORRECT projectId
          // This is the key fix - projectId is now guaranteed to be set
          const convexItems = fastPassResult.items.map((item: CodifiedItem) => ({
            ...item,
            suggestedCodeId: item.suggestedCodeId as Id<"extractedItemCodes"> | undefined,
          }));
          
          codifiedExtractionId = await client.mutation(api.codifiedExtractions.create, {
            documentId: job.documentId,
            projectId: job.projectId, // This is the key - projectId is correctly set!
            items: convexItems,
          });
          
          console.log(`[ExtractionQueue] Created codified extraction ${codifiedExtractionId} with projectId ${job.projectId}`);
        }
        
        // Mark job as completed
        await client.mutation(api.extractionJobs.complete, {
          jobId: job._id,
          extractedData,
          codifiedExtractionId,
        });
        
        results.push({
          jobId: job._id,
          documentId: job.documentId,
          success: true,
          itemsExtracted: extractedData?.costs?.length || 0,
        });
        
      } catch (error) {
        console.error(`[ExtractionQueue] Error processing job ${job._id}:`, error);
        
        // Mark job as failed
        await client.mutation(api.extractionJobs.fail, {
          jobId: job._id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        
        results.push({
          jobId: job._id,
          documentId: job.documentId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} jobs: ${successful} successful, ${failed} failed`,
      processed: results.length,
      successful,
      failed,
      results,
    });
    
  } catch (error) {
    console.error('[ExtractionQueue] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process extraction queue',
    }, { status: 500 });
  }
}

/**
 * GET /api/process-extraction-queue
 * 
 * Get queue stats and pending jobs
 */
export async function GET(request: NextRequest) {
  const client = getConvexClient();
  
  try {
    // @ts-ignore - Convex type instantiation is excessively deep
    const stats = await client.query(api.extractionJobs.getQueueStats, {});
    // @ts-ignore - Convex type instantiation is excessively deep
    const pendingJobs = await client.query(api.extractionJobs.getPending, { limit: 20 });
    
    return NextResponse.json({
      success: true,
      stats,
      pendingJobs: pendingJobs.map(j => ({
        id: j._id,
        documentId: j.documentId,
        projectId: j.projectId,
        fileName: j.fileName,
        status: j.status,
        attempts: j.attempts,
        createdAt: j.createdAt,
      })),
    });
    
  } catch (error) {
    console.error('[ExtractionQueue] Error getting stats:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get queue stats',
    }, { status: 500 });
  }
}
