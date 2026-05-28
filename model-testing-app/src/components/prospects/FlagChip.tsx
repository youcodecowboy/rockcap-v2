// Shared presentational flag chip used across the prospect tabs (Prospects
// board rows + the detail Overview tab). Canonical styling: 2px 7px padding,
// lineHeight 1.4, monospace 9px, nowrap. severity drives the colour tone.
// No hooks, so no "use client" directive needed.

export function FlagChip({ label, severity, colors }: { label: string; severity: "ok" | "info" | "warn"; colors: any }) {
  const tone =
    severity === "warn"
      ? { bg: `${colors.accent.orange}15`, fg: colors.accent.orange, border: `${colors.accent.orange}40` }
      : severity === "info"
        ? { bg: `${colors.accent.blue}15`, fg: colors.accent.blue, border: `${colors.accent.blue}40` }
        : { bg: `${colors.accent.green}15`, fg: colors.accent.green, border: `${colors.accent.green}40` };
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
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
        whiteSpace: "nowrap" as const,
      }}
    >
      {label}
    </span>
  );
}
