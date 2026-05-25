# Shared References

Cross-skill references that more than one skill loads. Distinct from per-skill references (which live at `skills/{skill-name}/references/`).

Currently empty. Planned shared references:

- `uk-property-finance-glossary.md` — terms, abbreviations, and conventions every skill needs (GDV, TDC, LTGDV, LTC, profit on cost, day-one value, etc.) with the definitions RockCap uses.
- `voice-cheat-sheet.md` — a one-pager distillation of `../CONVENTIONS.md` for quick load in skill prompts.
- `approval-payload-shapes.md` — the JSON shape each `approvals.entityType` expects, so skills can construct approval rows consistently.
- `query-resolution-chain.md` — the brief's preferred order for resolving operator questions (references → intelligence → tools → reclassify), formalised.

A reference becomes shared when two or more skills load the same content. Until then, it lives inside the skill that uses it.
