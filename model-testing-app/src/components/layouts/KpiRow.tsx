"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";

export interface Kpi {
  label: string;
  value: ReactNode;
  meta?: string;
  accent?: string;
}

export function KpiRow({ items }: { items: Kpi[] }) {
  const colors = useColors();
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 1, background: colors.border.default }}>
      {items.map((k) => (
        <div key={k.label} style={{ background: colors.bg.card, padding: "12px 14px", borderTop: `2px solid ${k.accent ?? colors.border.mid}` }}>
          <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted }}>
            {k.label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 300, color: colors.text.primary, marginTop: 6 }}>{k.value}</div>
          {k.meta && <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>{k.meta}</div>}
        </div>
      ))}
    </div>
  );
}
