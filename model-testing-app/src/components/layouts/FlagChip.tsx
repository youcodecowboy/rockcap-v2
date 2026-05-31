"use client";

import { useColors } from "@/lib/useColors";

export type FlagSeverity = "ok" | "info" | "warn";

// Canon severity chip — the useColors()-based promotion of the prospects
// FlagChip (which takes `colors` as a prop). New code imports this one;
// prospects/FlagChip.tsx is left untouched (off-limits, different signature).
export function FlagChip({ label, severity }: { label: string; severity: FlagSeverity }) {
  const colors = useColors();
  const c =
    severity === "warn" ? colors.accent.orange : severity === "info" ? colors.accent.blue : colors.accent.green;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 7px",
        borderRadius: 2,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 9,
        lineHeight: 1.4,
        letterSpacing: "0.04em",
        background: `${c}15`,
        color: c,
        border: `1px solid ${c}40`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
