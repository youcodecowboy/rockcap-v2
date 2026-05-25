"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/useColors";

export function ThemeToggle() {
  const { mode, toggleMode, colors } = useTheme();
  return (
    <button
      onClick={toggleMode}
      title={mode === "light" ? "Switch to dark" : "Switch to light"}
      style={{
        background: colors.bg.card,
        border: `1px solid ${colors.border.default}`,
        color: colors.text.muted,
        padding: "6px 10px",
        borderRadius: 4,
        fontSize: 11,
        display: "flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
      }}
      aria-label="Toggle theme"
    >
      {mode === "light" ? <Sun size={14} color={colors.accent.yellow} /> : <Moon size={14} color={colors.accent.purple} />}
      <span>{mode === "light" ? "Light" : "Dark"}</span>
    </button>
  );
}
