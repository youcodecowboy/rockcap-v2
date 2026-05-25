# Qualification gap catalogue

Loaded by `../SKILL.md` step 4. The standard qualification gaps RockCap needs to close before we can submit a deal to lenders, ranked by leverage (how much each gap changes the lender shortlist when answered). Skill picks the top 3 gaps not yet known about the prospect and phrases them per this catalogue.

## How to use this catalogue

For each gap below:
- **Check:** what to look for in `prospect.getDeepContext` output (specifically the `clientIntelligence` row and the `latestIntelRun.intelMarkdown` section content) to determine if the gap is already closed.
- **Phrase:** the question template to use in the reply. NEVER copy verbatim; adapt to the register (warm vs formal) and the inbound's specific language.
- **Why it matters:** one sentence justifying why this gap is high-leverage. Use this when the reasoning field on `outreach.draftReply` asks why the draft includes this question.

## Ranking

Gaps are ranked by how much each one CHANGES the lender shortlist when answered. Top-ranked = ask first.

| Rank | Gap | Closes via | Lender-shortlist impact |
|---|---|---|---|
| 1 | Scheme address + planning reference | Email reply or attached pack | Defines all geography-specific lenders (sub-regional appetite) |
| 2 | GDV (gross development value) | Email reply or appraisal | Defines ticket size band — bridges below £2m, dev finance >£2m, syndicate >£15m |
| 3 | TDC (total development cost) | Email reply or appraisal | LTGDV calculation requires this — defines whether senior alone or senior+mezz |
| 4 | Units count + mix | Email reply | Lender residential-block appetite varies sharply at 10/30/50 unit thresholds |
| 5 | Equity in deal | Email reply | Defines senior-only vs senior+mezz vs prefer-100% structure |
| 6 | Timeline (when do you need the money) | Email reply | Distinguishes bridging-urgent (<6 weeks) from term-planned (3-6 months) |
| 7 | Planning status | Email reply or planning portal | Detailed permission vs outline vs in-application changes which lenders engage |
| 8 | Sponsor experience (units completed in last 5 years) | Email reply | Several specialty lenders gate on 50/100/250-unit minimums |
| 9 | Exit strategy (sell vs rent vs refi) | Email reply | Determines whether bridging exits to term or sale, shapes term length |
| 10 | Build cost per square foot | Email reply or appraisal | Sanity-check + identifies overruns risk lenders care about |

## Per-gap details

### Gap 1: Scheme address + planning reference

**Check:** look in `clientIntelligence.projectSummaries[].address` AND in `intelMarkdown` section 5 (Track Record) for property addresses cited in charges. If the inbound mentions a specific street or scheme name and we have it, gap is closed.

**Phrase (formal):** "Which scheme is this for — could you share the site address and (if it's the same one) the planning reference?"

**Phrase (warm):** "Which one is this — got a postcode and planning ref handy?"

**Why it matters:** Geography-driven lender shortlists. Some specialty lenders only fund inside the M25 OR only outside; some prefer specific local authorities. Without an address, the shortlist is the broadest possible.

### Gap 2: GDV (gross development value)

**Check:** look in `clientIntelligence` for `gdv` field OR in `intelMarkdown` section 4-5 for any £-amount in scheme context. Cited charge amounts are NOT GDV (they're facility sizes).

**Phrase (formal):** "What's the GDV you're working to on this one?"

**Phrase (warm):** "What's the GDV?" (literally just that — sponsors use the term)

**Why it matters:** Bridges below £2m have one shortlist. Dev finance £2-15m has another. Syndicate / large dev >£15m a third. GDV is the master classifier.

### Gap 3: TDC (total development cost)

**Check:** as for GDV. Closes alongside (often in same sentence in an appraisal).

**Phrase (formal):** "And the TDC?" — paired with GDV ask.

**Why it matters:** LTGDV = facility / GDV. Profit margin = (GDV - TDC) / TDC. Both are gating numbers for credit committees. Without TDC, we can't predict lender LTV willingness.

### Gap 4: Units count + mix

**Check:** look in `clientIntelligence.projectSummaries` for `units` field OR in `intelMarkdown` Track Record for explicit unit counts.

**Phrase (formal):** "How many units and what's the mix — flats / houses / townhouses?"

**Phrase (warm):** "How many units? Mix?"

**Why it matters:** <10 units → bridging or BTL specialty banks. 10-30 → mid-market dev finance. 30-50 → larger specialty. >50 → syndicate / institutional. Mix matters because some lenders won't fund pure-flat (cladding risk) or pure-house (slower sales).

### Gap 5: Equity in deal

**Check:** rarely in our existing intel; usually only known after appraisal review.

**Phrase (formal):** "How much equity are you putting in, and is any of it land?"

**Phrase (warm):** "What equity's going in?"

**Why it matters:** Lenders price + structure based on sponsor skin-in-the-game. <10% equity → mezz needed. Land-as-equity often counts at uplifted value, changing the structure.

### Gap 6: Timeline

**Check:** the inbound itself often telegraphs urgency. Look at language: "we're aiming to close", "started on-site", "need to drawdown by".

**Phrase (formal):** "What's the timing — when do you need to be drawn down?"

**Phrase (warm):** "What's the timing on this?"

**Why it matters:** Bridging cycle is days to weeks; specialty bank cycle is 4-8 weeks; mainstream is 8-12. The timeline gates which lender pool is realistic at all.

### Gap 7: Planning status

**Check:** `intelMarkdown` section 5 may mention planning hits found in web research. Specific planning ref numbers (e.g., "PA/2025/00187") indicate closed gap.

**Phrase (formal):** "Where's planning at — detailed consent, outline, or in-application?"

**Phrase (warm):** "Got planning? Detailed or outline?"

**Why it matters:** Pre-planning means most dev lenders won't engage. Outline gates out the conservative ones. Detailed consent opens the field. Some lenders fund pre-planning at a steep discount; useful to know.

### Gap 8: Sponsor experience

**Check:** `intelMarkdown` section 3 (Key People) + section 5 (Track Record). If the report shows N completed units from director's CH appointments OR explicit press mentions, gap may be partially closed. Quantify: how many units in last 5 years?

**Phrase (formal):** "How many units have you delivered in the last few years? Any active sites at the moment?"

**Phrase (warm):** "How many have you finished recently? Anything else live?"

**Why it matters:** Several specialty banks gate on minimums (50 units / 5 years for the strict ones). New entrants get rate premiums OR are excluded entirely. Quantified track record changes the shortlist materially.

### Gap 9: Exit strategy

**Check:** rarely known from our intel; typically must ask.

**Phrase (formal):** "What's the exit plan — sales, refi to BTL term, or hold and let?"

**Phrase (warm):** "Selling on completion or holding?"

**Why it matters:** Sales-exit deals get shorter term loans. Refi-to-BTL gets longer term but tighter LTV gates. Hold-and-let appeals to a different lender pool entirely (BTL specialists not dev finance).

### Gap 10: Build cost per square foot

**Check:** rare in our intel; typically only after appraisal.

**Phrase (formal):** "Roughly what £/sq ft are you targeting on the build?"

**Phrase (warm):** "What's the build cost per sq ft?"

**Why it matters:** Sanity-check on the GDV/TDC. Overrun risk is the #1 dev finance loss driver; lenders price for it. £/sq ft outliers (too low or too high) get extra scrutiny.

## Prioritisation rules

**The skill picks ≤3 gaps to ask per reply.** Picking rules:

1. **Always ask Gap 1 (address)** if not closed. Without it nothing else is actionable.
2. **Always ask Gap 2 (GDV)** if not closed. Without it the lender shortlist is too broad.
3. **Pick ONE of Gaps 3-10** based on what the inbound's tone suggests:
   - If inbound is short + casual → pick the operationally tightest one (Gap 6 Timeline)
   - If inbound is detailed + specific → pick the next high-leverage one not yet closed (probably Gap 3 TDC or Gap 4 Units)
   - If inbound mentions a specific phase (e.g., "just got planning") → pick the OPPOSITE phase question (Gap 6 Timeline or Gap 9 Exit) — gets them past what they already volunteered

**If 3+ gaps already closed by intel report**, the reply asks ZERO qualification questions and instead proposes a call directly: "Looks like we have what we need to get one or two indicative quotes out. Worth a 15-minute call this week to walk through the structure?" The Calendly close goes in the same paragraph.

## What NOT to ask

Never ask in a first reply:

- Director's personal financial position / personal guarantee willingness — too aggressive
- Lender preferences they've already tried — comes across as fishing
- Past failed deals — sensitive, surface in the qualifying call
- Anything answerable from public CH data — wastes their time + signals we didn't read

If the operator's `mentionPoints` input includes one of these, surface as a gap on `skillRun.complete` and ask in the brief whether the operator wants to override.
