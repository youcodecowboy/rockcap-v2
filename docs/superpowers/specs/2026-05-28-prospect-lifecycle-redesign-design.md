# Prospect Lifecycle Redesign

- **Date:** 2026-05-28
- **Status:** Approved design (pending spec review)
- **Author:** Claude Code session (dogfood walkthrough on Homes by Carlton)
- **Supersedes / extends:** the prospect-board portions of `2026-05-25-prospects-crm-rework-design.md`

## Problem

A live end-to-end run of `prospect-intel` on a fresh HubSpot lead (Homes by Carlton) surfaced three connected failures:

1. **No shared vocabulary.** The deal-type classification the intel produces (`development_finance` / `bridging` / `term_loan`) is not the language the operator uses, the cadence has its own status notion, and the `/prospects` board exposes the raw 8-state machine. Four partial languages for one journey.
2. **Table sprawl.** `/prospects` renders 6-7 parallel sections (Candidates, Needs Review, Needs Revision, Active, Replied, plus the recently-added Researched), all "for the same thing". It reads as noise rather than a pipeline.
3. **Work can vanish.** A prospect that completes intel but is blocked from outreach (no contact email, Apollo unconfigured) never gets a `prospectState`, so it falls through every state-keyed section and disappears from the board, despite its intel persisting. To the operator that reads as "nothing happened".

The redesign establishes one canonical lifecycle vocabulary that the intel, the cadence, and the UI all speak, simplifies the board to two tabs, and makes "researched" a real state so completed work is never invisible.

## Canonical vocabulary (the spine)

Everything below references these terms.

### Lifecycle

Two top-level groupings, surfaced as tabs:

- **New** — raw HubSpot-synced leads, not yet engaged. Source: `companies.listUnprocessed` (the `companies` table).
- **Prospects** — engaged in Claude Code (intel has run). Source: `clients` rows with a `prospectState`.

Within **Prospects**, the status ladder:

| Rung | Meaning | Set by |
|---|---|---|
| Researched | Intel done, no outreach yet | prospect-intel on completion |
| Drafted | Emails written, awaiting approval (carries a contact flag) | cadence package staged |
| Outreach active | Approved, cadence sending, awaiting reply | package approval / firing |
| Replied | Contact responded | inbound reply ingest |
| Meeting booked | Call scheduled | operator / meeting-prep |
| Parked / Lost | Holding lane (collapsed) | operator |

Exit: **Promote to client** moves the prospect out of Prospects into the Client tier.

### Deal types

Exactly four, replacing the intel's internal codes:

| Canonical term | Replaces intel code |
|---|---|
| New development | `development_finance` |
| Bridging | `bridging` |
| Existing asset | `term_loan` |
| Unclassifiable | `unclassifiable` |

## Design

### Thread 1 — state model (Approach C: hybrid)

- Add one value, **`researched`**, to the `prospectState` enum. All existing values stay.
- **prospect-intel sets `researched` on `skillRun.complete`** (the root-fix; retires the derived Researched section shipped in PR #20).
- UI relabels, no enum change: `engaged` displays as **"Meeting booked"**; `needs_revision` becomes **a flag on Drafted**, not its own section.
- `New` tab reads `companies.listUnprocessed`; `Prospects` tab reads `clients` with any `prospectState` (now including `researched`).
- No bulk data migration. Existing rows keep their states; only the enum gains a value and the UI changes its grouping/labels.

### Thread 2 — intel output (mandatory, not optional prose)

Every `prospect-intel` run must emit, in the `intelMarkdown` report and as structured facts:

- **Deal type:** one of the four canonical terms + confidence (High/Medium/Low) + one-line rationale.
- **Deal size:** an evidence-derived range. Preferred derivation: scheme pipeline (units x regional sale value -> indicative GDV -> loan range) or existing charge sizes. Falls back to a coarse band keyed on deal type when no signal exists. Always stamped with confidence and a "based on X" provenance line. Never a naked number.
- **Findings/flags:** a structured list of what was and was not found (contact email, CH data, officers/PSCs, website scrape, SPV charge dispersion). This feeds the detail-page flag banner.
- On completion: set `prospectState = researched` and persist deal-type + deal-size facts via `clients.setProspectFacts` / `intelligence.addKnowledgeItem`.
- `prospect-intel/SKILL.md` and its references (`bridging-vs-developer.md`, `intel-report-template.md`) are updated to use the canonical terms and to make deal-type, deal-size, and findings required outputs. This is also what lets a "let's run the gauntlet" startup prompt guide the operator in consistent language.

### Thread 3 — cadence: always draft, flag the contact

- Step 11 of prospect-intel **always** drafts the 4-touch package content, whether or not a usable contact exists.
- **Contact + valid email found:** create the cadence rows (Drafted, `packageApprovalStatus: pending`) and flag **"email found - review"**.
- **No usable contact:** the drafts are still produced and reviewable, flagged **"drafted, no contact - add an email to send"**. Outreach stays blocked until a contact is attached.
- **Open implementation choice (resolve in the plan):** how to hold a contactless draft. Recommended default: allow `cadence.create` to accept a row with no `contactId`, `isActive: false`, `packageApprovalStatus: "needs_contact"`, carrying the `preDraftedTouch`. The existing fire-time guard already refuses to send without a valid email, so this is safe; attaching a contact later flips the status to `pending`. The alternative (storing drafts on the skillRun) is rejected because it splits draft storage across two places.

### Thread 4 — Prospects UI (two tabs)

Replace the stacked sections in `src/app/(desktop)/prospects/page.tsx` with two tabs:

```
[ New (12) ]   [ Prospects (5) ]

New        raw HubSpot leads                         -> [ Run intel ]
           Company           Industry      Synced

Prospects  Company           Deal type  Est. size  Status        Emails  Last reply  Flags
           Homes by Carlton  New dev    £8-12m     Researched    -       -           (!) no contact
```

- The Prospects tab is a single table (status as a column / groupable), columns: Company, Deal type, Est. size, Status (ladder rung), Emails sent, Last reply, Flags.
- Flags column shows chips (no contact, missing CH data, etc.).
- Row click opens the detail page.
- The detail-page **Overview** gains a flag banner at the top: **"all found"** or **"N items need attention"** plus the relevant one-click action (e.g. "add a contact").
- The existing section components are repurposed: `CandidatesSection` -> the New tab; the per-state sections collapse into the Prospects table; `ResearchedSection` is retired (researched is now a real rung).

### Thread 5 — promote to client

- A **"Promote to client"** button on the prospect detail page, surfaced once status reaches Meeting booked.
- Action: call `client.activate` (sets `status: active`, `prospectState: promoted`). The prospect leaves the Prospects tab and appears in the Client section.
- The underlying tool already exists; this thread is the button plus the clean hand-off.

## Scope boundaries

In scope: the five threads above (vocabulary, state model, intel output, cadence-draft behaviour, two-tab UI, promote button).

Out of scope (unchanged, behind their existing gates):

- Autonomous cadence firing / the dispatcher cron.
- The Gmail send path and its kill switches.
- A full enum migration (Approach B) - explicitly deferred in favour of the hybrid.
- Apollo configuration (`APOLLO_API_KEY`) - an environment task, tracked separately.

## Affected areas (to guide the plan)

- `convex/schema.ts` and `convex/prospects.ts` - add `researched` to the `prospectState` union.
- MCP surface - add `researched` to the `prospect.transitionState` enum; prospect-intel calls it on completion.
- `skills/skills/prospect-intel/SKILL.md` + references - canonical terms, required outputs, set `researched` on completion.
- `skills/CATALOGUE.md` - reflect any tool/enum changes in the same commit.
- Frontend - rewrite `prospects/page.tsx` to tabs; repurpose section components; update the detail Overview tab (flag banner + promote button).
- Cadence - resolve the contactless-draft hold (per Thread 3) in `convex/cadences.ts` / `cadence.create`.

## Acceptance criteria

1. A fresh HubSpot lead appears under **New**; running intel moves it to **Prospects / Researched** and it is never invisible.
2. Every completed intel run shows a deal type (one of four) and a deal-size range with a "based on X" line.
3. A prospect with no contact still shows drafted emails under **Drafted** with a "no contact" flag, never silently blocked.
4. `/prospects` shows two tabs, no stacked duplicate tables.
5. A Meeting-booked prospect can be promoted to a client in one click and leaves the Prospects tab.
6. `npx next build` passes; changes committed with the `[app]` / `[skills]` / `[both]` prefix convention.
