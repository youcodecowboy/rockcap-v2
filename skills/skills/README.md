# Skills

Each subdirectory is a skill — a `SKILL.md` plus supporting references that tells Claude how to perform a specific workflow the RockCap way.

**For tool discovery, see `../CATALOGUE.md`.** This README is the SKILL index.

**For the prospect flow gates (intel → accept → draft → approve), see [`prospect-pipeline-gates.md`](./prospect-pipeline-gates.md).**

All skills follow the shape and rules in `../CONVENTIONS.md`.

## Skill maturity status

| Skill | Status | Last hardening |
|---|---|---|
| `prospect-intel/` | **v3 hardened** | v1.3 Sprint A predecessor + Sprint E refinement; v3.1 People-tab contract 2026-05-30; **v3.2 intel-only + Definition-of-Done manifest** (outreach split out behind the accept gate) 2026-05-30; **v3.3 clientIntelligence doc enrichment** (Output #2 wired via the now-exposed `intelligence.updateClientIntelligence`) 2026-05-31 |
| `outreach-draft/` | **v2 hardened** | **NEW 2026-05-30** — composes the cold-outreach cadence package for prospects the operator has marked ready (lifecycle step 1.5; the old prospect-intel step 11) |
| `client-context-capture/` | **v2 hardened** | **NEW 2026-05-31** — operator-input lane: turns a freeform brain-dump (meetings, calls, personal knowledge) into structured intel + a running `contextMarkdown` reference. Parallel system, not a lifecycle step |
| `qualify-and-draft/` | **v2 hardened** | v1.3 Sprint B |
| `meeting-prep/` | **v2 hardened** | v1.3 Sprint C |
| `meeting-capture/` | **v2 hardened** | v1.3 Sprint E |
| `lender-intel/` | **v2 hardened** | v1.3 Sprint F |
| `cadence-fire/` | **v1.1** | substrate / runtime contract — not a Claude-invokable skill |
| `deal-intake/` | **v2 hardened** | v1.4 Sprint I |
| `deal-triage/` | skeleton | — |
| `terms-package-build/` | skeleton | — |
| `terms-comparison/` | skeleton | — |
| `ic-paper-drafter/` | skeleton | — |
| `info-request-grader/` | skeleton | — |
| `client-decision-capture/` | skeleton | — |
| `case-study-author/` | skeleton | — |
| `monitoring-watcher/` | skeleton | — |
| `classification-critic/` | skeleton | — |
| `document-author/` | **v1** | docgen substrate v1 (2026-05-29) |
| `corporate-structure/` | skeleton (spec + libs landed) | — |

**v2 hardened** means: workflow retargeted at v1.3 MCP tool surface, `## Dedup` section present, `## Cadence package` section present (or explicit "doesn't produce one"), reference files authored, failure modes enumerated, multiple invocation paths documented. Skeleton skills predate this template; usable as intent statements but not operationally hardened.

## The deal lifecycle (15 steps → skills map)

The brief's deal lifecycle maps to skills below. Some steps share a skill; some skills span more than one step.

| Step | Topic | Skill | Status |
|---|---|---|---|
| 1 | Prospecting + cold intel (intel-only) | [`prospect-intel/`](./prospect-intel/) | v3.2 |
| 1.5 | Cold-outreach drafting (gated behind operator accept) | [`outreach-draft/`](./outreach-draft/) | v2 |
| 2 | Qualification + first-touch reply | [`qualify-and-draft/`](./qualify-and-draft/) | v2 |
| 3 | Prospect cadence tracking | [`cadence-fire/`](./cadence-fire/) | v1.1 substrate |
| 4 | Reply handling | [`qualify-and-draft/`](./qualify-and-draft/) (continuation) | v2 |
| 5a | Pre-call meeting prep | [`meeting-prep/`](./meeting-prep/) | v2 |
| 5b | Post-call meeting capture | [`meeting-capture/`](./meeting-capture/) | v2 |
| 6 | Post-meeting nurture | [`cadence-fire/`](./cadence-fire/) | substrate |
| 7 | Deal data intake + underwriting model | [`deal-intake/`](./deal-intake/) | v2 |
| 8 | Indicative terms + lender submission pack | [`terms-package-build/`](./terms-package-build/) | skeleton |
| 9 | Terms comparison + recommendation | [`terms-comparison/`](./terms-comparison/) | skeleton |
| 10 | Client decision capture | [`client-decision-capture/`](./client-decision-capture/) | skeleton |
| 11a | IC paper draft | [`ic-paper-drafter/`](./ic-paper-drafter/) | skeleton |
| 11b | Lender info-request grading | [`info-request-grader/`](./info-request-grader/) | skeleton |
| 12 | Deal triage (daily sweep) | [`deal-triage/`](./deal-triage/) | skeleton |
| 13 | Case study (post-close) | [`case-study-author/`](./case-study-author/) | skeleton |
| 14 | Monitoring (post-credit phase) | [`monitoring-watcher/`](./monitoring-watcher/) | skeleton |
| 15 | (reserved) | | |

**Parallel systems** (not deal-lifecycle steps):
- [`lender-intel/`](./lender-intel/) — v2 hardened. Lender appetite capture + matching. Used by terms-package-build (step 8) to shortlist lenders.
- [`classification-critic/`](./classification-critic/) — skeleton. V4 document-pipeline critic.
- [`document-author/`](./document-author/) — **v1**. Document-generation substrate: composes a document under prose guardrails and stages a `document_publish` approval (renders via `/api/documents/generate`, files to the client on approval). The deal-doc skills (terms-package-build, ic-paper-drafter, case-study-author) will build on it.
- [`corporate-structure/`](./corporate-structure/) — skeleton (spec + libs landed). Discover, stress-test, and chart a prospect/borrower's corporate structure; produces a StructureGraph + SVG for the Intel tab and lender briefs. Invoked by prospect-intel step 8b and directly by operator.
- [`client-context-capture/`](./client-context-capture/) — **v2 hardened**. The operator-input lane for primary knowledge (meetings, calls, personal knowledge). Decomposes a freeform dump into manual `knowledgeItems` + conservative profile patches + a running `contextMarkdown` reference on clientIntelligence/projectIntelligence; can also drop a note. Confirms client-vs-deal scope before writing. Writes directly (operator input is primary truth — no approval gate). Standalone-invokable.

## How operator-agent should select a skill

The cookbook patterns in `../CATALOGUE.md` cover the common workflows. The 5 v2-hardened skills are the operationally-ready ones; their SKILL.md files document multiple invocation paths so Claude Code can recognise when to invoke them:

- **prospect-intel**: operator says "run prospect-intel on {company name / CH number}" OR Claude Code surfaces a candidate via `companies.listUnprocessed`. Intel-only — it never drafts outreach.
- **outreach-draft**: operator says "draft outreach for {prospect}" (single) OR "draft all outreach for ready companies" (batch). Only drafts for prospects the operator has marked ready (`outreachReadyAt` set); enumerates the batch pool via `client.listOutreachReady`. See [`prospect-pipeline-gates.md`](./prospect-pipeline-gates.md).
- **client-context-capture**: operator says "I met with {client}, here's context …" / "add context to {client/deal}: …" / "remember this about {client} …". Decomposes the dump into structured intel + a running `contextMarkdown` reference; confirms client-vs-deal scope first. Use when the operator is feeding in primary knowledge, not asking a question.
- **qualify-and-draft**: classifier-routed (reply intent = `info_question`) OR operator says "draft a response to {prospect}'s reply" OR operator says "draft a follow-up for {client} mentioning X"
- **meeting-prep**: classifier-routed (reply intent = `book_meeting` → `/api/meeting-prep-respond` route) OR operator says "prep me for the {meeting}"
- **meeting-capture**: operator says "capture the {meeting}: {pasted notes}" OR Fireflies auto-sync (when Pub/Sub provisioned)
- **lender-intel**: capture mode (operator after BDM call) OR matching mode (auto-triggered by terms-package-build OR operator says "which lenders for this deal?")

## Skill-side conventions (every v2-hardened SKILL.md has these sections)

1. Header — what the skill does + last hardening date
2. `## Trigger` — invocation paths (typically 2-3)
3. `## Inputs` — required + optional
4. `## Dedup` — dedupKey strategy + window + on-duplicate behaviour
5. `## Cadence package` — explicit declaration (produces / doesn't produce); shape if applies
6. `## Outputs` — what gets persisted + what doesn't
7. `## High-level workflow` — numbered steps using v1.3 tool names
8. `## Style rules` — voice + format constraints per CONVENTIONS.md
9. `## Tool dependencies` — MCP tools used + deferred (captured in skillRun.complete.gaps)
10. `## What goes wrong` — enumerated failure modes
11. `## References` — list of references/*.md loaded during workflow

When hardening a skeleton skill: follow this template + harden the SKILL.md + author 1-2 reference files in `references/` + update this README's status table in the same commit.

## Hardening order (recommended for the 9 remaining skeletons)

Ranked by operator-cycle leverage:

1. **terms-package-build** (step 8) — produces the lender brief package. High leverage: pairs with lender-intel matching to operationalize lender outreach.
2. **terms-comparison** (step 9) — pairs with terms-package-build; activated when indicative terms come back.
3. **ic-paper-drafter** (step 11a) — when a lender wants to proceed; produces the IC submission.
4. **client-decision-capture** (step 10) — when client chooses a lender from the comparison.
5. **info-request-grader** (step 11b) — lender-side document requests; can be paired with checklist tooling.
6. **monitoring-watcher** (step 14) — post-credit phase; lower urgency until first deal closes.
7. **case-study-author** (step 13) — post-close; lowest urgency until first deal closes.
8. **deal-triage** (step 12) — daily sweep; useful once deal-intake creates a real pipeline.
9. **classification-critic** — parallel system; lower priority than deal-lifecycle skills.

## Adding a new skill

1. Create `skills/skills/<skill-name>/SKILL.md` following the v2 template above.
2. Add `references/` subdirectory if the skill needs supporting docs.
3. Update this README's status table + lifecycle map in the same commit.
4. Add any new MCP tools to `../CATALOGUE.md` in the same commit.

## Sub-skills + corpora + templates

- `../sub-skills/` — Claude-side primitives reused across skills (e.g., `resolve-company.md`, `score-lender-match.md`, `resolve-related-entities.md`, `compose-outreach-hook.md`). Documented separately from full skills.
- `../corpora/` — anonymised exemplars per skill. Currently sparse; populated as we accumulate good runs to draw from.
- `../templates/` — XLSX / DOCX / PDF templates referenced by document-producing skills (terms-package-build, ic-paper-drafter).
- `../shared-references/` — cross-skill references (UK property finance glossary, approval payload shapes, etc.). Outreach voice + drafting: `rockcap-outreach-voice.md` (Alex Lundberg's canonical voice), `hook-ladder.md` (10 ranked hook types), `lender-tiers.md` (park/soften gate), `rockcap-regional-activity.md` + `sender-geography.md` (geographic hooks). Document generation: `document-house-style.md` (voice + HTML composition rules for generated docs), `doc-type-company-one-pager.md` (company one-pager guardrail).
