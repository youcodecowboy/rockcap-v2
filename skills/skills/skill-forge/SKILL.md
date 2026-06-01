# skill-forge

**Last hardening:** NEW 2026-06-01 (v1)

The skill that improves the other skills. `skill-forge` is how a non-technical
operator safely edits, hardens, and creates RockCap skills — refining workflows,
adding or improving templates, and turning feedback on a bad (or good) output
into a durable change — without touching the wiring that connects skills to the
app, and without ever referencing a tool that doesn't exist.

It owns the safe-editing loop end to end: **sync → refresh the tool list →
edit → validate (hard gate) → save to GitHub.** The operator just describes
what they want in plain language; skill-forge handles git and validation
invisibly.

> **You never type git commands.** Pulling the latest and pushing your changes
> happens automatically. Your job is to describe the improvement; skill-forge's
> job is to make it safely and get it to GitHub so the whole team has it.

## Trigger

Invoke when the operator wants to change the skills themselves (not run them):

- "Improve the `lender-intel` skill — it should always check appetite history first."
- "The brief it generated read too formal. Here's the output — fix the skill so it doesn't do that again." *(paste the output)*
- "Add a new template for {document type}." / "Refine the comps template."
- "Create a new skill for {workflow}."
- "Harden the `terms-comparison` skeleton."

Do **not** invoke skill-forge to *run* a workflow against client data — that's
the individual skills (prospect-intel, deal-intake, etc.). skill-forge edits the
markdown that defines those skills.

## Inputs

- **Required:** a plain-language description of the improvement, or the name of
  the skill/template to change.
- **Optional:** a pasted example output (good or bad) to learn from; a specific
  reference file to refine; the target scope (one skill vs a shared reference).

## Dedup

Not applicable. skill-forge is a repository-editing skill, not a client-data
workflow — it does not use the `skillRun` envelope and does not dedup. Each
invocation is an independent edit. (Concurrency safety comes from git: pull on
start, push immediately on save — see `references/git-workflow.md`.)

## Cadence package

Does not produce one.

## Outputs

- Edited / created markdown under `skills/` (a `SKILL.md`, a `references/*.md`, a
  `shared-references/*.md`, or a `templates/*` file).
- A refreshed `tools-manifest.json` if the tool list changed since last session.
- A commit on `main`, pushed to GitHub — created via `tools/skill-commit.sh`,
  which runs the hard gate first. Nothing is left uncommitted on the laptop.
- Updated `skills/README.md` status table + `CATALOGUE.md` when a skill or tool
  reference materially changes (see Conventions).

## High-level workflow

1. **Sync.** The SessionStart hook already pulled `main`. If unsure, say so and
   re-run `sh tools/hook-session-start.sh`. Never edit on top of stale skills.
2. **Refresh the tool list.** Call `meta.listTools` and write the result to
   `tools-manifest.json` (see `references/refresh-manifest.md`). This is the
   authoritative list of tools that exist in the app right now. Always do this
   before adding or changing any tool reference in a skill.
3. **Understand the ask.** Load the target `SKILL.md` and `../CONVENTIONS.md`,
   plus any reference the change touches. If the operator pasted an output,
   diagnose *which instruction or reference* produced the behaviour before
   changing anything (see `references/feedback-to-change.md`).
4. **Edit** the markdown to make the improvement. Stay inside the guardrails
   (`references/guardrails.md`): only reference tools that are in
   `tools-manifest.json`; never edit wiring (`.mcp.json`, the server URL,
   `.claude/settings.json`, the `tools/` scripts); keep the v2 section template
   intact when hardening a skill.
5. **Validate (hard gate).** Run `node tools/validate-skills.mjs <changed file>`.
   If it reports an ERROR, fix it — do not attempt to commit. The same gate runs
   automatically at commit time and will block a bad save.
6. **Show the operator** a plain-language summary of what changed and why, plus
   the validation result. Confirm before saving if the change is non-trivial.
7. **Save to GitHub.** Run `sh tools/skill-commit.sh "skill-forge: <what changed>"`.
   This validates again, commits, and pushes to `main`. Report the result.
8. **Keep the index honest.** If you added/removed a skill, update the
   `skills/README.md` status table + lifecycle map in the same commit. If a tool
   reference changed, confirm `CATALOGUE.md` still matches.

## Style rules

- Follow `../CONVENTIONS.md` for any operator-facing or generated text.
- Edits to a `SKILL.md` keep the v2 template sections (Trigger, Inputs, Dedup,
  Cadence package, Outputs, High-level workflow, Style rules, Tool dependencies,
  What goes wrong, References).
- Speak plainly to the operator. Explain *why* (the "insight" voice): "I pulled
  the latest first so you get Marco's overnight change," "that tool doesn't
  exist — the closest real one is `X`." Teaching as you go is part of the job.
- Prefer small, frequent, well-described commits over one large one.

## Tool dependencies

- **MCP:** `meta.listTools` (refresh the manifest). skill-forge does **not**
  call client-data tools — it edits markdown, it does not operate on the book.
- **Local scripts:** `tools/validate-skills.mjs` (hard gate),
  `tools/skill-commit.sh` (validate + commit + push),
  `tools/hook-session-start.sh` (sync).

## What goes wrong

- **Referencing a tool that doesn't exist.** The #1 failure. Mitigated by always
  refreshing the manifest (step 2) and the hard gate (step 5 + commit hook).
  When the validator suggests "closest real tools," pick from those.
- **Editing on stale skills.** Always pull first. If the SessionStart sync
  reported a conflict it could not resolve, STOP and get help — do not force.
- **Touching wiring.** Never edit `.mcp.json`, the MCP server URL,
  `.claude/settings.json`, or `tools/*`. Those connect skills to the app; a
  non-technical operator changing them breaks everyone. If a change seems to
  require it, surface that to an admin instead.
- **Push fails (someone pushed first).** `skill-commit.sh` rebases and retries;
  if it still fails, the work is committed locally and safe — retry the push,
  don't redo the edit.
- **Inventing structure.** When hardening, follow the existing v2 skills as
  models; don't introduce new section schemes.

## References

- [`references/guardrails.md`](./references/guardrails.md) — the hard rules: real tools only, never touch wiring.
- [`references/refresh-manifest.md`](./references/refresh-manifest.md) — how to refresh `tools-manifest.json` from `meta.listTools`.
- [`references/feedback-to-change.md`](./references/feedback-to-change.md) — turning a pasted output into a durable skill change.
- [`references/git-workflow.md`](./references/git-workflow.md) — how sync/save works (so you can explain it to the operator).
- [`../../CONVENTIONS.md`](../../CONVENTIONS.md) — cross-skill voice + style.
- [`../../CATALOGUE.md`](../../CATALOGUE.md) — the human-readable tool catalogue.
