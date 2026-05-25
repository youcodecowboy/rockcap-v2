"use client";

import { useState, type ReactNode } from "react";
import { useColors } from "@/lib/useColors";

interface StatusSectionProps {
  title: string;
  count: string | number;
  dotColor: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function StatusSection({ title, count, dotColor, defaultExpanded = false, children }: StatusSectionProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div
      style={{
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
        marginBottom: 14,
        background: colors.bg.card,
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: expanded ? `1px solid ${colors.border.default}` : "none",
          background: colors.bg.light,
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor }} />
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: colors.text.primary,
              fontWeight: 500,
            }}
          >
            {title}
          </span>
          <span style={{ color: colors.text.muted, fontSize: 11 }}>{count}</span>
        </div>
        <span style={{ color: colors.text.muted, fontSize: 11 }}>{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded && children}
    </div>
  );
}
