# Mode T — Lender Terms Reconciliation

Run this when indicative lender term sheets have come back and you are building or checking the Lender Dashboard / comparison model against them. The point is to catch a term that has been sized on the wrong basis BEFORE it reaches the client. Source: Alex, Oakridge Lynch, 16/07/2026 (the Shawbrook £392k miss).

## The failure mode this prevents

Sizing every lender by mechanically matching its **net advance**, lender after lender, without reading and digesting each term sheet. Matching net advance is the **fallback** — used only when the terms give no richer anchor. Where a term sheet states a better anchor (a borrower equity/shortfall figure, or an explicit LTGDV), reconcile to **that** and investigate any gap.

## Per-lender checklist (run for every lender in the comparison)

1. **Stated LTGDV vs modelled LTGDV.** Read the lender's own stated LTGDV from their terms; compare to the model's Live LTGDV for that site (Control Sheet, per pitfall #8 in SKILL.md).
   - Gap ≤ ~2-3%: normal noise, accept.
   - **Gap ≥ ~5%: RED FLAG — stop and ask "what's gone on?".** (Shawbrook stated 65%, modelled ~70% — a big swing that meant the borrower equity was wrong.)
   - Calibrate by confidence: challenger / bank-grade lenders (e.g. Shawbrook) we usually model within a couple of %, so a big gap there is more suspicious than for a lender we model less confidently (e.g. Sibner, modelled 71.6% vs their stated 67%).
2. **Stated borrower equity / shortfall vs modelled equity.** If the term sheet states what the borrower must fund (e.g. "£392k to be funded by the borrower"), reconcile the model's equity requirement to it. A mismatch here is the clearest single tell — check this every time, do not skip it.
3. **Contingency %** — and the hard £ number. See the contingency point below. Not always stated; if not obvious, it is a question to ask.
4. **Sizing basis** — is the facility sized on build costs only, or build + professional fees? Lenders differ; it moves the numbers.
5. **Valuation basis** — lending off open-market value or 180-day value?
6. **Day-1 land advance — real or fee-absorbed?** Some lenders (HTB, Palace) quote a day-1 land tranche that strips back to ~nothing once their own arrangement/broker fees are deducted. Read it through; do not credit it as real day-1 leverage.
7. **PG level** and any other security conditions that differ from the norm.

## Contingency — the hidden driver

When there is **no day-1 land loan**, matching net advance normalises contingency differences (the land loan is the land loan). But contingency still matters:

- Two lenders with the **same land loan** but different contingency (10% vs 7.5%) differ on **interest allowance** and/or **leverage**. The higher-contingency lender may be at a higher headline LTGDV (say 67.5% vs 65%) yet land on the same land loan.
- A **higher-leverage / higher-contingency** lender can be the **better** pick — the extra is a buffer if things do not go to plan, not just more debt. Do not reflexively prefer the lower headline. See memory `feedback-lenders-raise-contingency`.

## Before the analysis: form a view

Write down who you expect to be the **top 1-2-3** lenders on this deal before modelling (e.g. Zorin, then Sibner, then the rest). If the finished analysis contradicts that expectation, that contradiction is itself a flag to re-check the detail. (Alex does this on intuition; the substitute until that intuition exists is an explicit written expectation + checking the detail every time.)

## Output

For each lender, report: modelled LTGDV/net/equity, the lender's stated LTGDV/equity, and any reconciliation gap with a PASS / FLAG. FLAG anything where stated vs modelled LTGDV differs by ≥ ~3-5% or where stated borrower equity differs materially from modelled — with the likely cause (contingency, sizing basis, valuation basis) named, not just the gap. Do not silently match net advance over a stated shortfall.

## Related

- Standing question set to send with terms requests (contingency %/£, sizing basis, valuation basis, PG level; "confirm you'd lend on the same basis as last time?" for recently-quoted lenders) — planned, not yet built (Rayn, 16/07/2026). Not a "blueprint" of desired terms, just standard questions.
- Memories: `feedback-read-each-lender-terms`, `feedback-lenders-raise-contingency`, `feedback-lender-comparison-day-one-net`.
