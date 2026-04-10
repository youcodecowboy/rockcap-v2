'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilingContext {
  clientId?: Id<'clients'>;
  clientName?: string;
  projectId?: Id<'projects'>;
  projectName?: string;
  folderTypeKey?: string;
  folderLevel?: 'client' | 'project';
  folderName?: string;
}

export type FileStatus = 'waiting' | 'uploading' | 'analyzing' | 'done' | 'error';

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

export interface UploadingFile {
  id: string;
  file: File;
  status: FileStatus;
  error?: string;
  storageId?: Id<'_storage'>;
  analysis?: AnalysisResult;
}

export interface ReviewDoc {
  id: string;
  fileName: string;
  fileSize: number;
  fileMimeType: string;
  storageId: Id<'_storage'>;
  analysis: AnalysisResult;
  category: string;
  fileType: string;
  clientId?: Id<'clients'>;
  clientName?: string;
  projectId?: Id<'projects'>;
  projectName?: string;
  folderTypeKey?: string;
  folderLevel?: 'client' | 'project';
  folderName?: string;
  savedDocId?: Id<'documents'>;
  savedDocCode?: string;
  saveError?: string;
}

export type UploadPhase =
  | { name: 'pick' }
  | { name: 'processing' }
  | { name: 'review'; currentIndex: number }
  | { name: 'saving' }
  | { name: 'done' };

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

export function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'pdf':
      return '\u{1F4C4}'; // page facing up
    case 'xlsx':
    case 'xls':
    case 'csv':
      return '\u{1F4CA}'; // bar chart
    case 'docx':
    case 'doc':
      return '\u{1F4DD}'; // memo
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'heic':
    case 'heif':
      return '\u{1F5BC}\uFE0F'; // framed picture
    case 'eml':
      return '\u{1F4E7}'; // e-mail
    default:
      return '\u{1F4C4}';
  }
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface UploadContextType {
  phase: UploadPhase;
  files: UploadingFile[];
  reviewDocs: ReviewDoc[];
  filingContext: FilingContext | null;

  setFilingContext: (ctx: FilingContext | null) => void;
  addFiles: (newFiles: File[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;

  startProcessing: () => Promise<void>;
  retryFile: (id: string) => Promise<void>;

  setReviewIndex: (index: number) => void;
  updateReviewDoc: (id: string, updates: Partial<ReviewDoc>) => void;
  deleteReviewDoc: (id: string) => void;

  finishReview: () => Promise<void>;
  reset: (preserveFilingContext?: boolean) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const MAX_FILES = 5;

export function UploadProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<UploadPhase>({ name: 'pick' });
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [reviewDocs, setReviewDocs] = useState<ReviewDoc[]>([]);
  const [filingContext, setFilingContext] = useState<FilingContext | null>(null);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const uploadDocumentDirect = useMutation(api.directUpload.uploadDocumentDirect);
  const updateDocument = useMutation(api.documents.update);

  // Ref to allow cancel / access latest state in async loops
  const filesRef = useRef(files);
  filesRef.current = files;

  // ---- helpers to update a single file in state ----
  const patchFile = useCallback(
    (id: string, patch: Partial<UploadingFile>) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
      );
    },
    []
  );

  // ---- addFiles ----
  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => {
      const remaining = MAX_FILES - prev.length;
      if (remaining <= 0) return prev;
      const toAdd = newFiles.slice(0, remaining).map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: 'waiting' as FileStatus,
      }));
      return [...prev, ...toAdd];
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  // ---- process a single file ----
  const processFile = useCallback(
    async (uf: UploadingFile): Promise<UploadingFile> => {
      // Upload to Convex storage
      patchFile(uf.id, { status: 'uploading' });
      const uploadUrl = await generateUploadUrl();
      if (!uploadUrl || typeof uploadUrl !== 'string') {
        throw new Error('Invalid upload URL received from Convex');
      }

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': uf.file.type },
        body: uf.file,
      });

      if (!uploadRes.ok) {
        throw new Error(`Storage upload failed: HTTP ${uploadRes.status}`);
      }

      const storageText = await uploadRes.text();
      let storageId: Id<'_storage'>;
      try {
        const parsed = JSON.parse(storageText);
        storageId = parsed.storageId as Id<'_storage'>;
      } catch {
        storageId = storageText.trim() as Id<'_storage'>;
      }

      patchFile(uf.id, { status: 'analyzing', storageId });

      // Analyze via API
      const formData = new FormData();
      formData.append('file', uf.file);

      const analyzeRes = await fetch('/api/analyze-file', {
        method: 'POST',
        body: formData,
      });

      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json().catch(() => ({}));
        throw new Error(
          (errData as any).error || `Analysis failed: HTTP ${analyzeRes.status}`
        );
      }

      const analysis: AnalysisResult = await analyzeRes.json();

      patchFile(uf.id, { status: 'done', storageId, analysis });
      return { ...uf, status: 'done', storageId, analysis };
    },
    [generateUploadUrl, patchFile]
  );

  // ---- startProcessing ----
  const startProcessing = useCallback(async () => {
    setPhase({ name: 'processing' });
    const currentFiles = filesRef.current;
    const results: UploadingFile[] = [];

    for (const uf of currentFiles) {
      try {
        const result = await processFile(uf);
        results.push(result);
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : 'Unknown error';
        patchFile(uf.id, { status: 'error', error: errorMsg });
        results.push({ ...uf, status: 'error', error: errorMsg });
      }
    }

    // Build reviewDocs from successful files
    const docs: ReviewDoc[] = results
      .filter((r) => r.status === 'done' && r.storageId && r.analysis)
      .map((r) => ({
        id: r.id,
        fileName: r.file.name,
        fileSize: r.file.size,
        fileMimeType: r.file.type,
        storageId: r.storageId!,
        analysis: r.analysis!,
        category: r.analysis!.category,
        fileType: r.analysis!.fileType,
        // Pre-fill from filingContext
        clientId: filingContext?.clientId,
        clientName: filingContext?.clientName,
        projectId: filingContext?.projectId,
        projectName: filingContext?.projectName,
        folderTypeKey: filingContext?.folderTypeKey,
        folderLevel: filingContext?.folderLevel,
        folderName: filingContext?.folderName,
      }));

    setReviewDocs(docs);

    // Auto-advance to review after 1s delay
    setTimeout(() => {
      if (docs.length > 0) {
        setPhase({ name: 'review', currentIndex: 0 });
      } else {
        // All files failed — stay on processing so user can retry
      }
    }, 1000);
  }, [processFile, patchFile, filingContext]);

  // ---- retryFile ----
  const retryFile = useCallback(
    async (id: string) => {
      const uf = filesRef.current.find((f) => f.id === id);
      if (!uf) return;
      patchFile(id, { status: 'waiting', error: undefined, storageId: undefined, analysis: undefined });

      try {
        const result = await processFile({ ...uf, status: 'waiting', error: undefined, storageId: undefined, analysis: undefined });
        // Add to reviewDocs if not already present
        setReviewDocs((prev) => {
          if (prev.some((d) => d.id === id)) return prev;
          return [
            ...prev,
            {
              id: result.id,
              fileName: result.file.name,
              fileSize: result.file.size,
              fileMimeType: result.file.type,
              storageId: result.storageId!,
              analysis: result.analysis!,
              category: result.analysis!.category,
              fileType: result.analysis!.fileType,
              clientId: filingContext?.clientId,
              clientName: filingContext?.clientName,
              projectId: filingContext?.projectId,
              projectName: filingContext?.projectName,
              folderTypeKey: filingContext?.folderTypeKey,
              folderLevel: filingContext?.folderLevel,
              folderName: filingContext?.folderName,
            },
          ];
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        patchFile(id, { status: 'error', error: errorMsg });
      }
    },
    [processFile, patchFile, filingContext]
  );

  // ---- review helpers ----
  const setReviewIndex = useCallback((index: number) => {
    setPhase({ name: 'review', currentIndex: index });
  }, []);

  const updateReviewDoc = useCallback(
    (id: string, updates: Partial<ReviewDoc>) => {
      setReviewDocs((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...updates } : d))
      );
    },
    []
  );

  const deleteReviewDoc = useCallback((id: string) => {
    setReviewDocs((prev) => prev.filter((d) => d.id !== id));
  }, []);

  // ---- finishReview ----
  const finishReview = useCallback(async () => {
    setPhase({ name: 'saving' });

    for (const doc of reviewDocs) {
      if (!doc.clientId || !doc.clientName) {
        updateReviewDoc(doc.id, { saveError: 'Client is required' });
        continue;
      }

      try {
        // 1. Create the document via directUpload
        const docId = await uploadDocumentDirect({
          fileStorageId: doc.storageId,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          fileType: doc.fileMimeType,
          clientId: doc.clientId,
          clientName: doc.clientName,
          projectId: doc.projectId,
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

        // 2. If folder is set, assign folder
        if (doc.folderTypeKey && doc.folderLevel) {
          await updateDocument({
            id: docId,
            folderId: doc.folderTypeKey,
            folderType: doc.folderLevel,
          });
        }

        updateReviewDoc(doc.id, { savedDocId: docId });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Save failed';
        updateReviewDoc(doc.id, { saveError: errorMsg });
      }
    }

    setPhase({ name: 'done' });
  }, [reviewDocs, uploadDocumentDirect, updateDocument, updateReviewDoc]);

  // ---- reset ----
  const reset = useCallback(
    (preserveFilingContext?: boolean) => {
      setPhase({ name: 'pick' });
      setFiles([]);
      setReviewDocs([]);
      if (!preserveFilingContext) {
        setFilingContext(null);
      }
    },
    []
  );

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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUpload(): UploadContextType {
  const ctx = useContext(UploadContext);
  if (!ctx) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return ctx;
}
