# RockCap outreach voice (Alex Lundberg)

Canonical voice and tone reference for every external-facing draft RockCap produces: cold prospect outreach, the prospect-intel cadence touches, and qualify-and-draft replies. Read this before composing any email a prospect, client, or lender will see.

**Provenance:** distilled from RockCap's first-source outreach material (a sample of ~140 cold emails Alex Lundberg sent Jan 2025 to May 2026, plus her stated preferences and per-batch edit notes). It is the canonical home for that knowledge inside this project. `CONVENTIONS.md` holds the firm-wide writing rules; this reference adds the outreach-specific voice on top.

## Who the voice is

The sender is **Alex Lundberg, Director, RockCap** (alex@rockcap.uk). Outreach is written in her first person ("I came across...", "we arrange debt & equity..."). Drafts are signed **Alex**, with the full signature block below. Do not invent a different sender, and do not sign drafts "RockCap" or with a placeholder; the canonical sender is Alex.

## The opener skeleton (near-invariant)

Every cold send has the same skeleton. The only slot that changes per prospect is the `<HOOK>`:

```
Subject: <Company name> Enquiry

Hi <First name>,

I hope you are well

I came across <Company name> and wanted to reach out, <HOOK>.

<Template body — see prospect-intel/references/template-mapped-reachout.md>

Look forward to hearing from you.

<Signature>
```

The greeting, the "I hope you are well" line, and the "I came across X and wanted to reach out" lead are constants. Build them verbatim. The personalisation lives almost entirely in the `<HOOK>` slot, which is selected per the **hook ladder** (`hook-ladder.md`).

## Greeting variants

| Recipient | Pattern |
|---|---|
| One named contact | `Hi <First name>,` (the comma is sometimes omitted; both forms are in use) |
| Two named | `Hi <F1> and <F2>,` |
| Two, addressed together | `Hi Guys, I hope you are both well` |
| Three or more / unsure | `Hi Guys,` |
| No named contact (website hook) | `Hi there, I came across the <Company> website` (rare) |

The Large Housebuilder template defaults to "Hi (CONTACT NAME)" + "I hope you are both well"; switch to single-form if only one director.

## Subject conventions

- Default: `<Company name> Enquiry`. Note **Enquiry**, the UK spelling. Never `Inquiry`.
- Compound entities: `<Brand1> / <Brand2> Enquiry`.
- Where the full name is unwieldy, shortening is allowed as a manual override (e.g. "Calon Enquiry" not "Calon Construction Enquiry"). Default to the full name.
- Reply chain: standard `Re:` prefix, no Enquiry removal.

## Sign-off and signature

Sign-off is `Kind regards,` then `Alex` (single name on the sign-off; full block in the signature). The canonical HTML signature, verbatim:

```html
<div data-hs-signature="true" class="hs_signature">
  <div>Kind regards,</div>
  <br>
  <div>Alex</div>
  <br>
  <div><strong>ALEX LUNDBERG</strong></div>
  <div>DIRECTOR</div>
  <br>
  <div>Mobile: 07815912057</div>
  <div>Email: <a href="mailto:alex@rockcap.uk">alex@rockcap.uk</a></div>
  <div>Web: <a href="http://rockcap.uk/">rockcap.uk</a></div>
  <br>
  <div><strong>RockCap</strong></div>
  <br>
  <div>This email and any attachments hereto are for the attention of the addressee only; its contents are personal, private and confidential and may be privileged. If you are not the intended recipient please will you notify us by return email or telephone, remove this email and any attachments from your computer, and do not disclose the email or any part of it to any other party. Please accept our apologies for any inconvenience caused.<br><br>This email and any attachments have been virus checked prior to sending. However, we take no responsibility for any viruses attached hereto and can accept no responsibility for any damage caused as a result of malicious code or viruses attached hereto. We use regularly updated virus checker, firewall and malware/spyware checking technology.</div>
</div>
```

## Quirks to preserve verbatim

These look like errors. They are not. Do NOT normalise them:

1. **"Are you free for a coffee or a call or coffee"** — "or coffee" repeats. Verbatim from the canonical templates.
2. **"portfolio's"** — the apostrophe-s in the Large Housebuilder RCF paragraph is verbatim.
3. **"I hope you are well"** — may or may not have a full stop after "well". Both forms are in use. Do not normalise.
4. **Comma after "Hi <Name>"** — sometimes present, sometimes not. Both in use.
5. **"&" not "and"** in `debt & equity`.
6. **"complimented"** appears for "complemented" in the Large Housebuilder RCF paragraph; preserved verbatim in that template.

## UK English and anti-AI patterns

All of `CONVENTIONS.md` applies. The ones that matter most for outreach:

- **UK English throughout:** Enquiry, recognise, organise, favour, behaviour, colour, programme, modelling, cancelled, focussed.
- **No em dashes anywhere.** Strict. Use a comma, a semicolon, a parenthesis, or a short sentence.
- **No rule-of-three** constructions and **no "not X but Y"** parallelisms.
- **No promotional adjectives:** bespoke, robust, strategically located, tailored solution, and similar marketing language. State facts.
- One short, plain ask (a call or a coffee). No "I would love the opportunity to" padding beyond what the templates already carry.

## Credit-attribution rule

For multi-generational, family, or long-standing businesses (names with "Brothers", "& Sons", "Homes since [pre-1990s date]", or an obviously inherited business), drop "have built up" and other past-tense credit. The current operator did not build it from scratch, so the credit is misplaced. Use the present tense instead: "looks like you have a fantastic business" rather than "looks like you have built up a fantastic business".

## Hard rules (do not break)

1. **Never name a prospect-side client in a cold send.** "We have done deals near you" or "we have done deals in [region]" is fine; "we did a deal with [Client X]" is not, even if the prospect would know that client. Confidentiality is hard. When citing a RockCap deal as a credibility hook, name the deal RockCap led on or the lender side, never the prospect-side counterparty.
2. **Never fabricate** scheme names, scheme statuses, planning references, architectural detail, lender names, lender behaviour, locations, or contact details. If a hook needs evidence and the evidence is not there, drop to a weaker but honest rung of the hook ladder.
3. **Lender-history acknowledgment is too forward for a cold first send.** Do not open with "your senior pattern with [Lender] looks like the kind of structuring we work with daily". Lender DNA *selects* the template; it does not *write* the hook. This line is acceptable only on a warm reconnect.
4. **Never auto-send.** Outreach is drafted for human review and approval (an `approvals` row or a held cadence). A human sends.
5. **Verified contact emails only.** Pulled from a verified source, never constructed from a name pattern. A bounce burns the target.
6. **Check lender tiers before drafting.** If the prospect borrows from a Tier 1 (favourite) lender, park rather than pitch; if Tier 2 (preferred), soften the hook to broad-brush. See `lender-tiers.md`.

## When this voice applies

- **prospect-intel** cadence package (the four touches): touch 1 follows this skeleton with a hook from the hook ladder. Sign as Alex.
- **qualify-and-draft** replies: the same voice, in reply form (`Re:` subject, no "I came across" lead).
- **outreach.draftFreshEmail / draftToLender**: borrower-side uses this voice; lender-side uses the lender corpus tone (still UK English, no em dashes, plain ask).

## Cross-references

- `hook-ladder.md` — the 10 ranked hook types that fill the `<HOOK>` slot, with the data each needs.
- `../skills/prospect-intel/references/template-mapped-reachout.md` — the five canonical template bodies and the Lender-DNA-to-template selection.
- `lender-tiers.md` — park (Tier 1) / soften (Tier 2) rules to apply before drafting.
- `rockcap-regional-activity.md` — regions for the RockCap-active hook (rung 4), no client names.
- `sender-geography.md` — Alex's personal geography for the personal-connection hook (rung 3); human-confirm before send.
- `../sub-skills/compose-outreach-hook.md` — the procedure that selects and writes the hook.
- `../CONVENTIONS.md` — firm-wide writing rules this reference sits on top of.
