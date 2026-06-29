import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Fireflies sync action (BL-3.3 + BL-3.4).
// Runs on cron (fireflies-auto-sync every 30 minutes via crons.ts).
// Self-contained: the Fireflies GraphQL call lives here rather than
// in src/lib so the action does not need the bridge pattern back to
// Next.js.
//
// Flow:
//   autoSyncAll
//     ↳ checks the global kill switch
//     ↳ iterates every user with a healthy firefliesTokens row
//     ↳ calls syncForUser for each
//
//   syncForUser
//     ↳ pulls meetings since the user's lastSyncAt (or 365 days back on
//       first run, per confirmed decision)
//     ↳ for each meeting:
//         · attempt contact attribution by participant emails
//         · upsert meeting via internal mutation
//         · ingest transcript via internal mutation
//         · write a touchpoint
//     ↳ records sync run completion (success or error)
//
// All meeting writes are idempotent on firefliesId, so a re-run after
// a partial failure does not duplicate rows.

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

interface FirefliesTranscript {
  id: string;
  title?: string;
  date?: string;
  duration?: number;
  organizer_email?: string;
  participants?: string[];
  transcript_url?: string;
  summary?: {
    overview?: string;
    action_items?: string;
    keywords?: string[];
    bullet_gist?: string;
  };
  sentences?: Array<{
    speaker_name?: string;
    start_time?: number;
    end_time?: number;
    text?: string;
  }>;
}

async function firefliesGraphQL<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(FIREFLIES_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 401 || res.status === 403) {
    const err: any = new Error("Fireflies rejected the API token");
    err.code = "auth";
    throw err;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err: any = new Error(`Fireflies returned ${res.status}: ${text}`);
    err.code = "api";
    err.status = res.status;
    throw err;
  }

  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };

  if (json.errors && json.errors.length > 0) {
    const message = json.errors.map((e) => e.message).join("; ");
    const err: any = new Error(`Fireflies GraphQL: ${message}`);
    err.code = /auth|token|unauthorized|forbidden/i.test(message) ? "auth" : "api";
    throw err;
  }

  if (!json.data) {
    const err: any = new Error("Fireflies returned no data");
    err.code = "api";
    throw err;
  }

  return json.data;
}

// Pull transcripts in pages. Fireflies API supports skip/limit pagination
// on the `transcripts` query. We page through until we hit an empty page
// or until we have covered the requested window.
async function fetchTranscriptsSince(
  token: string,
  fromDate: Date,
): Promise<FirefliesTranscript[]> {
  const query = `
    query Transcripts($fromDate: DateTime, $limit: Int, $skip: Int) {
      transcripts(fromDate: $fromDate, limit: $limit, skip: $skip) {
        id
        title
        date
        duration
        organizer_email
        participants
        transcript_url
        summary {
          overview
          action_items
          keywords
          bullet_gist
        }
        sentences {
          speaker_name
          start_time
          end_time
          text
        }
      }
    }
  `;

  const allResults: FirefliesTranscript[] = [];
  const PAGE_SIZE = 25;
  const MAX_PAGES = 60; // ceiling: 60 * 25 = 1500 meetings per user per run
  let skip = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await firefliesGraphQL<{ transcripts: FirefliesTranscript[] }>(
      token,
      query,
      {
        fromDate: fromDate.toISOString(),
        limit: PAGE_SIZE,
        skip,
      },
    );
    if (!data.transcripts || data.transcripts.length === 0) break;
    allResults.push(...data.transcripts);
    if (data.transcripts.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return allResults;
}

function parseActionItemsString(raw?: string): Array<{
  id: string;
  description: string;
  assignee?: string;
  dueDate?: string;
}> {
  // Fireflies returns action_items as a newline-separated string in the
  // common case. Each line is a single action item. The format varies;
  // this is a best-effort parse that preserves the description and
  // leaves the structured fields empty.
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\s]+/, "").trim())
    .filter((line) => line.length > 0)
    .map((line, idx) => ({
      id: `fireflies-${idx}`,
      description: line,
    }));
}

function buildAttendees(emails: string[] | undefined, organizerEmail?: string): Array<{
  name: string;
  role?: string;
  company?: string;
}> {
  const seen = new Set<string>();
  const result: Array<{ name: string; role?: string; company?: string }> = [];
  const allEmails = [...(emails ?? [])];
  if (organizerEmail && !allEmails.includes(organizerEmail)) {
    allEmails.unshift(organizerEmail);
  }
  for (const email of allEmails) {
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    result.push({ name: email });
  }
  return result;
}

function buildSpeakerSegments(sentences?: FirefliesTranscript["sentences"]): Array<{
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
}> | undefined {
  if (!sentences || sentences.length === 0) return undefined;
  // Coalesce consecutive sentences from the same speaker into segments
  // to keep the stored payload compact. Fireflies returns timestamps in
  // seconds with millisecond precision; convert to integer milliseconds.
  const segments: Array<{ speaker: string; startMs: number; endMs: number; text: string }> = [];
  for (const s of sentences) {
    const speaker = s.speaker_name || "Unknown";
    const startMs = Math.round((s.start_time ?? 0) * 1000);
    const endMs = Math.round((s.end_time ?? s.start_time ?? 0) * 1000);
    const text = (s.text || "").trim();
    if (!text) continue;
    const last = segments[segments.length - 1];
    if (last && last.speaker === speaker && startMs - last.endMs < 2000) {
      last.endMs = endMs;
      last.text = `${last.text} ${text}`.trim();
    } else {
      segments.push({ speaker, startMs, endMs, text });
    }
  }
  return segments.length > 0 ? segments : undefined;
}

function fullTextFromSegments(
  segments?: Array<{ speaker: string; text: string }>,
): string | undefined {
  if (!segments || segments.length === 0) return undefined;
  return segments.map((s) => `${s.speaker}: ${s.text}`).join("\n");
}

// ── Single-user sync ─────────────────────────────────────────

export const syncForUser = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const tokenRow = await ctx.runQuery(internal.fireflies.getTokenForUser, {
      userId: args.userId,
    });
    if (!tokenRow) {
      return { skipped: true, reason: "no_token_or_needs_reconnect" } as const;
    }

    const config = await ctx.runQuery(internal.fireflies.getSyncConfigInternal, {});
    if (!config.isEnabled) {
      return { skipped: true, reason: "global_disabled" } as const;
    }

    // Determine the window: from lastSyncAt or default backfill days.
    const now = new Date();
    let fromDate: Date;
    if (tokenRow.lastSyncAt) {
      fromDate = new Date(tokenRow.lastSyncAt);
    } else {
      fromDate = new Date(now.getTime() - config.defaultBackfillDays * 86400 * 1000);
    }

    await ctx.runMutation(internal.fireflies.recordSyncRun, {
      userId: args.userId,
      status: "in_progress",
    });

    let transcripts: FirefliesTranscript[];
    try {
      transcripts = await fetchTranscriptsSince(tokenRow.apiToken, fromDate);
    } catch (err: any) {
      if (err.code === "auth") {
        await ctx.runMutation(internal.fireflies.flagNeedsReconnect, {
          userId: args.userId,
          error: err.message,
        });
        return { skipped: true, reason: "auth_failed" } as const;
      }
      await ctx.runMutation(internal.fireflies.recordSyncRun, {
        userId: args.userId,
        status: "error",
        error: err.message ?? String(err),
      });
      throw err;
    }

    let inserted = 0;
    let updated = 0;
    let attributionMisses = 0;

    for (const t of transcripts) {
      if (!t.id || !t.date) continue;

      const attendees = buildAttendees(t.participants, t.organizer_email);
      const meetingDate = new Date(t.date).toISOString();
      const durationMs = typeof t.duration === "number"
        ? Math.round(t.duration * 1000)
        : undefined;
      const summary = t.summary?.overview || t.summary?.bullet_gist || "";
      const keyPoints = t.summary?.keywords ?? [];
      const decisions: string[] = [];
      const actionItems = parseActionItemsString(t.summary?.action_items);

      // Attribution: resolve a clientId by participant-email match against
      // contacts (direct clientId, then linked-company → promoted client).
      // Prefer external participants; keep the meeting unattributed rather than
      // mis-attribute. When unresolved, clientId stays undefined and the upsert
      // mutation throws — caught below and counted as an attribution miss.
      const resolved = await ctx.runQuery(
        internal.fireflies.resolveClientByParticipantEmails,
        {
          emails: [
            ...(t.organizer_email ? [t.organizer_email] : []),
            ...(t.participants ?? []),
          ],
        },
      );
      try {
        const meetingId = await ctx.runMutation(internal.fireflies.upsertFirefliesMeeting, {
          firefliesId: t.id,
          title: t.title || "Untitled Fireflies meeting",
          meetingDate,
          durationMs,
          attendees,
          summary,
          keyPoints,
          decisions,
          actionItems,
          capturedByUserId: args.userId,
          // Resolved client (or undefined → upsert throws → attribution miss).
          clientId: resolved?.clientId,
        });

        const segments = buildSpeakerSegments(t.sentences);
        await ctx.runMutation(internal.fireflies.recordTranscript, {
          meetingId,
          speakerSegments: segments,
          fullTextSummary: fullTextFromSegments(segments) || summary || undefined,
          durationMs,
          capturedByUserId: args.userId,
        });

        inserted += 1;
      } catch (err: any) {
        if (/could not be attributed/i.test(err?.message ?? "")) {
          // Expected for now. Counted but does not abort the run.
          attributionMisses += 1;
          continue;
        }
        // Unexpected: rethrow so the run is marked error.
        await ctx.runMutation(internal.fireflies.recordSyncRun, {
          userId: args.userId,
          status: "error",
          error: err?.message ?? String(err),
        });
        throw err;
      }
    }

    await ctx.runMutation(internal.fireflies.recordSyncRun, {
      userId: args.userId,
      status: "success",
    });

    return {
      ok: true,
      seen: transcripts.length,
      inserted,
      updated,
      attributionMisses,
      fromDate: fromDate.toISOString(),
    } as const;
  },
});

// ── All-users sync (cron entry point) ────────────────────────

export const autoSyncAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.runQuery(internal.fireflies.getSyncConfigInternal, {});
    if (!config.isEnabled) {
      return { skipped: true, reason: "global_disabled" } as const;
    }

    const connectedUsers = await ctx.runQuery(
      internal.fireflies.listConnectedUserIds,
      {},
    );

    const results: Array<{ userId: string; result: any }> = [];
    for (const u of connectedUsers) {
      try {
        const result = await ctx.runAction(internal.firefliesSync.syncForUser, {
          userId: u.userId,
        });
        results.push({ userId: u.userId, result });
      } catch (err: any) {
        results.push({
          userId: u.userId,
          result: { error: err?.message ?? String(err) },
        });
      }
    }

    return { ok: true, ran: results.length, results } as const;
  },
});
