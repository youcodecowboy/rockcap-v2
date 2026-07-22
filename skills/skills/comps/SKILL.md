---
name: comps
version: 1.4.0
description: |
  RockCap comparable evidence methodology for residential development schemes. Use
  for any ad-hoc comparables task including verifying a single comp, building or
  reviewing an Appendix A master schedule, drafting a Forensic Comparable Evidence
  Report, producing a Local Market Deep Dive, constructing an Accommodation
  Schedule, sanity-checking agent pricing (KF, CJ), cross-referencing sqft against
  EPC/developer/Rightmove sources, or pressure-testing a blended psf. Applies the
  Alex Lundberg approved format (Calibri 11, dark blue headers, 2-3 sentence
  paragraphs, shorthand, no promotional language), the sqft source hierarchy
  (Rightmove floor plan > developer brochure > agent > planning > BricksAndLogic
  > Chimnie), RICS-compliant verification discipline (no hallucinated data, RM
  UUID links only, achieved prices only, asking prices labelled and excluded from
  averages), and the Excel/openpyxl rebuild rule (never insert rows). Invoke
  whenever comparables, psf, GDV, unit pricing, or comp schedules come up,
  whether inside a scheme folder or standalone.
license: Proprietary (RockCap internal)
compatibility: claude-code
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - WebFetch
  - WebSearch
---

# RockCap Comparables Skill

You are doing RICS-compliant comparable evidence work for RockCap residential development deals. The authoritative methodology lives inside the skill at `/Users/raynsmid/.claude/skills/comps/references/methodology.txt`.

## Step 1, always

Before doing any comps work, read the authoritative methodology in full:

```
/Users/raynsmid/.claude/skills/comps/references/methodology.txt
```

That file is the single source of truth for deliverable structure, Alex's style benchmark, sqft hierarchy, data rules, verification discipline, and workflow. Do not rely on memory of it, read it fresh every time.

### Methodology master copy

The editable master lives at `/Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Prompts/RockCap_Comparables_Project_Instructions.txt`. When the methodology changes, edit the master and re-sync into the skill:

```
cp "/Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Prompts/RockCap_Comparables_Project_Instructions.txt" "/Users/raynsmid/.claude/skills/comps/references/methodology.txt"
```

If the in-skill copy is ever missing, fall back to reading the master directly, then re-sync. Do not silently skip Step 1.

## Step 2, scope the task

**Scope first (ask ONE question before Superpowers), then plan, then build.** Comps jobs are one of two builds — know which before planning:
- **(a) Simple appendix (default for small deals)** — small loan / small build (Linton Lane is the canonical example): subject unit(s) at top, a one-line finding/revised-GDV block if it's a GDV test, then a handful of curated comps in light tiers. No Forensic/Deep Dive unless asked. Most jobs.
- **(b) Full comp complex (large schemes)** — Horton is the gold-standard exemplar: hero-anchor-per-house-type, multiple tiers/tabs, "why this comp supports our pricing" column, plus Forensic + Deep Dive.

If obviously small, default to (a) and say so; if unsure, ask the one question. Then for (b) or any non-trivial (a), invoke `superpowers:brainstorming` then `superpowers:writing-plans` before producing anything. Quick single-comp checks (Modes 2-3, 7-8) skip both. Also: build in two passes — get verified comps in first, leave tier headers / psf-range headers / polish for the final draft after sqft is verified (they churn). Standing instruction from Rayn (June 2026).

Comps work falls into one of these modes. Ask Rayn which if unclear, one question only.

1. **Full schedule build** — produce or refine the four deliverables (Appendix A + Forensic Report + Deep Dive + Accommodation Schedule) for a scheme. The first-pass folder scaffold (CLAUDE.md, data/, outputs/, SESSION_STATE) is owned by `/new-scheme`, not by this skill. This skill takes over once the scaffold exists, handling iteration, error fixes, and end-to-end deliverable builds inside the existing folder. For ad-hoc work outside any scheme folder, use modes 2-8.
2. **Ad-hoc single comp verification** — Rayn hands you one address or URL, you verify price, sqft, psf, tier fit, source reliability. Fastest mode, no document output required.
3. **Sanity check on agent pricing** — given an agent schedule (KF, CJ, others), cross-check unit sizes against Rightmove floor plans, developer brochures, EPC data. Flag discrepancies, do not silently correct.
4. **Accommodation Schedule only** — build or audit the plot-by-plot Excel with AL and agent pricing, formulas, blended psf, GDV totals.
5. **Forensic Report only** — draft narrative analysis from an existing Appendix A. Must reference Appendix A, not duplicate it.
6. **Deep Dive only** — wider evidence base with zero overlap with Appendix A. Additive research only.
7. **Sqft gap fill** — given a list of units missing sqft, run the source hierarchy and report what was found with confidence flags.
8. **Blended psf pressure test** — given a schedule, verify tier headers against calculated averages, recompute blended psf as total value divided by total sqft (not average of individual psf).

## Step 3, apply the non-negotiables

From the authoritative template, the rules that cause the most damage when broken:

- **Never insert rows into an existing Excel file with hyperlinks.** Rebuild the entire workbook from a master data array. openpyxl row insertion breaks the hyperlink mapping silently.
- **All formulas simple — no IF guards, ever.** Write plain cells only (`=D2/E2`, `=SUM(...)`, `=H2-$G$11`). Do NOT wrap calcs in defensive `IF`/`AND`/`ISNUMBER` guards. If a row has no sqft yet (TBC/n/a) and `=D/E` would divide by blank, LEAVE THE CELL BLANK and add the plain `=D/E` once sqft is in — do not guard it. Rayn's standing rule (reconfirmed June 2026): simple, auditable formulas. The approved example files have been re-cleaned to plain division; never reintroduce the old IF-wrapped psf formulas.
- **Never hallucinate a transaction.** If you cannot verify the SALE (price/date) against Rightmove UUID detail page, Land Registry, Zoopla, or OnTheMarket, flag it as a Data Gap. Do not include. But a verified sale with only its SQFT missing is NOT excluded — carry it with sqft "TBC" and keep chasing; never throw out a good comp for a first-round miss.
- **Rightmove floor plan beats EPC sqft.** Always check the specific unit's detail page before falling back to postcode averages. Integral garages are the classic trap, cross-reference developer "Total Internal Living Area" for habitable GIA.
- **Asking prices labelled and excluded.** Achieved prices only in averaged psf calculations. Asking prices live in the schedule but tagged "ASKING" in Col I.
- **RM UUID detail page links only, and YOU fetch them.** Generic postcode links (`rightmove.co.uk/house-prices/[postcode].html`) fail the investment-committee standard. WebFetch the postcode/street page to read each sale's specific `details/[UUID]` and populate the live link yourself — do not hand Rayn a generic link or defer it for manual verification. Hyperlink display text = a short identifying label (e.g. "RM 8 Oakfields", or the unit name / short address) — enough to know which property it is, never a bare "RM Link".
- **A Gemini "can't find / DATA GAP" is a verify-it-yourself trigger, not a conclusion.** Claude reaches RM/Zoopla pages Gemini's browser cannot. WebFetch the postcode page (and PropertyData) before accepting any Gemini gap; only record a gap after your own fetch also fails. (Linton Lane: Zillian + Garth Cottage were both real, found in one fetch each.)
- **Tie every comp back to a subject unit in the accommodation schedule.** The Notes cell must say which subject plot the comp supports and why (size/condition/spec/age delta), not float as generic market colour.
- **Stale references cascade.** When a price, sqft, or psf changes, grep the full document for every downstream reference, Key Takeaways, summary tables, tier headers, conclusions, and update all in one pass.
- **Verify the output file.** After any Excel or Word rebuild, open the actual saved file and check hyperlinks resolve, formulas calculate, totals match. Do not trust the working copy.
- **Curate tiers, don't pile them.** Tier count is editorial, not exhaustive. Comps >2 miles away that don't materially support the narrative get stripped at AL review anyway, so cut them upstream. See methodology Section 3.1 Curation and Section 11.3 Dark Mills.
- **Renumber tiers after removal.** If Tiers 2-4 get cut, renumber Tier 5 to Tier 2. A sheet that jumps "Tier 1 / Tier 5" reads as draft.
- **Counter-argument preemption pattern for Notes.** When a comp invites an obvious objection (bungalow psf, dated stock, atypical typology), Notes can extend to two sentences using `[main observation]. [counter-argument acknowledged]. [why the comp still works]`. Default discipline is still one line.

## Step 4, workflow

- **Research via Gemini Deep Research, document construction via Claude.** Rayn runs Gemini for transaction hunts, sqft verification, and web searches. Claude receives the raw Gemini output, verifies every claim against primary sources, flags errors or gaps, then builds the document. Never burn Claude usage on web scraping that Gemini should do.
- **Batch fixes, then review.** When reading a document for errors, keep a running numbered list. Implement all corrections in one clean pass at the end. Do not fix-as-you-go.
- **Rayn handles minor edits.** For single-word or single-number changes, provide the exact value for Rayn to paste himself. Do not burn a full write cycle on trivial edits.
- **Fan out verification for larger schedules.** When a schedule has ~8+ comps to verify, offer Rayn a multi-agent workflow before grinding through sequentially: one agent per comp running the full verification (RM UUID detail page, sqft source hierarchy, achieved-vs-asking, tier fit), then an adversarial pass that tries to kill weak comps before anything enters the blend. One line to Rayn ("fan this out via a workflow?") — his call, since it costs more usage. Sequential remains fine for small sets. (Added 14/07/2026 after the Fable 5 sense check.)

## Step 5, output

Which outputs apply by mode:

| Mode | Excel | Word | Inline answer only |
|---|---|---|---|
| 1 Full schedule build | yes (Appendix A + Accommodation Schedule) | yes (Forensic Report + Deep Dive) | no |
| 2 Single comp verify | no | no | yes |
| 3 Agent pricing sanity | no | no | yes (with flagged discrepancies) |
| 4 Accommodation Schedule only | yes | no | no |
| 5 Forensic Report only | no | yes | no |
| 6 Deep Dive only | no | yes | no |
| 7 Sqft gap fill | no | no | yes (table with confidence flags) |
| 8 Blended psf pressure test | no | no | yes (with corrected averages) |

When a mode lists "no" for both Excel and Word, do not fabricate a document. Present the verified result inline and let Rayn paste it.

- **Excel rebuilds** via openpyxl, use `--break-system-packages` if pip install is needed. Run `recalc.py` after saving to refresh cached formula values.
- **Word documents** via the Node.js `docx` library, read its SKILL.md first each time.
- **Alex's formatting** (applies to all Word output), Calibri 11 body, dark blue headers (#2E5090 or #1F4E79) bold, italic status lines under section headings, white on dark blue or dark blue on light grey table headers, portrait A4.
- **Present the verified output**, not the working copy. Confirm the file path when handing back to Rayn.

## Style rules for any prose this skill produces

- **2-3 sentence paragraphs max.** No essays.
- **Shorthand** (c., psf, NB, LR, det, EOT, SC, pa) over spelled-out forms. "c.1,611 sqft" not "approximately 1,611 square feet".
- **UK English throughout.** Programme, not program. £ not GBP when inline. DD/MM/YYYY dates.
- **No em-dashes** in narrative text per Rayn's standing preference. Use commas, semicolons, full stops, or parentheses.
- **No promotional language.** "Trophy asset", "zenith of the market", "architectural masterpiece" are all banned. Neutral valuer tone.
- **Bold standalone Key Takeaway and Premium lines** in Forensic Report sections.
- **Agent-dialogue tone for internal notes**, "Agree with KF pricing", "Think CJ have underpriced", "We sit middle".
- **No over-reliance on heritage or provenance** as a premium driver. Reference once in exec summary and let the transaction data speak.

## What not to do

- Don't write essays. 2-3 sentences per paragraph max.
- Don't fix the sheet unless instructed, provide values and links for Rayn to paste.
- Don't present a file without verifying it first.
- Don't duplicate Appendix A data in the Deep Dive.
- Don't reference the Deep Dive from the Forensic Report, the Forensic Report references only the Appendix.
- Don't search the web when Gemini should do it, flag what you need and Rayn will run Gemini.
- Don't ask five questions at once, one at a time.

## Worked reference

The Temple Dinsley project is the canonical worked example. Section 11 of the methodology (read at Step 1) covers the 8-tier structure, CJ Plot 7 garage saga, openpyxl hyperlink disaster, Oakfields blended average recalc, and the Gemini research workflow. No separate read required, the methodology already includes it.
