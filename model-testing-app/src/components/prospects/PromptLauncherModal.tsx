"use client";

import { useState } from "react";
import { useColors } from "@/lib/useColors";
import { X, Copy, Check, Terminal } from "lucide-react";
import type { ActionPrompt } from "@/lib/prospects/actionPrompts";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Prompt-launcher modal (prospecting v3.1). Renders a context-filled prompt the
// operator copies into Claude Code, which does the generative work via MCP tools.
// The app never calls the LLM API for these — Claude Code is the harness.
export function PromptLauncherModal({
  action,
  onClose,
}: {
  action: ActionPrompt;
  onClose: () => void;
}) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(action.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can fail in some contexts — leave the prompt selectable so the
      // operator can copy manually.
      setCopied(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.bg.card,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 8,
          width: "100%",
          maxWidth: 640,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "14px 16px",
            borderBottom: `1px solid ${colors.border.default}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Terminal size={15} color={colors.accent.blue} />
            <span style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary }}>
              {action.title}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: colors.text.muted, display: "flex" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* What it does */}
        <div style={{ padding: "12px 16px 0", fontSize: 12, color: colors.text.secondary, lineHeight: 1.5 }}>
          {action.what}
          <div style={{ marginTop: 6, fontSize: 11, color: colors.text.muted }}>
            Copy this prompt and run it in Claude Code — it does the work via MCP and stages the result for your approval. Nothing is sent automatically.
          </div>
        </div>

        {/* Prompt box */}
        <div style={{ padding: 16, overflow: "auto" }}>
          <pre
            style={{
              margin: 0,
              padding: 12,
              background: colors.bg.cardAlt,
              border: `1px solid ${colors.border.light}`,
              borderRadius: 6,
              fontFamily: MONO,
              fontSize: 12,
              lineHeight: 1.55,
              color: colors.text.primary,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {action.prompt}
          </pre>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px",
            borderTop: `1px solid ${colors.border.default}`,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "7px 14px",
              fontSize: 12,
              borderRadius: 6,
              border: `1px solid ${colors.border.default}`,
              background: colors.bg.card,
              color: colors.text.secondary,
              cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            onClick={copy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 6,
              border: "none",
              background: copied ? colors.accent.green : colors.accent.blue,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied — run it in Claude Code" : "Copy prompt"}
          </button>
        </div>
      </div>
    </div>
  );
}
