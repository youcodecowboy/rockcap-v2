# Review: Mobile Clients & Projects Design

**Reviewed spec:** `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md`

## Findings

### High: Intelligence tab is wired to the wrong data model

The spec points the mobile Intelligence tab at `api.documents.getDocumentIntelligence`, but that query is document-scoped. The existing client/project intelligence surfaces are built on `knowledgeLibrary` knowledge items, not document extractions.

Relevant references:
- Spec: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:150`
- Spec: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:156`
- Query: `convex/documents.ts:2161`
- Existing client intelligence: `src/components/IntelligenceTab.tsx:1062`
- Existing project intelligence: `src/components/IntelligenceTab.tsx:1608`
- Knowledge items queries: `convex/knowledgeLibrary.ts:1198`

Impact:
- A literal implementation would either require a new client/project aggregation query, or it would omit manual and canonical intelligence entries already used elsewhere in the app.

Recommendation:
- Change the spec to use `api.knowledgeLibrary.getKnowledgeItemsByClient` and `api.knowledgeLibrary.getKnowledgeItemsByProject`.
- If the mobile UI truly wants extraction-only data, call that out explicitly as a product decision, because it would diverge from desktop behavior.

### High: Notes tab uses the wrong backend entity and creation flow

The spec says to model client/project notes after the document viewer notes tab. That pattern is backed by `documentNotes`, but client/project notes in the app use the `notes` table, not `documentNotes`.

Relevant references:
- Spec: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:158`
- Spec: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:165`
- Mobile document notes UI: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/NotesTab.tsx:28`
- Document notes query: `convex/documentNotes.ts:5`
- Filed notes query: `convex/notes.ts:25`
- Filed notes create mutation: `convex/notes.ts:5`
- Existing client notes tab: `src/app/(desktop)/clients/[clientId]/components/ClientNotesTab.tsx:46`

Impact:
- The suggested inline textarea submit flow does not match the persisted data model for client/project notes.
- `notes.create` requires `title` and rich-text `content`, so a document-notes style input cannot be reused directly.

Recommendation:
- Rewrite the spec to target `api.notes.getByClient`, `api.notes.getByProject`, and `api.notes.create`.
- Decide whether mobile should support a lightweight plain-text note composer that writes a minimal rich-text document, or a reduced version of the existing notes editor.

### High: Checklist scope and statuses do not match the current contract

The client checklist section names `api.knowledgeLibrary.getChecklistByClient`, but that query includes project-level items too. The desktop client experience uses `getClientLevelChecklist` for client-only items. The status model is also different from the spec.

Relevant references:
- Spec: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:175`
- Spec: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:179`
- Spec: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:182`
- `getChecklistByClient`: `convex/knowledgeLibrary.ts:42`
- `getClientLevelChecklist`: `convex/knowledgeLibrary.ts:127`
- Desktop client checklist usage: `src/app/(desktop)/clients/[clientId]/components/ClientKnowledgeTab.tsx:105`
- Checklist item schema statuses: `convex/schema.ts:2341`
- Checklist mutation: `convex/knowledgeLibrary.ts:848`

Impact:
- Client checklist would blur client-level and project-level scope.
- The proposed `complete / incomplete / N/A` toggles do not match persisted values, which are `missing / pending_review / fulfilled`.

Recommendation:
- Use `api.knowledgeLibrary.getClientLevelChecklist` for the client tab.
- Keep `api.knowledgeLibrary.getChecklistByProject` for project tabs.
- Update the spec copy and UI controls to align with `missing`, `pending_review`, and `fulfilled`, unless backend changes are intentionally planned.

### Medium: “Project tabs are identical, just swap `projectId` for `clientId`” is inaccurate for docs

The project docs flow is not a simple query swap. The existing mobile docs implementation resolves folder structure by `clientId`, then filters/project-scopes the contents using `projectId`.

Relevant references:
- Spec: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:235`
- Spec: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:237`
- Folder structure query: `convex/folderStructure.ts:202`
- Folder contents query: `convex/documents.ts:1604`
- Existing project folder list: `src/app/(mobile)/m-docs/components/ProjectFolderList.tsx:19`
- Existing mobile folder contents: `src/app/(mobile)/m-docs/components/FolderContents.tsx:71`

Impact:
- A straightforward “replace `clientId` with `projectId`” implementation will not match the existing folder API shapes.

Recommendation:
- Amend the spec to describe project docs as a reuse of the current `m-docs` pattern:
  - folder topology via `folderStructure.getAllFoldersForClient(clientId)`
  - folder contents via `documents.getByFolder({ clientId, projectId, level: 'project', ... })`

### Medium: Task counts and lists are user-scoped, but the spec reads like entity-wide activity

The task queries named in the spec only return tasks created by or assigned to the current user. The document describes them as client/project task lists and summary counts without clarifying whether this is personal or shared-team activity.

Relevant references:
- Spec purpose: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:9`
- Client overview queries: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:119`
- Client tasks query: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:167`
- `tasks.getByClient`: `convex/tasks.ts:476`
- `tasks.getByProject`: `convex/tasks.ts:510`
- User filtering in client tasks: `convex/tasks.ts:500`
- User filtering in project tasks: `convex/tasks.ts:534`

Impact:
- Mobile may under-report task activity relative to what a user expects from a client/project “hub”.

Recommendation:
- Clarify the product decision in the spec:
  - either this area shows “my tasks for this client/project”
  - or new team-wide queries are needed

### Medium: Reusing the mobile docs components would expose actions the spec does not define

The spec says doc tabs should reuse `FolderContents`, `FileRow`, and `MoveFileSheet`. Those components currently expose move, duplicate, and delete affordances.

Relevant references:
- Spec reuse table: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:267`
- File action menu: `src/app/(mobile)/m-docs/components/shared/FileRow.tsx:47`
- Folder contents wiring: `src/app/(mobile)/m-docs/components/FolderContents.tsx:54`
- Move sheet: `src/app/(mobile)/m-docs/components/MoveFileSheet.tsx:25`

Impact:
- A strict reuse implementation will ship document actions that are currently absent from the mobile clients/projects spec.
- That is especially risky because the spec frames mobile as a quick-access information hub, not a full document management surface.

Recommendation:
- Either explicitly include those actions in scope, or specify a constrained reuse mode for doc rows that disables move/duplicate/delete.

## Open Questions

### Nav state is underspecified for folder and viewer screens

The spec says `/m-clients` uses a push/pop state machine like `DocsContent`, but the declared `NavScreen` union only includes `list`, `client`, and `project`. The docs flow in the same spec requires folder and viewer states too.

Relevant references:
- Spec nav union: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:15`
- Spec flow: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:24`
- Existing mobile docs nav union: `src/app/(mobile)/m-docs/components/DocsContent.tsx:11`

Question:
- Should `ClientsContent` own additional screens such as `folder` and `viewer`, or should the docs tabs embed a nested navigator?

### Fixed `/m-clients` routing prevents direct entry unless state handoff is defined

The spec keeps the URL fixed at `/m-clients`, but the mobile dashboard currently links all recent clients and projects there without params. There is no existing tab/state handoff pattern for opening a specific client or project in the way `m-docs` can open a specific document.

Relevant references:
- Spec fixed URL statement: `docs/superpowers/specs/2026-04-09-mobile-clients-projects-design.md:34`
- Mobile dashboard recent project link: `src/app/(mobile)/m-dashboard/components/RecentsSection.tsx:133`
- Mobile dashboard recent client link: `src/app/(mobile)/m-dashboard/components/RecentsSection.tsx:158`
- Tab params contract: `src/contexts/TabContext.tsx:5`
- Existing mobile tab param usage for docs: `src/app/(mobile)/m-docs/components/DocsContent.tsx:24`

Question:
- Does mobile need a way to open `/m-clients` directly into a specific client or project from recents, notifications, or future deep links?

## Summary

The main issue is not visual design. It is contract mismatch with the current backend and shared UI primitives. Before implementation, the spec should be revised so that:

- intelligence uses `knowledgeLibrary`, not document intelligence
- notes use `notes`, not `documentNotes`
- client checklist uses `getClientLevelChecklist`
- checklist statuses match the existing schema
- task scope is explicitly defined
- doc component reuse is either constrained or expanded in scope on purpose
