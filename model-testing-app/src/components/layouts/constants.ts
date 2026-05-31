import type { ColorPalette } from "@/lib/colors";

// Shell offsets — match (desktop)/layout.tsx: <main className="ml-20 pt-16">
// (80px fixed sidebar, 64px fixed nav). Detail headers stick at top:navHeight.
export const SHELL = { navHeight: 64, sidebarWidth: 80, asideWidth: 320 } as const;

export type EntityType = keyof ColorPalette["entityTypes"];
