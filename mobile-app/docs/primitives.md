# Mobile primitives cheat-sheet (RockCap canon, dark-first)

The "what to use" reference for restyling mobile screens onto the canon. Ported from the web
`docs/frontend-standards/primitives.md`, adapted for React Native / NativeWind.

## ⚠️ The one rule that trips everyone up

**NativeWind cannot compile dynamic classNames.** `className={\`bg-m-${type}\`}` produces a dead class
and renders nothing. Any colour that depends on data (entity type, status, severity) MUST come from
the `useColors()` hook as an inline `style`:

```tsx
import { useColors } from '@/lib/useColors';
const c = useColors();
<View style={{ borderTopColor: c.entityTypes[entityType] }} />   // ✅
<View className={`border-m-${entityType}`} />                     // ❌ dead class
```

Static `m-*` classes (`bg-m-bg-card`, `text-m-text-primary`) are fine — they compile.

## Theme access

| Need | Use |
|---|---|
| Colours in JS | `const c = useColors()` → `c.bg.*`, `c.text.*`, `c.border.*`, `c.accent.*`, `c.entityTypes.*`, `c.status.*` |
| Colours in className (static only) | `bg-m-bg-card`, `text-m-text-primary`, `border-m-border`, `text-m-client`, … |
| Type / spacing / radius | `import { typography, spacing, radius, layout } from '@/lib/theme'` |

Palette (dark): `bg` base `#0a0a0a` / card `#111111`; `text` primary `#e5e5e5` / muted `#8a8a8a`;
`border` default `#2a2a2a`. Entity: client=green, project=indigo, prospect=amber, lender=teal,
deal=blue, contact=purple. **Never hardcode a hex** — pull from `useColors()`.

## Components (`components/ui/`)

| Component | Import | Use for |
|---|---|---|
| `Button` | `@/components/ui/Button` | actions. `variant` primary/secondary/ghost/danger, `size` sm/md, `accent` (entity colour for primary), `icon`, `loading` |
| `Panel` | `@/components/ui/Panel` | card/section container. `title` (mono-uppercase), `actions`, `accent` (2px entity top border), `padded` |
| `Card` | `@/components/ui/Card` | plain card wrapper (existing; className-based) |
| `StatTile` | `@/components/ui/StatTile` | metric tile. `label`/`value`/`meta`/`accent`/`onPress` |
| `Chip` / `EntityChip` / `StatusChip` | `@/components/ui/Chip` | tinted pills. `EntityChip type="client"`, `StatusChip status="drafted"`, or `Chip color={hex}` |
| `EntityIconTile` | `@/components/ui/EntityIconTile` | square entity-coloured icon tile for headers/rows. `icon`, `type`, `size` |
| `TabStrip` | `@/components/ui/TabStrip` | in-page tabs, entity-coloured active underline. `tabs`/`activeTab`/`onChange`/`entityType` |
| `Field` / `Input` | `@/components/ui/Field` | form controls. `Field` wraps label/hint/error; `Input` has focus border, `mono`, `multiline` |
| `Skeleton` / `SkeletonCard` | `@/components/ui/Skeleton` | loading placeholders (never use spinners) |
| `Badge` | `@/components/ui/Badge` | count badge (existing) |
| `EmptyState` | `@/components/ui/EmptyState` | empty lists (existing) |

## Restyle rules (Phase 2)

1. **Kill hardcoded colour maps.** Replace local objects of hex/stock-Tailwind colours with
   `c.entityTypes.*` / `c.status.*` / `c.accent.*`. Known targets: `ClientListItem` (role badges),
   `TaskListItem` (priority), `ContactAvatar` (AVATAR_PALETTE), `UpNextCard` (urgency), `ActivityCard`
   (TYPE_TILE).
2. **Borders over shadows.** Separation is a 1px `c.border.default` hairline, not elevation/shadow.
3. **Mono for data.** IDs, dates, amounts, CH numbers → `fontFamily: typography.family.mono`. Narrative → sans.
4. **Entity colour by context.** A client screen accents green, project indigo, prospect amber, etc.
   Drive it off the entity type, never a fixed colour.
5. **Touch targets ≥ 44px.** `layout.touchTarget`. Buttons/rows must be tappable-sized.
6. **Structural Tailwind may stay.** `flex`, `gap-`, `p-`, `flex-row` etc. are fine. Only colour
   classes and hardcoded hex need migrating.
