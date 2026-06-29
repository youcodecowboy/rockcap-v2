"use client";

import { useQuery, useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { useRouter } from "next/navigation";
import { StatusSection } from "../StatusSection";
import { StatePill } from "../StatePill";
import { InlineDraftEditor } from "../InlineDraftEditor";
import { Mail, Send, Pencil, X, ExternalLink, AlertCircle } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";

// Reply lifecycle — "Replies awaiting your response" on /prospects.
// The operator's morning queue, now actionable in place. Two row groups from
// replyEvents.listActionableDrafts:
//   • drafts — auto-staged email_reply approvals (book_meeting / info_question /
//     positive). Accept & send / Edit (shared inline editor) / Reject inline.
//   • flags  — flag-only replies (not_interested / out_of_office). Dismiss /
//     open prospect. No send.

const INTENT_DISPLAY: Record<string, string> = {
  book_meeting: "book meeting",
  defer_long_term: "defer long-term",
  not_interested: "not interested",
  info_question: "info question",
  out_of_office: "out of office",
  positive: "positive",
  unknown: "unknown",
};

export function RepliesAwaitingTriageSection() {
  const colors = useColors();
  const data = useQuery(api.replyEvents.listActionableDrafts, { limit: 25 }) as
    | { drafts: any[]; flags: any[] }
    | undefined;
  const drafts = data?.drafts ?? [];
  const flags = data?.flags ?? [];
  const total = drafts.length + flags.length;

  return (
    <StatusSection
      title="Replies awaiting your response"
      count={`${total} to action`}
      dotColor={colors.entityTypes.contact}
      defaultExpanded={total > 0}
    >
      {total === 0 ? (
        <div
          style={{
            padding: "20px 14px",
            color: colors.text.muted,
            textAlign: "center",
            fontSize: 12,
          }}
        >
          <Mail size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
          Nothing waiting on you. Drafted replies and flagged inbounds land here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0" }}>
          {drafts.map((d) => (
            <DraftRow key={d.approvalId} draft={d} colors={colors} />
          ))}
          {flags.map((f) => (
            <FlagRow key={f.replyEventId} flag={f} colors={colors} />
          ))}
        </div>
      )}
    </StatusSection>
  );
}

function DraftRow({ draft, colors }: { draft: any; colors: any }) {
  const router = useRouter();
  const approve = useMutation(api.approvals.approve as any);
  const reject = useMutation(api.approvals.reject as any);
  const clearFlag = useMutation(api.clients.clearNeedsActionFlag as any);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleAccept = async () => {
    if (busy || draft.blocked) return;
    setBusy(true);
    try {
      await approve({ approvalId: draft.approvalId });
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await reject({ approvalId: draft.approvalId });
      if (draft.clientId) {
        await clearFlag({
          clientId: draft.clientId,
          kind: "reply_received",
          sourceReplyEventId: draft.replyEventId ?? undefined,
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
        borderLeft: `3px solid ${colors.accent.green}`,
        borderRadius: 4,
        background: colors.bg.card,
        padding: 12,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Mail size={13} color={colors.text.muted} />
          <strong style={{ fontSize: 13, color: colors.text.primary }}>
            {draft.clientName ?? "Unknown prospect"}
          </strong>
          <StatePill state={INTENT_DISPLAY[draft.intent] ?? draft.intent} />
          {draft.contactName && (
            <span style={{ fontSize: 11, color: colors.text.muted }}>
              {draft.contactName}
              {draft.contactEmail ? ` · ${draft.contactEmail}` : ""}
            </span>
          )}
        </div>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted }}>
          {draft.receivedAt?.slice(0, 16) ?? "—"}
        </span>
      </div>

      {/* Inbound snippet */}
      {(draft.inReplyToSubject || draft.inReplySnippet) && (
        <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: `2px solid ${colors.border.light}` }}>
          {draft.inReplyToSubject && (
            <div style={{ fontSize: 11, fontWeight: 500, color: colors.text.secondary }}>
              {draft.inReplyToSubject}
            </div>
          )}
          {draft.inReplySnippet && (
            <div style={{ fontSize: 11, color: colors.text.dim, lineHeight: 1.5 }}>
              {draft.inReplySnippet}…
            </div>
          )}
        </div>
      )}

      {/* Blocked banner */}
      {draft.blocked && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            background: "#fef2f2",
            border: `1px solid ${colors.accent.red}40`,
            borderRadius: 3,
            fontSize: 10,
            color: "#7f1d1d",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <AlertCircle size={11} />
          No sendable email on the contact — add one before sending.
        </div>
      )}

      {editing ? (
        <div style={{ marginTop: 10 }}>
          <InlineDraftEditor
            approvalId={draft.approvalId as Id<"approvals">}
            initialSubject={draft.draftSubject}
            initialBodyText={draft.draftBodyText}
            initialBodyHtml={draft.draftBodyHtml || undefined}
            to={draft.contactEmail || undefined}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          {/* Drafted reply preview */}
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              background: colors.bg.cardAlt,
              border: `1px solid ${colors.border.light}`,
              borderRadius: 4,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 500, color: colors.text.primary, marginBottom: 4 }}>
              {draft.draftSubject || "(no subject)"}
            </div>
            <div
              style={{
                fontSize: 11,
                color: colors.text.secondary,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap" as const,
                maxHeight: 140,
                overflow: "auto",
              }}
            >
              {draft.draftBodyText}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={handleAccept}
              disabled={busy || draft.blocked}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 12px", fontSize: 11, fontWeight: 500,
                border: `1px solid ${colors.accent.green}`, borderRadius: 4,
                background: colors.accent.green, color: "#fff",
                cursor: busy || draft.blocked ? "not-allowed" : "pointer",
                opacity: busy || draft.blocked ? 0.5 : 1,
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
              onClick={handleReject}
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
            {draft.clientId && (
              <button
                onClick={() => router.push(`/prospects/${draft.clientId}`)}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  marginLeft: "auto", padding: "6px 10px", fontSize: 10,
                  border: "none", background: "transparent",
                  color: colors.accent.blue, cursor: "pointer", textDecoration: "underline",
                }}
              >
                <ExternalLink size={10} /> Open prospect
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FlagRow({ flag, colors }: { flag: any; colors: any }) {
  const router = useRouter();
  const clearFlag = useMutation(api.clients.clearNeedsActionFlag as any);
  const [busy, setBusy] = useState(false);

  const handleDismiss = async () => {
    if (busy || !flag.clientId) return;
    setBusy(true);
    try {
      await clearFlag({
        clientId: flag.clientId,
        kind: flag.kind,
        sourceReplyEventId: flag.replyEventId,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        border: `1px solid ${colors.border.default}`,
        borderLeft: `3px solid ${colors.accent.yellow}`,
        borderRadius: 4,
        background: colors.bg.card,
        padding: 12,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <AlertCircle size={13} color={colors.accent.yellow} />
        <strong style={{ fontSize: 13, color: colors.text.primary }}>
          {flag.clientName ?? "Unknown prospect"}
        </strong>
        {flag.contactName && (
          <span style={{ fontSize: 11, color: colors.text.muted }}>{flag.contactName}</span>
        )}
        <span style={{ fontSize: 11, color: colors.text.secondary }}>{flag.reason}</span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted }}>
          {flag.receivedAt?.slice(0, 16) ?? "—"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={handleDismiss}
          disabled={busy || !flag.clientId}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 12px", fontSize: 11,
            border: `1px solid ${colors.border.default}`, borderRadius: 4,
            background: colors.bg.card, color: colors.text.secondary,
            cursor: busy || !flag.clientId ? "not-allowed" : "pointer",
          }}
        >
          <X size={11} /> Dismiss
        </button>
        {flag.clientId && (
          <button
            onClick={() => router.push(`/prospects/${flag.clientId}`)}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "6px 10px", fontSize: 10,
              border: "none", background: "transparent",
              color: colors.accent.blue, cursor: "pointer", textDecoration: "underline",
            }}
          >
            <ExternalLink size={10} /> Open prospect
          </button>
        )}
      </div>
    </div>
  );
}
