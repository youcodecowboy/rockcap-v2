# RockCap Frontend — Design System

This directory is the **written canon** for the RockCap web frontend. New features must compose from these primitives and patterns rather than reinventing them. When a screen feels like it needs something new, first check whether one of the existing patterns or page templates covers it — most of the time it does.

The canon is adapted from the Groovy frontend canon (a sibling product), with RockCap-specific entity color mappings and module naming. The design **posture** is identical: dense, calm, technical surfaces that communicate competence at a glance.

## How to use these docs

| If you are…                               | Start with                                            |
| ----------------------------------------- | ----------------------------------------------------- |
| Onboarding to the frontend                | `branding.md` → `patterns.md`                         |
| Building a new feature page               | `page-templates.md`                                   |
| Choosing colors, fonts, spacing           | `tokens.md`                                           |
| Wiring up navigation / tabs / dashboard   | `patterns.md`                                         |
| Looking for entity color reference        | `branding.md → Entity colors`                         |

## Document index

- **[branding.md](./branding.md)** — Brand identity, voice, light/dark mode posture, what the accents _mean_, the RockCap entity color set.
- **[tokens.md](./tokens.md)** — Colors, typography, spacing, grid. Reference for every value with semantics.
- **[patterns.md](./patterns.md)** — Compositional patterns: app shell, navigation, tabs, theming, loading, toasts, granularity rule, breadcrumbs.
- **[page-templates.md](./page-templates.md)** — Reference page shapes (list, detail, builder, dashboard, form). New features slot into one of these.

## How this canon relates to code

```
model-testing-app/
├── src/components/ui/  ← shadcn primitives (Button, Card, Table, etc.)
├── src/components/     ← RockCap-specific composed components
├── src/app/(desktop)/  ← page-level routes, follow page-templates.md
├── src/app/(mobile)/   ← mobile shell (separate canon — out of scope here)
└── src/lib/            ← utilities + atomic tool registry
docs/
└── frontend-standards/ ← THIS DIRECTORY — written canon
```

**The code wins ties.** If a doc and the code in `src/components/` disagree, the code is right and the doc is stale — file a fix.

## Posture: canon, not law

The RockCap product surfaces (prospects CRM, deal lifecycle, lender pipeline, document filing) will stress different parts of this canon. Treat sections marked **Open for review** as places where evidence may justify change. Treat the rest as the path of least resistance — depart from it only with reason.

## Light and dark mode

RockCap supports **both light and dark modes** with light as the default for operator comfort during long-running review sessions. Theme is user-toggleable via the header toggle and persists per user. Every component MUST use `useColors()` from the theme provider — never hardcode hex values or import the static `colors` object.

## Contributing

1. **Updating a token, primitive, or component?** Update the corresponding doc in the same PR.
2. **Adding a new pattern?** Document it in `patterns.md`.
3. **Adding a new page template?** Document it in `page-templates.md`. If the template recurs three or more times, promote it to a reusable layout component under `src/components/layouts/`.
4. **Deviating from canon?** Open a discussion before merging — the cost of a one-off is high because every deviation makes the next reader less able to predict the codebase.

## Heritage

This canon is forked from the [Groovy frontend canon](https://groovy.example) authored by the same team. The Groovy docs use Groovy's entity vocabulary (Workflow, Item, Order, Campaign, Customer, Supplier). The RockCap adaptation rewrites the entity color table for RockCap's domain (Prospect, Client, Project, Deal, Contact, Lender, Cadence, Approval, SkillRun, Analytics) but preserves the design philosophy, the typography scale, the spacing tokens, the pattern set, and the page templates verbatim.
