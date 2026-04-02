# Mobile Companion App — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the mobile companion app infrastructure — route groups, middleware, mobile shell with tab system, chat overlay, and placeholder pages — without breaking any existing desktop functionality.

**Architecture:** Single Next.js app with `(desktop)` and `(mobile)` route groups. Middleware detects `m.rockcap.app` subdomain (or `?mobile=true` for local dev) and rewrites to mobile routes. Mobile shell has a two-layer architecture: content with tabs underneath, chat overlay on top.

**Tech Stack:** Next.js 16, Tailwind CSS 4, Radix UI/shadcn, Clerk auth, Convex, React Context for tab state.

**Spec:** `docs/superpowers/specs/2026-04-02-mobile-companion-app-design.md`

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `src/app/(desktop)/layout.tsx` | Desktop shell — Sidebar, NavigationBar, ChatAssistantButton, `ml-20 pt-16` wrapper |
| `src/app/(mobile)/layout.tsx` | Mobile shell — composes MobileHeader, TabManager, StickyFooter, ChatOverlay |
| `src/app/(mobile)/m-dashboard/page.tsx` | Mobile dashboard placeholder |
| `src/app/(mobile)/m-clients/page.tsx` | Mobile clients placeholder |
| `src/app/(mobile)/m-docs/page.tsx` | Mobile docs placeholder |
| `src/app/(mobile)/m-tasks/page.tsx` | Mobile tasks placeholder |
| `src/app/(mobile)/m-notes/page.tsx` | Mobile notes placeholder |
| `src/app/(mobile)/m-contacts/page.tsx` | Mobile contacts placeholder |
| `src/contexts/TabContext.tsx` | Tab state management — open, close, switch, reorder tabs |
| `src/components/mobile/MobileShell.tsx` | Outer mobile layout component (header + tabs + content + footer) |
| `src/components/mobile/MobileHeader.tsx` | Hamburger menu, logo, search placeholder, avatar |
| `src/components/mobile/TabManager.tsx` | Tab bar — scrollable pills, arrow nav, overflow badge |
| `src/components/mobile/StickyFooter.tsx` | Bottom nav — Home, Clients, Chat FAB, Docs, Tasks |
| `src/components/mobile/ChatOverlay.tsx` | Slide-up chat sheet (UI only, no API) |
| `src/components/mobile/MobileNavDrawer.tsx` | Full-screen nav drawer opened by hamburger |

### Modified files

| File | Change |
|------|--------|
| `src/app/layout.tsx` | Remove Sidebar, NavigationBar, ChatAssistantButton, `ml-20 pt-16` wrapper. Keep providers, fonts, globals.css, Toaster. |
| `src/middleware.ts` | Add mobile subdomain detection + route rewriting inside existing Clerk middleware. Add `?mobile=true` dev override. |

### Moved files (directory rename)

All existing page directories under `src/app/` move into `src/app/(desktop)/`:
- `src/app/page.tsx` → `src/app/(desktop)/page.tsx`
- `src/app/clients/` → `src/app/(desktop)/clients/`
- `src/app/tasks/` → `src/app/(desktop)/tasks/`
- `src/app/docs/` → `src/app/(desktop)/docs/`
- `src/app/calendar/` → `src/app/(desktop)/calendar/`
- `src/app/modeling/` → `src/app/(desktop)/modeling/`
- `src/app/notes/` → `src/app/(desktop)/notes/`
- `src/app/inbox/` → `src/app/(desktop)/inbox/`
- `src/app/filing/` → `src/app/(desktop)/filing/`
- `src/app/contacts/` → `src/app/(desktop)/contacts/`
- `src/app/rolodex/` → `src/app/(desktop)/rolodex/`
- `src/app/prospects/` → `src/app/(desktop)/prospects/`
- `src/app/deals/` → `src/app/(desktop)/deals/`
- `src/app/companies/` → `src/app/(desktop)/companies/`
- `src/app/settings/` → `src/app/(desktop)/settings/`
- `src/app/templates/` → `src/app/(desktop)/templates/`
- `src/app/library/` → `src/app/(desktop)/library/`
- `src/app/uploads/` → `src/app/(desktop)/uploads/`
- `src/app/projects/` → `src/app/(desktop)/projects/`
- `src/app/test/` → `src/app/(desktop)/test/`

**NOT moved:** `src/app/api/`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/favicon.ico`

---

## Task 1: Move Existing Pages into (desktop)/ Route Group

The most critical and risky task. A pure file move — no code changes to the moved files themselves.

**Files:**
- Move: All page directories listed above into `src/app/(desktop)/`
- Modify: `src/app/layout.tsx` (strip desktop-specific UI)
- Create: `src/app/(desktop)/layout.tsx` (desktop shell)

- [ ] **Step 1: Create the (desktop) directory and move all page directories**

```bash
mkdir -p src/app/\(desktop\)

# Move all page directories (NOT api/, layout.tsx, globals.css, favicon.ico)
for dir in clients tasks docs calendar modeling notes inbox filing contacts rolodex prospects deals companies settings templates library uploads projects test; do
  if [ -d "src/app/$dir" ]; then
    mv "src/app/$dir" "src/app/(desktop)/$dir"
  fi
done

# Move root page.tsx (dashboard)
mv src/app/page.tsx "src/app/(desktop)/page.tsx"
```

- [ ] **Step 2: Create the desktop layout**

Create `src/app/(desktop)/layout.tsx` — this takes over the desktop-specific shell from the root layout:

```tsx
import NavigationBar from "@/components/NavigationBar";
import Sidebar from "@/components/Sidebar";
import ChatAssistantButton from "@/components/ChatAssistantButton";

export default function DesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      <NavigationBar />
      <main className="ml-20 pt-16 min-h-screen">
        {children}
      </main>
      <ChatAssistantButton />
    </>
  );
}
```

- [ ] **Step 3: Strip desktop UI from root layout**

Modify `src/app/layout.tsx` to keep only shared providers. Remove Sidebar, NavigationBar, ChatAssistantButton imports and JSX. Remove the `ml-20 pt-16` main wrapper. The root layout becomes:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexProvider } from "@/components/ConvexProvider";
import { UserSync } from "@/components/UserSync";
import { ChatDrawerProvider } from "@/contexts/ChatDrawerContext";
import { GlobalSearchProvider } from "@/contexts/GlobalSearchContext";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "File Organization Agent",
  description: "AI-powered file organization and categorization system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ConvexProvider>
          <ChatDrawerProvider>
            <GlobalSearchProvider>
              <UserSync />
              {children}
              <Toaster position="top-right" richColors />
            </GlobalSearchProvider>
          </ChatDrawerProvider>
        </ConvexProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Run the build to verify nothing broke**

```bash
npx next build
```

Expected: Build passes. All existing pages still serve at the same URLs. Route groups `(desktop)` are transparent to the URL structure.

- [ ] **Step 5: Manually verify key cross-imports resolve**

```bash
# These files import from @/app/docs/... — confirm the paths resolve after move
grep -r "@/app/docs" src/components/ src/app/
```

Expected: Imports like `@/app/docs/components/FolderBrowser` should now resolve to `src/app/(desktop)/docs/components/FolderBrowser`. The `@/` alias maps to `src/` and the route group `(desktop)` is part of the filesystem path, so `@/app/(desktop)/docs/...` is the actual resolved path. However, the import says `@/app/docs/...` — this will **NOT** resolve because the file has physically moved.

**If imports break:** Update the 4 known cross-imports to include `(desktop)` in the path:

```bash
# In src/components/DocumentNotes.tsx:
# Change: @/app/docs/reader/[documentId]/components/DocumentNoteForm
# To:     @/app/(desktop)/docs/reader/[documentId]/components/DocumentNoteForm

# In src/components/IntelligenceTab.tsx:
# Change: @/app/docs/components/FileDetailPanel
# To:     @/app/(desktop)/docs/components/FileDetailPanel

# In src/app/(desktop)/clients/[clientId]/components/ClientDocumentLibrary.tsx:
# Change: @/app/docs/components/FolderBrowser (and FileList, FileDetailPanel)
# To:     @/app/(desktop)/docs/components/FolderBrowser (etc.)

# In src/app/(desktop)/clients/[clientId]/projects/[projectId]/components/ProjectDocumentsTab.tsx:
# Change: @/app/docs/components/FolderBrowser (and FileList, FileDetailPanel)
# To:     @/app/(desktop)/docs/components/FolderBrowser (etc.)
```

Run `npx next build` again after fixing any import paths.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(desktop\) src/app/layout.tsx
git add -u  # pick up moved/deleted files
git commit -m "refactor: move existing pages into (desktop) route group for mobile companion setup"
```

---

## Task 2: Update Middleware for Mobile Routing

Integrate mobile subdomain detection into the existing Clerk auth middleware.

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Read the current middleware**

Current middleware at `src/middleware.ts` uses `clerkMiddleware` with `createRouteMatcher` for public routes. The mobile routing must happen **inside** the Clerk middleware callback, after auth, using `NextResponse.rewrite()`.

- [ ] **Step 2: Update middleware with mobile routing**

Replace `src/middleware.ts` with:

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login(.*)',
  '/signup(.*)',
  '/api/test-feedback-loop(.*)',
  '/api/process-meeting-queue(.*)',
  '/api/process-intelligence-queue(.*)',
])

// Mobile route mapping: URL path → (mobile) route group path
const mobileRouteMap: Record<string, string> = {
  '/': '/m-dashboard',
  '/clients': '/m-clients',
  '/docs': '/m-docs',
  '/tasks': '/m-tasks',
  '/notes': '/m-notes',
  '/contacts': '/m-contacts',
}

function isMobileRequest(request: Request): boolean {
  const url = new URL(request.url)

  // Dev override: ?mobile=true
  if (url.searchParams.get('mobile') === 'true') return true

  // Subdomain detection
  const hostname = request.headers.get('host') || ''
  if (hostname.startsWith('m.')) return true

  return false
}

export default clerkMiddleware(async (auth, request) => {
  // Auth check first — applies to both desktop and mobile
  if (!isPublicRoute(request)) {
    await auth.protect()
  }

  // Mobile routing: rewrite to (mobile) route group
  if (isMobileRequest(request)) {
    const url = new URL(request.url)
    const pathname = url.pathname

    // Don't rewrite API routes or static assets
    if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) {
      return NextResponse.next()
    }

    // Find matching mobile route
    const mobilePath = mobileRouteMap[pathname]
    if (mobilePath) {
      url.pathname = mobilePath
      return NextResponse.rewrite(url)
    }

    // For unmatched mobile paths, fall through to mobile dashboard
    // This handles deep links that don't have a mobile equivalent yet
    url.pathname = '/m-dashboard'
    return NextResponse.rewrite(url)
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
```

- [ ] **Step 3: Run build**

```bash
npx next build
```

Expected: Build passes. The middleware compiles. Desktop routes are unaffected (no rewrite happens without mobile detection).

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add mobile subdomain detection and route rewriting to middleware"
```

---

## Task 3: Create TabContext for Tab State Management

The tab system is the core mobile UX — build the state management first so shell components can consume it.

**Files:**
- Create: `src/contexts/TabContext.tsx`

- [ ] **Step 1: Create TabContext**

Create `src/contexts/TabContext.tsx`:

```tsx
'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface Tab {
  id: string;
  type: 'dashboard' | 'clients' | 'docs' | 'tasks' | 'notes' | 'contacts' | 'page';
  title: string;
  route: string;
  params?: Record<string, string>;
}

interface TabContextType {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (tab: Omit<Tab, 'id'>) => string;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Omit<Tab, 'id'>>) => void;
}

const MAX_TABS = 12;

const TabContext = createContext<TabContextType | undefined>(undefined);

const defaultTab: Tab = {
  id: 'dashboard',
  type: 'dashboard',
  title: 'Dashboard',
  route: '/',
};

export function TabProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([defaultTab]);
  const [activeTabId, setActiveTabId] = useState<string | null>('dashboard');

  const openTab = useCallback((tabData: Omit<Tab, 'id'>) => {
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newTab: Tab = { ...tabData, id };

    setTabs(prev => {
      const updated = [...prev, newTab];
      // If over limit, remove oldest non-active tab
      if (updated.length > MAX_TABS) {
        const indexToRemove = updated.findIndex(t => t.id !== activeTabId && t.id !== id);
        if (indexToRemove !== -1) {
          updated.splice(indexToRemove, 1);
        }
      }
      return updated;
    });
    setActiveTabId(id);
    return id;
  }, [activeTabId]);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== id);
      // If we closed the active tab, switch to the last tab
      if (id === activeTabId && filtered.length > 0) {
        setActiveTabId(filtered[filtered.length - 1].id);
      }
      // Never close the last tab — reset to dashboard
      if (filtered.length === 0) {
        setActiveTabId('dashboard');
        return [defaultTab];
      }
      return filtered;
    });
  }, [activeTabId]);

  const switchTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const updateTab = useCallback((id: string, updates: Partial<Omit<Tab, 'id'>>) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  return (
    <TabContext.Provider value={{ tabs, activeTabId, openTab, closeTab, switchTab, updateTab }}>
      {children}
    </TabContext.Provider>
  );
}

export function useTabs() {
  const context = useContext(TabContext);
  if (context === undefined) {
    throw new Error('useTabs must be used within a TabProvider');
  }
  return context;
}
```

- [ ] **Step 2: Run build**

```bash
npx next build
```

Expected: Passes. TabContext is created but not yet consumed.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/TabContext.tsx
git commit -m "feat: add TabContext for mobile tab state management"
```

---

## Task 4: Build Mobile Shell Components

Build all mobile-specific components. These are the building blocks for the mobile layout.

**Files:**
- Create: `src/components/mobile/MobileHeader.tsx`
- Create: `src/components/mobile/TabManager.tsx`
- Create: `src/components/mobile/StickyFooter.tsx`
- Create: `src/components/mobile/ChatOverlay.tsx`
- Create: `src/components/mobile/MobileNavDrawer.tsx`
- Create: `src/components/mobile/MobileShell.tsx`

- [ ] **Step 1: Create MobileHeader**

Create `src/components/mobile/MobileHeader.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import MobileNavDrawer from './MobileNavDrawer';

export default function MobileHeader() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-14 bg-zinc-950 border-b border-zinc-800 z-40 flex items-center justify-between px-4">
        {/* Left: Hamburger + Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="p-1.5 -ml-1.5 text-white"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-base font-semibold text-white">RockCap</span>
        </div>

        {/* Right: Search + Avatar */}
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-500"
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search...</span>
          </button>
          <div className="w-7 h-7">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <MobileNavDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}
```

- [ ] **Step 2: Create MobileNavDrawer**

Create `src/components/mobile/MobileNavDrawer.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  X,
  LayoutDashboard,
  Building,
  File,
  CheckSquare,
  FileText,
  ContactRound,
  UserSearch,
  Archive,
} from 'lucide-react';

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Building },
  { href: '/docs', label: 'Documents', icon: File },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/notes', label: 'Notes', icon: FileText },
  { href: '/contacts', label: 'Contacts', icon: ContactRound },
  { href: '/prospects', label: 'Prospects', icon: UserSearch },
  { href: '/filing', label: 'Upload', icon: Archive },
];

export default function MobileNavDrawer({ isOpen, onClose }: MobileNavDrawerProps) {
  const pathname = usePathname();

  // Close on route change
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Drawer */}
      <nav className="absolute left-0 top-0 bottom-0 w-72 bg-zinc-950 border-r border-zinc-800 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <span className="text-lg font-semibold text-white">RockCap</span>
          <button onClick={onClose} className="p-1 text-zinc-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 py-2 px-3 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
```

- [ ] **Step 3: Create TabManager**

Create `src/components/mobile/TabManager.tsx`:

```tsx
'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTabs } from '@/contexts/TabContext';

export default function TabManager() {
  const { tabs, activeTabId, switchTab, closeTab } = useTabs();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (direction: 'left' | 'right') => {
    scrollRef.current?.scrollBy({
      left: direction === 'left' ? -150 : 150,
      behavior: 'smooth',
    });
  };

  if (tabs.length <= 1) return null;

  return (
    <div className="flex items-center bg-zinc-900 border-b border-zinc-800 px-2 h-10">
      {/* Scrollable tab pills */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-hide py-1.5"
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs whitespace-nowrap flex-shrink-0 transition-colors ${
              tab.id === activeTabId
                ? 'bg-blue-600 text-white font-medium'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="max-w-[120px] truncate">{tab.title}</span>
            {tabs.length > 1 && tab.id !== 'dashboard' && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="ml-0.5 p-0.5 rounded hover:bg-white/20"
              >
                <X className="w-3 h-3" />
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Arrow navigation */}
      {tabs.length > 3 && (
        <div className="flex gap-1 pl-2 flex-shrink-0">
          <button
            onClick={() => scrollBy('left')}
            className="w-7 h-7 flex items-center justify-center bg-zinc-800 rounded-md text-zinc-400 hover:text-white"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => scrollBy('right')}
            className="w-7 h-7 flex items-center justify-center bg-zinc-800 rounded-md text-zinc-400 hover:text-white"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create StickyFooter**

Create `src/components/mobile/StickyFooter.tsx`:

```tsx
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Building, File, CheckSquare, MessageCircle } from 'lucide-react';

interface StickyFooterProps {
  onChatOpen: () => void;
}

const navItems = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Building },
  // Chat FAB is injected between these
  { href: '/docs', label: 'Docs', icon: File },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
];

export default function StickyFooter({ onChatOpen }: StickyFooterProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 px-4">
        {/* First two nav items */}
        {navItems.slice(0, 2).map(item => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 min-w-[48px]"
            >
              <Icon className={`w-5 h-5 ${active ? 'text-blue-500' : 'text-zinc-500'}`} />
              <span className={`text-[10px] ${active ? 'text-blue-500' : 'text-zinc-500'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Chat FAB — elevated center button */}
        <button
          onClick={onChatOpen}
          className="flex items-center justify-center w-14 h-14 -mt-5 bg-blue-600 rounded-full shadow-lg shadow-blue-600/30"
          aria-label="Open chat assistant"
        >
          <MessageCircle className="w-6 h-6 text-white" />
        </button>

        {/* Last two nav items */}
        {navItems.slice(2).map(item => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 min-w-[48px]"
            >
              <Icon className={`w-5 h-5 ${active ? 'text-blue-500' : 'text-zinc-500'}`} />
              <span className={`text-[10px] ${active ? 'text-blue-500' : 'text-zinc-500'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create ChatOverlay**

Create `src/components/mobile/ChatOverlay.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { X, Paperclip, ArrowUp } from 'lucide-react';
import { useTabs } from '@/contexts/TabContext';

interface ChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatOverlay({ isOpen, onClose }: ChatOverlayProps) {
  const { tabs, activeTabId } = useTabs();
  const activeTab = tabs.find(t => t.id === activeTabId);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Dimmed background — tabs visible behind */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Chat sheet — slides up from bottom */}
      <div className="relative mt-auto h-[85vh] bg-zinc-900 rounded-t-2xl flex flex-col z-10">
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>

        {/* Chat header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm">
              🤖
            </div>
            <div>
              <div className="text-sm font-semibold text-white">RockCap Assistant</div>
              {activeTab && activeTab.type !== 'dashboard' && (
                <div className="text-xs text-zinc-500">Context: {activeTab.title}</div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat messages — placeholder */}
        <div className="flex-1 overflow-y-auto px-4 py-6 flex items-center justify-center">
          <div className="text-center">
            <div className="text-zinc-500 text-sm">Chat assistant</div>
            <div className="text-zinc-600 text-xs mt-1">Coming soon — API integration in a later phase</div>
          </div>
        </div>

        {/* Chat input */}
        <div className="px-4 py-3 border-t border-zinc-800 pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center gap-2">
            <button className="w-9 h-9 flex items-center justify-center bg-zinc-800 rounded-full text-zinc-400 flex-shrink-0">
              <Paperclip className="w-4 h-4" />
            </button>
            <div className="flex-1 bg-zinc-800 rounded-2xl px-4 py-2.5 text-sm text-zinc-500">
              Ask anything...
            </div>
            <button className="w-9 h-9 flex items-center justify-center bg-blue-600 rounded-full text-white flex-shrink-0">
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create MobileShell**

Create `src/components/mobile/MobileShell.tsx`:

```tsx
'use client';

import { useState } from 'react';
import MobileHeader from './MobileHeader';
import TabManager from './TabManager';
import StickyFooter from './StickyFooter';
import ChatOverlay from './ChatOverlay';

export default function MobileShell({ children }: { children: React.ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <MobileHeader />
      {/* Offset for header height */}
      <div className="pt-14">
        <TabManager />
        {/* Main content — offset for footer */}
        <main className="pb-20">
          {children}
        </main>
      </div>
      <StickyFooter onChatOpen={() => setIsChatOpen(true)} />
      <ChatOverlay isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 7: Run build**

```bash
npx next build
```

Expected: Passes. Components are created but not yet used in a layout.

- [ ] **Step 8: Commit**

```bash
git add src/components/mobile/
git commit -m "feat: add mobile shell components — header, tabs, footer, chat overlay, nav drawer"
```

---

## Task 5: Create Mobile Layout and Placeholder Pages

Wire up the mobile shell and create placeholder pages for all mobile routes.

**Files:**
- Create: `src/app/(mobile)/layout.tsx`
- Create: `src/app/(mobile)/m-dashboard/page.tsx`
- Create: `src/app/(mobile)/m-clients/page.tsx`
- Create: `src/app/(mobile)/m-docs/page.tsx`
- Create: `src/app/(mobile)/m-tasks/page.tsx`
- Create: `src/app/(mobile)/m-notes/page.tsx`
- Create: `src/app/(mobile)/m-contacts/page.tsx`

- [ ] **Step 1: Create the mobile layout**

Create `src/app/(mobile)/layout.tsx`:

```tsx
import { TabProvider } from '@/contexts/TabContext';
import MobileShell from '@/components/mobile/MobileShell';

export const metadata = {
  title: 'RockCap Mobile',
  description: 'RockCap mobile companion',
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
};

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TabProvider>
      <MobileShell>{children}</MobileShell>
    </TabProvider>
  );
}
```

- [ ] **Step 2: Create placeholder page helper**

Rather than repeating boilerplate, create a small helper. Create `src/app/(mobile)/MobilePlaceholder.tsx`:

```tsx
interface MobilePlaceholderProps {
  title: string;
  description: string;
  icon: string;
}

export default function MobilePlaceholder({ title, description, icon }: MobilePlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="text-4xl mb-4">{icon}</div>
      <h1 className="text-xl font-semibold text-white mb-2">{title}</h1>
      <p className="text-sm text-zinc-500 max-w-xs">{description}</p>
    </div>
  );
}
```

- [ ] **Step 3: Create all placeholder pages**

Create `src/app/(mobile)/m-dashboard/page.tsx`:

```tsx
import MobilePlaceholder from '../MobilePlaceholder';

export default function MobileDashboard() {
  return (
    <MobilePlaceholder
      title="Dashboard"
      description="Recent clients, projects, tasks, and notes — coming soon"
      icon="🏠"
    />
  );
}
```

Create `src/app/(mobile)/m-clients/page.tsx`:

```tsx
import MobilePlaceholder from '../MobilePlaceholder';

export default function MobileClients() {
  return (
    <MobilePlaceholder
      title="Clients"
      description="Browse client profiles and projects — coming soon"
      icon="👥"
    />
  );
}
```

Create `src/app/(mobile)/m-docs/page.tsx`:

```tsx
import MobilePlaceholder from '../MobilePlaceholder';

export default function MobileDocs() {
  return (
    <MobilePlaceholder
      title="Documents"
      description="View and upload documents — coming soon"
      icon="📄"
    />
  );
}
```

Create `src/app/(mobile)/m-tasks/page.tsx`:

```tsx
import MobilePlaceholder from '../MobilePlaceholder';

export default function MobileTasks() {
  return (
    <MobilePlaceholder
      title="Tasks"
      description="View and manage tasks — coming soon"
      icon="✅"
    />
  );
}
```

Create `src/app/(mobile)/m-notes/page.tsx`:

```tsx
import MobilePlaceholder from '../MobilePlaceholder';

export default function MobileNotes() {
  return (
    <MobilePlaceholder
      title="Notes"
      description="View and create notes — coming soon"
      icon="📝"
    />
  );
}
```

Create `src/app/(mobile)/m-contacts/page.tsx`:

```tsx
import MobilePlaceholder from '../MobilePlaceholder';

export default function MobileContacts() {
  return (
    <MobilePlaceholder
      title="Contacts"
      description="Browse contacts with click-to-call — coming soon"
      icon="📇"
    />
  );
}
```

- [ ] **Step 4: Run build**

```bash
npx next build
```

Expected: Passes. Mobile routes are now servable.

- [ ] **Step 5: Test mobile routing locally**

```bash
npm run dev
```

Open `http://localhost:3000?mobile=true` in browser. Should see the mobile shell with the dashboard placeholder. Verify:
- Header shows hamburger, RockCap, search, avatar
- Sticky footer shows Home, Clients, Chat FAB, Docs, Tasks
- Tapping Chat FAB opens the chat overlay
- Hamburger opens the nav drawer
- `http://localhost:3000/clients?mobile=true` shows clients placeholder
- `http://localhost:3000` (without `?mobile=true`) shows the normal desktop app

- [ ] **Step 6: Commit**

```bash
git add src/app/\(mobile\)
git commit -m "feat: add mobile layout with shell and placeholder pages for all routes"
```

---

## Task 6: Create Component Directory Structure + Gitkeep Files

Set up the component tier directories from the spec so the structure is ready for future work.

**Files:**
- Create: `src/components/shared/.gitkeep`
- Create: `src/components/desktop/.gitkeep`

- [ ] **Step 1: Create tier directories**

```bash
mkdir -p src/components/shared src/components/desktop
touch src/components/shared/.gitkeep src/components/desktop/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/.gitkeep src/components/desktop/.gitkeep
git commit -m "chore: add shared and desktop component directories for tiered component library"
```

---

## Task 7: Add Tailwind Scrollbar Hide Utility

The tab bar uses `scrollbar-hide` to hide the horizontal scrollbar on the tab pills. This needs a small CSS addition.

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add scrollbar-hide utility class**

Append to the end of `src/app/globals.css`:

```css
/* Mobile tab bar — hide scrollbar on horizontal scroll */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

- [ ] **Step 2: Run build**

```bash
npx next build
```

Expected: Passes.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add scrollbar-hide utility for mobile tab bar"
```

---

## Task 8: Final Build Verification + Push

Full verification that everything works together.

- [ ] **Step 1: Run production build**

```bash
npx next build
```

Expected: Build passes with no errors.

- [ ] **Step 2: Verify desktop is unbroken**

```bash
npm run dev
```

Open `http://localhost:3000` — should see the existing desktop app with Sidebar, NavigationBar, and all pages working exactly as before. Check:
- Dashboard loads at `/`
- Navigate to `/clients`, `/tasks`, `/docs` — all work
- Chat assistant button works
- Global search works

- [ ] **Step 3: Verify mobile shell**

Open `http://localhost:3000?mobile=true`:
- Mobile shell renders (dark theme, header, footer)
- Tab bar hidden (only 1 tab)
- Chat overlay opens/closes
- Nav drawer opens/closes
- Footer navigation between pages works
- Each placeholder page renders

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```
