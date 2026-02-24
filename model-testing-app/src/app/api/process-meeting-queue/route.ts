import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { extractTextFromFile } from '@/lib/fileProcessor';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max for batch processing

// Meeting extraction types
const MEETING_TYPES = ['progress', 'kickoff', 'review', 'site_visit', 'call', 'other'] as const;
type MeetingType = typeof MEETING_TYPES[number];

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL not set');
  }
  return new ConvexHttpClient(convexUrl);
}

/**
 * Run meeting extraction using AI
 */
async function extractMeetingFromText(
  content: string,
  documentName: string
): Promise<{
  title: string;
  meetingDate: string;
  meetingType?: MeetingType;
  attendees: Array<{ name: string; role?: string; company?: string }>;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: Array<{
    id: string;
    description: string;
    assignee?: string;
    dueDate?: string;
    status: 'pending' | 'completed' | 'cancelled';
    createdAt: string;
  }>;
  confidence: number;
}> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const togetherApiKey = process.env.TOGETHER_API_KEY;
  const useOpenAI = !!openaiApiKey;

  if (!openaiApiKey && !togetherApiKey) {
    throw new Error('No API key configured');
  }

  const apiKey = useOpenAI ? openaiApiKey! : togetherApiKey!;
  const apiUrl = useOpenAI
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.together.xyz/v1/chat/completions';
  const model = useOpenAI ? 'gpt-4o' : 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

  const systemPrompt = `You are an expert meeting analysis agent for a real estate finance company.
Extract structured information from meeting transcripts, notes, or summaries.

EXTRACT:
1. TITLE: Clear, descriptive meeting title
2. DATE: Meeting date in ISO format (YYYY-MM-DD)
3. TYPE: One of: progress, kickoff, review, site_visit, call, other
4. ATTENDEES: People mentioned with roles and companies
5. SUMMARY: 2-3 sentence executive summary
6. KEY POINTS: Main discussion topics (3-7 bullets)
7. DECISIONS: Decisions made during the meeting
8. ACTION ITEMS: Tasks with assignee and due date if mentioned

For action items, generate unique IDs (action-1, action-2, etc).
For dates, use ISO format. If only relative dates, estimate from today.

Respond in valid JSON only.`;

  const userPrompt = `Extract meeting info from this document titled "${documentName}":

---
${content.substring(0, 20000)}
---

Today: ${new Date().toISOString().split('T')[0]}

Return JSON:
{
  "title": "string",
  "meetingDate": "YYYY-MM-DD",
  "meetingType": "progress|kickoff|review|site_visit|call|other",
  "attendees": [{"name": "string", "role": "optional", "company": "optional"}],
  "summary": "string",
  "keyPoints": ["string"],
  "decisions": ["string"],
  "actionItems": [{"id": "action-1", "description": "string", "assignee": "optional", "dueDate": "optional YYYY-MM-DD", "status": "pending", "createdAt": "${new Date().toISOString()}"}],
  "confidence": 0.0-1.0
}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
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
    throw new Error(`API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');

  // Ensure required fields and proper types
  return {
    title: parsed.title || documentName.replace(/\.[^.]+$/, ''),
    meetingDate: parsed.meetingDate || new Date().toISOString().split('T')[0],
    meetingType: MEETING_TYPES.includes(parsed.meetingType) ? parsed.meetingType : 'other',
    attendees: Array.isArray(parsed.attendees) ? parsed.attendees : [],
    summary: parsed.summary || 'No summary available',
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    actionItems: Array.isArray(parsed.actionItems)
      ? parsed.actionItems.map((item: any, i: number) => ({
          id: item.id || `action-${i + 1}`,
          description: item.description || '',
          assignee: item.assignee,
          dueDate: item.dueDate,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
        }))
      : [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
  };
}

/**
 * POST /api/process-meeting-queue
 *
 * Process pending meeting extraction jobs from the queue.
 * Each job:
 * 1. Fetches the file from Convex storage
 * 2. Extracts text from the file
 * 3. Runs meeting extraction AI
 * 4. Creates the meeting in database
 * 5. Updates the job status
 */
export async function POST(request: NextRequest) {
  const client = getConvexClient();

  try {
    const body = await request.json().catch(() => ({}));
    const limit = body.limit || 5;
    const jobId = body.jobId; // Process specific job if provided

    let jobs;
    if (jobId) {
      const job = await client.query(api.meetingExtractionJobs.get, {
        jobId: jobId as Id<"meetingExtractionJobs">
      });
      jobs = job ? [job] : [];
    } else {
      jobs = await client.query(api.meetingExtractionJobs.getPending, { limit });
    }

    if (jobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending meeting extraction jobs',
        processed: 0
      });
    }

    const results: {
      jobId: string;
      documentId: string;
      success: boolean;
      meetingId?: string;
      error?: string;
    }[] = [];

    for (const job of jobs) {
      try {
        console.log(`[Meeting Queue] Processing job ${job._id} for "${job.documentName}"`);

        // Mark as processing
        await client.mutation(api.meetingExtractionJobs.startProcessing, {
          jobId: job._id
        });

        // Fetch file from storage
        const storageUrl = await client.query(api.fileQueue.getFileUrl, {
          storageId: job.fileStorageId
        });

        if (!storageUrl) {
          throw new Error('Could not get file URL from storage');
        }

        // Download file
        const fileResponse = await fetch(storageUrl);
        if (!fileResponse.ok) {
          throw new Error(`Failed to download file: ${fileResponse.status}`);
        }

        const fileBuffer = await fileResponse.arrayBuffer();
        const fileBlob = new Blob([fileBuffer]);
        const file = new File([fileBlob], job.documentName);

        // Extract text from file
        // extractTextFromFile returns string directly or throws an error
        let textContent: string;
        try {
          textContent = await extractTextFromFile(file);
        } catch (extractError) {
          throw new Error(`Text extraction failed: ${extractError instanceof Error ? extractError.message : 'Unknown error'}`);
        }

        if (!textContent || textContent.trim().length < 50) {
          throw new Error('Extracted text is too short for meeting extraction');
        }

        // Run meeting extraction
        const extraction = await extractMeetingFromText(textContent, job.documentName);

        console.log(`[Meeting Queue] Extracted: ${extraction.attendees.length} attendees, ${extraction.actionItems.length} action items`);

        // Create meeting in database
        const meetingId = await client.mutation(api.meetings.create, {
          clientId: job.clientId,
          projectId: job.projectId,
          title: extraction.title,
          meetingDate: extraction.meetingDate,
          meetingType: extraction.meetingType,
          attendees: extraction.attendees,
          summary: extraction.summary,
          keyPoints: extraction.keyPoints,
          decisions: extraction.decisions,
          actionItems: extraction.actionItems,
          sourceDocumentId: job.documentId,
          sourceDocumentName: job.documentName,
          extractionConfidence: extraction.confidence,
        });

        // Mark job as completed
        await client.mutation(api.meetingExtractionJobs.complete, {
          jobId: job._id,
          meetingId
        });

        results.push({
          jobId: job._id,
          documentId: job.documentId,
          success: true,
          meetingId
        });

        console.log(`[Meeting Queue] ✅ Created meeting ${meetingId} for "${job.documentName}"`);

      } catch (error) {
        console.error(`[Meeting Queue] ❌ Error processing job ${job._id}:`, error);

        await client.mutation(api.meetingExtractionJobs.fail, {
          jobId: job._id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        results.push({
          jobId: job._id,
          documentId: job.documentId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} meeting extraction jobs (${successCount} success, ${failCount} failed)`,
      processed: results.length,
      results
    });

  } catch (error) {
    console.error('[Meeting Queue] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Queue processing failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/process-meeting-queue
 * Get pending meeting extraction job count
 */
export async function GET() {
  try {
    const client = getConvexClient();
    const jobs = await client.query(api.meetingExtractionJobs.getPending, { limit: 100 });

    return NextResponse.json({
      pendingCount: jobs.length,
      jobs: jobs.map(j => ({
        id: j._id,
        documentName: j.documentName,
        createdAt: j.createdAt,
        attempts: j.attempts
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get queue status' },
      { status: 500 }
    );
  }
}
