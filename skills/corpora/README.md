# Corpora

Anonymised exemplars used by skills as in-context examples. Real outputs the team has produced, with identifying details replaced, that show what good looks like for a given workflow.

Currently empty. Planned corpora:

- `prospect-intel/` — anonymised reachout emails and intelligence briefs that landed well.
- `ic-papers/` — anonymised IC papers with the parts that drove approval highlighted.
- `terms-comparisons/` — anonymised term-sheet-to-recommendation walk-throughs.
- `monitoring-summaries/` — anonymised monthly monitoring summaries.

Anonymisation rules:

- Replace company names with placeholders like "{Borrower Co.}" or "{Developer Co. 1}".
- Replace personal names with role descriptors like "{Borrower MD}" or "{Lender BDM}".
- Replace specific Companies House numbers with "{CH 00000000}".
- Replace specific GDV, TDC, facility values with relative scales: "mid-eight-figure GDV", "facility ~70% LTGDV".
- Replace addresses with "{Scheme address, London SW}" or similar.
- Replace planning references and title numbers similarly.
- Preserve structure, voice, length, and the analytical pattern of the original.

Corpora are loaded by the skill that needs them, not by every skill. Do not blanket-include corpora in skill prompts; that bloats context for no benefit.
