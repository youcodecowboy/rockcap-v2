import { v } from "convex/values";
import { query, mutation, action, internalMutation } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Meeting Extraction Jobs
 *
 * Manages async queue for extracting meeting summaries from documents
 * classified as "Meeting Minutes" or similar meeting-related types.
 */

const MEETING_TYPES = ['progress', 'kickoff', 'review', 'site_visit', 'call', 'other'] as const;
type MeetingType = typeof MEETING_TYPES[number];

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get pending meeting extraction jobs
 */
export const getPending = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    return await ctx.db
      .query("meetingExtractionJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(limit);
  },
});

/**
 * Get job by document ID
 */
export const getByDocument = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("meetingExtractionJobs")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
  },
});

/**
 * Get job by ID
 */
export const get = query({
  args: {
    jobId: v.id("meetingExtractionJobs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

/**
 * Get jobs by client
 */
export const getByClient = query({
  args: {
    clientId: v.id("clients"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    return await ctx.db
      .query("meetingExtractionJobs")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(limit);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new meeting extraction job and schedule processing
 */
export const create = mutation({
  args: {
    documentId: v.id("documents"),
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    fileStorageId: v.id("_storage"),
    documentName: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Check if job already exists for this document
    const existing = await ctx.db
      .query("meetingExtractionJobs")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();

    if (existing) {
      console.log(`[MeetingExtractionJob] Job already exists for document ${args.documentId}`);
      return existing._id;
    }

    const jobId = await ctx.db.insert("meetingExtractionJobs", {
      documentId: args.documentId,
      clientId: args.clientId,
      projectId: args.projectId,
      fileStorageId: args.fileStorageId,
      documentName: args.documentName,
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
    });

    // Note: Processing is triggered by /api/process-meeting-queue API route
    // The action-based processing doesn't handle PDFs properly (lacks pdf-parse)
    // Jobs are picked up when the API route runs (triggered by intelligence queue or cron)
    console.log(`[MeetingExtractionJob] Created job ${jobId} for "${args.documentName}" - pending queue processing`);
    return jobId;
  },
});

/**
 * Mark job as processing
 */
export const startProcessing = mutation({
  args: {
    jobId: v.id("meetingExtractionJobs"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const job = await ctx.db.get(args.jobId);

    if (!job) {
      throw new Error("Job not found");
    }

    await ctx.db.patch(args.jobId, {
      status: "processing",
      attempts: job.attempts + 1,
      lastAttemptAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Mark job as completed with meeting ID
 */
export const complete = mutation({
  args: {
    jobId: v.id("meetingExtractionJobs"),
    meetingId: v.id("meetings"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    await ctx.db.patch(args.jobId, {
      status: "completed",
      meetingId: args.meetingId,
      completedAt: now,
      updatedAt: now,
    });

    console.log(`[MeetingExtractionJob] Job ${args.jobId} completed with meeting ${args.meetingId}`);
  },
});

/**
 * Mark job as failed
 */
export const fail = mutation({
  args: {
    jobId: v.id("meetingExtractionJobs"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const job = await ctx.db.get(args.jobId);

    if (!job) {
      throw new Error("Job not found");
    }

    const maxAttempts = job.maxAttempts || 3;
    const shouldRetry = job.attempts < maxAttempts;

    await ctx.db.patch(args.jobId, {
      status: shouldRetry ? "pending" : "failed",
      error: args.error,
      updatedAt: now,
    });

    console.log(`[MeetingExtractionJob] Job ${args.jobId} failed: ${args.error}. Retry: ${shouldRetry}`);
  },
});

/**
 * Mark job as skipped (not a meeting document)
 */
export const skip = mutation({
  args: {
    jobId: v.id("meetingExtractionJobs"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    await ctx.db.patch(args.jobId, {
      status: "skipped",
      error: args.reason,
      updatedAt: now,
    });
  },
});

// ============================================================================
// INTERNAL MUTATIONS (for action to call)
// ============================================================================

export const internalStartProcessing = internalMutation({
  args: { jobId: v.id("meetingExtractionJobs") },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    await ctx.db.patch(args.jobId, {
      status: "processing",
      attempts: job.attempts + 1,
      lastAttemptAt: now,
      updatedAt: now,
    });
  },
});

export const internalComplete = internalMutation({
  args: {
    jobId: v.id("meetingExtractionJobs"),
    meetingId: v.id("meetings"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    await ctx.db.patch(args.jobId, {
      status: "completed",
      meetingId: args.meetingId,
      completedAt: now,
      updatedAt: now,
    });
    console.log(`[MeetingExtraction] ✅ Completed job ${args.jobId} -> meeting ${args.meetingId}`);
  },
});

export const internalFail = internalMutation({
  args: {
    jobId: v.id("meetingExtractionJobs"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    const maxAttempts = job.maxAttempts || 3;
    const shouldRetry = job.attempts < maxAttempts;

    await ctx.db.patch(args.jobId, {
      status: shouldRetry ? "pending" : "failed",
      error: args.error,
      updatedAt: now,
    });
    console.log(`[MeetingExtraction] ❌ Job ${args.jobId} failed: ${args.error}. Retry: ${shouldRetry}`);
  },
});

// ============================================================================
// ACTION: Process meeting extraction (can make HTTP calls)
// ============================================================================

/**
 * Process a single meeting extraction job
 * This action fetches the file, calls AI for extraction, and creates the meeting
 */
export const processJob = action({
  args: {
    jobId: v.id("meetingExtractionJobs"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; meetingId?: string; error?: string }> => {
    // Get job details
    const job = await ctx.runQuery(api.meetingExtractionJobs.get, { jobId: args.jobId });
    if (!job) {
      return { success: false, error: "Job not found" };
    }

    if (job.status !== "pending") {
      return { success: false, error: `Job is ${job.status}, not pending` };
    }

    // Mark as processing
    await ctx.runMutation(internal.meetingExtractionJobs.internalStartProcessing, { jobId: args.jobId });

    try {
      // Get file URL from storage
      const fileUrl = await ctx.storage.getUrl(job.fileStorageId);
      if (!fileUrl) {
        throw new Error("Could not get file URL from storage");
      }

      // Download file content
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download file: ${fileResponse.status}`);
      }

      // Get text content (for now, assume text-based files)
      const content = await fileResponse.text();
      if (!content || content.length < 50) {
        throw new Error("File content too short for meeting extraction");
      }

      // Run AI extraction
      const extraction = await extractMeetingWithAI(content, job.documentName);

      // Create meeting in database
      const meetingId = await ctx.runMutation(api.meetings.create, {
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
      await ctx.runMutation(internal.meetingExtractionJobs.internalComplete, {
        jobId: args.jobId,
        meetingId,
      });

      return { success: true, meetingId };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await ctx.runMutation(internal.meetingExtractionJobs.internalFail, {
        jobId: args.jobId,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  },
});

/**
 * AI extraction helper function
 */
async function extractMeetingWithAI(
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
    throw new Error("No API key configured (OPENAI_API_KEY or TOGETHER_API_KEY)");
  }

  const apiKey = useOpenAI ? openaiApiKey! : togetherApiKey!;
  const apiUrl = useOpenAI
    ? "https://api.openai.com/v1/chat/completions"
    : "https://api.together.xyz/v1/chat/completions";
  const model = useOpenAI ? "gpt-4o" : "meta-llama/Llama-3.3-70B-Instruct-Turbo";

  const systemPrompt = `You are an expert meeting analysis agent for a real estate finance company.
Extract structured information from meeting transcripts, notes, or summaries.

EXTRACT:
1. TITLE: Clear meeting title
2. DATE: ISO format (YYYY-MM-DD)
3. TYPE: One of: progress, kickoff, review, site_visit, call, other
4. ATTENDEES: People with roles and companies
5. SUMMARY: 2-3 sentence executive summary
6. KEY POINTS: Main discussion topics (3-7 bullets)
7. DECISIONS: Decisions made
8. ACTION ITEMS: Tasks with assignee and due date

Respond in valid JSON only.`;

  const userPrompt = `Extract meeting info from "${documentName}":

---
${content.substring(0, 15000)}
---

Today: ${new Date().toISOString().split("T")[0]}

Return JSON:
{
  "title": "string",
  "meetingDate": "YYYY-MM-DD",
  "meetingType": "progress|kickoff|review|site_visit|call|other",
  "attendees": [{"name": "string", "role": "optional", "company": "optional"}],
  "summary": "string",
  "keyPoints": ["string"],
  "decisions": ["string"],
  "actionItems": [{"id": "action-1", "description": "string", "assignee": "optional", "dueDate": "optional", "status": "pending", "createdAt": "${new Date().toISOString()}"}],
  "confidence": 0.0-1.0
}`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");

  return {
    title: parsed.title || documentName.replace(/\.[^.]+$/, ""),
    meetingDate: parsed.meetingDate || new Date().toISOString().split("T")[0],
    meetingType: MEETING_TYPES.includes(parsed.meetingType) ? parsed.meetingType : "other",
    attendees: Array.isArray(parsed.attendees) ? parsed.attendees : [],
    summary: parsed.summary || "No summary available",
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    actionItems: Array.isArray(parsed.actionItems)
      ? parsed.actionItems.map((item: any, i: number) => ({
          id: item.id || `action-${i + 1}`,
          description: item.description || "",
          assignee: item.assignee,
          dueDate: item.dueDate,
          status: "pending" as const,
          createdAt: new Date().toISOString(),
        }))
      : [],
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
  };
}
