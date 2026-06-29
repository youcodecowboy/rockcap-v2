// ─────────────────────────────────────────────────────────────────────────────
// Prospecting v3.1 — ACTION PROMPT REGISTRY (the prompt-launcher model).
//
// Claude Code is the execution harness. Generative actions in the UI do NOT call
// the LLM API; instead a button opens a modal with a precise, context-filled
// prompt the operator runs in Claude Code, which does the work via MCP tools and
// stages the result as an approval the operator then sends.
//
// This module is the single source of those prompts. Each builder fills entity
// IDs + names and tells Claude exactly which skill/tools to use and to follow the
// skillRun.start → … → skillRun.complete contract, staging output as an approval.
// Prompts intentionally reference IDs (replyEventId, meetingId, CH number) and
// instruct Claude to FETCH the specifics via MCP — so the UI action object stays
// lean (no full reply bodies / transcripts inlined).
//
// Pure + dependency-free so it can be imported anywhere (modal, action queue).
// ─────────────────────────────────────────────────────────────────────────────

export type LauncherActionKind =
  | "draft_reply"
  | "book_meeting"
  | "meeting_prep"
  | "meeting_capture"
  | "refresh_intel"
  | "draft_outreach";

export interface ActionPromptContext {
  clientId: string;
  clientName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  replyEventId?: string | null;
  meetingId?: string | null;
  meetingTitle?: string | null;
  companiesHouseNumber?: string | null;
  /** Free-form extra hint (e.g. the classifier intent, or operator note). */
  note?: string | null;
}

export interface ActionPrompt {
  kind: LauncherActionKind;
  /** Short button label, e.g. "Draft a reply". */
  label: string;
  /** Modal title. */
  title: string;
  /** One-line explanation shown under the title. */
  what: string;
  /** The copy/run prompt for Claude Code. */
  prompt: string;
}

// Shared tail every launcher prompt ends with — enforces the run contract + the
// "stage, don't send" trust gate from CLAUDE.md.
function runContract(skillName: string): string {
  return (
    `\n\nFollow the skill contract: call \`skillRun.start\` first (skillName: "${skillName}"), ` +
    `do the work, then \`skillRun.complete\` with a short brief + links. ` +
    `Stage anything that leaves the system (an email, a HubSpot write) as an \`approval\` ` +
    `for me to review and send — do not send autonomously.`
  );
}

function who(ctx: ActionPromptContext): string {
  const contact = ctx.contactName
    ? ` Primary contact: ${ctx.contactName}${ctx.contactEmail ? ` <${ctx.contactEmail}>` : ""}.`
    : "";
  return `Prospect: ${ctx.clientName} (clientId: ${ctx.clientId}).${contact}`;
}

const BUILDERS: Record<LauncherActionKind, (ctx: ActionPromptContext) => ActionPrompt> = {
  draft_reply: (ctx) => ({
    kind: "draft_reply",
    label: "Draft a reply",
    title: "Draft a reply in Claude Code",
    what: "Claude reads the inbound reply, drafts a response, and stages it for your review.",
    prompt:
      `${who(ctx)}\n` +
      `An inbound reply needs a response (replyEventId: ${ctx.replyEventId ?? "<look it up via reply.listByClient>"}).${ctx.note ? ` Classifier intent: ${ctx.note}.` : ""}\n\n` +
      `Read the inbound reply with \`reply.get\`, pull context with \`prospect.getDeepContext\`, ` +
      `then draft a concise, on-voice reply and stage it with \`outreach.draftReply\` ` +
      `(threaded to this reply via replyToReplyEventId).` +
      runContract("qualify-and-draft"),
  }),

  book_meeting: (ctx) => ({
    kind: "book_meeting",
    label: "Book the meeting",
    title: "Book a meeting in Claude Code",
    what: "Claude proposes times / books the meeting and drafts the confirmation for your review.",
    prompt:
      `${who(ctx)}\n` +
      `They want to meet (replyEventId: ${ctx.replyEventId ?? "<look it up via reply.listByClient>"}).\n\n` +
      `Read the reply with \`reply.get\` and context with \`prospect.getDeepContext\`. ` +
      `Propose suitable times (or create the meeting with \`meeting.create\` if a time is agreed) ` +
      `and draft the availability/confirmation reply with \`outreach.draftReply\`.` +
      runContract("meeting-prep"),
  }),

  meeting_prep: (ctx) => ({
    kind: "meeting_prep",
    label: "Run meeting prep",
    title: "Prepare for the meeting in Claude Code",
    what: "Claude builds a pre-meeting brief from the prospect's intel + history.",
    prompt:
      `${who(ctx)}\n` +
      `A meeting is booked (meetingId: ${ctx.meetingId ?? "<look it up via meeting.getByClient>"}${ctx.meetingTitle ? `, "${ctx.meetingTitle}"` : ""}).\n\n` +
      `Pull \`prospect.getDeepContext\` + \`meeting.get\`, then write a tight pre-meeting brief ` +
      `(who they are, live schemes, lender DNA, the angle, 3 questions to ask) and save it onto the meeting.` +
      runContract("meeting-prep"),
  }),

  meeting_capture: (ctx) => ({
    kind: "meeting_capture",
    label: "Capture meeting",
    title: "Capture the meeting in Claude Code",
    what: "Claude turns the Fireflies transcript into intel updates + next steps.",
    prompt:
      `${who(ctx)}\n` +
      `A meeting has taken place and a transcript is available (meetingId: ${ctx.meetingId ?? "<look it up via meeting.getByClient>"}).\n\n` +
      `Read the transcript + \`meeting.get\`, summarise outcomes/decisions/action items onto the meeting ` +
      `with \`meeting.update\`, and fold the material changes into intel ` +
      `(\`intelligence.appendContext\` / \`intelligence.addKnowledgeItem\`). Flag the next step for this prospect.` +
      runContract("meeting-capture"),
  }),

  refresh_intel: (ctx) => ({
    kind: "refresh_intel",
    label: "Refresh intel",
    title: "Refresh full intel in Claude Code",
    what: "Claude re-runs the full prospect-intel pass (the cheap re-validate is a separate 1-click).",
    prompt:
      `${who(ctx)}\n` +
      `Intel needs a full refresh${ctx.companiesHouseNumber ? ` (CH ${ctx.companiesHouseNumber})` : ""}.${ctx.note ? ` Reason: ${ctx.note}.` : ""}\n\n` +
      `Run the full prospect-intel workflow for this prospect (use its dedupKey = CH number). ` +
      `Refresh CH/charges, key people, track record and recommended approach; ` +
      `persist via \`clients.setProspectFacts\` + the intel skillRun, and clear the intel-attention flag when done.` +
      runContract("prospect-intel"),
  }),

  draft_outreach: (ctx) => ({
    kind: "draft_outreach",
    label: "Draft outreach",
    title: "Draft an outreach cadence in Claude Code",
    what: "Claude composes a multi-touch cadence package and stages it for one-click approval.",
    prompt:
      `${who(ctx)}\n` +
      `This prospect has intel but no outreach cadence yet — compose one.\n\n` +
      `Pull \`prospect.getDeepContext\`, then draft a 4-touch cold-outreach cadence package ` +
      `(per the cadence-package spec) with \`cadence.create\` (shared packageId, packageOrder, preDraftedTouch per touch). ` +
      `Leave the package at packageApprovalStatus "pending" so I can review and hit "Approve & begin outreach".` +
      runContract("outreach-draft"),
  }),
};

export function buildActionPrompt(
  kind: LauncherActionKind,
  ctx: ActionPromptContext,
): ActionPrompt {
  return BUILDERS[kind](ctx);
}

export function isLauncherKind(kind: string): kind is LauncherActionKind {
  return kind in BUILDERS;
}
