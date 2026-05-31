"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";

// Canon empty state — replaces every ad-hoc "No X yet" block.
// Centered icon + title + optional body + optional action slot.
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const colors = useColors();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 24px",
        border: `1px dashed ${colors.border.mid}`,
        borderRadius: 4,
        background: colors.bg.card,
      }}
    >
      {icon && <div style={{ color: colors.text.dim, marginBottom: 12 }}>{icon}</div>}
      <div style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{title}</div>
      {body && <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 4, maxWidth: 340 }}>{body}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
