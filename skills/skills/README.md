# Skills

Each subdirectory here is a skill. A skill is a markdown file plus supporting references that tells Claude how to perform a specific workflow in the RockCap way.

Today's skills:

| Skill | Purpose | Status |
|---|---|---|
| `prospect-intel/` | Cold-prospect intelligence and template-mapped reachout. Step 1 of the deal lifecycle. | first draft |

Planned next:

- `qualify-and-draft/` — step 2 of the lifecycle: personalised first-touch reply after inbound interest, with gap flagging.
- `cadence-fire/` — consumes the cadence engine's fire events and produces approval-staged touches.
- `classification-critic/` — lifts the V3 critic-agent decision logic out of the app into a skill (BL-2.10, BL-6.5).
- `terms-comparison/` — normalises heterogeneous term sheets into a common schema and produces a recommendation grounded in the underwriting model.
- `ic-paper-drafter/` — drafts the IC paper from the deal's full context plus the operator's narrative angles.

Each skill follows the shape and rules in `../CONVENTIONS.md`. SKILL.md is the entry point; references are loaded by name when the workflow needs them.
