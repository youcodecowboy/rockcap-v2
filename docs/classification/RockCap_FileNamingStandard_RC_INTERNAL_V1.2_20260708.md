# RockCap File-Naming Standard

**Purpose:** one firm-wide convention for every deal folder, readable by a human at a glance and parseable by the app's document classifier. Linton Lane (WSD Group) is the worked exemplar.

Authored RC · **V1.2** · 08/07/2026. Reviewed by Codex GPT-5.5 + Gemini 3.1 Pro; refined against Alex Lundberg feedback 08/07/2026.

**V1.2 changes:** RockCap docs use `RC` only (individual initials dropped — the app tracks who edited); dual-date docs now place the document date after the DocType and the filing date last (so the two dates aren't adjacent); dual-date set expanded to legal documents and Assets & Liabilities statements; version-numbering rule added; terms-reissue rule clarified.

---

## 1. The grammar

```
Standard    [Scheme]_[DocType]_[Origin]_[Status]_[Version]_[FilingDate].ext
Dual-date   [Scheme]_[DocType]_[DocumentDate]_[Origin]_[Status]_[Version]_[FilingDate].ext
```

- Fields are separated by underscore `_`; sub-parts *within* a field are joined by hyphen `-` (e.g. `CLIENT-WSD`, `LENDER-Avamore`).
- The **filing date is always the final token.** For the evidentiary/legal docs in §5 a **document date** is added immediately after the DocType — never adjacent to the filing date.
- `Status` and `Version` appear on RockCap-authored docs and on any third-party doc that arrives in drafts/versions (valuations, QS and monitoring reports, legals). Simple inbound docs omit them.
- Never put a space, underscore, or full stop inside a field value. Use PascalCase (`LintonLane`, `LenderBrief`, `DrawingSiteLocation`).

**At a glance:** `RC` = we made it · `CLIENT-`/`LENDER-` = they sent it · `INTERNAL` = working copy · `EXTERNAL` = the copy that went out · a date after the DocType = the document's own date; the trailing date = when we filed it.

---

## 2. Fields

**Scheme** — PascalCase scheme name, always first. e.g. `LintonLane`.

**DocType** — one PascalCase token from the controlled list in §6. If nothing fits, use `Misc` and flag it to be added — don't invent a type.

**Origin** — who RockCap **received it from**, not the upstream originator:
- `RC` — RockCap-authored. No individual initials; the app records who edited.
- `CLIENT-<x>` — from the borrower/sponsor. We only deal directly with the client and lenders, so council consents, drawings and client-side reports that arrive via the client are `CLIENT-`.
- `LENDER-<x>` — from a funder. Canonical name, aligned to the lender database (`LENDER-Funding365`, not `F365`).
- Specialist prefixes (§7) only when that party delivered to RockCap directly.

**Status** — RockCap advisory docs: `INTERNAL` (working/collation) or `EXTERNAL` (the copy issued out). Drafts/legals use the §8 values.

**Version** — `V1.0`, `V1.4`, etc. One version per file, never a range. See §4 for what bumps a version.

**DocumentDate / FilingDate** — `YYYYMMDD`. See §5.

---

## 3. Rules by origin

**RockCap-authored:**
```
LintonLane_LenderBrief_RC_INTERNAL_V1.3_20260608.docx
LintonLane_LenderBrief_RC_EXTERNAL_V1.4_20260608.docx
```

**Client-supplied / working (filing date only):**
```
LintonLane_DeveloperBuildCosts_CLIENT-WSD_20260608.xlsx
```

**Lender terms (filing date; reissues numbered — see below):**
```
LintonLane_Terms_LENDER-Avamore_20260612.pdf
LintonLane_Terms_LENDER-Avamore_R2_20260612.pdf
```
> **Terms reissues:** as a deal is negotiated a lender may send several term sheets — sometimes multiple in the same hour (e.g. Wimbledon / Octane reworking Day-1 leverage). Keep **every** set and number them `R1`, `R2`, `R3`… Never delete the earlier ones — how the terms changed, and why, is useful intelligence for the business and the app.

**Upstream evidence & legals — dual date (document date after DocType, filing date last):**
```
LintonLane_PlanningPermission_20240115_CLIENT-WSD_20260608.pdf
LintonLane_Valuation_20260620_VALUER-Savills_DRAFT_V1.0_20260622.pdf
LintonLane_Valuation_20260625_VALUER-Savills_FINAL_V2.0_20260626.pdf
LintonLane_InterimMonitoringReport-No2_20260901_QS-Stace_20260903.pdf
LintonLane_FacilityAgreement_20260704_LENDER-Avamore_EXECUTED_20260705.pdf
LintonLane_AssetsLiabilitiesStatement_20260601_CLIENT-WSD_20260608.pdf
```

---

## 4. Version numbering

The version records *how far the document has moved*, so the app and we can see at a glance why a `V2.0` differs from a `V1.1`:

- **Major bump (whole number, e.g. `V1.x → V2.0`)** — the client issues a **new appraisal**, or a **material change** lands: GDV moves, comps are added, scheme scope changes.
- **Minor bump (e.g. `V1.1 → V1.2`)** — smaller edits and iterations.

The app versions automatically; this defines the intent behind the numbers so the context isn't lost.

---

## 5. Date model — filing date vs document date

Two kinds of date:

- **Filing date** — the **final** token, on **every** file. When the file entered our filing as the current version (issue date for our docs, received date for third-party). The recency / "latest available, pick this one" marker.
- **Document date** — added **immediately after the DocType** for third-party evidentiary and legal documents whose own vintage matters. It is the date printed on / effective for the document itself.

**Rule of thumb (Alex):** documents we edit, and simple client working docs → **filing date only**. Documents **upstream of the client** (produced by valuers, surveyors, councils, solicitors — anyone upstream, reaching us via the client or lender) → **both dates**. Why: you can receive a 2024 planning permission *after* a 2026 one; filing-date-only would make the older look newer. The document date pins the true vintage; the filing date still gives recency. The two are kept apart in the name (document date up front, filing date at the end) so they're easy to read.

**Which DocTypes carry a document date:**
- `PlanningPermission` — the **permission/decision date**; if unavailable, the **application date**.
- `Valuation` — the **valuation date**.
- `QSReport` · `InitialMonitoringReport` · `InterimMonitoringReport` — the **report date**.
- `AssetsLiabilitiesStatement` — the **statement date**.
- Legal documents (`FacilityAgreement`, `Debenture`, `PersonalGuarantee`, `LegalOpinion`, `CertificateOfTitle`) — the **document/execution date**.

Everything else is filing-date only.

---

## 6. DocType master list (controlled — extend deliberately)

**Modelling & pack:** `LenderBrief` (was "LenderNote") · `ClientBrief` · `BuildCostSchedule` (our costed schedule) · `DeveloperBuildCosts` (client's raw costs) · `AppraisalModel` · `TermsAnalysis` · `CompsReport` · `AppendixA` (comps master schedule) · `DrawingSiteLocation` / `DrawingElevations` / `DrawingFloorplans` · `SiteLayout`.

> **Critical distinction — never abbreviate to "Plan/Plans".** `Drawing…` = the architect's design drawings. `PlanningPermission` = the granted planning consent. Different documents, different weight in a credit decision; keep the words apart.

**Planning:** `PlanningPermission` (the granted consent / decision notice) · `S106Agreement` · `CILNotice` · `PlanningConditions`.

**Terms & lender:** `Terms` · `TermsBundle` (multiple lenders in one doc — `LENDER-Multiple`) · `EmailTerms` (terms captured as an email/screenshot).

**Credit / legal / DD:** `Valuation` · `QSReport` · `InitialMonitoringReport` · `InterimMonitoringReport` (number the interims: `InterimMonitoringReport-No2`) · `AssetsLiabilitiesStatement` · `FacilityAgreement` · `Debenture` · `PersonalGuarantee` · `LegalOpinion` · `CertificateOfTitle` · `Warranty` · `Insurance` · `BankStatement` · `KYC` · `ID` · `CorporateStructure`.

**Fallback:** `Misc` (temporary — raise to add the real type).

---

## 7. Origin roles (controlled)

`RC` RockCap · `CLIENT-` borrower/sponsor · `LENDER-` funder.

Almost every file is `RC`, `CLIENT-`, or `LENDER-`, because those are the only parties RockCap deals with directly. Council consents, architect drawings and client-side reports arrive **via the client**, so they are `CLIENT-`. The prefixes below are used **only when that party sends the document to RockCap directly**: `VALUER-` · `QS-` (quantity / monitoring surveyor) · `LEGAL-` (solicitor) · `SPV-` (borrowing vehicle, if distinct from sponsor) · `CH-` (Companies House) · `OTHER-`. `COUNCIL-`, `ARCHITECT-`, `PLANNER-` are reserved but rarely used.

---

## 8. Status values

RockCap advisory docs: `INTERNAL` · `EXTERNAL`.
Drafts & legal/credit: `DRAFT` · `FINAL` · `UNSIGNED` · `SIGNED` · `EXECUTED` · `SUPERSEDED`.

---

## 9. Parser note (for the app)

Parse **right-to-left**:
1. Extension = after the final `.`
2. **Filing date** = the trailing `\d{8}` token.
3. **Document date** (dual-date types only) = a `\d{8}` token sitting immediately **after the DocType** (i.e. before the Origin).
4. Version / revision / status = recognised tokens (`V\d`, `R\d`, or a §8 status word).
5. Origin = the token that is `RC` or begins with a §7 role prefix.
6. DocType = the token after the Scheme.
7. Scheme = the first token.

Keep a `filename_schema.json` (roles + DocType enum + status values + which DocTypes take a document date + version-bump rules) and an alias map (`F365 → Funding365`, `LenderNote → LenderBrief`) as the single source of truth for humans and classifier. Richer facts — "sent to Avamore on X", "received from WSD by email", "in the lender pack" — live in the app/knowledge graph, not the filename.
