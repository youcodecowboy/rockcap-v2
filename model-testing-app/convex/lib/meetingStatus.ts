// ─────────────────────────────────────────────────────────────────────────────
// Meeting STATUS — CANONICAL pure module (prospecting v3).
//
// Single source of truth for the meeting lifecycle taxonomy and the pure
// derivation/labelling helpers. Intentionally dependency-free (no React, no
// colors, no convex server imports) so BOTH the Convex backend and the Next.js
// client can import it natively. src/lib/prospects/meetingStatus.ts re-exports
// from here so `@/lib/prospects/meetingStatus` works on the client.
//
// status is an additive, optional field on the meetings table — rows that
// predate it (or carry an unknown value) are treated as 'scheduled'.
// ─────────────────────────────────────────────────────────────────────────────

export type MeetingStatus = "scheduled" | "completed" | "cancelled";

export const MEETING_STATUSES: MeetingStatus[] = [
  "scheduled",
  "completed",
  "cancelled",
];

/**
 * Resolve the effective status of a meeting row. An undefined or unrecognised
 * stored status falls back to 'scheduled'.
 */
export function effectiveMeetingStatus(m: { status?: string | null }): MeetingStatus {
  const s = m.status;
  if (s && (MEETING_STATUSES as string[]).includes(s)) {
    return s as MeetingStatus;
  }
  return "scheduled";
}

/**
 * Operator-facing labels for the completionSource that marked a meeting done.
 */
export const COMPLETION_SOURCE_LABELS: Record<string, string> = {
  transcript: "Transcript received",
  date_passed: "Date passed",
  manual: "Marked complete",
};
