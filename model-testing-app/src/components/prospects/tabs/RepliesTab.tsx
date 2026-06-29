"use client";

import { useQuery, useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { InlineDraftEditor } from "../InlineDraftEditor";
import { PromptLauncherModal } from "../PromptLauncherModal";
import { buildActionPrompt, type ActionPrompt } from "@/lib/prospects/actionPrompts";
import type { Id } from "../../../../convex/_generated/dataModel";
import { MessageSquare, Mail, Clock, ArrowRight, ExternalLink, Send, Pencil, X, ChevronRight, ChevronDown, Sparkles } from "lucide-react";

interface RepliesTabProps {
  prospect: any;
}

// v1.3 Replies tab. Renders all reply events linked to this prospect's
// clients row (via the denormalised linkedClientId column). Each reply
// shows: subject + body + classified intent pill + confidence + classifier
// evidence + dispatch destination + cancelled cadences count.
//
// Reply body is rendered as plain text (paragraphs split on blank lines).
// HTML wasn't persisted in v1.3 — only the plain-text body — by design,
// since the body's source-of-truth is the operator's inbox (Gmail or HubSpot
// activity). The CRM stores text for display + classifier input.

const INTENT_LABELS: Record<string, { label: string; color: "green" | "blue" | "yellow" | "orange" | "red" | "grey" }> = {
  book_meeting: { label: "Book meeting", color: "green" },
  defer_long_term: { label: "Defer (long-term)", color: "blue" },
  not_interested: { label: "Not interested", color: "red" },
  info_question: { label: "Info question", color: "yellow" },
  out_of_office: { label: "Out of office", color: "grey" },
  positive: { label: "Positive", color: "green" },
  unknown: { label: "Unknown", color: "orange" },
};

const DISPATCH_LABELS: Record<string, string> = {
  "meeting-prep": "→ meeting-prep skill",
  "long-term-monitor": "→ long-term monitor",
  "qualify-and-draft": "→ qualify-and-draft skill",
  opt_out_marker: "→ opt-out marker",
  operator_review: "Awaiting operator review",
  restored_cadences: "Restored cadences",
  no_contact_match: "No contact match (lost)",
  reply_drafted: "Drafted reply awaiting your accept",
  flag_only: "Flagged — your decision",
  unlinked_no_review: "Unlinked (no review)",
};

export function RepliesTab({ prospect }: RepliesTabProps) {
  const colors = useColors();
  const replies = useQuery(
    api.replyEvents.listByClient,
    prospect ? { clientId: prospect._id, limit: 50 } : "skip",
  ) ?? [];

  if (replies.length === 0) {
    return (
      <div
        style={{
          background: colors.bg.card,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
          padding: 24,
          color: colors.text.muted,
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Mail size={14} />
          <strong style={{ color: colors.text.primary }}>No replies yet</strong>
        </div>
        Replies arrive via Gmail Pub/Sub (when provisioned) or HubSpot activity sync.
        For testing or for replies received via WhatsApp/text/forwarded email, paste
        manually via Claude Code: <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, background: colors.bg.cardAlt, padding: "1px 5px", borderRadius: 3 }}>reply.ingestManual({"{"} contactEmail, subject, body {"}"})</code>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 14, fontSize: 11, color: colors.text.muted }}>
        Showing {replies.length} reply{replies.length === 1 ? "" : "s"} linked to this prospect.
        Each reply automatically cancels active cadences and the classifier dispatches to the next skill.
      </div>

      {replies.map((reply: any) => (
        <ReplyCard key={reply._id} reply={reply} colors={colors} prospectName={prospect?.name ?? prospect?.companyName ?? "this prospect"} />
      ))}
    </div>
  );
}

function ReplyCard({ reply, colors, prospectName }: { reply: any; colors: any; prospectName: string }) {
  const intent = INTENT_LABELS[reply.classifiedIntent] ?? INTENT_LABELS.unknown;
  const intentColor = intentPillColor(intent.color, colors);
  const dispatchLabel = reply.dispatchedTo ? DISPATCH_LABELS[reply.dispatchedTo] ?? reply.dispatchedTo : "Pending";
  const isManual = !!reply.ingestedManuallyByUserId;
  const cancelledCount = reply.cadencesCancelled?.length ?? 0;
  const confidencePct = reply.classifiedConfidence
    ? Math.round(reply.classifiedConfidence * 100)
    : null;

  // Reply lifecycle — the auto-staged email_reply approval is now actionable
  // inline: Accept & send / Edit (shared inline editor) / Reject, no detour to
  // /approvals. Drafts are auto-staged by replyEventProcessor, so the old "Run
  // qualify-and-draft in Claude Code" nag is gone.
  const linkedApprovals = useQuery(api.approvals.listByReplyEvent, {
    replyEventId: reply._id,
  }) ?? [];
  const pendingDraft = linkedApprovals.find(
    (a: any) =>
      a.status === "pending" &&
      a.entityType === "client_communication" &&
      a.draftPayload?.kind === "email_reply",
  );
  const handledApproval = linkedApprovals.find((a: any) => a.status !== "pending");

  const approve = useMutation(api.approvals.approve as any);
  const reject = useMutation(api.approvals.reject as any);
  const clearFlag = useMutation(api.clients.clearNeedsActionFlag as any);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Received email collapsed by default — verdict + drafted reply lead; the raw
  // inbound (often a long quoted thread) is one click away.
  const [showReceived, setShowReceived] = useState(false);
  // Drafting happens in Claude Code (the harness), not via the app's API — the
  // button opens a copy/run prompt rather than calling an LLM route.
  const [launch, setLaunch] = useState<ActionPrompt | null>(null);

  const launchDraft = () => {
    const wantsMeeting = reply.classifiedIntent === "book_meeting";
    setLaunch(
      buildActionPrompt(wantsMeeting ? "book_meeting" : "draft_reply", {
        clientId: String(reply.linkedClientId),
        clientName: prospectName,
        replyEventId: String(reply._id),
        note: reply.classifiedIntent,
      }),
    );
  };

  // Whether a reply can be drafted on demand (linked + not a terminal opt-out).
  const canDraft =
    !!reply.linkedClientId &&
    reply.classifiedIntent !== "not_interested" &&
    reply.classifiedIntent !== "out_of_office";

  const acceptSend = async () => {
    if (busy || !pendingDraft) return;
    setBusy(true);
    try {
      await approve({ approvalId: pendingDraft._id });
    } finally {
      setBusy(false);
    }
  };

  const rejectDraft = async () => {
    if (busy || !pendingDraft) return;
    setBusy(true);
    try {
      await reject({ approvalId: pendingDraft._id });
      if (reply.linkedClientId) {
        await clearFlag({
          clientId: reply.linkedClientId,
          kind: "reply_received",
          sourceReplyEventId: reply._id,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        border: `1px solid ${colors.border.default}`,
        borderLeft: `3px solid ${intentColor.fg}`,
        borderRadius: 4,
        marginBottom: 14,
        background: colors.bg.card,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${colors.border.default}`,
          background: colors.bg.light,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Mail size={13} color={colors.text.muted} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: colors.text.primary,
            }}
          >
            {reply.replySubject || <em style={{ color: colors.text.dim }}>(no subject)</em>}
          </span>
          {isManual && (
            <Pill bg={`${colors.accent.purple}15`} fg={colors.accent.purple} border={`${colors.accent.purple}40`}>
              manual paste
            </Pill>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted }}>
          <Clock size={10} />
          {reply.receivedAt?.slice(0, 16) ?? "—"}
        </div>
      </div>

      {/* Body — verdict leads; the raw received email is collapsed below it. */}
      <div style={{ padding: 16 }}>
        {/* Classification block */}
        <div
          style={{
            background: colors.bg.cardAlt,
            border: `1px solid ${colors.border.light}`,
            borderRadius: 4,
            padding: "10px 12px",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 9,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: colors.text.muted,
              }}
            >
              Classifier verdict
            </span>
            <Pill bg={intentColor.bg} fg={intentColor.fg} border={intentColor.border}>
              {intent.label}
            </Pill>
            {confidencePct !== null && (
              <span style={{ fontSize: 10, color: colors.text.muted, fontFamily: "ui-monospace, monospace" }}>
                {confidencePct}% confidence
              </span>
            )}
          </div>
          {reply.classifierEvidence && (
            <div style={{ fontSize: 11, color: colors.text.secondary, fontStyle: "italic", lineHeight: 1.5 }}>
              "{reply.classifierEvidence}"
            </div>
          )}
        </div>

        {/* Dispatch + cadence cancellation */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: colors.text.muted }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <ArrowRight size={11} />
            <span>Routed:</span>
            <strong style={{ color: colors.text.primary }}>{dispatchLabel}</strong>
          </div>
          {cancelledCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <MessageSquare size={11} />
              <span>
                Cancelled <strong style={{ color: colors.text.primary }}>{cancelledCount}</strong> queued cadence{cancelledCount === 1 ? "" : "s"}
              </span>
            </div>
          )}
          {reply.rawMessageRef && (
            <a
              href={reply.rawMessageRef.startsWith("http") ? reply.rawMessageRef : "#"}
              target={reply.rawMessageRef.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: colors.accent.blue,
                textDecoration: "underline",
                fontSize: 10,
              }}
            >
              <ExternalLink size={10} />
              Source
            </a>
          )}
        </div>

        {/* Received email — collapsed by default (verdict + reply lead). */}
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowReceived((s) => !s)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "transparent", border: "none", cursor: "pointer",
              padding: "4px 0", fontSize: 11, color: colors.text.secondary,
              fontFamily: "ui-monospace, monospace", letterSpacing: "0.04em",
            }}
          >
            {showReceived ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {showReceived ? "Hide received email" : "Show received email"}
          </button>
          {showReceived && (
            reply.replyBodyText ? (
              <div
                style={{
                  fontSize: 13,
                  color: colors.text.primary,
                  lineHeight: 1.65,
                  marginTop: 8,
                  padding: "10px 12px",
                  background: colors.bg.cardAlt,
                  borderRadius: 4,
                  border: `1px solid ${colors.border.light}`,
                  whiteSpace: "pre-wrap" as const,
                  fontFamily: "system-ui, sans-serif",
                  maxHeight: 320,
                  overflow: "auto",
                }}
              >
                {reply.replyBodyText}
              </div>
            ) : (
              <div
                style={{
                  fontSize: 11,
                  color: colors.text.muted,
                  fontStyle: "italic",
                  marginTop: 8,
                  padding: "8px 12px",
                  background: colors.bg.cardAlt,
                  borderRadius: 3,
                }}
              >
                Body not captured — this reply came via the HubSpot 6h sweep, not the
                Gmail inbox poller (so no body was available). Open it via the Source
                link above. Replies to mail sent from the connected Gmail account are
                captured in full.
              </div>
            )
          )}
        </div>

        {/* Reply lifecycle — inline drafted-reply actions */}
        {pendingDraft ? (
          editing ? (
            <div style={{ marginTop: 12 }}>
              <InlineDraftEditor
                approvalId={pendingDraft._id as Id<"approvals">}
                initialSubject={pendingDraft.draftPayload?.subject ?? ""}
                initialBodyText={pendingDraft.draftPayload?.bodyText ?? ""}
                initialBodyHtml={pendingDraft.draftPayload?.bodyHtml || undefined}
                onDone={() => setEditing(false)}
                onCancel={() => setEditing(false)}
              />
            </div>
          ) : (
            <div
              style={{
                marginTop: 12,
                border: `1px solid ${colors.accent.green}40`,
                borderRadius: 4,
                background: `${colors.accent.green}08`,
                padding: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Mail size={12} color={colors.accent.green} />
                <strong style={{ fontSize: 11, color: colors.text.primary }}>
                  Drafted reply awaiting your accept
                </strong>
                <span style={{ color: colors.text.muted, fontSize: 10 }}>
                  · {pendingDraft.requestSourceName ?? "reply-lifecycle"}
                </span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: colors.text.primary, marginBottom: 4 }}>
                {pendingDraft.draftPayload?.subject || "(no subject)"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: colors.text.secondary,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap" as const,
                  maxHeight: 160,
                  overflow: "auto",
                  marginBottom: 10,
                }}
              >
                {pendingDraft.draftPayload?.bodyText}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={acceptSend}
                  disabled={busy}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 12px", fontSize: 11, fontWeight: 500,
                    border: `1px solid ${colors.accent.green}`, borderRadius: 4,
                    background: colors.accent.green, color: "#fff",
                    cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1,
                  }}
                >
                  <Send size={11} /> Accept &amp; send
                </button>
                <button
                  onClick={() => setEditing(true)}
                  disabled={busy}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 12px", fontSize: 11,
                    border: `1px solid ${colors.border.default}`, borderRadius: 4,
                    background: colors.bg.card, color: colors.text.secondary,
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  <Pencil size={11} /> Edit
                </button>
                <button
                  onClick={rejectDraft}
                  disabled={busy}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 12px", fontSize: 11,
                    border: `1px solid ${colors.border.default}`, borderRadius: 4,
                    background: colors.bg.card, color: colors.text.muted,
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  <X size={11} /> Reject
                </button>
              </div>
            </div>
          )
        ) : handledApproval ? (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              background: `${colors.accent.green}10`,
              border: `1px solid ${colors.accent.green}40`,
              borderRadius: 4,
              fontSize: 11,
              color: colors.text.primary,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Mail size={12} color={colors.accent.green} />
            <strong>Draft {handledApproval.status}</strong>
            <span style={{ color: colors.text.muted, fontSize: 10 }}>
              · {handledApproval.requestSourceName ?? "reply-lifecycle"}
            </span>
          </div>
        ) : canDraft ? (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={launchDraft}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", fontSize: 11, fontWeight: 500,
                border: `1px solid ${colors.accent.blue}`, borderRadius: 4,
                background: `${colors.accent.blue}12`, color: colors.accent.blue,
                cursor: "pointer",
              }}
            >
              <Sparkles size={12} /> {reply.classifiedIntent === "book_meeting" ? "Book the meeting →" : "Draft a reply →"}
            </button>
          </div>
        ) : null}

        {launch && <PromptLauncherModal action={launch} onClose={() => setLaunch(null)} />}

        {/* Errors if any */}
        {reply.errors && reply.errors.length > 0 && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              background: "#fef2f2",
              border: `1px solid ${colors.accent.red}40`,
              borderRadius: 3,
              fontSize: 10,
              color: "#7f1d1d",
            }}
          >
            <strong>Processing errors:</strong>
            <ul style={{ margin: "4px 0 0 0", paddingLeft: 18 }}>
              {reply.errors.map((err: string, i: number) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function intentPillColor(color: string, colors: any): { bg: string; fg: string; border: string } {
  switch (color) {
    case "green":
      return { bg: "#dcfce7", fg: "#166534", border: "#86efac" };
    case "blue":
      return { bg: "#dbeafe", fg: "#1e40af", border: "#93c5fd" };
    case "yellow":
      return { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" };
    case "orange":
      return { bg: "#ffedd5", fg: "#9a3412", border: "#fdba74" };
    case "red":
      return { bg: "#fee2e2", fg: "#7f1d1d", border: "#fca5a5" };
    default:
      return { bg: colors.bg.cardAlt, fg: colors.text.muted, border: colors.border.default };
  }
}

function Pill({
  children,
  bg,
  fg,
  border,
}: {
  children: React.ReactNode;
  bg: string;
  fg: string;
  border: string;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        borderRadius: 2,
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        fontFamily: "ui-monospace, monospace",
        fontSize: 9,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}
