"use client";

const PILL_BG: Record<string, { bg: string; fg: string; border: string }> = {
  drafted: { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  needs_revision: { bg: "#ffedd5", fg: "#9a3412", border: "#fdba74" },
  active: { bg: "#dbeafe", fg: "#1e40af", border: "#93c5fd" },
  replied: { bg: "#f3e8ff", fg: "#6b21a8", border: "#d8b4fe" },
  engaged: { bg: "#cffafe", fg: "#155e75", border: "#67e8f9" },
  promoted: { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  parked: { bg: "#f3f4f6", fg: "#6b6b6b", border: "#e0e0e0" },
  lost: { bg: "#f3f4f6", fg: "#6b6b6b", border: "#e0e0e0" },
  new: { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  running: { bg: "#dbeafe", fg: "#1e40af", border: "#93c5fd" },
  stuck: { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
};

export function StatePill({ state }: { state: string }) {
  const c = PILL_BG[state] ?? PILL_BG.drafted;
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
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
      }}
    >
      {state.replace(/_/g, " ")}
    </span>
  );
}
