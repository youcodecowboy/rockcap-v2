---
name: new-scheme
description: Use when scaffolding a new RockCap scheme/deal folder, setting up a new comparables or terms request project, creating a Lender Brief workspace, or building a generic deal scaffold. Triggers include "set up a new deal folder for X", "scaffold a comparables project", "create a new scheme for Y", "spin up a Lender Brief workspace", "I need a project folder for [scheme]", or running `/new-scheme`. Creates the full three-artefact bundle every new scheme needs: (1) local folder structure (.claude/CLAUDE.md, data/, outputs/, SESSION_STATE.md) with the appropriate template, (2) shared Google Drive scheme folder with the `1. Modelling info and collation` subfolder, and (3) HubSpot deal at Qualified Leads / Scheme Received with GDV / loan / fee. Deal-level scaffolding only — not for firm-level tooling or ongoing infrastructure projects (e.g. Lender Database).
---

# New Scheme Setup

When invoked (via `/new-scheme` or any natural-language scaffolding request), follow these steps. The skill is invocation-agnostic: do not gate behaviour on whether the slash command was used.

**Every new scheme produces three artefacts as a single atomic bundle:**
1. **Local scaffold** — `/Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Projects/Schemes/<Developer>/<Scheme>/` (nested under the developer company, mirroring the shared Drive structure — established 10/06/2026; was flat `Schemes/<Scheme>/` before. If `<Developer>` == `<Scheme>`, a single level is acceptable, e.g. WSD Group.)
2. **Shared drive folder** — `H:\...\Historic RockCap Desktop\<Developer>\<Scheme>\1. Modelling info and collation\`
3. **HubSpot deal** — Qualified Leads / Scheme Received with GDV / loan / fee

If any of the three already exists from a prior partial scaffold, reuse it (don't duplicate). Confirmed as standard protocol by Rayn on 25/05/2026.

## Step 1: Gather Information

Ask the user for (or infer from context):

1. **Project type** — one of:
   - `Comparables` — RICS-compliant comparable evidence work (Appendix A, Forensic Report, Deep Dive, Accommodation Schedule)
   - `Terms Request` — formal terms request workflow with appraisal, lender brief, deal structure
   - `Lender Brief` — workspace for drafting and iterating a Lender Note (typically stage 5 of the deal process)
   - `Generic Deal` — bare folder + CLAUDE.md header for stage 2-4 work where no specific deliverable type applies yet
2. **Scheme name** — e.g. "Brookwood", "Burnham", "Wimbledon Dev Exit"
3. **Developer name** — e.g. "Markat Developments", "LDRM Construction", "WSD Group"
4. **Data folder name** — the folder name inside the shared Drive that contains this scheme's data (or the developer name if that's how it's organised). The user may also specify subfolders.
5. **HubSpot numbers** — GDV, loan amount, fee. If unknown, derive working defaults:
   - GDV: from borrower's stated figure
   - Loan: 65% LTGDV for ground-up development, or borrower's stated ask for bridging / dev exit
   - Fee: 1% of loan as default working assumption (Alex sometimes confirms different — e.g. 1.5% on WSD). When unsure, ask before creating the deal.

## Step 2: Verify the Data Source

The shared Google Drive is synced locally at:
```
H:\.shortcut-targets-by-id\1kmiHPBWD_PLOjrtwRSgK0_bvzzA5EZUA\Historic RockCap Desktop
```

List the contents of the specified `<Developer>` folder to confirm it exists and show the user what's in it. If the folder doesn't exist, list the top-level folders so the user can pick the right one.

## Step 3: Ensure the Shared Drive Scheme Folder Exists

Standard structure: `H:\...\Historic RockCap Desktop\<Developer>\<Scheme>\1. Modelling info and collation\`.

**Examples already in place:**
- `Markat Developments\Brookwood\1. Modelling info and collation\`
- `Markat Developments\Wimbledon Dev Exit\1. Modelling info and collation\`
- `LDRM Construction\Burnham\1. Modelling info and collation\`
- `WSD Group\1. Modelling info and collation\` (developer == scheme, single-level collapse acceptable)

If the developer parent folder doesn't yet exist, create it. If the scheme folder already exists, reuse and don't duplicate. The `1. Modelling info and collation` subfolder name is exact — do not abbreviate or rename.

Once the folder exists, save any inbound source documents (planning consent, plans, valuations, sales schedules, appraisal PDFs) directly into the `1. Modelling info and collation` subfolder. For email attachments, use `gmail-api/download_thread_attachments.py` with the shared folder as the output dir.

## Step 3b: Seed the BFS Lender Comparison model (modelling schemes only)

For schemes that will be **modelled** (project types **Terms Request**, **Lender Brief**, **Generic Deal** where a model is expected) and that **have not been modelled yet**, drop a fresh copy of the firm **BFS Lender Comparison model** into the scheme folder so Rayn can fill it in.

This model **supersedes the plain blank appraisal model** (changed 10/06/2026, Rayn): it is the full RockCap appraisal model **plus** a "Lender Comparison Sheet" tab that compares up to 10 lender/term scenarios side by side (cash requirement, senior/mezz net proceeds, developer equity required, cost of each capital layer, project & developer IRR). So it does the appraisal *and* the terms comparison in one file — seed this, not the old `LATEST_BlankAppraisalModel_*.xlsm`.

> **⚠️ PORTFOLIO / multi-site EXCEPTION (Rayn, 20/07/2026 — Edgefold 3-Site).** The BFS default above is for a **single scheme** — BFS auto-replicates the one appraisal so you can run lender/term scenarios side by side. For a **portfolio / multi-site deal** (several distinct sites funded together), do **NOT** seed the BFS model: because it replicates the FIRST appraisal, on a 3-site portfolio it would just replicate site 1 ten times instead of holding three distinct sites. Instead seed the **standard V6 blank appraisal model** — `Rockcap Models/Rockcap Appraisal Model/LATEST_BlankAppraisalModel_V6.0_20251208.xlsm` (the general appraisal-model folder, newest `LATEST_BlankAppraisalModel_*.xlsm`, NOT the Lender Comparison subfolder). Each `AppraisalSiteN` tab then holds a **genuinely different scheme**, and the **Portfolio Dashboard** consolidates the funding total (per-site-then-consolidated, never blended). Precedent: Bayfield Portfolio (Holt/Bawdeswell/Comberton). One lender brief covers all sites. Memory: `feedback_portfolio_uses_standard_model`.

- **Source (always copy the latest):** `/Users/raynsmid/Library/CloudStorage/GoogleDrive-rayns@rockcap.uk/.shortcut-targets-by-id/1kmiHPBWD_PLOjrtwRSgK0_bvzzA5EZUA/Historic RockCap Desktop/Rockcap Models/Rockcap Appraisal Model/Lender Comparison/BFSModel20260323.xlsm`. If a newer `BFSModel*.xlsm` exists in that folder, use the newest by name/mtime. (Do **not** grab `FundingCompetitionModel*.xlsm` — different model.)
- **Destination:** a `RockCap Appraisals` subfolder inside the scheme's `1. Modelling info and collation` folder (create it if missing).
- **Rename to (File-Naming Standard V1.3):** `<Scheme>_AppraisalModel_RockCap_<Initials>_INTERNAL_V1.0_<YYYYMMDD>.xlsm` — scheme name with no spaces (e.g. `Norton_AppraisalModel_RockCap_RS_INTERNAL_V1.0_20260610.xlsm`). `<YYYYMMDD>` = today's filing date. **Origin is `RockCap`, spelled out in full — never `RC`.** **Initials** (`RS`, `AL`, or `AL-RS`) go immediately after Origin and record who worked on the file. There is **no `RockCapBFS` DocType** — our model and the client's appraisal are both `AppraisalModel`, and Origin (`RockCap` vs `CLIENT-<x>`) tells them apart. Version bumps (V1.1, V2.0) follow as it iterates.
- **How Rayn fills it:** (1) port the appraisal **input (pink) cells** — Central Inputs, Control Sheet (col E), each used AppraisalSiteN — Paste Special → Values into the identical cells (the appraisal portion is structurally identical); never copy formula/output cells; never insert rows; recalc after. (2) Enter the lender/term scenarios in the per-column Inputs block on "Lender Comparison Sheet". Put these two steps in the scheme CLAUDE.md.
- **SKIP** when: project type is **Comparables** (no model needed), or a `RockCap Appraisals` subfolder already contains a `<Scheme>_RockCap*` model (already modelled — don't overwrite). Note in SESSION_STATE that the BFS model has been seeded and is ready to fill.
- It's a ~12 MB `.xlsm` (macros) — copy as-is, do not open/convert.

Established by Rayn 09/06/2026; switched from the plain appraisal model to the BFS Lender Comparison model 10/06/2026.

## Step 4: Create the Local Project Directory

Create the following structure at `/Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Projects/Schemes/<Developer>/<scheme-name>/`:

```
<scheme-name>/
├── .claude/
│   └── CLAUDE.md          # Project instructions (from template)
├── .contextignore          # CCO token guard (see below)
├── AGENTS.md               # symlink -> .claude/CLAUDE.md (Codex reads this; keeps its context = Claude's)
├── data/                   # Working data files
├── outputs/                # Final deliverables go here
└── SESSION_STATE.md        # Current state tracker
```

Create the `.contextignore` with this content (keeps the heavy `.xlsm` appraisal models and caches out of context — they are read via openpyxl / the `rockcap-appraisal` skill, never the Read tool; the global `~/.claude/.contextignore` already blocks `*.xlsm`/`*.xlsx` everywhere, this adds scheme-local paths):

```
# CCO token guard — global ~/.claude/.contextignore covers Excel + caches.
.cache/**
**/*_cache.json
```

## Step 5: Populate CLAUDE.md

Per project type:

- **Comparables** → copy `/Users/raynsmid/.claude/skills/new-scheme/references/comparables-template.txt` into `.claude/CLAUDE.md`.
- **Terms Request** → copy `/Users/raynsmid/.claude/skills/new-scheme/references/terms-request-template.txt` into `.claude/CLAUDE.md`.
- **Lender Brief** → no external template. Generate a minimal CLAUDE.md inline that points the working session at the `rockcap-lender-note` skill for drafting, the `rockcap-appraisal` skill for headline financials, and the `humanizer` skill for the pre-send pass. Use the header block in the next sub-step plus a one-paragraph "How to work in this folder" body.
- **Generic Deal** → no external template. Create CLAUDE.md with only the header block in the next sub-step. The user can add more context later as the deal type firms up.

Templates live inside the skill so the workflow does not break if OneDrive resyncs or files are renamed.

### Template master copies (sync workflow)

The editable masters live in `/Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Prompts/`:
- `RockCap_Comparables_Project_Instructions.txt`
- `Terms Request Project Instructions [date].txt` (newest dated copy wins)

When a template is updated, edit the master, then re-sync into the skill:

```
cp "/Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Prompts/RockCap_Comparables_Project_Instructions.txt" "/Users/raynsmid/.claude/skills/new-scheme/references/comparables-template.txt"
cp "/Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Prompts/Terms Request Project Instructions [newest-date].txt" "/Users/raynsmid/.claude/skills/new-scheme/references/terms-request-template.txt"
```

Fallback: if the in-skill copy is missing, glob `/Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Prompts/*Comparables*Project*Instructions*.txt` and `*Terms Request*Project Instructions*.txt`, pick the newest by mtime, and re-sync into the skill before proceeding. If neither location yields a file, halt and ask Rayn.

Modify the template for Claude Code context:
- Replace `/mnt/user-data/outputs/` references with the project's `outputs/` folder path
- Replace `/mnt/project/` references with the project's `data/` folder path
- Replace `/home/claude/` references with the project root path
- Add a header block at the top of CLAUDE.md with:

```markdown
# RockCap — <Scheme Name> (<Project Type>)

**Project root:** /Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Projects/Schemes/<Developer>/<scheme-name>
**Data source:** /Users/raynsmid/Library/CloudStorage/GoogleDrive-rayns@rockcap.uk/.shortcut-targets-by-id/1kmiHPBWD_PLOjrtwRSgK0_bvzzA5EZUA/Historic RockCap Desktop/<Developer>/<Scheme>
**Outputs:** /Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Projects/Schemes/<Developer>/<scheme-name>/outputs/
**Template source:** <which template was used; "(none)" for Generic Deal>

## Where deliverables are SAVED (rule changed 22/07/2026)

**Deliverables save DIRECTLY to the scheme's shared Drive folder — NOT to a local `outputs/` copy.** Rayn confirmed local outputs were never used for RockCap work; local copies are redundant (unbacked once outside OneDrive, invisible to Alex, and Kristian's app only ingests from Drive). The local workspace keeps state (`SESSION_STATE.md`, `.claude/CLAUDE.md`) and scratch working files only. Save a local copy only when Rayn explicitly asks. The `outputs/` folder in the scaffold below is for transient working artefacts, not the deliverable's home.

## Output filename convention (mandatory)

Every file produced for this scheme MUST follow the firm-wide **File-Naming Standard (V1.3)**. Authoritative spec — read before naming/renaming: `/Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Projects/_Standards/RockCap_FileNamingStandard_RockCap_RS_INTERNAL_V1.3_20260713.md` (machine schema: `filename_schema.json`).

Grammar:
- RockCap-authored:  `[Scheme]_[DocType]_RockCap_[Initials]_[Status]_[Version]_[FilingDate].ext`
- Inbound:           `[Scheme]_[DocType]_[Origin]_[Status]_[Version]_[FilingDate].ext`
- Inbound dual-date: `[Scheme]_[DocType]_[DocumentDate]_[Origin]_[Status]_[Version]_[FilingDate].ext`

- **Origin** = who we received it from: **`RockCap` — always spelled out, NEVER `RC`**; `CLIENT-<x>`; `LENDER-<canonical-name>`. Client-routed third-party docs (planning, drawings, valuations via the client) = `CLIENT-`.
- **Initials** = RockCap-authored docs only, straight after Origin: `RS`, `AL`, or `AL-RS`. They record **who worked on the file**. Inbound docs have none.
- **Status** (RockCap docs): `INTERNAL` while drafting → `EXTERNAL` only after Alex approval. Legals: `DRAFT`/`UNSIGNED`/`SIGNED`/`EXECUTED`.
- **Dates:** filing date always last (recency). Add a document date after the DocType for upstream evidence/legals (planning permission = decision date; valuations/QS/monitoring = report date).
- PascalCase; never "Plan/Plans" — `Drawing…` = design drawings, `PlanningPermission` = the consent.

Examples:
- `<Scheme>_AppendixA_RockCap_RS_INTERNAL_V1.0_20260508.xlsx`
- `<Scheme>_LenderBrief_RockCap_AL-RS_EXTERNAL_V1.0_20260508.docx`
- `<Scheme>_Valuation_20260620_VALUER-Savills_FINAL_V1.0_20260622.pdf`

Full DocType list + rules live in the standard. Version: whole-number bump = new client appraisal / material change (GDV, comps); minor bump = smaller edits, per iteration not per template change.

## Shared reference material

- **Anthropic FSI repo** — `/Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Projects/_Reference/anthropic-fsi/` (clone of anthropics/financial-services). Read `_INDEX.md` first. Useful for: pitch deck generation patterns (pptx-author skill), credit-pack document parsing patterns (kyc-screener three-tier untrust), stage-11 DD checklist shape (PE `/dd-checklist`). Most of repo is equity-side noise — the index filters it.

---
```

## Step 5b: Wire Codex context (AGENTS.md symlink)

Codex (used for `backcheck` / `/backcheck` independent reviews) reads `AGENTS.md`, NOT `CLAUDE.md`. To give Codex back-checks the full scheme context, create a root-level `AGENTS.md` symlink pointing at the project's CLAUDE.md, so there is a single source of truth and no drift:

```bash
cd "/Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Projects/Schemes/<Developer>/<scheme-name>"
ln -s .claude/CLAUDE.md AGENTS.md
```

Use a relative target (`.claude/CLAUDE.md`), not an absolute path. Notes:
- The global RockCap context is already wired (`~/.codex/AGENTS.md` -> `~/.claude/CLAUDE.md`); this per-scheme symlink adds the deal-specific layer on top.
- If OneDrive sync ever drops the symlink on another machine, just recreate it with the same command.
- Established 05/06/2026 after wiring Codex back-checks into every existing project.

## Step 6: Create SESSION_STATE.md

Substitute today's actual date as `DD/MM/YYYY` (UK format) in the heading. Do not write the literal string `<today's date>`.

Every SESSION_STATE.md must include a **Deal snapshot** section at the top with the HubSpot deal id, GDV / loan / fee, and Company + Contact ids. Capture these so future sessions don't need to re-search HubSpot.

Base template:

```markdown
# <Scheme Name> — Session State

## CURRENT STATE — DD/MM/YYYY

### Deal snapshot
- **Scheme:** <one-line scheme description, address if known>
- **Developer:** <name, key contact email + phone>
- **HubSpot:** Deal id <id> — Qualified Leads / Scheme Received. GDV £<n> / loan £<n> / fee £<n> (<%>). Company id <id> (<name>). Contact id <id> (<name>). Created DD/MM/YYYY.

### Active deliverables
- (per project type — see below)

### Outstanding tasks
1. Review source data in the shared `1. Modelling info and collation` folder
2. Confirm scheme parameters with Alex

### Files in project
**Local:** (none yet)
**Shared drive — `H:\...\<Developer>\<Scheme>\1. Modelling info and collation\`:** (list as added)

### Last session summary
Project scaffolded DD/MM/YYYY (<project type> type). Shared drive folder + HubSpot deal created. Ready for data review.
```

Adapt the **Active deliverables** section per project type:

**Comparables:**
```markdown
### Active deliverables
- Appendix A: Not started
- Forensic Report: Not started
- Deep Dive: Not started
- Accommodation Schedule: Not started
```

**Terms Request:**
```markdown
### Active deliverables
- Lender Note: Not started
- Appraisal Model: Not started
- Deal Structure Chart: Not started
- Terms Comparison: Not started
```

**Lender Brief:**
```markdown
### Active deliverables
- Lender Note v1 draft: Not started
- Appraisal financials cross-check: Not started
- Comparable evidence pull (if needed): Not started
- Humanizer pass: Not started
- Final .docx (EXTERNAL): Not started
```

**Generic Deal:**
```markdown
### Active deliverables
- (to be defined as deal scope firms up)

### Stage tracker
- Current stage: <2 / 3 / 4 — pick one>
- Next milestone: <to populate>
```

## Step 7: Copy / Reference Key Data Files

Source documents belong in the shared `1. Modelling info and collation` folder (Step 3). If the user has emailed attachments, download them via `python3.12 "/Users/raynsmid/Library/CloudStorage/OneDrive-Personal/Desktop/Projects/EmailTriage/gmail-api/download_thread_attachments.py" <threadId> "<shared folder path>"`. Note the file list in SESSION_STATE.md under "Files in project → Shared drive". The local `data/` folder is for working files / Rayn's own notes, not the source bundle.

## Step 8: Create the HubSpot Deal

**Pipeline:** Qualified Leads — id `1755908295`
**Stage:** Scheme Received — id `2388762822`

**Fields to set on the Deal:**
- `dealname` — the scheme name with the developer/borrower company in brackets: `<Scheme> (<Developer>)`. E.g. "Great Tattenhams (Kidbrook Homes)", "Norton (Mallard Homes)", "Wimbledon Dev Exit (Markat Developments)". This lets us see at a glance which deal belongs to which company across the Qualified pipeline. Use the developer/borrower, NOT the lender, when a deal associates with both. Match the local folder name for the scheme part. If the developer is genuinely unknown at scaffold time, set the scheme name alone and append the bracket once the company is identified.
- `pipeline` — `1755908295`
- `dealstage` — `2388762822`
- `gdv` — borrower's GDV figure, in pounds (no formatting). E.g. `9350000`.
- `loan_amount` — loan amount in pounds. Default 65% LTGDV for ground-up; borrower's stated ask for bridging / dev exit.
- `amount` — RockCap fee in pounds. Default 1% of `loan_amount` unless Alex specifies different.

**Associations (mandatory):**
- Developer Company — duplicate-check first via `mcp__claude_ai_HubSpot__search_crm_objects` (objectType `COMPANY`, query by developer name). Reuse if exists; create if missing using the standard company fields (name, city, county, state, domain, industry — see Hubspot BD Skill for field requirements).
- Primary Contact — duplicate-check first (objectType `CONTACT`, query by name). Reuse if exists; create only if you have verified email/phone.

**Order of operations:**
1. Duplicate-check the developer Company. If missing, create it first and capture the id.
2. Duplicate-check the primary Contact. If missing and you have verified details, create it and capture the id.
3. Create the Deal with both associations in a single `manage_crm_objects` call.
4. Write the new deal id into SESSION_STATE.md's Deal snapshot section.

**Skip / defer:**
- If the user explicitly says "no HubSpot yet" or the deal is purely speculative, skip this step but write `HubSpot: not yet created (pending <reason>)` into SESSION_STATE.md.
- If the deal already exists in HubSpot (e.g. you're scaffolding a Comparables project for an active deal), look up its id and reference it; do not create a duplicate.

For full mechanics — field schemas, association type IDs, lender mapping, REST fallback — see the `Hubspot BD Skill`.

## Step 9: Confirm to User

Print a summary:
- Local project path
- Project type
- Shared drive folder path (with confirmation the `1. Modelling info and collation` subfolder exists)
- HubSpot deal id + url (or "skipped — <reason>")
- What was created vs reused
- Instruction: "Open the local folder in VS Code and start Claude Code — it will automatically load your project instructions."
