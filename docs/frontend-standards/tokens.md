# Design Tokens

All visual values live in `front-end/src/lib/tokens/`. **Import from there. Never hardcode.** A hex value in a feature file is a bug.

```ts
import {
  colors,
  typography,
  spacing,
  dimensions,
  transitions,
  grid,
} from '@lib/tokens';
import { useColors } from '@lib/context'; // theme-aware colors
```

## Theme-aware vs. theme-agnostic

| Source                                    | When to use                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `useColors()` (hook)                      | Anywhere inside `<ThemeProvider>`. Returns light or dark colors based on user setting. **This is the default.** |
| `colors` (static import)                  | Only when rendering outside the provider or generating a static visual (e.g. server-side, print stylesheet).    |
| `theme.colors.bg.base` (via `useTheme()`) | When you also need `mode` or `theme.logo`.                                                                      |

The static `colors` object equals the dark theme's colors. Components that use it (instead of `useColors()`) won't switch with light mode. Audit and migrate as you touch them.

---

## Colors

### Background — layered depth

| Token        | Dark      | Light     | Use                                                                 |
| ------------ | --------- | --------- | ------------------------------------------------------------------- |
| `bg.base`    | `#0a0a0a` | `#ffffff` | Page background; outermost surface                                  |
| `bg.light`   | `#0f0f0f` | `#fafafa` | Elevated chrome — header, tab bar, sidebar interior, modal backdrop |
| `bg.card`    | `#111111` | `#ffffff` | Content cards, active tab, drawer body                              |
| `bg.cardAlt` | `#0d0d0d` | `#f5f5f5` | Canvas under cards — dashboard background, grid gap fill            |

**Rule of thumb:** in dark mode you go `base → cardAlt → card` as you nest deeper; in light mode `base → card → cardAlt`. The two themes invert the relationship deliberately to keep cards "popping forward" in both.

### Border — visual separation

| Token            | Dark      | Light     | Use                                               |
| ---------------- | --------- | --------- | ------------------------------------------------- |
| `border.default` | `#2a2a2a` | `#e0e0e0` | Primary boundary — between sections, around cards |
| `border.mid`     | `#363636` | `#d0d0d0` | Medium emphasis — active state, focused input     |
| `border.light`   | `#404040` | `#ebebeb` | Light dividers inside cards, grid lines           |

**Dark-mode contrast note:** values were bumped from `#1a/#22/#2a` (round 2) to the values above (round 3) so container outlines are visible enough to scan against `bg.cardAlt` (`#0d`) and `bg.card` (`#11`). Borders are still calm — not hard lines — but no longer ghosted.

### Text — hierarchy

| Token            | Dark      | Light     | Dark contrast    | Use                                        |
| ---------------- | --------- | --------- | ---------------- | ------------------------------------------ |
| `text.primary`   | `#e5e5e5` | `#1a1a1a` | ~15:1            | Body copy, metric values, active labels    |
| `text.secondary` | `#b8b8b8` | `#4a4a4a` | ~9:1             | Subtitles, captions, helper text           |
| `text.muted`     | `#8a8a8a` | `#6b6b6b` | ~5:1 (AA normal) | Disabled, placeholder, inactive nav items  |
| `text.dim`       | `#6e6e6e` | `#9a9a9a` | ~3:1 (AA large)  | Very subtle — empty-state copy, decoration |

**Contrast rule:** `text.dim` is for **large text only** (≥18px or ≥14px bold). Don't use it for body copy or table cells — pick `muted` for body that needs to fade back, `secondary` for body that should still read clearly. The dark-mode values were bumped on 2026-05-15 from `#666` / `#444` (which failed WCAG AA on `bg.base`) to the values above.

### Accent — semantic colors

These keep their hex value across themes — accent colors carry meaning, not mood.

| Token           | Hex       | Meaning                                                              |
| --------------- | --------- | -------------------------------------------------------------------- |
| `accent.orange` | `#f97316` | **Brand primary.** Workflow entity, active drag/resize, lock-in CTAs |
| `accent.green`  | `#22c55e` | Success, positive trend, item entity, running status                 |
| `accent.blue`   | `#3b82f6` | Info, links, order entity, production status                         |
| `accent.purple` | `#a855f7` | Premium / special, contact entity, QC status                         |
| `accent.yellow` | `#eab308` | Warning, attention, analytics entity, idle status                    |
| `accent.red`    | `#ef4444` | Error, danger, maintenance status                                    |
| `accent.cyan`   | `#06b6d4` | **Campaign entity**, highlight, secondary info                       |
| `accent.indigo` | `#6366f1` | **Project entity**                                                   |
| `accent.teal`   | `#14b8a6` | **Supplier entity**                                                  |

### Entity types & status

`colors.entityTypes.*` and `colors.status.*` are documented in `branding.md`. They're aliases of the accent palette mapped to product semantics — always reach for the semantic token (`colors.entityTypes.workflow`) instead of the raw accent (`colors.accent.orange`) when the meaning is "this is a workflow."

---

## Typography

```ts
typography.fontFamily.sans; // 'system-ui, -apple-system, sans-serif'
typography.fontFamily.mono; // 'ui-monospace, SFMono-Regular, Menlo, ...'
```

### Size scale (px)

| Token  | Size | Typical use                                |
| ------ | ---- | ------------------------------------------ |
| `xs`   | 9    | `<Label>` text, tiny metadata              |
| `sm`   | 10   | Compact density labels, secondary metadata |
| `base` | 11   | Mono data, default density labels          |
| `md`   | 12   | Body text, table cells, default UI         |
| `lg`   | 13   | Tab titles, button labels                  |
| `xl`   | 14   | Sidebar item text, secondary headers       |
| `2xl`  | 16   | Section headers, larger buttons            |
| `3xl`  | 18   | Page-level headers                         |
| `4xl`  | 20   | Page titles                                |
| `5xl`  | 24   | Medium metric values                       |
| `6xl`  | 32   | Standard density metric values             |
| `7xl`  | 36   | Expanded density metric values             |

**Density-aware sizing:** dashboard widgets pull from `densityFontSizes` rather than picking a static size. See `patterns.md → Dashboard Grid` for why.

### Weight scale

| Token      | Value | Use                                                               |
| ---------- | ----- | ----------------------------------------------------------------- |
| `light`    | 300   | **Default for large display values.** Metric numbers, page titles |
| `normal`   | 400   | Body, default UI text                                             |
| `medium`   | 500   | Buttons, emphasis within body                                     |
| `semibold` | 600   | Active states, strong emphasis (rare)                             |
| `bold`     | 700   | Reserved — almost never used                                      |

### Predefined text styles

Use these instead of composing fontSize + fontFamily + fontWeight by hand:

```ts
import { textStyles } from '@lib/tokens';

textStyles.label; // xs uppercase mono with wider tracking
textStyles.metricLarge; // 7xl light sans (dashboard hero metric)
textStyles.metricMedium; // 5xl light sans
textStyles.body; // 12px normal sans
textStyles.mono; // 11px mono
textStyles.ui; // 13px sans (tabs, buttons)
```

If you find yourself composing the same {fontSize, fontFamily, fontWeight} pair in three places, add a new entry to `textStyles` rather than continuing to compose by hand.

---

## Spacing

```ts
spacing[1]; // 4
spacing[2]; // 8
spacing[3]; // 12
spacing[4]; // 16
spacing[6]; // 24
spacing[8]; // 32
spacing[12]; // 48
spacing[16]; // 64
```

### Common cadences

| Cadence            | Use                                                    |
| ------------------ | ------------------------------------------------------ |
| `spacing[2]` (8)   | Tight gaps between siblings in a row                   |
| `spacing[3]` (12)  | Standard gap inside compact components                 |
| `spacing[4]` (16)  | Default card padding, grid item internal padding       |
| `spacing[6]` (24)  | Between page sections                                  |
| `spacing[8]` (32)  | Around major headers, between unrelated content blocks |
| `spacing[16]` (64) | Empty-state padding, top of "blank canvas"             |

### Layout dimensions

`dimensions.*` holds the fixed pixel dimensions for shell components — these define the app's physical layout grid.

| Token                                       | Value            | What it is                              |
| ------------------------------------------- | ---------------- | --------------------------------------- |
| `headerHeight`                              | 80               | Main app header                         |
| `sidebarCollapsed`                          | 56               | Sidebar icon-only width (default state) |
| `sidebarExpanded`                           | 200              | Sidebar hover-expanded width            |
| `tabBarHeight`                              | 40               | Tab strip                               |
| `chatDrawerWidth`                           | 340              | Right-side chat drawer                  |
| `gridCellMinHeight`                         | 140              | Minimum dashboard cell height           |
| `borderRadius.sm` / `.md` / `.lg` / `.full` | 2 / 4 / 8 / 9999 | Corner radii                            |

---

## Transitions

```ts
transitions.fast; // 0.1s ease  — micro-interactions, hover color changes
transitions.normal; // 0.15s ease — default for opacity/transform
transitions.slow; // 0.2s ease  — entrances, larger transforms
transitions.sidebar; // 0.2s ease  — sidebar expand/collapse
transitions.drawer; // 0.25s cubic-bezier(0.4, 0, 0.2, 1) — chat drawer slide
transitions.gridResize; // 0.25s cubic-bezier(0.4, 0, 0.2, 1) — grid cell resize
transitions.gridSnap; // 0.15s cubic-bezier(0.68, -0.55, 0.27, 1.55) — snap with slight overshoot
transitions.gridContent; // 0.2s ease-out — content density change
```

Never write a raw duration. If `transitions.fast` is too slow for a case, that's a token discussion, not a one-off override.

---

## Grid

The dashboard grid is its own subsystem — see `patterns.md → Dashboard Grid` for usage. Token reference:

```ts
grid.columns           // 6
grid.allowedColSpans   // [1, 2, 4, 6]
grid.allowedRowSpans   // [1, 2, 3]
grid.gap               // 1 (px — this is the visual signature)

cellDimensions.rowHeight     // 160
cellDimensions.minRowHeight  // 140
cellDimensions.padding.compact / .default / .loose  // 12 / 16 / 20

widgetConstraints.MetricCard.defaultCols  // 1
widgetConstraints.ChartCard.defaultCols   // 4
// ... etc per widget type
```

> **Note on column spans.** Live code allows `[1, 2, 4, 6]`. An older note in `front-end/CLAUDE.md` mentions "2, 4, 6 only" — that note is stale. Compact widgets (MetricCard, SparklineCard, AlertsList) explicitly default to 1-column and the grid system supports it. The 4-value set is the canon.

### Snap helpers

When accepting a raw drag/resize value, snap to the allowed set before persisting:

```ts
import { snapColSpan, snapRowSpan } from '@lib/tokens';

const w = snapColSpan(rawDragWidth, minCols, maxCols); // 1 | 2 | 4 | 6
const h = snapRowSpan(rawDragHeight, minRows, maxRows); // 1 | 2 | 3
```

---

## Auditing your code

If any of these appear in a feature file, fix them:

- A hex color (`#abcdef`) — use a token.
- A raw px number for spacing (`padding: 12`) — use `spacing[3]`.
- A raw duration (`transition: 0.18s`) — use a `transitions.*` token.
- `colors.bg.base` imported from `@lib/tokens/colors` instead of via `useColors()` — won't theme-switch.
- A custom border radius — use `dimensions.borderRadius`.
- Font sizes typed as numbers (`fontSize: 14`) — use `typography.fontSize.xl`.

---

**Open for review:** the bottom of the typography scale (9px is dense — desktop-only); the 1-column row of widget constraints (let real layouts inform whether 1-col widgets are pulling weight or just cluttering); the `accent.cyan` token (currently has no canonical meaning).
