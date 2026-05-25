# Meeting brief template

The canonical brief shape for meeting-prep pre-call mode. Loaded by `../SKILL.md` step 6.

## Voice + format rules

- **Scannable, not narrative.** Operator reads this in the lift on the way to the meeting. Bullets > paragraphs.
- **Length cap: one screen.** ~250 words of content max. Longer briefs go unread.
- **Evidence-cite every claim.** Touchpoint dates, meeting decisions, cadence sends. If a talking point is "vibes-based", it doesn't belong in the brief.
- **UK English.** No em dashes. No rule-of-three. ISO dates `YYYY-MM-DD` for evidence; "tomorrow"/"next Tuesday" OK in narrative.
- **Report-as-standalone-artefact.** No cross-prospect comparisons (same rule as prospect-intel + qualify-and-draft).
- **No padding.** Sections with no findings say "No prior history" rather than fluff.

## Template (copy this skeleton; fill each section)

```markdown
# {Contact Name} — Meeting Brief

> {Meeting type} on {YYYY-MM-DD HH:MM} ({location: in-person / video / phone}). Generated {YYYY-MM-DD HH:MM UTC}.

## 1. Header

- **Who:** {Contact name + role at company}
- **When:** {YYYY-MM-DD HH:MM UK time} ({mins} mins)
- **Where:** {in-person address / Zoom link / dial-in / "TBC — confirm with attendee"}
- **Other attendees on our side:** {names, if known from the meeting record}
- **Type:** {progress | kickoff | review | site_visit | call | other}

## 2. Relationship snapshot

- **First contact:** {YYYY-MM-DD} ({months} months ago)
- **Last touch (any direction):** {YYYY-MM-DD}, {brief description: "outbound cadence Touch 3" or "inbound reply"}
- **Touch count:** {total touchpoints + replies count}
- **Other team members who've touched them:** {list, or "none"}
- **Current prospect/client state:** {drafted / active / engaged / promoted / etc., OR "active client" if status=active}

## 3. Active context

- **Live deals:** {count + summary, or "None on file"}
- **Live projects:** {project name + role, e.g., "Comberton (borrower)"; or "None"}
- **Outstanding asks IN (from them to us):** {bullets}
- **Outstanding asks OUT (from us to them):** {bullets, e.g., "Waiting on Touch 2 to fire on {date}"}
- **Current state of the deal cycle:** {free-form one-sentence, e.g., "post-intro, pre-qualification — they replied to Touch 1 last week"}

## 4. Recent activity (last 60 days)

Reverse-chronological. Each row: date + channel + 1-line summary.

- **{YYYY-MM-DD}** [{channel}] {summary}
- **{YYYY-MM-DD}** [{channel}] {summary}
- (max 8 rows; older entries summarised as "Plus N earlier touches.")

## 5. What likely needs addressing

Action items + open loops that may come up:

- **Open action items from prior meetings:** {bullet each with original meeting date + due date}
- **Outstanding info requests (us to them):** {bullets, e.g., "GDV figure", "planning ref"}
- **Pending approvals on our side:** {if anything client-related is in /approvals AND would be relevant; e.g., "qualify-and-draft reply pending — approve BEFORE the call so we can reference it as sent"}
- **Upcoming milestones / deadlines:** {project milestones from the projects table}

## 6. Suggested talking points

3-5 bullets, each grounded in evidence from section 4 or section 5:

- {Point} — because {brief evidence with date/source}
- {Point} — because {brief evidence}
- (3-5 max; pick the ones most likely to advance the deal, not all-of-them-listed)

## 7. Pre-meeting actions

Things to handle BEFORE the call starts:

- [ ] {Action}, e.g., "Approve qualify-and-draft reply staged 2026-05-24 — let it land before the call"
- [ ] {Action}, e.g., "Pull up Comberton planning portal page in a tab so we can answer site questions"
- (Empty if nothing to do; don't pad)
```

## How to fill each section from `getDeepContext`

| Section | Source field in deep context payload |
|---|---|
| Header | `prospect.{name, type}` + `meetings.upcoming[0]` (find the matching meeting) |
| Relationship snapshot | `prospect.createdAt` (first contact), `touchpoints[0].occurredAt` (last touch), `summary.contactsCount`, `clientIntelligence` |
| Active context | `deals.active`, `projects.active`, `cadences.queued` (outstanding asks out), `replyEvents` (outstanding asks in) |
| Recent activity | merge `touchpoints[]` + `replyEvents[]` + `cadences.fired[]` chronologically |
| What likely needs addressing | `meetings.past[].actionItems` (status=pending), `pendingApprovals[]`, `projects.active[].milestones` (if surfaced) |
| Suggested talking points | judgement call, but each point cites evidence from section 4 or 5 |
| Pre-meeting actions | `pendingApprovals[]` filtered to relevant + operator's professional judgement |

## When sections are empty

For a brand-new prospect (no prior touches, no meetings, no replies):

- Section 2 says "First contact today; no prior history"
- Section 4 says "No prior activity"
- Section 5 says "No open items"
- Section 6 is heavier — talking points should be qualifying questions (use `qualify-and-draft/references/qualification-gap-catalogue.md` for the standard gaps)
- Section 7 likely empty

For a long-dormant client (last touch >6 months ago):

- Section 2 explicitly flags the gap: "Last touch {date} — {N} months ago"
- Section 6 includes "re-introduction" as a likely opening rather than continuing context
- Section 7 may include "Refresh prospect-intel before the call" if intel run is >6 months old

## Length tuning

Aim for ≤250 words of content (excluding section headers). If you're over:

- **Section 4** is the most compressible — keep only the 3-4 most material touchpoints, summarise the rest as one line
- **Section 6** drops to 3 bullets instead of 5
- **Section 2** can be cut to one line if relationship is short (<3 months)

If you're under — that's fine. Short brief for a new relationship is correct; do NOT pad with speculation.
