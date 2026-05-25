"use client";

import { useEffect, useState } from "react";
import { ThemeContext } from "@/lib/useColors";
import { LIGHT, DARK, type ThemeMode } from "@/lib/colors";

const STORAGE_KEY = "rockcap-theme-mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");

  // On mount: read localStorage + prefers-color-scheme
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored === "light" || stored === "dark") {
      setMode(stored);
      return;
    }
    // No stored preference — respect prefers-color-scheme
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      setMode("dark");
    }
  }, []);

  // On mode change: persist
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, mode);
    }
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", mode === "dark");
    }
  }, [mode]);

  const colors = mode === "dark" ? DARK : LIGHT;

  return (
    <ThemeContext.Provider value={{ mode, colors, toggleMode: () => setMode((m) => (m === "light" ? "dark" : "light")) }}>
      {children}
    </ThemeContext.Provider>
  );
}
