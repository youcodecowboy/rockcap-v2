"use client";

import { createContext, useContext } from "react";
import { LIGHT, type ColorPalette, type ThemeMode } from "./colors";

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ColorPalette;
  toggleMode: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useColors(): ColorPalette {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback: outside provider. Default to LIGHT (canonical default).
    return LIGHT;
  }
  return ctx.colors;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be called inside <ThemeProvider>");
  }
  return ctx;
}
