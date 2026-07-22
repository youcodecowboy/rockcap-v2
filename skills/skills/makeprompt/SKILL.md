---
name: makeprompt
description: Craft a comprehensive, target-specific prompt whenever Rayn asks for a prompt
  to use somewhere ELSE — another AI, another platform, another person's Claude. Use this
  skill whenever he says "give me a prompt", "write/make/draft a prompt for X", "prompt
  this for me", "I need a deep research prompt", "project instructions for claude.ai",
  "system prompt for", or pastes a rough prompt and asks to improve it — even casually
  phrased. Targets: Gemini Deep Research fires (comps hunts, market research), claude.ai
  Project system prompts (XML house style), and a generic path for any other model or
  recipient (Alex's Claude, app skill-forge, GPT). Do NOT use when Rayn asks me to just
  DO the task in-session — only when the deliverable is the prompt itself.
---

# makeprompt — RockCap prompt crafting

The deliverable is a **prompt**, not the task's answer. The prompt will run somewhere without RockCap context loaded (a fresh Gemini window, a new claude.ai project, someone else's session), so everything the target needs must be IN the prompt — assume it knows nothing about RockCap, the deal, or house rules.

## Workflow

1. **Identify the target** — one of:
   - `gemini-research` — a Gemini Deep Research fire (comps transaction hunts, market/lender research). Read `references/gemini-research.md`.
   - `claude-project` — a claude.ai Project system prompt / project instructions. Read `references/claude-project.md`.
   - `generic` — anything else (another model, Alex's Claude, the RockCap app skill-forge, GPT). Read `references/generic.md`.

   Infer from context; if genuinely ambiguous, ask ONE question ("Is this for a Gemini research run or a claude.ai project?"). Never ask more than one.

2. **Assemble the task facts** from the conversation and any files mentioned before drafting: goal, scheme/deal specifics (names, postcodes, unit counts, dates), constraints, desired output shape, and what "good" looks like. Pull real details — a prompt with actual postcodes and date windows beats a template with placeholders. Only ask Rayn for a fact if it's load-bearing and genuinely missing.

3. **Read the matching reference file** and build the prompt on its skeleton. The skeletons encode what each target platform needs to perform well and the RockCap constraints that must travel with the prompt.

4. **Self-check before delivering** — the prompt must:
   - state the objective in the first two lines (not buried after a persona)
   - contain every RockCap constraint the task needs, spelled out (the target can't read our CLAUDE.md)
   - define the output format explicitly (columns, sections, or structure — never "summarise your findings")
   - give a success condition / stopping criterion
   - contain NO fluffy persona padding ("You are a world-class expert...") — one functional role line at most
   - use UK English and UK property/finance conventions (£, DD/MM/YYYY) where the content is RockCap work
   - instruct the target to **disclaim uncertainty rather than guess** — missing data gets flagged, never filled
   - for error-prone or multi-part tasks: decompose into staged subtasks, and keep creation and validation
     separate — a "fresh eyes" verification pass that did not produce the answer it is checking
     (full source pattern: `references/metaprompt-source.md`)

5. **Deliver in a fenced code block** for copy-paste, followed by 2–3 lines max: anything Rayn should fill in or vary per use. No essay about the prompt.

## Exemplar promotion (how this skill gets better)

Each reference file ends with a **Proven exemplars** section, empty at birth. Exemplars are EARNED, never fabricated: when a prompt built by this skill performs well in the field, Rayn says "promote that prompt" — append it verbatim to the matching reference's exemplar section with the date and one line on what it produced. Once an exemplar exists, mirror its shape when drafting for that target. Cap at 2 exemplars per target (newest wins; retire the older) so the reference stays lean. Never add an exemplar that wasn't field-validated — laundering a merely plausible prompt into an exemplar defeats the whole mechanism.
