# UI Patterns

Patterns are the compositional rules — _how primitives and components fit together to form recognizable surfaces_. Every screen in Groovy should be reducible to one or more of these patterns. If a new screen needs something not described here, that's either a new pattern (document it) or a deviation that needs justification.

---

## 1. App Shell

The frame every authenticated page sits inside. Reference implementation: `front-end/src/demo/App.tsx`.

```
┌─────────────────────────────────────────────────────────────┐
│  Header (logo, status, theme toggle, Chat trigger)          │  80px
├──┬──────────────────────────────────────────────────┬───────┤
│  │  TabBar  (active workspace tabs)                 │       │  40px
│S ├──────────────────────────────────────────────────┤ Chat  │
│i │                                                  │ Drawer│
│d │           Canvas / Page Content                  │ (340) │
│e │                                                  │       │
│b │                                                  │       │
│a │                                                  │       │
│r │                                                  │       │
└──┴──────────────────────────────────────────────────┴───────┘
   56                                                  open: 340
   (hover→200)                                         closed: 0
```

### Composition rules

```tsx
<ThemeProvider>
  <Header connectionStatus="connected" showThemeToggle actions={<ChatButton/>} />
  <div style={{ display: 'flex', flex: 1 }}>
    <Sidebar items={navItems} activeId={activeNavId} onItemClick={handleNav} />
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <TabBar tabs={tabs} onTabClick={...} onTabClose={...} onTabLock={...} />
      <div style={{ flex: 1, overflow: 'auto', backgroundColor: colors.bg.cardAlt }}>
        {/* page content — one of the page templates */}
      </div>
    </main>
    <MissionControl isOpen={chatOpen} ... />
  </div>
  <CommandPalette isOpen={cmdOpen} onClose={closeCmd} commands={...} />
</ThemeProvider>
```

### Do

- Always wrap the app in `<ThemeProvider>` at the root.
- Always render `<MissionControl>` even when closed — it slides in/out via CSS transforms, not mount/unmount.
- Always render `<CommandPalette>` at the root; bind `Cmd+K` globally via `useCommandPalette()`.
- Set the canvas background to `colors.bg.cardAlt` so cards on top read as "elevated."

### Don't

- Don't put a sidebar **inside** a page. The sidebar belongs to the shell, not to the page.
- Don't replace the Header on internal pages — extend it with the `actions` prop.
- Don't add a second tab bar inside a page. Use a [tabbed section pattern](#5-tabbed-sections-within-a-page) instead.

---

## 2. Sidebar Navigation

The left-rail Sidebar is the primary navigation surface. It collapses to icons (56px) and expands on hover (200px). Reference: `front-end/src/lib/components/Sidebar.tsx`.

### NavItem contract

```ts
interface NavItem {
  id: string; // stable identifier
  icon: ReactNode; // an <Icon> primitive, size={18}
  label: string; // sentence case, no period
  type?: string; // optional — for color hinting; matches entityTypes keys
  section?: string; // optional — clusters consecutive items under a header
}
```

### Section grouping

Twelve flat top-levels became hard to scan. Items now group into five sections that mirror the two architectural axes (commerce + WMS) plus operational and observational surfaces. Items sharing a `section` value cluster under a tiny uppercase header (expanded) or a divider line (collapsed).

| Section     | Surfaces                                 | Why this grouping                                                                                          |
| ----------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Operate** | Dashboard, Inbox                         | Start-of-day surfaces. What needs my attention.                                                            |
| **Sell**    | Customers, Orders, Suppliers             | Commerce axis. Order is the financial / legal container; POs in/out live here as sub-tabs, not in the nav. |
| **Make**    | Campaigns, Projects, Workflows, Schedule | WMS axis (Campaign → Project → Workflow), with Schedule as the cross-cutting time view.                    |
| **Track**   | Items, Materials                         | The physical things flowing through.                                                                       |
| **Observe** | Analytics                                | Aggregate insight.                                                                                         |

### Do

- One nav item per **top-level module**. If a thing is a feature of an existing surface (POs, invoices, samples), it lives inside that surface as a tab or sub-page — not in the rail.
- Use `<Icon size={18}>` for the icon. Smaller looks lost in the 56px rail; larger crowds it.
- Map `activeId` from the active tab's `type`, not from the URL directly — `getTabFromPath` in `front-end/src/demo/App.tsx` does this.
- When adding a new module, place it in the most architecturally-honest section. If it doesn't fit, that's a smell — it probably belongs as a sub-page of an existing top-level.

### Don't

- Don't put a third-level item in the sidebar. Drill-down lives in the page, not the rail.
- Don't show counts/badges in the sidebar. It collapses to icons and badges become noise.
- Don't add a hamburger toggle — the sidebar is hover-expand only.
- Don't create a new top-level for every new feature. The default answer is "it lives inside the relevant container." A new top-level requires a new conceptual axis.

---

## 3. Tabbed Workspace

The TabBar treats every open entity as a tab — Dashboard, a specific Workflow, an Item detail, etc. Tabs are the **canonical user workspace metaphor**. Closing a tab removes it from the workspace; locking it pins it across sessions. Reference: `front-end/src/lib/components/TabBar.tsx`.

### Tab contract

```ts
interface Tab {
  id: string | number; // unique per session — Date.now() or stable ID
  title: string; // 'Workflow — Order Intake', 'Item — SKU-1234'
  type?: string; // 'dashboard' | 'workflow' | 'item' | 'order' | 'contact' | 'analytics'
  active?: boolean; // exactly one tab should be active at a time
  locked?: boolean; // user-pinned, hides close button
  data?: Record<string, unknown>; // entity payload — { workflowId, itemId, ... }
}
```

### Title conventions

| Pattern         | Example                                                         |
| --------------- | --------------------------------------------------------------- |
| List view       | `'Workflows'`, `'Items'`, `'Orders'`                            |
| Specific entity | `'Workflow — Order Intake'`, `'Item — SKU-1234'`                |
| New / draft     | `'Workflow — Untitled'`, `'Order — Draft'`, `'Item — Untitled'` |

The em-dash separator (`—`, not `-` or `:`) is part of the canon.

### URL ↔ tab sync

`front-end/src/demo/App.tsx` implements bidirectional sync between `react-router-dom` paths and the tab strip via two helpers:

- `getPathFromTab(tab) → '/items/detail/SKU-1234'`
- `getTabFromPath(pathname) → { id, title, type, data }`

When you add a new entity type, add cases to **both** functions. Adding to one creates a phantom URL or a phantom tab.

### Do

- Color-code via `type` — TabBar reads `colors.entityTypes` to pick the dot/underline color.
- Allow exactly one tab to have `active: true`.
- Persist locked tabs across page reloads.

### Don't

- Don't reuse tab IDs across tabs — even closed tabs hold ID space until session end.
- Don't render >12 tabs without `overflowX: 'auto'` (TabBar already handles this).
- Don't put a tab type into the strip without also adding it to `colors.entityTypes` and the URL sync helpers.

---

## 4. Dashboard Grid

The most distinctive Groovy pattern: a 6-column, drag-and-resize-able grid that holds widgets at varying sizes. The grid is what makes Groovy _feel_ like an operations console rather than a typical web app. Reference: `front-end/src/lib/layouts/GroovyGrid.tsx`.

### Anatomy

- **6 columns**, gap of 1px (the visible grid is part of the brand — don't increase the gap).
- **Allowed column spans:** 1, 2, 4, or 6. The grid snaps to these.
- **Allowed row spans:** 1, 2, or 3.
- **Row height:** 160px default, 140px minimum.
- **Background:** `bg.cardAlt` (canvas) with each cell on `bg.card`.

### Composition

```tsx
const [layout, setLayout] = useState<GroovyGridItem[]>([
  { i: 'units-today', x: 0, y: 0, w: 1, h: 1 },
  { i: 'output-chart', x: 1, y: 0, w: 4, h: 2 },
  { i: 'alerts', x: 5, y: 0, w: 1, h: 1 },
]);

<GroovyGrid layout={layout} onLayoutChange={setLayout} width={gridWidth}>
  <div key="units-today"><MetricCard cellId="units-today" label="Units Today" value="3,847" /></div>
  <div key="output-chart"><ChartCard cellId="output-chart" label="Output" chart={...} /></div>
  <div key="alerts"><AlertsList cellId="alerts" alerts={...} /></div>
</GroovyGrid>
```

### Widget contract

**Every widget that renders inside the grid takes a `cellId` prop.** This is non-negotiable — `cellId` is what lets the grid manage size, persist layout, and let widgets adapt to their cell density.

```ts
interface WidgetProps {
  cellId: string; // matches the `i` key in the layout array
  colSpan?: AllowedColSpan; // override the default
  rowSpan?: AllowedRowSpan;
  // ... widget-specific props
}
```

### Density adaptation

Widgets should adapt their content to their cell size. Use `calculateDensity(colSpan, rowSpan)` or `useGridDensity(...)`:

| Density    | Cell area           | Adaptation                                  |
| ---------- | ------------------- | ------------------------------------------- |
| `compact`  | ≤ 2 (e.g. 2×1)      | Value + label only, no chart, smaller fonts |
| `normal`   | ≤ 6 (e.g. 4×1, 2×3) | Add change indicator + small chart          |
| `expanded` | > 6 (e.g. 4×2+)     | Full content with footer and large chart    |

`densityFontSizes` and `densityPadding` are the canonical values to use — don't pick "fontSize: 28 because it looks better" if `densityFontSizes.normal.value` is 32.

### Widget constraints

Each widget type declares its valid size range in `widgetConstraints` (in `tokens/grid.ts`). When adding a new widget:

1. Add an entry to `widgetConstraints` with `minCols/maxCols/minRows/maxRows/defaultCols/defaultRows`.
2. Pick defaults that match the widget's information density — a metric card defaults to 1×1, a chart to 4×2.
3. Validate that the constraints make sense at every allowed size (a chart at 1×1 is illegible — set `minCols: 2`).

### Do

- Persist `layout` per dashboard per user. (Backend support deferred — keep the state-management surface clean.)
- Use the `accent` prop on `<GridCell>` to add a 2px colored top bar — useful for marking widget groups (all metric cards orange, all alerts red).
- Use `react-grid-layout`'s `verticalOverlapCompactor` (default) for organic layouts; switch to `verticalCompactor` for strict "no gaps" dashboards.

### Don't

- Don't put non-widget content inside `GroovyGrid` — it expects each child to fit the cell.
- Don't override `gap` away from 1px. The visible grid lattice is part of the brand.
- Don't bypass `cellId` — it breaks size adaptation and layout persistence.

---

## 4b. Detail Page Header — Breadcrumbs + Top Accent

Every detail page (Order, Campaign, Project, Customer, Supplier, etc.) gets two consistent affordances in its sticky header to make navigation and visual identification fast:

1. **`<TopAccent type="…">`** — a 2px colored bar at the very top of the page, in the entity color. Subtle but immediately readable: orange = workflow, cyan = campaign, indigo = project, etc.
2. **`<Breadcrumbs items={…}>`** — hierarchical navigation back up the parent chain. Above the title row inside the sticky header. Each crumb's leading dot uses the entity color so the user can trace up: `[● Customers] › [● Patagonia] › [● Patagonia S/S 2026] › Hunting Jacket / S/S26` (last crumb non-interactive).

```tsx
import { Breadcrumbs, TopAccent } from '@lib/patterns';

<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
  <TopAccent type='project' />
  <header style={{ position: 'sticky', top: 0 /* ... */ }}>
    <Breadcrumbs
      items={[
        { label: 'Customers', type: 'customer', onClick: onOpenCustomerList },
        {
          label: project.customerName,
          type: 'customer',
          onClick: openCustomer,
        },
        {
          label: project.campaignName,
          type: 'campaign',
          onClick: openCampaign,
        },
        { label: project.name, type: 'project' /* current — no onClick */ },
      ]}
    />
    {/* identity + metrics + actions */}
  </header>
  {/* body */}
</div>;
```

### Identity row pairing

In the identity row, replace the simple 14px entity dot with a **32×32 icon tile** in the entity color (`{entityColor}15` bg, `{entityColor}40` border, the entity's icon glyph). This pairs with the TopAccent and breadcrumb dots to give the page three reinforcing signals of "which entity am I looking at."

```tsx
<span
  style={{
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: `${colors.entityTypes.project}15`,
    border: `1px solid ${colors.entityTypes.project}40`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }}
>
  <Icon name='package' size={18} color={colors.entityTypes.project} />
</span>
```

### Do

- Always render both `TopAccent` and `Breadcrumbs` on detail pages.
- Make every parent crumb clickable (pass `onClick`). The current page is the last crumb and has no `onClick`.
- Use the entity type on every crumb so the leading dot is colored.

### Don't

- Don't use breadcrumbs on **list** pages (no parent to navigate to — they're at the root of their module).
- Don't replicate breadcrumbs as a second tab strip. The workspace TabBar shows what's currently open; breadcrumbs show the parent chain of the current view.

## 5. Tabbed Sections Within a Page

When a single entity has multiple sub-views (e.g. an Item with "Overview / Stages / Files / Activity" sections), use **in-page tabs** — NOT another TabBar component. Build them inline with `<Label>` + `<Badge>` style chrome to keep them visually distinct from the workspace tab strip.

### Anatomy

```
┌─ Page Header ───────────────────────────────────┐
│  ● Item — SKU-1234                              │
├─────────────────────────────────────────────────┤
│  [ OVERVIEW ]  [ STAGES ]  [ FILES ]  [ LOG ]   │  ← in-page tabs
├─────────────────────────────────────────────────┤
│                                                 │
│  (active tab content)                           │
```

### Implementation rule

Tab buttons here use sentence case **OR** uppercase via `<Label>` — both are valid, but pick one per page and stay consistent. Tab buttons are visually weaker than TabBar tabs (smaller, no colored dot, no close button).

---

## 6. Theming

The app supports **light and dark** modes via `<ThemeProvider>` and the `useColors()` hook. Dark is the canonical default.

### Rules

1. **Every component that uses color must call `useColors()`.** Importing `colors` from `@lib/tokens/colors` gives you the dark-only palette and breaks light mode.
2. **Accent and entity-type colors do not change across themes.** Orange is orange in both.
3. **Components must work in both modes without prop changes.** Don't add a `darkMode` boolean — the hook reads the active mode.
4. **Logo switches automatically** via `theme.logo`. Header handles this; don't hardcode `<img src="/7.png" />` in feature code.
5. **Theme preference persists** to `localStorage` under `'groovy-theme-mode'` and respects `prefers-color-scheme` on first load.

### Migration nudge

Older components (notably some widget files) import the static `colors` object. When you touch one of those files, migrate it to `useColors()` — it's a one-line change and the light theme silently breaks until then.

---

## 6b. Granularity (always show records, never roll-ups that hide them)

When the underlying data is a **list of records** (materials, samples, contacts, items, certifications, line items, etc.), the UI should render those records — never a summary tile like `4/4 materials ready` that hides which four they are.

A reader scanning a page should be able to see _which specific record_ is short / pending / overdue / blocked without drilling into another tab.

### The rule

> Don't render `N/M` (or `N%`) when the underlying data is a list. Render the list.

### When summary counts are OK

- **Numerical sums** (revenue $84.5K, total units 247, time-to-ship 38d) — there's no list to surface; the number IS the answer.
- **State-only summaries** (`open` vs `closed`, `paid` vs `outstanding`) — the dimension being summarized is finite and binary.
- **Cross-link badges on tabs** (e.g. `Samples 3` on a tab label, where clicking the tab shows all three) — the count points at the granular view rather than hiding it.

### When they're not

- **Material readiness** — show each material with its status and shortage. Bad: `4/4 ready`. Good: a row per material with on-hand/required and a status pill.
- **Samples approved** — show each sample with its current round + status. Bad: `2/3 approved`. Good: 3 sample chips with their statuses.
- **Compliance certs** — show each cert with expiry. Bad: `5 certifications`. Good: per-cert rows.
- **Contacts** — show each contact card, not "4 contacts".

### Example: Project Detail "Material readiness" panel

Before (rule violation):

```
MATERIAL READINESS
4/4
████████████████████████   materials ready
Item count · 187
```

After:

```
MATERIAL READINESS
● Waxed Cotton Twill          600 / 468 m    ████████   OK
● 5VS Antique Brass Zip       180 / 187 pc   ███████░   OK
● Antique Brass Snaps × 13   2,300 / 2,431   ████░░░░   SHORT −131
● Woven Labels                 0 / 187       ░░░░░░░░   SOURCING
Item count · 187
```

Same vertical space (4 rows), every material visible at a glance, the SHORT and SOURCING rows immediately scannable for the user to act on.

### Implementation discipline

When you're writing a component that summarizes a list, ask:

1. **Is the underlying data a list of records?** If yes, render the list.
2. **Is there a tab elsewhere that shows the granular view?** If yes, you may add a small count chip on the tab label as a navigation hint — but the in-context panel still shows the records.
3. **Would the user have to click somewhere to find out which records are in trouble?** If yes, you've violated the rule.

## 7. Loading States — Skeletons

All async data surfaces use the Skeleton primitives instead of spinners. Spinners imply "the server is slow"; skeletons imply "the layout is known, data is incoming" — much calmer feel for a data-dense app. Reference: `front-end/src/lib/primitives/Skeleton.tsx`.

### Variants

| Component                                          | Use                                                         |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `<Skeleton>`                                       | Generic rectangle                                           |
| `<SkeletonText lines={n}>`                         | Paragraph placeholder                                       |
| `<SkeletonCircle>`                                 | Avatar / status dot placeholder                             |
| `<SkeletonCard>`                                   | Card with optional header/avatar                            |
| `<SkeletonTable rows={n} columns={n}>`             | Table placeholder                                           |
| `<SkeletonChart>`                                  | Chart placeholder                                           |
| `<SkeletonMetric hasSparkline>`                    | Metric card placeholder — matches MetricCard layout exactly |
| `<SkeletonWrapper isLoading={...} skeleton={...}>` | Wrapper to swap between skeleton and real content           |

### Do

- Match the skeleton to the actual rendered shape — `SkeletonMetric` for a MetricCard slot, not a generic Skeleton block.
- Show skeletons for ≥200ms even on cached responses — flashing is worse than waiting.

### Don't

- Don't use spinners. There are no spinner components in the canon.
- Don't show "Loading..." text. Skeletons replace text spinners too.

---

## 8. Toasts

Non-blocking notifications use the Toast pattern via `useToast()`. They appear top-right by default and auto-dismiss after 4 seconds. Reference: `front-end/src/lib/components/Toast.tsx`.

```tsx
const { toast } = useToast();
toast.success('Order saved');
toast.error('Connection failed');
toast.info('New release available');
toast.warning('Stock below threshold');
```

### Do

- Wrap the app once in `<ToastProvider position="top-right">`.
- Use `error` for failures the user caused; `warning` for system attention.

### Don't

- Don't use toasts for confirmation prompts — use a modal or inline action.
- Don't toast on success of every action — only when the action's effect isn't visible on screen.

---

## 9. Command Palette

`Cmd+K` (or `Ctrl+K` on Windows) opens a keyboard-driven palette of all global actions. This is a **first-class navigation surface** — operators use it more than the mouse. Reference: `front-end/src/lib/components/CommandPalette.tsx`.

### Command contract

```ts
interface CommandItem {
  id: string;
  label: string;
  description?: string;
  category?: string; // grouped in the palette
  icon?: string;
  shortcut?: string; // 'Cmd+N', shown right-aligned
  keywords?: string[]; // alternate search terms
  onSelect: () => void;
}
```

### Do

- Add a command for every action that opens a new entity ("New Workflow", "New Item", "Open Dashboard").
- Add a command for navigation between top-level modules.
- Bind `keywords` aggressively — operators search by intent ("close" should find both "Close Tab" and "Close Order").

### Don't

- Don't gate the palette behind permissions in the UI — let the action fail with a toast if the user lacks access. The palette must always feel populated.

---

## 10. Mission Control Drawer

The right-side slide-out drawer (400px wide) is the operator's mission-control surface. It bundles four tabs rather than the single chat panel of the earlier ChatDrawer:

- **Today** — daily one-pager: schedule, tasks due, approvals pending, three header KPIs. The morning-driver tab.
- **AI** — Newton chat with context-aware placeholder + suggestions. Default tab when opened (preserves muscle memory from the old ChatDrawer). Reads the active tab's `type` and `data` to know what the user is looking at.
- **Events** — live workspace activity stream (scans, state changes, agent actions, system events). Filterable by kind.
- **Inbox** — unified notifications + threaded messages (mentions, replies, system alerts, task assignments, approval requests). Unread filter + mark-all-read.

Reference: `front-end/src/lib/components/MissionControl.tsx`.

```tsx
const chatContext: ChatContext = {
  entityType: activeTab?.type,
  tabTitle: activeTab?.title,
  isCreating:
    activeTab?.title?.includes('Untitled') ||
    activeTab?.title?.includes('Draft'),
};

<MissionControl
  isOpen={chatOpen}
  onClose={close}
  // AI tab data (required for chat to work):
  messages={messages}
  onSend={handleSend}
  context={chatContext}
  // Optional — falls back to mocks if omitted:
  events={workspaceEvents}
  inbox={notifications}
  agenda={dailyAgenda}
  initialTab='ai'
/>;
```

The badge counts on the tab strip reflect: Today = `tasksDue + approvalsPending`, Events = scans/changes in the last 15 minutes, Inbox = unread count. The AI tab gets the entity-color accent on its bottom-border when active.

### Header trigger

Use `<NewtonTrigger>` in `<Header actions={...}>` to open the drawer. It's a single button labelled "Newton" with a one-number badge — the aggregate count across tabs (approvals + unread inbox + new events). The intent is "one thing on the header demands attention" rather than splitting attention across four separate tab buttons.

```tsx
const [open, setOpen] = useState(false);

<Header
  actions={
    <NewtonTrigger
      isOpen={open}
      attentionCount={approvalsPending + unreadInbox + newEvents}
      onToggle={() => setOpen(!open)}
    />
  }
/>
<MissionControl isOpen={open} ... />
```

Click opens to the AI tab (Newton chat) by default. The drawer's per-tab badges (inside the tab strip) tell the operator which surface the count came from — they switch tabs inside the drawer to drill in.

### Inbox thread view

Inbox items that carry a `thread: InboxMessage[]` open an expanded thread view in-drawer when clicked. The view takes over the Inbox pane content (the list state is preserved underneath, so "back" returns to the exact same scroll + filter), shows the full message chain as chat bubbles (your messages right-aligned in the kind's accent color; Newton's tinted orange with ✦), and provides a reply textarea at the bottom. ⌘+Enter sends. The consumer's `onInboxReply(itemId, body)` fires for persistence; the thread also appends optimistically so the conversation feels live. System alerts can't be replied to.

Items without a `thread` fall back to the consumer's `onInboxOpen(item)` — typically used to open the source entity in the main pane.

### Approval threads in Today

The Today tab's `ApprovalPending` items can carry the same `thread: InboxMessage[]` shape. When they do, the row exposes a "Discuss →" link next to the actor name. Clicking it opens the same `InboxThreadView` inline within the Today pane (agenda preserved underneath; "back" returns to it) so the operator can read Newton's full reasoning and ask questions before deciding.

The thread view's optional `actions` slot is used here to render Approve / Reject inline above the reply input — same decision affordance as the row, available without leaving the conversation. Deciding closes the thread and fires the same `onApproval(id, decision)` callback the row would have fired.

```tsx
agenda.approvalsPending = [
  {
    id: 'a1',
    title: 'Hold Lot 2C-pH-0142 pending recalibration',
    from: 'Newton',
    fromType: 'newton',
    at: '...',
    severity: 'critical',
    entity: { type: 'item', id: 'ITM-2026-0142', label: 'Lot 2C-pH-0142' },
    thread: [
      {
        id: '...',
        from: { name: 'Newton', type: 'newton' },
        at: '...',
        body: 'Drum 2C pH …',
      },
    ],
  },
];
```

### Do

- Always render the drawer (closed = `isOpen: false`). The slide animation depends on it being mounted.
- Pass full `context` — Newton's response quality depends on knowing what the user is doing.

### Don't

- Don't add a second AI surface inside a page. There's exactly one chat in the app, and it's the drawer.
- Don't auto-open the drawer on page load. User intent only.

---

**Open for review:** the tab title em-dash convention (good for English, unclear for i18n); whether locked tabs persist across devices or just localStorage; whether the chat drawer should be resizable.
