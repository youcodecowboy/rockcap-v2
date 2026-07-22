# Target: Gemini Deep Research

Gemini DR is an autonomous multi-step browser: it plans, searches, reads, and synthesises for 5–20+ minutes without supervision. The prompt is the ONLY steering you get — there is no mid-run correction. Two failure modes dominate: **drift** (it wanders into adjacent-but-useless territory) and **unusable output** (findings you can't verify or lift into a schedule). Every section of the skeleton exists to prevent one of those.

## Skeleton

```
RESEARCH OBJECTIVE
One or two sentences. What question, for what decision. E.g. "Find achieved sale prices
for comparable new-build flats to evidence a blended £psf for a 12-unit scheme."

CONTEXT
2–4 lines the researcher needs to judge relevance: scheme type, unit mix, location,
spec level. No firm-internal jargon it can't resolve.

SCOPE — HARD BOUNDARIES
- Geography: radius or named area(s), with postcode(s).
- Timeframe: explicit date window (e.g. "completions from 01/01/2025 to today").
- Asset filter: property types, new-build vs resale, size band, tenure.
- Anything explicitly OUT of scope, stated as such.

SOURCE & EVIDENCE RULES
- Achieved/completed prices ONLY (Land Registry, Rightmove/Zoopla SOLD sections).
  Asking prices: only if explicitly labelled "ASKING — excluded from any averages".
- Every claim needs a working URL to the specific source page (the property's own
  detail page, not a search-results or postcode page).
- For floor areas, state the source of the sqft figure (floor plan > brochure > agent
  > EPC) — never present an unsourced sqft.
- If a data point can't be verified, INCLUDE it flagged "LOW CONFIDENCE — verify",
  rather than silently dropping or silently asserting it.

OUTPUT FORMAT
Exact structure — a table with named columns, per-item fields, section order.
For comps: Address | Type | Beds | Sqft (source) | Achieved price | £psf | Completion
date | Distance from site | URL | Notes/condition.
Then: a short synthesis section (what the evidence supports, outliers and why).

STOPPING CRITERIA
When the job is done: e.g. "Stop when you have 8–12 solid comps inside the boundaries,
or you have exhausted the sold registers for the area — do not pad with out-of-scope
items to reach a count."
```

## Why each rule matters

- **Achieved-only** — RockCap schedules go into lender credit packs; asking prices fail RICS discipline and get the whole schedule discounted.
- **Per-item URLs** — the output is raw material: Claude verifies every claim against primary sources afterwards. No URL = unverifiable = wasted item.
- **Flag-don't-drop** — DR models silently omit what they can't confirm; a flagged low-confidence item can be rescued by manual verification, an omitted one is lost.
- **Stopping criteria** — without one, DR pads results with marginal items to look thorough; padding costs more verification time than it saves.

## Proven exemplars

*None yet — exemplars are earned, not written. When a fire built from this skeleton performs well, Rayn says "promote that prompt" and it gets appended here verbatim, with date and one line on what it produced.*
