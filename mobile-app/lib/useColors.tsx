// Theme context for the mobile app — mirrors the web's lib/useColors.ts contract.
//
// Components call useColors() to read the active palette instead of importing `palette` directly.
// Today the app is dark-only, so this is a thin indirection — but it is the SAME indirection the
// web uses, so adding a light palette later is a one-file change (define LIGHT, switch on mode)
// with zero component edits.
//
// Entity/status colours come through here too: useColors().entityTypes.client, etc. NativeWind
// cannot JIT dynamic classes like `bg-m-${type}`, so entity-coloured elements MUST use inline
// style={{ ... }} sourced from this hook.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { DARK, palette, type Palette, type ThemeMode } from './theme';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: Palette;
  /** No-op while dark-only; wired for parity with web. Define a LIGHT palette to make it real. */
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      // Dark-only today. When LIGHT lands: mode === 'light' ? LIGHT : DARK.
      colors: palette,
      setMode,
    }),
    [mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Returns the active palette. Falls back to DARK if used outside a provider. */
export function useColors(): Palette {
  return useContext(ThemeContext)?.colors ?? DARK;
}

/** Full theme handle: { mode, colors, setMode }. Throws outside a provider. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
