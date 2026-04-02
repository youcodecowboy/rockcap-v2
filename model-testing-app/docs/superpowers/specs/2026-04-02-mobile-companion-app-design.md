# Mobile Companion App — Design Spec

## Overview

A read-first, chat-centric mobile companion to the RockCap desktop application. Not a responsive version of the desktop — a purpose-built mobile experience that shares the same backend, data, and deployment. Designed for a user who is constantly on the move doing site visits and needs to access data, reference documents, and use the AI chat assistant in the field.

## Architecture: Separate Route Group + Middleware

Single Next.js app, single Vercel deployment. Mobile pages live in a dedicated route group alongside the existing desktop routes.

### Routing

- `m.rockcap.app` subdomain added as a Vercel domain alias (zero infra work)
- `middleware.ts` detects subdomain (`m.rockcap.app`) and rewrites requests to `(mobile)` route group
- Automatic mobile user-agent detection on the main domain redirects to `m.rockcap.app`
- Next.js route groups `(desktop)` and `(mobile)` don't appear in the URL — clean paths for both platforms
- Mobile routes use `m-` prefix internally to avoid collision (e.g., `(mobile)/m-dashboard/page.tsx` serves as `/`)

### Project Structure

```
src/
├── app/
│   ├── (desktop)/              # existing pages move here
│   │   ├── layout.tsx          # existing Sidebar + NavigationBar layout
│   │   ├── clients/
│   │   ├── modeling/
│   │   └── ...
│   ├── (mobile)/               # new mobile route group
│   │   ├── layout.tsx          # MobileShell layout
│   │   ├── m-dashboard/
│   │   ├── m-clients/
│   │   ├── m-docs/
│   │   ├── m-tasks/
│   │   ├── m-notes/
│   │   ├── m-contacts/
│   │   └── m-chat/
│   ├── layout.tsx              # root layout (providers, fonts — unchanged)
│   └── api/                    # shared API routes (unchanged)
├── components/
│   ├── ui/                     # tier 1: shared primitives (existing shadcn — unchanged)
│   ├── shared/                 # tier 2: composite components used by both platforms
│   ├── desktop/                # tier 3: desktop-specific components
│   └── mobile/                 # tier 3: mobile-specific components
│       ├── MobileShell.tsx
│       ├── MobileHeader.tsx
│       ├── TabManager.tsx
│       ├── StickyFooter.tsx
│       └── ChatOverlay.tsx
├── hooks/                      # shared hooks (unchanged)
├── lib/                        # shared business logic (unchanged)
└── middleware.ts               # enhanced: subdomain detection + route rewriting
```

### Component Library Tiers

| Tier | Location | Purpose | Examples |
|------|----------|---------|----------|
| 1 — Primitives | `components/ui/` | Shared shadcn/Radix components | Button, Card, Dialog, Input |
| 2 — Shared Composites | `components/shared/` | Business components used by both platforms | ClientCard, DocumentViewer, TaskItem |
| 3 — Platform-Specific | `components/mobile/` or `components/desktop/` | Platform-only components | MobileShell, TabManager, Sidebar |

Existing desktop components that are not platform-specific stay in `components/` root. Components only move to `shared/` or `desktop/` when there's a reason to — no premature reorganization.

## Mobile Shell — Two-Layer Architecture

### Layer 1: Content Shell

The persistent shell wrapping all mobile content:

**MobileHeader**
- Hamburger menu (opens full navigation drawer)
- RockCap logo/title
- Global search trigger
- User avatar

**TabManager (Tab Bar)**
- Sits below the header
- Shows open tabs as horizontally scrollable pills
- Active tab highlighted (blue), inactive tabs muted
- Arrow buttons (‹ ›) on the right for quick sequential flipping
- Overflow shows "+N" badge; tapping opens a grid view of all tabs
- Tab state managed via React context (`TabContext`)

**Content Area**
- Renders the active tab's page content
- Full remaining viewport height

**StickyFooter**
- Fixed at bottom: Home, Clients, **Chat FAB (elevated, centered)**, Docs, Tasks
- Chat button is a raised circle that breaks the footer line — primary action
- Active nav item highlighted

### Layer 2: Chat Overlay

The chat lives on top of everything:

- **Activation**: Tap the chat FAB in the sticky footer
- **Appearance**: Slides up from bottom, covers ~85% of screen with rounded top corners
- **Background**: Tabs and header visible but dimmed behind the overlay — user knows their content is preserved
- **Context-aware**: Chat header shows the active tab's context (e.g., "Context: 42 High Street")
- **Dismissal**: Swipe down or tap ✕ — conversation preserved across open/close cycles
- **Tab integration**: Chat can open content in new tabs via tool calls (e.g., "Open that valuation report in a new tab")

### Tab System Mechanics

**Opening tabs:**
- Navigate to a client/doc/page → opens in current tab (replaces content)
- "Open in new tab" action → creates background tab
- Chat tool calls can open new tabs programmatically
- Long-press any link → context menu with "Open in new tab"

**Managing tabs:**
- Arrow buttons to flip through sequentially
- Horizontal swipe on tab bar to browse all tabs
- Swipe down on a tab pill to close it
- +N overflow badge → tap for grid view of all open tabs

**State:**
- `TabContext` provider: array of `{ id, type, title, route, params, scrollPosition }`
- In-memory only for Phase 1; sessionStorage persistence added in a later phase once the tab system is validated
- Reasonable limit (e.g., 12 tabs) with oldest auto-closed on overflow

## Mobile Pages — Feature Scope

### In scope (Phase 1 = placeholder shells, built out individually later)

| Page | Mobile Depth | Notes |
|------|-------------|-------|
| Dashboard | Recency-based | Last client, last project, pending tasks, recent notes |
| Clients & Projects | Read-focused profiles | View client details, project info, documents |
| Documents | View + upload | Open docs in tabs, queue uploads (photos from camera). Classification queued but filing is desktop-only |
| Client Intelligence | AI summaries | Read-only consumption of intelligence data |
| Notes | View + light create/edit | Simplified editor (no full TipTap), quick capture |
| Tasks | View + light create/edit | Task list, create tasks, mark complete |
| Contacts/Rolodex | Light + enhanced | Click-to-call, click-to-email — mobile-native enhancements |
| Prospects/Deals | Read-only dashboard | Light overview, no deep CRM editing |
| Chat | Full power | All tool calls, summaries, agentic actions |
| Global Search | Full | Port existing search to mobile layout |

### Desktop-only (not on mobile)

| Feature | Reason |
|---------|--------|
| Modeling / Excel workbook editor | Too complex for mobile (HyperFormula, Handsontable) |
| Document filing / organization | Heavy classification workflow — desktop |
| Calendar (react-big-calendar) | Not suitable for mobile form factor |
| Settings / Templates | Admin tasks, desktop |
| Bulk operations | Desktop workflow |

### Mobile-specific features (not on desktop)

| Feature | Reason |
|---------|--------|
| Click-to-call from contacts | Phone-native capability |
| Click-to-email from contacts | Direct mail client integration |
| Camera photo upload queue | Site visit photo capture |

## Phase 1 Scope — Shell & Scaffolding

Phase 1 delivers the infrastructure. No page content — just the working skeleton.

### Deliverables

1. **Route group restructure** — Move existing pages into `(desktop)/` route group. Create `(mobile)/` route group.
2. **Middleware** — Subdomain detection (`m.rockcap.app`) with rewrite to `(mobile)` routes. Mobile user-agent detection on main domain redirects to subdomain.
3. **Component directories** — Create `components/mobile/`, `components/shared/`, `components/desktop/` directories.
4. **MobileShell layout** — `(mobile)/layout.tsx` rendering the full shell:
   - `MobileHeader` (hamburger, logo, search placeholder, avatar)
   - `TabManager` (tab bar with state, arrow nav, overflow)
   - Content area (children)
   - `StickyFooter` (5-item nav with chat FAB)
   - `ChatOverlay` (slide-up sheet, UI only — no API wiring)
5. **TabContext** — React context for tab state management (open, close, switch, reorder)
6. **Placeholder pages** — Simple shells for each mobile route showing page title and "Coming soon" so navigation works end-to-end: dashboard, clients, docs, tasks, notes, contacts
7. **Styling** — Mobile-specific globals/tokens if needed alongside existing theme

### Not in Phase 1

- Actual page content (per-feature work in subsequent phases)
- Chat API integration (shell only)
- Photo upload queuing
- Global search integration (search trigger in header, but no functionality)
- Click-to-call enhancements
- Tab persistence to sessionStorage (can add when tab system is validated)

## Technical Considerations

### Middleware Strategy

```typescript
// middleware.ts — conceptual shape
export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const isMobileSubdomain = hostname.startsWith('m.')
  const isMobileUA = isMobileUserAgent(request.headers.get('user-agent'))

  if (isMobileSubdomain) {
    // Rewrite to (mobile) route group
    return rewriteToMobile(request)
  }

  if (isMobileUA && !hostname.startsWith('m.')) {
    // Redirect to m.rockcap.app
    return redirectToMobileSubdomain(request)
  }

  // Desktop — no rewrite needed, (desktop) group resolves normally
}
```

### Moving Existing Pages to (desktop)/

This is a file move, not a rewrite. Next.js route groups in parentheses are purely organizational — `(desktop)/clients/page.tsx` still serves `/clients`. No URLs change, no links break. The root layout stays at `app/layout.tsx`.

**Migration rules (to avoid breaking existing code):**

1. **Move ALL desktop pages together** — clients, tasks, docs, calendar, inbox, projects, modeling, etc. must move as a cohesive group into `(desktop)/`. Selective moves risk breaking cross-page imports.

2. **Root page.tsx (Dashboard)** — moves into `(desktop)/` like everything else. The middleware handles routing: desktop requests to `/` resolve to `(desktop)/page.tsx`, mobile requests to `/` resolve to `(mobile)/m-dashboard/page.tsx`.

3. **Keep `api/` at root** — API routes stay at `src/app/api/` and are NOT moved into `(desktop)/`. Both platforms share them.

4. **Cross-imports from `@/app/` are safe** — Several components import from page-level component directories using the `@/app/` alias (e.g., `@/app/docs/components/FolderBrowser`). These resolve via `tsconfig.json` to `src/app/...` and will correctly resolve to `src/app/(desktop)/docs/components/FolderBrowser` after the move. No import path changes needed.

   Known cross-imports to verify after move:
   - `src/components/DocumentNotes.tsx` → imports from `@/app/docs/reader/[documentId]/components/`
   - `src/components/IntelligenceTab.tsx` → imports from `@/app/docs/components/`
   - `src/app/clients/[clientId]/components/ClientDocumentLibrary.tsx` → imports from `@/app/docs/components/`
   - `src/app/clients/[clientId]/projects/[projectId]/components/ProjectDocumentsTab.tsx` → imports from `@/app/docs/components/`

5. **Hardcoded routes (`href="/clients"`, `router.push("/tasks")`) are safe** — route groups are transparent to URLs. All existing navigation links continue to work without changes.

6. **Existing middleware.ts** — the project has a Clerk auth middleware at `src/middleware.ts` with route matchers for public routes and a config matcher. The mobile routing logic must wrap or integrate with the existing `clerkMiddleware()` call, not replace it. Both platforms need Clerk auth.

7. **Desktop layout** — the existing `Sidebar + NavigationBar` layout logic currently in `src/app/layout.tsx` needs to move to `src/app/(desktop)/layout.tsx`. The root `layout.tsx` keeps only the shared providers (Convex, Clerk, fonts, global CSS) that both platforms need.

**Post-move verification checklist:**
- [ ] `npx next build` passes
- [ ] All Sidebar navigation links work
- [ ] All `router.push()` calls in dashboard and pages work
- [ ] Cross-imports from `src/components/` to `@/app/(desktop)/docs/...` resolve
- [ ] API routes (`/api/*`) still accessible from both platforms

### Local Development

- Use `localhost:3000` for desktop
- Configure `/etc/hosts` or Next.js middleware to recognize `m.localhost:3000` as the mobile subdomain for local testing
- Alternatively, a `?mobile=true` query param override in middleware for quick testing

### Bundle Isolation

- Mobile and desktop route groups are separate Next.js entry points — tree-shaking ensures mobile doesn't load Handsontable, HyperFormula, react-big-calendar, etc.
- Shared components in `components/ui/` and `components/shared/` are imported by both but only bundled when used
- Heavy desktop dependencies (Handsontable, HyperFormula, TipTap with all extensions) stay in desktop-only imports
