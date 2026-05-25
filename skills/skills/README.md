# Skills

Each subdirectory here is a skill. A skill is a SKILL.md plus supporting references that tells Claude how to perform a specific workflow the RockCap way. SKILL.md is the orchestration file; per-skill references hold the deeper context.

All skills follow the shape and rules in `../CONVENTIONS.md`.

## The deal lifecycle (15 steps)

The brief's 15-step deal lifecycle maps to the skills below. Some steps share a skill; some skills span more than one step.

| Step | Topic | Skill |
|---|---|---|
| 1 | Prospecting and cold intel | [`prospect-intel/`](./prospect-intel/) |
| 2 | Qualification and first-touch outreach | [`qualify-and-draft/`](./qualify-and-draft/) |
| 3 | Prospect cadence tracking | [`cadence-fire/`](./cadence-fire/) (handles all 7 cadence types) |
| 4 | Reply handling | [`qualify-and-draft/`](./qualify-and-draft/) (continuation) |
| 5 | Pre-call refresh and post-call capture | [`meeting-prep/`](./meeting-prep/) and [`meeting-capture/`](./meeting-capture/) |
| 6 | Post-meeting nurture | [`cadence-fire/`](./cadence-fire/) |
| 7 | Deal data intake and underwriting model | [`deal-intake/`](./deal-intake/) |
| 8 | Indicative terms and lender submission pack | [`terms-package-build/`](./terms-package-build/) |
| 9 | Terms comparison and recommendation | [`terms-comparison/`](./terms-comparison/) |
| 10 | Client decision capture | [`client-decision-capture/`](./client-decision-capture/) |
| 11 | IC application support | [`ic-paper-drafter/`](./ic-paper-drafter/) and [`info-request-grader/`](./info-request-grader/) |
| 12 | Timeline and chase orchestration | [`deal-triage/`](./deal-triage/) |
| 13 | Deal closure and case study | [`case-study-author/`](./case-study-author/) |
| 14 | Project monitoring | [`monitoring-watcher/`](./monitoring-watcher/) |
| 15 | Existing client cadence | [`cadence-fire/`](./cadence-fire/) (client_checkin type) |

## Parallel systems

| System | Skill |
|---|---|
| Lender intelligence and BDM relationship management | [`lender-intel/`](./lender-intel/) |
| Document classification critic (lifted from V3 pipeline) | [`classification-critic/`](./classification-critic/) |

## Status

All 14 skills above have a SKILL.md authored. Depth varies: prospect-intel has two fully-authored references (`lender-dna-from-charges.md`, `bridging-vs-developer.md`, `template-mapped-reachout.md`); other skills reference future per-skill references that have not yet been authored. Per-skill references get fleshed out as we discover patterns from operator use.

The skills will not be runnable until the MCP server (BL-5.1) and per-user MCP token issuance (BL-5.9) are built. Until then, SKILL.md files are planning artefacts and reference material; the workflows describe what operators do manually until automation arrives.

## What is not yet a skill

Several functions are deliberately not skills, either because they belong in the app (deterministic tools) or because they remain operator-by-hand work in v1:

- HubSpot data review and editing: operators do this in the app UI; not skill-orchestrated.
- Document upload and filing: handled by the V4 pipeline and the `placementRules` engine; the `classification-critic` skill reviews but does not initiate.
- Calendar management: handled by the Google Calendar integration in the app; meeting-prep reads, does not write events.
- Pure CRUD over CRM entities (creating clients, adding notes, updating tasks): tools, not skills.

The shape of "skill versus tool" rule remains: skill if it requires RockCap-specific judgement; tool if it's mechanical CRUD or external integration plumbing.
