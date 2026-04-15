# Mobile Docs Deep-Link Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add URL search param support to the mobile document library so other screens can deep-link to a specific client, project folder, or document with full back-navigation.

**Architecture:** Read search params in `DocsContent.tsx` on mount, use Convex queries to resolve IDs to display names, then pre-seed the nav stack to the target screen. Downstream callers updated to pass contextual params.

**Tech Stack:** Next.js (useSearchParams), Convex (reactive queries), React state (navStack)

---

### Task 1: Add Deep-Link Resolution to DocsContent

**Files:**
- Modify: `src/app/(mobile)/m-docs/components/DocsContent.tsx`

This is the core change. We read search params, resolve names via Convex queries, and initialize the nav stack to the correct screen.

- [ ] **Step 1: Add imports**

At the top of `DocsContent.tsx`, add the required imports:

```typescript
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { useTabs } from '@/contexts/TabContext';
import { Loader2 } from 'lucide-react';
import DocsList from './DocsList';
import ClientDocDetail from './ClientDocDetail';
import ProjectFolderList from './ProjectFolderList';
import FolderContents from './FolderContents';
import DocumentViewer from './DocumentViewer';
```

This replaces the existing import block (lines 1-9). We add `useEffect`, `useSearchParams`, `useQuery`, `api`, `Id`, and `Loader2`.

- [ ] **Step 2: Read search params and resolve data**

After the existing `NavScreen` type export and before the component return, add param reading and resolution queries. Replace the entire component function with:

```typescript
export default function DocsContent() {
  const searchParams = useSearchParams();
  const [navStack, setNavStack] = useState<NavScreen[]>([{ screen: 'list' }]);
  const [deepLinkResolved, setDeepLinkResolved] = useState(false);
  const [dismissedTabId, setDismissedTabId] = useState<string | null>(null);
  const { tabs, activeTabId, closeTab, switchTab, updateTab } = useTabs();

  // --- Deep-link param reading ---
  const paramClientId = searchParams.get('clientId');
  const paramProjectId = searchParams.get('projectId');
  const paramFolder = searchParams.get('folder');
  const paramDocumentId = searchParams.get('documentId');
  const hasDeepLink = !!(paramClientId || paramDocumentId);

  // --- Resolve display names for deep-link params ---
  const deepLinkClient = useQuery(
    api.clients.get,
    paramClientId ? { id: paramClientId as Id<'clients'> } : 'skip'
  );
  const deepLinkProject = useQuery(
    api.projects.get,
    paramProjectId ? { id: paramProjectId as Id<'projects'> } : 'skip'
  );
  const deepLinkDocument = useQuery(
    api.documents.get,
    paramDocumentId ? { id: paramDocumentId as Id<'documents'> } : 'skip'
  );
  // For documentId deep-link: resolve the document's client and project
  const docClient = useQuery(
    api.clients.get,
    deepLinkDocument?.clientId ? { id: deepLinkDocument.clientId } : 'skip'
  );
  const docProject = useQuery(
    api.projects.get,
    deepLinkDocument?.projectId ? { id: deepLinkDocument.projectId } : 'skip'
  );
  // For folder deep-link: resolve folder records to get folderRecordId
  const deepLinkFolders = useQuery(
    api.folderStructure.getAllFoldersForClient,
    (paramClientId || deepLinkDocument?.clientId)
      ? { clientId: (paramClientId || deepLinkDocument?.clientId) as Id<'clients'> }
      : 'skip'
  );

  // --- Build initial nav stack from deep-link params ---
  useEffect(() => {
    if (deepLinkResolved || !hasDeepLink) return;

    // Case: documentId deep-link
    if (paramDocumentId) {
      // Wait for document to resolve
      if (deepLinkDocument === undefined) return;
      if (!deepLinkDocument) { setDeepLinkResolved(true); return; } // doc not found

      const clientId = deepLinkDocument.clientId;
      const projectId = deepLinkDocument.projectId;

      // Wait for client/project names
      if (clientId && docClient === undefined) return;
      if (projectId && docProject === undefined) return;
      if (clientId && deepLinkFolders === undefined) return;

      const clientName = docClient?.name || 'Unknown Client';
      const projectName = docProject?.name || 'Unknown Project';

      const stack: NavScreen[] = [{ screen: 'list' }];

      if (clientId) {
        stack.push({ screen: 'client', clientId: clientId as string, clientName });

        if (projectId) {
          stack.push({
            screen: 'projectFolders',
            clientId: clientId as string,
            clientName,
            projectId: projectId as string,
            projectName,
          });

          // Try to resolve the document's folder
          const folderId = deepLinkDocument.folderId;
          if (folderId && deepLinkFolders) {
            const projectGroup = deepLinkFolders.projectFolders?.find(
              g => g.project._id === projectId
            );
            const folderRecord = projectGroup?.folders?.find(
              f => f.folderType === folderId
            );
            if (folderRecord) {
              stack.push({
                screen: 'folder',
                clientId: clientId as string,
                clientName,
                projectId: projectId as string,
                projectName,
                folderRecordId: folderRecord._id,
                folderTypeKey: folderRecord.folderType,
                folderName: folderRecord.name,
                folderLevel: 'project',
              });
            }
          }
        }
      }

      // Append viewer
      stack.push({ screen: 'viewer', documentId: paramDocumentId });
      setNavStack(stack);
      setDeepLinkResolved(true);
      return;
    }

    // Case: clientId-based deep-link
    if (paramClientId) {
      if (deepLinkClient === undefined) return;
      if (!deepLinkClient) { setDeepLinkResolved(true); return; }

      const clientName = deepLinkClient.name || 'Unknown Client';
      const stack: NavScreen[] = [
        { screen: 'list' },
        { screen: 'client', clientId: paramClientId, clientName },
      ];

      if (paramProjectId) {
        if (deepLinkProject === undefined) return;
        const projectName = deepLinkProject?.name || 'Unknown Project';

        stack.push({
          screen: 'projectFolders',
          clientId: paramClientId,
          clientName,
          projectId: paramProjectId,
          projectName,
        });

        if (paramFolder) {
          if (deepLinkFolders === undefined) return;

          const projectGroup = deepLinkFolders?.projectFolders?.find(
            g => g.project._id === paramProjectId
          );
          const folderRecord = projectGroup?.folders?.find(
            f => f.folderType === paramFolder
          );

          if (folderRecord) {
            stack.push({
              screen: 'folder',
              clientId: paramClientId,
              clientName,
              projectId: paramProjectId,
              projectName,
              folderRecordId: folderRecord._id,
              folderTypeKey: folderRecord.folderType,
              folderName: folderRecord.name,
              folderLevel: 'project',
            });
          }
        }
      }

      setNavStack(stack);
      setDeepLinkResolved(true);
      return;
    }
  }, [
    hasDeepLink, deepLinkResolved, paramClientId, paramProjectId, paramFolder, paramDocumentId,
    deepLinkClient, deepLinkProject, deepLinkDocument, docClient, docProject, deepLinkFolders,
  ]);

  // Check if active tab wants to show a specific document
  const activeTab = tabs.find(t => t.id === activeTabId);
  // Clear dismissed state when active tab changes
  if (dismissedTabId && activeTabId !== dismissedTabId) {
    setDismissedTabId(null);
  }
  // Ignore dismissed tab (prevents flash before React processes closeTab)
  const tabDocumentId = (activeTabId !== dismissedTabId) ? activeTab?.params?.documentId : undefined;

  const currentScreen = navStack[navStack.length - 1];

  const push = useCallback((screen: NavScreen) => {
    setNavStack(prev => [...prev, screen]);
  }, []);

  const pop = useCallback(() => {
    setNavStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  // Viewer from nav stack
  const viewerScreen = navStack.find(s => s.screen === 'viewer') as Extract<NavScreen, { screen: 'viewer' }> | undefined;
  const closeViewer = useCallback(() => {
    if (tabDocumentId && activeTabId) {
      setDismissedTabId(activeTabId);
      const dashTab = tabs.find(t => t.id === 'dashboard');
      if (dashTab) switchTab(dashTab.id);
    }
    setNavStack(prev => prev.filter(s => s.screen !== 'viewer'));
  }, [tabDocumentId, activeTabId, tabs, switchTab]);

  const openViewer = useCallback((documentId: string) => {
    push({ screen: 'viewer', documentId });
  }, [push]);

  // Determine which document to show: tab param takes priority, then nav stack
  const activeDocumentId = tabDocumentId || viewerScreen?.documentId;
  const isViewerOpen = !!activeDocumentId;

  // --- Loading state while resolving deep-link ---
  if (hasDeepLink && !deepLinkResolved) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--m-text-tertiary)]" />
      </div>
    );
  }

  // When viewer is open, show ONLY the viewer
  if (isViewerOpen) {
    return (
      <DocumentViewer
        documentId={activeDocumentId!}
        onClose={closeViewer}
      />
    );
  }

  // Base screen from nav stack (no viewer)
  const baseScreen = currentScreen;

  return (
    <div className="min-h-[60vh]">
      {baseScreen.screen === 'list' && (
        <DocsList
          onSelectClient={(clientId, clientName) => push({ screen: 'client', clientId, clientName })}
          onOpenViewer={openViewer}
        />
      )}
      {baseScreen.screen === 'client' && (
        <ClientDocDetail
          clientId={baseScreen.clientId}
          clientName={baseScreen.clientName}
          onBack={pop}
          onSelectFolder={(folderRecordId, folderTypeKey, folderName, folderLevel, projectId, projectName) =>
            push({ screen: 'folder', clientId: baseScreen.clientId, clientName: baseScreen.clientName, projectId, projectName, folderRecordId, folderTypeKey, folderName, folderLevel })
          }
          onSelectProject={(projectId, projectName) =>
            push({ screen: 'projectFolders', clientId: baseScreen.clientId, clientName: baseScreen.clientName, projectId, projectName })
          }
        />
      )}
      {baseScreen.screen === 'projectFolders' && (
        <ProjectFolderList
          clientId={baseScreen.clientId}
          clientName={baseScreen.clientName}
          projectId={baseScreen.projectId}
          projectName={baseScreen.projectName}
          onBack={pop}
          onSelectFolder={(folderRecordId, folderTypeKey, folderName) =>
            push({ screen: 'folder', clientId: baseScreen.clientId, clientName: baseScreen.clientName, projectId: baseScreen.projectId, projectName: baseScreen.projectName, folderRecordId, folderTypeKey, folderName, folderLevel: 'project' })
          }
        />
      )}
      {baseScreen.screen === 'folder' && (
        <FolderContents
          clientId={baseScreen.clientId}
          clientName={baseScreen.clientName}
          projectId={baseScreen.projectId}
          projectName={baseScreen.projectName}
          folderRecordId={baseScreen.folderRecordId}
          folderTypeKey={baseScreen.folderTypeKey}
          folderName={baseScreen.folderName}
          folderLevel={baseScreen.folderLevel}
          onBack={pop}
          onOpenSubfolder={(folderRecordId, folderTypeKey, folderName) =>
            push({ screen: 'folder', clientId: baseScreen.clientId, clientName: baseScreen.clientName, projectId: baseScreen.projectId, projectName: baseScreen.projectName, folderRecordId, folderTypeKey, folderName, folderLevel: baseScreen.folderLevel })
          }
          onOpenViewer={openViewer}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wrap the page in Suspense**

Since `useSearchParams()` requires a Suspense boundary in Next.js App Router, update the page file. Modify `src/app/(mobile)/m-docs/page.tsx`:

```typescript
import { Suspense } from 'react';
import DocsContent from './components/DocsContent';

export default function MobileDocs() {
  return (
    <Suspense>
      <DocsContent />
    </Suspense>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(mobile\)/m-docs/components/DocsContent.tsx src/app/\(mobile\)/m-docs/page.tsx
git commit -m "feat: add deep-link support to mobile document library"
```

---

### Task 2: Update NoteEditor Docs Link

**Files:**
- Modify: `src/app/(mobile)/m-notes/components/NoteEditor.tsx`

Update the "Docs" link in the nav bar to pass client/project/folder context.

- [ ] **Step 1: Update the docs link**

Find the docs link button (around line 305-313):

```typescript
        {(note?.clientId || note?.projectId) && (
          <button
            onClick={() => router.push('/m-docs')}
            className="flex items-center gap-1 active:opacity-70"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
            <span className="text-[12px] text-[var(--m-accent-indicator)]">Docs</span>
          </button>
        )}
```

Replace with:

```typescript
        {(note?.clientId || note?.projectId) && (
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (note?.clientId) params.set('clientId', note.clientId as string);
              if (note?.projectId) params.set('projectId', note.projectId as string);
              if (note?.projectId) params.set('folder', 'notes');
              router.push(`/m-docs?${params.toString()}`);
            }}
            className="flex items-center gap-1 active:opacity-70"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
            <span className="text-[12px] text-[var(--m-accent-indicator)]">Docs</span>
          </button>
        )}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(mobile\)/m-notes/components/NoteEditor.tsx
git commit -m "feat: note editor Docs link deep-links to project notes folder"
```

---

### Task 3: Update CompletionSummary Docs Link

**Files:**
- Modify: `src/app/(mobile)/m-upload/components/CompletionSummary.tsx`

Update the "Done" button to pass the batch's clientId when navigating to docs.

- [ ] **Step 1: Update the Done button**

Find the "Done" button (around line 176-180):

```typescript
        <button
          onClick={() => router.push('/m-docs')}
          className="flex-1 py-3 text-[14px] font-medium text-white bg-[var(--m-text-primary)] rounded-[10px] active:opacity-80"
        >
          Done
        </button>
```

Replace with:

```typescript
        <button
          onClick={() => {
            const params = new URLSearchParams();
            if ((batch as any)?.clientId) params.set('clientId', (batch as any).clientId);
            if ((batch as any)?.projectId) params.set('projectId', (batch as any).projectId);
            const qs = params.toString();
            router.push(qs ? `/m-docs?${qs}` : '/m-docs');
          }}
          className="flex-1 py-3 text-[14px] font-medium text-white bg-[var(--m-text-primary)] rounded-[10px] active:opacity-80"
        >
          Done
        </button>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(mobile\)/m-upload/components/CompletionSummary.tsx
git commit -m "feat: upload completion Done button deep-links to client docs"
```

---

### Task 4: Build Verification & Push

- [ ] **Step 1: Run the build**

Run: `cd /Users/cowboy/rockcap/rockcap-v2/model-testing-app && npx next build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Fix any build errors**

If there are TypeScript errors, fix them and re-run the build.

- [ ] **Step 3: Push to GitHub**

```bash
git push origin mobile2
```
