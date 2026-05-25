"use client";

import { useColors } from "@/lib/useColors";
import { Loader2 } from "lucide-react";

// v1.2.1 — functional preset picker. Renders 4 buttons; click invokes the
// onSelect callback. The OutreachTab wires that callback to
// cadences.applyPresetSchedule (which reschedules unfired touches relative
// to Touch 1's anchor date).
//
// Tooltip on hover shows the offset pattern so operators understand what
// each preset actually does. "Custom" is the catch-all when actual gaps
// don't match any preset OR when operator has manually edited per-touch.

const PRESET_LABELS: Record<string, { label: string; tooltip: string }> = {
  light: {
    label: "Light",
    tooltip: "T1 immediate · T2 +10d · T3 +25d · T4 +60d. Low-pressure for relationship plays.",
  },
  moderate: {
    label: "Moderate",
    tooltip: "T1 immediate · T2 +5d · T3 +12d · T4 +30d. Default; matches SKILL.md cadence package spec.",
  },
  aggressive: {
    label: "Aggressive",
    tooltip: "T1 immediate · T2 +2d · T3 +5d · T4 +10d. Tight chase for near-term opportunities.",
  },
  custom: {
    label: "Custom",
    tooltip: "Current schedule doesn't match a preset OR operator has manually edited touch dates.",
  },
};

interface CadencePresetPickerProps {
  current: string;
  onSelect: (preset: string) => void;
  disabled?: boolean;
}

export function CadencePresetPicker({ current, onSelect, disabled }: CadencePresetPickerProps) {
  const colors = useColors();
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {(["light", "moderate", "aggressive", "custom"] as const).map((preset) => {
        const isActive = preset === current;
        const isCustomActive = preset === "custom" && current === "custom";
        const isDisabled = disabled || preset === "custom";
        const meta = PRESET_LABELS[preset];
        return (
          <button
            key={preset}
            onClick={() => !isDisabled && onSelect(preset)}
            disabled={isDisabled}
            title={meta.tooltip}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: isActive ? 500 : 400,
              border: `1px solid ${isActive ? colors.entityTypes.cadence : colors.border.default}`,
              borderRadius: 3,
              background: isActive
                ? `${colors.entityTypes.cadence}20`
                : colors.bg.card,
              color: isActive ? colors.entityTypes.cadence : isCustomActive ? colors.text.muted : colors.text.secondary,
              cursor: isDisabled ? (isCustomActive ? "default" : "not-allowed") : "pointer",
              opacity: preset === "custom" && !isCustomActive ? 0.45 : 1,
            }}
          >
            {disabled && preset === current ? (
              <Loader2 size={10} className="animate-spin" />
            ) : null}
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
