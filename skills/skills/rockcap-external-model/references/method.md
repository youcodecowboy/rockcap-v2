# RockCap External Model — Method & Hard-Won Nuances

Everything below was learned by doing it wrong first. Read the relevant section before
adapting the script or when the verify report flags something.

## Table of contents
1. Why openpyxl cannot be used to write these files
2. The file-level surgery, step by step
3. The formula-strip regex ORDER bug (critical)
4. Freezing = "breaking links" — what it does and why
5. Which tabs to keep vs delete; BFS vs BTR
6. Errors: #REF! and the rest; the "Including Sunbeam" pattern
7. Defined names — why all 227 get dropped
8. Why .xlsm (not .xlsx): the "macro-enabled but no macros" warning
9. The Codex cleanup findings (title cell, metadata, sensitivity labels)
10. Logos: where they live, how they survive
11. Google Drive sync gotchas
12. Static vs live (house standard) and the scheme toggle
13. Verification checklist
14. Naming + placement

---

## 1. Why openpyxl cannot be used to write these files
`openpyxl` is the obvious tool and it is a trap for this job. On save it **silently drops
embedded pictures** — the RockCap logo sits on every sheet as an `<xdr:pic>` drawing, and an
openpyxl round-trip loses all of them. It also re-serialises styles, can duplicate or mangle
images if you re-add them, and needs Pillow for any image op. The file-level (zip/XML) approach
keeps the original drawing/media/chart parts untouched, so logos and formatting are byte-exact.
openpyxl is still fine for **reading** (the script uses it read-only to pull scheme names and to
run the final open-test) — just never to write the deliverable.

## 2. The file-level surgery, step by step
On a copy of the source `.xlsm`, edit only these parts; copy everything else verbatim:
- `xl/workbook.xml` — remove deleted `<sheet>` entries; rebuild `<sheets>` in target order with
  renamed display names (sheetId + r:id unchanged); delete the whole `<definedNames>` block.
- `xl/_rels/workbook.xml.rels` — remove relationships to deleted worksheet parts + calcChain.
- `[Content_Types].xml` — remove `<Override>` for deleted worksheet parts + calcChain.
- Each KEPT worksheet `xl/worksheets/sheetN.xml` — freeze formulas, blank error cells,
  optionally clear obsolete rows; optionally fix the dashboard B2 title.
- `docProps/custom.xml` — delete (sensitivity labels); drop its content-type + rels.
- `docProps/app.xml` — rebuild HeadingPairs + TitlesOfParts to the kept tabs only.
- `docProps/core.xml` — scrub author to "RockCap".
- Physically drop: deleted `sheetN.xml` + their `_rels`, and the stale `xl/calcChain.xml`.

Leave `xl/media/*`, `xl/drawings/*`, `xl/charts/*`, `xl/vbaProject.bin`, styles, theme and
sharedStrings ALONE — that is what preserves logos, charts and formatting. Orphan drawing parts
from deleted sheets are left in place (not referenced, not displayed); Excel tolerates orphan
parts. Stripping them is optional tidiness, not required, and adds risk — only do it on request.

## 3. The formula-strip regex ORDER bug (critical)
Cells with shared formulas look like `<c r="A12"><f t="shared" si="0"/><v>2</v></c>` — the `<f>`
is **self-closing**. If you strip the paired pattern `<f ...>...</f>` FIRST, its `[^>]*` matches
the trailing `/` of the self-closing tag, then `.*?</f>` races forward to the *next* real
`</f>` — deleting every cell in between and corrupting the file (symptom: openpyxl raises
`could not convert string to float: 'Weston on Green'` because string values land in numeric
cells). **Always strip self-closing `<f .../>` first, then the paired `<f>...</f>`:**
```python
xml = re.sub(r"<f\b[^>]*?/>", "", xml)
xml = re.sub(r"<f\b[^>]*?>.*?</f>", "", xml, flags=re.DOTALL)
```
Also: when counting remaining formulas to verify, match `<f[ />]` — NOT `<f` — or you will count
`<formula>` elements inside data-validation dropdowns and get a false positive.

## 4. Freezing = "breaking links" — what it does and why
Stripping `<f>` while keeping the cached `<v>` turns every formula cell into a static value.
This is exactly the manual Excel move "Select All → Copy → Paste Special → Values", done at the
file level. After it, no kept tab references a deleted tab, so deleting Control Sheet / Workings
etc. cannot produce `#REF!`. Cells that were string-formula results keep `t="str"` and remain
valid strings; numeric results keep their number.

## 5. Which tabs to keep vs delete; BFS vs BTR
RockCap models hold both BTR (buy-to-rent) and BFS (buy-for-sale) views. For a buy-to-sell
scheme use **BFS** and drop all BTR tabs. Keep set:
- **Portfolio** model: `Portfolio Dashboard - BFS`, `Consol Cashflow`, `AppraisalSite1..N`,
  `CashflowSite1..N`.
- **Single-scheme** model: `Lender Dashboard - BFS`, `AppraisalSite1`, `CashflowSite1`.
Delete: `Control Sheet`, `Central Inputs`, `Categories`, `Portfolio Dashboard - BTR`, both
`Lender Dashboard - BTR/BFS` (the dashboard kept for a portfolio is the *Portfolio* one),
`Sensitivity Testing - BFS/BTR`, `Lender BTR/BFS Dashboard Workings`.
Confirmed against the firm's historic externals: the only prior portfolio external
(Talbot Pipeline) is exactly Portfolio Dashboard - BFS + Consol Cashflow + per-site pairs;
single-scheme externals (Newbury, Temple Dinsley) lead with Lender Dashboard - BFS. Renaming
appraisal/cashflow tabs to scheme names matches the newer externals (SuttonStickney).

## 6. Errors: #REF! and the rest; the "Including Sunbeam" pattern
Blank ALL error cells, not just `#REF!`. Error cells carry `t="e"` and `<v>#XXX!</v>`
(`#DIV/0!`, `#N/A`, `#VALUE!`, `#NAME?`, `#NUM!`, `#NULL!`, `#REF!`). The script blanks every
`t="e"` cell. Note `#DIV/0!`/`#N/A` are common where a site/tranche has no data — blanking is
the right external polish. (Beware false positives: legitimate header labels like "# Units",
"# Months" start with `#` but are normal text, not errors — leave them.)

Some source models carry a pre-existing broken block where a scheme was deleted (Fenway's was
an obsolete "Including Sunbeam" scenario in Consol Cashflow, rows 209/246/271/344/347/360/362,
with `#REF!` baked into the formulas and a surviving text label). Blanking error *values* leaves
the text label dangling, so clear those whole rows with `--clear-rows "Consol Cashflow:209,..."`
(separate multiple sheets with `;`, e.g. `"Consol Cashflow:209,246;Goring Appraisal:33"`).
Find them first by reading the source (grep the worksheet XML for `#REF` and for "Sunbeam"-type
scenario labels). These defects exist in the SOURCE too — tell the user to fix upstream.

## 7. Defined names — why all get dropped
RockCap models carry ~200+ workbook defined names (e.g. `BridgeCheckSite1` → `CashflowSite1!
$F$158`). Once formulas are frozen, nothing references them. Keeping them would leave dangling
names pointing at renamed/deleted sheets (which read as `#REF!` in Name Manager and can leak
internal structure). Some are sheet-scoped via `localSheetId` (a positional index that breaks
when sheets are removed). The clean, safe move is to delete the entire `<definedNames>` block —
print areas are the only real loss, acceptable for a view-only pack.

## 8. Why .xlsm (not .xlsx): the "macro-enabled but no macros" warning
The RockCap source is `.xlsm` with a real `vbaProject.bin` and `codeName` stubs on the workbook
and sheets. If you output `.xlsx` (macro-free content type) while leftover `codeName` stubs
remain, Excel throws "this file is macro-enabled but contains no macros" and may refuse to
render. Two clean options: (a) **keep it `.xlsm`** with the real `vbaProject` retained — the
extension and content type match, so it opens cleanly (this is the default and what the script
does); or (b) produce a genuine macro-free `.xlsx` by removing `vbaProject.bin` AND stripping
all `codeName` attributes AND setting the xlsx content type. The script keeps `.xlsm` because it
is the lowest-risk path that opens without warnings. (Codex flags retained VBA as an external
concern — exposes model mechanics, may prompt the recipient — so raise the choice with the user.)

## 9. The Codex cleanup findings (run `backcheck` on every lender-bound file)
Codex caught, on a file that "looked fine" on screen:
- **Dashboard title cell B2 literally read "Portfolio Dashboard - BTR"** on the BFS sheet — a
  template mislabel, but lender-facing. The script rewrites B2 to the BFS title (`--fix-title`,
  on by default).
- **Visible `#DIV/0!` / `#N/A`** beyond `#REF!` — now all blanked.
- **`docProps/custom.xml` carried a Microsoft sensitivity label "TfL Unclassified"** with
  unrelated IDs — embarrassing if inspected; the script strips custom.xml.
- **`docProps/app.xml` still listed 32 sheets + 216 named ranges** — leaks deleted internal tab
  names; the script rebuilds it to the kept tabs.
- **"Insert Developer Logo / Name / Website Here"** placeholders on the dashboard — source-
  faithful but reads unfinished. Content decision; raise with the user, do not auto-edit.

## 10. Logos: where they live, how they survive
The RockCap logo is a single `xl/media/image1.png` referenced by an `<xdr:pic>` in each sheet's
drawing (Consol, the BFS dashboard, and every Appraisal carry one; the Cashflow tabs carry
hidden macro buttons instead). Because the surgery keeps each kept sheet's original drawing and
the shared media untouched, every logo survives at its exact anchor with one shared image file
(verify shows `media files: 1`). If a verify ever shows many media files or duplicated pics, an
openpyxl rebuild crept in — go back to the file-level method.

## 11. Google Drive sync gotchas
RockCap source models live on Google Drive File Stream. The mount **evicts folders** (a path
that worked minutes ago returns "No such file or directory") and Alex **renames/moves folders
server-side** ("Small Build Portfolio" → "Fenway Residential Portfolio"). When a path fails:
`find` under the Drive root for the file by name, or search server-side via the Drive API; do
not trust a stale local listing. A 12 MB `.xlsm` is too large to pull through the Drive API into
context — get the local mount to re-sync (opening the folder in Finder wakes it) instead.

## 12. Static vs live (house standard) and the scheme toggle
The delivered externals are **static** (Rayn's choice for view-only). The firm's *historic*
externals (Talbot Pipeline, SuttonStickney, Newbury) actually keep **live formulas** — that is
the house norm and it is what keeps in-model controls working. The models have a scheme
include/exclude toggle (the Consol Cashflow "Yes/No" column, the "Excluding Sunbeam" master
switch, and per-appraisal "Active Scenario"). In a frozen file these are **inert** — that is the
documented trade-off. If a lender needs to flex inputs, a live-formula variant is required; that
is out of scope for this skill's default path — note it and escalate.

## 13. Verification checklist
The script prints this and exits non-zero on any gated failure; confirm before delivering:
- `duplicate / >31ch: False / none` — Excel forbids duplicate or over-31-char tab names; the
  builder sanitises + de-dupes + skips placeholder sites, and verify re-checks the final result.
- `formulas left: 0`, `error cells (t=e): 0`, `defined names: 0`, `external links: False`
- `logos > 0` and `media files: 1` (one shared RockCap logo; ≥2 only if a second genuine image
  is present — an unexpected high count means an openpyxl rebuild duplicated images)
- `vbaProject / macroCT: True / True` (opens clean as .xlsm)
- `metadata leak: clean` — scans app.xml + core.xml for every internal tab name (excluding tabs
  legitimately kept) and the whole package for sensitivity labels (`Unclassified`, `MSIP_Label`,
  `sensitivitylabel`)
- a non-fatal `WARNING` that internal tab *names* remain in `sharedStrings` is expected and
  acceptable — these are unused string-table entries (the sheets' DATA is gone), visible only on
  a deep unzip; removing them safely would require re-indexing every text cell, so it is flagged
  rather than forced. Note it to the user only if they need a forensic-clean package.

## Other hardening the script applies (so you don't re-discover it)
- **Placeholder/inactive sites are skipped** (C9 blank or starting `spare`/`example`/`enter`/
  `tbc`). `--dashboard lender` keeps site 1 only. Both prevent the duplicate-tab-name crash that
  a partly-filled template produces.
- **Data validations (dropdowns) are stripped** from kept sheets — a view-only file needs no
  input controls, and a DV pointing at a deleted sheet/range would be a dangling reference.
- **Orphan drawings/charts of deleted sheets are stripped by default** (they carry cached chart
  values from internal tabs). The kept sheets' drawings/charts/logos are reached transitively
  from the kept sheets and preserved — verified not to disturb the dashboard charts. Use
  `--keep-orphans` only to debug.
- These models share one Excel template, so the regexes assume its shape (double-quoted
  attributes, unprefixed namespaces, UTF-8). If a future model is authored differently and a
  gate trips unexpectedly, switch the parse to a structural XML reader rather than loosening the
  regexes.
- opens in openpyxl without raising
- spot-check a headline value (e.g. dashboard GDV) reconciles to the source
- tab list = expected order/names; B2 dashboard title says BFS not BTR
- then run `backcheck` (Codex) for anything lender-bound.

## 14. Naming + placement
`<Scheme>_RockCap_<Authors>_EXTERNAL_V<X.Y>_<YYYYMMDD>.xlsm` — Authors `RS`/`AL_RS`/`AL`.
Save to the scheme's local `outputs/`, then copy into the shared `RockCap Appraisals/` folder
next to the INTERNAL source. UK English, DD/MM/YYYY everywhere it shows.
