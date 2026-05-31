# Layout primitives — cheat-sheet

The canon component set lives in `src/components/layouts/` (barrel: `@/components/layouts`). **Deep-rework agents copy these; do not invent new shared primitives without landing them here first.** All are theme-aware (`useColors()` + inline styles) — never hardcoded Tailwind color classes.

Import: `import { Panel, DataTable, StatusPill, … } from "@/components/layouts";`

## The light-pass → canon mapping (what to replace)

| Old (shadcn / hardcoded) | Canon |
| --- | --- |
| `<Card>`/`CardHeader`/`CardContent` | `<Panel title accent>` |
| `CompactMetricCard` | `<StatTile>` (in a 1px-gap grid) or `<KpiRow>` (header) |
| `<Badge>` status | `<StatusPill tone>` |
| `<Badge>` flag/severity | `<FlagChip severity>` |
| `<table>` / row-card grids | `<DataTable>` |
| "No X yet" blocks | `<EmptyState>` |
| spinner / "loading…" | `<Skeleton*>` |
| `<Button>` | `<Button variant>` / `<IconButton>` |
| `<Input>`/`<Textarea>`/`<Select>` | `<Field>` + `<Input>`/`<Textarea>`/`<Select>` |
| `<Dialog>`/`<AlertDialog>` | `<Modal>` |
| `className="text-gray-500"` | `style={{ color: colors.text.muted }}` |

## Primitives

**Containers**
```tsx
<Panel title="Documents" accent={colors.entityTypes.client} actions={<Button>Add</Button>}>…</Panel>
<StatTile label="Projects" value={12} meta="2 active" accent={colors.accent.blue} onClick={…} />
<KpiRow items={[{ label: "LTV", value: "62%", accent: colors.accent.indigo }]} />
```

**Aside (320px detail panel)**
```tsx
<Section title="Company">
  <Row label="Legal name" value={c.name} />
  <Row label="CH number" value={c.chNumber} mono />
  <Row label="Status" value="Active" pill={colors.accent.green} />
</Section>
```

**Table**
```tsx
<DataTable
  rows={contacts}
  getRowKey={(r) => r._id}
  onRowClick={(r) => router.push(`/…/${r._id}`)}
  empty={<EmptyState icon={<Users />} title="No contacts yet" action={<Button variant="primary">Add contact</Button>} />}
  columns={[
    { key: "name", header: "Name", render: (r) => r.name },
    { key: "role", header: "Role", render: (r) => r.role },
    { key: "added", header: "Added", mono: true, align: "right", render: (r) => fmtDate(r.createdAt) },
  ]}
/>
```

**Pills & chips** (`tone` = any palette color; `severity` = ok|info|warn)
```tsx
<StatusPill label={status} tone={clientStatusTone(status, colors)} />
<FlagChip label="Tier 1 lender" severity="warn" />
```

**Buttons**
```tsx
<Button variant="primary" accent={colors.entityTypes.client} onClick={…}>New project</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost">Settings</Button>
<Button variant="danger">Archive</Button>
<IconButton label="Edit"><Pencil size={14} /></IconButton>
```

**Forms**
```tsx
<Field label="Email" hint="We never share this." error={err}>
  <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="name@firm.com" />
</Field>
<Field label="Notes"><Textarea rows={4} /></Field>
<Field label="Type"><Select value={t} onChange={…}><option>Bridging</option></Select></Field>
```

**Modal** (keep the feature's logic; restyle chrome only)
```tsx
<Modal open={open} onClose={close} title="Link contact"
  footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button variant="primary" onClick={save}>Link</Button></>}>
  <Field label="Contact"><Select>…</Select></Field>
</Modal>
```

**Loading** (skeletons over spinners)
```tsx
if (data === undefined) return <SkeletonTable rows={6} cols={4} />;  // or <SkeletonCard /> / <SkeletonText />
```

## Tokens (always via `const colors = useColors()`)

- `colors.bg.{base,light,card,cardAlt}` — page → chrome → surface → canvas
- `colors.border.{default,mid,light}` — hairlines (never shadows)
- `colors.text.{primary,secondary,muted,dim}` — hierarchy (muted for labels, dim for decoration)
- `colors.accent.{orange,green,blue,purple,yellow,red,cyan,indigo,teal}`
- `colors.entityTypes.{client(green),project(indigo),prospect(amber),lender(teal),deal(blue),…}`
- Alpha: `` `${tone}15` `` (bg), `` `${tone}40` `` (border), `` `${tone}20` `` (pill bg)

## Rules
- 9px mono-uppercase for labels/headers; sans for prose; mono for numbers/IDs/dates.
- Large values weight 300 (`StatTile`/`KpiRow` do this).
- Radius 2–4 (sharp); 1px borders; motion linear 100–250ms.
- Imperative voice, no emoji, no exclamation marks.
- Prospects (`src/components/prospects/`, `(desktop)/prospects/`) is **off-limits** — it's the canon source, not a consumer.
