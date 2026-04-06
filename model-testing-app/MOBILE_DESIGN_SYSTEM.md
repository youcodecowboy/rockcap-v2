# Mobile Design System

## Aesthetic: Utilitarian Financial Utility

White-base, information-dense, zero decoration that doesn't serve function. Every pixel earns its place. The mobile app is a companion tool for property finance professionals in the field — it should feel like a precision instrument, not a consumer app.

### Principles

1. **Information first** — Layout serves data density, not visual flair
2. **Weight-driven hierarchy** — Use font weight and size to create hierarchy, not color
3. **Surgical accents** — Blue is reserved for primary CTAs only. Navigation uses dark neutrals
4. **No decoration** — No emojis, no gradients, no colored shadows, no rounded pill buttons
5. **Token-driven** — All values reference CSS custom properties from `globals.css`

---

## Design Tokens

All mobile tokens are CSS custom properties prefixed with `--m-` defined in `src/app/globals.css`.

### Surfaces

| Token | Value | Usage |
|-------|-------|-------|
| `--m-bg` | `#ffffff` | Primary background, cards, header, footer |
| `--m-bg-subtle` | `#f8fafc` | Section backgrounds, active nav items |
| `--m-bg-inset` | `#f1f5f9` | Inset areas, input fields, icon containers |

### Text

| Token | Value | Usage |
|-------|-------|-------|
| `--m-text-primary` | `#0f172a` | Headings, active navigation, primary content |
| `--m-text-secondary` | `#475569` | Body text, inactive nav drawer items |
| `--m-text-tertiary` | `#94a3b8` | Metadata, timestamps, inactive footer items |
| `--m-text-placeholder` | `#cbd5e1` | Input placeholders, disabled text |

### Borders

| Token | Value | Usage |
|-------|-------|-------|
| `--m-border` | `#e2e8f0` | Standard borders (header, footer, dividers) |
| `--m-border-subtle` | `#f1f5f9` | Very subtle dividers between list items |

### Accents (use sparingly)

| Token | Value | Usage |
|-------|-------|-------|
| `--m-accent` | `#1e40af` | Primary CTAs only (chat FAB, send button) |
| `--m-accent-hover` | `#1e3a8a` | CTA hover/active state |
| `--m-accent-subtle` | `#eff6ff` | Subtle active backgrounds (rare) |
| `--m-accent-indicator` | `#3b82f6` | Active tab underline indicator |

### Status (functional only)

| Token | Value | Usage |
|-------|-------|-------|
| `--m-success` | `#059669` | Success states, positive trends |
| `--m-warning` | `#d97706` | Warning states, pending items |
| `--m-error` | `#dc2626` | Error states, destructive actions |

### Layout Heights

| Token | Value | Usage |
|-------|-------|-------|
| `--m-header-h` | `3rem` (48px) | Header bar |
| `--m-tab-bar-h` | `2.25rem` (36px) | Tab bar (hidden when 1 tab) |
| `--m-footer-h` | `3.25rem` (52px) | Bottom navigation bar |

### Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--m-page-px` | `1rem` | Horizontal page padding |
| `--m-section-gap` | `1.25rem` | Gap between page sections |
| `--m-card-p` | `0.875rem` | Card internal padding |
| `--m-item-gap` | `0.5rem` | Gap between list items |

---

## Typography

Font: **Geist Sans** (inherited from root layout) — clean, functional, good at small sizes.

Logo: **Helvetica Neue** — brand consistency with desktop.

### Scale

| Element | Size | Weight | Tracking | Token reference |
|---------|------|--------|----------|-----------------|
| Page title | `15px` | `font-medium` (500) | Normal | `--m-text-primary` |
| Section header | `13px` | `font-medium` (500) | Normal | `--m-text-primary` |
| Body text | `13px` | `font-normal` (400) | Normal | `--m-text-secondary` |
| Metadata / labels | `11px` | `font-normal` (400) | Normal | `--m-text-tertiary` |
| Tab labels | `11px` | `font-medium` when active | Normal | `--m-text-primary` / `--m-text-tertiary` |
| Footer labels | `9px` | `font-medium` when active | `tracking-wide` + uppercase | `--m-text-primary` / `--m-text-tertiary` |

### Rules

- **No text larger than 18px** on mobile (logo excluded)
- **No emoji** anywhere in the UI — use Lucide icons
- **No `font-bold`** (700) — maximum is `font-semibold` (600), prefer `font-medium` (500)
- **No colored text** for hierarchy — use weight and the text token scale instead

---

## Icons

Library: **Lucide React** (consistent with desktop)

### Sizing

| Context | Size | Example |
|---------|------|---------|
| Header actions | `18px` | Menu, Search |
| Navigation items | `16px` | Drawer nav items |
| Footer nav | `18px` | Bottom bar icons |
| Inline/small | `14px` | Close buttons, secondary actions |
| Chat FAB | `18px` | MessageCircle in footer |

### Rules

- Always use `flex-shrink-0` on icons in flex layouts
- Navigation icons are `--m-text-tertiary` (inactive) or `--m-text-primary` (active)
- Never use colored icons in navigation — color is reserved for status indicators and CTAs

---

## Component Patterns

### Navigation Active States

**Footer nav:**
- Active: `text-[var(--m-text-primary)] font-medium`
- Inactive: `text-[var(--m-text-tertiary)]`
- No background change. No colored indicators. Weight + darkness = active.

**Nav drawer:**
- Active: `text-[var(--m-text-primary)] font-medium bg-[var(--m-bg-subtle)]`
- Inactive: `text-[var(--m-text-secondary)]`
- Subtle background fill, no borders, no colored indicators.

**Tab bar:**
- Active: `text-[var(--m-text-primary)] font-medium` + 1.5px bottom bar in `--m-accent-indicator`
- Inactive: `text-[var(--m-text-tertiary)]`
- The underline indicator is the only place blue appears in navigation.

### Cards (for future page content)

```
bg-[var(--m-bg)]
border border-[var(--m-border)]
rounded-lg
p-[var(--m-card-p)]
```

No shadows. Border only. Let the content speak.

### List Items

```
px-[var(--m-page-px)]
py-2.5
border-b border-[var(--m-border-subtle)]
```

Subtle bottom borders between items. No gaps, no cards — dense stacked layout for lists.

### Section Headers (on content pages)

```
px-[var(--m-page-px)]
py-2
text-[11px]
font-medium
uppercase
tracking-wider
text-[var(--m-text-tertiary)]
bg-[var(--m-bg-subtle)]
```

iOS-style sticky section headers. Uppercase, tiny, muted.

### Buttons

| Variant | Classes |
|---------|---------|
| Primary (rare) | `bg-[var(--m-accent)] text-white rounded-lg px-3 py-2 text-[13px] font-medium` |
| Secondary | `bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)] rounded-lg px-3 py-2 text-[13px]` |
| Ghost | `text-[var(--m-text-secondary)] px-2 py-1.5 text-[13px]` |

Primary buttons are rare — most actions are ghost or secondary.

### Empty States

```
<div class="flex flex-col items-center justify-center min-h-[60vh] px-[var(--m-page-px)]">
  <div class="w-10 h-10 rounded-lg bg-[var(--m-bg-inset)] flex items-center justify-center mb-3">
    <Icon class="w-5 h-5 text-[var(--m-text-tertiary)]" />
  </div>
  <h1 class="text-[15px] font-medium text-[var(--m-text-primary)] mb-1">Title</h1>
  <p class="text-[12px] text-[var(--m-text-tertiary)] text-center">Description</p>
</div>
```

---

## Layout Architecture

### Shell Structure

```
┌─────────────────────────┐
│ MobileHeader (48px)     │  fixed top, z-40
├─────────────────────────┤
│ TabManager (36px)       │  visible only when >1 tab
├─────────────────────────┤
│                         │
│   Content Area          │  scrollable, full remaining height
│                         │
├─────────────────────────┤
│ StickyFooter (52px)     │  fixed bottom, z-30
└─────────────────────────┘
```

### Z-Index Scale

| Layer | Z-Index | Component |
|-------|---------|-----------|
| Page content | 0 | Main content area |
| Footer | 30 | StickyFooter |
| Header | 40 | MobileHeader |
| Overlays | 50 | NavDrawer, ChatOverlay |

### Safe Areas

- Footer includes `pb-[env(safe-area-inset-bottom)]` for notched devices
- Chat input uses `pb-[max(0.625rem,env(safe-area-inset-bottom))]`
- Content area padding-bottom accounts for footer height + safe area

---

## Anti-Patterns (never do these)

- **No emojis** — anywhere, ever. Use Lucide icons.
- **No colored shadows** — `shadow-blue-600/30` etc. Use `shadow-md` or `shadow-sm` (neutral only).
- **No gradient backgrounds** — solid colors from the token palette.
- **No rounded-full pills** for navigation — use underline indicators or subtle bg fills.
- **No blue/colored active states** in navigation — use dark neutrals (`--m-text-primary`).
- **No `text-xl`+** for mobile content text — keep everything compact.
- **No "coming soon"** in placeholder text — state what the page does, not that it's unfinished.
- **No decorative elements** — if it doesn't convey information, remove it.
