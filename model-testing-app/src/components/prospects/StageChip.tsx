"use client";

import type { CSSProperties, ReactNode } from "react";
import { stageFor, type PipelineStage } from "@/lib/prospects/stages";
import { useColors } from "@/lib/useColors";

type Size = "sm" | "md";

const SIZE: Record<Size, { padding: string; fontSize: number }> = {
  sm: { padding: "2px 6px", fontSize: 9 },
  md: { padding: "3px 8px", fontSize: 11 },
};

function chipBase(size: Size): CSSProperties {
  const s = SIZE[size];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: s.padding,
    borderRadius: 2,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: s.fontSize,
    lineHeight: 1.3,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

/**
 * Read-only pipeline-stage badge. Replaces StatePill on prospect detail
 * surfaces — the v3 pipelineStage axis, not the legacy prospectState.
 *
 * Renders the stage's short label tinted with its accentKey (resolved via
 * useColors().accent[...]). A null stage renders a muted "Off-pipeline" chip.
 * The optional `children` slot trails the stage label for status chips.
 */
export function StageChip({
  stage,
  size = "sm",
  children,
}: {
  stage: PipelineStage | null;
  size?: Size;
  children?: ReactNode;
}) {
  const colors = useColors();
  const def = stageFor(stage);

  if (!def) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            ...chipBase(size),
            background: colors.bg.cardAlt,
            color: colors.text.muted,
            border: `1px solid ${colors.border.default}`,
          }}
        >
          Off-pipeline
        </span>
        {children}
      </span>
    );
  }

  const accent = colors.accent[def.accentKey];

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          ...chipBase(size),
          // Faint accent wash via 8-digit hex alpha; accent border + text.
          background: `${accent}1a`,
          color: accent,
          border: `1px solid ${accent}59`,
        }}
        title={def.description}
      >
        {def.shortLabel}
      </span>
      {children}
    </span>
  );
}

/**
 * Small layout helper for the trailing status-chips slot of StageChip. Wraps
 * arbitrary chips (e.g. needs-action / freshness badges) in a flex row that
 * aligns with the stage badge.
 */
export function StatusChips({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {children}
    </span>
  );
}
