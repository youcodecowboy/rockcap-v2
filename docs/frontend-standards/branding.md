# Branding & Visual Identity

RockCap is an **AI-native deal management system for UK property finance**. The UI should feel like a precision instrument: dense, calm, technical, fast. Not friendly. Not playful. Operators run real money through it; the interface should communicate competence at a glance.

## Posture in one paragraph

Supports both light and dark modes, **light by default** for operator comfort during long review sessions. Sharp corners over soft ones. Monospace for data, sans for narrative. The grid is visible — we don't hide structure, we celebrate it. Color is **rare and semantic**: a colored pixel means something specific, not decoration. The interface should look like a control room, not a marketing site.

## Voice (when text appears)

- **Imperative, not friendly.** "Save" not "Save your changes!"
- **Quantitative, not qualitative.** Show "12,450 units" not "Great progress!"
- **No exclamation marks.** Ever.
- **No emojis in product UI.** Icons only, from the `Icon` primitive.
- **Sentence case** for labels and buttons. **UPPERCASE** only for `<Label>` primitives.
- **Mono for IDs, timestamps, numerical data, CH numbers.** Sans for everything else.

## Color philosophy

Color carries meaning. A colored dot or accent should map to a **semantic token** (`accent.green = success`, `entityTypes.cadence = orange`), never an aesthetic choice. The default state of any surface is monochrome — color enters only to signal state, type, or attention.

### The amber (`#eab308`)

The RockCap primary. Used for:

- **Brand presence** (logo wordmark, lock-in actions)
- **Prospect entity type** (prospects are the top-of-funnel surface)
- **Active interaction signal** (drag/resize handle while dragging, command palette focus)

Do NOT use the amber for ordinary CTAs, links, or hover states. It's reserved.

### Entity colors

Every product entity has a color. These show up on tab indicators, type badges, and entity icons. **Treat them as a closed set** — adding a new entity type means adding a color to `colors.entityTypes` and `themes.ts`, not picking one ad hoc:

| Entity        | Color                                | Meaning                                                              |
| ------------- | ------------------------------------ | -------------------------------------------------------------------- |
| Dashboard     | grey (`#666` dark / `#737373` light) | Neutral, default surface                                             |
| Prospect      | amber (`#eab308`)                    | Top-of-funnel candidate; needs attention; pre-engagement             |
| Client        | green (`#22c55e`)                    | Engaged borrower; an active relationship                             |
| Lender        | teal (`#14b8a6`)                     | External party providing capital (BDM-fronted)                       |
| Project       | indigo (`#6366f1`)                   | A specific financing deal in execution                               |
| Deal          | blue (`#3b82f6`)                     | HubSpot pipeline deal (pre-project commerce container)               |
| Contact       | purple (`#a855f7`)                   | People (borrowers, BDMs, advisers)                                   |
| Cadence       | orange (`#f97316`)                   | Outreach orchestration (the autonomous-fire engine)                  |
| Approval      | red (`#ef4444`)                      | Operator-gate items requiring action                                 |
| SkillRun      | cyan (`#06b6d4`)                     | Skill execution audit record                                         |
| Analytics     | yellow (`#facc15`)                   | Read-only reporting surfaces                                         |

The order in the table reflects the funnel hierarchy: **Prospect → Client → Project**, with **Cadence + Approval + SkillRun** as orchestration entities and **Lender + Contact** as relationship entities.

### Status colors

For prospect / deal / skill / cadence state on operator surfaces:

| Status        | Color  | Use                                                                           |
| ------------- | ------ | ----------------------------------------------------------------------------- |
| Drafted       | amber  | Skill produced output, awaiting operator review (action item)                 |
| Revision      | orange | Operator requested skill rework (active operator/skill loop)                  |
| Active        | blue   | In flight (cadence firing, skill running, project execution)                  |
| Replied       | purple | Quality check moment (inbound received, intent classified, awaits routing)    |
| Engaged       | cyan   | Meeting booked / substantive conversation; warm                               |
| Promoted      | green  | Positive outcome (prospect became active client; deal won)                    |
| Parked        | grey   | Dormant but alive (long-term wakeup queue)                                    |
| Lost          | dim    | Terminal closed-lost (opted out / cadence exhausted / explicit decline)       |
| Skipped       | grey   | Cadence skipped a fire (no fresh evidence; "evidence or skip" rule)           |

These status colors map cleanly to RockCap state machines: prospect state, cadence row state, skillRun state, project dealPhase.

## Typography philosophy

Two type families do all the work:

- **`system-ui` sans** — labels, UI chrome, narrative copy.
- **`ui-monospace` mono** — numbers, IDs, timestamps, tabular data, CH numbers, the `<Label>` primitive.

The size scale is **dense** (9px–36px). This is intentional — RockCap is information-dense and runs on big screens. Don't push for "more comfortable" reading sizes without specific user evidence; airy whitespace reads as marketing fluff to the target user.

**Weight discipline:** large metric values use `fontWeight.light` (300), not bold. The size carries the emphasis; weight stays calm. Bold is reserved for buttons and active states where it must compete with siblings.

## Surface philosophy

The light theme is the **canonical default** for operator comfort. Dark mode is supported via the header theme toggle and persists per user.

**Layered depth via background tokens, not shadow:**

- `bg.base` — page background (`#ffffff` light / `#0a0a0a` dark)
- `bg.light` — elevated chrome — header, sidebar areas (`#fafafa` / `#0f0f0f`)
- `bg.card` — content surfaces — cards, panels (`#ffffff` / `#111111`)
- `bg.cardAlt` — secondary card surface — canvas background under widgets (`#f5f5f5` / `#0d0d0d`)

Shadows exist (drag state, modal), but they're a _signal_ of interaction, not a default style. A resting card has no shadow.

**Borders over shadows for separation.** `border.default` is the workhorse — visible but quiet. Never use a thicker border to "emphasize" something; use color and color alone.

## Spacing & rhythm

The 4px-base scale (`spacing[1]` = 4, `spacing[2]` = 8, `spacing[4]` = 16) drives all layout. Avoid raw pixel values in component code — reach for the token first. Common cadence:

- **8px** gap between primitives in a row.
- **16px** padding inside a card.
- **24px** between page sections.
- **64px** for empty states or hero spacing.

## Borders & corners

Sharpish. `borderRadius.md` (4px) is the default. `borderRadius.lg` (8px) for cards that need to feel distinct (rare). Never `full` for content — only for status dots and avatars.

**1px borders, 1px grid gaps.** The visual signature is the precise grid. Don't fight it with thick separators.

## Logo & wordmark

(To be added when RockCap logo files are finalised.)

The Header component will switch automatically via `theme.logo`. Don't hardcode logo paths in feature code; use `<Header>` or read `theme.logo` from `useTheme()`.

## Motion philosophy

Motion is **mechanical, not playful**. Everything uses linear `ease` curves at 100–250ms. No "spring" physics, no easing-elastic, no parallax. The interface should feel like CAD software, not a consumer app.

Duration tokens (`transitions.fast` = 100ms, `.normal` = 150ms, `.slow` = 200ms) are the only durations to use. If a value feels off, change the token — don't introduce a one-off ms value.

## When in doubt

Look at the prospects CRM (`src/app/(desktop)/prospects/`) — once it lands as part of the v1.2 rework, it becomes the reference implementation. Any new page should feel visually consistent with it.

---

**Open for review:** the prospect amber as brand primary (does it clash with the cadence orange?), the entity color set (Lender vs Supplier semantic), the typography scale's lower bound (9px is aggressive — likely fine on desktop but may need revisit if RockCap ships a tablet operator surface).
