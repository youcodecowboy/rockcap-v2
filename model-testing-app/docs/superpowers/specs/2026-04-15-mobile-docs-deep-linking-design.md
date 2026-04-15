# Mobile Docs Deep-Link Support — Design Spec

**Date:** 2026-04-15  
**Status:** Approved  
**Scope:** Mobile document library deep linking

## Problem

The mobile document library (`/m-docs`) uses state-based navigation with no URL param support. Other parts of the app (chat overlay, flag details, notes editor, upload completion) either link to `/m-docs` with no context, or pass `?documentId=` params that are silently ignored. Users must manually navigate to the right client/project/folder every time.

## Solution

Add search param support to `DocsContent.tsx` that reads URL params on mount, resolves display names from Convex, and pre-seeds the nav stack so the user lands on the right screen with full back-navigation.

## Supported URL Patterns

| Pattern | Initial Nav Stack | Use Case |
|---------|------------------|----------|
| `/m-docs` | `[list]` | Default — no change |
| `/m-docs?clientId=X` | `[list, client]` | Link to a client's doc overview |
| `/m-docs?clientId=X&projectId=Y` | `[list, client, projectFolders]` | Link to a project's folder list |
| `/m-docs?clientId=X&projectId=Y&folder=notes` | `[list, client, projectFolders, folder]` | Link directly into a folder |
| `/m-docs?documentId=Z` | `[list, ..., viewer]` | Link to a specific document — resolves client/project/folder from document metadata, builds full nav stack |

## Resolution Flow

On mount, `DocsContent` reads search params:

1. **No params** → default behavior (`[list]`)
2. **`clientId` only** → fetch client name via `api.clients.get`, seed `[list, client]`
3. **`clientId` + `projectId`** → fetch both names, seed `[list, client, projectFolders]`
4. **`clientId` + `projectId` + `folder`** → same as above + resolve folder record ID from `getAllFoldersForClient`, seed `[list, client, projectFolders, folder]`
5. **`documentId`** → fetch document via `api.documents.get`, extract `clientId`, `projectId`, `folderId`. Build full stack as in case 3/4, append `viewer` screen. Back from viewer lands in the document's folder.

## Loading State

While resolving names/metadata, show a brief loading spinner in place of the docs content. Queries are lightweight single-record lookups.

## Components Updated

| Component | Change |
|-----------|--------|
| `src/app/(mobile)/m-docs/components/DocsContent.tsx` | Read search params, resolve context, pre-seed nav stack |
| `src/app/(mobile)/m-notes/components/NoteEditor.tsx` | Update "Docs" link to `/m-docs?clientId=X&projectId=Y&folder=notes` |
| `src/app/(mobile)/m-upload/components/CompletionSummary.tsx` | Update "View Documents" link to pass `clientId` if available |
| `src/app/(mobile)/m-inbox/components/MobileFlagDetail.tsx` | Already passes `?documentId=` — now it works (no change needed) |
| `src/components/mobile/ChatOverlay.tsx` | Already passes `?documentId=` — now it works (no change needed) |

## Out of Scope

- No URL updates as user navigates within docs (push/pop don't sync back to URL)
- No bookmark/share support — one-way deep linking from other screens only
- No desktop changes — desktop has its own folder selection mechanism
