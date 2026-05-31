"use client";

import { useEffect, type ReactNode } from "react";
import { useColors } from "@/lib/useColors";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Canon modal — replaces shadcn <Dialog>/<AlertDialog>. Hairline card on a
// dimmed backdrop, mono-uppercase title, footer action slot. Escape + backdrop
// click close. Keep the consuming feature's logic; this is chrome only.
export function Modal({
  open,
  onClose,
  title,
  footer,
  width = 480,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  footer?: ReactNode;
  width?: number;
  children: ReactNode;
}) {
  const colors = useColors();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width,
          maxWidth: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: colors.bg.card,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: `1px solid ${colors.border.default}`,
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.secondary, fontWeight: 500 }}>
            {title}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: "none", color: colors.text.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 16, overflowY: "auto" }}>{children}</div>
        {footer && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: `1px solid ${colors.border.default}` }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
