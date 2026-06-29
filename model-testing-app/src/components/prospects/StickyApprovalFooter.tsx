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
  // Single-gate outreach (2026-06): approving the cadence package IS the
  // begin-outreach action — it writes Cold + fires Touch 1 server-side. The
  // old "mark outreach ready" accept gate is backfilled by the backend, so it
  // is no longer surfaced to the operator.
  //  - packageId: undefined when no cadence package exists yet → button disabled.
  //  - packageApprovalStatus: 'approved' → already begun → button disabled.
  //  - hasSendableContact: Touch 1's contact must have an email (mirrors the
  //    dispatcher + backend no-contact guard) → button disabled when false.
  //  - touchCount: rendered in the left-hand sequence summary.
  packageId?: string;
  packageApprovalStatus?: string;
  hasSendableContact?: boolean;
  touchCount?: number;
}

export function StickyApprovalFooter(props: StickyApprovalFooterProps) {
  const colors = useColors();
  const {
    positionInList,
    totalInList,
    stateLabel,
    onApprove,
    onDeny,
    onRequestRevision,
    onSkip,
    onPrev,
    onNext,
    packageId,
    packageApprovalStatus,
    hasSendableContact,
    touchCount,
  } = props;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); onNext(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPrev, onNext]);

  const alreadyApproved = packageApprovalStatus === "approved";
  const noPackage = !packageId;
  const noContact = !hasSendableContact;

  // First applicable reason wins. Each reason both disables the primary button
  // and explains (via title tooltip) the fix path.
  const disabledReason = noPackage
    ? "No cadence package yet — run prospect-intel to draft outreach first."
    : alreadyApproved
      ? "Outreach has already begun for this package."
      : noContact
        ? "Touch 1 has no sendable email — pick a recipient with an email on the Outreach tab."
        : null;
  const canApprove = !disabledReason;

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
        {!noPackage && (touchCount ?? 0) > 0 && (
          <span style={{ fontSize: 10, color: colors.text.muted, marginLeft: 12 }}>
            {touchCount} {touchCount === 1 ? "touch" : "touches"} · Touch 1 sends on approve
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {alreadyApproved ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 4, fontSize: 11, fontWeight: 500,
            color: colors.accent.green,
            background: `${colors.accent.green}14`,
            border: `1px solid ${colors.accent.green}40`,
          }}>
            Outreach begun ✓
          </span>
        ) : (
          <>
            <button onClick={onSkip} style={btnStyle(colors, "secondary")}>Skip</button>
            <button onClick={onDeny} style={btnStyle(colors, "danger")}>Deny</button>
            <button onClick={onRequestRevision} style={btnStyle(colors, "warning")}>Request Revision</button>
            <button
              onClick={canApprove ? onApprove : undefined}
              disabled={!canApprove}
              title={disabledReason ?? "Approve the package, write Cold, and send Touch 1 now"}
              style={{
                ...btnStyle(colors, "primary"),
                opacity: canApprove ? 1 : 0.5,
                cursor: canApprove ? "pointer" : "not-allowed",
              }}
            >
              Approve &amp; begin outreach →
            </button>
          </>
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
