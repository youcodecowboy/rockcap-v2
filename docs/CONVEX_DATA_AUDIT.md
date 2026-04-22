# Convex Data Structure Audit Report

**Date:** 2026-02-25
**Scope:** Full schema, mutations, queries, and data integrity review
**Schema location:** `model-testing-app/convex/schema.ts` (3,182 lines)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Schema Overview - All 65 Tables](#schema-overview)
3. [CRITICAL: Data Deletion Risks](#critical-data-deletion-risks)
4. [CRITICAL: Duplicate / Overlapping Tables](#critical-duplicate--overlapping-tables)
5. [CRITICAL: Authorization Gaps](#critical-authorization-gaps)
6. [HIGH: Denormalized Data Sync Risks](#high-denormalized-data-sync-risks)
7. [HIGH: Schema Weakness - `v.any()` Fields](#high-schema-weakness---vany-fields)
8. [HIGH: Missing Required Fields](#high-missing-required-fields)
9. [MEDIUM: Performance - Full Table Scans](#medium-performance---full-table-scans)
10. [MEDIUM: Legacy / Deprecated Tables Still in Schema](#medium-legacy--deprecated-tables-still-in-schema)
11. [MEDIUM: Orphaned Tables (Defined but Unused)](#medium-orphaned-tables-defined-but-unused)
12. [MEDIUM: Type Inconsistencies (string vs v.id)](#medium-type-inconsistencies-string-vs-vid)
13. [LOW: Index Coverage Gaps](#low-index-coverage-gaps)
14. [Recommendations - Prioritized Action Plan](#recommendations---prioritized-action-plan)

---

## Executive Summary

The Convex database contains **65 tables** across multiple feature domains. After auditing every table definition, mutation, and query, the following critical findings were identified:

| Severity | Count | Summary |
|----------|-------|---------|
| CRITICAL | 3 | Hard deletes on core data; duplicate tables; no authorization on sensitive queries |
| HIGH | 3 | Denormalized fields can desync; `v.any()` schema holes; missing required fields |
| MEDIUM | 5 | Full table scans; legacy tables; orphaned tables; type inconsistencies; unindexed patterns |
| LOW | 1 | Some index coverage gaps |

**The single most important finding:** Every delete operation in the codebase is a **hard delete** (`ctx.db.delete()`). There is no soft-delete pattern, no audit trail, and no recoverability for core business data (clients, projects, documents). Given that this data is described as very sensitive and must not be lost, this is the top priority to fix.

---

## Schema Overview

### All 65 Tables by Domain

#### Core Business Data (6 tables)
| Table | Purpose | Indexes |
|-------|---------|---------|
| `users` | User profiles (Clerk auth) | `by_clerk_id`, `by_email` |
| `clients` | Unified client records (prospects are clients with status="prospect") | `by_status`, `by_type`, `by_name`, `by_hubspot_id` |
| `projects` | Projects with many-to-many client roles | `by_status`, `by_client`, `by_hubspot_id`, `by_shortcode`, `by_deal_phase` |
| `contacts` | Contact records linked to clients/projects | `by_client`, `by_project`, `by_document`, `by_hubspot_id`, `by_email`, `by_owner` |
| `documents` | File references and analysis results | `by_client`, `by_project`, `by_category`, `by_status`, `by_folder`, `by_previous_version`, `by_has_notes`, `by_scope`, `by_owner`, `by_scope_owner` |
| `documentNotes` | User annotations on documents | `by_document`, `by_client`, `by_project`, `by_created` |

#### CRM / Prospecting (10 tables)
| Table | Purpose |
|-------|---------|
| `companies` | HubSpot companies (can be promoted to clients) |
| `deals` | HubSpot deals for prospecting |
| `activities` | Unified activities (calls, emails, meetings) |
| `dealActivities` | **LEGACY** - old deal activities, replaced by `activities` |
| `leads` | Contacts with lead lifecycle stages |
| `prospects` | Sales layer on Companies House data |
| `prospectingContext` | Document-based prospecting insights |
| `prospectingEmails` | Email drafts for prospects |
| `emailTemplates` | Email template definitions |
| `emailFunnels` | Multi-step email sequences |

#### Document Management (8 tables)
| Table | Purpose |
|-------|---------|
| `internalDocuments` | Internal company documents |
| `internalFolders` | Company-wide folder structure |
| `personalFolders` | User-specific private folders |
| `internalDocumentFolders` | **LEGACY/DEPRECATED** - replaced by `internalFolders` |
| `clientFolders` | Per-client folder structure |
| `projectFolders` | Per-project folder structure |
| `folderTemplates` | Configurable folder structures per client type |
| `documentPlacementRules` | Rules for where document types should be filed |

#### Intelligence System (7 tables)
| Table | Purpose |
|-------|---------|
| `clientIntelligence` | Structured client data (one per client) |
| `projectIntelligence` | Structured project data (one per project) |
| `knowledgeItems` | Flexible normalized intelligence storage |
| `intelligenceConflicts` | When multiple sources disagree on a value |
| `intelligenceExtractionJobs` | Queue for intelligence extraction |
| `knowledgeBankEntries` | Legacy knowledge entries per client |
| `enrichmentSuggestions` | AI-suggested data enrichments |

#### Data Extraction & Codification (8 tables)
| Table | Purpose |
|-------|---------|
| `documentExtractions` | Extraction history per document |
| `extractedItemCodes` | Master canonical code library |
| `itemCodeAliases` | Normalization/learning layer for codes |
| `itemCategories` | Dynamic categories for item codes |
| `codifiedExtractions` | Per-document codified data |
| `extractionJobs` | Background extraction queue |
| `projectDataItems` | Unified project data library |
| `dataLibrarySnapshots` | Point-in-time snapshots for model runs |

#### Knowledge Library (4 tables)
| Table | Purpose |
|-------|---------|
| `knowledgeRequirementTemplates` | Base document requirements per client type |
| `knowledgeChecklistItems` | Per-client/project checklist tracking |
| `knowledgeChecklistDocumentLinks` | Many-to-many: documents <-> checklist items |
| `knowledgeEmailLogs` | Track email request generation history |

#### Financial Modeling (6 tables)
| Table | Purpose |
|-------|---------|
| `scenarios` | Modeling scenarios linked to projects |
| `scenarioResults` | Formula calculation results for version tracking |
| `modelRuns` | Versioned model executions |
| `modelExports` | Export audit trail |
| `modelingTemplates` | Financial model templates |
| `modelingCodeMappings` | Category code to input code mappings |
| `templateDefinitions` | Template metadata for optimized loading |
| `templateSheets` | Individual sheet data (lazy-loaded) |

#### File Processing (3 tables)
| Table | Purpose |
|-------|---------|
| `fileUploadQueue` | Background file processing jobs |
| `bulkUploadBatches` | Bulk upload batch tracking |
| `bulkUploadItems` | Individual files within a batch |

#### AI / Filing Feedback Loop (4 tables)
| Table | Purpose |
|-------|---------|
| `filingCorrections` | Every AI classification mistake corrected by users |
| `learningEvents` | Auto-learned keywords from corrections |
| `classificationCache` | Cached classification results for duplicate content |
| `loraTrainingExports` | Batched training data exports for fine-tuning |

#### Communication & Collaboration (6 tables)
| Table | Purpose |
|-------|---------|
| `chatSessions` | AI assistant chat sessions |
| `chatMessages` | Messages within chat sessions |
| `chatActions` | Pending actions requiring confirmation |
| `comments` | Comments on documents and uploads |
| `notes` | User-created rich text notes |
| `noteTemplates` | Templates for creating notes |

#### Task & Calendar (4 tables)
| Table | Purpose |
|-------|---------|
| `tasks` | Task management with assignment |
| `reminders` | User-specific reminders |
| `events` | Calendar events (Google Calendar compatible) |
| `notifications` | Unified notification system |

#### Companies House (6 tables)
| Table | Purpose |
|-------|---------|
| `companiesHouseCompanies` | Tracked companies from Companies House |
| `companiesHouseCharges` | Charges (loans) per company |
| `companiesHousePSC` | Persons with Significant Control |
| `companiesHouseOfficers` | Company officers/directors |
| `companyRelationships` | Links between companies |
| `companyPlanningLinks` | Company <-> planning application links |

#### External Data (2 tables)
| Table | Purpose |
|-------|---------|
| `planningApplications` | Planning application data |
| `propertyTitles` | Property title data from Land Registry |
| `companyPropertyLinks` | Company <-> property title links |

#### Configuration & System (7 tables)
| Table | Purpose |
|-------|---------|
| `fileTypeDefinitions` | User-defined file types for filing |
| `categorySettings` | Customizable categories for clients/projects |
| `changelog` | Application change tracking |
| `hubspotSyncConfig` | HubSpot sync configuration |
| `hubspotPipelines` | Pipeline/stage definitions |
| `contextCache` | AI assistant context cache |
| `apiRateLimit` | API rate limit tracking |
| `userTags` | User tag categorization |
| `meetings` | Extracted meeting summaries |
| `meetingExtractionJobs` | Async meeting extraction queue |

---

## CRITICAL: Data Deletion Risks

### Finding: All deletions are hard deletes with no recovery mechanism

Every single delete operation in the codebase uses `ctx.db.delete(id)` which permanently removes the record. There is **no soft-delete pattern, no audit trail, and no recoverability**.

#### Tables with exposed delete mutations:

| Table | Mutation | Safeguards | Risk Level |
|-------|----------|------------|------------|
| `documents` | `remove()` | None - just checks existence | **CRITICAL** - core business data |
| `clients` | `remove()` | Checks existence only | **CRITICAL** - core business data |
| `projects` | `remove()` | Checks existence only | **CRITICAL** - core business data |
| `tasks` | `remove()` | Creator ownership check | MEDIUM |
| `clientFolders` | `deleteCustomFolder()` | Checks for documents in folder | MEDIUM |
| `projectFolders` | `deleteCustomProjectFolder()` | Checks for documents in folder | MEDIUM |
| `knowledgeBankEntries` | `remove()` | Checks existence | HIGH |
| `chatSessions` | `deleteSession()` | Ownership check, cascading delete | LOW |
| `chatMessages` | `deleteMessage()` | Session ownership | LOW |
| `comments` | `remove()` | None | MEDIUM |
| `scenarios` | `remove()` | None | HIGH |
| `reminders` | `remove()` | None | LOW |
| `extractionJobs` | `remove()` | None | LOW |
| `fileUploadQueue` | `deleteJob()` | None | LOW |

#### Destructive migration scripts:

| Script | Tables Affected | Safeguard |
|--------|----------------|-----------|
| `clearLegacyData.ts` | `clientFolders`, `projectFolders`, `bulkUploadItems`, `bulkUploadBatches`, `documents`, `knowledgeBankEntries`, `projects`, `clients` | **NONE** - bulk deletes ALL records from 8 tables |
| `clearFileQueue.ts` | `fileUploadQueue` | **NONE** - bulk deletes ALL records |

#### Cascading delete risks:

When a **client** is deleted:
- Documents referencing that client become orphaned (no cascade)
- Projects with that client in `clientRoles` become corrupted
- Contacts, enrichment suggestions, intelligence records are orphaned
- Knowledge checklist items are orphaned
- Folders are orphaned

When a **project** is deleted:
- Documents referencing that project become orphaned
- Data library items (`projectDataItems`) are orphaned
- Codified extractions are orphaned
- Intelligence records are orphaned

When a **document** is deleted:
- Knowledge bank entries referencing it are orphaned
- Document notes are orphaned
- Extraction jobs referencing it are orphaned
- Codified extractions are orphaned
- File storage reference is leaked (file not cleaned up)

### Notable exception: `codifiedExtractions` uses soft delete

The `codifiedExtractions` table has `isDeleted`, `deletedAt`, and `deletedReason` fields - this is the **only table** in the entire schema that implements soft delete. This pattern should be applied to all core business tables.

---

## CRITICAL: Duplicate / Overlapping Tables

### 1. `dealActivities` vs `activities`

**Problem:** Two tables store the same type of data (CRM activities).

| Field | `dealActivities` | `activities` |
|-------|-----------------|-------------|
| Activity type | Yes | Yes |
| Subject/body | Yes | Yes |
| Contact/company links | Yes | Yes |
| HubSpot sync | Yes | Yes |
| **Scope** | Deal-only | Contact, company, AND deal |

**Schema comment confirms:** `"Legacy deal activities table - kept for backward compatibility. New activities should use the unified 'activities' table"`

**Risk:** Data written to old table is invisible to queries on new table and vice versa.

### 2. `internalDocumentFolders` vs `internalFolders`

**Problem:** Two tables for internal document folders.

| Field | `internalDocumentFolders` (legacy) | `internalFolders` (new) |
|-------|-----------------------------------|------------------------|
| name | Yes | Yes |
| folderType | No | Yes |
| description | No | Yes |
| parentFolderId | No | Yes (nested) |
| isCustom | No | Yes |
| createdBy | No | Yes |

**Schema comment confirms:** `"Legacy: Internal Document Folders (deprecated - use internalFolders instead)"`

### 3. `knowledgeBankEntries` vs `knowledgeItems`

**Problem:** Both tables store "intelligence" about clients/projects.

| Aspect | `knowledgeBankEntries` | `knowledgeItems` |
|--------|----------------------|-----------------|
| Scope | Client + optional project | Client OR project |
| Structure | Title + content + keyPoints | fieldPath + value + category |
| Source tracking | sourceType + sourceId | sourceType + sourceDocumentId + sourceText |
| Conflict handling | None | Has `intelligenceConflicts` table |
| Normalization | None | `isCanonical` + `matchedAlias` |

`knowledgeItems` is clearly the newer, more capable system. `knowledgeBankEntries` appears to be the older version.

### 4. `clientIntelligence` / `projectIntelligence` vs `knowledgeItems`

**Problem:** Three different systems for storing intelligence:

- `clientIntelligence` - Single document per client with deeply nested structure (identity, banking, lender profile, borrower profile, etc.)
- `projectIntelligence` - Single document per project with deeply nested structure (overview, financials, timeline, etc.)
- `knowledgeItems` - Normalized, per-field storage with conflict resolution

These overlap significantly. For example, a lender's deal size range could be stored in:
- `clientIntelligence.lenderProfile.dealSizeMin`
- `knowledgeItems` with `fieldPath: "lenderProfile.dealSizeMin"`
- `knowledgeBankEntries` as a key point

**Risk:** Same data stored in multiple places with no synchronization guarantee.

### 5. `contacts.company` (legacy field) vs `contacts.linkedCompanyIds`

**Problem:** The `company` field is a legacy string, while `linkedCompanyIds` is the proper reference array.

**Schema comment confirms:** `"Legacy field - kept for backward compatibility, use linkedCompanyIds instead"`

---

## CRITICAL: Authorization Gaps

### Queries with NO authentication checks (expose sensitive data to any user):

| Module | Query | Data Exposed |
|--------|-------|-------------|
| `users` | `getByEmail`, `getAll`, `getByIds`, `getByClerkId` | All user records, emails, names |
| `clients` | `list`, `get`, `getByStatus`, `getByType`, `getStats`, `getRecent` | All client data including financial details |
| `documents` | `list`, `get`, `getByClient`, `getByProject`, `getInternal`, `search` | All documents including sensitive financial/legal files |
| `deals` | `getAllDeals`, `getDealById`, `getPipelineTotal` | Deal amounts, pipeline values |
| `companies` | `get`, `getAll`, `getByLifecycleStage` | All company records |
| `contacts` | `getByClient`, `getByProject`, `getAll`, `get` | All contact information |
| `intelligence` | `getClientIntelligence`, `getProjectIntelligence`, `searchLenders` | Banking details, lender criteria, financial data |
| `search` | `globalSearch` | **Everything** - searches across 6 tables at once |
| `comments` | `getByJob`, `getByDocument` | All comments |
| `leads` | `getAllLeads`, `getLeadById` | All lead data |
| `prospects` | `listProspects`, `getProspect` | All prospect data |

### Queries WITH proper authentication:

| Module | Queries | Method |
|--------|---------|--------|
| `chatSessions` | `list`, `get` | User ownership verification |
| `chatMessages` | `list` | Session ownership verification |
| `notifications` | `getByUser`, `getUnreadCount`, `getRecent` | Current user filter |
| `tasks` | `get`, `getByUser`, `getByClient`, `getByProject` | Creator/assignee check |
| `events` | `get`, `list`, `getByDateRange` | Creator/organizer/attendee check |

### Mutations with NO authorization on sensitive operations:

| Module | Mutation | Risk |
|--------|----------|------|
| `documents` | `update()` | Any user can reassign any document to different client/project |
| `clients` | `update()` | Any user can modify any client record |
| `projects` | `update()` | Any user can modify any project record |

---

## HIGH: Denormalized Data Sync Risks

Several tables store copies of data from other tables. If the source changes, the copy becomes stale.

| Table | Denormalized Field | Source | Sync Mechanism |
|-------|-------------------|--------|----------------|
| `documents` | `clientName` | `clients.name` | **None found** |
| `documents` | `projectName` | `projects.name` | **None found** |
| `bulkUploadBatches` | `clientName` | `clients.name` | **None found** |
| `bulkUploadBatches` | `projectName` | `projects.name` | **None found** |
| `bulkUploadBatches` | `projectShortcode` | `projects.projectShortcode` | **None found** |
| `leads` | `companyName` | `companies.name` | **None found** |
| `knowledgeChecklistDocumentLinks` | `documentName` | `documents.fileName` | **None found** |
| `meetings` | `sourceDocumentName` | `documents.fileName` | **None found** |
| `clientIntelligence` | `projectSummaries[].projectName` | `projects.name` | Manual sync via intelligence update |
| `itemCodeAliases` | `canonicalCode` | `extractedItemCodes.code` | **None found** |

**Risk:** If a client name changes, every document, batch, and intelligence record still shows the old name. Over time this will cause confusion and data inconsistency.

---

## HIGH: Schema Weakness - `v.any()` Fields

The following fields use `v.any()` which bypasses all type validation. Any data structure can be stored, including malformed data:

| Table | Field | What it stores |
|-------|-------|----------------|
| `clients` | `metadata` | Flexible metadata object |
| `companies` | `metadata` | Custom HubSpot properties |
| `projects` | `metadata` | Flexible metadata object |
| `contacts` | `metadata` | Custom HubSpot properties |
| `deals` | `metadata` | Custom properties from HubSpot |
| `activities` | `metadata` | Custom properties |
| `dealActivities` | `metadata` | Custom properties |
| `documents` | `extractedData` | Extracted document data |
| `internalDocuments` | `extractedData` | Extracted data |
| `scenarios` | `data` | Handsontable-compatible data |
| `scenarioResults` | `inputs`, `outputs`, `allValues` | Cell value snapshots |
| `modelRuns` | `inputs`, `outputs`, `billOfMaterials` | Full sheet data |
| `notes` | `content` | Rich text content (JSON) |
| `noteTemplates` | `template` | Template layout definition |
| `fileUploadQueue` | `analysisResult` | Analysis result object |
| `bulkUploadItems` | `extractedData`, `extractedIntelligence` | Extraction results |
| `documentExtractions` | `extractedData` | Extraction JSON |
| `knowledgeBankEntries` | `metadata` | Entry-specific data |
| `knowledgeItems` | `value` | The actual data value |
| `enrichmentSuggestions` | `value` | Flexible suggestion value |
| `clientIntelligence` | `customFields`, `fieldSources` | Custom/legacy data |
| `projectIntelligence` | `customFields`, `fieldSources` | Custom/legacy data |
| `planningApplications` | `rawPayload` | Raw API response |
| `propertyTitles` | `rawPayload` | Raw API response |
| `chatActions` | `actionData`, `result` | Action parameters/results |
| `chatMessages` | `metadata` | Token usage etc. |
| `reminders` | `llmContext` | LLM-generated context |
| `events` | `metadata` | Flexible metadata |
| `contextCache` | (nested objects) | Various counts |

**Total: 30+ fields with `v.any()`**

While some of these are reasonable (like `rawPayload` for external API data), fields like `documents.extractedData`, `scenarios.data`, and `modelRuns.inputs` store critical business data with no schema validation.

---

## HIGH: Missing Required Fields

Fields that are `v.optional()` but should likely be required based on business logic:

| Table | Field | Why it should be required |
|-------|-------|--------------------------|
| `users` | `clerkId` | Comment says "optional for backward compatibility" - all users need auth |
| `chatSessions` | `userId` | Comment says "temporarily optional - will be required after cleanup" |
| `documents` | `scope` | Every document should have a scope (client/internal/personal) |
| `documents` | `status` | Every document should have a processing status |
| `clients` | `status` | Every client should have a status |
| `clients` | `type` | Every client should have a type |
| `projects` | `status` | Every project should have a status |
| `projects` | `projectShortcode` | Used for document naming - should be required |
| `bulkUploadItems` | `summary`, `category` | These are populated during processing but should be non-null after analysis |

---

## MEDIUM: Performance - Full Table Scans

These queries collect ALL records from a table and filter in memory. As data grows, these will become slow:

| Query | Tables Scanned | Issue |
|-------|---------------|-------|
| `search.globalSearch` | `clients`, `companies`, `deals`, `documents`, `contacts`, `knowledgeBankEntries` | **6 full table scans per search** |
| `clients.getStats` | `clients`, `projects`, `documents` | 3 full scans |
| `documents.getFolderStats` | `documents`, `clients`, `projects` | 3 full scans |
| `projects.list` | `projects` | Full scan - can't index `clientRoles` array |
| `projects.getByClient` | `projects` | Full scan with in-memory filter on array field |
| `events.list` | `events` | Full scan, no date+user composite index |
| `events.getByDateRange` | `events` | Full scan |
| `events.getByUser` | `events` | Full scan |
| `events.getUpcoming` | `events` | Full scan |
| `events.getNextEvent` | `events` | Full scan |
| `tasks.getByUser` | `tasks` | Full scan with heavy filtering |
| `tasks.getMetrics` | `tasks` | Full scan |
| `documents.search` | `documents` | Full scan with client-side text matching |
| `documents.getUniqueFileTypes` | `documents` | Full scan to collect distinct values |
| `documents.getUniqueCategories` | `documents` | Full scan to collect distinct values |
| `contacts.getAll` | `contacts` | Full scan |
| `companies.getAll` | `companies` | Full scan |
| `deals.getAllDeals` | `deals` | Full scan |
| `leads.getAllLeads` | `leads` | Full scan |

**Most critical:** `globalSearch` does 6 full table scans every time a user types a search query. Should use Convex's search index feature.

---

## MEDIUM: Legacy / Deprecated Tables Still in Schema

| Table | Status | Replacement | Action Needed |
|-------|--------|-------------|---------------|
| `dealActivities` | "Legacy - kept for backward compatibility" | `activities` | Migrate data, remove table |
| `internalDocumentFolders` | "Legacy/deprecated" | `internalFolders` | Migrate data, remove table |
| `clientIntelligence.fieldSources` | "Legacy - use evidenceTrail instead" | `evidenceTrail` field | Clean up field |
| `projectIntelligence.fieldSources` | "Legacy - use evidenceTrail instead" | `evidenceTrail` field | Clean up field |
| `contacts.company` | "Legacy field" | `linkedCompanyIds` | Migrate data, remove field |

---

## MEDIUM: Orphaned Tables (Defined but Unused)

The consistency check found tables defined in the schema with no corresponding queries or mutations:

| Table | Lines in Schema | Status |
|-------|----------------|--------|
| `dealActivities` | 525-553 | Defined but completely unused - legacy table with no code referencing it |
| `apiRateLimit` | 1431-1440 | Defined but completely unused - planned rate limiting never implemented |
| `activities` | 485-520 | Only referenced in a placeholder file (`hubspotSync/activities.ts` exports `null`) |

These tables consume schema space and could cause confusion. They should either be implemented or removed.

---

## MEDIUM: Type Inconsistencies (string vs v.id)

Several fields store user IDs as plain strings instead of typed `v.id("users")` references. This bypasses Convex's referential integrity checking:

| Table | Field | Current Type | Should Be |
|-------|-------|-------------|-----------|
| `fileUploadQueue` | `userId` | `v.optional(v.string())` | `v.optional(v.id("users"))` |
| `scenarios` | `createdBy` | `v.optional(v.string())` | `v.optional(v.id("users"))` |
| `fileTypeDefinitions` | `createdBy` | `v.string()` | `v.id("users")` |
| `categorySettings` | `createdBy` | `v.string()` | `v.id("users")` |
| `modelRuns` | `runBy` | `v.optional(v.string())` | `v.optional(v.id("users"))` |
| `clientIntelligence` | `lastUpdatedBy` | `v.optional(v.string())` | `v.optional(v.id("users"))` |
| `projectIntelligence` | `lastUpdatedBy` | `v.optional(v.string())` | `v.optional(v.id("users"))` |
| `knowledgeItems` | `addedBy` | `v.optional(v.string())` | `v.optional(v.id("users"))` |

Using `v.string()` for user IDs means Convex can't validate the reference exists, and tooling won't show the relationship.

---

## LOW: Index Coverage Gaps

| Table | Missing Index | Currently | Impact |
|-------|--------------|-----------|--------|
| `projects` | Can't index `clientRoles` array | Full scan + filter | Every project-by-client query is O(n) |
| `events` | `createdBy` + `startTime` composite | Separate indexes | Date-range queries per user are slow |
| `tasks` | `createdBy` + `status` composite | Separate indexes | User task list filtering is slow |
| `companies` | `hubspotLifecycleStage` index exists but `getByLifecycleStage()` uses `.filter()` | Ignoring available index | Wasteful |
| `documents` | No search index for text search | Full scan in `search()` | Should use Convex search index |

---

## Recommendations - Prioritized Action Plan

### Priority 1: Protect Against Data Loss (CRITICAL)

**1a. Implement soft-delete on all core business tables**

Add these fields to `clients`, `projects`, `documents`, `contacts`, `knowledgeBankEntries`, `scenarios`, and `modelRuns`:

```typescript
isDeleted: v.optional(v.boolean()),  // follows codifiedExtractions pattern
deletedAt: v.optional(v.string()),
deletedBy: v.optional(v.id("users")),
deletedReason: v.optional(v.string()),
```

Change all `remove()` mutations to set `isDeleted: true` instead of calling `ctx.db.delete()`. Update all queries to filter out deleted records.

**1b. Add audit trail table**

Create an `auditLog` table:

```typescript
auditLog: defineTable({
  tableName: v.string(),         // "clients", "documents", etc.
  recordId: v.string(),          // ID of affected record
  action: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),
  userId: v.optional(v.id("users")),
  changes: v.optional(v.any()),  // Before/after values
  timestamp: v.string(),
})
  .index("by_table_record", ["tableName", "recordId"])
  .index("by_timestamp", ["timestamp"])
  .index("by_user", ["userId"])
```

**1c. Remove or gate the destructive migration scripts**

`clearLegacyData.ts` can wipe the entire database. Either:
- Delete these files entirely, or
- Add an environment check that prevents running in production
- Add a confirmation mechanism

### Priority 2: Remove Duplicate Tables (HIGH)

**2a. Migrate `dealActivities` data to `activities` table and remove the legacy table.**

**2b. Migrate `internalDocumentFolders` data to `internalFolders` and remove the legacy table.**

**2c. Clarify the intelligence storage strategy.** Currently data can be in:
- `knowledgeBankEntries` (legacy)
- `knowledgeItems` (new normalized)
- `clientIntelligence` / `projectIntelligence` (denormalized summary)

Decide which is the source of truth and ensure the others are derived/synced.

### Priority 3: Fix Authorization (HIGH)

**3a. Add authentication checks to all queries that expose sensitive data.** At minimum:
- Verify `ctx.auth.getUserIdentity()` exists
- For multi-tenant scenarios, verify the user has access to the requested client/project

**3b. Add authorization checks to `documents.update()`, `clients.update()`, and `projects.update()` mutations.**

### Priority 4: Fix Denormalization Sync (MEDIUM)

For every denormalized field (clientName, projectName, etc.), either:
- Add update triggers that cascade name changes, or
- Remove the denormalized field and join at query time (Convex supports this efficiently with ID lookups)

### Priority 5: Tighten Schema Validation (MEDIUM)

Replace critical `v.any()` fields with proper validators:
- `documents.extractedData` - define the expected structure
- `scenarios.data` - define the Handsontable format
- `modelRuns.inputs/outputs` - define the sheet structure
- `notes.content` - define the rich text JSON format

### Priority 6: Fix Performance Issues (MEDIUM)

- Replace `globalSearch` with Convex search indexes
- Add composite indexes for `events` (user + date range)
- Consider denormalizing `projects.clientRoles` into a junction table for efficient client->project queries
- Replace `companies.getByLifecycleStage()` `.filter()` with proper index query

### Priority 7: Fix Type Inconsistencies (MEDIUM)

- Change `fileUploadQueue.userId`, `scenarios.createdBy`, `fileTypeDefinitions.createdBy`, `categorySettings.createdBy`, `modelRuns.runBy` from `v.string()` to `v.id("users")`
- Change `clientIntelligence.lastUpdatedBy`, `projectIntelligence.lastUpdatedBy`, `knowledgeItems.addedBy` from `v.string()` to `v.id("users")`
- Remove orphaned tables (`dealActivities`, `apiRateLimit`) or implement their features

### Priority 8: Clean Up Legacy Fields (LOW)

- Make `users.clerkId` required (migrate existing records)
- Make `chatSessions.userId` required (run the orphan cleanup)
- Remove `contacts.company` legacy field
- Remove `clientIntelligence.fieldSources` and `projectIntelligence.fieldSources`

---

## Appendix: Table Count Summary

| Domain | Tables | Core Data Risk |
|--------|--------|---------------|
| Core Business | 6 | HIGH |
| CRM / Prospecting | 10 | MEDIUM |
| Document Management | 8 | HIGH |
| Intelligence | 7 | HIGH |
| Data Extraction | 8 | HIGH |
| Knowledge Library | 4 | MEDIUM |
| Financial Modeling | 8 | HIGH |
| File Processing | 3 | LOW |
| AI/Filing Feedback | 4 | LOW |
| Communication | 6 | LOW |
| Task & Calendar | 4 | LOW |
| Companies House | 6 | LOW |
| External Data | 3 | LOW |
| Config & System | 10 | LOW |
| **Total** | **65+** | |
