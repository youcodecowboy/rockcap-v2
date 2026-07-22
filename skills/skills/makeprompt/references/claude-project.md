# Target: claude.ai Project system prompt

A project prompt is standing infrastructure: it runs on every message in that project for months, usually invisible. It competes for attention with the live conversation, so it must be dense, structural, and free of anything the model would do anyway. Rayn's proven pattern (his own "highest-impact prompt infrastructure" finding): XML-tagged sections with role definition, workflow steps, and context injection points.

## Skeleton

```
<role>
One or two sentences, functional not theatrical: what this project's Claude is, for whom,
producing what. ("You support RockCap, a UK real estate debt advisory firm, in producing
X for Y" — not "You are a world-class expert".)
</role>

<context>
The standing facts every conversation in this project needs: what RockCap is (two-person
UK debt advisory: Alex Lundberg director, Rayn Smid associate), what this project is for,
the deal/scheme background if project-specific. Facts that CHANGE per deal belong in
project files or the conversation, not here — mark those as injection points:
"Deal specifics: see the appraisal summary in project files."
</context>

<workflow>
Numbered steps for the project's core loop(s). One workflow per core task; if the project
has 2–3 task types, name each and give its steps. Include where inputs come from
(project files, pasted emails) and where the output goes.
</workflow>

<rules>
The non-negotiables, each on one line with its reason where not obvious:
- UK English; UK property/finance conventions (£, DD/MM/YYYY, "programme").
- The appraisal model is the source of truth for deal financials — never invent figures.
- No promotional language, no em-dashes, no rule-of-three patterns (external docs get
  humanised, but drafting clean saves the pass).
- [task-specific rules: achieved-prices-only, sqft hierarchy, naming convention, etc.]
</rules>

<output_format>
Exact shape of each deliverable this project produces: sections, table columns, length
bands, file naming if files are produced.
</output_format>

<examples>
Few-shot from LIVE outputs — this is what kills revision rounds (proven RockCap lesson:
without real examples you get generic finance-speak). Paste 1–2 real, approved outputs,
trimmed. If none exist yet at prompt-writing time, leave the tag with an instruction:
"Rayn: paste the first Alex-approved output here."
</examples>
```

## Rules of thumb

- **Under ~1,500 words.** Longer prompts dilute; move stable reference material into project files and point at it.
- **Prompt = behaviour; files = knowledge.** If a section is data (lender lists, comps methodology), it belongs in a project file the prompt references, so it can be updated without touching the prompt.
- **Every section must earn its place** — if the model would do it anyway ("be helpful and accurate"), cut it.
- **Mark injection points explicitly** so future-Rayn knows what to swap per deal without re-reading the whole prompt.

## Proven exemplars

*None yet — exemplars are earned, not written. When a project prompt built from this skeleton performs well over real use, Rayn says "promote that prompt" and it gets appended here verbatim, with date and one line on how it performed. (The legacy masters in Desktop/Prompts predate this skill and were deliberately NOT imported — they came from generic asks.)*
