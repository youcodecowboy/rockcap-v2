# Atomic Tools Catalogue

The conversational-mode surface lives in `model-testing-app/src/lib/tools/`. The registry is `registry.ts`, the dispatch table is `executor.ts`, the type system is `types.ts`. Tools are defined per-domain in `domains/*.tools.ts`.

## Headline counts

| Metric | Count |
|---|---|
| Total atomic tools | 150 |
| Domain files | 18 |
| `action: "read"` | 86 |
| `action: "write"` | 54 |
| `action: "delete"` | 10 |
| `requiresConfirmation: true` | 64 |
| `requiresConfirmation: false` | 86 |
| Tools per domain (mean) | 8.3 |

The brief estimates "roughly 75 atomic tools". The catalogue is twice that. Step 2 of the brief (tool description audit) is correspondingly larger work.

## Type system

From `src/lib/tools/types.ts`:

```typescript
type ToolDomain =
  | "client" | "project" | "document" | "folder" | "checklist"
  | "task" | "note" | "contact" | "reminder" | "event"
  | "knowledgeBank" | "intelligence" | "internalDocument"
  | "fileQueue" | "meeting" | "flag" | "financial"
type ToolAction = "read" | "write" | "delete"
type ChatContextType = "global" | "client" | "project"
```

Notes:

- The `ToolDomain` union has 17 members. `analysis.tools.ts` exists but its tools declare `domain: "document"`, so the 17/18 mismatch is by design.
- The executor in `executor.ts` is a flat `Record<string, ToolHandler>` keyed on tool name. Each handler wraps `client.query(api.[path], params)` or `client.mutation(api.[path], params)` driven by the `convexMapping` field on the tool definition.
- A few handlers compose multiple Convex calls in-handler rather than dispatching once (`reclassify`, `getFinancialSummary`, `assessDealMetrics`, `compareDocumentValues`, `extractMeetingFromText` which posts to `/api/meeting-extract`).

## Context loading (progressive disclosure)

From `src/lib/tools/registry.ts`:

```typescript
const GLOBAL_WRITE_TOOLS = new Set([
  "createClient", "createProject", "createTask", "createReminder",
  "createEvent", "createNote", "createContact", "saveChatDocument",
  "createMeeting", "extractMeetingFromText", "createFlag",
]);
const CLIENT_CONTEXT_DOMAINS: ToolDomain[] = [/* 16 domains, omits fileQueue */];
const PROJECT_CONTEXT_DOMAINS: ToolDomain[] = [/* 15 domains, omits reminder, event, internalDocument */];
```

In practice, all read tools plus eleven core writes are available in any context. Client and project contexts each load roughly 105 to 115 of the 150 tools.

## Tools by domain

### analysis (3 tools)

File: `src/lib/tools/domains/analysis.tools.ts`. Note: these tools register under `domain: "document"`, not a distinct analysis domain.

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| analyzeUploadedDocument | read | no | storageId, fileName, fileType | `fileQueue.getFileUrl` (then V4 pipeline) |
| saveChatDocument | write | yes | storageId, fileName, fileSize, fileType, summary, fileTypeDetected, category, clientId | `documents.create` |
| reanalyzeDocument | read | no | documentId | `documents.get` (then V4 pipeline) |

### checklist (8 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| getChecklistByClient | read | no | clientId | `knowledgeLibrary.getChecklistByClient` |
| getChecklistByProject | read | no | projectId | `knowledgeLibrary.getChecklistByProject` |
| getChecklistSummary | read | no | clientId | `knowledgeLibrary.getChecklistSummary` |
| getMissingChecklistItems | read | no | clientId | `knowledgeLibrary.getMissingItems` |
| addChecklistItem | write | yes | clientId, name, category, priority | `knowledgeLibrary.addCustomRequirement` |
| linkDocumentToChecklist | write | yes | checklistItemId, documentId | `knowledgeLibrary.linkDocumentToRequirement` |
| unlinkDocumentFromChecklist | write | yes | checklistItemId | `knowledgeLibrary.unlinkDocument` |
| deleteChecklistItem | delete | yes | checklistItemId | `knowledgeLibrary.deleteCustomRequirement` |

### client (9 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| searchClients | read | no | (none) | `clients.list` |
| getClient | read | no | clientId | `clients.get` |
| getClientStats | read | no | clientId | `clients.getStats` |
| getRecentClients | read | no | (none) | `clients.getRecent` |
| checkClientExists | read | no | name | `clients.exists` |
| getClientFolders | read | no | clientId | `clients.getClientFolders` |
| createClient | write | yes | name | `clients.create` |
| updateClient | write | yes | clientId | `clients.update` |
| deleteClient | delete | yes | clientId | `clients.remove` |

### contact (6 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| getContacts | read | no | (none) | `contacts.getAll` |
| getContact | read | no | contactId | `contacts.get` |
| searchContactsByClient | read | no | clientId | `contacts.getByClient` |
| createContact | write | yes | name | `contacts.create` |
| updateContact | write | yes | contactId | `contacts.update` |
| deleteContact | delete | yes | contactId | `contacts.remove` |

### document (12 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| searchDocuments | read | no | (none) | `documents.list` |
| getDocument | read | no | documentId | `documents.get` |
| getDocumentsByClient | read | no | clientId | `documents.getByClient` |
| getDocumentsByProject | read | no | projectId | `documents.getByProject` |
| getDocumentNotes | read | no | documentId | `documentNotes.getByDocument` |
| getDocumentExtractions | read | no | documentId | `documentExtractions.getByDocument` |
| getDocumentUrl | read | no | storageId | `documents.getFileUrl` |
| moveDocument | write | yes | documentId, targetClientId | `documents.moveDocument` |
| updateDocumentMetadata | write | yes | documentId | `documents.update` |
| addDocumentNote | write | yes | documentId, content | `documentNotes.create` |
| deleteDocument | delete | yes | documentId | `documents.remove` |
| reclassify | read | no | documentId, focusQuery | composite handler |

### event (6 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| getEvents | read | no | (none) | `events.list` |
| getNextEvent | read | no | (none) | `events.getNextEvent` |
| getUpcomingEvents | read | no | (none) | `events.getUpcoming` |
| createEvent | write | yes | title, startTime, endTime | `events.create` |
| updateEvent | write | yes | eventId | `events.update` |
| deleteEvent | delete | yes | eventId | `events.remove` |

### fileQueue (5 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| getFileQueueJobs | read | no | (none) | `fileQueue.getJobs` |
| getFileQueueJob | read | no | jobId | `fileQueue.getJob` |
| getReviewQueue | read | no | (none) | `fileQueue.getReviewQueueWithNav` |
| fileDocument | write | yes | jobId, clientId, folderId, folderType | `fileQueue.fileDocument` |
| skipQueuedDocument | write | yes | jobId | `fileQueue.skipDocument` |

### financial (3 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| getFinancialSummary | read | no | projectId | composite (reads `knowledgeLibrary.getKnowledgeItemsByProject`) |
| assessDealMetrics | read | no | projectId | composite (reads `knowledgeLibrary.getKnowledgeItemsByProject`) |
| compareDocumentValues | read | no | projectId | composite (reads `knowledgeLibrary.getKnowledgeItemsByProject`) |

These three are the closest thing the catalogue has to RockCap-specific judgement-carrying tools. They are candidates to migrate into skills.

### flag (6 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| getFlags | read | no | entityType, entityId | `flags.getByEntity` |
| getFlagThread | read | no | flagId | `flags.getThread` |
| createFlag | write | yes | entityType, entityId, note | `flags.create` |
| replyToFlag | write | yes | flagId, content | `flags.reply` |
| resolveFlag | write | yes | flagId | `flags.resolve` |
| deleteFlag | delete | yes | flagId | `flags.remove` |

### folder (10 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| mapCategoryToFolder | read | no | category, hasProject | `folderStructure.mapCategoryToFolder` |
| getProjectSubfolders | read | no | projectId | `projects.getProjectSubfolders` |
| getDocumentsByFolder | read | no | folderType | `documents.getByFolder` |
| createClientFolder | write | yes | clientId, name | `clients.addCustomFolder` |
| renameClientFolder | write | yes | folderId, name | `clients.renameCustomFolder` |
| deleteClientFolder | delete | yes | folderId | `clients.deleteCustomFolder` |
| createProjectFolder | write | yes | projectId, name | `projects.addCustomProjectFolder` |
| renameProjectFolder | write | yes | folderId, name | `projects.renameCustomProjectFolder` |
| deleteProjectFolder | delete | yes | folderId | `projects.deleteCustomProjectFolder` |

### intelligence (11 tools, plus 2 core chat tools)

The intelligence domain is the heart of the conversational-mode surface. `queryIntelligence` and the two CORE_CHAT_TOOLS (`searchSkills`, `loadReference`) are the chat assistant's "resolution chain" preferred path: look in intelligence first, then load references, then escalate to `reclassify` only if those cannot answer.

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| getClientIntelligence | read | no | clientId | `intelligence.getClientIntelligence` |
| getProjectIntelligence | read | no | projectId | `intelligence.getProjectIntelligence` |
| searchLenders | read | no | (none) | `intelligence.searchLenders` |
| updateClientIntelligence | write | yes | clientId | `intelligence.updateClientIntelligence` |
| updateProjectIntelligence | write | yes | projectId | `intelligence.updateProjectIntelligence` |
| addClientUpdate | write | yes | clientId, update | `intelligence.addClientUpdate` |
| addProjectUpdate | write | yes | projectId, update | `intelligence.addProjectUpdate` |
| queryIntelligence | read | no | scope | `intelligence.queryIntelligence` |
| addKnowledgeItem | write | yes | fieldPath, category, label, value, valueType | `knowledgeLibrary.addKnowledgeItem` |
| searchSkills (CORE) | read | no | query | agentic-loop handler |
| loadReference (CORE) | read | no | type, entityId | agentic-loop handler |

### internalDocument (6 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| getInternalDocuments | read | no | (none) | `internalDocuments.list` |
| getInternalDocument | read | no | documentId | `internalDocuments.get` |
| getInternalFolders | read | no | (none) | `internalDocuments.getFolders` |
| getInternalDocumentsByFolder | read | no | folderId | `internalDocuments.getByFolder` |
| createInternalDocument | write | yes | fileName, fileSize, fileType, summary, category | `internalDocuments.create` |
| createInternalFolder | write | yes | name | `internalDocuments.createFolder` |

### knowledgeBank (4 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| getKnowledgeBank | read | no | (none) | `knowledgeBank.getByClient` |
| getKnowledgeItems | read | no | (none) | `knowledgeLibrary.getKnowledgeItemsByClient` |
| getKnowledgeStats | read | no | clientId | `knowledgeLibrary.getKnowledgeStats` |
| createKnowledgeBankEntry | write | yes | clientId, title, content | `knowledgeBank.createManual` |

### meeting (11 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| getMeetingsByClient | read | no | clientId | `meetings.getByClient` |
| getMeetingsByProject | read | no | projectId | `meetings.getByProject` |
| getMeeting | read | no | meetingId | `meetings.get` |
| getMeetingCount | read | no | clientId | `meetings.getCountByClient` |
| getPendingActionItems | read | no | clientId | `meetings.getPendingActionItemsCount` |
| createMeeting | write | yes | clientId, title, meetingDate, summary | `meetings.create` |
| updateMeeting | write | yes | meetingId | `meetings.update` |
| updateActionItemStatus | write | yes | meetingId, actionItemId, status | `meetings.updateActionItemStatus` |
| extractMeetingFromText | write | yes | clientId, content | `/api/meeting-extract` then `meetings.create` |
| verifyMeeting | write | yes | meetingId | `meetings.verifyMeeting` |
| deleteMeeting | delete | yes | meetingId | `meetings.deleteMeeting` |

### note (5 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| getNotes | read | no | (none) | `notes.getAll` |
| getNote | read | no | noteId | `notes.get` |
| createNote | write | yes | title, content | `notes.create` |
| updateNote | write | yes | noteId | `notes.update` |
| deleteNote | delete | yes | noteId | `notes.remove` |

### project (9 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| searchProjects | read | no | (none) | `projects.list` |
| getProject | read | no | projectId | `projects.get` |
| getProjectsByClient | read | no | clientId | `projects.getByClient` |
| getProjectFolders | read | no | projectId | `projects.getProjectFolders` |
| getProjectStats | read | no | projectId | `projects.getStats` |
| checkProjectExists | read | no | name, clientId | `projects.exists` |
| createProject | write | yes | name, clientId | `projects.create` |
| updateProject | write | yes | projectId | `projects.update` |
| deleteProject | delete | yes | projectId | `projects.remove` |

### reminder (5 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| getReminders | read | no | (none) | `reminders.getByUser` |
| getUpcomingReminders | read | no | (none) | `reminders.getUpcoming` |
| createReminder | write | yes | title, scheduledFor | `reminders.create` |
| completeReminder | write | yes | reminderId | `reminders.complete` |
| dismissReminder | write | yes | reminderId | `reminders.dismiss` |

### task (6 tools)

| Name | Action | Confirm | Required params | Convex mapping |
|---|---|---|---|---|
| getTasks | read | no | (none) | `tasks.getByUser` |
| getTask | read | no | taskId | `tasks.get` |
| createTask | write | yes | title | `tasks.create` |
| updateTask | write | yes | taskId | `tasks.update` |
| completeTask | write | yes | taskId | `tasks.complete` |
| deleteTask | delete | yes | taskId | `tasks.remove` |

## Observations for the tool-description audit (step 2 of the brief)

These are the patterns that stood out during the catalogue walk and that the description audit will want to address. They are not changes; they are inputs to the next step.

1. **Inconsistent verb choice across read-list tools.** `searchClients`, `searchProjects`, `searchDocuments`, but `getNotes`, `getContacts`, `getEvents`. From an LLM tool-selection standpoint, all of these are list-with-filter; the inconsistency adds friction. A single verb (`list*` or `search*`) would be tighter.
2. **Polymorphic versus typed variants.** `getDocumentsByClient` and `getDocumentsByProject` are typed siblings. `getEvents` is polymorphic with optional filters. Both patterns coexist and the choice is not motivated by tool semantics.
3. **No people domain.** `contacts.*` is the only person-oriented namespace. Lender BDMs, professional advisers, and developer principals all live in `contacts`. This will need restructuring once the target Person entity is introduced (see `02-convex-schema.md`).
4. **No deal namespace.** `client.*` and `project.*` are the closest analogues to the brief's Deal concept. There is no tool for, say, "advance this deal to credit submission" because that state machine does not yet exist in the schema.
5. **No lender-specific tools beyond `searchLenders`.** Lender appetite, lender history, BDM relationship tools are not present. Expected, given the schema gaps.
6. **No cadence or approval tools.** Cadence is absent; approval queuing is absent (`fileQueue` is the closest thing but is document-specific).
7. **`extractMeetingFromText` mixes intent.** It is registered as a `meeting` domain tool that POSTs to an HTTP route, then writes a meeting. Three of the 150 tools have this "compose external call plus Convex write" shape (`extractMeetingFromText`, `analyzeUploadedDocument`, `reclassify`); they sit awkwardly between the atomic-tool layer and the V4 pipeline. They are good candidates to move out of the tool catalogue and into skills, with the underlying Convex operations exposed as cleaner atomic tools.
8. **`requiresConfirmation` is set per-tool, not per-context.** Some writes are always confirmed (`updateClient`), some never are (`addClientUpdate`, despite being a write). The pattern is not documented but appears intentional for low-stakes update-in-place writes. Worth confirming during the audit.
9. **The financial tools are the start of an "advisory" tool group.** `getFinancialSummary`, `assessDealMetrics`, `compareDocumentValues` already carry domain logic (LTV norms, variance thresholds at 5%). They could be the seed of a `deal.advisory.*` namespace that doubles as judgement-carrying skill primitives.
