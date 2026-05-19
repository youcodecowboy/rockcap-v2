# Convex Schema Inventory

Schema source: `model-testing-app/convex/schema.ts` (3548 lines). Below is the full table inventory grouped by logical area, followed by the gap analysis against the brief's target entity list.

## Headline counts

| Metric | Count |
|---|---|
| Tables defined | 84 |
| Tables with soft-delete pattern (`isDeleted`, `deletedAt`, `deletedBy`) | ~15 core business tables |
| Tables with discriminator field (`type`, `status`, `kind`, `scope`) | ~50 |
| Tables holding HubSpot-projection state | 6 (`companies`, `contacts`, `deals`, `activities`, `hubspotSyncConfig`, `webhookEventLog`) |
| Tables holding Google Calendar state | 4 (`googleCalendarTokens`, `googleCalendarChannels`, `googleCalendarSyncLog`, plus `events`) |
| Tables holding Companies House data | 5 (`companiesHouseCompanies`, `companiesHouseCharges`, `companiesHouseOfficers`, `companiesHousePSC`, `companyRelationships`) |
| Tables for AI/extraction infrastructure | ~12 |

## Tables by logical area

### Users and identity (2)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| users | User profiles from Clerk auth | email, name, clerkId | - | - |
| userTags | User-specific tag taxonomy | userId, tags | userId | - |

### Core CRM (4)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| clients | Unified prospect/active account list | name, status, type, companyName | deletedBy → users | status (prospect/active/archived/past), type (lender/borrower/developer) |
| companies | HubSpot company projections | name, domain, hubspotCompanyId | promotedToClientId, linkedContactIds[], linkedDealIds[] | - |
| contacts | People across all systems | name, email, phone, role | clientId, projectId, sourceDocumentId, linkedCompanyIds[], linkedDealIds[] | - |
| leads | Prospect lifecycle layer | contactId, companyId | contactId, companyId | lifecycleStage (lead/opportunity/mql/sql), status (new/contacted/qualified/nurturing/converted/lost) |

`clients` and `companies` overlap: a HubSpot company can be `promotedToClientId` linked to a client. `contacts` and `leads` overlap: `leads` adds lifecycle on top of `contacts`. See gap analysis for the structural questions this raises.

### Projects and deals (5)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| projects | Internal financing tracked projects | name, clientRoles[], status, dealPhase | clientRoles.clientId[] | status (active/inactive/completed/on-hold/cancelled), dealPhase (indicative_terms/credit_submission/post_credit/completed) |
| deals | HubSpot deal projections | name, hubspotDealId, status, pipeline | linkedContactIds[], linkedCompanyIds[], linkedProjectId | status (new/contacted/qualified/negotiation/closed-won/closed-lost) |
| scenarios | Financial modelling scenarios | projectId, data | projectId, createdBy | - |
| scenarioResults | Versioned scenario calculation snapshots | scenarioId, version, inputs, outputs | scenarioId | - |
| modelRuns | Model execution versions | scenarioId, projectId, modelType, version | scenarioId, projectId, sourceDocumentIds[], dataLibrarySnapshotId | modelType (appraisal/operating/custom/other) |

The Deal/Project duality is the largest naming question in the schema. `deals` is a thin HubSpot projection used during prospecting; `projects` carries the dealPhase state machine and is the table that grows entities (folders, scenarios, model runs, intelligence) once the engagement is real.

### Documents and filing (6)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| documents | Primary document store with AI analysis | fileName, fileStorageId, clientId, projectId, status, scope, category | fileStorageId, clientId, projectId, previousVersionId, ownerId | scope (client/internal/personal), status (pending/processing/completed/error) |
| documentNotes | Annotations on documents | documentId, content | documentId, clientId, projectId, knowledgeItemId | intelligenceTarget (client/project) |
| internalDocuments | RockCap internal documents | fileName, documentCode, linkedClientId | linkedClientId, linkedProjectIds[] | - |
| fileUploadQueue | Document processing queue | fileName, status, fileStorageId, documentId | fileStorageId, documentId, userId | status (pending/uploading/analyzing/completed/error/needs_confirmation) |
| bulkUploadBatches | Grouped file uploads | scope, clientId, projectId, status | clientId, projectId, userId | scope (client/internal/personal), status (queued/uploading/processing/review/completed/partial) |
| bulkUploadItems | Individual files in batch | batchId, status, fileStorageId, documentId | batchId, fileStorageId, documentId, suggestedProjectId, duplicateOfDocumentId, checklistItemIds[] | status (pending/processing/ready_for_review/filed/error/discarded) |

### Folder organisation (6)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| clientFolders | Client-level folder structure | clientId, folderType, name, parentFolderId | clientId, parentFolderId | - |
| projectFolders | Project-level folder structure | projectId, folderType, name, depth, parentFolderId | projectId, parentFolderId | - |
| internalFolders | RockCap company-wide folders | folderType, name, parentFolderId | parentFolderId, createdBy | - |
| personalFolders | User-specific private folders | userId, folderType, name, parentFolderId | userId, parentFolderId | - |
| folderTemplates | Folder structure templates per client type | clientType, level, folders[] | - | level (client/project) |
| documentPlacementRules | Document routing rules | clientType, documentType, category, targetFolderKey | - | targetLevel (client/project) |

### Document classification and learning (5)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| fileTypeDefinitions | User-defined file type taxonomy | fileType, category, keywords | createdBy, exampleFileStorageId | - |
| filingCorrections | AI prediction feedback for learning | sourceItemId, sourceDocumentId, contentHash | correctedBy | - |
| learningEvents | Auto-learned keywords from corrections | fileTypeId, eventType | - | eventType (keyword_learned) |
| classificationCache | Content hash cache for fast classification | contentHash, fileNamePattern, classification | - | - |
| folderTemplates | (also listed under Folders) | | | |

### Data extraction and codification (6)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| documentExtractions | Extraction history per document | documentId, projectId, extractedData, version | documentId, projectId | - |
| extractedItemCodes | Canonical code library | code, displayName, category, dataType | createdBy | dataType (currency/number/percentage/string) |
| itemCodeAliases | Normalisation mapping to canonical codes | alias, canonicalCodeId, confidence | canonicalCodeId | source (system_seed/llm_suggested/user_confirmed/manual) |
| itemCategories | Dynamic grouping for extracted items | name, normalizedName, examples | - | - |
| codifiedExtractions | Per-document codified item mappings | documentId, projectId, items[], isFullyConfirmed | documentId, projectId | - |
| extractionJobs | Background extraction processing queue | documentId, projectId, fileStorageId, status | documentId, projectId, clientId | status (pending/processing/completed/failed) |

### Financial modelling and templates (4)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| modelingTemplates | Financial model Excel templates | name, modelType, fileStorageId, version | fileStorageId, createdBy | modelType (appraisal/operating/custom) |
| modelingCodeMappings | Template placeholder to extracted code mappings | categoryCode, inputCode, dataType, priority | createdBy | dataType (string/number/date/boolean/array) |
| templateDefinitions | Metadata for model templates | name, modelType, version, coreSheetIds[] | originalFileStorageId, createdBy | modelType (appraisal/operating/other) |
| templateSheets | Individual sheet data within templates | templateId, name, type, dataStorageId | templateId, dataStorageId | type (core/dynamic) |

### Project data library (3)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| projectDataItems | Unified aggregated project data | projectId, itemCode, category, currentValue | projectId, currentSourceDocumentId | - |
| dataLibrarySnapshots | Point-in-time data snapshots | projectId, reason, items[] | projectId, modelRunId, sourceDocumentIds[] | reason (model_run/manual_save/pre_revert_backup/pre_delete_backup) |
| modelExports | Model export audit trail | projectId, modelRunId, snapshotId | projectId, modelRunId, snapshotId, templateId | exportType (quick_export/full_model/data_only) |

### Knowledge library and intelligence (10)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| knowledgeRequirementTemplates | Document requirement templates per client type | clientType, level, requirements[] | - | level (client/project), phaseRequired (indicative_terms/credit_submission/post_credit/always), priority (required/nice_to_have/optional) |
| knowledgeChecklistItems | Per-client/project requirement tracking | clientId, projectId, requirementTemplateId, status | clientId, projectId, requirementTemplateId, suggestedDocumentId | status (missing/pending_review/fulfilled), customSource (manual/llm) |
| knowledgeChecklistDocumentLinks | M2M between checklist items and documents | checklistItemId, documentId, isPrimary | checklistItemId, documentId | - |
| knowledgeEmailLogs | Email request generation history | clientId, projectId, missingItemIds[] | clientId, projectId | - |
| knowledgeBankEntries | Consolidated knowledge entries | clientId, projectId, sourceType, sourceId, entryType | clientId, projectId | sourceType (document/email/manual/call_transcript), entryType (deal_update/call_transcript/email/document_summary/project_status/general) |
| knowledgeItems | Flexible intelligence storage | clientId, projectId, fieldPath, value, status | clientId, projectId, sourceDocumentId | sourceType (document/manual/ai_extraction/data_library/checklist), status (active/flagged/archived/superseded), valueType (string/number/currency/date/percentage/array/text/boolean) |
| intelligenceExtractionJobs | Background intelligence extraction queue | documentId, projectId, clientId, status | documentId, projectId, clientId | status (pending/processing/completed/failed/skipped) |
| intelligenceConflicts | Flagged conflicting intelligence | clientId, projectId, fieldPath, relatedItemIds[] | clientId, projectId, relatedItemIds[] | status (pending/resolved) |
| clientIntelligence | Structured client intelligence (one per client) | clientId, clientType, identity, lenderProfile, borrowerProfile, evidenceTrail[] | clientId | - |
| projectIntelligence | Structured project intelligence (one per project) | projectId, overview, location, financials, timeline, development, keyParties, evidenceTrail[] | projectId | - |

The knowledge layer evolved in three generations: structured `clientIntelligence` and `projectIntelligence` singletons per entity, then flexible `knowledgeItems` with canonical-plus-custom fieldPaths, then `knowledgeBankEntries` as a consolidated narrative store. All three coexist today.

### Prospecting and enrichment (5)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| enrichmentSuggestions | Data enrichment suggestions | type, field, value, status | documentId, clientId, projectId | type (email/phone/address/company/contact/date/other), status (pending/accepted/rejected/skipped) |
| prospectingContext | Document-based prospecting insights | documentId, keyPoints[], painPoints[], opportunities[], decisionMakers[] | documentId, clientId, projectId | - |
| emailTemplates | Prospecting email templates | name, category, prospectType, subject, body | - | category (first-contact/follow-up/proposal/check-in), prospectType (new-prospect/existing-prospect/reactivation) |
| emailFunnels | Multi-email prospecting sequences | name, prospectType, templates[] | - | prospectType (new-prospect/existing-prospect/reactivation) |
| prospectingEmails | Generated prospect emails | prospectId, clientId, templateId, status | prospectId, clientId, templateId | status (draft/pending_approval/approved/sent/bounced) |

### Companies House data (5)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| companiesHouseCompanies | Companies House lookup cache | companyNumber, companyName, sicCodes, incorporationDate, companyStatus | - | - |
| companiesHouseCharges | Company charges/loans | companyId, chargeId, chargeStatus | companyId | chargeStatus (outstanding/satisfied) |
| companiesHousePSC | Persons with significant control | companyId, pscId, pscType, linkedCompanyIds[] | companyId, linkedCompanyIds[] | pscType (individual/corporate-entity/legal-person) |
| companiesHouseOfficers | Company officers/directors | companyId, officerId, officerRole, linkedCompanyIds[] | companyId, linkedCompanyIds[] | - |
| companyRelationships | Links between companies | companyId1, companyId2, relationshipType, sharedEntityType | companyId1, companyId2 | relationshipType (shared_psc/shared_officer/shared_address/parent_subsidiary) |

### Planning and property data (4)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| prospects | Sales prospects derived from planning apps | companyNumber, companyId, prospectTier, hasPlanningHits, hasOwnedPropertyHits | companyId | prospectTier (A/B/C/UNQUALIFIED) |
| planningApplications | Planning application records | externalId, source, siteAddress, status | - | source (planning_data_api/london_datahub/other), status (APPROVED/REFUSED/UNDER_CONSIDERATION/UNKNOWN) |
| companyPlanningLinks | M2M companies to planning applications | companyNumber, planningApplicationId, matchConfidence | planningApplicationId | matchConfidence (HIGH/MEDIUM/LOW) |
| propertyTitles | Property title records | titleNumber, address, postcode, geometrySource | - | geometrySource (none/inspire_index/nps) |
| companyPropertyLinks | M2M companies to property titles | companyNumber, propertyTitleId, ownershipType | propertyTitleId | ownershipType (FREEHOLD/LEASEHOLD/UNKNOWN), fromDataset (uk_companies_own_property/overseas_companies_own_property) |

### Communications and collaboration (9)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| activities | HubSpot activities (calls, emails, notes) | contactId, companyId, dealId, activityType, activityDate | contactId, companyId, dealId, linkedContactIds[], linkedDealIds[] | activityType (note/call/email/meeting/task/ticket), direction (inbound/outbound) |
| meetings | Meeting summaries extracted from docs/transcripts | clientId, projectId, attendees[], sourceDocumentId | clientId, projectId, sourceDocumentId | meetingType (progress/kickoff/review/site_visit/call/other) |
| meetingExtractionJobs | Background meeting extraction queue | documentId, clientId, projectId, status | documentId, clientId, projectId | status (pending/processing/completed/failed/skipped) |
| chatSessions | AI chat session groups | userId, contextType, clientId, projectId | userId, clientId, projectId | contextType (global/client/project) |
| chatMessages | Individual messages in chat sessions | sessionId, role, content, toolCalls[], toolResults[] | sessionId | role (user/assistant/system) |
| chatActions | Pending user-confirmable actions | sessionId, messageId, actionType, status | sessionId, messageId | status (pending/confirmed/cancelled/executed/failed) |
| conversations | Direct message conversations | participantIds[], createdBy, clientId, projectId | participantIds[], createdBy, clientId, projectId | - |
| directMessages | Individual direct messages | conversationId, senderId | conversationId, senderId | - |
| notes | User-created notes | userId, clientId, projectId, templateId | userId, clientId, projectId, templateId | - |
| comments | Comments on documents and upload jobs | jobId, documentId, userId, taggedUserIds[] | jobId, documentId, userId, taggedUserIds[] | - |

### Events and scheduling (4)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| events | Calendar events (Google Calendar compatible) | startTime, endTime, allDay, clientId, projectId, contactIds[] | createdBy, organizerId, clientId, projectId, contactIds[] | visibility (default/public/private/confidential), status (confirmed/tentative/cancelled), syncStatus (synced/pending/failed/local_only) |
| googleCalendarTokens | Google Calendar OAuth tokens | userId, accessToken, refreshToken, expiresAt | userId | - |
| googleCalendarChannels | Google Calendar webhook channels | userId, channelId, resourceId, syncToken | userId | - |
| googleCalendarSyncLog | Calendar sync execution log | userId, trigger, status | userId | trigger (webhook/cron/manual), status (ok/error/skipped) |

### Tasks, reminders, notifications (3)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| tasks | Task management with assignment | createdBy, assignedTo[], clientId, projectId, status | createdBy, assignedTo[], clientId, projectId, reminderIds[], attachmentIds[], contactIds[] | status (todo/in_progress/completed/cancelled/paused), priority (low/medium/high) |
| reminders | User-specific reminders | userId, clientId, projectId, taskId, scheduledFor, status | userId, clientId, projectId, taskId | status (pending/completed/dismissed/overdue) |
| notifications | Unified notification system | userId, type, relatedId | userId | type (file_upload/reminder/task/changelog/flag/mention/message) |

### Flags and audit (3)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| flags | Cross-team collaboration flags | entityType, entityId, createdBy, assignedTo, status | createdBy, assignedTo, clientId, projectId | entityType (document/meeting/task/project/client/checklist_item), status (open/resolved), priority (normal/urgent) |
| flagThreadEntries | Conversation threads within flags | flagId, entryType, userId | flagId, userId | entryType (message/activity) |
| auditLog | Mutation audit trail | tableName, recordId, action, userId | userId | action (create/update/delete/restore) |

### HubSpot integration state (3)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| hubspotSyncConfig | Global HubSpot sync configuration | isRecurringSyncEnabled, lastSyncAt, lastSyncStatus | - | lastSyncStatus (success/error/in_progress) |
| hubspotPipelines | HubSpot pipeline and stage definitions | pipelineId, pipelineName, stages[] | - | - |
| webhookEventLog | HubSpot webhook dedup and audit | eventId, subscriptionType, objectType, objectId, status | - | status (scheduled/completed/failed) |

### Configuration, metadata, analytics (6)

| Table | Purpose | Key fields | Foreign keys | Discriminators |
|---|---|---|---|---|
| categorySettings | Customisable system categories | categoryType, name, isActive, hubspotMapping | createdBy | categoryType (client_status/client_type/client_tag/prospecting_stage) |
| changelog | Application change log | title, description, pagesAffected[], featuresAffected[] | - | - |
| contextCache | AI context cache per client/project | contextType, contextId, cachedContext, expiresAt | - | contextType (client/project) |
| dailyBriefs | Daily AI-generated team briefings | userId, date, scope, content | userId | scope (personal/organization) |
| pushTokens | Mobile push notification tokens | userId, token, platform | userId | - |
| loraTrainingExports | LoRA fine-tuning data exports | exportName, exportedBy, criteria, status | exportedBy, exportFileStorageId | exportFormat (openai_chat/together_chat/alpaca), status (pending/generating/completed/error) |
| noteTemplates | Note templates | knowledgeBankFields[], isActive | - | - |
| keywordLearning | (referenced in convex/keywordLearning.ts; verify if separate table) | | | |

## Gap analysis against the brief's target schema

The brief enumerates 14 target entities. The audit's verdict on each:

| Target entity | Status | Notes |
|---|---|---|
| **Person** | **Missing as a unified table.** | `contacts` covers people but `role` is a string field, not a separate Role table. BDM mobility (a person moves between lender organisations) is not currently expressible. Lender BDMs, professional advisers, and developer principals all live in `contacts` undifferentiated. |
| **Organisation** | **Partial.** | Split across `companies` (HubSpot projection), `clients` (active accounts), and `companiesHouseCompanies` (Companies House cache). No single discriminator field for organisation kind (lender/developer/professional firm). |
| **Role** | **Missing as a time-bounded link.** | `contacts.role` is a free-text string. `contacts.clientId` is a single foreign key. The brief's design (Person ↔ Organisation through Role with start/end dates) cannot be expressed without a new join table. |
| **Deal** | **Present, with naming overlap.** | The brief's "Deal = one transaction attempt" maps closely to `projects`, not `deals`. The `deals` table is a HubSpot deals projection used during prospecting. `projects.dealPhase` already encodes the lifecycle state machine the brief calls for. `predecessor_deal_id` is missing; would be a `projects.predecessorProjectId` addition. |
| **LenderApproach** | **Missing.** | The per-lender-per-deal child entity needed for terms comparison, IC status tracking, and behavioural intelligence does not exist. |
| **InformationRequest** | **Partial.** | `knowledgeChecklistItems` is the closest existing table. It has `status` (missing/pending_review/fulfilled) and links to documents, but lacks the graded priority field (required/preferred/optional), the blocking flag, and the two-stage status (RockCap-status versus lender-status) the brief specifies. The existing `knowledgeRequirementTemplates.priority` enum is close but not quite the same set. |
| **Milestone** | **Missing.** | `projectIntelligence.timeline` carries narrative timeline data but there is no Milestone table with dependency graph, target dates, or chase-state. |
| **Document** | **Present.** | `documents` matches the brief. Already phase-tagged via `category` and folder placement, deal-linked via `projectId`, and version-aware via `previousVersionId` plus `linkAsVersion`/`unlinkVersion` mutations. |
| **Meeting** | **Present.** | `meetings` matches. Transcript-linked via `sourceDocumentId`, action-item-linked via embedded action items, verifiable via `verifyMeeting` mutation. |
| **Cadence** | **Missing.** | No scheduled-touch records. The brief calls for one table keyed by Person + type + next-due-at; no analogue exists today. `reminders` is user-private, not relationship-keyed. The cron infrastructure exists (5 crons running) but there is no domain table to schedule against. |
| **LenderProfile** | **Partial.** | `clientIntelligence.lenderProfile` (embedded JSON object inside the client intelligence row) carries lender-specific data. The three-layer model the brief proposes (static / live appetite with as_of_date / behavioural derived from deals) is not separated; everything lives in the same embedded blob. |
| **AppetiteSignal** | **Missing.** | No atomic-intelligence table with provenance and timestamp. The closest existing analogue is `knowledgeItems` which has the right shape (fieldPath + value + sourceType + sourceDocumentId + status) and could plausibly carry appetite signals if extended with an `entityType: "lender"` discriminator and an `as_of_date` field. |
| **Touchpoint** | **Partial.** | `activities` (the HubSpot activities projection) captures notes, calls, emails, meetings, tasks from HubSpot. It is closer to a "HubSpot activity log" than to a clean "exchange ledger" because it relies on HubSpot for inbound/outbound capture. An outbound email sent by Claude through Gmail directly would not appear in `activities` unless HubSpot also recorded it. |
| **Approval** | **Missing.** | No staged-draft surface. `chatActions` is the closest existing concept (a pending user-confirmable action from the AI) but it is per-chat-session, not a cross-cutting approval queue surfaced to the web and mobile UIs. |

## Migration history (file names only)

From `model-testing-app/convex/migrations/`:

- `addDocumentCodes.ts`
- `addFileTypeTargetFolders.ts`
- `clearFileQueue.ts`
- `clearLegacyData.ts`
- `fixChatSessionsUserId.ts`
- `fixClientRolesIds.ts`
- `flagSubtotals.ts`
- `mergeDuplicateClients.ts`
- `migrateToKnowledgeItems.ts`
- `resyncIntelligence.ts`
- `seedAppraisalTemplate.ts`
- `seedCodeMappings.ts`
- `seedFileTypeDefinitions.ts`
- `seedFolderTemplates.ts`
- `seedInternalFolders.ts`
- `seedKnowledgeTemplates.ts`
- `seedPlacementRules.ts`
- `setDefaultDocumentScope.ts`

The presence of `migrateToKnowledgeItems`, `mergeDuplicateClients`, `fixClientRolesIds`, and `resyncIntelligence` reads as scars from real schema evolution. The seed migrations show the knowledge-template, file-type, folder-template, and placement-rule systems are all populated by code rather than runtime config; if those need adjustment for the skills tree to operate, code changes are required.

## Cross-cutting observations for the schema design step (step 4 of the brief)

1. **The Deal/Project naming question is foundational.** Most of the missing entities (LenderApproach, InformationRequest, Milestone) hang off the Deal concept. Resolving whether the new entities link to `projects` (and `deals` stays as a thin HubSpot projection) or whether `deals` is renamed/promoted to be the primary table determines a lot of downstream foreign keys.
2. **Three intelligence layers coexist.** `clientIntelligence` + `projectIntelligence` (structured singletons), `knowledgeItems` (flexible field-path store), `knowledgeBankEntries` (narrative entries). Any new AppetiteSignal-shaped data could plausibly live in `knowledgeItems` if extended with a `lenderClientId` foreign key. Or it could become its own table. The architectural decision is whether the three-layer split continues or consolidates.
3. **Soft delete is consistent on core business entities.** `clients`, `projects`, `documents`, `internalDocuments`, `bulkUploadBatches`, `bulkUploadItems`, `codifiedExtractions`, and `companies` all have `isDeleted`/`deletedAt`/`deletedBy`. New entities should follow.
4. **M2M is sometimes via array fields, sometimes via junction tables.** `contacts.linkedCompanyIds[]` is an array; `knowledgeChecklistDocumentLinks` is a junction. The choice appears to depend on whether the join carries metadata. New M2M relations should follow the same rule.
5. **Discriminators dominate the schema.** Almost every table has a status, type, or kind enum. The brief's two explicit state machines (DealState, ContactState) with allowed transitions and audit trail are present in spirit (status fields + `auditLog`) but not codified as transition rules. A formal state-machine layer would be an addition.
6. **HubSpot is the source for prospect-stage data; Convex is the source for engaged-deal data.** The dividing line is the `promotedToClientId` field on `companies`. Before promotion: HubSpot is authoritative, RockCap reads. After promotion: Convex is authoritative, HubSpot is the projection. The brief states "Convex is the source of truth, HubSpot is a projection"; the current reality is the line moves over the deal lifecycle. This should be made explicit before write-through HubSpot sync is built.
