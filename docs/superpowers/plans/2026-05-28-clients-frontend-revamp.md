# Clients Frontend Revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the desktop clients section (list + client profile + project profile) onto the prospects-section canon via a new, reusable shared layout layer.

**Architecture:** Extract generic layout primitives + a thin `EntityDetailScaffold` / `EntityListScaffold` (copied from prospects' shapes, but prospects is NOT refactored onto them — it is volatile and off-limits). The three clients pages consume the scaffolds; tab *contents* get only a light token/color pass this pass.

**Tech Stack:** Next.js 16 (App Router, `--webpack`), React, TypeScript, Convex (`useQuery`), inline styles + `useColors()` token hook (`src/lib/colors.ts`), vitest (pure-logic units only), shadcn/ui (retained inside tab contents).

**Spec:** `docs/superpowers/specs/2026-05-28-clients-frontend-revamp-design.md`

---

## Verification strategy (read first)

This codebase has **no React component test harness** (vitest exists but is used for pure-logic units in `src/__tests__/`; there is no testing-library/jsdom). So:

- **Pure logic** (the status→tone map) → real vitest TDD.
- **Components / pages** → `npx tsc --noEmit` per task (fast type gate) and `npm run build` at phase boundaries (`next build --webpack`), plus an operator visual check.
- The operator launches the dev server and drives the browser themselves — do not attempt to drive a preview browser.

Commands:
- Type check: `npx tsc --noEmit` → expected: no errors.
- Unit test: `npm run test:run -- <file>` → expected: PASS.
- Build (phase ends): `npm run build` → expected: compiles, no type errors.

All paths below are relative to `model-testing-app/` unless absolute.

---

## File structure (decomposition)

**New — `src/components/layouts/`** (the shared layer):
- `constants.ts` — `SHELL` offsets + `EntityType`.
- `TopAccent.tsx`, `Breadcrumbs.tsx`, `EntityIconTile.tsx`, `KpiRow.tsx`, `TabStrip.tsx`, `DetailAside.tsx` (exports `Section`, `Row`), `StatusPill.tsx`, `entityStatus.ts` (tone maps), `Skeleton.tsx`.
- `EntityDetailScaffold.tsx`, `EntityListScaffold.tsx`.
- `index.ts` — barrel re-export.

**New — clients-specific:**
- `src/app/(desktop)/clients/[clientId]/components/ClientDetailAside.tsx`
- `src/app/(desktop)/clients/[clientId]/projects/[projectId]/components/ProjectDetailAside.tsx`

**Modified:**
- `src/app/(desktop)/clients/page.tsx` (list → scaffold + table)
- `src/app/(desktop)/clients/[clientId]/page.tsx` (profile → scaffold)
- `src/app/(desktop)/clients/[clientId]/projects/[projectId]/page.tsx` (project → scaffold, purple→indigo)
- the 14 client tab + 8 project tab components (light token pass)
- `src/app/globals.css` (shadcn CSS-var alignment)

**Deleted:**
- `src/app/(desktop)/clients/components/ClientsSidebar.tsx` (only referenced by `clients/page.tsx`)

---

# Phase 1 — Shared layout layer

### Task 1.1: Constants + EntityType

**Files:**
- Create: `src/components/layouts/constants.ts`

- [ ] **Step 1: Write the module**

```ts
import type { ColorPalette } from "@/lib/colors";

// Shell offsets — match (desktop)/layout.tsx: <main className="ml-20 pt-16">
// (80px fixed sidebar, 64px fixed nav). Detail headers stick at top:navHeight.
export const SHELL = { navHeight: 64, sidebarWidth: 80, asideWidth: 320 } as const;

export type EntityType = keyof ColorPalette["entityTypes"];
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/constants.ts
git commit -m "[layouts] add shell constants + EntityType"
```

---

### Task 1.2: Status tone maps (TDD — the one pure-logic unit)

**Files:**
- Create: `src/components/layouts/entityStatus.ts`
- Test: `src/__tests__/entityStatus.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { LIGHT } from "@/lib/colors";
import { clientStatusTone, projectStatusTone } from "@/components/layouts/entityStatus";

describe("clientStatusTone", () => {
  it("maps active to green (engaged relationship, not status-blue)", () => {
    expect(clientStatusTone("active", LIGHT)).toBe(LIGHT.accent.green);
  });
  it("maps prospect to amber", () => {
    expect(clientStatusTone("prospect", LIGHT)).toBe(LIGHT.accent.yellow);
  });
  it("maps archived and past to dim grey", () => {
    expect(clientStatusTone("archived", LIGHT)).toBe(LIGHT.text.dim);
    expect(clientStatusTone("past", LIGHT)).toBe(LIGHT.text.dim);
  });
  it("is case-insensitive and falls back to muted", () => {
    expect(clientStatusTone("ACTIVE", LIGHT)).toBe(LIGHT.accent.green);
    expect(clientStatusTone(undefined, LIGHT)).toBe(LIGHT.text.muted);
  });
});

describe("projectStatusTone", () => {
  it("maps active->green, completed->blue, on-hold->yellow, cancelled->red, inactive->dim", () => {
    expect(projectStatusTone("active", LIGHT)).toBe(LIGHT.accent.green);
    expect(projectStatusTone("completed", LIGHT)).toBe(LIGHT.accent.blue);
    expect(projectStatusTone("on-hold", LIGHT)).toBe(LIGHT.accent.yellow);
    expect(projectStatusTone("cancelled", LIGHT)).toBe(LIGHT.accent.red);
    expect(projectStatusTone("inactive", LIGHT)).toBe(LIGHT.text.dim);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- entityStatus`
Expected: FAIL (`Cannot find module '@/components/layouts/entityStatus'`).

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ColorPalette } from "@/lib/colors";

export function clientStatusTone(status: string | undefined, colors: ColorPalette): string {
  switch ((status ?? "").toLowerCase()) {
    case "active": return colors.accent.green;
    case "prospect": return colors.accent.yellow;
    case "archived":
    case "past": return colors.text.dim;
    default: return colors.text.muted;
  }
}

export function projectStatusTone(status: string | undefined, colors: ColorPalette): string {
  switch ((status ?? "").toLowerCase()) {
    case "active": return colors.accent.green;
    case "completed": return colors.accent.blue;
    case "on-hold": return colors.accent.yellow;
    case "cancelled": return colors.accent.red;
    case "inactive": return colors.text.dim;
    default: return colors.text.muted;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- entityStatus`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add src/components/layouts/entityStatus.ts src/__tests__/entityStatus.test.ts
git commit -m "[layouts] add client/project status tone maps with tests"
```

---

### Task 1.3: StatusPill primitive

**Files:**
- Create: `src/components/layouts/StatusPill.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

export function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        borderRadius: 2,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 9,
        lineHeight: 1.3,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        background: `${tone}20`,
        color: tone,
        border: `1px solid ${tone}40`,
      }}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/StatusPill.tsx
git commit -m "[layouts] add generic StatusPill"
```

---

### Task 1.4: TopAccent + Breadcrumbs + EntityIconTile

**Files:**
- Create: `src/components/layouts/TopAccent.tsx`
- Create: `src/components/layouts/Breadcrumbs.tsx`
- Create: `src/components/layouts/EntityIconTile.tsx`

- [ ] **Step 1: Write `TopAccent.tsx`**

```tsx
"use client";

import { useColors } from "@/lib/useColors";
import type { EntityType } from "./constants";

export function TopAccent({ type }: { type: EntityType }) {
  const colors = useColors();
  return <div style={{ height: 2, background: colors.entityTypes[type] }} />;
}
```

- [ ] **Step 2: Write `Breadcrumbs.tsx`**

```tsx
"use client";

import { useColors } from "@/lib/useColors";
import type { EntityType } from "./constants";

export interface Crumb {
  label: string;
  type?: EntityType;
  onClick?: () => void;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const colors = useColors();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: colors.text.muted }}>
      {items.map((c, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {i > 0 && <span style={{ color: colors.text.dim }}>›</span>}
          {c.type && (
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.entityTypes[c.type] }} />
          )}
          <span
            onClick={c.onClick}
            style={{
              cursor: c.onClick ? "pointer" : "default",
              color: c.onClick ? colors.text.muted : colors.text.primary,
              fontWeight: c.onClick ? 400 : 500,
            }}
          >
            {c.label}
          </span>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `EntityIconTile.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";
import type { EntityType } from "./constants";

export function EntityIconTile({ type, children }: { type: EntityType; children: ReactNode }) {
  const colors = useColors();
  const c = colors.entityTypes[type];
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        background: `${c}15`,
        border: `1px solid ${c}40`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: c,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/layouts/TopAccent.tsx src/components/layouts/Breadcrumbs.tsx src/components/layouts/EntityIconTile.tsx
git commit -m "[layouts] add TopAccent, Breadcrumbs, EntityIconTile"
```

---

### Task 1.5: KpiRow + TabStrip

**Files:**
- Create: `src/components/layouts/KpiRow.tsx`
- Create: `src/components/layouts/TabStrip.tsx`

- [ ] **Step 1: Write `KpiRow.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";

export interface Kpi {
  label: string;
  value: ReactNode;
  meta?: string;
  accent?: string;
}

export function KpiRow({ items }: { items: Kpi[] }) {
  const colors = useColors();
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 1, background: colors.border.default }}>
      {items.map((k) => (
        <div key={k.label} style={{ background: colors.bg.card, padding: "12px 14px", borderTop: `2px solid ${k.accent ?? colors.border.mid}` }}>
          <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.text.muted }}>
            {k.label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 300, color: colors.text.primary, marginTop: 6 }}>{k.value}</div>
          {k.meta && <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>{k.meta}</div>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `TabStrip.tsx`**

```tsx
"use client";

import { useColors } from "@/lib/useColors";
import type { EntityType } from "./constants";

export interface TabDef {
  id: string;
  label: string;
  count?: number;
}

export function TabStrip({
  tabs,
  activeTab,
  onChange,
  entityType,
}: {
  tabs: TabDef[];
  activeTab: string;
  onChange: (id: string) => void;
  entityType: EntityType;
}) {
  const colors = useColors();
  return (
    <div style={{ display: "flex", padding: "0 24px", gap: 0, borderBottom: `1px solid ${colors.border.default}`, overflowX: "auto" }}>
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <div
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              padding: "12px 16px",
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap",
              color: active ? colors.text.primary : colors.text.muted,
              borderBottom: `2px solid ${active ? colors.entityTypes[entityType] : "transparent"}`,
              fontWeight: active ? 500 : 400,
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{ color: colors.text.dim, marginLeft: 4 }}>{tab.count}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layouts/KpiRow.tsx src/components/layouts/TabStrip.tsx
git commit -m "[layouts] add KpiRow and TabStrip"
```

---

### Task 1.6: DetailAside (Section + Row)

**Files:**
- Create: `src/components/layouts/DetailAside.tsx`

This lifts `Section`/`Row` out of `src/components/prospects/ProspectDetailAside.tsx` (lines 261–338) and makes them self-contained (call `useColors()` internally instead of taking a `colors` prop). Prospects is NOT modified.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: colors.text.muted,
          marginBottom: 6,
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export function Row({
  label,
  value,
  mono,
  pill,
  valueColor,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  pill?: string;
  valueColor?: string;
}) {
  const colors = useColors();
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        padding: "6px 0",
        fontSize: 11,
        borderBottom: `1px solid ${colors.border.light}`,
        alignItems: "baseline",
      }}
    >
      <span style={{ color: colors.text.muted, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: valueColor ?? colors.text.primary,
          maxWidth: 200,
          textAlign: "right",
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          fontSize: mono ? 10 : 11,
          wordBreak: mono ? "break-all" : "normal",
        }}
      >
        {pill ? (
          <span
            style={{
              display: "inline-block",
              padding: "2px 6px",
              borderRadius: 2,
              background: `${pill}20`,
              color: pill,
              border: `1px solid ${pill}40`,
              fontFamily: "ui-monospace, monospace",
              fontSize: 9,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            {value}
          </span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/DetailAside.tsx
git commit -m "[layouts] add DetailAside Section/Row primitives"
```

---

### Task 1.7: Skeleton primitives

**Files:**
- Create: `src/components/layouts/Skeleton.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useColors } from "@/lib/useColors";

export function Skeleton({ width = "100%", height = 16, radius = 4 }: { width?: number | string; height?: number | string; radius?: number }) {
  const colors = useColors();
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: colors.bg.cardAlt,
        border: `1px solid ${colors.border.light}`,
      }}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "60%" : "100%"} height={12} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 8, cols = 4 }: { rows?: number; cols?: number }) {
  const colors = useColors();
  return (
    <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, overflow: "hidden" }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, padding: "12px 16px", borderBottom: r === rows - 1 ? "none" : `1px solid ${colors.border.light}` }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} height={12} />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/Skeleton.tsx
git commit -m "[layouts] add Skeleton primitives"
```

---

### Task 1.8: EntityListScaffold

**Files:**
- Create: `src/components/layouts/EntityListScaffold.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";
import type { EntityType } from "./constants";
import { TopAccent } from "./TopAccent";

export function EntityListScaffold({
  entityType,
  title,
  count,
  search,
  actions,
  filters,
  children,
}: {
  entityType: EntityType;
  title: string;
  count?: number;
  search?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <>
      <TopAccent type={entityType} />
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: colors.entityTypes[entityType] }} />
            <h1 style={{ fontSize: 20, fontWeight: 300, margin: 0, color: colors.text.primary }}>{title}</h1>
            {count !== undefined && (
              <span
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 11,
                  color: colors.text.muted,
                  background: colors.bg.cardAlt,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  padding: "1px 6px",
                }}
              >
                {count}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {search}
            {actions}
          </div>
        </div>
        {filters && <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>{filters}</div>}
      </div>
      <div style={{ padding: "0 24px 24px" }}>{children}</div>
    </>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/EntityListScaffold.tsx
git commit -m "[layouts] add EntityListScaffold"
```

---

### Task 1.9: EntityDetailScaffold

**Files:**
- Create: `src/components/layouts/EntityDetailScaffold.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import type { ReactNode } from "react";
import { useColors } from "@/lib/useColors";
import { SHELL } from "./constants";
import type { EntityType } from "./constants";
import { TopAccent } from "./TopAccent";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";
import { EntityIconTile } from "./EntityIconTile";
import { KpiRow, type Kpi } from "./KpiRow";
import { TabStrip, type TabDef } from "./TabStrip";

export function EntityDetailScaffold({
  entityType,
  breadcrumbs,
  icon,
  title,
  subtitle,
  status,
  actions,
  kpis,
  tabs,
  activeTab,
  onTabChange,
  banner,
  aside,
  children,
}: {
  entityType: EntityType;
  breadcrumbs: Crumb[];
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  kpis?: Kpi[];
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (id: string) => void;
  banner?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <>
      <TopAccent type={entityType} />
      <div style={{ background: colors.bg.card, borderBottom: `1px solid ${colors.border.default}`, position: "sticky", top: SHELL.navHeight, zIndex: 5 }}>
        <div style={{ padding: "14px 24px 4px" }}>
          <Breadcrumbs items={breadcrumbs} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 24px 18px" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <EntityIconTile type={entityType}>{icon}</EntityIconTile>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 300, margin: 0, color: colors.text.primary }}>{title}</h1>
              {subtitle && <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{subtitle}</div>}
            </div>
            {status}
          </div>
          {actions && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}
        </div>
        {kpis && kpis.length > 0 && (
          <div style={{ padding: "0 24px 12px" }}>
            <KpiRow items={kpis} />
          </div>
        )}
        <TabStrip tabs={tabs} activeTab={activeTab} onChange={onTabChange} entityType={entityType} />
      </div>
      {banner}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: aside ? `1fr ${SHELL.asideWidth}px` : "1fr",
          gap: 1,
          background: colors.border.default,
          paddingBottom: 40,
        }}
      >
        <div style={{ background: colors.bg.card, padding: 24, minWidth: 0 }}>{children}</div>
        {aside && (
          <aside style={{ background: colors.bg.light, padding: 20, borderLeft: `1px solid ${colors.border.default}` }}>{aside}</aside>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layouts/EntityDetailScaffold.tsx
git commit -m "[layouts] add EntityDetailScaffold"
```

---

### Task 1.10: Barrel export + shadcn CSS-var alignment

**Files:**
- Create: `src/components/layouts/index.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write the barrel**

```ts
export { SHELL, type EntityType } from "./constants";
export { TopAccent } from "./TopAccent";
export { Breadcrumbs, type Crumb } from "./Breadcrumbs";
export { EntityIconTile } from "./EntityIconTile";
export { KpiRow, type Kpi } from "./KpiRow";
export { TabStrip, type TabDef } from "./TabStrip";
export { Section, Row } from "./DetailAside";
export { StatusPill } from "./StatusPill";
export { clientStatusTone, projectStatusTone } from "./entityStatus";
export { Skeleton, SkeletonText, SkeletonTable } from "./Skeleton";
export { EntityListScaffold } from "./EntityListScaffold";
export { EntityDetailScaffold } from "./EntityDetailScaffold";
```

- [ ] **Step 2: Inspect current shadcn theme variables**

Run: `grep -n -- "--background\|--border\|--card\|--muted\|--foreground\|@theme\|:root" src/app/globals.css | head -40`
Expected: locate the `:root` (light) and `.dark` CSS-variable blocks shadcn uses (HSL/oklch values for `--background`, `--card`, `--border`, `--muted-foreground`, etc.).

- [ ] **Step 3: Align the light-mode shadcn vars to the token palette**

In the `:root` block of `src/app/globals.css`, set the core surface/border/text vars to match `LIGHT` from `src/lib/colors.ts` so shadcn cards/badges/borders sit on the same surfaces as the inline-styled shell. Use the same color space already in the file (convert the hex below if the file uses HSL/oklch):

- `--background`: `#ffffff` (bg.base)
- `--card`: `#ffffff` (bg.card)
- `--muted` / secondary surface: `#f5f5f5` (bg.cardAlt)
- `--border` / `--input`: `#e0e0e0` (border.default)
- `--foreground`: `#1a1a1a` (text.primary)
- `--muted-foreground`: `#6b6b6b` (text.muted)

If the file uses a non-hex color space, convert each hex to that space rather than mixing formats.

- [ ] **Step 4: Align the dark-mode shadcn vars**

In the `.dark` block, mirror `DARK`: `--background` `#0a0a0a`, `--card` `#111111`, `--muted` `#0d0d0d`, `--border`/`--input` `#2a2a2a`, `--foreground` `#e5e5e5`, `--muted-foreground` `#8a8a8a`.

- [ ] **Step 5: Build to confirm CSS compiles**

Run: `npm run build`
Expected: compiles, no errors. (Visual harmony is verified by the operator at the Phase 2/3 checks.)

- [ ] **Step 6: Commit**

```bash
git add src/components/layouts/index.ts src/app/globals.css
git commit -m "[layouts] add barrel export; align shadcn CSS vars to token palette"
```

> **Phase 1 gate:** `npm run build` passes. The shared layer exists and is type-clean. No page consumes it yet — that is Phases 2–6.

---

# Phase 2 — `/clients` list page

### Task 2.1: Inventory ClientsSidebar's data + filter logic

**Files:**
- Read only: `src/app/(desktop)/clients/components/ClientsSidebar.tsx`

- [ ] **Step 1: Note the data source and filter predicates**

Run: `grep -n "useQuery\|api\.\|filter\|toLowerCase\|status\|type" src/app/(desktop)/clients/components/ClientsSidebar.tsx | head -40`
Record: which Convex query feeds the list (expected `api.clients.list`), the search predicate (name/type contains query), and the status/type filter logic. Phase 2.2 reuses these exact predicates.

No commit (read-only).

---

### Task 2.2: Rebuild `/clients` as a full-width table

**Files:**
- Modify (full rewrite): `src/app/(desktop)/clients/page.tsx`

**Design note:** This replaces the master-detail sidebar with a full-width tokenized table using `EntityListScaffold`. Per YAGNI, this task ships a **plain semantic table** (no virtualization) — clients are a modest book and the natural-flow page scrolls. If profiling later shows lag, reintroduce `useWindowVirtualizer` around the isolated `<ClientRow>` shape; do not add it pre-emptively. `CreateClientDrawer` and `CSVClientImport` modals are preserved.

- [ ] **Step 1: Write the new page**

```tsx
'use client';

import { useState, useMemo, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Building, Upload, Plus, Search } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import {
  EntityListScaffold,
  StatusPill,
  clientStatusTone,
  SkeletonTable,
} from '@/components/layouts';
import CreateClientDrawer from '@/components/CreateClientDrawer';
import CSVClientImport from '@/components/CSVClientImport';

type ClientRow = {
  _id: Id<'clients'>;
  name: string;
  type?: string;
  status?: string;
  updatedAt?: number;
  _creationTime: number;
};

function ClientsPortalContent() {
  const router = useRouter();
  const colors = useColors();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [isCSVImportOpen, setIsCSVImportOpen] = useState(false);

  const clients = useQuery(api.clients.list, {}) as ClientRow[] | undefined;

  const filtered = useMemo(() => {
    if (!clients) return undefined;
    const q = searchQuery.trim().toLowerCase();
    return clients.filter((c) => {
      const matchesQuery = !q || c.name?.toLowerCase().includes(q) || c.type?.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || (c.status ?? '').toLowerCase() === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [clients, searchQuery, statusFilter]);

  const openClient = useCallback((id: Id<'clients'>) => router.push(`/clients/${id}`), [router]);

  const lastActivity = (c: ClientRow) =>
    new Date(c.updatedAt ?? c._creationTime).toLocaleDateString();

  const search = (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <Search style={{ position: 'absolute', left: 8, width: 14, height: 14, color: colors.text.muted }} />
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search clients"
        style={{
          background: colors.bg.card,
          border: `1px solid ${colors.border.default}`,
          color: colors.text.primary,
          borderRadius: 4,
          padding: '6px 8px 6px 28px',
          fontSize: 12,
          width: 220,
        }}
      />
    </div>
  );

  const actions = (
    <>
      <button
        onClick={() => setIsCSVImportOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: colors.bg.card, border: `1px solid ${colors.border.default}`, color: colors.text.primary, borderRadius: 4, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
      >
        <Upload style={{ width: 14, height: 14 }} /> Import CSV
      </button>
      <button
        onClick={() => setIsCreateDrawerOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: colors.entityTypes.client, border: `1px solid ${colors.entityTypes.client}`, color: '#fff', borderRadius: 4, padding: '6px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
      >
        <Plus style={{ width: 14, height: 14 }} /> New Client
      </button>
    </>
  );

  const filters = (['all', 'active', 'prospect', 'archived'] as const).map((s) => (
    <button
      key={s}
      onClick={() => setStatusFilter(s)}
      style={{
        textTransform: 'capitalize',
        fontSize: 11,
        borderRadius: 4,
        padding: '4px 10px',
        cursor: 'pointer',
        background: statusFilter === s ? colors.text.primary : colors.bg.card,
        color: statusFilter === s ? colors.bg.card : colors.text.muted,
        border: `1px solid ${colors.border.default}`,
      }}
    >
      {s}
    </button>
  ));

  const columns = ['Name', 'Type', 'Status', 'Last activity'];

  return (
    <>
      <EntityListScaffold
        entityType="client"
        title="Clients"
        count={filtered?.length}
        search={search}
        actions={actions}
        filters={filters}
      >
        {filtered === undefined ? (
          <SkeletonTable rows={10} cols={4} />
        ) : filtered.length === 0 ? (
          <div style={{ padding: 64, textAlign: 'center', color: colors.text.dim, fontSize: 13 }}>
            No clients match your filters.
          </div>
        ) : (
          <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 16, padding: '10px 16px', background: colors.bg.cardAlt, borderBottom: `1px solid ${colors.border.default}` }}>
              {columns.map((c) => (
                <div key={c} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>
                  {c}
                </div>
              ))}
            </div>
            {filtered.map((c) => (
              <div
                key={c._id}
                onClick={() => openClient(c._id)}
                style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 16, padding: '12px 16px', borderBottom: `1px solid ${colors.border.light}`, cursor: 'pointer', alignItems: 'center', fontSize: 12, color: colors.text.primary }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Building style={{ width: 14, height: 14, color: colors.entityTypes.client, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                </div>
                <div style={{ color: colors.text.secondary, textTransform: 'capitalize' }}>{c.type ?? '—'}</div>
                <div>{c.status ? <StatusPill label={c.status} tone={clientStatusTone(c.status, colors)} /> : '—'}</div>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: colors.text.muted }}>{lastActivity(c)}</div>
              </div>
            ))}
          </div>
        )}
      </EntityListScaffold>

      <CreateClientDrawer isOpen={isCreateDrawerOpen} onClose={() => setIsCreateDrawerOpen(false)} onSuccess={() => setIsCreateDrawerOpen(false)} />
      <CSVClientImport isOpen={isCSVImportOpen} onClose={() => setIsCSVImportOpen(false)} />
    </>
  );
}

export default function ClientsPortalPage() {
  return (
    <Suspense fallback={null}>
      <ClientsPortalContent />
    </Suspense>
  );
}
```

- [ ] **Step 2: Confirm the `ClientRow` fields exist on `api.clients.list`**

Run: `grep -n "status\|type\|updatedAt\|name" convex/clients.ts | head -30`
Expected: `name`, `type`, `status` are fields on the clients table. If `updatedAt` does not exist, the code already falls back to `_creationTime` — leave as-is. If `status`/`type` are named differently, adjust the `ClientRow` type + accessors to match.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(desktop)/clients/page.tsx
git commit -m "[clients] rebuild list page on EntityListScaffold (full-width table)"
```

---

### Task 2.3: Delete the dead ClientsSidebar

**Files:**
- Delete: `src/app/(desktop)/clients/components/ClientsSidebar.tsx`

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "ClientsSidebar" src`
Expected: no matches (only the now-rewritten `page.tsx` referenced it).

- [ ] **Step 2: Delete the file**

Run: `git rm "src/app/(desktop)/clients/components/ClientsSidebar.tsx"`

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: compiles, no errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "[clients] remove dead ClientsSidebar after list rebuild"
```

> **Phase 2 gate:** `npm run build` passes. Operator visually confirms `/clients` renders the full-width table, search/filters work, and a row click opens the profile.

---

# Phase 3 — Client profile shell

### Task 3.1: Build `ClientDetailAside`

**Files:**
- Create: `src/app/(desktop)/clients/[clientId]/components/ClientDetailAside.tsx`

Holds the persistent metadata panel (visible on every tab), including the HubSpot chips moved out of the header.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useColors } from "@/lib/useColors";
import { Section, Row, StatusPill, clientStatusTone } from "@/components/layouts";

export function ClientDetailAside({
  client,
  primaryCompany,
  counts,
}: {
  client: any;
  primaryCompany: any | undefined;
  counts: { projects: number; documents: number; contacts: number; meetings: number };
}) {
  const colors = useColors();
  const addressParts = [client.address, client.city, client.state, client.zip].filter(Boolean);
  const address = addressParts.length ? addressParts.join(", ") : "—";

  return (
    <div>
      <Section title="Client">
        <Row label="Status" value={client.status ?? "—"} pill={clientStatusTone(client.status, colors)} />
        <Row label="Type" value={client.type ?? "—"} />
        {client.email && <Row label="Email" value={client.email} />}
        {client.phone && <Row label="Phone" value={client.phone} mono />}
      </Section>

      <Section title="Location">
        <Row label="Registered" value={address} />
      </Section>

      <Section title="Counts">
        <Row label="Projects" value={counts.projects} mono />
        <Row label="Documents" value={counts.documents} mono />
        <Row label="Contacts" value={counts.contacts} mono />
        <Row label="Meetings" value={counts.meetings} mono />
      </Section>

      {primaryCompany && (
        <Section title="HubSpot">
          {(primaryCompany.hubspotLifecycleStageName || primaryCompany.hubspotLifecycleStage) && (
            <Row label="Lifecycle" value={primaryCompany.hubspotLifecycleStageName ?? primaryCompany.hubspotLifecycleStage} />
          )}
          {primaryCompany.type && <Row label="HubSpot type" value={primaryCompany.type} />}
          {primaryCompany.industry && <Row label="Industry" value={primaryCompany.industry} />}
          {primaryCompany.ownerName && <Row label="Owner" value={primaryCompany.ownerName} />}
        </Section>
      )}

      <div
        style={{
          marginTop: 28,
          paddingTop: 12,
          borderTop: `1px dashed ${colors.border.default}`,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 9,
          color: colors.text.dim,
          lineHeight: 1.6,
        }}
      >
        <div style={{ marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>Metadata</div>
        <div>convex: {client?._id?.slice(-12) ?? "—"}</div>
        {client?.hubspotCompanyId && <div>hubspot: {client.hubspotCompanyId}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(desktop)/clients/[clientId]/components/ClientDetailAside.tsx"
git commit -m "[clients] add ClientDetailAside metadata panel"
```

---

### Task 3.2: Migrate the client profile to `EntityDetailScaffold`

**Files:**
- Modify: `src/app/(desktop)/clients/[clientId]/page.tsx`

**Preserve verbatim** (do NOT rewrite these from the current file): all hooks, queries, and handlers — `useParams/useRouter/useSearchParams`, the Convex hooks (`useClient`, `api.clients.list`, `useProjectsByClient`, `useDocumentsByClient`, `useContactsByClient`, `meetingsCount`, `activeTasksCount`, `openFlagCount`, `promotedCompanies`/`primaryCompany`), `updateClientMutation`, `activeProjects`, `customTypes`, `communications`, `handleStatusChange`, `handleTypeChange`, `handleArchiveClient`, `handleTabChange`, `formatAddress`, `lastActivity`, the `tabs` array, and the three modals at the bottom (`AlertDialog` archive, `ClientSettingsPanel`, `FlagCreationModal`) plus `RestorationBanner`. Keep `EditableStatusBadge`, `EditableClientTypeBadge`, `FlagIndicator`.

The change is **only** the `return (...)` of `ClientProfileContent` (current lines 227–596) plus the loading/not-found branches (lines 170–193) and the imports.

- [ ] **Step 1: Add imports (top of file, alongside existing imports)**

```tsx
import { useColors } from '@/lib/useColors';
import {
  EntityDetailScaffold,
  type Kpi,
  type TabDef,
  SkeletonText,
} from '@/components/layouts';
import { ClientDetailAside } from './components/ClientDetailAside';
```

- [ ] **Step 2: Add `const colors = useColors();` at the top of `ClientProfileContent`** (just after the existing `useState`/hook declarations).

- [ ] **Step 3: Replace the loading branch (current lines 170–176)**

```tsx
  if (client === undefined) {
    return (
      <div style={{ padding: 24 }}>
        <SkeletonText lines={2} />
      </div>
    );
  }
```

- [ ] **Step 4: Replace the not-found branch (current lines 179–193)**

```tsx
  if (!client) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, padding: 48, textAlign: 'center', color: colors.text.muted }}>
          <p style={{ marginBottom: 12 }}>Client not found.</p>
          <Link href="/clients" style={{ color: colors.accent.blue, textDecoration: 'underline' }}>Back to Clients</Link>
        </div>
      </div>
    );
  }
```

- [ ] **Step 5: Build the scaffold inputs just before `return (`** (after `lastActivity` and the existing `tabs` array)

```tsx
  const scaffoldTabs: TabDef[] = tabs.map((t) => ({ id: t.id, label: t.label, count: t.count }));

  const kpis: Kpi[] = [
    { label: 'Projects', value: projects.length, meta: activeProjects.length ? `${activeProjects.length} active` : 'none active', accent: colors.entityTypes.project },
    { label: 'Documents', value: documents.length, accent: colors.entityTypes.client },
    { label: 'Contacts', value: contacts.length, accent: colors.entityTypes.contact },
    { label: 'Meetings', value: meetingsCount, accent: colors.entityTypes.cadence },
    { label: 'Last activity', value: lastActivity ? lastActivity.toLocaleDateString() : '—', accent: colors.entityTypes.skillRun },
  ];

  const actions = (
    <>
      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setSettingsDefaultTab('general'); setShowSettingsPanel(true); }}>
        <Settings className="w-3.5 h-3.5 mr-1" /> Settings
      </Button>
      <Button size="sm" onClick={() => handleTabChange('projects')} className="bg-black text-white hover:bg-gray-800 h-7 text-xs px-2.5">
        <Plus className="w-3.5 h-3.5 mr-1" /> New Project
      </Button>
      <Button size="sm" variant="ghost" className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 h-7 text-xs px-2" onClick={() => setFlagModalOpen(true)}>
        <Flag className="w-3.5 h-3.5 mr-1" /> Flag
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setShowArchiveDialog(true)}>
        <Archive className="w-3.5 h-3.5 mr-1" /> Archive
      </Button>
    </>
  );

  const statusSlot = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <FlagIndicator entityType="client" entityId={clientId} />
      <EditableStatusBadge status={client.status as 'prospect' | 'active' | 'archived' | 'past' | undefined} onStatusChange={handleStatusChange} />
      <EditableClientTypeBadge type={client.type} onTypeChange={handleTypeChange} customTypes={customTypes} onAddCustomType={() => {}} />
    </div>
  );
```

- [ ] **Step 6: Replace the whole returned tree (current lines 227–596) with the scaffold**

Keep the three modals + `RestorationBanner` exactly as they were — they move into the `banner` slot (RestorationBanner) and after `</EntityDetailScaffold>` (modals).

```tsx
  return (
    <>
      <EntityDetailScaffold
        entityType="client"
        breadcrumbs={[
          { label: 'Clients', type: 'client', onClick: () => router.push('/clients') },
          { label: client.name, type: 'client' },
        ]}
        icon={<Building2 className="w-[18px] h-[18px]" />}
        title={client.name}
        status={statusSlot}
        actions={actions}
        kpis={kpis}
        tabs={scaffoldTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        banner={client.isDeleted ? (
          <RestorationBanner
            entityType="client"
            entityName={client.name}
            entityId={clientId}
            deletedAt={client.deletedAt}
            onRestored={() => {}}
            onPermanentlyDeleted={() => router.push('/clients')}
          />
        ) : undefined}
        aside={<ClientDetailAside client={client} primaryCompany={primaryCompany} counts={{ projects: projects.length, documents: documents.length, contacts: contacts.length, meetings: meetingsCount }} />}
      >
        {activeTab === 'overview' && (
          <ClientOverviewTab client={client} clientId={clientId} documents={documents} projects={projects} contacts={contacts} onOpenSettings={() => { setSettingsDefaultTab('general'); setShowSettingsPanel(true); }} onTabChange={handleTabChange} />
        )}
        {activeTab === 'intelligence' && (
          <div className="space-y-6">
            <ClientBeauhurstCards clientId={clientId} />
            <ClientIntelligenceTab clientId={clientId} clientName={client.name} clientType={client.type} projects={projects} />
          </div>
        )}
        {activeTab === 'deals' && <ClientDealsTab clientId={clientId} />}
        {activeTab === 'activity' && <ClientActivityTab clientId={clientId} />}
        {activeTab === 'documents' && <ClientDocumentLibrary clientId={clientId} clientName={client.name} clientType={client.type} />}
        {activeTab === 'checklist' && <ClientKnowledgeTab clientId={clientId} clientName={client.name} clientType={client.type} projects={projects} />}
        {activeTab === 'notes' && <ClientNotesTab clientId={clientId} clientName={client.name} />}
        {activeTab === 'meetings' && <ClientMeetingsTab clientId={clientId} clientName={client.name} />}
        {activeTab === 'tasks' && <ClientTasksTab clientId={clientId} clientName={client.name} />}
        {activeTab === 'data' && <ClientDataTab clientId={clientId} clientName={client.name} />}
        {activeTab === 'threads' && <ClientThreadsTab clientId={clientId} />}
        {activeTab === 'projects' && <ClientProjectsTab clientId={clientId} clientName={client.name} projects={projects} />}
        {activeTab === 'contacts' && <ClientContactsTab clientId={clientId} clientName={client.name} contacts={contacts} />}
        {activeTab === 'communications' && <ClientCommunicationsTab clientId={clientId} communications={communications} documents={documents} />}
      </EntityDetailScaffold>

      {/* Archive Dialog — preserved from original */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Client?</AlertDialogTitle>
            <AlertDialogDescription>This will archive the client. You can restore them later by changing their status.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveClient}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ClientSettingsPanel isOpen={showSettingsPanel} onClose={() => setShowSettingsPanel(false)} clientId={clientId} defaultTab={settingsDefaultTab} onTrash={() => router.push('/clients')} />

      <FlagCreationModal isOpen={flagModalOpen} onClose={() => setFlagModalOpen(false)} entityType="client" entityId={clientId} entityName={client.name} clientId={clientId} />
    </>
  );
```

- [ ] **Step 7: Remove now-unused imports**

Remove imports only used by the old layout: `Tabs, TabsContent, TabsList, TabsTrigger`, `CompactMetricCard`, `ArrowLeft`, `TrendingUp`, `Mail`, `Phone`, and any lucide icons no longer referenced (verify each with grep before removing). Keep icons still used in `actions`/tabs (`Settings`, `Plus`, `Flag`, `Archive`, `Building2`, and the tab-array icons — note: the `tabs` array still defines `icon` fields; either keep those imports or drop `icon` from the array since `TabStrip` ignores it. Simplest: keep the array as-is and leave its icon imports).

- [ ] **Step 8: Type check**

Run: `npx tsc --noEmit`
Expected: no errors. Fix any unused-import or type errors surfaced.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(desktop)/clients/[clientId]/page.tsx"
git commit -m "[clients] migrate client profile to EntityDetailScaffold"
```

> **Phase 3 gate:** `npm run build` passes. Operator confirms: header (accent + breadcrumbs + green tile + status/type badges + KPI row), tab strip switches tabs, `?tab=` deep-link still works, aside shows metadata + HubSpot, all three modals open, archive/flag/settings still function.

---

# Phase 4 — Light token pass: 14 client tabs

### Task 4.1: Enumerate hardcoded color classes across client tabs

**Files:**
- Read only: `src/app/(desktop)/clients/[clientId]/components/*.tsx`

- [ ] **Step 1: List the offenders**

Run:
```bash
grep -rn "bg-\(blue\|green\|purple\|amber\|yellow\|red\|emerald\|indigo\)-[0-9]\|text-\(blue\|green\|purple\|amber\|yellow\|red\|emerald\|indigo\)-[0-9]\|border-l-[a-z]*-[0-9]" "src/app/(desktop)/clients/[clientId]/components/"
```
Expected: a list of files + lines using hardcoded accent colors. This is the Phase 4 work queue.

No commit (read-only).

---

### Task 4.2: Apply the light-pass recipe to each client tab

**The recipe (mechanical, applied per file):**

1. Leave **structural** Tailwind (layout/spacing/flex/grid) and shadcn components untouched — shadcn now themes via the aligned CSS vars (Task 1.10).
2. Swap **hardcoded accent color classes** to their token-semantic equivalent so they read against the new surfaces. Mapping:
   - status/positive greens (`text-green-600`, `bg-green-100`) → keep green but prefer the entity/semantic intent; if it's a client/active signal leave green, if it's decorative reduce to `text-muted-foreground`.
   - info blues used as generic accents (`text-blue-500`, `border-l-blue-500`) → `text-foreground`/`border-border` unless the blue is semantic (links → keep).
   - greys (`text-gray-500`, `bg-gray-50`, `border-gray-200`) → shadcn-token equivalents (`text-muted-foreground`, `bg-muted`, `border-border`).
3. Replace any literal spinner (`animate-spin … border-b-2`) with `<SkeletonText/>` from `@/components/layouts`.
4. Replace any inline status badge that duplicates client status with `<StatusPill label tone={clientStatusTone(...)} />`.
5. Do NOT restructure layout, extract components, or apply the granularity rule — those are the deferred per-tab passes.

**Files (one checkbox each — apply the recipe, then `npx tsc --noEmit`, then a single commit at the end):**

- [ ] `ClientOverviewTab.tsx`
- [ ] `ClientDealsTab.tsx`
- [ ] `ClientActivityTab.tsx`
- [ ] `ClientDocumentLibrary.tsx` — **also** check it does not rely on a fixed-height parent (it used `overflow-hidden`); if content collapses in natural flow, add `min-height` or its own `max-height` scroll. Verify visually.
- [ ] `ClientProjectsTab.tsx`
- [ ] `ClientContactsTab.tsx`
- [ ] `ClientTasksTab.tsx`
- [ ] `ClientThreadsTab.tsx`
- [ ] `ClientCommunicationsTab.tsx`
- [ ] `ClientMeetingsTab.tsx`
- [ ] `ClientDataTab.tsx`
- [ ] `ClientKnowledgeTab.tsx` (+ `KnowledgeChecklistPanel.tsx`)
- [ ] `ClientNotesTab.tsx`
- [ ] `ClientBeauhurstCards.tsx`

- [ ] **Final step: type check, build, commit**

Run: `npx tsc --noEmit` then `npm run build`
Expected: both pass.

```bash
git add "src/app/(desktop)/clients/[clientId]/components/"
git commit -m "[clients] light token pass on client profile tabs"
```

> **Phase 4 gate:** `npm run build` passes. Operator scans each tab for color clashes / collapsed-height layouts and reports issues; fix inline.

---

# Phase 5 — Project profile shell (indigo)

### Task 5.1: Build `ProjectDetailAside`

**Files:**
- Create: `src/app/(desktop)/clients/[clientId]/projects/[projectId]/components/ProjectDetailAside.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useColors } from "@/lib/useColors";
import { Section, Row, StatusPill, projectStatusTone } from "@/components/layouts";

export function ProjectDetailAside({
  project,
  client,
  counts,
}: {
  project: any;
  client: any;
  counts: { documents: number; clients: number };
}) {
  const colors = useColors();
  const fmtGBP = (n?: number) =>
    n ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n) : "—";

  return (
    <div>
      <Section title="Project">
        <Row label="Status" value={project.status ?? "—"} pill={projectStatusTone(project.status, colors)} />
        {project.projectShortcode && <Row label="Shortcode" value={project.projectShortcode} mono />}
        {project.dealPhase && <Row label="Deal phase" value={project.dealPhase} />}
        <Row label="Client" value={client.name} />
      </Section>

      <Section title="Finance">
        <Row label="Loan amount" value={fmtGBP(project.loanAmount)} mono />
        {project.ltv !== undefined && <Row label="LTV" value={`${project.ltv}%`} mono />}
      </Section>

      <Section title="Counts">
        <Row label="Documents" value={counts.documents} mono />
        <Row label="Clients" value={counts.clients} mono />
      </Section>

      <Section title="Dates">
        <Row label="Created" value={new Date(project.createdAt).toLocaleDateString()} mono />
        {project.expectedCompletionDate && (
          <Row label="Due" value={new Date(project.expectedCompletionDate).toLocaleDateString()} mono />
        )}
      </Section>

      <div
        style={{
          marginTop: 28,
          paddingTop: 12,
          borderTop: `1px dashed ${colors.border.default}`,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 9,
          color: colors.text.dim,
          lineHeight: 1.6,
        }}
      >
        <div style={{ marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>Metadata</div>
        <div>convex: {project?._id?.slice(-12) ?? "—"}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add "src/app/(desktop)/clients/[clientId]/projects/[projectId]/components/ProjectDetailAside.tsx"
git commit -m "[projects] add ProjectDetailAside metadata panel"
```

---

### Task 5.2: Migrate the project profile to `EntityDetailScaffold` (indigo)

**Files:**
- Modify: `src/app/(desktop)/clients/[clientId]/projects/[projectId]/page.tsx`

**Preserve verbatim:** all hooks/queries/handlers (`client`, `project`, `documents`, `activeTasksCount`, `openFlagCount`, `clientRoles`, `updateProject`, `handleTabChange`, `handleArchiveProject`, `formatCurrency`, `lastActivity`, the `tabs` array) and the three modals (`AlertDialog`, `ProjectSettingsPanel`, `FlagCreationModal`) + `RestorationBanner`. **Drop** the purple `getStatusBadge` helper — status now renders via `StatusPill` + `projectStatusTone` (indigo accent on the tab strip comes from `entityType="project"`).

- [ ] **Step 1: Add imports**

```tsx
import { useColors } from '@/lib/useColors';
import { EntityDetailScaffold, StatusPill, projectStatusTone, type Kpi, type TabDef, SkeletonText } from '@/components/layouts';
import { ProjectDetailAside } from './components/ProjectDetailAside';
```

- [ ] **Step 2: Add `const colors = useColors();`** at the top of `ProjectDetailContent`.

- [ ] **Step 3: Replace loading branch (current lines 128–134)**

```tsx
  if (project === undefined || client === undefined) {
    return (<div style={{ padding: 24 }}><SkeletonText lines={2} /></div>);
  }
```

- [ ] **Step 4: Replace not-found branch (current lines 137–151)**

```tsx
  if (!project || !client) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, padding: 48, textAlign: 'center', color: colors.text.muted }}>
          <p style={{ marginBottom: 12 }}>Project not found.</p>
          <Link href={`/clients/${clientId}`} style={{ color: colors.accent.blue, textDecoration: 'underline' }}>Back to Client</Link>
        </div>
      </div>
    );
  }
```

- [ ] **Step 5: Build scaffold inputs before `return (`**

```tsx
  const scaffoldTabs: TabDef[] = tabs.map((t) => ({ id: t.id, label: t.label, count: t.count }));

  const kpis: Kpi[] = [
    { label: 'Loan', value: project.loanAmount ? (formatCurrency(project.loanAmount) || '—') : '—', accent: colors.accent.green },
    { label: 'Documents', value: documents.length, accent: colors.entityTypes.project },
    { label: 'Clients', value: clientRoles.length || 1, accent: colors.entityTypes.client },
    { label: 'Last activity', value: lastActivity ? lastActivity.toLocaleDateString() : '—', accent: colors.entityTypes.skillRun },
    { label: 'Created', value: new Date(project.createdAt).toLocaleDateString(), accent: colors.entityTypes.cadence },
  ];

  const actions = (
    <>
      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setSettingsDefaultTab('general'); setShowSettingsPanel(true); }}>
        <Settings className="w-3.5 h-3.5 mr-1" /> Settings
      </Button>
      <Button size="sm" variant="ghost" className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 h-7 text-xs px-2" onClick={() => setFlagModalOpen(true)}>
        <Flag className="w-3.5 h-3.5 mr-1" /> Flag
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setShowArchiveDialog(true)}>
        <Archive className="w-3.5 h-3.5 mr-1" /> Archive
      </Button>
    </>
  );

  const statusSlot = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <FlagIndicator entityType="project" entityId={projectId} />
      <StatusPill label={project.status ?? 'unknown'} tone={projectStatusTone(project.status, colors)} />
      {project.projectShortcode && (
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: colors.text.muted }}>{project.projectShortcode}</span>
      )}
    </div>
  );
```

- [ ] **Step 6: Replace the returned tree (current lines 180–463) with the scaffold**

```tsx
  return (
    <>
      <EntityDetailScaffold
        entityType="project"
        breadcrumbs={[
          { label: 'Clients', type: 'client', onClick: () => router.push('/clients') },
          { label: client.name, type: 'client', onClick: () => router.push(`/clients/${clientId}`) },
          { label: project.name, type: 'project' },
        ]}
        icon={<Briefcase className="w-[18px] h-[18px]" />}
        title={project.name}
        status={statusSlot}
        actions={actions}
        kpis={kpis}
        tabs={scaffoldTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        banner={project.isDeleted ? (
          <RestorationBanner
            entityType="project"
            entityName={project.name}
            entityId={projectId}
            deletedAt={project.deletedAt}
            onRestored={() => {}}
            onPermanentlyDeleted={() => router.push(`/clients/${clientId}?tab=projects`)}
          />
        ) : undefined}
        aside={<ProjectDetailAside project={project} client={client} counts={{ documents: documents.length, clients: clientRoles.length || 1 }} />}
      >
        {activeTab === 'overview' && (
          <ProjectOverviewTab project={project} projectId={projectId} clientId={clientId} client={client} documents={documents} clientRoles={clientRoles} onOpenSettings={() => { setSettingsDefaultTab('general'); setShowSettingsPanel(true); }} onTabChange={handleTabChange} />
        )}
        {activeTab === 'documents' && <ProjectDocumentsTab projectId={projectId} clientId={clientId} clientName={client.name} clientType={client.type} />}
        {activeTab === 'checklist' && <ProjectKnowledgeTab projectId={projectId} projectName={project.name} clientId={clientId} clientName={client.name} clientType={client.type} dealPhase={project.dealPhase} />}
        {activeTab === 'notes' && <ProjectNotesTab projectId={projectId} projectName={project.name} clientId={clientId} />}
        {activeTab === 'tasks' && <ProjectTasksTab projectId={projectId} projectName={project.name} clientId={clientId} />}
        {activeTab === 'threads' && <ProjectThreadsTab projectId={projectId} clientId={clientId} />}
        {activeTab === 'intelligence' && <ProjectIntelligenceTab projectId={projectId} />}
        {activeTab === 'data' && <ProjectDataTab projectId={projectId} projectName={project.name} />}
      </EntityDetailScaffold>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Project?</AlertDialogTitle>
            <AlertDialogDescription>This will archive the project. You can restore it later by changing its status.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveProject}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProjectSettingsPanel isOpen={showSettingsPanel} onClose={() => setShowSettingsPanel(false)} projectId={projectId} clientId={clientId} defaultTab={settingsDefaultTab} onTrash={() => router.push(`/clients/${clientId}?tab=projects`)} />

      <FlagCreationModal isOpen={flagModalOpen} onClose={() => setFlagModalOpen(false)} entityType="project" entityId={projectId} entityName={project.name} entityContext={client.name} clientId={clientId} projectId={projectId} />
    </>
  );
```

- [ ] **Step 7: Remove now-unused imports** (`Tabs/TabsContent/TabsList/TabsTrigger`, `CompactMetricCard`, `ArrowLeft`, `Badge` if no longer used, `getStatusBadge`'s former icons). Verify each with grep before deleting.

- [ ] **Step 8: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(desktop)/clients/[clientId]/projects/[projectId]/page.tsx"
git commit -m "[projects] migrate project profile to EntityDetailScaffold (purple->indigo)"
```

> **Phase 5 gate:** `npm run build` passes. Operator confirms project page: indigo accent/tab indicator, breadcrumb chain `Clients › {client} › {project}` (first two clickable), KPI row, aside, modals all functional.

---

# Phase 6 — Light token pass: 8 project tabs

### Task 6.1: Enumerate + apply recipe to project tabs

**Files:**
- `src/app/(desktop)/clients/[clientId]/projects/[projectId]/components/*.tsx`

- [ ] **Step 1: Enumerate**

Run:
```bash
grep -rn "bg-\(blue\|green\|purple\|amber\|yellow\|red\|emerald\|indigo\)-[0-9]\|text-\(blue\|green\|purple\|amber\|yellow\|red\|emerald\|indigo\)-[0-9]" "src/app/(desktop)/clients/[clientId]/projects/[projectId]/components/"
```
Expected: the project-tab work queue. **Note:** swap any `purple` project-accent usages to indigo equivalents (`text-indigo-600`, etc.) to match the canon.

- [ ] **Step 2: Apply the Phase 4 recipe to each file:**

- [ ] `ProjectOverviewTab.tsx`
- [ ] `ProjectDocumentsTab.tsx`
- [ ] `ProjectKnowledgeTab.tsx`
- [ ] `ProjectNotesTab.tsx`
- [ ] `ProjectTasksTab.tsx`
- [ ] `ProjectThreadsTab.tsx`
- [ ] `ProjectDataTab.tsx`
- [ ] (IntelligenceTab is shared `@/components/IntelligenceTab` — only touch if it has hardcoded purple project accents; verify first.)

- [ ] **Step 3: Type check, build, commit**

Run: `npx tsc --noEmit` then `npm run build`
Expected: both pass.

```bash
git add "src/app/(desktop)/clients/[clientId]/projects/[projectId]/components/"
git commit -m "[projects] light token pass on project profile tabs"
```

> **Phase 6 gate:** `npm run build` passes. Operator scans project tabs for clashes / collapsed layouts.

---

# Phase 7 — Final verification & ship

### Task 7.1: Full build + visual sweep + push

- [ ] **Step 1: Clean type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass with no errors.

- [ ] **Step 2: Run the unit suite**

Run: `npm run test:run`
Expected: PASS (including `entityStatus`).

- [ ] **Step 3: Operator visual check (handoff — do not drive the browser)**

State to the operator: "Launch the dev server (`npm run dev`) and verify: `/clients` table + filters; open a client (header/KPIs/tabs/aside/modals); switch tabs incl. `?tab=` deep-link; light + dark mode via the theme toggle; drill into a project (indigo, breadcrumb chain)." Wait for the operator's confirmation or issue list; fix issues inline.

- [ ] **Step 4: Push**

```bash
git push
```

> **Done when:** build is green, unit tests pass, the operator confirms the clients + project pages render on-canon in both themes, and the branch is pushed.

---

## Self-review (performed against the spec)

- **Spec coverage:** shared layer (§4) → Phase 1; list page (§5.1) → Phase 2; client profile (§5.2) → Phase 3; project profile (§5.3) → Phase 5; light pass + shadcn alignment + states (§6) → Tasks 1.7, 1.10, 4, 6; file map (§7) → matches; verification (§9) → Phase 7; prospects untouched (decision 6) → no prospects file is modified.
- **Deliberate spec deviations (flagged):** (1) list-page virtualization deferred per YAGNI (Task 2.2) with a re-introduction path; (2) client KPI "open deal value" replaced with "Meetings" to avoid a new aggregate query (Task 3.2) — deal value can be swapped in later.
- **Type consistency:** `EntityType`, `Crumb`, `Kpi`, `TabDef` are defined in Phase 1 and consumed unchanged in Phases 2/3/5; `clientStatusTone`/`projectStatusTone` signatures `(status, colors)` are used consistently; scaffold prop names (`entityType`, `breadcrumbs`, `icon`, `title`, `status`, `actions`, `kpis`, `tabs`, `activeTab`, `onTabChange`, `banner`, `aside`, `children`) match every call site.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code; the two read-only enumeration tasks (2.1, 4.1) are inventory steps feeding concrete recipes, not deferred work.
