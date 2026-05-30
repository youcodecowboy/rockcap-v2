# Template-Mapped Reachout

Reference loaded by `../SKILL.md` step 11. It defines the reachout email patterns RockCap uses for cold prospects, in two layers:

1. **Deal type + trigger select the product.** Per `./bridging-vs-developer.md`: `new_development`, `bridging`, `existing_asset`, `unclassifiable`.
2. **For developer outreach, lender DNA selects the template, the hook ladder fills the hook, the voice governs tone.** The five proven canonical templates below (from RockCap's real sent corpus) are the source of truth for developer sends. The `<HOOK>` is chosen per `../../../shared-references/hook-ladder.md`; the opener skeleton, sign-off and quirks come from `../../../shared-references/rockcap-outreach-voice.md`; lender tiers (`../../../shared-references/lender-tiers.md`) gate whether to send at all (park Tier 1, soften Tier 2).

The skill populates the template and stages a cadence touch / `approvals` row for review. Never auto-send.

## Operating principles

The authoritative voice, opener skeleton, sign-off and verbatim quirks live in `../../../shared-references/rockcap-outreach-voice.md`. Read it first. Where the generic guidance below differs from that proven voice (drawn from ~140 of Alex's real sent emails), **the proven voice wins.**

1. **Use the proven opener.** "Hi <First name>, / I hope you are well / I came across <Company> and wanted to reach out, <hook>." The hook carries the substance. Avoid only the AI tell "I hope this email finds you well"; "I hope you are well" is the correct, proven line.
2. **Show evidence, not enthusiasm.** The hook is grounded in a real scheme, charge pattern, region, or RockCap deal. Never fabricate; drop a hook-ladder rung instead.
3. **One ask, plain.** The proven ask is "Are you free for a coffee or a call or coffee over the next couple of weeks?" (the "or coffee" doubling is verbatim, keep it).
4. **No marketing copy.** No "leading", "premier", "bespoke", "tailored solution". UK English, no em dashes, no rule-of-three.
5. **Sign as Alex.** "Kind regards, / Alex", with the full signature block from the voice reference. The canonical sender is Alex Lundberg, Director; do not sign "RockCap" or use a placeholder.
6. **Check lender tiers before drafting** (`../../../shared-references/lender-tiers.md`): park Tier 1, soften Tier 2.

## Template matrix

| Classification | Trigger context | Template |
|---|---|---|
| bridging | planning approval | `bridging.planning_approval` |
| bridging | recent charge filing | `bridging.recent_charge` |
| bridging | press mention of sale | `bridging.recent_sale` |
| bridging | referral or cold | `bridging.cold` |
| new_development | planning approval | `new_development.planning_approval` |
| new_development | recent charge filing | `new_development.recent_charge` |
| new_development | press mention | `new_development.press_mention` |
| new_development | referral or cold | `new_development.cold` |
| existing_asset | planning approval | not applicable; route to new_development instead |
| existing_asset | recent charge filing | `existing_asset.refinance_window` |
| existing_asset | press mention | `existing_asset.press_mention` |
| existing_asset | referral or cold | `existing_asset.cold` |
| unclassifiable | any | none; do not reach out |

## Canonical developer templates (proven) + lender-DNA selection

For developer outreach (`new_development` and portfolio/investor prospects), use these five templates captured verbatim from RockCap's real corpus. They supersede the generic `new_development.*` patterns further down (which are kept for reference). Select by lender DNA, brand read, and scale. The `(Insert Hook)` slot is filled per `../../../shared-references/hook-ladder.md`; tone per `../../../shared-references/rockcap-outreach-voice.md`.

### Lender DNA → template

| Lender pattern on main SPVs | Read | Template |
|---|---|---|
| Paragon / UTB / HTB / Shawbrook / Close / Aldermore | SME developer, scheme-by-scheme | **Housebuilder 2** (default; most targets) |
| Lloyds / HSBC / NatWest / Barclays / Handelsbanken, scheme-by-scheme | Mid-size SME, not RCF-tier | **High Street Bank Client** |
| HS bank across multiple group entities, portfolio-shaped | Institutionally-backed, RCF-tier | **Large Housebuilder** |
| Single specialist across 30+ charges | Portfolio operator / asset manager | **High LTPP** |
| Contractor / construction services, not own-development | Contracting business | **Contractor** |

**RCF check (High Street Bank Client vs Large Housebuilder).** The distinguishing question is whether the HS bank facility is an RCF / portfolio facility, not whether the HS bank is present. Charges on **scheme-level SPVs** (one charge per development vehicle, scheme name in the particulars) → High Street Bank Client. Charges across **multiple group entities** (holdco + investment vehicle + several SPVs, same lender, clustered renewal dates) or an RCF named on the website / accounts → Large Housebuilder. When in doubt, default to High Street Bank Client (the Large Housebuilder "long shot given your HSBC facility" framing implies a confirmed RCF). Worked example: Burgess Homes has HSBC + Lloyds across 15 charges, but on scheme-level SPVs, so High Street Bank Client is correct, not Large Housebuilder.

### Housebuilder 2 (challenger-bank DNA; default)

```
Hi (FIRST NAME)

I hope you are well

I came across (DEVELOPER NAME) and wanted to reach out, (Insert Hook)

Are you free for a coffee or a call or coffee over the next couple of weeks? We arrange debt & equity for SME developers, last year we did deals with clients ranging from housebuilders delivering 200-600 units a year to clients delivering much smaller more bespoke schemes.

I'm sure you are really well covered but wanted to see whether there was anything we could look at working on. Given the challenges in the market at the moment and how tight SME's cashflows are it seems that really good quality borrowers are needing creative solutions to get them onto new or through their existing schemes and we're finding that we are able to come up with well thought through funding structures that are outside of their normal stable of lenders / investors.

We're active at the moment with stretch senior, mezz and a handful of equity providers and always keen to speak with high quality borrowers to see if there is a way of working together.

Look forward to hearing from you.

{Signature}
```

### High Street Bank Client (HS-bank scheme-by-scheme, no RCF)

```
Hi (FIRST NAME)

I hope you are well

I came across (DEVELOPER NAME) and wanted to reach out, (Insert Hook)

Are you free for a coffee or a call or coffee over the next couple of weeks? We arrange debt & equity for SME developers, last year we did deals with clients ranging from housebuilders delivering 200-600 units a year to clients delivering much smaller more bespoke schemes.

I'm sure you are really well covered but wanted to see whether there was anything we could look at working on. Given the market at the moment we are finding that really good quality borrowers are open to new funding solutions outside of their normal stable of lenders / investors.

We are actively working with developers who have traditionally borrowed from high street banks but feel that moderately higher leverage allows their cash to work harder for them without a substantial increase in risk or cost.

Seeing who you borrow from, we would love to have a conversation about how we may be able to help with some more flexible financing.

Look forward to hearing from you.

{Signature}
```

### Large Housebuilder (RCF-tier; "long shot" framing)

```
Hi (CONTACT NAME)

I hope you are both well.

I've come across (DEVELOPER NAME) a handful of times over the last few years, looks like the business is doing incredibly well.

I completely appreciate this is a long shot given it looks like you have an HSBC facility but I thought it was worth getting in touch.

One of our main lending partners has done deals with several institutionally backed housebuilders and can provide flexible senior portfolio funding at higher leverage than the clearing banks, regear portfolio's of standing stock or bridge land ahead of development commencing to relieve cashflow pinches.

Would love the opportunity to see if there is something we could look at, for context, we have done deals with housebuilders delivering several hundred units a year and have structured funding solutions that have complimented and sat alongside their existing RCFs.

Look forward to hearing from you.

{Signature}
```

(Quirks verbatim: "portfolio's", "complimented", "I hope you are both well". Keep them.)

### High LTPP (portfolio operators / investors, heavy single-lender)

```
Hi (FIRST NAME)

I hope you are well

I came across (DEVELOPER NAME) and wanted to reach out, (Insert Hook)

Are you free for a coffee or a call or coffee over the next couple of weeks? We arrange debt & equity for property developers and investors, last year we did deals with clients ranging from housebuilders delivering 200-600 units a year to investors acquiring assets Below Market Value through well structured deals.

We have done several deals recently with experienced investors where we've arranged funding at a very high net Loan to Purchase Price and enabled them to increase their pipeline significantly as they are tying up less of their own cash.

We're active at the moment with lenders funded in a variety of different ways, from family offices and HNWs to specialist funds / alternative lenders.

We are always keen to speak with high quality borrowers to see if there is a way of working together.

Look forward to hearing from you.

{Signature}
```

### Contractor (contracting businesses; opens with a question, shortest, no hook slot)

```
Hi (FIRST NAME)

I hope you are well.

I came across (CONTRACTOR NAME) and wanted to reach out to see if you do any of your own developments?

We work with a handful of contracting businesses (turnovers ranging from £20m-£100m) who have gone into development and have arranged really competitive financing packages for them on their schemes.

Are you free for a call or coffee over the next couple of weeks?

Look forward to hearing from you.

{Signature}
```

The Contractor template has no `(Insert Hook)` slot: the opening question does the work, and a specific hook risks presuming own-developments they may not have. Its social-proof line can be lifted into a Housebuilder 2 hook for prospects that straddle contracting and development.

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

### `new_development.planning_approval`

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

### `new_development.cold`

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

### `existing_asset.refinance_window`

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

### `existing_asset.cold`

Requirements: `intel.lenderDnaSummary` indicating existing-asset (investment/term-loan) pattern.

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
