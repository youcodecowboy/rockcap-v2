# Prospecting v3.1 — action layer (prompt-launcher model)

Created: 2026-06-26
Status: queued
Branch: prospecting-v3
Tags: prospecting, actions, claude-harness, ux
Priority: high

## Core model (operator-confirmed 2026-06-26)
Claude Code is the execution harness. The app surfaces what needs doing; generative
work is launched as a copy/run PROMPT for Claude Code (not server-side API — cost).
Two lanes per action:
- IN-APP (mutation, 1-click, no LLM): approve cadence, dismiss flag, move stage,
  release hold, graduate, add/verify contact, cheap intel-revalidate.
- LAUNCHER (prompt → Claude Code): draft reply, book meeting/propose times, meeting
  prep, meeting capture (transcript→intel), refresh full intel, draft outreach cadence.

Cheap autonomous server-side STAYS: inbound reply classification + pre-drafted
cadence fires. Heavy generative work becomes launchers. /api/reply-draft realigned
to a launcher (drop the direct-API operator draft).

## Action matrix → see chat 2026-06-26 (13 core + 8 hidden edge actions).

## Phase 1 (build now)
- [x] src/lib/prospects/actionPrompts.ts — buildActionPrompt registry (6 launcher
      actions: draft_reply, book_meeting, meeting_prep, meeting_capture,
      refresh_intel, draft_outreach). Prompts carry IDs + skill + skillRun contract.
- [x] src/components/prospects/PromptLauncherModal.tsx — prompt box + Copy + what-it-does.
- [x] ActionQueue.tsx — launcher wired: flag→Draft a reply/Book the meeting;
      intel_attention→Refresh full intel (+ in-app Re-validate); intel→Refresh intel
      (was a dead label). In-app kinds unchanged. clientId/clientName threaded to rows.
- [x] Action-required tab: route /prospects/actions + StageNavBar "Action required"
      entry with totalActionItems badge (renders RequiresAttentionTable).
- [x] Reply realignment: replyEventProcessor book_meeting + info/positive STOP
      calling /api/meeting-prep-respond + /api/reply-draft; raise needs-action flags
      (reply_meeting_request / reply_received) → operator launches the draft in Claude.
      RepliesTab "Draft a reply" → launcher (dropped requestDraftForReply usage).
      DEAD now (cleanup later): /api/reply-draft route + requestDraftForReply action.
- [~] convex deploy exit 0; next build verifying.

## Phase 2 (later)
Surface the 8 hidden edge actions in the tab: cadence held-for-intel, contact opted
out, cadence blocked (no email), composer escalated, transcript-needs-review, intel
run failed (currently dead label), package-no-contacts, first-touch composed.
