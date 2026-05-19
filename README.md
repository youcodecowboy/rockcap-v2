# RockCap

This repository contains the RockCap capital advisory platform: a Next.js + Convex web app, an Expo / React Native mobile client, and (in temporary monorepo form) the Claude skills library that drives the AI layer.

## Layout

```
rockcap-v2/
├── model-testing-app/    Next.js 16 + Convex backend (the deployed app)
├── mobile-app/           Expo / React Native client of the same Convex
├── skills/               Claude skills library, destined for its own repo
├── docs/                 Project docs, plans, decision records, audits
├── hubspot-webhook-app/  HubSpot webhook side project
└── hubspot-cli-temp/     HubSpot CLI scratch
```

Two subprojects share this repo today by design: the app and the skills library. They are conceptually separate systems with different deployment models. The skills tree will split into its own repository in time. The discipline that keeps the eventual split cheap is documented in `skills/inventory/06-monorepo-discipline.md`.

## Subproject READMEs

- App: [`model-testing-app/README.md`](./model-testing-app/README.md)
- Skills library: [`skills/README.md`](./skills/README.md)

## Where to find what

- **Backlog**: [`docs/BACKLOG.md`](./docs/BACKLOG.md). Master view of build work, sequenced into four phases.
- **App audit**: [`skills/inventory/`](./skills/inventory/). Inventory of tools (150), schema (84 tables), backend functions (863), integrations (8), in-app AI logic.
- **Decisions**: [`docs/DECISIONS/`](./docs/DECISIONS/). Architecture decision records.
- **Env vars**: [`docs/ENV_VARS.md`](./docs/ENV_VARS.md). Canonical list with sensitivity grades.
- **Integration patterns**: [`docs/INTEGRATION_PATTERNS.md`](./docs/INTEGRATION_PATTERNS.md). Kill switches, OAuth, touchpoint capture.
- **Schema migration playbook**: [`docs/SCHEMA_MIGRATIONS.md`](./docs/SCHEMA_MIGRATIONS.md). Preview-first, idempotent, reversible.
- **Contributing**: [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md). Commit prefix convention, pre-commit hook setup.

## Running the app

The Next.js app lives in `model-testing-app/`, not at the repo root. To run it:

```
cd model-testing-app
npm install
npx next dev
```

Convex backend functions live in `model-testing-app/convex/` and are deployed via the Convex CLI from inside that directory.

## Commit prefix convention

Every commit prefixes its summary with one of:

- `[app]` for changes to `model-testing-app/` or `mobile-app/`
- `[skills]` for changes to `skills/`
- `[both]` for changes that span both (configuration, root docs, repository-wide rules)

This convention is what makes the eventual repository split cheap. Pure `[app]` and pure `[skills]` commits split cleanly. Mixed `[both]` commits should be rare and intentional. See `docs/CONTRIBUTING.md` for the full convention and pre-commit hook setup.
