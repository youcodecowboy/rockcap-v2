"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import type { Id } from "../../../convex/_generated/dataModel";

interface InlineDraftEditorProps {
  approvalId: Id<"approvals">;
  initialSubject: string;
  initialBodyText: string;
  initialBodyHtml?: string;
  to?: string;
  onDone?: () => void;
  onCancel?: () => void;
}

// Plain text is the source of truth. When the caller supplied no html we derive a
// simple <p>-wrapped body on save so the stored draftPayload keeps both shapes in
// sync; if they did pass html in we leave it untouched (it was authored upstream).
function deriveBodyHtml(bodyText: string): string {
  return bodyText
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export function InlineDraftEditor({
  approvalId,
  initialSubject,
  initialBodyText,
  initialBodyHtml,
  to,
  onDone,
  onCancel,
}: InlineDraftEditorProps) {
  const colors = useColors();
  const updateDraft = useMutation(api.approvals.updateDraft as any);
  const approve = useMutation(api.approvals.approve as any);

  const [subject, setSubject] = useState(initialSubject ?? "");
  const [bodyText, setBodyText] = useState(initialBodyText ?? "");
  const [busy, setBusy] = useState(false);

  const persist = async () => {
    const bodyHtml = initialBodyHtml ?? deriveBodyHtml(bodyText);
    await updateDraft({ approvalId, subject, bodyText, bodyHtml });
  };

  const handleSaveApprove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await persist();
      await approve({ approvalId });
      onDone?.();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDraft = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await persist();
      onDone?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: colors.bg.card,
      border: `1px solid ${colors.border.default}`,
      borderRadius: 4,
      padding: 16,
    }}>
      {to ? (
        <div style={{ fontSize: 10, color: colors.text.muted, marginBottom: 8, fontFamily: "ui-monospace, monospace" }}>
          To: {to}
        </div>
      ) : null}

      <label style={{ display: "block", fontSize: 10, color: colors.text.muted, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: 0.4 }}>
        Subject
      </label>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        style={{
          width: "100%", padding: "8px 10px", border: `1px solid ${colors.border.default}`,
          borderRadius: 4, fontSize: 12, color: colors.text.primary,
          fontFamily: "system-ui, sans-serif", background: colors.bg.cardAlt,
          marginBottom: 12, boxSizing: "border-box" as const,
        }}
      />

      <label style={{ display: "block", fontSize: 10, color: colors.text.muted, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: 0.4 }}>
        Body
      </label>
      <textarea
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value)}
        rows={12}
        style={{
          width: "100%", padding: 10, border: `1px solid ${colors.border.default}`,
          borderRadius: 4, fontSize: 12, lineHeight: 1.5, color: colors.text.primary,
          fontFamily: "system-ui, sans-serif", background: colors.bg.cardAlt,
          resize: "vertical" as const, marginBottom: 14, boxSizing: "border-box" as const,
        }}
      />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
        {onCancel ? (
          <button
            onClick={onCancel}
            disabled={busy}
            style={{ padding: "8px 14px", fontSize: 11, border: `1px solid ${colors.border.default}`, borderRadius: 4, background: colors.bg.card, color: colors.text.secondary, cursor: busy ? "not-allowed" : "pointer" }}
          >
            Cancel
          </button>
        ) : null}
        <button
          onClick={handleSaveDraft}
          disabled={busy}
          style={{ padding: "8px 14px", fontSize: 11, fontWeight: 500, border: `1px solid ${colors.border.default}`, borderRadius: 4, background: colors.bg.card, color: colors.text.secondary, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}
        >
          Save draft
        </button>
        <button
          onClick={handleSaveApprove}
          disabled={busy || !subject.trim() || !bodyText.trim()}
          style={{
            padding: "8px 14px", fontSize: 11, fontWeight: 500,
            border: `1px solid ${colors.accent.green}`, borderRadius: 4,
            background: colors.accent.green, color: "#ffffff",
            cursor: busy || !subject.trim() || !bodyText.trim() ? "not-allowed" : "pointer",
            opacity: busy || !subject.trim() || !bodyText.trim() ? 0.5 : 1,
          }}
        >
          Save &amp; approve →
        </button>
      </div>
    </div>
  );
}
