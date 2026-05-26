# Lender submission requirements canon

Canonical structure for the per-lender Submission Requirements document. Every lender (`clients` row with `type: "lender"`) gets ONE such document, persisted via `lender.setSubmissionRequirements` (which wraps `document.createFromGeneration`). Loaded by `terms-package-build` to tailor each lender's pack; loaded by `lender-intel` when capturing requirements during BDM calls.

This file is **the shape contract.** Skills that READ a lender's Submission Requirements MD expect this structure. Skills that WRITE one must produce this structure. Drift between writers and readers breaks pack tailoring.

## Consumers + writers

| Skill | Role | When |
|---|---|---|
| `lender-intel` | Writer | During BDM call capture; operator updates over time |
| `terms-package-build` | Reader | Per-lender pack generation; reads to tailor the pack content |
| `info-request-grader` (future) | Reader | When lender comes back asking for additional info; compares request against documented requirements |
| `monitoring-watcher` (future) | Reader | When monitoring docs needed; reads "Monitoring requirements" section |

## Storage

The Submission Requirements doc lives as a single `documents` row attached to the lender's `clients` row:

```yaml
fileName: "Submission Requirements"
fileTypeDetected: "Submission Requirements"
category: "Lender outreach"           # established for skill-generated lender-side docs
clientId: <lenderClientId>            # the lender
projectId: null                       # NOT project-scoped — applies to all deals
isBaseDocument: true                  # lives at client level
summary: <the full requirements markdown content>
```

Versioning: when operator updates requirements (BDM call reveals a new preference), a NEW doc row is created via `lender.setSubmissionRequirements`. Old versions remain queryable; `lender.getSubmissionRequirements` returns the most recent.

Discoverability: appears in the lender's standard documents list. Operator can view, download, copy, manually edit.

## The canonical structure (every section)

Every Submission Requirements MD has these sections, in this order. Sections that aren't yet populated still appear with a one-line "Not yet captured" placeholder — operators rely on the structure being predictable.

```markdown
# {Lender Name} — Submission Requirements

> Captured by {source: BDM call YYYY-MM-DD | inferred from N HoTs | public docs | operator}.
> Last operator review: YYYY-MM-DD.

## 1. Identity

- **Legal name:** {as on Companies House}
- **Branded name:** {if different — e.g., "Octane Capital" branded for "Octane Capital Limited"}
- **Lender type:** {bank | challenger bank | specialist development lender | bridging lender | private credit / debt fund | family office / private wealth | syndicate / agent}
- **Companies House:** {CH number, or "Not on CH" for non-UK entities}
- **Website:** {URL}
- **Primary BDM contact:** {name, email, phone, last contact YYYY-MM-DD} (or "Not yet captured")
- **Secondary contacts:** {credit officer / origination team if known}
- **Submission portal:** {URL or "Email submissions to {email}"} (or "Not yet captured")

## 2. Submission preferences

How they want the pack formatted.

- **Preferred pack length:** {e.g., "8-12 pages — anything over 15 gets re-skimmed", "concise: 5-6 pages max", "comprehensive: 15+ pages welcomed"}
- **Format:** {PDF | DOCX | both | "any format, just send"}
- **Cover letter:** {required | preferred | optional; style notes if any}
- **Attachments protocol:** {"inline in pack" | "separate files alongside cover" | "single combined PDF"}
- **Specific sections they want:** {e.g., "always include sponsor track record summary with project IRRs", "always include drawdown profile"}
- **Sections they don't need:** {if any}

## 3. Content emphasis

What they care about most + least + things that bin a deal.

### Care about most (high emphasis required)

- {Bulleted list of things to emphasise. E.g., "sponsor's experience in this exact asset class", "DSCR coverage and stress test", "exit strategy with comparables"}

### Care about least (can be light)

- {Bulleted list of sections that can be brief. E.g., "ESG narrative (only required for ESG-tilted lenders)", "macro market commentary"}

### Things they hate (deal-binning red flags)

- {Bulleted list of things that get the deal rejected. E.g., "any sponsor with prior insolvency in last 5 years", "schemes without planning consent", "ground-up developments without QS appointed"}

## 4. Credit committee + decision flow

How decisions get made internally.

- **Decision cadence:** {e.g., "weekly Tuesday credit committee", "rolling decisions BDM authority up to £Xm"}
- **BDM authority limit:** {amount they can approve alone, before escalation to credit}
- **Typical time to indicative terms:** {e.g., "5-10 working days from submission"}
- **Typical time to credit-backed terms:** {e.g., "2-3 weeks after indicative if all docs in"}
- **What credit asks that BDM doesn't:** {if known — e.g., "credit will always re-check the planning chain"}
- **What loses deals at credit:** {if known patterns exist}

## 5. Appetite envelope (deal characteristics)

(May overlap with `lender.recordAppetite` signals — this section is the operator-facing narrative; the appetite signals are the queryable structured data.)

- **Sweet spot deal size:** {£X-Y range}
- **Hard min / max:** {floors and ceilings}
- **Asset classes accepted:** {comma-separated list}
- **Asset classes rejected / avoided:** {comma-separated list}
- **Geographies accepted:** {regions / postcodes / countries}
- **Geographies rejected / avoided:** {if any restrictions}
- **Tenor range:** {months / years from-to}
- **Drawdown style:** {milestone-based | monthly | rolling | one-shot}
- **Security package required:** {first charge / second charge / debenture / PG / share charge / combinations}
- **PG requirement:** {full-recourse | limited | none | varies}
- **Profit share / equity participation:** {if any standard terms}

## 6. Submission history with RockCap

Auto-populated over time as we submit to + hear back from this lender.

- **First submission date:** {YYYY-MM-DD or "No submissions yet"}
- **Submissions to date:** {N}
- **HoTs returned:** {N (Y% conversion)}
- **Funded:** {N (Y% conversion of HoTs)}
- **Average time from submission to HoTs:** {days}
- **Most recent submission:** {scheme name, date, status}

## 7. Past wins / losses (lessons)

Operator notes on what's worked + what hasn't.

- **Wins:**
  - {Scheme name, year, what got it across the line}
- **Losses:**
  - {Scheme name, year, why it was declined (their stated reason + operator's read)}
- **Patterns:** {operator's tacit knowledge — e.g., "they decline deals where the sponsor has more than 3 schemes in flight"}

## 8. Provenance + audit

- **Sources for this version:** {BDM call YYYY-MM-DD with {name} | inferred from N HoTs in projects {list} | public website pages | operator domain knowledge}
- **Original draft by:** {Claude / operator name}
- **Last operator review:** {YYYY-MM-DD by {name}}
- **Confidence:** {HIGH (multiple sources confirm) | MED (single source) | LOW (inferred, not confirmed)}
- **Next review trigger:** {e.g., "after next BDM call" or "annually" or "when BDM contact changes"}
```

## How writers populate sections (priority order)

Skills authoring a fresh Submission Requirements MD should populate sections in this priority order:

1. **Identity** (always — required minimum to make the doc useful)
2. **Appetite envelope** (always — duplicate of structured `lender.recordAppetite` data, in narrative form)
3. **Content emphasis** (always — even if just "no specific known preferences; assume balanced")
4. **Submission preferences** (when known — most lenders don't have rigid prefs)
5. **Credit committee + decision flow** (when known — usually requires BDM call to capture)
6. **Past wins / losses** (auto-grows over time)
7. **Submission history** (auto-populated by terms-package-build over time)
8. **Provenance** (always — required for audit trail)

When a section can't be populated, write: `_Not yet captured. {Brief note about what would need to happen to populate this — e.g., "Next BDM call"}._` rather than omitting the section.

## How readers consume the doc

`terms-package-build` loads the most recent Submission Requirements MD via `lender.getSubmissionRequirements({lenderClientId})` and uses it as **the dominant context** for that lender's pack generation. Specific section-to-pack mapping:

| Submission Requirements section | Used by terms-package-build to… |
|---|---|
| Identity | Address pack to right BDM + use correct legal name + submit to right portal/email |
| Submission preferences | Set pack length, format, cover letter style |
| Content emphasis — "care about most" | Expand those sections of the pack; lead the executive summary with them |
| Content emphasis — "care about least" | Compress / omit those sections |
| Content emphasis — "hate" | Acknowledge proactively if applicable, OR flag to operator that the deal might be a poor fit |
| Credit committee + decision flow | Set operator's expectations on response timing |
| Appetite envelope | Sanity-check deal-fit before generating pack (e.g., reject if deal size out of range) |
| Past wins / losses | Inform cover letter framing ("we've worked with you on {past scheme}; this is similar in {dimension}") |

## Vocabulary additions

This canon introduces one new `fileTypeDetected` value:

- **`Submission Requirements`** — for the lender's own Submission Requirements MD. Always `category: "Lender outreach"`, always `isBaseDocument: true` on the lender's `clients` row.

Add to `skills/skills/deal-intake/references/document-vocabulary-catalogue.md` if not already present (this doc is technically used outside deal-intake, but the vocabulary catalogue is the single source of truth).
