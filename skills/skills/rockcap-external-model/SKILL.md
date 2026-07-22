---
name: rockcap-external-model
description: >
  This skill should be used to produce a client- or lender-facing EXTERNAL version of a
  RockCap appraisal or portfolio Excel model (.xlsm). Trigger when Rayn or Alex says
  "make an external version of the model", "externalise the appraisal/portfolio", "make a
  view-only copy for the lender/client", "strip the model down for the lender pack", "freeze
  the model to values", "make EXT versions of V1.2 and 2.2", "drop the unwanted tabs and break
  the links", "client-facing workbook", or asks to turn an INTERNAL RockCap .xlsm into an
  EXTERNAL one. Use it whenever an internal RockCap model needs to leave the building as a
  static, view-only workbook — even if the user does not say the word "skill". Covers the
  full job: keep only the right tabs, freeze formulas to values, rename/reorder per scheme,
  clear errors, scrub metadata, and preserve the RockCap logos and formatting EXACTLY.
version: 1.0.0
---

# RockCap External Model

Turn an INTERNAL RockCap appraisal/portfolio `.xlsm` into a clean, static, **view-only
EXTERNAL** workbook for a lender or client — keeping the RockCap logos and formatting
byte-for-byte, while removing internal tabs, live formulas, errors, and leaky metadata.

## The one rule that governs everything

**Operate on the file, never rebuild it.** The obvious approach — load with `openpyxl`,
delete sheets, save — **silently drops every embedded image (the RockCap logos)** and
re-serialises formatting. That is the single biggest trap; it cost an entire back-and-forth
to discover. Instead, do **file-level zip surgery**: copy the source's worksheet, drawing,
media, chart and VBA parts verbatim and only edit what must change. The bundled script does
this correctly. **Do not hand-roll an openpyxl rebuild for this task.**

## What "external" means here

- **Static / frozen:** every formula is replaced by its last-cached value. Nothing can break,
  no internal logic is exposed, and any in-model scenario toggles become inert by design. This
  is deliberate (Rayn's standing choice for view-only packs). The firm's *historic* externals
  kept live formulas — note that in `references/method.md` if a lender needs to flex inputs —
  but the default and validated path is frozen.
- **Tabs:** keep the BFS dashboard + Consol Cashflow + each scheme's Appraisal and Cashflow;
  drop everything internal (Control Sheet, Central Inputs, the BTR dashboards, the Lender
  dashboards, Sensitivity tabs, the `*Workings` tabs, Categories).
- **Renamed + reordered:** appraisal/cashflow tabs are renamed to the scheme name (read from
  `AppraisalSiteN!C9`), ordered Dashboard → Consol → scheme pairs.
- **Format:** `.xlsm` (real macro project retained) so it opens with no warning. Logos intact.

## Workflow

### 1. Find the source model
RockCap models live on the shared Google Drive under the scheme's `RockCap Appraisals/`
folder. Drive File Stream **evicts and renames folders without warning** — if a path 404s,
search server-side (Drive API / Finder) rather than trusting the local mount, and take the
newest INTERNAL `.xlsm`. (Real example: "Small Build Portfolio" was renamed to "Fenway
Residential Portfolio" mid-task.)

### 2. Run the bundled script
The script lives in the skill directory; call it by absolute path since the working directory
varies:
```
python3.12 ~/.claude/skills/rockcap-external-model/scripts/externalise_model.py \
    SOURCE.xlsm OUTPUT_EXTERNAL.xlsm
```
The script auto-skips unfilled template sites (blank/`spare`/`example` C9), sanitises tab names
to Excel's 31-char limit, and de-duplicates any name collisions — so a partly-filled model can't
produce a duplicate-name workbook that refuses to open.

Common options:
- `--dashboard portfolio` (default) keeps `Portfolio Dashboard - BFS` and all active sites;
  `--dashboard lender` keeps `Lender Dashboard - BFS` + **site 1 only** for a single-scheme model.
- `--no-consol` if Consol Cashflow is not wanted.
- `--keep-orphans` to leave the deleted sheets' drawings/charts in the package. By default they
  are stripped (they hold cached chart values from internal tabs); stripping is verified not to
  disturb the kept dashboard charts.
- `--clear-rows "Consol Cashflow:209,246,271"` to blank obsolete *labelled* rows that a removed
  scenario left behind (error VALUES are auto-blanked, but a surviving text label like
  "Including Sunbeam" is model-specific — pass its rows here). Separate multiple sheets with
  `;` — e.g. `"Consol Cashflow:209,246;Goring Appraisal:33"`. Identify the rows first by reading
  the source (grep the worksheet XML for `#REF` and the obsolete scenario label).
- `--keep "Tab A,Tab B"` to override auto-detection entirely (kept as-is, no rename). Note the
  dashboard title fix still runs on a kept `… Dashboard - BFS` tab unless `--no-fix-title`.

The script auto-detects the scheme names, prints the keep/rename/delete plan, performs the
surgery, and runs a verification report.

### 3. Read the verification report
The script exits non-zero and prints CHECK if any gate fails. A good external shows:
`duplicate / >31ch: False / none`, `formulas left: 0`, `error cells: 0`, `defined names: 0`,
`external links: False`, `logos > 0`, `media files: 1` (the single shared RockCap logo; ≥2 only
if a second genuine image like a developer logo is present — an unexpected high count usually
means an openpyxl rebuild crept in and duplicated images), `vbaProject / macroCT: True/True`,
`metadata leak: clean`, `sensitivity label: none`, and `RESULT: PASS`. A non-fatal `WARNING`
about internal names lingering in `sharedStrings` is expected and acceptable (unused string-table
entries, visible only on a deep unzip; removing them would risk re-indexing every text cell).
Anything in the gated set failing, stop and investigate before delivering.

### 4. Name + place the output
Follow the convention `<Scheme>_RockCap_<Authors>_EXTERNAL_V<X.Y>_<YYYYMMDD>.xlsm` (e.g.
`FenwayResidentialPortfolio_RockCap_AL_RS_EXTERNAL_20260617.xlsm`). Save into the scheme's
local `outputs/`, then copy into the shared `RockCap Appraisals/` folder alongside the source.

### 5. Codex back-check (for anything going to a lender)
Run the `backcheck` skill over the finished file. Codex reliably catches the things that are
invisible until inspected: a dashboard **title cell still reading "- BTR"** (the script fixes
B2 automatically, but confirm), residual non-`#REF` error values, leaked internal tab names in
`docProps`, a stray **sensitivity label** (e.g. "TfL Unclassified") in `custom.xml`, and
"Insert Developer …" placeholder text. The script already handles the first four; the
placeholder text is a content decision for Rayn/Alex.

## Known judgment calls (raise, do not silently decide)

- **VBA retained vs macro-free.** Keeping the VBA project is why the file opens cleanly as
  `.xlsm`. A clean macro-free `.xlsx` is tidier but recipients may otherwise get a macro prompt.
  Flag the choice; default is keep-VBA `.xlsm`.
- **Developer branding.** The dashboard often carries "Insert Developer Logo / Name / Website
  Here" placeholders. Source-faithful, but reads unfinished — ask whether to fill or leave.
- **Source-model defects.** Pre-existing `#REF!`/`#DIV/0!` blocks (e.g. an obsolete scenario
  referencing a removed scheme) get cleaned in the external, but the SOURCE stays broken — tell
  the user so they can fix it upstream.

## Verify against precedent

The house structure for a *portfolio* external is **Portfolio Dashboard - BFS + Consol
Cashflow + per-scheme Appraisal/Cashflow**; single-scheme externals use **Lender Dashboard -
BFS + Appraisal + Cashflow**. Renaming tabs to scheme names matches the firm's newer externals.
If unsure, compare the output's tab list against an existing `*_EXTERNAL_*.xlsx` in the same
developer's folder.

## Resources

- **`scripts/externalise_model.py`** — the file-level surgery + verification tool. Read it
  before patching; it is heavily commented, including the one non-obvious bug (formula-strip
  regex ORDER) that corrupts the file if reordered.
- **`references/method.md`** — the full method, every nuance discovered, and the failure modes
  to avoid. Read it when adapting to a non-standard model, when the verify report flags
  something, or when deciding static-vs-live.
