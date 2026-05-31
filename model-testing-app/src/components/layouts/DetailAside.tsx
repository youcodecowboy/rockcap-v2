"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: colors.text.muted,
          marginBottom: 6,
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export function Row({
  label,
  value,
  mono,
  pill,
  valueColor,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  pill?: string;
  valueColor?: string;
}) {
  const colors = useColors();
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        padding: "6px 0",
        fontSize: 11,
        borderBottom: `1px solid ${colors.border.light}`,
        alignItems: "baseline",
      }}
    >
      <span style={{ color: colors.text.muted, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: valueColor ?? colors.text.primary,
          maxWidth: 200,
          textAlign: "right",
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          fontSize: mono ? 10 : 11,
          wordBreak: mono ? "break-all" : "normal",
        }}
      >
        {pill ? (
          <span
            style={{
              display: "inline-block",
              padding: "2px 6px",
              borderRadius: 2,
              background: `${pill}20`,
              color: pill,
              border: `1px solid ${pill}40`,
              fontFamily: "ui-monospace, monospace",
              fontSize: 9,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            {value}
          </span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}
