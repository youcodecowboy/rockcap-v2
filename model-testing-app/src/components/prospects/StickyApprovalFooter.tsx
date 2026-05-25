"use client";

import { useColors } from "@/lib/useColors";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

interface StickyApprovalFooterProps {
  prospect: any;
  positionInList: number;
  totalInList: number;
  stateLabel: string;
  onApprove: () => void;
  onDeny: () => void;
  onRequestRevision: () => void;
  onSkip: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function StickyApprovalFooter(props: StickyApprovalFooterProps) {
  const colors = useColors();
  const { prospect, positionInList, totalInList, stateLabel, onApprove, onDeny, onRequestRevision, onSkip, onPrev, onNext } = props;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); onNext(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPrev, onNext]);

  const state = prospect?.prospectState ?? "drafted";

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 80, right: 0,
      background: colors.bg.card, borderTop: `1px solid ${colors.border.default}`,
      padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
      zIndex: 20, boxShadow: "0 -2px 8px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={onPrev} title="Previous (←)" style={arrowBtnStyle(colors)}><ChevronLeft size={14} /></button>
        <button onClick={onNext} title="Next (→)" style={arrowBtnStyle(colors)}><ChevronRight size={14} /></button>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted, marginLeft: 8 }}>
          {positionInList} / {totalInList} {stateLabel}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {state === "drafted" ? (
          <>
            <button onClick={onSkip} style={btnStyle(colors, "secondary")}>Skip</button>
            <button onClick={onDeny} style={btnStyle(colors, "danger")}>Deny</button>
            <button onClick={onRequestRevision} style={btnStyle(colors, "warning")}>Request Revision</button>
            <button onClick={onApprove} style={btnStyle(colors, "primary")}>Approve &amp; Schedule →</button>
          </>
        ) : (
          <span style={{ color: colors.text.muted, fontSize: 11 }}>State: {state} — actions vary per state (v1.2.1)</span>
        )}
      </div>
    </div>
  );
}

function arrowBtnStyle(colors: any) {
  return { width: 28, height: 28, border: `1px solid ${colors.border.default}`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: colors.text.secondary, cursor: "pointer", background: colors.bg.card } as any;
}
function btnStyle(colors: any, kind: "primary" | "secondary" | "danger" | "warning") {
  const styles: any = {
    primary: { background: colors.accent.green, borderColor: colors.accent.green, color: "#ffffff" },
    secondary: { background: colors.bg.card, borderColor: colors.border.default, color: colors.text.secondary },
    danger: { background: colors.bg.card, borderColor: colors.accent.red, color: colors.accent.red },
    warning: { background: colors.bg.card, borderColor: colors.accent.orange, color: colors.accent.orange },
  };
  return { padding: "8px 14px", fontSize: 11, borderRadius: 4, cursor: "pointer", fontWeight: 500, border: "1px solid", ...styles[kind] };
}
