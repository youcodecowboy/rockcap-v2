# Lender Outreach — Email Templates & Clause Library

Verbatim building blocks for the drafts. The voice is Alex's house style already
(plain, factual, advisory, UK English, no em dashes, no promotional adjectives), so
these need no further rockcap-alex-voice processing — but if you deviate from the
templates, run the result through rockcap-alex-voice before drafting.

Golden rule on formatting: **one sentence per line in the body — never wrap a
sentence across two lines.** Alex flags this every time. The builder script writes
long single lines on purpose.

## Body skeleton

```
<salutation>

I hope you are well.

<cold intro line — COLD contacts only; omit entirely for warm>

<lead sentence + leverage clause>

I have attached:
<attached block for the tier>

Alex will give you a call to discuss.
```

The body ENDS on the call line. No sign-off, no signature — see "Signature (Rayn)" below.

## Salutation

- Single contact: `Hi <first name>,`
- Two contacts: `Hi <A> and <B>,`

## Cold intro line (cold contacts only)

```
I work with Alex at RockCap and he wanted to share the below with you.
```

Warm contacts (Rayn has emailed them before, any deal) get **no** intro line. For a
genuinely first, formal cold approach you may close with `Any questions, please let
me know.` after the call line.

## Lead sentences by tier

**Senior:**
```
Please find attached the lender pack for a residential development at <Scheme>, <Town>, <County>. We are seeking senior development finance for the scheme, <leverage clause>
```

**Mezzanine:**
```
Please find attached the lender pack for a residential development at <Scheme>, <Town>, <County>. We are seeking mezzanine finance to sit behind a senior development facility, either stretching total leverage to c.75% LTGDV with no additional security, or taking additional security over the principals' residences and funding the full residual behind a senior-only facility.
```
(Mezz has no separate leverage clause — the ask is in the sentence.)

**Equity:**
```
Please find attached the pack for a residential development at <Scheme>, <Town>, <County>. We are seeking a development equity partner for the scheme, and the enclosed equity brief sets out the opportunity, structure and projected returns.
```

**1st-charge senior pitched to an equity-list lender (e.g. Falco):**
```
Please find attached the lender pack for a residential development at <Scheme>, <Town>, <County>. We are seeking senior development finance for the scheme, and we would be keen to understand your appetite under your first-charge product. The appraisal is modelled at both 65% and 70% LTGDV.
```

## Leverage clause library (senior)

Driven by Alex's per-lender instruction:

| Instruction | Clause |
|---|---|
| Default (both) | `and the appraisal is modelled at both 65% and 70% LTGDV.` |
| 65% only | `and we are only asking you to get to 65% LTGDV.` |
| 75% | `and we are looking for you to get to 75% LTGDV.` |
| 65/70/75 | `and we would like to request terms at 65%, 70% and 75% LTGDV.` |
| Highest available | `and we would like terms at the highest leverage you are able to offer.` |

## Attached block by tier

**Senior / 1st-charge:**
```
- Lender Note
- RockCap appraisal and client build appraisal
- <Borrower> CV and combined Asset & Liability statement
- Planning appeal decision, Design & Access Statement and approved drawings
```

**Mezzanine:** as senior but first line `- Mezzanine Note`.

**Equity:** as senior but first line `- Equity Brief`.

(Use "Planning consent" instead of "Planning appeal decision" if consent was granted
at application rather than appeal.)

## Closing line

```
Alex will give you a call to discuss.
```
Never "shortly" or any time-bound phrasing — it shouldn't pressure Alex to reach the
whole list in a hurry.

## Signature (Rayn)

**DO NOT put any sign-off or signature text in the body (changed 17/07/2026 — this was the thing Rayn always had to tinker with).** The `create_draft_*` scripts auto-append Rayn's REAL Gmail signature from `gmail-api/signature_rayn.html` (lifted verbatim from his sent mail: "Kind regards, Rayn", the RAYN SMID block, hours line and RockCap wordmark, properly styled). A typed plain-text signature on top produces a double signature. The body's last line is "Alex will give you a call to discuss." (or the cold closer), nothing after it.

## Subject line

```
<Scheme>, <Town> / <Borrower> / <Residential Development Finance | Mezzanine Finance | Development Equity>
```
The Falco-type 1st-charge lender uses the senior suffix (`Residential Development Finance`).

## Worked example (Oakridge Lynch, 17/06/2026)

- Warm senior, default: `Hi James,` → no intro → "...senior development finance for the scheme, and the appraisal is modelled at both 65% and 70% LTGDV." → senior attached block → "Alex will give you a call to discuss." → signature.
- Cold senior, 65% only (Close Brothers): `Hi Andrew,` → cold intro → "...and we are only asking you to get to 65% LTGDV." → close with `Any questions, please let me know.`
- Falco (equity list, senior pitch): `Hi Richard and Millie,` → senior pack → 1st-charge lead sentence → senior subject.
