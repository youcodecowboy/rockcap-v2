"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { MessageSquare, Mail, Clock, ArrowRight, ExternalLink } from "lucide-react";

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
        <ReplyCard key={reply._id} reply={reply} colors={colors} />
      ))}
    </div>
  );
}

function ReplyCard({ reply, colors }: { reply: any; colors: any }) {
  const intent = INTENT_LABELS[reply.classifiedIntent] ?? INTENT_LABELS.unknown;
  const intentColor = intentPillColor(intent.color, colors);
  const dispatchLabel = reply.dispatchedTo ? DISPATCH_LABELS[reply.dispatchedTo] ?? reply.dispatchedTo : "Pending";
  const isManual = !!reply.ingestedManuallyByUserId;
  const cancelledCount = reply.cadencesCancelled?.length ?? 0;
  const confidencePct = reply.classifiedConfidence
    ? Math.round(reply.classifiedConfidence * 100)
    : null;

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

      {/* Body */}
      <div style={{ padding: 16 }}>
        {reply.replyBodyText ? (
          <div
            style={{
              fontSize: 13,
              color: colors.text.primary,
              lineHeight: 1.65,
              marginBottom: 14,
              whiteSpace: "pre-wrap" as const,
              fontFamily: "system-ui, sans-serif",
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
              marginBottom: 14,
              padding: "8px 12px",
              background: colors.bg.cardAlt,
              borderRadius: 3,
            }}
          >
            Body not captured (HubSpot-sweep path — open source via rawMessageRef below)
          </div>
        )}

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
