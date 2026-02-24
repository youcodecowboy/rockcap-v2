import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedConvexClient } from '@/lib/auth';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { extractTextFromFile } from '@/lib/fileProcessor';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max for batch processing

// Together AI configuration
const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
// Use serverless model (not the free tier which requires dedicated endpoint)
const TOGETHER_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

// Field definitions for project intelligence
const PROJECT_FIELDS = {
  'overview.projectType': 'Type of development project (e.g., "new-build", "refurbishment", "conversion")',
  'overview.assetClass': 'Asset class (e.g., "residential", "commercial", "mixed-use")',
  'overview.description': 'Brief description of the project',
  'location.siteAddress': 'Full site address',
  'location.postcode': 'Postcode of the site',
  'location.localAuthority': 'Local planning authority name',
  'location.region': 'Region (e.g., "London", "South East")',
  'financials.purchasePrice': 'Purchase price of the site in GBP',
  'financials.totalDevelopmentCost': 'Total development cost in GBP',
  'financials.grossDevelopmentValue': 'Gross Development Value (GDV) in GBP',
  'financials.profit': 'Expected profit in GBP',
  'financials.profitMargin': 'Profit margin as percentage',
  'financials.loanAmount': 'Loan amount in GBP',
  'financials.ltv': 'Loan-to-Value ratio as percentage',
  'financials.ltgdv': 'Loan-to-GDV ratio as percentage',
  'financials.interestRate': 'Interest rate as percentage (annual)',
  'timeline.acquisitionDate': 'Date of site acquisition (ISO format)',
  'timeline.planningSubmissionDate': 'Planning submission date (ISO format)',
  'timeline.planningApprovalDate': 'Planning approval date (ISO format)',
  'timeline.constructionStartDate': 'Construction start date (ISO format)',
  'timeline.practicalCompletionDate': 'Expected practical completion date (ISO format)',
  'timeline.loanMaturityDate': 'Loan maturity date (ISO format)',
  'development.totalUnits': 'Total number of units in the development',
  'development.totalSqFt': 'Total square footage of the development',
  'development.siteArea': 'Site area in acres or square meters',
  'development.planningReference': 'Planning application reference number',
  'development.planningStatus': 'Current planning status',
  'keyParties.solicitor.firm': 'Name of the solicitor firm',
  'keyParties.valuer.firm': 'Name of the valuation firm',
  'keyParties.architect.firm': 'Name of the architect firm',
  'keyParties.contractor.firm': 'Name of the contractor',
  'keyParties.monitoringSurveyor.firm': 'Name of the monitoring surveyor firm',
};

// Field definitions for client intelligence
const CLIENT_FIELDS = {
  'identity.legalName': 'Legal/registered name of the company',
  'identity.tradingName': 'Trading name if different from legal name',
  'identity.companyNumber': 'Companies House registration number',
  'identity.vatNumber': 'VAT registration number',
  'identity.incorporationDate': 'Date of incorporation (ISO format)',
  'primaryContact.name': 'Name of the primary contact person',
  'primaryContact.email': 'Email address of primary contact',
  'primaryContact.phone': 'Phone number of primary contact',
  'primaryContact.role': 'Role/title of primary contact',
  'addresses.registered': 'Registered office address',
  'addresses.trading': 'Trading/business address',
  'banking.bankName': 'Name of the bank',
  'banking.sortCode': 'Bank sort code',
  'banking.accountNumber': 'Bank account number',
  'borrowerProfile.experienceLevel': 'Developer experience level (e.g., "first-time", "experienced", "professional")',
  'borrowerProfile.completedProjects': 'Number of completed projects',
  'borrowerProfile.netWorth': 'Declared net worth in GBP',
  'borrowerProfile.liquidAssets': 'Liquid assets in GBP',
};

interface ExtractedField {
  fieldPath: string;
  value: any;
  confidence: number;
  sourceText?: string;
  pageNumber?: number;
}

interface ExtractedAttribute {
  key: string;
  value: any;
  confidence: number;
  sourceText?: string;
}

interface ExtractionResult {
  fields: ExtractedField[];
  attributes: ExtractedAttribute[];
  insights: {
    keyFindings?: string[];
    risks?: Array<{ risk: string; severity?: string }>;
  };
}

/**
 * Run intelligence extraction on document content
 */
async function runIntelligenceExtraction(
  documentContent: string,
  documentType: string,
  documentCategory: string,
  targetType: 'project' | 'client',
  togetherApiKey: string
): Promise<ExtractionResult> {
  const fields = targetType === 'project' ? PROJECT_FIELDS : CLIENT_FIELDS;

  const fieldDescriptions = Object.entries(fields)
    .map(([path, desc]) => `- ${path}: ${desc}`)
    .join('\n');

  const systemPrompt = `You are an expert intelligence extraction agent for a real estate finance platform.
Your task is to extract structured data from documents to populate a knowledge base.

IMPORTANT RULES:
1. Only extract data that is EXPLICITLY stated in the document - never infer or guess
2. Provide confidence scores (0.0 to 1.0) based on how clearly the data is stated
3. Include the exact source text that supports each extraction
4. For dates, use ISO format (YYYY-MM-DD)
5. For monetary values, convert to numbers in GBP (remove currency symbols, commas)
6. For percentages used as ratios (LTV, LTGDV, profit margin), store as decimals (e.g., 75% = 75)

CONFIDENCE GUIDELINES:
- 0.9-1.0: Clearly labeled data, exact match
- 0.7-0.9: Data clearly present but requires minor interpretation
- 0.5-0.7: Data can be inferred from context but not explicitly labeled
- Below 0.5: Don't extract

You MUST respond in valid JSON format only.`;

  const userPrompt = `Extract intelligence from this ${documentType} (Category: ${documentCategory}).

TARGET FIELDS TO EXTRACT (${targetType} intelligence):
${fieldDescriptions}

DOCUMENT CONTENT:
---
${documentContent.substring(0, 15000)}
---

Respond with a JSON object in this exact format:
{
  "fields": [
    {
      "fieldPath": "string - the field path from the list above",
      "value": "the extracted value",
      "confidence": 0.0-1.0,
      "sourceText": "exact quote from document"
    }
  ],
  "attributes": [
    {
      "key": "string - custom attribute name",
      "value": "the extracted value",
      "confidence": 0.0-1.0,
      "sourceText": "exact quote from document"
    }
  ],
  "insights": {
    "keyFindings": ["important finding 1", "important finding 2"],
    "risks": [
      {"risk": "description of risk", "severity": "low|medium|high"}
    ]
  }
}

Only include fields and attributes where you have confidence >= 0.5.`;

  const response = await fetch(TOGETHER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${togetherApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TOGETHER_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Together AI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);

  return {
    fields: (parsed.fields || []).filter((f: ExtractedField) => f.confidence >= 0.5),
    attributes: (parsed.attributes || []).filter((a: ExtractedAttribute) => a.confidence >= 0.5),
    insights: parsed.insights || {},
  };
}

/**
 * POST /api/process-intelligence-queue
 *
 * Process pending intelligence extraction jobs from the queue.
 * Each job:
 * 1. Fetches the document from Convex storage
 * 2. Extracts text content
 * 3. Runs intelligence extraction
 * 4. Merges into project/client intelligence
 * 5. Updates the job status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = body.limit || 5;
    const jobId = body.jobId;

    const togetherApiKey = process.env.TOGETHER_API_KEY;
    if (!togetherApiKey) {
      return NextResponse.json(
        { error: 'TOGETHER_API_KEY not configured' },
        { status: 500 }
      );
    }

    const client = await getAuthenticatedConvexClient();

    // Get pending jobs
    let jobs;
    if (jobId) {
      const allJobs = await client.query(api.intelligence.listIntelligenceExtractionJobs, {
        limit: 100,
      });
      jobs = allJobs.filter((j: any) => j._id === jobId);
    } else {
      jobs = await client.query(api.intelligence.listIntelligenceExtractionJobs, {
        status: 'pending',
        limit,
      });
    }

    console.log(`[Intelligence Queue] Found ${jobs.length} pending jobs`);

    if (jobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending jobs found. Ensure OPENAI_API_KEY is set for pre-extraction, or jobs are created during filing.',
        processed: 0,
      });
    }

    const results: {
      jobId: string;
      documentId: string;
      success: boolean;
      error?: string;
      fieldsExtracted?: number;
      attributesExtracted?: number;
    }[] = [];

    for (const job of jobs) {
      try {
        // Mark as processing
        await client.mutation(api.intelligence.updateIntelligenceJobStatus, {
          jobId: job._id,
          status: 'processing',
        });

        // Get the document to find the storage ID
        const document = await client.query(api.documents.get, {
          id: job.documentId,
        });

        if (!document || !document.fileStorageId) {
          throw new Error('Document or file storage not found');
        }

        // Get the file URL
        const storageUrl = await client.query(api.fileQueue.getFileUrl, {
          storageId: document.fileStorageId as Id<'_storage'>,
        });

        if (!storageUrl) {
          throw new Error('File URL not found');
        }

        // Download the file
        const fileResponse = await fetch(storageUrl);
        if (!fileResponse.ok) {
          throw new Error('Failed to download file from storage');
        }

        const blob = await fileResponse.blob();
        const file = new File([blob], job.documentName, {
          type: blob.type || 'application/octet-stream',
        });

        // Extract text content
        const textContent = await extractTextFromFile(file);
        if (!textContent || textContent.trim().length < 50) {
          // Skip if content too short
          await client.mutation(api.intelligence.updateIntelligenceJobStatus, {
            jobId: job._id,
            status: 'skipped',
            error: 'Content too short for meaningful extraction',
          });
          results.push({
            jobId: job._id,
            documentId: job.documentId,
            success: true,
            error: 'Skipped - content too short',
          });
          continue;
        }

        // Determine target type
        const targetType: 'project' | 'client' = job.projectId ? 'project' : 'client';

        console.log(`[Intelligence Queue] 📊 Processing job ${job._id} for "${job.documentName}" (${targetType})`);

        // Run extraction
        const extraction = await runIntelligenceExtraction(
          textContent,
          job.documentType || 'Document',
          job.documentCategory || 'Uncategorized',
          targetType,
          togetherApiKey
        );

        // Log detailed extraction results
        console.log(`[Intelligence Queue] Extracted from "${job.documentName}": ${extraction.fields.length} fields, ${extraction.attributes.length} attributes`);

        if (extraction.fields.length > 0) {
          const fieldSummary = extraction.fields.map(f =>
            `${f.fieldPath}: ${JSON.stringify(f.value).slice(0, 40)}${JSON.stringify(f.value).length > 40 ? '...' : ''}`
          ).join(' | ');
          console.log(`[Intelligence Queue]    Fields: ${fieldSummary}`);
        }

        if (extraction.attributes.length > 0) {
          const attrSummary = extraction.attributes.map(a =>
            `${a.key}: ${JSON.stringify(a.value).slice(0, 40)}${JSON.stringify(a.value).length > 40 ? '...' : ''}`
          ).join(' | ');
          console.log(`[Intelligence Queue]    Attributes: ${attrSummary}`);
        }

        if (extraction.insights?.keyFindings?.length) {
          console.log(`[Intelligence Queue]    Key findings: ${extraction.insights.keyFindings.slice(0, 3).join('; ')}`);
        }

        // Merge into intelligence
        const mergeResult = await client.mutation(api.intelligence.mergeExtractedIntelligence, {
          projectId: job.projectId,
          clientId: job.clientId,
          documentId: job.documentId,
          documentName: job.documentName,
          extractedFields: extraction.fields,
          extractedAttributes: extraction.attributes,
          aiInsights: extraction.insights,
        });

        // Log merge results
        console.log(`[Intelligence Queue] ✅ Merged for "${job.documentName}": ${mergeResult.fieldsAdded || 0} added, ${mergeResult.fieldsUpdated || 0} updated, ${mergeResult.fieldsSkipped || 0} skipped, ${mergeResult.attributesAdded || 0} attributes, ${mergeResult.insightsAdded || 0} insights`);

        // Update job as completed
        await client.mutation(api.intelligence.updateIntelligenceJobStatus, {
          jobId: job._id,
          status: 'completed',
          extractedFields: extraction.fields,
          extractedAttributes: extraction.attributes,
          aiInsights: extraction.insights,
          mergeResult,
        });

        results.push({
          jobId: job._id,
          documentId: job.documentId,
          success: true,
          fieldsExtracted: extraction.fields.length,
          attributesExtracted: extraction.attributes.length,
        });
      } catch (error) {
        console.error(`[Intelligence Queue] Error processing job ${job._id}:`, error);

        // Check if max attempts reached
        const maxAttempts = job.maxAttempts || 3;
        const newStatus = job.attempts + 1 >= maxAttempts ? 'failed' : 'pending';

        await client.mutation(api.intelligence.updateIntelligenceJobStatus, {
          jobId: job._id,
          status: newStatus,
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

    const successful = results.filter((r) => r.success && !r.error?.includes('Skipped')).length;
    const skipped = results.filter((r) => r.error?.includes('Skipped')).length;
    const failed = results.filter((r) => !r.success).length;

    // Also trigger meeting queue processing (shares the same documents)
    let meetingResults = { processed: 0, message: '' };
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const meetingResponse = await fetch(`${baseUrl}/api/process-meeting-queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5 }),
      });
      if (meetingResponse.ok) {
        meetingResults = await meetingResponse.json();
        console.log(`[Intelligence Queue] Also processed meeting queue: ${meetingResults.message}`);
      }
    } catch (meetingError) {
      console.log('[Intelligence Queue] Meeting queue processing skipped:', meetingError);
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} jobs: ${successful} successful, ${skipped} skipped, ${failed} failed`,
      processed: results.length,
      successful,
      skipped,
      failed,
      results,
      meetingQueue: meetingResults,
    });
  } catch (error) {
    console.error('[Intelligence Queue] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process intelligence queue',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/process-intelligence-queue
 *
 * Get queue stats and pending jobs
 */
export async function GET() {
  try {
    const client = await getAuthenticatedConvexClient();

    const pending = await client.query(api.intelligence.listIntelligenceExtractionJobs, {
      status: 'pending',
      limit: 50,
    });

    const processing = await client.query(api.intelligence.listIntelligenceExtractionJobs, {
      status: 'processing',
      limit: 10,
    });

    const completed = await client.query(api.intelligence.listIntelligenceExtractionJobs, {
      status: 'completed',
      limit: 20,
    });

    const failed = await client.query(api.intelligence.listIntelligenceExtractionJobs, {
      status: 'failed',
      limit: 20,
    });

    return NextResponse.json({
      success: true,
      stats: {
        pending: pending.length,
        processing: processing.length,
        completedRecent: completed.length,
        failedRecent: failed.length,
      },
      pendingJobs: pending.map((j: any) => ({
        id: j._id,
        documentId: j.documentId,
        documentName: j.documentName,
        documentType: j.documentType,
        projectId: j.projectId,
        clientId: j.clientId,
        status: j.status,
        attempts: j.attempts,
        createdAt: j.createdAt,
      })),
    });
  } catch (error) {
    console.error('[Intelligence Queue] Error getting stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get queue stats',
      },
      { status: 500 }
    );
  }
}
