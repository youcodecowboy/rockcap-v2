# Sub-skills

Reusable Claude-side primitives that multiple skills consume. A sub-skill is a smaller markdown file describing a focused, reusable workflow step. Think of these as functions that skills call; the skill is the orchestrator, the sub-skill is the helper.

Currently empty. Planned sub-skills will include:

- `resolve-company` — given a name or a Companies House number, resolve to a canonical company with disambiguation when needed. Used by prospect-intel, qualify-and-draft, and others.
- `attribute-touchpoint` — given an inbound or outbound communication, attribute it to the right person, deal, and thread. Used by Gmail and Fireflies sync handlers.
- `compose-approval` — given a draft payload and a target entity, stage an `approvals` row in the right shape. Used by every skill that produces output that leaves the building.

When a recurring step appears in two or more skills, lift it here.
