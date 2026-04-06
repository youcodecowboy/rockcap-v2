# Mobile Document Library Review For Claude

Date: 2026-04-06

Reviewed docs:
- `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md`
- `docs/superpowers/plans/2026-04-06-mobile-document-library.md`

## Summary

The overall direction is good, and most of the referenced Convex queries do exist. The main risks are around folder identity/navigation, missing spec requirements in the flat file views, and a few state-handling gaps that will likely cause incorrect behavior on real data.

## High-Priority Findings

### 1. Folder identity model is inconsistent and will break nested folder navigation

The spec defines subfolders by exact `parentFolderId` matches:
- `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:123`

But the plan currently:
- pushes `folder.folderType` into nav state instead of the folder record id
- `docs/superpowers/plans/2026-04-06-mobile-document-library.md:553`
- `docs/superpowers/plans/2026-04-06-mobile-document-library.md:691`

And then resolves child folders using:
- `startsWith(folderId)` for client folders
- all folders with any `parentFolderId` for project folders
- `docs/superpowers/plans/2026-04-06-mobile-document-library.md:788`
- `docs/superpowers/plans/2026-04-06-mobile-document-library.md:791`

That does not match the actual schema:
- `convex/schema.ts:1063`
- `convex/schema.ts:1078`

And it is especially risky for custom nested project folders, where `folderType` is generated independently from the parent and is not a reliable hierarchy key:
- `convex/projects.ts:668`

Also, the backend folder document query expects a folder type/key, not a folder record id:
- `convex/documents.ts:1604`

Recommendation:
- carry both `folderRecordId` and `folderType` in nav state, or pass the full folder object
- use `parentFolderId === currentFolderRecordId` to resolve children
- keep using `folderType` only when querying documents

### 2. Internal and Personal scopes are missing search in the implementation plan

The spec explicitly requires search + sort for Internal and Personal:
- `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:29`
- `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:30`
- `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:50`

But the plan only includes sort controls for those tabs:
- `docs/superpowers/plans/2026-04-06-mobile-document-library.md:399`
- `docs/superpowers/plans/2026-04-06-mobile-document-library.md:427`

Recommendation:
- add the same search input pattern used in Clients scope
- filter Internal/Personal file lists by `displayName || fileName`

### 3. The client-level "Unfiled" pseudo-folder is specified but missing from the plan

The spec explicitly says to show an `Unfiled` pseudo-folder at client level:
- `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:81`

But the plan only renders real top-level folders:
- `docs/superpowers/plans/2026-04-06-mobile-document-library.md:542`

The backend already supports this path:
- `documents.getByFolder(... folderType: "unfiled" ...)`
- `convex/documents.ts:1643`

And `getFolderCounts` already returns `clientTotal`, which can help derive the count:
- `convex/documents.ts:1834`

Recommendation:
- add an `Unfiled` row under Client Documents
- define how its count is computed
- wire it through the same FolderContents screen using `folderType: "unfiled"`

### 4. Loading states and empty states are conflated in several planned components

`useQuery` returns `undefined` while loading, but the plan often treats falsey data as empty:
- client list logic
  - `docs/superpowers/plans/2026-04-06-mobile-document-library.md:302`
- internal docs empty state
  - `docs/superpowers/plans/2026-04-06-mobile-document-library.md:407`
- client folders empty state
  - `docs/superpowers/plans/2026-04-06-mobile-document-library.md:542`
- project folders empty state
  - `docs/superpowers/plans/2026-04-06-mobile-document-library.md:680`
- folder contents empty state
  - `docs/superpowers/plans/2026-04-06-mobile-document-library.md:846`

The same issue exists in the viewer:
- document loading shell
  - `docs/superpowers/plans/2026-04-06-mobile-document-library.md:950`
- preview waiting on `fileUrl`
  - `docs/superpowers/plans/2026-04-06-mobile-document-library.md:1083`

Recommendation:
- explicitly separate `loading`, `empty`, and `not found/unavailable`
- do not show "No X" until the query has resolved
- handle `documents.get(id)` returning `null` separately from loading

## Medium-Priority Gaps

### 5. The screen-count language is internally inconsistent

The docs describe a 4-screen stack:
- `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:5`

But both the spec and plan add `ProjectFolderList` as an intermediate state:
- `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:92`
- `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:261`
- `docs/superpowers/plans/2026-04-06-mobile-document-library.md:632`

Recommendation:
- clarify whether this is "4 primary screens plus 1 intermediate state" or just "5 navigation states"

### 6. `lastOpenedAt` is shown in Details, but the plan never marks documents as opened

The spec includes `lastOpenedAt` in Details:
- `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:224`

The backend mutation already exists:
- `convex/documents.ts:1425`

But the plan never calls it from the mobile viewer.

Recommendation:
- call `documents.markAsOpened` when the viewer opens, or clarify that mobile should remain read-only without updating access metadata

### 7. IntelligenceTab omits the confidence badge described in the spec

The spec says each intelligence item should show confidence if available:
- `docs/superpowers/specs/2026-04-06-mobile-document-library-design.md:233`

The planned implementation renders label and value only:
- `docs/superpowers/plans/2026-04-06-mobile-document-library.md:1491`

Recommendation:
- add a small confidence badge when `normalizationConfidence` or equivalent exists on the item

## Suggested Plan Adjustments Before Implementation

1. Fix nav state so folder screens carry both folder record identity and folder type.
2. Add search to Internal and Personal tabs.
3. Add the client-level `Unfiled` pseudo-folder flow.
4. Add explicit loading vs empty-state handling in every screen.
5. Decide whether `markAsOpened` should be called from mobile viewer open.
6. Clarify screen-count wording so the spec and plan describe the same navigation model.

## Bottom Line

The plan is close, but I would not implement it as-is. The folder-state issue is the main correctness problem. After that, the biggest spec compliance gaps are missing search for Internal/Personal, missing `Unfiled`, and weak loading-state handling.
