# Target: generic (any other model or recipient)

For prompts aimed anywhere without a dedicated reference: GPT/Codex, Alex's Claude, the RockCap app's skill-forge, a one-off tool. No fixed skeleton — instead, a checklist the prompt must satisfy and per-recipient notes. If a new target becomes frequent (3+ asks), tell Rayn it deserves its own reference file.

## The checklist — every prompt must carry

1. **Objective first.** What to produce and for what decision, in the opening lines.
2. **Self-contained context.** The recipient has NO RockCap context: firm one-liner, deal specifics, definitions of any jargon that must appear (or strip the jargon).
3. **Real specifics over placeholders.** Actual postcodes, dates, names, figures from the conversation. A placeholder is a decision deferred to someone with less context.
4. **Constraints, spelled out with reasons** where not obvious: UK English/conventions for RockCap work, achieved-prices-only, source-everything, no-invented-figures — whichever the task needs.
5. **Explicit output format.** Structure, columns, length. Never "provide a summary".
6. **Success condition / stopping criterion.** What done looks like; what to do when blocked (flag, don't guess).
7. **No persona theatre.** One functional role line maximum. Capability comes from specificity, not from "you are the world's best".

## Per-recipient notes

- **GPT / Codex:** split standing instructions (system) from the task (user) if the interface allows. State format requirements twice — once up front, once at the end — long GPT prompts suffer recency bias.
- **Alex's Claude:** Alex works via voice (Wispr) and light edits; keep the prompt short and robust to paraphrase — numbered steps, not prose paragraphs. Include what Alex should paste/attach, since his projects don't share Rayn's files.
- **RockCap app skill-forge (Kristian's repo):** follow the repo's skill conventions (frontmatter name + description, imperative body). Never include client-confidential scheme data — the repo auto-pushes to GitHub.
- **Reasoning models (o-series, DR modes):** give goal + constraints + output contract; do NOT prescribe step-by-step reasoning — they plan better than the prompt can.

## Proven exemplars

*None yet — exemplars are earned, not written. When a generic-target prompt performs well in the field, Rayn says "promote that prompt" and it gets appended here verbatim, with date, recipient, and one line on what it produced.*
