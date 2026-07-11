import { v } from "convex/values";
import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { tipTapDocToPlainText } from "../lib/markdownToTipTap";
import { textFallbackChecksum } from "./chunker";
import { assembleRoster, callAtomizeRoute } from "./rosterAssembly";

// Note-atomization lane (knowledge cutover 2026-07-11). Filed operator notes
// (client/project scope) are knowledge sources like documents: they ride the
// same Next atomizer route and persist via atomsCore.reatomizeNoteDiff — the
// noteId-anchored same-lineage diff, sourceType "note" — so editing a note
// supersedes the facts the edit removed instead of stacking duplicates.
//
// Trigger: notes.create/update (+ the agent-facing markdown mirrors) schedule
// atomizeNote NOTE_ATOMIZE_DEBOUNCE_MS out on every content change. Editor
// autosave can queue many runs; the (noteId, contentChecksum) observation
// probe makes every run after the first a cheap no-op, and the checksum is
// computed from the CURRENT text at fire time so the last edit always wins.
//
// Cost wall: same §14b.1 rule as the document API lane — only notes for
// knowledge-enabled clients (clientHasAtoms) atomize automatically.

export const NOTE_ATOMIZE_DEBOUNCE_MS = 5 * 60 * 1000;

/** Note scope + prose for the atomizer. Project-only notes inherit the
 * project's owning client (clientRoles — the borrower/developer role, not a
 * lender) so the cost wall and atom scope resolve. */
export const noteForAtomize = internalQuery({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) return null;
    const n = note as any;
    let clientId = (n.clientId ?? null) as Id<"clients"> | null;
    const projectId = (n.projectId ?? null) as Id<"projects"> | null;
    if (!clientId && projectId) {
      const project = await ctx.db.get(projectId);
      const roles = ((project as any)?.clientRoles ?? []) as Array<{
        clientId: Id<"clients">;
        role: string;
      }>;
      const owner =
        roles.find((r) => r.role.toLowerCase() !== "lender") ?? roles[0];
      clientId = owner?.clientId ?? null;
    }
    return {
      clientId,
      projectId,
      title: (n.title ?? "") as string,
      text: tipTapDocToPlainText(n.content),
    };
  },
});

/** True when this (note, checksum) already has provenance — the current
 * revision is handled and must not be re-atomized. */
export const hasNoteObservations = internalQuery({
  args: { noteId: v.id("notes"), contentChecksum: v.string() },
  handler: async (ctx, args) => {
    const obs = await ctx.db
      .query("atomObservations")
      .withIndex("by_note", (q) => q.eq("noteId", args.noteId))
      .collect();
    return obs.some((o) => o.contentChecksum === args.contentChecksum);
  },
});

export const atomizeNote = internalAction({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const note = await ctx.runQuery(
      internal.knowledge.noteAtomizer.noteForAtomize,
      { noteId: args.noteId },
    );
    if (!note) return { status: "skipped" as const, reason: "note_not_found" };
    if (!note.clientId) {
      return { status: "skipped" as const, reason: "unfiled" };
    }
    if (!note.text.trim()) {
      return { status: "skipped" as const, reason: "no_text" };
    }
    const contentChecksum = textFallbackChecksum(note.text);
    const already = await ctx.runQuery(
      internal.knowledge.noteAtomizer.hasNoteObservations,
      { noteId: args.noteId, contentChecksum },
    );
    if (already) {
      return { status: "skipped" as const, reason: "already_atomized" };
    }
    const enabled = await ctx.runQuery(
      internal.knowledge.atomizerLane.clientHasAtoms,
      { clientId: note.clientId },
    );
    if (!enabled) {
      return { status: "skipped" as const, reason: "client_not_knowledge_enabled" };
    }

    const roster = await assembleRoster(ctx, note.clientId);
    const candidates = await callAtomizeRoute({
      noteId: args.noteId,
      contentChecksum,
      textContent: note.text,
      meta: {
        clientId: note.clientId,
        projectId: note.projectId,
        category: "Note",
        fileTypeDetected: "Operator Note",
        fileName: note.title || "Untitled note",
        roster,
      },
    });
    const result: any = await ctx.runMutation(
      internal.knowledge.atomsCore.reatomizeNoteDiff,
      { noteId: args.noteId, contentChecksum, candidates },
    );
    console.log(
      `[knowledge-atomize-note] ${args.noteId} ("${note.title}") → ` +
        `candidates=${candidates.length} created=${result.created?.length ?? 0} ` +
        `kept=${result.kept?.length ?? 0} changed=${result.changed?.length ?? 0} ` +
        `rejected=${result.rejected?.length ?? 0}`,
    );
    return {
      status: "ok" as const,
      candidates: candidates.length,
      created: result.created?.length ?? 0,
    };
  },
});
