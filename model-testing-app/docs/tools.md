# Chat Agent Tool Library

109 tools across 18 domains with progressive disclosure based on context scope.

## Client (8 tools)

| Tool | Type | Description |
|------|------|-------------|
| `searchClients` | read | Search/list clients with status or type filters |
| `getClient` | read | Get detailed client info |
| `getClientStats` | read | Project count, doc count, last activity |
| `getRecentClients` | read | Most recently created clients |
| `checkClientExists` | read | Check if client exists by name |
| `getClientFolders` | read | Client folder structure |
| `createClient` | write | Create client with auto-generated folders + checklist |
| `updateClient` | write | Update client info |
| `deleteClient` | delete | Soft-delete a client |

## Project (8 tools)

| Tool | Type | Description |
|------|------|-------------|
| `searchProjects` | read | Search/list projects with filters |
| `getProject` | read | Detailed project info |
| `getProjectsByClient` | read | All projects for a client |
| `getProjectFolders` | read | Project folder structure |
| `getProjectStats` | read | Doc count, costs, loan amount, activity |
| `checkProjectExists` | read | Check if project exists for a client |
| `createProject` | write | Create project with auto-generated folders |
| `updateProject` | write | Update project info |
| `deleteProject` | delete | Soft-delete a project |

## Document (12 tools)

| Tool | Type | Description |
|------|------|-------------|
| `searchDocuments` | read | Search with client/project/category/text filters |
| `getDocument` | read | Full doc info: summary, classification, metadata |
| `getDocumentsByClient` | read | All docs for a client |
| `getDocumentsByProject` | read | All docs for a project |
| `getDocumentNotes` | read | Notes and annotations on a document |
| `getDocumentExtractions` | read | Data extractions for a document |
| `getDocumentUrl` | read | Download URL for a document file |
| `moveDocument` | write | Move doc to different client/project |
| `updateDocumentMetadata` | write | Update category, summary, classification |
| `addDocumentNote` | write | Add note/annotation to a document |
| `reclassify` | write | Deep-analyze doc via V4 pipeline |
| `deleteDocument` | delete | Soft-delete a document |

## Folder (9 tools)

| Tool | Type | Description |
|------|------|-------------|
| `mapCategoryToFolder` | read | Get target folder for a document category |
| `getProjectSubfolders` | read | Immediate subfolders of a project |
| `getDocumentsByFolder` | read | All docs in a specific folder |
| `createClientFolder` | write | Create custom client folder |
| `renameClientFolder` | write | Rename custom client folder |
| `deleteClientFolder` | delete | Delete custom client folder |
| `createProjectFolder` | write | Create custom project folder |
| `renameProjectFolder` | write | Rename custom project folder |
| `deleteProjectFolder` | delete | Delete custom project folder |

## Checklist (8 tools)

| Tool | Type | Description |
|------|------|-------------|
| `getChecklistByClient` | read | All checklist items with fulfillment status |
| `getChecklistByProject` | read | Checklist items for a project |
| `getChecklistSummary` | read | Completion stats: fulfilled, missing, partial |
| `getMissingChecklistItems` | read | Only missing/unfulfilled items |
| `addChecklistItem` | write | Add custom checklist requirement |
| `linkDocumentToChecklist` | write | Link doc to checklist item |
| `unlinkDocumentFromChecklist` | write | Remove doc links from checklist item |
| `deleteChecklistItem` | delete | Delete custom checklist requirement |

## Task (5 tools)

| Tool | Type | Description |
|------|------|-------------|
| `getTasks` | read | Get tasks with status/client/project filters |
| `getTask` | read | Get specific task by ID |
| `createTask` | write | Create task with due date, priority, links |
| `updateTask` | write | Update task details |
| `completeTask` | write | Mark task completed |
| `deleteTask` | delete | Delete a task |

## Note (5 tools)

| Tool | Type | Description |
|------|------|-------------|
| `getNotes` | read | Notes filtered by client/project |
| `getNote` | read | Specific note by ID |
| `createNote` | write | Create note with markdown, linked to client/project |
| `updateNote` | write | Update note content/tags/links |
| `deleteNote` | delete | Delete a note |

## Contact (5 tools)

| Tool | Type | Description |
|------|------|-------------|
| `getContacts` | read | All contacts, filtered by client/project |
| `getContact` | read | Detailed contact info |
| `searchContactsByClient` | read | Contacts for a specific client |
| `createContact` | write | Create contact with name, email, phone, role |
| `updateContact` | write | Update contact info |
| `deleteContact` | delete | Delete a contact |

## Reminder (5 tools)

| Tool | Type | Description |
|------|------|-------------|
| `getReminders` | read | Reminders with status/date/client filters |
| `getUpcomingReminders` | read | Upcoming reminders for next N days |
| `createReminder` | write | Create scheduled reminder |
| `completeReminder` | write | Mark reminder completed |
| `dismissReminder` | write | Dismiss without completing |

## Event (5 tools)

| Tool | Type | Description |
|------|------|-------------|
| `getEvents` | read | Calendar events with date/client/project filters |
| `getNextEvent` | read | Next upcoming event |
| `getUpcomingEvents` | read | Upcoming events for next N days |
| `createEvent` | write | Create calendar event |
| `updateEvent` | write | Update event |
| `deleteEvent` | delete | Delete event |

## Knowledge Bank (4 tools)

| Tool | Type | Description |
|------|------|-------------|
| `getKnowledgeBank` | read | Knowledge entries for client/project |
| `getKnowledgeItems` | read | Structured items with values + confidence scores |
| `getKnowledgeStats` | read | Extraction statistics for a client |
| `createKnowledgeBankEntry` | write | Create entry (deal update, call transcript, etc.) |

## Intelligence (12 tools)

| Tool | Type | Description |
|------|------|-------------|
| `getClientIntelligence` | read | Structured intelligence profile for a client |
| `getProjectIntelligence` | read | Intelligence profile for a project |
| `searchLenders` | read | Search lender clients matching deal criteria |
| `queryIntelligence` | read | Query intelligence for specific field values |
| `searchSkills` | read | Core — search for available tool skills to load |
| `loadReference` | read | Core — load context about client/project/resources |
| `updateClientIntelligence` | write | Update client intelligence (partial updates) |
| `updateProjectIntelligence` | write | Update project intelligence (partial updates) |
| `addClientUpdate` | write | Add text update to client profile |
| `addProjectUpdate` | write | Add text update to project profile |
| `addKnowledgeItem` | write | Add structured knowledge item with confidence score |

## Internal Document (5 tools)

| Tool | Type | Description |
|------|------|-------------|
| `getInternalDocuments` | read | List company-wide internal docs |
| `getInternalDocument` | read | Specific internal doc by ID |
| `getInternalFolders` | read | All internal doc folders |
| `getInternalDocumentsByFolder` | read | Internal docs in a folder |
| `createInternalDocument` | write | Create internal document record |
| `createInternalFolder` | write | Create internal doc folder |

## File Queue (3 tools)

| Tool | Type | Description |
|------|------|-------------|
| `getFileQueueJobs` | read | Queue jobs filtered by status |
| `getFileQueueJob` | read | Specific queue job by ID |
| `getReviewQueue` | read | Docs waiting for filing confirmation |
| `fileDocument` | write | Atomic file operation: create record + link checklists + save intelligence |
| `skipQueuedDocument` | write | Skip doc without filing |

## Analysis (3 tools — V4 Pipeline)

| Tool | Type | Description |
|------|------|-------------|
| `analyzeUploadedDocument` | read | Analyze uploaded doc via V4 classification |
| `reanalyzeDocument` | read | Re-analyze already-filed document |
| `saveChatDocument` | write | File an analyzed document into the system |

## Meeting (11 tools)

| Tool | Type | Description |
|------|------|-------------|
| `getMeetingsByClient` | read | All meetings for a client |
| `getMeetingsByProject` | read | All meetings for a project |
| `getMeeting` | read | Full meeting details by ID |
| `getMeetingCount` | read | Total meetings for a client |
| `getPendingActionItems` | read | Pending action items across all meetings |
| `createMeeting` | write | Create meeting from structured data |
| `updateMeeting` | write | Update meeting details |
| `updateActionItemStatus` | write | Mark action items completed/pending/cancelled |
| `extractMeetingFromText` | write | Auto-extract structured meeting data from transcript |
| `verifyMeeting` | write | Approve auto-extracted meeting |
| `deleteMeeting` | delete | Delete a meeting |

## Flag (5 tools)

| Tool | Type | Description |
|------|------|-------------|
| `getFlags` | read | Flags on any entity type |
| `getFlagThread` | read | Thread entries for a flag |
| `createFlag` | write | Flag entity for review/attention |
| `replyToFlag` | write | Reply to flag thread |
| `resolveFlag` | write | Close a flag |
| `deleteFlag` | delete | Permanently delete flag + thread |

## Financial (3 tools)

| Tool | Type | Description |
|------|------|-------------|
| `getFinancialSummary` | read | Aggregated financial snapshot with confidence scores |
| `assessDealMetrics` | read | Deal metrics vs UK dev finance norms |
| `compareDocumentValues` | read | Cross-document financial field validation |

## Progressive Disclosure by Context

| Scope | ~Tools Loaded | What's included |
|-------|--------------|-----------------|
| **Global** | ~30 | All read tools + core write tools (create client/project/task/reminder/event/note/contact/meeting/flag) |
| **Client** | ~60 | Adds all client-scoped domains (docs, folders, checklists, intelligence, knowledge, meetings, flags, financial) |
| **Project** | ~70 | Adds project-scoped domains (file queue, analysis) — drops reminder/event |
