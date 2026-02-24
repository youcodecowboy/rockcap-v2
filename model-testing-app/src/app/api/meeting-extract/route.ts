import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedConvexClient } from '@/lib/auth';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { extractTextFromFile } from '@/lib/fileProcessor';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes for extraction

// OpenAI configuration
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o';

// Fallback to Together AI
const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const TOGETHER_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

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

/**
 * Meeting Extraction Agent
 * Extracts structured meeting data from transcripts, notes, or summaries
 */
async function runMeetingExtraction(
  content: string,
  apiKey: string,
  useOpenAI: boolean
): Promise<MeetingExtractionResult> {
  const systemPrompt = `You are an expert meeting analysis agent for a real estate finance company called RockCap.
Your task is to extract structured information from meeting transcripts, notes, or summaries.

EXTRACTION TARGETS:
1. TITLE: Generate a clear, descriptive meeting title (e.g., "Progress Meeting - [Project Name]")
2. DATE: Extract the meeting date in ISO format (YYYY-MM-DD). If only relative ("last Tuesday"), estimate based on today.
3. MEETING TYPE: Classify as: progress, kickoff, review, site_visit, call, or other
4. ATTENDEES: Extract all people mentioned with their roles and companies if available
5. SUMMARY: Write a 2-3 sentence executive summary of the meeting
6. KEY POINTS: List the main discussion topics (3-7 bullet points)
7. DECISIONS: List any decisions that were made during the meeting
8. ACTION ITEMS: Extract all tasks/follow-ups with assignee and due date if mentioned

ATTENDEE GUIDELINES:
- Include everyone mentioned as present or participating
- Extract role (e.g., "Project Manager", "Director", "Architect")
- Extract company if mentioned (e.g., "RockCap", "Smith Architects")

ACTION ITEM GUIDELINES:
- Each action item should be specific and actionable
- Include assignee name if mentioned (e.g., "John to send the report")
- Include due date if mentioned (use ISO format)
- Generate unique IDs for each action item (e.g., "action-1", "action-2")

CONFIDENCE SCORING:
- 0.9-1.0: Clear formal meeting notes with explicit structure
- 0.7-0.9: Informal notes but clear content
- 0.5-0.7: Partial or unclear notes, some inference needed
- Below 0.5: Very sparse content, significant inference

You MUST respond in valid JSON format only.`;

  const userPrompt = `Extract meeting information from the following content:

---
${content.substring(0, 20000)}
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
  "summary": "2-3 sentence executive summary",
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

  try {
    const apiUrl = useOpenAI ? OPENAI_API_URL : TOGETHER_API_URL;
    const model = useOpenAI ? OPENAI_MODEL : TOGETHER_MODEL;

    console.log(`[Meeting Extraction] Using ${useOpenAI ? 'OpenAI GPT-4o' : 'Together AI Llama'}`);

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
    const content = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    // Ensure required fields have defaults
    return {
      title: parsed.title || 'Untitled Meeting',
      meetingDate: parsed.meetingDate || new Date().toISOString().split('T')[0],
      meetingType: parsed.meetingType || 'other',
      attendees: parsed.attendees || [],
      summary: parsed.summary || 'No summary available',
      keyPoints: parsed.keyPoints || [],
      decisions: parsed.decisions || [],
      actionItems: (parsed.actionItems || []).map((item: any, index: number) => ({
        id: item.id || `action-${index + 1}`,
        description: item.description || 'No description',
        assignee: item.assignee,
        dueDate: item.dueDate,
        status: item.status || 'pending',
        createdAt: item.createdAt || new Date().toISOString(),
      })),
      confidence: parsed.confidence || 0.7,
    };
  } catch (error) {
    console.error('[Meeting Extraction] Error:', error);
    throw error;
  }
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
        // Use extractTextFromFile for proper PDF/DOCX parsing
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

    // Get API keys
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const togetherApiKey = process.env.TOGETHER_API_KEY;
    const useOpenAI = !!openaiApiKey;

    if (!openaiApiKey && !togetherApiKey) {
      return NextResponse.json(
        { error: 'No API key configured (OPENAI_API_KEY or TOGETHER_API_KEY)' },
        { status: 500 }
      );
    }

    const apiKey = useOpenAI ? openaiApiKey! : togetherApiKey!;

    console.log(`[Meeting Extraction] Starting extraction for client ${clientId}`);

    // Run extraction
    const extraction = await runMeetingExtraction(content, apiKey, useOpenAI);

    console.log(`[Meeting Extraction] Extracted: ${extraction.attendees.length} attendees, ${extraction.actionItems.length} action items`);

    // If save is requested, save to database
    if (saveToDatabase) {
      const convex = await getAuthenticatedConvexClient();

      const meetingId = await convex.mutation(api.meetings.create, {
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
      });

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
