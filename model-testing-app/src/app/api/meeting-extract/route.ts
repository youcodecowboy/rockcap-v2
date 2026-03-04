import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthenticatedConvexClient } from '@/lib/auth';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { extractTextFromFile } from '@/lib/fileProcessor';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes for extraction

const MODEL = 'claude-haiku-4-5-20251001';

interface Attendee {
  name: string;
  role?: string;
  company?: string;
}

interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  dueDate?: string;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
}

interface MeetingExtractionResult {
  title: string;
  meetingDate: string;
  meetingType?: 'progress' | 'kickoff' | 'review' | 'site_visit' | 'call' | 'other';
  attendees: Attendee[];
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  confidence: number;
}

const SYSTEM_PROMPT = `You are an expert meeting analysis agent for a real estate finance company called RockCap.
Your task is to extract structured information from meeting transcripts, notes, summaries, or structured data exports (JSON from transcription services, etc.).

EXTRACTION TARGETS:
1. TITLE: Generate a clear, descriptive meeting title (e.g., "Progress Meeting - [Project Name]")
2. DATE: Extract the meeting date in ISO format (YYYY-MM-DD). If only relative ("last Tuesday"), estimate based on today.
3. MEETING TYPE: Classify as: progress, kickoff, review, site_visit, call, or other
4. ATTENDEES: Extract all people mentioned with their roles and companies if available
5. SUMMARY: Write a concise 2-4 sentence executive summary capturing the key outcomes and context
6. KEY POINTS: List the main discussion topics (3-7 bullet points). Each should be a complete, informative statement — not just a topic label.
7. DECISIONS: List any decisions that were made during the meeting. Be specific about what was decided and any conditions.
8. ACTION ITEMS: Extract ALL tasks, follow-ups, commitments, and next steps with assignee and due date if mentioned

ATTENDEE GUIDELINES:
- Include everyone mentioned as present or participating
- Extract role (e.g., "Project Manager", "Director", "Architect")
- Extract company if mentioned (e.g., "RockCap", "Smith Architects")

ACTION ITEM GUIDELINES:
- Each action item should be specific and actionable — avoid vague items like "follow up"
- Start descriptions with a verb (e.g., "Send updated cost schedule to lender", "Arrange site inspection")
- Include assignee name if mentioned (e.g., "John to send the report" → assignee: "John")
- Include due date if mentioned (use ISO format)
- Generate unique IDs for each action item (e.g., "action-1", "action-2")
- Capture implied actions too (e.g., "we need to get the valuation done" → action item)

LONG TRANSCRIPT HANDLING:
- For lengthy transcripts, synthesize the full discussion — don't just summarize the beginning
- Group related discussion points into coherent key points
- Capture action items from throughout the entire transcript, not just the end

STRUCTURED DATA (JSON) INPUT:
- If the input is structured JSON data (e.g., from Otter.ai, Fireflies, Teams), extract and reformat the data
- Map any existing fields to the output format
- Supplement with any additional insights from transcript text if available

CONFIDENCE SCORING:
- 0.9-1.0: Clear formal meeting notes with explicit structure
- 0.7-0.9: Informal notes but clear content
- 0.5-0.7: Partial or unclear notes, some inference needed
- Below 0.5: Very sparse content, significant inference

You MUST respond in valid JSON format only. No markdown, no explanation — just the JSON object.`;

/**
 * Meeting Extraction Agent — powered by Claude Haiku 4.5
 * Extracts structured meeting data from transcripts, notes, summaries, or JSON exports
 */
async function runMeetingExtraction(
  content: string,
): Promise<MeetingExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const client = new Anthropic({ apiKey });

  const userPrompt = `Extract meeting information from the following content:

---
${content.substring(0, 30000)}
---

Today's date for reference: ${new Date().toISOString().split('T')[0]}

Respond with a JSON object in this exact format:
{
  "title": "Clear meeting title",
  "meetingDate": "YYYY-MM-DD",
  "meetingType": "progress|kickoff|review|site_visit|call|other",
  "attendees": [
    {
      "name": "Person Name",
      "role": "Their Role (optional)",
      "company": "Their Company (optional)"
    }
  ],
  "summary": "2-4 sentence executive summary",
  "keyPoints": [
    "Key discussion point 1",
    "Key discussion point 2"
  ],
  "decisions": [
    "Decision that was made"
  ],
  "actionItems": [
    {
      "id": "action-1",
      "description": "What needs to be done",
      "assignee": "Person responsible (if known)",
      "dueDate": "YYYY-MM-DD (if mentioned)",
      "status": "pending",
      "createdAt": "${new Date().toISOString()}"
    }
  ],
  "confidence": 0.0-1.0
}`;

  console.log(`[Meeting Extraction] Using Claude Haiku 4.5`);

  // Retry with exponential backoff for transient errors (overloaded, rate limits)
  let response;
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0.1,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      });
      break;
    } catch (err: any) {
      const isRetryable = err?.status === 529 || err?.status === 429 || err?.error?.type === 'overloaded_error';
      if (isRetryable && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.log(`[Meeting Extraction] Retryable error (${err?.status || err?.error?.type}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  if (!response) {
    throw new Error('Meeting extraction failed after retries');
  }

  // Extract text from response
  const textContent = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Strip markdown code blocks if Claude wraps the response
  let cleaned = textContent.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  // Ensure required fields have defaults
  return {
    title: parsed.title || 'Untitled Meeting',
    meetingDate: parsed.meetingDate || new Date().toISOString().split('T')[0],
    meetingType: parsed.meetingType || 'other',
    attendees: (parsed.attendees || []).map((a: any) => ({
      name: a.name || 'Unknown',
      role: a.role || undefined,
      company: a.company || undefined,
    })),
    summary: parsed.summary || 'No summary available',
    keyPoints: parsed.keyPoints || [],
    decisions: parsed.decisions || [],
    actionItems: (parsed.actionItems || []).map((item: any, index: number) => ({
      id: item.id || `action-${index + 1}`,
      description: item.description || 'No description',
      assignee: item.assignee || undefined,
      dueDate: item.dueDate || undefined,
      status: item.status || 'pending',
      createdAt: item.createdAt || new Date().toISOString(),
    })),
    confidence: parsed.confidence || 0.7,
  };
}

/**
 * POST /api/meeting-extract
 * Extract meeting information from content
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let clientId: string | undefined;
    let projectId: string | undefined;
    let documentId: string | undefined;
    let documentName: string | undefined;
    let content: string = '';
    let saveToDatabase = false;

    // Handle JSON body
    if (contentType.includes('application/json')) {
      const body = await request.json();
      clientId = body.clientId;
      projectId = body.projectId;
      documentId = body.documentId;
      documentName = body.documentName;
      content = body.content || '';
      saveToDatabase = body.save === true;
    }
    // Handle FormData
    else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();

      clientId = formData.get('clientId') as string | null || undefined;
      projectId = formData.get('projectId') as string | null || undefined;
      documentId = formData.get('documentId') as string | null || undefined;
      documentName = formData.get('documentName') as string | null || undefined;
      const textInput = formData.get('content') as string | null;
      const file = formData.get('file') as File | null;
      saveToDatabase = formData.get('save') === 'true';

      if (textInput) {
        content = textInput;
      } else if (file) {
        content = await extractTextFromFile(file);
        documentName = documentName || file.name;
      }
    }

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    if (!clientId) {
      return NextResponse.json(
        { error: 'clientId is required' },
        { status: 400 }
      );
    }

    console.log(`[Meeting Extraction] Starting extraction for client ${clientId}`);

    // Run extraction
    const extraction = await runMeetingExtraction(content);

    console.log(`[Meeting Extraction] Extracted: ${extraction.attendees.length} attendees, ${extraction.actionItems.length} action items`);

    // If save is requested, save to database
    if (saveToDatabase) {
      const convex = await getAuthenticatedConvexClient();

      // Convex meetings.create has deeply nested types that trigger TS2589
      const createArgs: any = {
        clientId: clientId as Id<"clients">,
        projectId: projectId ? (projectId as Id<"projects">) : undefined,
        title: extraction.title,
        meetingDate: extraction.meetingDate,
        meetingType: extraction.meetingType,
        attendees: extraction.attendees,
        summary: extraction.summary,
        keyPoints: extraction.keyPoints,
        decisions: extraction.decisions,
        actionItems: extraction.actionItems,
        sourceDocumentId: documentId ? (documentId as Id<"documents">) : undefined,
        sourceDocumentName: documentName,
        extractionConfidence: extraction.confidence,
        verified: true,
      };
      const meetingId = await convex.mutation(api.meetings.create, createArgs);

      console.log(`[Meeting Extraction] Created meeting ${meetingId}`);

      return NextResponse.json({
        success: true,
        saved: true,
        meetingId,
        extraction,
      });
    }

    // Return extraction without saving (for preview)
    return NextResponse.json({
      success: true,
      saved: false,
      extraction,
    });

  } catch (error) {
    console.error('[Meeting Extraction] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extraction failed' },
      { status: 500 }
    );
  }
}
