# Mobile App Facelift — Dark-First Canon Port

**Branch:** `facelift/mobile` (off `main`) → one PR at the end.
**Goal:** Bring the Expo / React Native app (`mobile-app/`) onto the RockCap frontend canon
(`docs/frontend-standards/`), the same canon the web app adopted on `facelift/app-wide`.
**Mode:** dark-first (user preference). Built behind a `useColors()` indirection so a LIGHT palette
can be added later with zero component changes.

## Guiding principle

**Port the *language*, not the *density*.** The web canon is CAD-dense (9–12px fonts, 1px borders).
Mobile keeps the *semantic* layer verbatim — entity colours, status colours, borders-over-shadows,
monospace-for-data, scaffold/tab composition, linear motion — but **re-scales density** for touch
(legible type, ≥44px targets, 16px page padding).

## What the canon gives us (web → mobile mapping)

| Web (`facelift/app-wide`) | Mobile equivalent |
|---|---|
| `src/lib/colors.ts` `DARK` palette | `mobile-app/lib/theme.ts` (ported verbatim) |
| `useColors()` hook + `ThemeProvider` | `mobile-app/lib/useColors.tsx` |
| `src/components/layouts/*` primitives | `mobile-app/components/ui/*` (RN analogues) |
| `docs/frontend-standards/primitives.md` | `mobile-app/docs/primitives.md` cheat-sheet |

Entity colours (theme-invariant): client=green `#22c55e`, project=indigo `#6366f1`,
prospect=amber `#eab308`, lender=teal `#14b8a6`, deal=blue `#3b82f6`, contact=purple `#a855f7`.

## Phases

### Phase 0 — Dark token foundation ✅ DONE
- Rewrote `lib/theme.ts`: dark `palette` (web DARK) + `accent`/`entityTypes`/`status` (verbatim) +
  mobile-rescaled `typography`/`spacing`/`radius`/`layout`. Backward-compat `colors` shim maps the
  old monochrome key names onto the dark palette → **whole app flips to dark in one step**.
- Added `lib/useColors.tsx`: `ThemeProvider` + `useColors()` + `useTheme()` (mirrors web contract).
- Updated `tailwind.config.js` `m-*` namespace to dark values + entity classes.
- Wired `ThemeProvider` into `app/_layout.tsx`.
- Typecheck: foundation adds 0 errors (106 pre-existing implicit-`any` errors in untouched screens).

### Phase 1 — Primitives (NEXT)
Build RN analogues of the web layouts layer, upgrading `components/ui/*` in place:
`Button`, `Card`/`Panel`, `Field`/`Input`, `Badge`/`FlagChip`, `StatTile`, `EmptyState`,
`Skeleton`, `EntityHeader`/`EntityIconTile`, `TabStrip`. All consume `useColors()`.
Write `mobile-app/docs/primitives.md` — the restyle-agent cheat-sheet.

**Critical RN note for the cheat-sheet:** NativeWind cannot JIT dynamic classes (`bg-m-${type}`).
Entity-coloured elements driven by data MUST use inline `style={{ }}` from `useColors()`.

### Phase 2 — Screens, fanned out
Parallel agents per disjoint screen group, each pointed at `primitives.md`, killing the scattered
hardcoded colour maps in favour of entity/status tokens. Build between waves; commit per wave.
Known hardcoded-colour cleanup targets:
- `components/ClientListItem.tsx` — role badge colours (stock emerald/amber)
- `components/TaskListItem.tsx` — priority colours (mixed hex + stock Tailwind)
- `components/contacts/ContactAvatar.tsx` — independent AVATAR_PALETTE
- `components/UpNextCard.tsx` — urgency styles inline
- `components/activity/ActivityCard.tsx` — TYPE_TILE hardcoded

Screen groups: (a) clients list/detail/project, (b) inbox/conversations, (c) docs/viewer/upload,
(d) tasks/activity/notes, (e) contacts/intelligence/meetings, (f) home/chat/settings + shared chrome
(MobileHeader, MobileNavDrawer, TabBar, MiniTabBar, TabManager).

### Phase 3 — Verify & PR
`npx tsc --noEmit` (no new errors) → `expo start` spot-check of entity-colour screens on dark canvas
→ update facelift memory → one PR (open with "Problems this PR solves" bullets per CLAUDE.md).

## Notes / gotchas
- Web's worktree Turbopack symlink gotcha does NOT apply — Metro/Expo handles bundling differently.
- Metro/Babel bundles regardless of `tsc` errors; the 106 pre-existing errors don't block the app
  but we should not add to them.
- `<StatusBar style="light" />` was already set — the chrome already assumed dark; tokens caught up.
