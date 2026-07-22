---
name: rockcap-lender-outreach
version: 0.1.0
description: |
  This skill should be used when Rayn or Alex wants to take a finished scheme's
  lender pack out to market and log it to the terms tracker. Trigger it when they
  ask to "draft the lender outreach", "draft the senior/mezz/equity emails",
  "send the pack to the lenders", "go out to lenders on [scheme]", "make the
  lender drafts", "draft outreach for [lender list]", "create the Gmail drafts for
  the lenders", or say anything that means emailing a finished lender pack to a
  list of senior/mezzanine/equity funders for a specific scheme — even if the word
  "outreach" is never used.

  This skill owns the EMAIL + Gmail-draft-creation + tracker-logging workflow. It
  does NOT write the lender note itself (that is rockcap-lender-note) or build the
  pack contents. It produces plain, on-brand Gmail drafts in Rayn's inbox —
  addressed to each lender, CC Alex, with the matching pack attached — for Rayn to
  review and send. It never sends autonomously.

  Distinct from the RockCap MCP `outreach-draft` skill, which is cold BD cadence
  to PROSPECTS (borrowers). This is lender-pack outreach for a live deal. See the
  "Hybrid / MCP migration" section for how each step maps onto the MCP tools when
  the deal is loaded into the RockCap web app.
license: Proprietary (RockCap internal)
compatibility: claude-code
---

# RockCap Lender Outreach Skill

Takes a finished lender pack to market: resolves each contact, checks warm/cold,
drafts the email per tier, attaches the right pack, CCs Alex, creates the Gmail
drafts in one process, and logs every lender to the scheme's terms tracker.

Read `references/email-templates.md` for the verbatim body templates, the leverage
clause library, salutation rules, and the hard-won gotchas. Use
`scripts/make_lender_drafts.py` to create the drafts from a JSON config.

## When to use / not use

- **Use** when the pack exists (notes, appraisal, CV, A&L, planning, plans) and Rayn
  wants to go out to a list of senior, mezzanine and/or equity funders.
- **Don't use** to write the note (→ rockcap-lender-note) or to humanise tone in
  isolation (→ rockcap-alex-voice; though the templates here are already in Alex's
  plain voice and need no further processing).

## Inputs

- **Scheme + pack location** — the `3. Lender Pack/{Senior,Mezz,Equity} Lender Pack/`
  folders for the deal (each = the tier note + appraisal + client build appraisal +
  borrower CV + combined A&L + planning/appeal + Design & Access + Plans/, ~22 files).
- **Lender list, grouped by tier**, each with a contact name and any per-lender
  leverage instruction from Alex (e.g. "HTB 65% only", "Sibner 75%", "Zenzic highest
  available", "Falco — senior 1st-charge product").
- **Scheme subject stem** — `"[Scheme], [Town] / [Borrower] / "` then the tier suffix
  (`Residential Development Finance` | `Mezzanine Finance` | `Development Equity`).

## Workflow

1. **Resolve every contact's email — do not trust memory.** For each lender:
   resolution order is (a) **sent mail** (`fetch_by_query.py "from:rayns@rockcap.uk <name/domain>"`)
   for the exact address used historically, (b) **HubSpot** (`search_crm_objects` on
   contacts, or company → associated contacts), (c) **Lender Database** xlsx in the
   Lender Database project. Cross-check: the Lender DB is sometimes stale/wrong
   (it once had Ingenious as `ingenious.co.uk` / "surname TBC" when HubSpot correctly
   had `theingeniousgroup.co.uk`, Williamson & Sefton). HubSpot usually wins.

2. **Determine warm vs cold per contact — verify, don't assume.** Warm = Rayn has
   EVER sent to that address/domain (any deal). Cold = never. Run a sent-only check
   (`from:rayns@rockcap.uk (<name> OR <domain>)`, filter to SENT to an external
   address). Rayn's recollection is frequently wrong both ways — confirm each before
   drafting and report the gaps before drafting.

3. **Build each email** from the tier template (`references/email-templates.md`):
   - Salutation: `Hi <first name>,` (multi-contact: `Hi <A> and <B>,`).
   - `I hope you are well.`
   - **Cold only:** the intro line. **Warm:** no intro line.
   - The tier lead sentence + the per-lender leverage clause.
   - The "I have attached:" block for that tier.
   - The closing line: **"Alex will give you a call to discuss."** (never "shortly" —
     no time pressure on Alex to reach them all).
   - **NO sign-off, NO signature text (changed 17/07/2026).** The body ends on the
     closing line. The `create_draft_*` scripts auto-append Rayn's real Gmail
     signature (`gmail-api/signature_rayn.html`, sign-off included); typing one
     produces the double-signature Rayn always had to fix.
   - **Keep each sentence on ONE line — never wrap a sentence across lines.** This is a
     recurring error Alex flags; the draft builder writes long single lines.

4. **Attach the matching pack to the matching tier.** Senior list → Senior pack,
   mezz → Mezz pack, equity → Equity pack. **Special case:** a lender grouped under
   equity that we are actually asking for senior 1st-charge debt (e.g. Falco) gets
   the **SENIOR** pack and the 1st-charge lead sentence, with the senior subject.

5. **CC Alex (`alex@rockcap.uk`) on every draft.**

6. **Create the drafts in ONE python process** via `scripts/make_lender_drafts.py`
   (imports `create_new_draft`). Drafts land in Rayn's inbox. See gotchas for the
   compose-scope handling.

7. **Log to the terms tracker.** Add/refresh each lender in
   `4. Terms Received/[Scheme]_TermsTracker_RS_INTERNAL_Vx_YYYYMMDD.xlsx`
   (tier, contact, email, leverage requested, outreach date, status). If no tracker
   exists, build one (columns: #, Lender, Type, Contact, Email, Leverage requested,
   Outreach date, Status, Terms rec'd date, Gross loan, Day 1 LTV, LTGDV, Margin,
   Arrangement fee, Exit fee, Term, Key conditions, Notes; Status dropdown:
   Sent / Awaiting / Terms received / Declined / No response / Draft – to send).

8. **Report and stop.** Drafts are for Rayn to review and send. Never send. Surface
   any judgement calls (name spellings, lenders with no contact named, cold/warm
   flips found).

## Gotchas (hard-won)

- **Compose scope / consent.** Drafts need `gmail.compose`. As of 17/06/2026 the
  `fetch_*` reader scripts also carry compose, so reads no longer strip the token and
  the consent loop is fixed. If a draft attempt 403s "insufficient scopes", delete
  `token.json` and run once for a one-time browser consent, then it's stable. Always
  create all drafts in ONE python process.
- **Warm/cold and email resolution must be verified**, not taken from memory — see
  steps 1–2. Report the warm/cold map and any missing addresses BEFORE drafting.
- **Sentences must not wrap mid-line** in the body.
- **Right pack to right tier**; Falco-type senior-from-the-equity-list exceptions.
- **Pack file count** is ~22 (7 docs + 15 plans). The builder asserts the count so a
  missing pack file fails loudly rather than sending an incomplete pack.

## Hybrid / MCP migration

This skill is the local Gmail implementation. When the deal + lenders + contacts +
documents are loaded into the RockCap web app (Convex), migrate step-by-step:

- Step 1 contact resolution → lender `clients`/`contacts` rows + `lender_matchForDeal`.
- Step 6 draft creation → `outreach_draftToLender` (stages to the /approvals queue
  with `lenderClientId`, `contactId`, `projectId`, `attachedDocumentIds`) instead of
  Gmail. One call per lender; a future `lender-outreach-fanout` skill batches them.
- Step 7 tracker → the MCP `terms-comparison` skill (Step 9) once it's operational.
- The invariant is identical either way: **no autonomous send** — everything lands as
  a draft/pending approval for the operator.
