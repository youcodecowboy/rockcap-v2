"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";

// A single canon metric cell (matches KpiRow's cell) — droppable into any grid.
// The canon replacement for CompactMetricCard: thin value, mono uppercase label, 2px top accent.
export function StatTile({
  label,
  value,
  meta,
  accent,
  onClick,
}: {
  label: string;
  value: ReactNode;
  meta?: string;
  accent?: string;
  onClick?: () => void;
}) {
  const colors = useColors();
  return (
    <div
      onClick={onClick}
      style={{
        background: colors.bg.card,
        border: `1px solid ${colors.border.default}`,
        borderTop: `2px solid ${accent ?? colors.border.mid}`,
        borderRadius: 4,
        padding: "12px 14px",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: colors.text.muted,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 300, color: colors.text.primary, marginTop: 6 }}>{value}</div>
      {meta && <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>{meta}</div>}
    </div>
  );
}
