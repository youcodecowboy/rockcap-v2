import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { textFallbackChecksum } from "./chunker";
import { assembleRoster, callAtomizeRoute } from "./rosterAssembly";

// Meeting + inbound-email atomization (knowledge cutover Phase 2). Unlike
// documents and notes, these sources are IMMUTABLE once captured — a meeting
// row or reply event never changes content — so there is no same-lineage diff
// lane: candidates persist through createAtomsBatch with an externalRef
// anchor (`meeting:<id>` / `reply:<id>`), and idempotency is a belt-and-braces
// pair — the `atomizedAt` stamp on the source row skips re-runs, and
// findSameSourceObservation refreshes rather than duplicates if one slips
// through. Cost wall: §14b.1, knowledge-enabled clients only.

// ── Meetings ─────────────────────────────────────────────────────

export const meetingForAtomize = internalQuery({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, args) => {
    const m = await ctx.db.get(args.meetingId);
    if (!m) return null;
    const parts: string[] = [];
    if (m.summary?.trim()) parts.push(m.summary.trim());
    if (m.keyPoints?.length) {
      parts.push("Key points:\n" + m.keyPoints.map((k) => `- ${k}`).join("\n"));
    }
    if (m.decisions?.length) {
      parts.push("Decisions:\n" + m.decisions.map((d) => `- ${d}`).join("\n"));
    }
    if (m.attendees?.length) {
      parts.push(
        "Attendees: " +
          m.attendees
            .map((a) => [a.name, a.role, a.company].filter(Boolean).join(", "))
            .join(" | "),
      );
    }
    return {
      clientId: m.clientId,
      projectId: m.projectId ?? null,
      title: m.title,
      meetingDate: m.meetingDate,
      text: parts.join("\n\n"),
      atomizedAt: m.atomizedAt ?? null,
    };
  },
});

export const markMeetingAtomized = internalMutation({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.meetingId, {
      atomizedAt: new Date().toISOString(),
    });
  },
});

export const atomizeMeeting = internalAction({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, args) => {
    const meeting = await ctx.runQuery(
      internal.knowledge.sourceAtomizer.meetingForAtomize,
      { meetingId: args.meetingId },
    );
    if (!meeting) return { status: "skipped" as const, reason: "not_found" };
    if (meeting.atomizedAt) {
      return { status: "skipped" as const, reason: "already_atomized" };
    }
    if (!meeting.text.trim()) {
      return { status: "skipped" as const, reason: "no_text" };
    }
    const enabled = await ctx.runQuery(
      internal.knowledge.atomizerLane.clientHasAtoms,
      { clientId: meeting.clientId },
    );
    if (!enabled) {
      return { status: "skipped" as const, reason: "client_not_knowledge_enabled" };
    }

    const externalRef = `meeting:${args.meetingId}`;
    const roster = await assembleRoster(ctx, meeting.clientId);
    const candidates = await callAtomizeRoute({
      sourceRef: externalRef,
      contentChecksum: textFallbackChecksum(meeting.text),
      textContent: meeting.text,
      meta: {
        clientId: meeting.clientId,
        projectId: meeting.projectId,
        category: "Meeting",
        fileTypeDetected: "Meeting Summary",
        fileName: `${meeting.title} (${meeting.meetingDate.slice(0, 10)})`,
        roster,
      },
    });

    // Meetings sit at the internal-memo authority tier (2) regardless of what
    // the model stamped — the tier scale is document-type-calibrated.
    const stamped = candidates.map((c: any) => ({
      ...c,
      observation: {
        sourceType: "meeting" as const,
        externalRef,
        authorityTier: 2,
        ...(c.observation?.sourceText
          ? { sourceText: c.observation.sourceText }
          : {}),
      },
    }));

    const result: any =
      stamped.length > 0
        ? await ctx.runMutation(internal.knowledge.atomsCore.createAtomsBatch, {
            candidates: stamped,
          })
        : null;
    await ctx.runMutation(
      internal.knowledge.sourceAtomizer.markMeetingAtomized,
      { meetingId: args.meetingId },
    );
    console.log(
      `[knowledge-atomize-meeting] ${args.meetingId} ("${meeting.title}") → ` +
        `candidates=${stamped.length} created=${result?.created?.length ?? 0} ` +
        `rejected=${result?.rejected?.length ?? 0}`,
    );
    return { status: "ok" as const, candidates: stamped.length };
  },
});

// ── Inbound replies (email) ──────────────────────────────────────

export const replyForAtomize = internalQuery({
  args: { replyEventId: v.id("replyEvents") },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.replyEventId);
    if (!r) return null;
    const rr = r as any;
    const parts: string[] = [];
    if (rr.replySubject?.trim()) parts.push(`Subject: ${rr.replySubject.trim()}`);
    if (rr.replyBodyText?.trim()) parts.push(rr.replyBodyText.trim());
    return {
      // Denormalised client link stamped at ingest (see replyEvents schema).
      clientId: (rr.linkedClientId ?? null) as Id<"clients"> | null,
      text: parts.join("\n\n"),
      receivedAt: rr.receivedAt as string,
      atomizedAt: (rr.atomizedAt ?? null) as string | null,
    };
  },
});

export const markReplyAtomized = internalMutation({
  args: { replyEventId: v.id("replyEvents") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.replyEventId, {
      atomizedAt: new Date().toISOString(),
    });
  },
});

export const atomizeReply = internalAction({
  args: { replyEventId: v.id("replyEvents") },
  handler: async (ctx, args) => {
    const reply = await ctx.runQuery(
      internal.knowledge.sourceAtomizer.replyForAtomize,
      { replyEventId: args.replyEventId },
    );
    if (!reply) return { status: "skipped" as const, reason: "not_found" };
    if (reply.atomizedAt) {
      return { status: "skipped" as const, reason: "already_atomized" };
    }
    if (!reply.clientId) {
      return { status: "skipped" as const, reason: "no_client_scope" };
    }
    if (!reply.text.trim()) {
      return { status: "skipped" as const, reason: "no_text" };
    }
    const enabled = await ctx.runQuery(
      internal.knowledge.atomizerLane.clientHasAtoms,
      { clientId: reply.clientId },
    );
    if (!enabled) {
      return { status: "skipped" as const, reason: "client_not_knowledge_enabled" };
    }

    const externalRef = `reply:${args.replyEventId}`;
    const roster = await assembleRoster(ctx, reply.clientId);
    const candidates = await callAtomizeRoute({
      sourceRef: externalRef,
      contentChecksum: textFallbackChecksum(reply.text),
      textContent: reply.text,
      meta: {
        clientId: reply.clientId,
        category: "Email",
        fileTypeDetected: "Inbound Reply",
        fileName: `Inbound reply (${reply.receivedAt.slice(0, 10)})`,
        roster,
      },
    });

    // Emails are the lowest authority tier (1) on the document-type scale.
    const stamped = candidates.map((c: any) => ({
      ...c,
      observation: {
        sourceType: "email" as const,
        externalRef,
        authorityTier: 1,
        ...(c.observation?.sourceText
          ? { sourceText: c.observation.sourceText }
          : {}),
      },
    }));

    const result: any =
      stamped.length > 0
        ? await ctx.runMutation(internal.knowledge.atomsCore.createAtomsBatch, {
            candidates: stamped,
          })
        : null;
    await ctx.runMutation(internal.knowledge.sourceAtomizer.markReplyAtomized, {
      replyEventId: args.replyEventId,
    });
    console.log(
      `[knowledge-atomize-reply] ${args.replyEventId} → ` +
        `candidates=${stamped.length} created=${result?.created?.length ?? 0} ` +
        `rejected=${result?.rejected?.length ?? 0}`,
    );
    return { status: "ok" as const, candidates: stamped.length };
  },
});
