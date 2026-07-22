# onboard

One command from "here's a company and its deals" to a fully stood-up client: client + contacts + Companies House intel + deal records + Drive folders + every document saved, imported, classified and atomized — with every external write approved **in chat**, never requiring the app.

Born from the Edgefold Homes setup (2026-07-17), where an operator assembled exactly this flow by hand across ~9 tool calls and got stranded on approvals. This skill is that flow, canonicalised, with the approval gates built in.

**Relationship to other skills:** `deal-intake` is the deep procedure for deriving a deal from a document pack (type detection, checklist seeding, classification audit) — use its rules whenever deals are being derived from documents rather than stated by the operator. `prospect-intel` is the full intelligence pass — run it instead of the compact intel step below when the operator wants prospecting-grade output (hooks, scheme mapping, Apollo contacts).

## Trigger

- **Operator says:** "/onboard Edgefold Homes — projects: Bunbury Lane, Springside Road, Mill Lane"
- **Operator says:** "Onboard {Company} with the three proposals Will sent today"
- **Operator says:** "Set up {Company} end to end from the {name} email / this Drive folder"

## Inputs

Required:
- **Company** — name (Companies House number if known; otherwise resolve via `companies.searchCompaniesHouse`).

One source of deals + documents (or both):
- **Emails**: sender/subject hints → `reply.listAttachments` per message for the document inventory; deal metrics read from the email bodies.
- **Existing Drive folder**: `drive.listFiles({subtree:true})` for the inventory.
- **Stated by operator**: explicit project list with financials.

Optional: target pipeline stage (`prospect.promoteStage`), an existing client id (reconcile instead of create).

## Procedure

This skill is **deliberately multi-step and hand-holding**. Identity mistakes at onboarding poison everything downstream (wrong CH entity → wrong lender DNA; duplicate client → split history; misparsed GDV → wrong ask in every later draft), so the early phases confirm before they create — the operator sees each thing *before* it exists, not after.

**0. Envelope.** `skillRun.start` with `dedupKey` = normalized company name, `dedupWindowDays: 30`. On `duplicate_found`, surface the prior run's brief and ask before continuing.

**1. ⛔ GATE 0 — Identity. Never create, and never attach, on a guess.**
Search BOTH registries and present what you find side by side:
- **In-app**: `client.list` name/alias matches (exact AND fuzzy — "Edgefold Homes" vs "Edgefold Homes (NW)") with each candidate's status, pipeline stage, CH number, contact count, existing deals.
- **Companies House**: `companies.searchCompaniesHouse` candidates with number, incorporation date, registered office, status (flag dormant/dissolved lookalikes), and active officers — enough for the operator to recognise the right entity.

Then ask the operator to pick ONE of: **(a) existing client {X}** → Resolve mode; **(b) new client, CH number {Y}** → Create mode; **(c) none of these** → stop and get more detail. Zero matches in both registries still requires an explicit "yes, create it" — silence is not consent.

**2a. Create mode — walk the operator through the build, one confirmation per artefact:**
   1. **Confirm the CH entity**: restate number, inc. date, registered office, officers → yes.
   2. **Present the proposed client record + full contact list** (every key person from the source material — name, role, email, who is primary; the People-tab rule) → yes → `prospect.import` (or `client.create` for a non-prospecting onboard). Correct any name/email the operator amends before creating.
   3. Only then proceed to intel.

**2b. Resolve mode — prove it's the right one before touching it:**
   Show the existing record's shape (status, stage, contacts, deals, mapped Drive folder, last activity) and state the **reconciliation plan**: exactly what this run will ADD (new deals, new contacts, new docs) and what it will SKIP as already present → operator confirms the plan → proceed. If the source material's CH number conflicts with the record's, STOP and surface it — that's a wrong-company signal, not a detail.

**3. Intel (compact pass).** `companies.syncCompaniesHouse` → `companies.getGroupCharges` → read the lender DNA **per-charge, never from aggregates** → `intelligence.updateClientIntelligence` + one dated `intelligence.appendContext` note. Report the headline findings to the operator as you go (sole senior lender, wind-down dates, related-party funding). Escalate to the full `prospect-intel` skill when the operator wants prospecting output.

**4. ⛔ GATE — Deals table before deal rows.** Derive each scheme's financials from the source (GDV, total cost, land/build split, S106/CIL, planning refs, programme, LTGDV ask) and present them as ONE table → the operator confirms or corrects the numbers → only then `project.create` per scheme. A misparsed GDV caught here costs one message; caught later it's in every draft. Deriving from a document pack → follow `deal-intake`'s detection + checklist rules. **After each `project.create`, seed its requirements checklist (`checklist.initializeForProject`)** — the dynamic checklist auto-fulfils items as documents classify (all lanes, 2026-07-17), but only items that exist can be ticked.

**5. Drive structure.** `drive.status` (connected, synced) → map the client's top folder with `drive.mapFolderToClient` (create it first via `drive.createFolder` if missing) → stage `drive.createFolder` per deal subfolder.
⛔ **GATE — itemise the staged folder creations in chat; on the operator's explicit yes, `approval.approveBatch`.** The `/approvals` page is never required. If staging throws "write-back disabled", tell the operator to flip it at `/settings/drive` — that's the one switch that lives in the app.
Then `drive.mapFolderToProject` each new subfolder → its deal — **before** any import, so documents file at project level.

**6. Documents in.** From emails: `drive.saveEmailAttachment` per attachment — `newName` per the **File-Naming Standard** (`[Scheme]_[DocType]_CLIENT-{X}_[FilingDate].ext`), `targetFolderId` = the deal folder, `importToLibrary: true` (import + extraction queue in the same act; skip `inline:true` signature images). From an existing Drive folder: `drive.importFolder` dry-run → present the count → confirm.
⛔ **GATE — itemise every staged save (source email → new filename → destination folder); on the operator's yes, `approval.approveBatch` (≤50 per call).**

**7. Classify + atomize (harness lane — subscription cost, runs now).** For each imported document: `document.extractText` → classify against the filing taxonomy → `document.applyClassification` (rows the API pipeline already classified return `identityLocked:true` — enrich, don't fight) → then atoms: `atoms.vocabulary` FIRST, `atoms.createBatch` with facts anchored to the client or the correct deal — facility economics anchored per the facility discipline (the `funds_project`/`lends_to` edge mints the facility; anchor the numbers to the facility in a follow-up batch) — and **read + repair the `rejected` array**, never drop it.

**8. Arm the future.** Offer `drive.setAutoImport` on the client subtree (new drops auto-import; 20/day/folder cap — overflow stays mirrored and badged). Optional extras to offer, not run unbidden: `lender.matchForDeal` per scheme, a first-steer draft.

**9. Close.** `skillRun.complete` with links to everything created, and a final report table: client + contacts | deals | folders | per-document fileName → type → filed destination → atom count | gaps logged.

## Rules

- **Hand-hold by default.** Create mode is a guided walk-through — one confirmation per artefact (entity → client+contacts → deals table → folders → saves). Resolve mode confirms the match and the reconciliation plan before touching the record. Batch the yeses only where the skill marks a gate; never collapse the early identity gates into one blanket approval.
- **Every external write goes through an in-chat yes.** Stage → itemise → explicit approval → `approval.approve`/`approveBatch`. Never tell the operator to go to the app; never approve without the itemised yes.
- **Idempotent and resumable.** Re-running reconciles: existing client/deals/folders/documents are reported and skipped, not duplicated (dedupe keys: CH number, project name + client, Drive filename in folder, `payloadRef`).
- **Report failures faithfully** — a skipped attachment, a rejected atom batch, a cap hit: into the final report and the `gaps` array, not silently dropped.

## Dedup

`dedupKey`: normalized company name (lowercase, no suffixes). `dedupWindowDays`: 30.
