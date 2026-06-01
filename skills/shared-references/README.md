# Shared References

Cross-skill references that more than one skill loads. Distinct from per-skill references (which live at `skills/{skill-name}/references/`).

Live shared references:

- `deal-type-size-bands.md` — how to estimate an indicative deal size from public evidence when the prospect has not given a number (derivation methods, confidence rubric, the mandatory range + confidence + basis line, and the coarse fallback bands per deal type). Loaded by `prospect-intel`.
- `doc-type-lender-brief.md` — the branded multi-page lender brief (structured `briefData` via the lender-brief layout): section set, the Track Record & Group Funding depth sourced from CH group charges, key-facts/sign-off fields, and the section-block page-break rule. Loaded by `document-author` (and the future `lender-brief` skill).
- `doc-type-client-brief.md` — the branded multi-page **client brief** (the borrower-facing counterpart; structured `briefData` via the client-brief layout, shares the lender brief's chrome): the mandatory "no lender approached yet / pricing indicative" caveats, leverage-scenario + expected-pricing panel section set, the `new-facility` / `refinance` / `multi-scenario` variants, and the RockCap-model-leads source hierarchy. Loaded by `document-author`.

Planned shared references:

- `uk-property-finance-glossary.md` — terms, abbreviations, and conventions every skill needs (GDV, TDC, LTGDV, LTC, profit on cost, day-one value, etc.) with the definitions RockCap uses.
- `voice-cheat-sheet.md` — a one-pager distillation of `../CONVENTIONS.md` for quick load in skill prompts.
- `approval-payload-shapes.md` — the JSON shape each `approvals.entityType` expects, so skills can construct approval rows consistently.
- `query-resolution-chain.md` — the brief's preferred order for resolving operator questions (references → intelligence → tools → reclassify), formalised.

A reference becomes shared when two or more skills load the same content. Until then, it lives inside the skill that uses it.
