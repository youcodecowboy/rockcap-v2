// RockCap mobile design tokens — dark-first, ported from the web frontend canon.
// Web source of truth: model-testing-app/src/lib/colors.ts (DARK palette) + docs/frontend-standards/tokens.md
//
// What is ported verbatim vs. adapted:
//   • Color LANGUAGE (accent / entityTypes / status) — copied EXACTLY from web. These are
//     theme-invariant and meaning-bearing; never recolour them for aesthetics.
//   • Backgrounds / borders / text — the web DARK palette, used as the mobile default.
//   • DENSITY (typography, spacing, radius) — re-scaled UP for touch ergonomics. The web canon
//     is CAD-dense (9–12px); mobile uses legible sizes and ≥44px touch targets.
//
// Consume colours through `useColors()` (lib/useColors.tsx), NOT by importing `palette` directly,
// so a LIGHT palette can be added later with zero component changes.

import { Platform } from 'react-native';

// ── Theme-invariant semantic colours (identical to web; meaning-bearing, never decorative) ──
const accent = {
  orange: '#f97316',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  yellow: '#eab308',
  red: '#ef4444',
  cyan: '#06b6d4',
  indigo: '#6366f1',
  teal: '#14b8a6',
} as const;

// Entity colours — the heart of the canon. client=green, project=indigo, prospect=amber,
// lender=teal, deal=blue, contact=purple. Drive every entity-scoped accent off this map.
const entityTypes = {
  dashboard: '#737373',
  prospect: '#eab308',
  client: '#22c55e',
  lender: '#14b8a6',
  project: '#6366f1',
  deal: '#3b82f6',
  contact: '#a855f7',
  cadence: '#f97316',
  approval: '#ef4444',
  skillRun: '#06b6d4',
  analytics: '#facc15',
} as const;

const status = {
  drafted: '#eab308',
  revision: '#f97316',
  active: '#3b82f6',
  replied: '#a855f7',
  engaged: '#06b6d4',
  promoted: '#22c55e',
  parked: '#9a9a9a',
  lost: '#9a9a9a',
} as const;

// ── Dark palette (mobile default; mirrors web DARK) ──
export const DARK = {
  bg: {
    base: '#0a0a0a', // app canvas
    light: '#0f0f0f', // elevated chrome (header, tab bar, sheets)
    card: '#111111', // content cards, list rows
    cardAlt: '#0d0d0d', // canvas under cards / inset
  },
  border: {
    default: '#2a2a2a', // primary hairlines
    mid: '#363636', // active / focused
    light: '#404040', // dividers inside cards
  },
  text: {
    primary: '#e5e5e5', // body, values
    secondary: '#b8b8b8', // subtitles, captions
    muted: '#8a8a8a', // placeholder, inactive
    dim: '#6e6e6e', // decoration, empty-state copy
  },
  accent,
  entityTypes,
  status,
} as const;

export type Palette = typeof DARK;
export type EntityType = keyof typeof entityTypes;
export type StatusKey = keyof typeof status;
export type ThemeMode = 'dark' | 'light';

// Active palette. Dark-only today. To add light later: define a LIGHT palette of the same shape
// and have useColors() select on mode — no component touches required.
export const palette: Palette = DARK;

// ── Typography — re-scaled for mobile legibility (web canon is 9–12px; not usable on touch) ──
export const typography = {
  family: {
    sans: undefined as string | undefined, // RN system font
    mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  size: {
    xs: 11, // tiny metadata
    sm: 12, // secondary labels
    label: 12, // mono-uppercase labels (web 9px → 12px on mobile)
    base: 13, // mono data default
    md: 15, // body default
    lg: 17, // list-item titles, tab labels
    xl: 20, // section headers
    title: 24, // page / entity titles
    metric: 32, // hero metric values
  },
  weight: {
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
  },
} as const;

// ── Spacing — 4px base, same scale as web ──
export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// ── Radius — slightly rounder than web (mobile convention); web is 2–4px sharp ──
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

// ── Layout constants ──
export const layout = {
  headerHeight: 52,
  tabBarHeight: 36,
  footerHeight: 64,
  pagePadding: 16,
  sectionGap: 12,
  cardPadding: 16,
  cardRadius: radius.lg,
  itemGap: 8,
  touchTarget: 44, // minimum interactive size
} as const;

// ── Backward-compat shim ─────────────────────────────────────────────────────────────────────
// Existing components import { colors } from '@/lib/theme' with the old monochrome key names.
// Mapping those keys onto the dark palette flips the entire app to dark in one step; Phase 2
// migrates components off these keys onto useColors()/entity tokens, after which this can go.
export const colors = {
  bg: DARK.bg.base,
  bgSubtle: DARK.bg.light,
  bgInset: DARK.bg.cardAlt,
  bgCard: DARK.bg.card,
  bgBrand: DARK.text.primary, // primary surface inverts to light-on-dark in dark mode
  textPrimary: DARK.text.primary,
  textSecondary: DARK.text.secondary,
  textTertiary: DARK.text.muted,
  textPlaceholder: DARK.text.dim,
  textOnBrand: DARK.bg.base, // dark text on the inverted primary surface
  border: DARK.border.default,
  borderSubtle: DARK.border.light,
  accent: DARK.text.primary,
  accentHover: DARK.text.secondary,
  accentSubtle: DARK.bg.card,
  success: accent.green,
  warning: accent.yellow,
  error: accent.red,
} as const;
