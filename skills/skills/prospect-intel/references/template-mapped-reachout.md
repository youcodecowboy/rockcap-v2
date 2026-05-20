# Template-Mapped Reachout

Reference loaded by `../SKILL.md` step 7. This document defines the reachout email patterns RockCap uses for cold prospects, indexed by classification (per `./bridging-vs-developer.md`) and by trigger context. The skill picks the right template, populates the variables, and stages an `approvals` row of type `gmail_send`.

## Operating principles

These apply across every template. They come from CONVENTIONS but are restated here because they are what makes a RockCap reachout sound like RockCap.

1. **Open with the substance.** No "I hope this email finds you well". The first sentence either references the trigger or names the specific intelligence finding that motivated the email.
2. **Show evidence, not enthusiasm.** A line about a charge filing, a planning approval, a sale, a press mention. The recipient should immediately understand we have done homework.
3. **One ask, plain.** A 15-minute call to learn about their pipeline. Not "I would love to" or "It would be wonderful if". Just "Can we find a quarter of an hour next week?".
4. **No marketing copy.** No "leading", "premier", "trusted", "innovative". Replace adjectives with facts (we placed £x last year, we work with y lenders).
5. **Sign off properly.** RockCap's standard signature, partner-level when appropriate. Avoid first-name-only signoffs to people we have never met.
6. **HTML in HubSpot notes, plain or simple HTML in Gmail.** The Gmail send wrapper handles either body type. Templates produce both.

## Template matrix

| Classification | Trigger context | Template |
|---|---|---|
| bridging | planning approval | `bridging.planning_approval` |
| bridging | recent charge filing | `bridging.recent_charge` |
| bridging | press mention of sale | `bridging.recent_sale` |
| bridging | referral or cold | `bridging.cold` |
| development_finance | planning approval | `development_finance.planning_approval` |
| development_finance | recent charge filing | `development_finance.recent_charge` |
| development_finance | press mention | `development_finance.press_mention` |
| development_finance | referral or cold | `development_finance.cold` |
| term_loan | planning approval | not applicable; route to development_finance instead |
| term_loan | recent charge filing | `term_loan.refinance_window` |
| term_loan | press mention | `term_loan.press_mention` |
| term_loan | referral or cold | `term_loan.cold` |
| unclassifiable | any | none; do not reach out |

## Template structure

Each template has these slots:

- `subject` — plain string, no emoji, no exclamation mark.
- `bodyText` — plain text version for clients that strip HTML.
- `bodyHtml` — simple HTML with `<p>` paragraphs, `<a href="">` links, no inline styles, no images.
- `variables` — the named placeholders the skill must populate before composing.
- `requirements` — facts the skill must have before using this template. If any are missing, the skill picks a more generic template or stops.

Templates are stored as data the skill loads at runtime. For v1 they live inline in this reference; later they migrate to `emailTemplates` table rows seeded from this document.

## Variable conventions

Every template uses a consistent variable vocabulary:

- `{borrower.firstName}` — first name of the recipient. If unknown, stop and resolve before sending.
- `{borrower.companyName}` — trading name of the borrower company.
- `{trigger.summary}` — one-sentence description of the trigger, evidence-grounded.
- `{trigger.detail}` — a longer (one short paragraph) version when the template uses it.
- `{intel.lenderDnaSummary}` — one sentence on what the charge book reveals.
- `{intel.recentSchemeAddress}` — only when a specific scheme is the hook.
- `{rockcap.partner.name}` — the sending partner's name.
- `{rockcap.partner.role}` — "Partner", "Director", etc.
- `{rockcap.facilityRange}` — the kind of facility we typically place for this classification.
- `{rockcap.recentDealExample}` — one anonymised sentence about a recent similar deal, optional. Use sparingly.

If a variable cannot be populated from the data the skill has, the skill stops and surfaces the gap. Filling in a placeholder with "the borrower" or "your company" is a fabrication and is forbidden by CONVENTIONS.

## Templates

### `bridging.planning_approval`

Requirements: `borrower.firstName`, `borrower.companyName`, planning reference and approval date in `trigger.detail`, at least one previous bridging charge in `intel.lenderDnaSummary`.

```
Subject: Bridging finance for {trigger.summary}

Hi {borrower.firstName},

I saw {trigger.detail}. {intel.lenderDnaSummary}, so I expect you're at the
point of thinking about the next round of capital.

We arrange bridging finance for developers with your pattern of activity,
typically in the {rockcap.facilityRange} range. If you have a window in the
next two weeks, fifteen minutes on the phone would let me show you what
we're seeing on terms.

{rockcap.partner.name}
{rockcap.partner.role}, RockCap
```

### `bridging.recent_charge`

Requirements: charge filing date in `trigger.detail`, lender name in `trigger.detail` if disclosed.

```
Subject: Following the recent charge filing at {borrower.companyName}

Hi {borrower.firstName},

I noticed the new charge filed at {borrower.companyName} on {trigger.detail}.
Bridging tenor, by the look of the documentation.

If this scheme has an exit financing component coming up, or if you have
another transaction queued up that needs a comparable structure, a short
call would be useful. We work with {rockcap.facilityRange} on bridging,
across most of the names you'll have seen in our space.

{rockcap.partner.name}
{rockcap.partner.role}, RockCap
```

### `bridging.recent_sale`

Requirements: sale reference in `trigger.detail`, asset class match in `intel.lenderDnaSummary`.

```
Subject: Refinance window after {trigger.summary}

Hi {borrower.firstName},

I saw {trigger.detail}. Either there's a refinance window opening or
proceeds are about to redeploy. We arrange bridging on both shapes of
the trade.

If next week works for a quarter-hour call, I can walk through what we're
placing right now.

{rockcap.partner.name}
{rockcap.partner.role}, RockCap
```

### `bridging.cold`

Requirements: `intel.lenderDnaSummary` populated (no contact without homework).

```
Subject: Bridging for {borrower.companyName}

Hi {borrower.firstName},

{intel.lenderDnaSummary}. That activity sits squarely in the bridging
market we operate in: {rockcap.facilityRange}, mostly off-bank lenders
who close fast.

We try to be useful before we're transactional. If a fifteen-minute call
sometime this month works, I'll show you what we're seeing on rates and
terms across the lenders relevant to your activity.

{rockcap.partner.name}
{rockcap.partner.role}, RockCap
```

### `development_finance.planning_approval`

Requirements: planning reference and approval date in `trigger.detail`, scheme address in `intel.recentSchemeAddress`, scheme scale visible (units, GDV estimate if known).

```
Subject: Development finance for {intel.recentSchemeAddress}

Hi {borrower.firstName},

I saw the approval on {trigger.detail} for {intel.recentSchemeAddress}.
Scheme like this typically lands at facilities in the
{rockcap.facilityRange} range; lenders for this shape are a different
set from what shows up in {borrower.companyName}'s charge book.

A short call before you're in front of the lenders would be useful. I
can show you what we're seeing on day-one releases, LTGDV, and where
the trade-offs are between the bank-style underwriters and the specialist
development lenders right now.

{rockcap.partner.name}
{rockcap.partner.role}, RockCap
```

### `development_finance.cold`

Requirements: `intel.lenderDnaSummary` with at least one development-finance pattern named.

```
Subject: Development finance for {borrower.companyName}

Hi {borrower.firstName},

{intel.lenderDnaSummary}. We place senior development debt for borrowers
with this profile, typically {rockcap.facilityRange}, across the
specialist development lenders and the challenger banks that do this
work properly.

If you have a scheme moving towards site purchase or starting on site
this year, fifteen minutes on the phone next week would let me show you
the current terms picture across the lenders relevant to your activity.

{rockcap.partner.name}
{rockcap.partner.role}, RockCap
```

### `term_loan.refinance_window`

Requirements: charge maturity inference in `trigger.detail`, current lender named if visible.

```
Subject: Refinance window at {borrower.companyName}

Hi {borrower.firstName},

The charge documentation suggests {trigger.detail}. If the current
financing is approaching maturity or covenants are getting tested, the
investment-loan market has moved meaningfully in the last six months.

A short call to walk through where rates and structure sit right now
would be useful. We work with the bank and challenger-bank lenders who
do this product properly; the differences in terms today are larger
than they have been in a while.

{rockcap.partner.name}
{rockcap.partner.role}, RockCap
```

### `term_loan.cold`

Requirements: `intel.lenderDnaSummary` indicating term-loan-suitable pattern.

```
Subject: Investment financing for {borrower.companyName}

Hi {borrower.firstName},

{intel.lenderDnaSummary}. We place investment debt against
income-producing assets across the lender market, typically
{rockcap.facilityRange}.

If you have a refinance approaching, or an acquisition in train, a short
call next week would let me share where the bank, challenger, and debt
fund pricing sits right now. The spread has widened recently, which
makes the lender choice matter.

{rockcap.partner.name}
{rockcap.partner.role}, RockCap
```

## Anti-patterns

Things templates avoid, and skills should not introduce when populating:

- **No urgency manufacture.** "I'd love to chat soon" is fine; "Time is of the essence" is not, unless it actually is.
- **No name-dropping.** Never reference a competing broker or another borrower by name.
- **No deal-stage assumptions.** Don't say "I know you're looking at site X" unless you actually do.
- **No first-name signatures from senior partners** unless the relationship justifies it. Use the full signature.
- **No three-paragraph emails.** Two paragraphs of substance, one of ask. Anything longer should be a memo not an email.

## Output to Convex

When the skill produces a reachout, it stages an approval with:

```json
{
  "entityType": "gmail_send",
  "summary": "<short description of the reachout, e.g. 'Bridging reachout to John Smith at Acme Developments based on recent charge filing'>",
  "draftPayload": {
    "to": ["resolved.recipient@email"],
    "subject": "<populated subject>",
    "bodyText": "<populated plain text>",
    "bodyHtml": "<populated simple HTML>"
  },
  "requestSource": "skill",
  "requestSourceName": "prospect-intel",
  "relatedContactId": "<contactId if known>",
  "relatedClientId": "<clientId of the borrower>"
}
```

The actual send happens only when a human approves through `/approvals`. Skills never bypass.
