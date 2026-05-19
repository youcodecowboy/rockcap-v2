# Convex Backend Inventory

Backend modules live at `model-testing-app/convex/`. About 80 top-level `.ts` files plus the `hubspotSync/` subdirectory (14 files), `migrations/` subdirectory (18 files, catalogued in `02-convex-schema.md`), and the generated `_generated/` directory.

## Headline counts

| Kind | Count |
|---|---|
| `query` | 404 |
| `mutation` | 409 |
| `action` | 4 |
| `internalQuery` | 5 |
| `internalMutation` | 29 |
| `internalAction` | 7 |
| Cron entries | 5 |
| **Total exports** | **863** |

This is the full Convex surface. The 150 atomic tools (see `01-atomic-tools.md`) expose roughly 17% of it. Most of the backend surface is reached by the web and mobile UIs directly without going through the chat assistant.

## Module summary by file

The numbers in parentheses are export counts for that file.

### Core CRM and deal modules

| File | Exports | Role |
|---|---|---|
| `clients.ts` | 24 | Client CRUD, folder management, stats, recent-accessed tracking, deletion lifecycle, HubSpot promotion via `createWithPromotion` |
| `projects.ts` | 21 | Project CRUD, folder management, stats, shortcode generation, deletion lifecycle |
| `contacts.ts` | 10 | Contact CRUD, client/project linking |
| `deals.ts` | 8 | HubSpot deals projection: read-only by HubSpot ID/stage/pipeline, plus local edits mutation |
| `companies.ts` | 8 | HubSpot companies projection, promotion to client |
| `leads.ts` | (within companies.ts/contacts.ts wiring; verify) | Lead lifecycle on top of contacts/companies |

### Document, folder, queue modules

| File | Exports | Role |
|---|---|---|
| `documents.ts` | 58 | Largest core file. Document CRUD, list/search by client/project/folder/scope, version chains, bulk move/delete, cross-scope moves, document-level intelligence, opened tracking |
| `documentNotes.ts` | (small) | Per-document annotations |
| `documentExtractions.ts` | (small) | Extraction history per document |
| `internalDocuments.ts` | 12 | RockCap internal document store |
| `internalFolders.ts` | 8 | Internal folder tree |
| `personalFolders.ts` | (small) | User-private folder tree |
| `clientFolders/projectFolders` | (within `clients.ts`/`projects.ts`) | Client and project folder management |
| `folderStructure.ts` | 6 | Folder mapping, category → folder routing |
| `folderTemplates.ts` | (small) | Folder structure templates per client type |
| `placementRules.ts` | 13 | Document auto-filing rules |
| `fileQueue.ts` | 12 | File upload review queue (UI-facing) |
| `bulkUpload.ts` | 28 | Bulk document workflow: batch creation, item-level tracking, filing, version linking |
| `bulkBackgroundProcessor.ts` | 9 | Async processor for bulk uploads |
| `directUpload.ts` | (small) | Direct file upload path |
| `files.ts` | (small) | File storage helpers |

### Extraction, classification, learning modules

| File | Exports | Role |
|---|---|---|
| `extractionJobs.ts` | 11 | Background extraction job queue |
| `codifiedExtractions.ts` | 16 | Item code confirmation and merging |
| `extractedItemCodes.ts` | (small) | Canonical item code library |
| `itemCodeAliases.ts` | (small) | Alias-to-canonical-code mappings |
| `itemCategories.ts` | (small) | Dynamic grouping for extracted items |
| `categorySettings.ts` | (small) | Customisable system categories |
| `fileTypeDefinitions.ts` | (small) | User-defined file-type taxonomy |
| `filingFeedback.ts` | 15 | Classification rule capture and cache |
| `keywordLearning.ts` | 9 | ML-driven file-type training |
| `intelligenceHelpers.ts` | (helper) | Helpers used by intelligence module |
| `dealHelpers.ts` | (helper) | Helpers used by deals/projects |
| `authHelpers.ts` | (helper) | Auth wrappers for queries/mutations |

### Intelligence, knowledge, meetings

| File | Exports | Role |
|---|---|---|
| `intelligence.ts` | 28 | Client/project intelligence: get/update, search lenders, queryIntelligence, extraction job orchestration, document → intelligence merging |
| `knowledgeBank.ts` | 12 | Knowledge bank entries (consolidated narratives from documents/emails) |
| `knowledgeLibrary.ts` | 48 | Checklist requirements, knowledge items, custom requirements, document linking, missing-items, email logs |
| `meetings.ts` | 12 | Meeting CRUD, verification, action items, action-item-to-task promotion |
| `meetingExtractionJobs.ts` | 12 | Meeting transcription queue |
| `projectDataLibrary.ts` | 21 | Extracted data library per project |
| `dataLibrarySnapshots.ts` | (small) | Point-in-time snapshots |
| `contextCache.ts` | (small) | AI context cache per client/project |

### Communication, chat, collaboration

| File | Exports | Role |
|---|---|---|
| `chatSessions.ts` | 7 | AI chat session lifecycle |
| `chatMessages.ts` | 5 | Chat message persistence |
| `chatActions.ts` | 8 | Pending user-confirmable AI actions |
| `conversations.ts` | 6 | Direct message conversations |
| `directMessages.ts` | (small) | Direct messages |
| `notes.ts` | 9 | User notes (rich text, templates) |
| `noteTemplates.ts` | (small) | Note templates |
| `emails.ts` | 9 | Email send history |
| `comments.ts` | (small) | Comments on documents and upload jobs |
| `flags.ts` | 24 | Cross-team flags with threading, assignment, inbox views |

### Tasks, reminders, notifications, events

| File | Exports | Role |
|---|---|---|
| `tasks.ts` | 15 | Tasks: create, assign, reminders, by client/project/contact, metrics |
| `reminders.ts` | 10 | User reminders with scheduling |
| `notifications.ts` | (small) | Unified notifications |
| `events.ts` | 10 | Calendar events |
| `googleCalendar.ts` | 23 | Google Calendar OAuth, channels, token management |
| `googleCalendarSync.ts` | (small) | Calendar sync runner (cron-driven) |
| `googleCalendarLog.ts` | (small) | Sync log, log prune |

### Financial modelling

| File | Exports | Role |
|---|---|---|
| `scenarios.ts` | (small) | Scenario CRUD |
| `scenarioResults.ts` | (small) | Versioned scenario results |
| `modelRuns.ts` | (small) | Model execution versions |
| `modelExports.ts` | (small) | Model export audit trail |
| `modelingTemplates.ts` | (small) | Financial model Excel templates |
| `modelingCodeMappings.ts` | (small) | Template placeholder mappings |
| `templates.ts` / `templateDefinitions.ts` / `templateSheets.ts` | (small) | Template metadata and sheets |
| `excelTemplates.ts` | (small) | Excel-specific template handling |

### External integrations

| File | Exports | Role |
|---|---|---|
| `hubspotSync.ts` | (re-export shim) | Surfaces `hubspotSync/` namespace |
| `hubspotSync/companies.ts` | 2 | Company sync (read + promotion) |
| `hubspotSync/contacts.ts` | 2 | Contact + lead sync |
| `hubspotSync/deals.ts` | 2 | Deal sync into `deals` table |
| `hubspotSync/activities.ts` | 1 | Activity sync (includes Fireflies detection) |
| `hubspotSync/pipelines.ts` | 5 | Pipeline + stage sync; stage/pipeline name updaters |
| `hubspotSync/webhook.ts` | 5 | Webhook event enqueue, processing internalAction, completion/failure/prune |
| `hubspotSync/config.ts` | 3 | Sync config CRUD |
| `hubspotSync/linking.ts` | 5 | Link contacts↔companies, deals↔contacts/companies, contact backfills |
| `hubspotSync/recurringSync.ts` | 1 | The 6h cron entry: `runRecurringSync` internalAction |
| `hubspotSync/archive.ts` | 1 | Archival handling for deleted HubSpot objects |
| `hubspotSync/backlink.ts` | 1 | Set HubSpot backlinks |
| `hubspotSync/migrations.ts` | 3 | Including `runFirefliesBackfill` internalAction |
| `hubspotSync/_debug.ts` | 2 | Debug queries |
| `companiesHouse.ts` | 19 | Companies House cache: companies, charges, officers, PSC; address-based dedup |
| `companies.ts` | 8 | (already listed; intersects with hubspotSync) |

### Prospecting

| File | Exports | Role |
|---|---|---|
| `prospects.ts` | (small) | Prospect scoring derived from planning + property data |
| `prospecting.ts` | (small) | Prospecting workflows |
| `property.ts` | (small) | Property title data (HM Land Registry, stub) |
| `enrichment.ts` | (small) | Enrichment suggestions |
| `funnels.ts` | (small) | Email funnels for prospecting |
| `search.ts` | (small) | Cross-entity search |
| `orgBrief.ts` | (small) | Organisation-level briefings |
| `dailyBriefs.ts` | (small) | Daily AI briefs |
| `planning.ts` | (small) | Planning applications |

### Infrastructure

| File | Exports | Role |
|---|---|---|
| `auth.config.ts` | config | Clerk auth configuration |
| `schema.ts` | schema | The 84-table schema |
| `users.ts` | (small) | User CRUD |
| `userTags.ts` | (small) | User tag taxonomy |
| `pushTokens.ts` | (small) | Mobile push notification tokens |
| `crons.ts` | 5 entries | Scheduled jobs (see below) |
| `changelog.ts` | (small) | App changelog records |
| `activities.ts` | (small) | (file at convex/activities.ts; intersects with hubspotSync/activities.ts) |

## Cron schedule

From `model-testing-app/convex/crons.ts`:

| Cron name | Schedule | Handler | Purpose |
|---|---|---|---|
| `daily-brief-trigger` | Daily 05:00 UTC | `dailyBriefs.cronTrigger` | Generate the daily organisation briefs |
| `hubspot-recurring-sync` | Every 6 hours | `hubspotSync.recurringSync.runRecurringSync` | Incremental sync of HubSpot companies, contacts, deals, activities |
| `hubspot-webhook-log-prune` | Daily 03:15 UTC | `hubspotSync.webhook.pruneWebhookEventLog` | Trim webhook event dedup log (30-day retention) |
| `google-calendar-auto-sync` | Every 30 minutes | `googleCalendarSync.autoSyncAll` | Sync all connected users' Google Calendar; renew push channels |
| `google-calendar-sync-log-prune` | Daily 03:30 UTC | `googleCalendarLog.pruneSyncLog` | Trim Google Calendar sync log |

The brief proposes "Convex scheduled actions are the spine of cadenced operations". The five existing crons are integration-maintenance crons rather than relationship-cadence crons. A future cadence engine would add a sixth class of crons (or rework one of these to cover the Cadence table once that exists).

## Cross-cutting observations for the primitive design step (step 6 of the brief)

These are the inputs to the brief's "cross-cutting primitives I haven't seen the app implement yet" question.

### Does `deal.get_full_context` already exist?

The brief asks whether a coarse-grained primitive that assembles deal + milestones + info-requests + lender-approaches + recent docs + recent touchpoints in one call already exists. **It does not.** The closest existing functions:

- `projects.get`: project row only.
- `projects.getStats`: counts and aggregates, no document/touchpoint payload.
- `projects.getWithExtractedData`: project plus extracted data.
- `intelligence.getProjectIntelligence`: structured intelligence singleton only.
- `knowledgeLibrary.getChecklistByProject`: checklist only.

A coarse-grained primitive would compose these. It would also need to pull from missing entities (milestones, lender approaches) once those are added.

### Does `document.extract` (parameterised) already exist?

**Partially.** Multiple extraction paths exist for different document types:

- V4 batch: `/api/v4-analyze` and `/api/v4-deep-extract` accept documents and run the Anthropic Skills batch pipeline.
- Intelligence extract: `/api/intelligence-extract` extracts canonical fields with confidence.
- Meeting extract: `/api/meeting-extract` extracts meeting metadata + action items.
- Knowledge parse: `/api/knowledge-parse` parses document requirement descriptions.
- Codify extraction: `/api/codify-extraction` codifies financial fields.

None of these is parameterised by an arbitrary target schema. A unified `document.extract(targetSchema, sourceDocument)` primitive does not exist. The brief's vision of one primitive used by client doc intake, term sheet parsing, lender appetite memos, transcript processing, and monitoring docs would require unifying these routes.

### Does `template.populate` (parameterised) already exist?

**Partially.** The financial-modelling infrastructure (`modelingTemplates`, `templateDefinitions`, `templateSheets`, `modelingCodeMappings`, `modelExports`) is exactly this primitive, scoped to Excel financial models. It works by mapping extracted item codes to template placeholders.

`quick-export` route handles a simpler case. There is no general `template.populate(template, dataObject) → file` primitive that covers XLSX, DOCX, and PDF forms uniformly.

### Does a cadence scheduling engine exist?

**No.** The five existing crons are integration-maintenance jobs. There is no Cadence table, no per-Person scheduled-touch records, no event-triggered nudge. The `reminders` table is user-private, not relationship-keyed.

The infrastructure to build it exists (Convex scheduled actions, the `reminders` pattern, the crons array), but the domain model is missing.

### Does an approval queue surface exist?

**Partially.** `chatActions` is a pending-action queue per chat session. The web UI shows these as confirmation prompts inline with the chat. But:

- It is per-session, not a cross-cutting approval inbox.
- It is not exposed to the mobile app as a standalone view.
- It does not support staged drafts that are not tied to a chat session (e.g., a draft email generated by a background cadence job awaiting review).

A cross-cutting Approval entity would need to be added.

### Observations on cron orchestration

- **All crons run inside Convex.** No external scheduler. Renewal and webhook fallback both live in `googleCalendarSync.autoSyncAll`.
- **HubSpot sync uses a bridge pattern.** Convex crons cannot import `src/lib/` code (Convex bundler scope). The HubSpot recurring sync therefore calls `/api/hubspot/sync-all` over HTTP using a `CRON_SECRET` shared with the Next.js side. The same pattern applies to the webhook processor (`/api/hubspot/webhook-process`). Any future cron that needs Next.js code will follow the same bridge.
- **Cron failures are logged but not alerted.** `hubspotSyncConfig.lastSyncStatus` and `googleCalendarSyncLog` capture status. There is no surface that exposes a failed cron to a human reviewer.

## Internal versus public function classification

Of 863 exports:

- 813 are public `query`/`mutation`/`action`.
- 41 are `internalQuery`/`internalMutation`/`internalAction`.

Most internal-prefixed functions are cron handlers, migration steps, or webhook processors. The internal-versus-public boundary in the existing codebase tracks "called from the Convex scheduler/cron/webhook flow" versus "called from a UI client". For the skills tree, the MCP server should only expose public functions; internal functions should remain hidden.
