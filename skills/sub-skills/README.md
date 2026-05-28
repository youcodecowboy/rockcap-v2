# Sub-skills

Reusable Claude-side primitives that multiple skills consume. A sub-skill is a smaller markdown file describing a focused, reusable workflow step. Think of these as functions that skills call; the SKILL is the orchestrator, the sub-skill is the helper.

When a recurring step appears in two or more skills, lift it here. SKILL.md files load sub-skills by name when their workflow references one.

## Current sub-skills

### Resolution

| Sub-skill | What it does | Used by |
|---|---|---|
| [`resolve-company.md`](./resolve-company.md) | Map name / email domain / Companies House number / free description to a canonical organisation. | prospect-intel, qualify-and-draft, lender-intel, deal-intake, attribute-touchpoint |
| [`resolve-contact.md`](./resolve-contact.md) | Map email or name+org to a specific `contactId`. | qualify-and-draft, meeting-capture, attribute-touchpoint, cadence-fire |
| [`resolve-related-entities.md`](./resolve-related-entities.md) | Walk a prospect's controlling PSCs/directors' other CH appointments to map the corporate group (likely sibling SPVs + trading parent). Surface-only: persists one `borrower.related_entities` knowledge item, creates no rows. | prospect-intel |
| [`attribute-touchpoint.md`](./attribute-touchpoint.md) | Attach an inbound or outbound event to person, deal, thread; write to `touchpoints`. | Gmail sync, Fireflies sync, HubSpot sync, meeting-capture |
| [`dedupe-meeting.md`](./dedupe-meeting.md) | Determine whether a proposed meeting duplicates an existing record. | Fireflies sync, meeting-capture |
| [`address-normalizer.md`](./address-normalizer.md) | Canonicalise UK addresses to a hash-comparable form. | resolve-company, deal-intake, companies-house linkage |

### Extraction

| Sub-skill | What it does | Used by |
|---|---|---|
| [`extract-term-sheet.md`](./extract-term-sheet.md) | Parse a term sheet into canonical normalised fields. | terms-comparison, lender-intel |
| [`extract-appraisal-figures.md`](./extract-appraisal-figures.md) | Pull GDV, TDC, profit, scheme details from an appraisal or cashflow. | deal-intake, terms-package-build, monitoring-watcher |
| [`extract-action-items.md`](./extract-action-items.md) | Parse a transcript or note into structured action items with ownership and urgency. | meeting-capture, deal-triage, info-request-grader |
| [`extract-monitoring-variance.md`](./extract-monitoring-variance.md) | Compute variances between monitoring actuals and the underwriting baseline. | monitoring-watcher, deal-triage, case-study-author |

### Composition

| Sub-skill | What it does | Used by |
|---|---|---|
| [`compose-approval.md`](./compose-approval.md) | Stage an approval row in the right shape for an `entityType`. | every skill that produces output for human review |
| [`populate-template.md`](./populate-template.md) | Wrap `template.populate` with variable validation. | deal-intake, terms-package-build, ic-paper-drafter, case-study-author, monitoring-watcher |
| [`match-register.md`](./match-register.md) | Identify and mirror the register (formal / neutral / warm / casual) of inbound communication. | qualify-and-draft, cadence-fire, meeting-capture |

### Scoring and grading

| Sub-skill | What it does | Used by |
|---|---|---|
| [`score-lender-match.md`](./score-lender-match.md) | Score lenders against a deal's profile; produce a ranked shortlist with caveats. | terms-package-build, lender-intel |
| [`grade-information-request.md`](./grade-information-request.md) | Convert raw info-request lists into graded `knowledgeChecklistItems` with priority and blocking flags. | info-request-grader, deal-triage, ic-paper-drafter |

### State, intelligence, scheduling

| Sub-skill | What it does | Used by |
|---|---|---|
| [`compute-deal-phase-transition.md`](./compute-deal-phase-transition.md) | Determine whether a deal's `dealPhase` should advance based on preconditions. | client-decision-capture, deal-triage |
| [`detect-intelligence-conflict.md`](./detect-intelligence-conflict.md) | Check new intelligence against existing for the same fieldPath; recommend supersede / pending-review / skip. | meeting-capture, deal-intake, lender-intel, monitoring-watcher |
| [`summarise-deal-context.md`](./summarise-deal-context.md) | Produce a compact, audience-tuned summary of a deal's current state. | meeting-prep, deal-triage, chat assistant |
| [`holiday-calendar.md`](./holiday-calendar.md) | UK business-day and bank-holiday arithmetic. | cadence-fire, deal-triage |

## Status

All 19 sub-skills above have a markdown file authored. Depth varies. Most read end-to-end as design specs; some (like `address-normalizer`) document existing implementation (`convex/companiesHouse.ts` `getAddressHash`). `resolve-related-entities` documents a live primitive: it drives the `companies.getOfficerAppointments` MCP tool.

The sub-skills are not runnable until the MCP server (BL-5.1) and the cross-cutting primitives (`template.populate` BL-5.6, `deal.get_full_context` BL-5.4, `document.extract` BL-5.5) ship. Until then, they describe the design Claude will follow once the primitives are real.

## When to add a new sub-skill

Promote a step from a SKILL.md to a sub-skill when:

1. It appears in two or more SKILL.md workflows.
2. It carries RockCap-specific judgement (not just a tool call).
3. Lifting it out makes the parent SKILL.md noticeably shorter and easier to read.

Until at least the first two conditions hold, keep the step inside the parent SKILL.md. Premature factoring is worse than duplication.
