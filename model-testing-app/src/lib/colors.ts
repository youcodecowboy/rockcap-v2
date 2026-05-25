// RockCap color tokens — light + dark palettes per docs/frontend-standards/tokens.md
// Adapted from Groovy frontend canon.

export const LIGHT = {
  bg: {
    base: "#ffffff",
    light: "#fafafa",
    card: "#ffffff",
    cardAlt: "#f5f5f5",
  },
  border: {
    default: "#e0e0e0",
    mid: "#d0d0d0",
    light: "#ebebeb",
  },
  text: {
    primary: "#1a1a1a",
    secondary: "#4a4a4a",
    muted: "#6b6b6b",
    dim: "#9a9a9a",
  },
  accent: {
    orange: "#f97316",
    green: "#22c55e",
    blue: "#3b82f6",
    purple: "#a855f7",
    yellow: "#eab308",
    red: "#ef4444",
    cyan: "#06b6d4",
    indigo: "#6366f1",
    teal: "#14b8a6",
  },
  entityTypes: {
    dashboard: "#737373",
    prospect: "#eab308",
    client: "#22c55e",
    lender: "#14b8a6",
    project: "#6366f1",
    deal: "#3b82f6",
    contact: "#a855f7",
    cadence: "#f97316",
    approval: "#ef4444",
    skillRun: "#06b6d4",
    analytics: "#facc15",
  },
  status: {
    drafted: "#eab308",
    revision: "#f97316",
    active: "#3b82f6",
    replied: "#a855f7",
    engaged: "#06b6d4",
    promoted: "#22c55e",
    parked: "#9a9a9a",
    lost: "#9a9a9a",
  },
};

export const DARK = {
  bg: {
    base: "#0a0a0a",
    light: "#0f0f0f",
    card: "#111111",
    cardAlt: "#0d0d0d",
  },
  border: {
    default: "#2a2a2a",
    mid: "#363636",
    light: "#404040",
  },
  text: {
    primary: "#e5e5e5",
    secondary: "#b8b8b8",
    muted: "#8a8a8a",
    dim: "#6e6e6e",
  },
  accent: LIGHT.accent,
  entityTypes: LIGHT.entityTypes,
  status: LIGHT.status,
};

export type ColorPalette = typeof LIGHT;
export type ThemeMode = "light" | "dark";
