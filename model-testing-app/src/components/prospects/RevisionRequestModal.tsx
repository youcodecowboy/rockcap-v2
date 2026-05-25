"use client";

import { useState } from "react";
import { useColors } from "@/lib/useColors";

interface RevisionRequestModalProps {
  onCancel: () => void;
  onSubmit: (note: string) => void;
}

export function RevisionRequestModal({ onCancel, onSubmit }: RevisionRequestModalProps) {
  const colors = useColors();
  const [note, setNote] = useState("");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <div style={{
        background: colors.bg.card, border: `1px solid ${colors.border.default}`,
        borderRadius: 4, padding: 20, width: 500, maxWidth: "90vw",
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 12px", color: colors.text.primary }}>Request revision</h2>
        <div style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
          Describe what should change. The skill will re-draft using your note as context.
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder='e.g., "Reword Touch 2 — too aggressive on rates" or "Tighten intel — irrelevant CH charge cited"'
          rows={6}
          style={{ width: "100%", padding: 10, border: `1px solid ${colors.border.default}`, borderRadius: 4, fontSize: 12, color: colors.text.primary, fontFamily: "system-ui, sans-serif", background: colors.bg.cardAlt, resize: "vertical" as const, marginBottom: 14, boxSizing: "border-box" as const }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={{ padding: "8px 14px", fontSize: 11, border: `1px solid ${colors.border.default}`, borderRadius: 4, background: colors.bg.card, color: colors.text.secondary, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onSubmit(note)} disabled={!note.trim()} style={{ padding: "8px 14px", fontSize: 11, border: `1px solid ${colors.accent.orange}`, borderRadius: 4, background: colors.accent.orange, color: "#ffffff", cursor: note.trim() ? "pointer" : "not-allowed", opacity: note.trim() ? 1 : 0.5 }}>Submit revision</button>
        </div>
      </div>
    </div>
  );
}
