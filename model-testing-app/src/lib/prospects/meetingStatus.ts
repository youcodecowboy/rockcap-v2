// ─────────────────────────────────────────────────────────────────────────────
// Meeting STATUS — re-export shim (prospecting v3).
//
// The canonical definitions live in convex/lib/meetingStatus.ts (a pure,
// dependency-free module that BOTH the Convex backend and the Next.js client
// import natively). This file re-exports everything so client-side
// `@/lib/prospects/meetingStatus` imports resolve.
// ─────────────────────────────────────────────────────────────────────────────

export * from "../../../convex/lib/meetingStatus";
