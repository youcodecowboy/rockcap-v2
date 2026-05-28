"use client";

export function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        borderRadius: 2,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 9,
        lineHeight: 1.3,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        background: `${tone}20`,
        color: tone,
        border: `1px solid ${tone}40`,
      }}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}
