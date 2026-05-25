# Page Templates

When you build a new feature page, **start by picking one of these templates**. Each one is a tested composition of primitives + components that handles the layout, scrolling, and chrome correctly. Building something different is allowed — but the bar is "I have specific reasons the existing templates don't work," not "I want to try a new layout."

These templates live as **patterns in this doc**, not as components in `src/lib/layouts/` — yet. If the same template appears three or more times, promote it to a reusable layout component.

---

## Template 1 — Dashboard

**Use for:** the default landing for a module (Dashboard, Module-level Analytics, executive summaries).

**Reference implementation:** `front-end/src/demo/pages/Dashboard.tsx`.

### Anatomy

```
┌─ Canvas (bg.cardAlt) ─────────────────────────────────────┐
│  ┌──── Optional Page Header ────────────────────────────┐ │
│  │  Title + date range picker + actions                 │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─ GroovyGrid (6 cols × N rows, 1px gaps) ─────────────┐ │
│  │ ┌──┐ ┌──┐ ┌──────┐ ┌──┐                              │ │
│  │ │M │ │M │ │ Chart│ │M │   ← row 0: 4 metric cards    │ │
│  │ └──┘ └──┘ │      │ └──┘                              │ │
│  │ ┌────────┐│      │ ┌──────┐                          │ │
│  │ │  List  ││      │ │Alerts│   ← row 1                │ │
│  │ │  Card  │└──────┘ └──────┘                          │ │
│  │ │        │ ┌─────── Table ─────┐                     │ │
│  │ └────────┘ │                   │   ← row 2           │ │
│  │            └───────────────────┘                     │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### Composition

```tsx
<div style={{ padding: spacing[4] }}>
  {/* Optional header */}
  <div style={{ marginBottom: spacing[4] }}>
    <Label>Production · 2026-W19</Label>
    <h1 style={{ fontSize: typography.fontSize['4xl'], fontWeight: typography.fontWeight.light }}>
      Operations Dashboard
    </h1>
  </div>

  <GroovyGrid layout={layout} onLayoutChange={setLayout} width={canvasWidth} rows={6}>
    <div key="m1"><MetricCard cellId="m1" label="Units Today" value="3,847" change="+12.4%" /></div>
    <div key="m2"><MetricCard cellId="m2" label="OEE" value="84" suffix="%" /></div>
    <div key="chart"><ChartCard cellId="chart" label="Output Trend" chart={...} /></div>
    <div key="alerts"><AlertsList cellId="alerts" alerts={...} /></div>
    <div key="orders"><DataTable cellId="orders" columns={...} data={...} /></div>
  </GroovyGrid>
</div>
```

### Rules

- Set the canvas background to `colors.bg.cardAlt` so the grid lattice shows through.
- The grid should have **at least 4 widgets** to justify itself. If you have fewer, you don't have a dashboard — use Template 2 (List/Index).
- Persist the layout per user per dashboard.
- The dashboard page **never** has a tab strip inside it — workspace tabs are at the shell level.

---

## Template 2 — List / Index

**Use for:** the entry point of a module ("Workflows", "Items", "Orders", "Contacts") — a searchable, filterable view of all entities of one type.

**Reference implementation:** `front-end/src/demo/pages/WorkflowList.tsx`, `front-end/src/demo/pages/ItemCommandCenter.tsx`.

### Anatomy

```
┌─ Canvas ──────────────────────────────────────────────────┐
│  ┌─ List Header ────────────────────────────────────────┐ │
│  │ ● Workflows    [counts: 24]    [⌕ search] [+ New]    │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌─ Filter Strip (optional) ────────────────────────────┐ │
│  │ Status: [All ▾]  Type: [All ▾]  Owner: [All ▾]       │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌─ Content: DataTable OR Grid of Cards ────────────────┐ │
│  │                                                      │ │
│  │   (row per entity, click → opens detail tab)         │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### Composition

```tsx
<div style={{ padding: spacing[6] }}>
  {/* Header */}
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing[4],
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
      <StatusDot status='...' />
      <h1
        style={{
          fontSize: typography.fontSize['3xl'],
          fontWeight: typography.fontWeight.light,
          margin: 0,
        }}
      >
        Workflows
      </h1>
      <Badge>{entities.length}</Badge>
    </div>
    <div style={{ display: 'flex', gap: spacing[2] }}>
      <SearchInput value={query} onChange={setQuery} />
      <Button onClick={onNew}>+ New Workflow</Button>
    </div>
  </div>

  {/* Filters (optional) */}
  <div style={{ display: 'flex', gap: spacing[2], marginBottom: spacing[4] }}>
    <Select
      label='Status'
      options={statusOptions}
      value={status}
      onChange={setStatus}
    />
    {/* ... */}
  </div>

  {/* Content */}
  <DataTable
    cellId='list'
    columns={columns}
    data={filteredData}
    onRowClick={(row) => onOpenEntity(row.id, row.name)}
  />
</div>
```

### Rules

- Use `<DataTable>` for tabular data (most cases). Use a grid of `<ListCard>` only when the rows have meaningful visual content (e.g. workflow stage previews).
- Clicking a row opens a new workspace tab via `addTab(type, title, data)` — never navigates in-place.
- The header colored dot matches the module's `entityTypes.*` color.
- Show the entity count in a `<Badge>`, not in the header text.
- Empty state: centered, `color: colors.text.dim`, no spinner, no exclamation.

### Don't

- Don't open the detail in a modal or drawer. Use a workspace tab.
- Don't add pagination. Use scroll + filter; ERP-style operators expect to see everything.

---

## Template 3 — Detail

**Use for:** viewing/editing a single entity (an Item, an Order, a Contact). Multi-sectioned, often heavy with related data.

**Reference implementation:** `front-end/src/demo/pages/ItemDetail.tsx`.

### Anatomy

```
┌─ Canvas ──────────────────────────────────────────────────┐
│  ┌─ Detail Header (sticky) ─────────────────────────────┐ │
│  │ ● Item — SKU-1234       [Status: Active]  [⋯ menu]   │ │
│  │ Subtitle / hierarchy / ID                            │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌─ In-page tabs ───────────────────────────────────────┐ │
│  │ [Overview] [Stages] [Files] [Activity]               │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌─ Two-pane content (responsive) ──────────────────────┐ │
│  │ ┌──── Main column ────┐  ┌── Side panel ─────────┐  │ │
│  │ │ Sections of fields  │  │  Metadata             │  │ │
│  │ │ Related entities    │  │  Quick actions        │  │ │
│  │ │ Inline editors      │  │  Recent activity      │  │ │
│  │ └─────────────────────┘  └───────────────────────┘  │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### Composition

```tsx
<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
  {/* Sticky header */}
  <div style={{ position: 'sticky', top: 0, backgroundColor: colors.bg.base, zIndex: 10, padding: spacing[4], borderBottom: `1px solid ${colors.border.default}` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: colors.entityTypes.item }} />
      <h1 style={{ fontSize: typography.fontSize['3xl'], fontWeight: typography.fontWeight.light, margin: 0 }}>
        Item — {entity.sku}
      </h1>
      <Badge variant={entity.status === 'active' ? 'success' : 'default'}>{entity.status}</Badge>
    </div>
    {/* in-page tabs */}
    <div style={{ display: 'flex', gap: spacing[2], marginTop: spacing[4] }}>
      {sections.map((s) => (
        <button key={s.id} onClick={() => setActive(s.id)} ...>
          {s.label}
        </button>
      ))}
    </div>
  </div>

  {/* Two-pane content */}
  <div style={{ display: 'flex', flex: 1, overflow: 'auto' }}>
    <div style={{ flex: 1, padding: spacing[6] }}>
      {/* main column — the active section */}
      {active === 'overview' && <OverviewSection ... />}
    </div>
    <aside style={{ width: 320, padding: spacing[4], borderLeft: `1px solid ${colors.border.default}` }}>
      {/* metadata + activity */}
    </aside>
  </div>
</div>
```

### Rules

- The header is **sticky**. Scroll the body, not the entity identity.
- The colored dot in the header is mandatory — it tells the user which entity type they're inside at a glance.
- Use in-page tabs ([Pattern 5](./patterns.md#5-tabbed-sections-within-a-page)), not nested `<TabBar>`.
- Side panel is optional, but if you have one, fix it at `width: 320`. Below ~1200px viewport, hide it behind a toggle.
- Editing happens inline (click field → edit) or via a "Edit" action that flips the page into edit mode — not a modal.

---

## Template 4 — Builder / Editor

**Use for:** complex creation flows (Workflow Builder, Item Builder). Pages with a canvas (graph, list, form) and an inspector panel.

**Reference implementation:** `front-end/src/demo/pages/WorkflowBuilder.tsx`, `front-end/src/demo/pages/ItemBuilder.tsx`.

### Anatomy

```
┌─ Canvas ──────────────────────────────────────────────────┐
│  ┌─ Builder Toolbar (sticky) ───────────────────────────┐ │
│  │ [← Back]  Workflow — Untitled    [Cancel] [Save]     │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────┬────────────────┐ │
│  │                                     │                │ │
│  │     Canvas                          │   Inspector    │ │
│  │     (graph / stages / item fields)  │   (selection   │ │
│  │                                     │    props)      │ │
│  │                                     │                │ │
│  └─────────────────────────────────────┴────────────────┘ │
└────────────────────────────────────────────────────────────┘
                                              ↑ 360px fixed
```

### Composition rules

- **Sticky toolbar** at the top with title + primary actions (Cancel / Save). Save button only enabled on dirty state.
- **Inspector panel** is fixed-width (`360px`), right-aligned. Reads from "currently selected" canvas node.
- **Auto-save vs. explicit save:** prefer explicit Save in builders (operators need confidence). Show "Unsaved changes" via a `<Badge variant="warning">` in the toolbar when dirty.
- **Tab title** updates as the user names the entity — `'Workflow — Untitled'` → `'Workflow — Order Intake'`.
- **Chat-drawer awareness:** when chat is open, the inspector should still be visible — the page narrows. See `chatOpen` prop on existing builders.

### Don't

- Don't redirect away from the builder on Save. Stay on the page, flip the toolbar to reflect saved state.
- Don't validate on every keystroke. Validate on blur or on save attempt.

---

## Template 5 — Form / Settings

**Use for:** configuration pages, account settings, tenant-level admin, single-purpose forms (not entity creation — that uses the Builder template).

### Anatomy

```
┌─ Canvas (constrained max-width 720px, centered) ──────────┐
│  ┌─ Page Header ────────────────────────────────────────┐ │
│  │  Settings · Account                                  │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌─ Section ────────────────────────────────────────────┐ │
│  │  PROFILE                                             │ │
│  │  ────────────────────────────────                    │ │
│  │  Name:        [_______________]                      │ │
│  │  Email:       [_______________]                      │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌─ Section ────────────────────────────────────────────┐ │
│  │  PREFERENCES                                         │ │
│  │  ...                                                 │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌─ Sticky Save Bar (only when dirty) ──────────────────┐ │
│  │              You have unsaved changes  [Cancel] [Save]│ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### Composition rules

- Constrain to `max-width: 720px` centered. Forms wider than that scan poorly.
- Group fields into **labeled sections** using `<Label>` as the section header.
- Section header uses `textStyles.label` (uppercase, mono, xs).
- Sticky save bar at the bottom — only shown when the form is dirty.
- Field width: full section width by default, or fixed for short fields (dates, IDs).
- Use `bg.card` for each section, separated by `spacing[4]` margin.

### Don't

- Don't render forms inside a modal. Use this template, even for "quick" forms.
- Don't auto-save settings. Settings forms always have an explicit Save.

---

## Choosing the right template

| User intent                                | Template               |
| ------------------------------------------ | ---------------------- |
| "Show me a high-level view of this module" | Template 1 — Dashboard |
| "Show me all the X"                        | Template 2 — List      |
| "Show me this specific X"                  | Template 3 — Detail    |
| "Let me build a new X / edit a complex X"  | Template 4 — Builder   |
| "Let me change settings"                   | Template 5 — Form      |

If you're not sure — describe the page to a teammate in one sentence. The verb in that sentence usually maps directly to a template.

---

## Page-level rules common to all templates

1. **Pages do not render the Header/Sidebar/TabBar.** Those are the shell's responsibility. A page renders only what goes inside the content area.
2. **Pages scroll vertically inside the content area.** The shell does not scroll.
3. **Pages assume `<ThemeProvider>` is mounted** and use `useColors()` for all colors.
4. **Page titles** appear in two places — the workspace tab strip (managed by the shell) and the in-page header. They should match.
5. **Loading state:** show skeletons matching the eventual layout, never spinners (see `patterns.md → Loading States`).
6. **Error state:** an empty card with a dim error message and a "Retry" button. No alert dialogs.
7. **Empty state:** centered, `colors.text.dim`, a single line and (optionally) a primary action.

---

**Open for review:** the 720px form width (may need adjustment per locale); the 360px builder inspector width (cramped for some visualization tools — promotable to a resizable inspector if needed); whether the Detail template's side panel should default-collapse below 1200px or just narrow.
