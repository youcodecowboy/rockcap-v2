# Mobile Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a four-phase mobile upload flow (pick → process → review → done) using existing backend APIs.

**Architecture:** Upload state lives in an `UploadContext` provider (mounted in mobile layout) so it survives route changes. The `/m-upload` page is a thin shell that reads from this context and renders the current phase component. Files are uploaded to Convex storage and analyzed via `/api/analyze-file` sequentially, then saved via `directUpload.uploadDocumentDirect()` + `documents.update()` for folder assignment.

**Tech Stack:** Next.js 16, React, Convex (useQuery/useMutation), existing `/api/analyze-file` route, lucide-react icons

---

### Task 1: UploadContext — State Machine & Provider

**Files:**
- Create: `src/contexts/UploadContext.tsx`
- Modify: `src/app/(mobile)/layout.tsx`

This is the foundation — the context that owns all upload state and survives route navigation.

- [ ] **Step 1: Create UploadContext with types and provider**

```typescript
// src/contexts/UploadContext.tsx
'use client';

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

// --- Types ---

export interface FilingContext {
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  folderTypeKey?: string;
  folderLevel?: 'client' | 'project';
  folderName?: string;
}

export type FileStatus = 'waiting' | 'uploading' | 'analyzing' | 'done' | 'error';

export interface UploadingFile {
  id: string; // unique key for React
  file: File;
  status: FileStatus;
  error?: string;
  storageId?: string;
  analysis?: AnalysisResult;
}

export interface AnalysisResult {
  summary: string;
  fileType: string;
  category: string;
  confidence: number;
  reasoning: string;
  tokensUsed: number;
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  extractedData?: any;
}

export interface ReviewDoc {
  id: string;
  fileName: string;
  fileSize: number;
  fileMimeType: string;
  storageId: string;
  analysis: AnalysisResult;
  // Editable fields
  category: string;
  fileType: string;
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  folderTypeKey?: string;
  folderLevel?: 'client' | 'project';
  folderName?: string;
  // Save result
  savedDocId?: string;
  savedDocCode?: string;
  saveError?: string;
}

export type UploadPhase =
  | { phase: 'pick' }
  | { phase: 'processing' }
  | { phase: 'review'; currentIndex: number }
  | { phase: 'saving' }
  | { phase: 'done' };

interface UploadContextType {
  phase: UploadPhase;
  files: UploadingFile[];
  reviewDocs: ReviewDoc[];
  filingContext: FilingContext | null;
  setFilingContext: (ctx: FilingContext | null) => void;
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  startProcessing: () => void;
  retryFile: (id: string) => void;
  setReviewIndex: (index: number) => void;
  updateReviewDoc: (id: string, updates: Partial<ReviewDoc>) => void;
  deleteReviewDoc: (id: string) => void;
  finishReview: () => Promise<void>;
  reset: (preserveContext?: boolean) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

let fileIdCounter = 0;

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return '📄';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊';
  if (['docx', 'doc'].includes(ext)) return '📝';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'].includes(ext)) return '🖼️';
  if (ext === 'eml') return '📧';
  return '📄';
}

export { getFileIcon };

export function UploadProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<UploadPhase>({ phase: 'pick' });
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [reviewDocs, setReviewDocs] = useState<ReviewDoc[]>([]);
  const [filingContext, setFilingContext] = useState<FilingContext | null>(null);
  const processingRef = useRef(false);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const uploadDocumentDirect = useMutation(api.directUpload.uploadDocumentDirect);
  const updateDocument = useMutation(api.documents.update);

  const addFiles = useCallback((newFiles: File[]) => {
    const uploadFiles: UploadingFile[] = newFiles.map(f => ({
      id: `file-${++fileIdCounter}`,
      file: f,
      status: 'waiting' as const,
    }));
    setFiles(prev => {
      const combined = [...prev, ...uploadFiles];
      return combined.slice(0, 5); // max 5
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  const processOneFile = useCallback(async (file: UploadingFile): Promise<UploadingFile> => {
    // Step 1: Upload
    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'uploading' as const } : f));
    
    try {
      const uploadUrl = await generateUploadUrl();
      const uploadRes = await fetch(uploadUrl as string, {
        method: 'POST',
        headers: { 'Content-Type': file.file.type },
        body: file.file,
      });
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
      
      const storageData = await uploadRes.text();
      let storageId: string;
      try {
        storageId = JSON.parse(storageData).storageId;
      } catch {
        storageId = storageData.trim();
      }

      // Step 2: Analyze
      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'analyzing' as const, storageId } : f));

      const formData = new FormData();
      formData.append('file', file.file);
      const analyzeRes = await fetch('/api/analyze-file', { method: 'POST', body: formData });
      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json().catch(() => ({ error: 'Analysis failed' }));
        throw new Error(errData.error || 'Analysis failed');
      }
      const analysis: AnalysisResult = await analyzeRes.json();

      const updated: UploadingFile = { ...file, status: 'done', storageId, analysis };
      setFiles(prev => prev.map(f => f.id === file.id ? updated : f));
      return updated;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      const updated: UploadingFile = { ...file, status: 'error', error: errorMsg };
      setFiles(prev => prev.map(f => f.id === file.id ? updated : f));
      return updated;
    }
  }, [generateUploadUrl]);

  const startProcessing = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setPhase({ phase: 'processing' });

    const currentFiles = files.filter(f => f.status === 'waiting' || f.status === 'error');
    const results: UploadingFile[] = [];

    for (const file of currentFiles) {
      if (!processingRef.current) break;
      const result = await processOneFile(file);
      results.push(result);
    }

    processingRef.current = false;

    // Build review docs from successful files
    // Need to read current files state to get all done files (including previously done ones)
    setFiles(prev => {
      const doneDocs: ReviewDoc[] = prev
        .filter(f => f.status === 'done' && f.analysis && f.storageId)
        .map(f => ({
          id: f.id,
          fileName: f.file.name,
          fileSize: f.file.size,
          fileMimeType: f.file.type,
          storageId: f.storageId!,
          analysis: f.analysis!,
          category: f.analysis!.category,
          fileType: f.analysis!.fileType,
          clientId: filingContext?.clientId || f.analysis!.clientId,
          clientName: filingContext?.clientName || f.analysis!.clientName,
          projectId: filingContext?.projectId || f.analysis!.projectId,
          projectName: filingContext?.projectName || f.analysis!.projectName,
          folderTypeKey: filingContext?.folderTypeKey,
          folderLevel: filingContext?.folderLevel,
          folderName: filingContext?.folderName,
        }));

      if (doneDocs.length > 0) {
        setReviewDocs(doneDocs);
        setTimeout(() => setPhase({ phase: 'review', currentIndex: 0 }), 1000);
      }
      return prev;
    });
  }, [files, processOneFile, filingContext]);

  const retryFile = useCallback(async (id: string) => {
    const file = files.find(f => f.id === id);
    if (!file) return;
    const reset: UploadingFile = { ...file, status: 'waiting', error: undefined };
    setFiles(prev => prev.map(f => f.id === id ? reset : f));
    await processOneFile(reset);
  }, [files, processOneFile]);

  const setReviewIndex = useCallback((index: number) => {
    setPhase({ phase: 'review', currentIndex: index });
  }, []);

  const updateReviewDoc = useCallback((id: string, updates: Partial<ReviewDoc>) => {
    setReviewDocs(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);

  const deleteReviewDoc = useCallback((id: string) => {
    setReviewDocs(prev => {
      const filtered = prev.filter(d => d.id !== id);
      if (filtered.length === 0) {
        setPhase({ phase: 'pick' });
        setFiles([]);
      } else {
        setPhase(p => {
          if (p.phase === 'review') {
            const newIndex = Math.min(p.currentIndex, filtered.length - 1);
            return { phase: 'review', currentIndex: newIndex };
          }
          return p;
        });
      }
      return filtered;
    });
  }, []);

  const finishReview = useCallback(async () => {
    setPhase({ phase: 'saving' });

    const updated = [...reviewDocs];

    for (let i = 0; i < updated.length; i++) {
      const doc = updated[i];
      if (!doc.clientId) {
        updated[i] = { ...doc, saveError: 'Client is required' };
        continue;
      }

      try {
        // Step 1: Create document
        const docId = await uploadDocumentDirect({
          fileStorageId: doc.storageId as Id<'_storage'>,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          fileType: doc.fileMimeType,
          clientId: doc.clientId as Id<'clients'>,
          clientName: doc.clientName || '',
          projectId: doc.projectId ? doc.projectId as Id<'projects'> : undefined,
          projectName: doc.projectName,
          isBaseDocument: !doc.projectId,
          summary: doc.analysis.summary,
          fileTypeDetected: doc.fileType,
          category: doc.category,
          reasoning: doc.analysis.reasoning,
          confidence: doc.analysis.confidence,
          tokensUsed: doc.analysis.tokensUsed,
          extractedData: doc.analysis.extractedData,
        });

        // Step 2: Set folder if specified
        if (doc.folderTypeKey && doc.folderLevel) {
          await updateDocument({
            id: docId as Id<'documents'>,
            folderId: doc.folderTypeKey,
            folderType: doc.folderLevel,
          });
        }

        updated[i] = { ...doc, savedDocId: docId as string };
      } catch (err) {
        updated[i] = { ...doc, saveError: err instanceof Error ? err.message : 'Save failed' };
      }
    }

    setReviewDocs(updated);
    setPhase({ phase: 'done' });
  }, [reviewDocs, uploadDocumentDirect, updateDocument]);

  const reset = useCallback((preserveContext?: boolean) => {
    setPhase({ phase: 'pick' });
    setFiles([]);
    setReviewDocs([]);
    processingRef.current = false;
    if (!preserveContext) setFilingContext(null);
  }, []);

  return (
    <UploadContext.Provider
      value={{
        phase,
        files,
        reviewDocs,
        filingContext,
        setFilingContext,
        addFiles,
        removeFile,
        clearFiles,
        startProcessing,
        retryFile,
        setReviewIndex,
        updateReviewDoc,
        deleteReviewDoc,
        finishReview,
        reset,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUpload must be used within UploadProvider');
  return ctx;
}
```

- [ ] **Step 2: Add UploadProvider to mobile layout**

In `src/app/(mobile)/layout.tsx`, add the provider wrapping route children, same level as the other providers:

```typescript
import { UploadProvider } from '@/contexts/UploadContext';

// In the JSX, wrap inside the existing providers:
<MessengerProvider>
  <MobileLayoutProvider>
    <UploadProvider>
      <TabProvider>
        <MobileShell>{children}</MobileShell>
      </TabProvider>
    </UploadProvider>
  </MobileLayoutProvider>
</MessengerProvider>
```

- [ ] **Step 3: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/UploadContext.tsx src/app/\(mobile\)/layout.tsx
git commit -m "feat(mobile): add UploadContext state machine for mobile upload flow"
```

---

### Task 2: Upload Page Shell + File Picker (Phase 1)

**Files:**
- Create: `src/app/(mobile)/m-upload/page.tsx`
- Create: `src/app/(mobile)/m-upload/components/FilePicker.tsx`

- [ ] **Step 1: Create the page shell**

```typescript
// src/app/(mobile)/m-upload/page.tsx
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUpload } from '@/contexts/UploadContext';
import FilePicker from './components/FilePicker';
import ProcessingScreen from './components/ProcessingScreen';
import ReviewFlow from './components/ReviewFlow';
import CompletionSummary from './components/CompletionSummary';

export default function MobileUploadPage() {
  const { phase, setFilingContext } = useUpload();
  const searchParams = useSearchParams();

  // Read filing context from URL params on mount
  useEffect(() => {
    const clientId = searchParams.get('clientId');
    if (clientId) {
      setFilingContext({
        clientId,
        clientName: searchParams.get('clientName') || undefined,
        projectId: searchParams.get('projectId') || undefined,
        projectName: searchParams.get('projectName') || undefined,
        folderTypeKey: searchParams.get('folderTypeKey') || undefined,
        folderLevel: (searchParams.get('folderLevel') as 'client' | 'project') || undefined,
        folderName: searchParams.get('folderName') || undefined,
      });
    }
  }, []); // Only on mount

  switch (phase.phase) {
    case 'pick':
      return <FilePicker />;
    case 'processing':
      return <ProcessingScreen />;
    case 'review':
      return <ReviewFlow />;
    case 'saving':
      return <ReviewFlow />;
    case 'done':
      return <CompletionSummary />;
  }
}
```

- [ ] **Step 2: Create FilePicker component**

```typescript
// src/app/(mobile)/m-upload/components/FilePicker.tsx
'use client';

import { useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { useUpload, getFileIcon } from '@/contexts/UploadContext';

const ACCEPT = '.pdf,.docx,.doc,.xls,.xlsx,.xlsm,.csv,.txt,.md,.eml,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilePicker() {
  const { files, filingContext, addFiles, removeFile, clearFiles, startProcessing, setFilingContext } = useUpload();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (files.length + selected.length > 5) {
      alert('Maximum 5 files per upload. Please remove some files.');
      return;
    }
    addFiles(selected);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-var(--m-header-h))]">
      {/* Header */}
      <div className="px-[var(--m-page-px)] py-3 border-b border-[var(--m-border)]">
        <h1 className="text-[15px] font-semibold text-[var(--m-text-primary)]">Upload Documents</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Drop zone */}
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full mx-auto my-5 px-[var(--m-page-px)]"
        >
          <div className="border-2 border-dashed border-[var(--m-border)] rounded-2xl py-10 px-5 text-center active:border-[var(--m-accent-indicator)]">
            <div className="text-[40px] mb-3">📄</div>
            <div className="text-[15px] font-semibold text-[var(--m-text-primary)] mb-1">Select files to upload</div>
            <div className="text-[12px] text-[var(--m-text-tertiary)] mb-5">PDF, DOCX, XLSX, images — up to 5 files</div>
            <div className="inline-block bg-white text-black text-[14px] font-semibold px-7 py-2.5 rounded-lg">
              Choose Files
            </div>
          </div>
        </button>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Selected files */}
        {files.length > 0 && (
          <div className="px-[var(--m-page-px)]">
            <div className="text-[11px] text-[var(--m-text-tertiary)] uppercase tracking-wider mb-2">
              Selected ({files.length} file{files.length !== 1 ? 's' : ''})
            </div>
            {files.map(f => (
              <div
                key={f.id}
                className="bg-[var(--m-bg-inset)] border border-[var(--m-border)] rounded-[10px] p-3 mb-2 flex items-center gap-2.5"
              >
                <div className="w-9 h-9 bg-[#1a1a2e] rounded-lg flex items-center justify-center text-[16px] flex-shrink-0">
                  {getFileIcon(f.file.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">{f.file.name}</div>
                  <div className="text-[11px] text-[var(--m-text-tertiary)]">{formatFileSize(f.file.size)}</div>
                </div>
                <button onClick={() => removeFile(f.id)} className="text-[var(--m-text-tertiary)] p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Context banner */}
        {filingContext && (
          <div className="mx-[var(--m-page-px)] mt-4 bg-[#1a2332] border border-[#1e3a5f] rounded-[10px] p-2.5 flex items-center gap-2">
            <span className="text-[14px]">📁</span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-[#6ba3d6]">Filing to</div>
              <div className="text-[13px] text-[var(--m-text-primary)] truncate">
                {[filingContext.clientName, filingContext.projectName, filingContext.folderName].filter(Boolean).join(' → ')}
              </div>
            </div>
            <button onClick={() => setFilingContext(null)} className="text-[var(--m-text-tertiary)] p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Upload button */}
      <div className="px-[var(--m-page-px)] py-4 border-t border-[var(--m-border)]">
        <button
          onClick={startProcessing}
          disabled={files.length === 0}
          className={`w-full py-3.5 rounded-[10px] text-[15px] font-semibold text-center ${
            files.length > 0
              ? 'bg-white text-black active:opacity-80'
              : 'bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)]'
          }`}
        >
          <Upload className="w-4 h-4 inline-block mr-2 -mt-0.5" />
          Upload & Analyze
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create stub components so the page compiles**

Create minimal stubs for the three components imported by `page.tsx` that don't exist yet:

```typescript
// src/app/(mobile)/m-upload/components/ProcessingScreen.tsx
'use client';
export default function ProcessingScreen() {
  return <div className="p-4 text-[var(--m-text-tertiary)]">Processing...</div>;
}
```

```typescript
// src/app/(mobile)/m-upload/components/ReviewFlow.tsx
'use client';
export default function ReviewFlow() {
  return <div className="p-4 text-[var(--m-text-tertiary)]">Review...</div>;
}
```

```typescript
// src/app/(mobile)/m-upload/components/CompletionSummary.tsx
'use client';
export default function CompletionSummary() {
  return <div className="p-4 text-[var(--m-text-tertiary)]">Done!</div>;
}
```

- [ ] **Step 4: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds, `/m-upload` appears in the route list.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(mobile\)/m-upload/
git commit -m "feat(mobile): add upload page shell and file picker (Phase 1)"
```

---

### Task 3: Processing Screen (Phase 2)

**Files:**
- Modify: `src/app/(mobile)/m-upload/components/ProcessingScreen.tsx`

- [ ] **Step 1: Implement ProcessingScreen**

Replace the stub with the full implementation:

```typescript
// src/app/(mobile)/m-upload/components/ProcessingScreen.tsx
'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Check, AlertCircle, ArrowUp } from 'lucide-react';
import { useUpload, getFileIcon } from '@/contexts/UploadContext';
import type { UploadingFile } from '@/contexts/UploadContext';

function FileProgressRow({ file }: { file: UploadingFile }) {
  const icon = getFileIcon(file.file.name);

  return (
    <div className="bg-[var(--m-bg-inset)] border border-[var(--m-border)] rounded-[10px] p-3 mb-2 flex items-center gap-2.5">
      {/* Status icon */}
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{
        background: file.status === 'done' ? '#1a3d1a'
          : file.status === 'error' ? '#3d1a1a'
          : '#1a1a2e',
      }}>
        {file.status === 'waiting' && <span className="text-[var(--m-text-tertiary)] text-[12px]">{icon}</span>}
        {file.status === 'uploading' && <ArrowUp className="w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />}
        {file.status === 'analyzing' && <Loader2 className="w-3.5 h-3.5 text-[#6ba3d6] animate-spin" />}
        {file.status === 'done' && <Check className="w-3.5 h-3.5 text-green-400" />}
        {file.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">{file.file.name}</div>
        {file.status === 'waiting' && <div className="text-[11px] text-[var(--m-text-tertiary)]">Waiting...</div>}
        {file.status === 'uploading' && (
          <>
            <div className="text-[11px] text-[var(--m-text-tertiary)]">Uploading...</div>
            <div className="bg-[var(--m-border)] h-[3px] rounded mt-1.5 overflow-hidden">
              <div className="bg-[var(--m-text-tertiary)] h-full rounded animate-pulse" style={{ width: '60%' }} />
            </div>
          </>
        )}
        {file.status === 'analyzing' && (
          <>
            <div className="text-[11px] text-[#6ba3d6]">Analyzing...</div>
            <div className="bg-[var(--m-border)] h-[3px] rounded mt-1.5 overflow-hidden">
              <div className="bg-[#6ba3d6] h-full rounded animate-pulse" style={{ width: '80%' }} />
            </div>
          </>
        )}
        {file.status === 'done' && <div className="text-[11px] text-green-400">Uploaded & analyzed</div>}
        {file.status === 'error' && <div className="text-[11px] text-red-400">{file.error || 'Failed'}</div>}
      </div>
    </div>
  );
}

export default function ProcessingScreen() {
  const { files, retryFile } = useUpload();
  const hasStartedRef = useRef(false);

  const allDone = files.every(f => f.status === 'done' || f.status === 'error');
  const allError = files.every(f => f.status === 'error');
  const hasErrors = files.some(f => f.status === 'error');

  return (
    <div className="flex flex-col min-h-[calc(100vh-var(--m-header-h))]">
      {/* Header */}
      <div className="px-[var(--m-page-px)] py-3 border-b border-[var(--m-border)] flex items-center justify-between">
        <span className="text-[12px] text-[var(--m-text-tertiary)]">Processing...</span>
      </div>

      {/* Progress header */}
      <div className="py-6 text-center">
        {!allDone && <Loader2 className="w-10 h-10 mx-auto mb-3 text-[var(--m-text-tertiary)] animate-spin" />}
        {allDone && !allError && <div className="text-[40px] mb-3">✅</div>}
        {allError && <div className="text-[40px] mb-3">❌</div>}
        <div className="text-[17px] font-semibold text-[var(--m-text-primary)]">
          {allDone ? (allError ? 'All uploads failed' : 'Analysis complete') : 'Analyzing documents'}
        </div>
        <div className="text-[13px] text-[var(--m-text-tertiary)] mt-1">
          {allDone
            ? (allError ? 'Tap files below to retry' : 'Proceeding to review...')
            : 'This may take a moment...'}
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 px-[var(--m-page-px)]">
        {files.map(f => (
          <div key={f.id} onClick={() => f.status === 'error' ? retryFile(f.id) : undefined}>
            <FileProgressRow file={f} />
          </div>
        ))}
      </div>

      {/* Hint */}
      {!allDone && (
        <div className="px-[var(--m-page-px)] py-4 text-center">
          <div className="text-[12px] text-[var(--m-text-tertiary)]">
            You can close this screen — processing continues in the background
          </div>
        </div>
      )}

      {/* Retry all button */}
      {allError && (
        <div className="px-[var(--m-page-px)] py-4 border-t border-[var(--m-border)]">
          <button
            onClick={() => files.forEach(f => retryFile(f.id))}
            className="w-full py-3.5 rounded-[10px] text-[15px] font-semibold bg-white text-black text-center"
          >
            Retry All
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(mobile\)/m-upload/components/ProcessingScreen.tsx
git commit -m "feat(mobile): implement processing screen with per-file progress (Phase 2)"
```

---

### Task 4: Category Sheet + Filing Sheet (Bottom Sheets)

**Files:**
- Create: `src/app/(mobile)/m-upload/components/CategorySheet.tsx`
- Create: `src/app/(mobile)/m-upload/components/FilingSheet.tsx`

These are needed by the review screen (Task 5), so build them first.

- [ ] **Step 1: Create CategorySheet**

```typescript
// src/app/(mobile)/m-upload/components/CategorySheet.tsx
'use client';

import { useState } from 'react';
import { X, Search } from 'lucide-react';

const CATEGORIES = [
  'Appraisals', 'Plans', 'Inspections', 'Professional Reports', 'KYC',
  'Loan Terms', 'Legal Documents', 'Project Documents', 'Financial Documents',
  'Insurance', 'Communications', 'Warranties', 'Photographs',
];

interface CategorySheetProps {
  currentCategory: string;
  currentType: string;
  onSelect: (category: string, type: string) => void;
  onClose: () => void;
}

export default function CategorySheet({ currentCategory, currentType, onSelect, onClose }: CategorySheetProps) {
  const [category, setCategory] = useState(currentCategory);
  const [type, setType] = useState(currentType);
  const [search, setSearch] = useState('');

  const filtered = search
    ? CATEGORIES.filter(c => c.toLowerCase().includes(search.toLowerCase()))
    : CATEGORIES;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-2xl max-h-[80vh] flex flex-col pb-[env(safe-area-inset-bottom)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--m-border)]">
          <h3 className="text-[15px] font-semibold text-[var(--m-text-primary)]">Classification</h3>
          <button onClick={onClose} className="p-1 text-[var(--m-text-tertiary)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search categories..."
              style={{ fontSize: '16px' }}
              className="w-full pl-9 pr-3 py-2 bg-[var(--m-bg-inset)] border border-[var(--m-border)] rounded-lg text-[14px] text-[var(--m-text-primary)] outline-none"
            />
          </div>

          {/* Category list */}
          <div className="text-[11px] text-[var(--m-text-tertiary)] uppercase tracking-wider mb-2">Category</div>
          {filtered.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 text-[13px] ${
                category === cat
                  ? 'bg-white text-black font-medium'
                  : 'text-[var(--m-text-secondary)] active:bg-[var(--m-bg-subtle)]'
              }`}
            >
              {cat}
            </button>
          ))}

          {/* Type input */}
          <div className="text-[11px] text-[var(--m-text-tertiary)] uppercase tracking-wider mt-4 mb-2">Document Type</div>
          <input
            value={type}
            onChange={e => setType(e.target.value)}
            placeholder="e.g. RedBook Valuation"
            style={{ fontSize: '16px' }}
            className="w-full px-3 py-2.5 bg-[var(--m-bg-inset)] border border-[var(--m-border)] rounded-lg text-[14px] text-[var(--m-text-primary)] outline-none"
          />
        </div>

        {/* Apply button */}
        <div className="px-4 py-3 border-t border-[var(--m-border)]">
          <button
            onClick={() => onSelect(category, type)}
            className="w-full py-3 rounded-[10px] text-[14px] font-semibold bg-white text-black text-center"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create FilingSheet**

```typescript
// src/app/(mobile)/m-upload/components/FilingSheet.tsx
'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { X, Search, ChevronRight, Check } from 'lucide-react';

interface FilingSheetProps {
  currentClientId?: string;
  currentProjectId?: string;
  currentFolderTypeKey?: string;
  currentFolderLevel?: 'client' | 'project';
  onSelect: (filing: {
    clientId: string;
    clientName: string;
    projectId?: string;
    projectName?: string;
    folderTypeKey?: string;
    folderLevel?: 'client' | 'project';
    folderName?: string;
  }) => void;
  onClose: () => void;
}

type Step = 'client' | 'project' | 'folder';

export default function FilingSheet({
  currentClientId,
  currentProjectId,
  currentFolderTypeKey,
  currentFolderLevel,
  onSelect,
  onClose,
}: FilingSheetProps) {
  const [step, setStep] = useState<Step>('client');
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(
    currentClientId ? { id: currentClientId, name: '' } : null
  );
  const [selectedProject, setSelectedProject] = useState<{ id: string; name: string } | null>(
    currentProjectId ? { id: currentProjectId, name: '' } : null
  );

  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(
    api.projects.getByClient,
    selectedClient ? { clientId: selectedClient.id as Id<'clients'> } : 'skip'
  );
  const foldersData = useQuery(
    api.folderStructure.getAllFoldersForClient,
    selectedClient ? { clientId: selectedClient.id as Id<'clients'> } : 'skip'
  );

  // Resolve client name if we only had an ID
  const resolvedClientName = useMemo(() => {
    if (selectedClient?.name) return selectedClient.name;
    return clients?.find(c => c._id === selectedClient?.id)?.name || '';
  }, [clients, selectedClient]);

  const resolvedProjectName = useMemo(() => {
    if (selectedProject?.name) return selectedProject.name;
    return projects?.find(p => p._id === selectedProject?.id)?.name || '';
  }, [projects, selectedProject]);

  const filteredClients = useMemo(() => {
    if (!clients) return [];
    if (!search) return clients;
    return clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  }, [clients, search]);

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!search) return projects;
    return projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  }, [projects, search]);

  // Get folders for the selected project or client-level
  const folders = useMemo(() => {
    if (!foldersData) return [];
    if (selectedProject) {
      const group = foldersData.projectFolders?.find(g => g.project._id === selectedProject.id);
      return (group?.folders ?? []).filter(f => !f.parentFolderId);
    }
    return (foldersData.clientFolders ?? []).filter(f => !f.parentFolderId);
  }, [foldersData, selectedProject]);

  const handleClientSelect = (id: string, name: string) => {
    setSelectedClient({ id, name });
    setSelectedProject(null);
    setSearch('');
    setStep('project');
  };

  const handleProjectSelect = (id: string, name: string) => {
    setSelectedProject({ id, name });
    setSearch('');
    setStep('folder');
  };

  const handleSkipProject = () => {
    setSelectedProject(null);
    setSearch('');
    setStep('folder');
  };

  const handleFolderSelect = (folderTypeKey: string, folderName: string, folderLevel: 'client' | 'project') => {
    onSelect({
      clientId: selectedClient!.id,
      clientName: resolvedClientName,
      projectId: selectedProject?.id,
      projectName: resolvedProjectName || undefined,
      folderTypeKey,
      folderLevel,
      folderName,
    });
  };

  const handleSelectWithoutFolder = () => {
    onSelect({
      clientId: selectedClient!.id,
      clientName: resolvedClientName,
      projectId: selectedProject?.id,
      projectName: resolvedProjectName || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-2xl max-h-[80vh] flex flex-col pb-[env(safe-area-inset-bottom)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--m-border)]">
          <h3 className="text-[15px] font-semibold text-[var(--m-text-primary)]">
            {step === 'client' ? 'Select Client' : step === 'project' ? 'Select Project' : 'Select Folder'}
          </h3>
          <button onClick={onClose} className="p-1 text-[var(--m-text-tertiary)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        {(step === 'client' || step === 'project') && (
          <div className="px-4 pt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={step === 'client' ? 'Search clients...' : 'Search projects...'}
                style={{ fontSize: '16px' }}
                className="w-full pl-9 pr-3 py-2 bg-[var(--m-bg-inset)] border border-[var(--m-border)] rounded-lg text-[14px] text-[var(--m-text-primary)] outline-none"
              />
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {step === 'client' && filteredClients.map(c => (
            <button
              key={c._id}
              onClick={() => handleClientSelect(c._id, c.name)}
              className="w-full text-left px-3 py-2.5 rounded-lg mb-1 text-[13px] text-[var(--m-text-primary)] flex items-center justify-between active:bg-[var(--m-bg-subtle)]"
            >
              <span className="truncate">{c.name}</span>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-tertiary)] flex-shrink-0" />
            </button>
          ))}

          {step === 'project' && (
            <>
              <button
                onClick={handleSkipProject}
                className="w-full text-left px-3 py-2.5 rounded-lg mb-1 text-[13px] text-[var(--m-accent-indicator)] font-medium active:bg-[var(--m-bg-subtle)]"
              >
                Client-level (no project)
              </button>
              {filteredProjects.map(p => (
                <button
                  key={p._id}
                  onClick={() => handleProjectSelect(p._id, p.name)}
                  className="w-full text-left px-3 py-2.5 rounded-lg mb-1 text-[13px] text-[var(--m-text-primary)] flex items-center justify-between active:bg-[var(--m-bg-subtle)]"
                >
                  <span className="truncate">{p.name}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-tertiary)] flex-shrink-0" />
                </button>
              ))}
            </>
          )}

          {step === 'folder' && (
            <>
              <button
                onClick={handleSelectWithoutFolder}
                className="w-full text-left px-3 py-2.5 rounded-lg mb-1 text-[13px] text-[var(--m-accent-indicator)] font-medium active:bg-[var(--m-bg-subtle)]"
              >
                No specific folder
              </button>
              {folders.map(f => (
                <button
                  key={f._id}
                  onClick={() => handleFolderSelect(f.folderType, f.name, selectedProject ? 'project' : 'client')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 text-[13px] flex items-center justify-between active:bg-[var(--m-bg-subtle)] ${
                    f.folderType === currentFolderTypeKey
                      ? 'text-[var(--m-text-primary)] font-medium bg-[var(--m-bg-subtle)]'
                      : 'text-[var(--m-text-primary)]'
                  }`}
                >
                  <span className="truncate">📁 {f.name}</span>
                  {f.folderType === currentFolderTypeKey && <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(mobile\)/m-upload/components/CategorySheet.tsx src/app/\(mobile\)/m-upload/components/FilingSheet.tsx
git commit -m "feat(mobile): add CategorySheet and FilingSheet bottom sheets for upload review"
```

---

### Task 5: Doc Review + Review Flow (Phase 3)

**Files:**
- Create: `src/app/(mobile)/m-upload/components/DocReview.tsx`
- Modify: `src/app/(mobile)/m-upload/components/ReviewFlow.tsx`

- [ ] **Step 1: Create DocReview component**

```typescript
// src/app/(mobile)/m-upload/components/DocReview.tsx
'use client';

import { useState } from 'react';
import type { ReviewDoc } from '@/contexts/UploadContext';
import CategorySheet from './CategorySheet';
import FilingSheet from './FilingSheet';

interface DocReviewProps {
  doc: ReviewDoc;
  onUpdate: (updates: Partial<ReviewDoc>) => void;
}

export default function DocReview({ doc, onUpdate }: DocReviewProps) {
  const [showCategory, setShowCategory] = useState(false);
  const [showFiling, setShowFiling] = useState(false);

  const confidenceColor = doc.analysis.confidence >= 0.8 ? 'text-green-400' : doc.analysis.confidence >= 0.5 ? 'text-amber-400' : 'text-red-400';
  const confidenceBg = doc.analysis.confidence >= 0.8 ? 'bg-green-500' : doc.analysis.confidence >= 0.5 ? 'bg-amber-500' : 'bg-red-500';

  // Extract key details from extractedData
  const keyDetails: { label: string; value: string }[] = [];
  if (doc.analysis.extractedData) {
    const ed = doc.analysis.extractedData;
    if (ed.propertyAddress || ed.property) keyDetails.push({ label: 'Property', value: ed.propertyAddress || ed.property });
    if (ed.valuationAmount || ed.value || ed.totalValue) keyDetails.push({ label: 'Valuation', value: String(ed.valuationAmount || ed.value || ed.totalValue) });
    if (ed.surveyor || ed.preparedBy || ed.author) keyDetails.push({ label: 'Prepared by', value: ed.surveyor || ed.preparedBy || ed.author });
    if (ed.date || ed.reportDate || ed.valuationDate) keyDetails.push({ label: 'Date', value: ed.date || ed.reportDate || ed.valuationDate });
    if (ed.borrower || ed.applicant) keyDetails.push({ label: 'Borrower', value: ed.borrower || ed.applicant });
    if (ed.lender) keyDetails.push({ label: 'Lender', value: ed.lender });
  }

  return (
    <div className="flex-1 overflow-y-auto px-[var(--m-page-px)] py-3">
      {/* Title */}
      <div className="mb-3">
        <div className="text-[10px] text-[var(--m-text-tertiary)] uppercase tracking-wider mb-1">Document Title</div>
        <div className="bg-[var(--m-bg-inset)] border border-[var(--m-border)] rounded-lg p-2.5">
          <div className="text-[15px] font-semibold text-[var(--m-text-primary)] truncate">{doc.fileName}</div>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-3">
        <div className="text-[10px] text-[var(--m-text-tertiary)] uppercase tracking-wider mb-1">Summary</div>
        <div className="bg-[var(--m-bg-inset)] border border-[var(--m-border)] rounded-[10px] p-3">
          <div className="text-[13px] text-[var(--m-text-secondary)] leading-relaxed">{doc.analysis.summary}</div>
        </div>
      </div>

      {/* Classification */}
      <div className="mb-3">
        <div className="text-[10px] text-[var(--m-text-tertiary)] uppercase tracking-wider mb-1">Classification</div>
        <button
          onClick={() => setShowCategory(true)}
          className="w-full bg-[var(--m-bg-inset)] border border-[var(--m-border)] rounded-lg p-2.5 flex items-center gap-2"
        >
          <div className="flex-1 flex gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-[var(--m-text-tertiary)]">Category</div>
              <div className="text-[13px] text-[var(--m-text-primary)]">{doc.category}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-[var(--m-text-tertiary)]">Type</div>
              <div className="text-[13px] text-[var(--m-text-primary)] truncate">{doc.fileType}</div>
            </div>
          </div>
          <span className="text-[12px] text-[var(--m-text-tertiary)]">▼</span>
        </button>
        <div className="flex items-center gap-1 mt-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${confidenceBg}`} />
          <span className={`text-[11px] ${confidenceColor}`}>{Math.round(doc.analysis.confidence * 100)}% confidence</span>
        </div>
      </div>

      {/* Filing destination */}
      <div className="mb-3">
        <div className="text-[10px] text-[var(--m-text-tertiary)] uppercase tracking-wider mb-1">File To</div>
        <button
          onClick={() => setShowFiling(true)}
          className="w-full bg-[var(--m-bg-inset)] border border-[var(--m-border)] rounded-[10px] p-3 flex items-center justify-between"
        >
          {doc.clientId ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[14px]">🏠</span>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                  {[doc.clientName, doc.projectName].filter(Boolean).join(' → ')}
                </div>
                {doc.folderName && (
                  <div className="text-[11px] text-[var(--m-text-tertiary)]">📁 {doc.folderName}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-[13px] text-red-400">Client required — tap to select</div>
          )}
          <span className="text-[12px] text-[var(--m-accent-indicator)] flex-shrink-0 ml-2">Edit</span>
        </button>
      </div>

      {/* Key details */}
      {keyDetails.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] text-[var(--m-text-tertiary)] uppercase tracking-wider mb-1">Key Details</div>
          <div className="bg-[var(--m-bg-inset)] border border-[var(--m-border)] rounded-[10px] p-3">
            {keyDetails.map((detail, i) => (
              <div
                key={i}
                className={`flex justify-between py-1 ${i < keyDetails.length - 1 ? 'border-b border-[var(--m-border-subtle)]' : ''}`}
              >
                <span className="text-[12px] text-[var(--m-text-tertiary)]">{detail.label}</span>
                <span className="text-[12px] text-[var(--m-text-secondary)] text-right max-w-[60%] truncate">{detail.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom sheets */}
      {showCategory && (
        <CategorySheet
          currentCategory={doc.category}
          currentType={doc.fileType}
          onSelect={(category, type) => {
            onUpdate({ category, fileType: type });
            setShowCategory(false);
          }}
          onClose={() => setShowCategory(false)}
        />
      )}

      {showFiling && (
        <FilingSheet
          currentClientId={doc.clientId}
          currentProjectId={doc.projectId}
          currentFolderTypeKey={doc.folderTypeKey}
          currentFolderLevel={doc.folderLevel}
          onSelect={(filing) => {
            onUpdate({
              clientId: filing.clientId,
              clientName: filing.clientName,
              projectId: filing.projectId,
              projectName: filing.projectName,
              folderTypeKey: filing.folderTypeKey,
              folderLevel: filing.folderLevel,
              folderName: filing.folderName,
            });
            setShowFiling(false);
          }}
          onClose={() => setShowFiling(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement ReviewFlow**

Replace the stub:

```typescript
// src/app/(mobile)/m-upload/components/ReviewFlow.tsx
'use client';

import { ChevronLeft, Loader2 } from 'lucide-react';
import { useUpload } from '@/contexts/UploadContext';
import DocReview from './DocReview';

export default function ReviewFlow() {
  const { phase, reviewDocs, setReviewIndex, updateReviewDoc, deleteReviewDoc, finishReview } = useUpload();

  const isSaving = phase.phase === 'saving';
  const currentIndex = phase.phase === 'review' ? phase.currentIndex : 0;
  const doc = reviewDocs[currentIndex];
  const isLast = currentIndex === reviewDocs.length - 1;
  const isFirst = currentIndex === 0;
  const allHaveClient = reviewDocs.every(d => !!d.clientId);

  if (isSaving) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-var(--m-header-h))] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--m-text-tertiary)]" />
        <div className="text-[15px] text-[var(--m-text-secondary)]">Saving documents...</div>
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-var(--m-header-h))]">
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)] flex-shrink-0">
        <button onClick={() => setReviewIndex(Math.max(0, currentIndex - 1))} className="flex items-center gap-1" disabled={isFirst}>
          <ChevronLeft className={`w-3.5 h-3.5 ${isFirst ? 'text-[var(--m-text-tertiary)]' : 'text-[var(--m-accent-indicator)]'}`} />
          <span className={`text-[12px] ${isFirst ? 'text-[var(--m-text-tertiary)]' : 'text-[var(--m-accent-indicator)]'}`}>Back</span>
        </button>
        <span className="text-[12px] text-[var(--m-text-tertiary)]">{currentIndex + 1} of {reviewDocs.length}</span>
        <button
          onClick={() => {
            if (confirm('Remove this document from the upload?')) {
              deleteReviewDoc(doc.id);
            }
          }}
          className="text-[12px] text-red-400"
        >
          Delete
        </button>
      </div>

      {/* Doc review content */}
      <DocReview
        doc={doc}
        onUpdate={(updates) => updateReviewDoc(doc.id, updates)}
      />

      {/* Navigation buttons */}
      <div className="flex gap-2.5 px-[var(--m-page-px)] py-4 border-t border-[var(--m-border)] flex-shrink-0">
        <button
          onClick={() => setReviewIndex(currentIndex - 1)}
          disabled={isFirst}
          className={`flex-1 py-3.5 rounded-[10px] text-[14px] font-semibold text-center ${
            isFirst ? 'bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)]' : 'bg-[var(--m-bg-inset)] text-[var(--m-text-primary)]'
          }`}
        >
          Previous
        </button>
        {isLast ? (
          <button
            onClick={finishReview}
            disabled={!allHaveClient}
            className={`flex-[2] py-3.5 rounded-[10px] text-[14px] font-semibold text-center ${
              allHaveClient ? 'bg-white text-black' : 'bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)]'
            }`}
          >
            Finish
          </button>
        ) : (
          <button
            onClick={() => setReviewIndex(currentIndex + 1)}
            className="flex-[2] py-3.5 rounded-[10px] text-[14px] font-semibold bg-white text-black text-center"
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(mobile\)/m-upload/components/DocReview.tsx src/app/\(mobile\)/m-upload/components/ReviewFlow.tsx
git commit -m "feat(mobile): implement per-doc review flow with classification and filing editing (Phase 3)"
```

---

### Task 6: Completion Summary (Phase 4)

**Files:**
- Modify: `src/app/(mobile)/m-upload/components/CompletionSummary.tsx`

- [ ] **Step 1: Implement CompletionSummary**

Replace the stub:

```typescript
// src/app/(mobile)/m-upload/components/CompletionSummary.tsx
'use client';

import { useRouter } from 'next/navigation';
import { Check, AlertCircle } from 'lucide-react';
import { useUpload } from '@/contexts/UploadContext';

export default function CompletionSummary() {
  const { reviewDocs, filingContext, reset } = useUpload();
  const router = useRouter();

  const saved = reviewDocs.filter(d => d.savedDocId);
  const failed = reviewDocs.filter(d => d.saveError);

  const handleViewDoc = (docId: string) => {
    router.push(`/m-docs?documentId=${docId}`);
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-var(--m-header-h))]">
      {/* Success header */}
      <div className="py-7 text-center">
        <div className="text-[44px] mb-2.5">{failed.length > 0 ? '⚠️' : '✅'}</div>
        <div className="text-[18px] font-bold text-[var(--m-text-primary)]">
          {saved.length} document{saved.length !== 1 ? 's' : ''} uploaded
        </div>
        <div className="text-[13px] text-[var(--m-text-tertiary)] mt-1">
          {failed.length > 0
            ? `${failed.length} failed — tap to retry`
            : 'All files analyzed and filed'}
        </div>
      </div>

      {/* Document list */}
      <div className="flex-1 px-[var(--m-page-px)]">
        {reviewDocs.map(doc => (
          <button
            key={doc.id}
            onClick={() => doc.savedDocId ? handleViewDoc(doc.savedDocId) : undefined}
            className="w-full bg-[var(--m-bg-inset)] border border-[var(--m-border)] rounded-[10px] p-3 mb-2 flex items-center gap-2.5 text-left"
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
              doc.saveError ? 'bg-[#3d1a1a]' : 'bg-[#1a3d1a]'
            }`}>
              {doc.saveError
                ? <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                : <Check className="w-3.5 h-3.5 text-green-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                {doc.savedDocCode || doc.fileName}
              </div>
              {doc.saveError ? (
                <div className="text-[10px] text-red-400 mt-0.5">{doc.saveError}</div>
              ) : (
                <div className="flex gap-1.5 mt-0.5 flex-wrap">
                  <span className="bg-[#1a1a2e] text-[#6ba3d6] text-[10px] px-1.5 py-0.5 rounded">
                    {doc.category}
                  </span>
                  <span className="text-[10px] text-[var(--m-text-tertiary)]">
                    → {[doc.clientName, doc.projectName].filter(Boolean).join(' / ')}
                  </span>
                </div>
              )}
            </div>
            {doc.savedDocId && (
              <span className="text-[var(--m-text-tertiary)] text-[14px] flex-shrink-0">›</span>
            )}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2.5 px-[var(--m-page-px)] py-4 border-t border-[var(--m-border)]">
        <button
          onClick={() => reset(!!filingContext)}
          className="flex-1 py-3.5 rounded-[10px] text-[14px] font-semibold bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] text-center"
        >
          Upload More
        </button>
        <button
          onClick={() => router.push('/m-docs')}
          className="flex-1 py-3.5 rounded-[10px] text-[14px] font-semibold bg-white text-black text-center"
        >
          Done
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(mobile\)/m-upload/components/CompletionSummary.tsx
git commit -m "feat(mobile): implement completion summary with doc list and actions (Phase 4)"
```

---

### Task 7: Nav Drawer Entry Point + Folder Upload Button

**Files:**
- Modify: `src/components/mobile/MobileNavDrawer.tsx`
- Modify: `src/app/(mobile)/m-docs/components/FolderContents.tsx`

- [ ] **Step 1: Add Upload to MobileNavDrawer**

In `src/components/mobile/MobileNavDrawer.tsx`, add the Upload item to the `navItems` array:

```typescript
import {
  X,
  LayoutDashboard,
  Building,
  File,
  CheckSquare,
  FileText,
  ContactRound,
  Mail,
  Upload,
} from 'lucide-react';

const navItems = [
  { href: '/m-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/m-clients', label: 'Clients', icon: Building },
  { href: '/m-docs', label: 'Documents', icon: File },
  { href: '/m-upload', label: 'Upload', icon: Upload },
  { href: '/m-inbox', label: 'Inbox', icon: Mail },
  { href: '/m-tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/m-notes', label: 'Notes', icon: FileText },
  { href: '/m-contacts', label: 'Contacts', icon: ContactRound },
];
```

- [ ] **Step 2: Add Upload button to FolderContents**

In `src/app/(mobile)/m-docs/components/FolderContents.tsx`, add an Upload button to the header area. Add the import and router:

```typescript
import { ChevronLeft, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
```

Add `const router = useRouter();` inside the component function, after the existing hooks.

Then in the header JSX, add an upload button next to the folder name:

Replace the existing header `<div>` (lines 132-141) with:

```tsx
<div className="flex items-center justify-between px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)]">
  <button onClick={onBack} className="flex items-center gap-1">
    <ChevronLeft className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
    <span className="text-[12px] text-[var(--m-accent-indicator)]">{backLabel}</span>
  </button>
  <div className="flex items-center gap-2">
    <button
      onClick={() => {
        const params = new URLSearchParams({
          clientId,
          clientName,
          ...(projectId ? { projectId } : {}),
          ...(projectName ? { projectName } : {}),
          folderTypeKey,
          folderLevel,
          folderName,
        });
        router.push(`/m-upload?${params.toString()}`);
      }}
      className="p-1.5 text-[var(--m-accent-indicator)]"
      aria-label="Upload to this folder"
    >
      <Upload className="w-3.5 h-3.5" />
    </button>
    <div className="text-right min-w-0">
      <div className="text-[14px] font-semibold text-[var(--m-text-primary)] truncate">{folderName}</div>
      <div className="text-[10px] text-[var(--m-text-tertiary)]">{contextLine}</div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/mobile/MobileNavDrawer.tsx src/app/\(mobile\)/m-docs/components/FolderContents.tsx
git commit -m "feat(mobile): add Upload to nav drawer and folder-context upload button"
```

---

### Task 8: Build Verification + Push

**Files:** None (verification only)

- [ ] **Step 1: Run full build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds, `/m-upload` appears in the route list.

- [ ] **Step 2: Fix any build errors**

If there are TypeScript or build errors, fix them.

- [ ] **Step 3: Commit any fixes and push**

```bash
git push origin main
```
