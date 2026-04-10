# Review: Mobile Upload Experience Design

**Reviewed spec:** `docs/superpowers/specs/2026-04-10-mobile-upload-design.md`

## Findings

### High: The specified direct-upload path cannot persist the folder context

The spec says uploads entered from `m-docs` pass client/project/folder context into `/m-upload`, then save via `directUpload.uploadDocumentDirect()` with no backend changes. That mutation currently has no `folderId`, `folderType`, or `scope` arguments, and its insert does not write the document filing fields used by the docs library. The selected folder would be shown during review but lost when the document is saved.

Relevant references:
- Spec folder-context entry point: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:16`
- Spec context banner params: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:85`
- Spec filing data mapping: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:250`
- Spec save path: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:297`
- Spec existing-APIs claim: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:401`
- Spec no-backend-change boundary: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:414`
- `directUpload.uploadDocumentDirect` args omit folder fields: `convex/directUpload.ts:75`
- `directUpload.uploadDocumentDirect` insert omits folder fields: `convex/directUpload.ts:131`
- Document schema folder fields: `convex/schema.ts:207`
- `documents.create` supports folder fields: `convex/documents.ts:351`
- `documents.create` persists folder fields: `convex/documents.ts:462`

Impact:
- Uploading from a folder can create a document that does not appear in that folder.
- Review-time filing edits cannot be saved through the API the spec names.

Recommendation:
- Either change the spec to use `api.documents.create`, which already accepts `folderId` and `folderType`, or explicitly add backend work to extend `directUpload.uploadDocumentDirect`.
- If direct upload remains the chosen mutation, add the exact payload fields for `folderId`, `folderType`, `scope`, and `isBaseDocument`.

### High: The folder query-param contract uses the wrong identifier

The spec passes `folderId` from `FolderContents.tsx`, but that component separates the folder record ID from the folder key used for document filing. The docs queries filter documents by `folderTypeKey` stored as `documents.folderId`, not by the Convex `clientFolders` / `projectFolders` record ID. Passing the record ID as `folderId` would create saved documents that folder queries cannot find.

Relevant references:
- Spec query params: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:85`
- Spec router example: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:389`
- Current folder props: `src/app/(mobile)/m-docs/components/FolderContents.tsx:29`
- Current folder props: `src/app/(mobile)/m-docs/components/FolderContents.tsx:30`
- Document schema stores folder key as a string: `convex/schema.ts:208`
- Folder query accepts `folderType`: `convex/documents.ts:1606`
- Project folder filtering compares `doc.folderId` to `args.folderType`: `convex/documents.ts:1633`
- Client folder filtering compares `doc.folderId` to `args.folderType`: `convex/documents.ts:1656`

Impact:
- The implementation can appear to save the correct folder while making uploaded documents invisible in `FolderContents`.
- Client-level and project-level folder context can be confused because the spec does not pass `folderLevel` or `folderType`.

Recommendation:
- Rename the query param to something like `folderTypeKey`, and pass `folderLevel=client|project`.
- Only use `folderRecordId` if the UI needs to highlight a folder row; do not store it as `documents.folderId`.

### High: The background-processing persistence model is not valid for route changes

The spec says upload state can live in a React ref or page context and that state survives navigating away and returning to `/m-upload`. A `useRef` inside the `/m-upload` page will not survive unmount when the user navigates through the StickyFooter or drawer. The mobile layout keeps providers mounted, but route children unmount and remount.

Relevant references:
- Spec processing back behavior: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:34`
- Spec background persistence: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:184`
- Spec re-entry promise: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:186`
- Spec `useRef` implementation claim: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:187`
- Mobile layout renders route children inside shell: `src/app/(mobile)/layout.tsx:27`
- Mobile shell route child slot: `src/components/mobile/MobileShell.tsx:28`
- StickyFooter navigation uses route links: `src/components/mobile/StickyFooter.tsx:40`
- StickyFooter navigation uses route links: `src/components/mobile/StickyFooter.tsx:76`
- Existing queue hook has persisted Convex job state: `src/lib/useFileQueue.ts:30`
- Existing queue hook has pending job query: `src/lib/useFileQueue.ts:35`

Impact:
- A user can leave the upload page, return, and see a fresh picker rather than active progress.
- The "processing continues in background" copy is misleading unless the upload process is owned outside the page component.

Recommendation:
- Put upload state in a provider above the route children, or use the existing `fileUploadQueue` / `useFileQueue` model.
- If the intent is only to continue while the component remains mounted, remove the re-entry and pending-indicator guarantees from the spec.

### Medium: The mobile completion navigation is not supported by the current `m-docs` route contract

The spec says completion rows open the document in the mobile docs viewer, and "Done" can navigate directly to the destination project folder. Current `m-docs` state is local component state. It supports opening a specific document only through active tab params, and it does not read URL/query params for a client/project/folder path.

Relevant references:
- Spec completion row behavior: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:335`
- Spec folder-level Done behavior: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:338`
- Current local nav stack: `src/app/(mobile)/m-docs/components/DocsContent.tsx:18`
- Current tab param lookup only reads `documentId`: `src/app/(mobile)/m-docs/components/DocsContent.tsx:23`
- Current viewer open condition: `src/app/(mobile)/m-docs/components/DocsContent.tsx:61`
- Current folder screen is pushed only from local state: `src/app/(mobile)/m-docs/components/DocsContent.tsx:112`

Impact:
- `router.push('/m-docs')` cannot land in a specific project folder with the current docs navigator.
- Document-row navigation needs a `TabContext.openTab({ type: 'docs', route: '/m-docs', params: { documentId } })` pattern, not just a route push.

Recommendation:
- Specify the exact handoff contract for document and folder navigation.
- If folder deep entry is required, extend `DocsContent` to consume tab params or search params for `clientId`, `projectId`, `folderTypeKey`, and `folderLevel`.

### Medium: The selected "existing pipeline" is materially lighter than the current desktop bulk pipeline

The spec positions `/api/analyze-file` plus `directUpload.uploadDocumentDirect()` as the existing backend pipeline. It is existing, but it is not the same as the current bulk/V4 upload pipeline. The mobile path would save only the direct-upload fields and extracted data. It would not save `documentAnalysis`, `classificationReasoning`, `textContent`, or extracted intelligence items that the mobile docs viewer can display.

Relevant references:
- Spec pipeline statement: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:9`
- Spec key-details mapping: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:253`
- Spec no intelligence editing boundary: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:421`
- `/api/analyze-file` response shape: `src/app/api/analyze-file/route.ts:224`
- Direct upload args: `convex/directUpload.ts:85`
- Direct upload insert: `convex/directUpload.ts:131`
- Bulk pipeline maps richer V4 fields: `src/lib/bulkQueueProcessor.ts:583`
- Bulk filing persists `documentAnalysis`: `convex/bulkUpload.ts:2121`
- Bulk filing persists `textContent`: `convex/bulkUpload.ts:2125`
- Mobile Summary tab uses `documentAnalysis` when available: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/SummaryTab.tsx:38`
- Mobile Classification tab uses document characteristics: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/ClassificationTab.tsx:68`
- Mobile Intelligence tab reads `knowledgeItems`: `src/app/(mobile)/m-docs/components/DocumentViewerTabs/IntelligenceTab.tsx:18`

Impact:
- Newly uploaded mobile documents may show less useful Summary, Classification, and Intelligence tabs than desktop-uploaded documents.
- The spec does not make clear whether this reduction is intentional for a lightweight mobile flow or an accidental pipeline mismatch.

Recommendation:
- State explicitly that mobile upload uses a reduced analysis/save path, or switch the spec to the V4 analysis and filing path used by desktop bulk upload.
- If the direct path remains, define which viewer tabs are expected to be empty or partial after mobile upload.

## Open Questions

### How should the StickyFooter fit a fifth nav item?

The spec adds Upload to the StickyFooter after Docs, but the current footer is four nav links split around a central chat button. Adding a fifth item changes that layout and crowding behavior.

Relevant references:
- Spec footer change: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:368`
- Spec upload position: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:376`
- Current footer nav items: `src/components/mobile/StickyFooter.tsx:10`
- Current split around chat button: `src/components/mobile/StickyFooter.tsx:36`
- Current split around chat button: `src/components/mobile/StickyFooter.tsx:71`

### Should mobile upload be a route, a tab, or both?

The spec describes `/m-upload` as a route, while the mobile shell also has a tab manager with a fixed tab type union. This can be handled as `type: 'page'`, but the intended interaction with tab chips is not specified.

Relevant references:
- Spec route: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:22`
- Spec StickyFooter integration: `docs/superpowers/specs/2026-04-10-mobile-upload-design.md:368`
- Tab type union: `src/contexts/TabContext.tsx:7`
- TabManager route push: `src/components/mobile/TabManager.tsx:26`

## Summary

The spec is directionally clear, but the implementation contract needs tightening before build:

- the named direct-upload mutation cannot save folder filing data today
- the folder param should be `folderTypeKey` plus `folderLevel`, not an ambiguous `folderId`
- page-local `useRef` state will not support re-entry after route changes
- direct navigation into `m-docs` folder/viewer states needs an explicit TabContext or URL-param contract
- the direct path is lighter than the desktop V4 bulk pipeline, so reduced post-upload metadata should be an explicit product choice
