'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useUser } from '@clerk/nextjs';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Modal, Button, StatusPill, IconButton } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';
import {
  Upload,
  X,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  Brain,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Calendar,
  DollarSign,
  Users,
  Building2,
  MapPin,
  Tag,
} from 'lucide-react';

interface DirectUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: Id<"clients">;
  clientName: string;
  clientType: string;
  folderType: string;
  folderName: string;
  level: 'client' | 'project';
  projectId?: Id<"projects">;
  projectName?: string;
  initialFiles?: File[];
}

interface AnalysisResult {
  documentType?: string;
  category?: string;
  summary?: string;
  confidence?: number;
  documentAnalysis?: {
    documentDescription: string;
    documentPurpose: string;
    entities: {
      people: string[];
      companies: string[];
      locations: string[];
      projects: string[];
    };
    keyTerms: string[];
    keyDates: string[];
    keyAmounts: string[];
    executiveSummary: string;
    detailedSummary: string;
    sectionBreakdown?: string[];
    documentCharacteristics: {
      isFinancial: boolean;
      isLegal: boolean;
      isIdentity: boolean;
      isReport: boolean;
      isDesign: boolean;
      isCorrespondence: boolean;
      hasMultipleProjects: boolean;
      isInternal: boolean;
    };
    rawContentType: string;
    confidenceInAnalysis: number;
  };
  checklistMatches?: Array<{
    itemId: string;
    itemName: string;
    category: string;
    confidence: number;
    reasoning: string;
  }>;
  classificationReasoning?: string;
  alternativeTypes?: Array<{ fileType: string; category: string; confidence: number }>;
  generatedDocumentCode?: string;
  extractedText?: string;
}

interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'analyzing' | 'complete' | 'error';
  progress: number;
  error?: string;
  storageId?: Id<"_storage">;
  documentId?: Id<"documents">;
  result?: AnalysisResult;
}

type ModalStep = 'upload' | 'review';

interface ReviewState {
  [fileId: string]: {
    confirmedChecklistItemIds: Set<string>;
    checklistLinked: boolean;
  };
}

export default function DirectUploadModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  clientType,
  folderType,
  folderName,
  level,
  projectId,
  projectName,
  initialFiles,
}: DirectUploadModalProps) {
  const colors = useColors();
  const { user } = useUser();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [analyzeEnabled, setAnalyzeEnabled] = useState(true);
  const [step, setStep] = useState<ModalStep>('upload');
  const [reviewState, setReviewState] = useState<ReviewState>({});
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialFilesProcessed = useRef(false);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const createDocument = useMutation(api.documents.create);
  const linkDocumentToRequirement = useMutation(api.knowledgeLibrary.linkDocumentToRequirement);
  const currentUser = useQuery(api.users.getCurrent);

  // Fetch checklist items for V4 metadata (only when analysis is enabled)
  const checklistItems = useQuery(
    api.knowledgeLibrary.getAllChecklistItemsForClient,
    analyzeEnabled ? { clientId, projectId: projectId || undefined } : "skip"
  );

  // Populate initial files from drag-and-drop
  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0 && !initialFilesProcessed.current) {
      initialFilesProcessed.current = true;
      addFiles(initialFiles);
    }
    if (!isOpen) {
      initialFilesProcessed.current = false;
    }
  }, [isOpen, initialFiles]);

  const getUserInitials = () => {
    if (user?.fullName) {
      return user.fullName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return 'XX';
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  };

  const addFiles = (newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      status: 'pending',
      progress: 0,
    }));
    setFiles(prev => [...prev, ...uploadFiles]);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const getConfidenceTone = (confidence: number) => {
    if (confidence >= 0.8) return colors.accent.green;
    if (confidence >= 0.6) return colors.accent.yellow;
    return colors.accent.red;
  };

  const processFiles = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    const initials = getUserInitials();
    const today = new Date().toISOString().split('T')[0];

    // Track which files were analyzed so we can transition to review
    let hasAnalyzedFiles = false;
    const analyzedFileIds: string[] = [];

    for (const uploadFile of files) {
      if (uploadFile.status !== 'pending') continue;

      try {
        // Step 1: Upload to Convex storage
        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 20 } : f
        ));

        const uploadUrl = await generateUploadUrl();
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': uploadFile.file.type },
          body: uploadFile.file,
        });

        if (!uploadResponse.ok) throw new Error('Upload failed');
        const { storageId } = await uploadResponse.json();

        let analysisResult: AnalysisResult | undefined;

        if (analyzeEnabled) {
          // Step 2: Analyze with V4 pipeline
          setFiles(prev => prev.map(f =>
            f.id === uploadFile.id ? { ...f, progress: 50, status: 'analyzing', storageId } : f
          ));

          const formData = new FormData();
          formData.append('file', uploadFile.file);

          // Build rich metadata for V4
          const v4Metadata: Record<string, any> = {
            clientContext: { clientId: clientId.toString(), clientType },
            projectShortcode: projectId ? (projectName?.slice(0, 10).toUpperCase() || 'DOC') : clientName.slice(0, 10).toUpperCase(),
            clientName,
            uploaderInitials: initials,
          };

          // Include checklist items for matching
          if (checklistItems && checklistItems.length > 0) {
            v4Metadata.checklistItems = checklistItems
              .filter(item => item.status !== 'fulfilled')
              .map(item => ({
                id: item._id,
                name: item.name,
                category: item.category,
                description: item.description || '',
                matchingDocumentTypes: item.matchingDocumentTypes || [],
              }));
          }

          formData.append('metadata', JSON.stringify(v4Metadata));

          const analysisResponse = await fetch('/api/v4-analyze', {
            method: 'POST',
            body: formData,
          });

          analysisResult = {
            documentType: 'Other',
            category: 'Miscellaneous',
            summary: 'Document uploaded directly to folder.',
          };

          if (analysisResponse.ok) {
            const data = await analysisResponse.json();
            const doc = data.documents?.[0];
            if (doc) {
              analysisResult = {
                documentType: doc.fileType || 'Other',
                category: doc.category || 'Miscellaneous',
                summary: doc.summary || 'Document uploaded directly to folder.',
                confidence: doc.confidence,
                documentAnalysis: doc.documentAnalysis,
                checklistMatches: doc.checklistMatches || [],
                classificationReasoning: doc.classificationReasoning,
                alternativeTypes: doc.alternativeTypes || [],
                generatedDocumentCode: doc.generatedDocumentCode,
                extractedText: doc.extractedText || undefined,
              };
            }
          }
        }

        // Step 3: Save document to DB immediately (whether analyzed or not)
        const result = analysisResult || {};
        const shortcode = projectId ? (projectName?.slice(0, 10).toUpperCase() || 'DOC') : clientName.slice(0, 10).toUpperCase();
        const typeCode = result.documentType?.toUpperCase().replace(/\s+/g, '-').slice(0, 20) || 'DOC';
        const documentCode = result.generatedDocumentCode || `${shortcode}-${typeCode}-EXT-${initials}-V1.0-${today}`;

        const documentId = await createDocument({
          fileName: uploadFile.file.name,
          documentCode,
          fileType: uploadFile.file.type,
          fileSize: uploadFile.file.size,
          fileStorageId: storageId,
          summary: result.summary || 'Document uploaded directly to folder.',
          category: result.category || 'Miscellaneous',
          fileTypeDetected: result.documentType || 'Other',
          clientId,
          projectId: projectId || undefined,
          folderId: folderType,
          folderType: level,
          uploadedBy: currentUser?._id,
          uploaderInitials: initials,
          version: 'V1.0',
          isInternal: false,
          documentAnalysis: result.documentAnalysis,
          classificationReasoning: result.classificationReasoning,
          confidence: result.confidence,
        });

        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id
            ? { ...f, progress: 100, status: 'complete', storageId, documentId, result: analysisResult }
            : f
        ));

        // Initialize review state with auto-confirmed high-confidence checklist matches
        if (analyzeEnabled && analysisResult?.checklistMatches && analysisResult.checklistMatches.length > 0) {
          hasAnalyzedFiles = true;
          analyzedFileIds.push(uploadFile.id);
          const autoConfirmed = new Set(
            analysisResult.checklistMatches
              .filter(m => m.confidence >= 0.7)
              .map(m => m.itemId)
          );
          setReviewState(prev => ({
            ...prev,
            [uploadFile.id]: { confirmedChecklistItemIds: autoConfirmed, checklistLinked: false },
          }));
        } else if (analyzeEnabled) {
          hasAnalyzedFiles = true;
          analyzedFileIds.push(uploadFile.id);
          setReviewState(prev => ({
            ...prev,
            [uploadFile.id]: { confirmedChecklistItemIds: new Set(), checklistLinked: false },
          }));
        }

      } catch (error) {
        console.error('Upload error:', error);
        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id
            ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
            : f
        ));
      }
    }

    setIsProcessing(false);

    // If analysis was enabled and we have results, transition to review step
    if (analyzeEnabled && hasAnalyzedFiles) {
      setExpandedFiles(new Set(analyzedFileIds.length > 0 ? [analyzedFileIds[0]] : []));
      setStep('review');
    }
  };

  // Link confirmed checklist items to documents
  const linkChecklistItems = async () => {
    setIsLinking(true);

    for (const file of files) {
      if (!file.documentId) continue;
      const review = reviewState[file.id];
      if (!review || review.checklistLinked || review.confirmedChecklistItemIds.size === 0) continue;
      if (!currentUser?._id) continue;

      for (const checklistItemId of review.confirmedChecklistItemIds) {
        try {
          await linkDocumentToRequirement({
            checklistItemId: checklistItemId as Id<"knowledgeChecklistItems">,
            documentId: file.documentId,
            userId: currentUser._id,
          });
        } catch (linkError) {
          console.error(`Failed to link checklist item ${checklistItemId}:`, linkError);
        }
      }

      setReviewState(prev => ({
        ...prev,
        [file.id]: { ...prev[file.id], checklistLinked: true },
      }));
    }

    setIsLinking(false);
    handleClose();
  };

  const toggleChecklistItem = (fileId: string, itemId: string) => {
    setReviewState(prev => {
      const current = prev[fileId]?.confirmedChecklistItemIds || new Set();
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return { ...prev, [fileId]: { ...prev[fileId], confirmedChecklistItemIds: next } };
    });
  };

  const toggleExpandedFile = (fileId: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const hasFiles = files.length > 0;
  const pendingFiles = files.filter(f => f.status === 'pending').length;
  const completedCount = files.filter(f => f.status === 'complete').length;
  const totalChecklistMatches = files.reduce((sum, f) => {
    const review = reviewState[f.id];
    return sum + (review?.confirmedChecklistItemIds.size || 0);
  }, 0);
  const hasUnlinkedChecklist = files.some(f => {
    const review = reviewState[f.id];
    return review && !review.checklistLinked && review.confirmedChecklistItemIds.size > 0;
  });

  const handleClose = () => {
    if (!isProcessing && !isLinking) {
      setFiles([]);
      setStep('upload');
      setReviewState({});
      setExpandedFiles(new Set());
      onClose();
    }
  };

  const chip = (label: string) => (
    <span
      style={{
        fontSize: 11,
        color: colors.text.secondary,
        background: colors.bg.cardAlt,
        padding: '1px 6px',
        borderRadius: 2,
      }}
    >
      {label}
    </span>
  );

  const sectionLabel = (text: string): React.CSSProperties => ({
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: colors.text.muted,
    fontWeight: 500,
    marginBottom: 8,
  });

  const checkboxBox = (checked: boolean, c: ColorPalette): React.CSSProperties => ({
    width: 16,
    height: 16,
    flexShrink: 0,
    borderRadius: 3,
    border: `1px solid ${checked ? c.accent.blue : c.border.mid}`,
    background: checked ? c.accent.blue : 'transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
  });

  // Subtitle row reused in the title area
  const subtitle = (
    <div className="flex items-center gap-2" style={{ fontSize: 11, color: colors.text.muted, marginBottom: 14 }}>
      <span>{clientName}</span>
      {projectName && (
        <>
          <span>&rarr;</span>
          <span>{projectName}</span>
        </>
      )}
      <span>&rarr;</span>
      <StatusPill label={folderName} tone={colors.text.muted} />
    </div>
  );

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      width={step === 'review' ? 800 : 600}
      title={
        step === 'review'
          ? 'Review Analysis'
          : `Upload to ${folderName}`
      }
      footer={
        step === 'upload' ? (
          <>
            <Button variant="secondary" onClick={handleClose} disabled={isProcessing}>
              {pendingFiles === 0 && hasFiles ? 'Close' : 'Cancel'}
            </Button>
            {pendingFiles > 0 && (
              <Button
                variant="primary"
                accent={analyzeEnabled ? colors.accent.purple : colors.accent.blue}
                onClick={processFiles}
                disabled={pendingFiles === 0 || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {analyzeEnabled ? 'Analyzing...' : 'Uploading...'}
                  </>
                ) : (
                  <>
                    {analyzeEnabled ? <Brain className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                    {analyzeEnabled ? 'Upload & Analyze' : 'Upload'} {pendingFiles} {pendingFiles === 1 ? 'file' : 'files'}
                  </>
                )}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose} disabled={isLinking}>
              {hasUnlinkedChecklist ? 'Skip & Close' : 'Done'}
            </Button>
            {hasUnlinkedChecklist && (
              <Button variant="primary" accent={colors.accent.green} onClick={linkChecklistItems} disabled={isLinking}>
                {isLinking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Linking...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Confirm & Link Checklist
                  </>
                )}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        {step === 'review' ? (
          <Sparkles className="w-4 h-4" style={{ color: colors.accent.purple }} />
        ) : (
          <Upload className="w-4 h-4" style={{ color: colors.text.muted }} />
        )}
      </div>
      {subtitle}

      {step === 'upload' ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            style={{
              border: `1px dashed ${isDragOver ? colors.accent.blue : colors.border.mid}`,
              borderRadius: 4,
              padding: 32,
              textAlign: 'center',
              cursor: 'pointer',
              background: isDragOver ? `${colors.accent.blue}15` : 'transparent',
              opacity: isProcessing ? 0.5 : 1,
              pointerEvents: isProcessing ? 'none' : 'auto',
              transition: 'background 100ms linear, border-color 100ms linear',
            }}
          >
            <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: isDragOver ? colors.accent.blue : colors.text.dim }} />
            <p style={{ fontSize: 12, fontWeight: 500, color: colors.text.secondary }}>
              {isDragOver ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.xlsm,.eml,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessing}
            />
          </div>

          {/* Analysis Toggle */}
          {hasFiles && !isProcessing && pendingFiles > 0 && (
            <label
              className="flex items-start gap-3"
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: 4,
                border: `1px solid ${colors.border.default}`,
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.preventDefault();
                setAnalyzeEnabled(v => !v);
              }}
            >
              <span style={{ ...checkboxBox(analyzeEnabled, colors), marginTop: 2 }}>
                {analyzeEnabled && <CheckCircle className="w-3 h-3" />}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4" style={{ color: colors.accent.purple }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                    Analyze and add to client intelligence
                  </span>
                </div>
                <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                  AI will classify documents, extract key data, and match to checklist requirements
                </p>
              </div>
            </label>
          )}

          {/* File List */}
          {hasFiles && (
            <div style={{ marginTop: 16, maxHeight: 300, overflowY: 'auto' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.secondary, marginBottom: 8 }}>
                Files ({files.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3"
                    style={{ padding: 8, background: colors.bg.cardAlt, borderRadius: 4 }}
                  >
                    <FileText className="w-7 h-7 flex-shrink-0" style={{ color: colors.text.dim }} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                        {file.file.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {file.status === 'pending' && (
                          <span style={{ fontSize: 11, color: colors.text.muted }}>Ready to upload</span>
                        )}
                        {file.status === 'uploading' && (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" style={{ color: colors.accent.blue }} />
                            <span style={{ fontSize: 11, color: colors.accent.blue }}>Uploading...</span>
                          </>
                        )}
                        {file.status === 'analyzing' && (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" style={{ color: colors.accent.purple }} />
                            <span style={{ fontSize: 11, color: colors.accent.purple }}>Analyzing...</span>
                          </>
                        )}
                        {file.status === 'complete' && (
                          <>
                            <CheckCircle className="w-3 h-3" style={{ color: colors.accent.green }} />
                            <span style={{ fontSize: 11, color: colors.accent.green }}>Saved to folder</span>
                            {file.result?.documentType && <StatusPill label={file.result.documentType} tone={colors.text.muted} />}
                          </>
                        )}
                        {file.status === 'error' && (
                          <>
                            <AlertCircle className="w-3 h-3" style={{ color: colors.accent.red }} />
                            <span style={{ fontSize: 11, color: colors.accent.red }}>{file.error || 'Failed'}</span>
                          </>
                        )}
                      </div>
                      {(file.status === 'uploading' || file.status === 'analyzing') && (
                        <div style={{ height: 4, borderRadius: 2, background: colors.bg.base, marginTop: 8, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${file.progress}%`, background: colors.accent.blue, transition: 'width 150ms linear' }} />
                        </div>
                      )}
                    </div>
                    {file.status === 'pending' && !isProcessing && (
                      <IconButton
                        label="Remove file"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(file.id);
                        }}
                      >
                        <X className="w-4 h-4" />
                      </IconButton>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Review Step */
        <div>
          {/* Success banner */}
          <div
            className="flex items-center gap-3"
            style={{ padding: 12, background: `${colors.accent.green}15`, border: `1px solid ${colors.accent.green}40`, borderRadius: 4, marginBottom: 12 }}
          >
            <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: colors.accent.green }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                {completedCount} {completedCount === 1 ? 'document' : 'documents'} saved to {folderName}
              </p>
              <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                {totalChecklistMatches > 0
                  ? `${totalChecklistMatches} checklist ${totalChecklistMatches === 1 ? 'match' : 'matches'} found — confirm below to link them`
                  : 'Review the analysis results below'}
              </p>
            </div>
          </div>

          {/* Accordion per file */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {files.filter(f => f.status === 'complete' || f.status === 'error').map((file) => {
              const result = file.result;
              const isExpanded = expandedFiles.has(file.id);
              const review = reviewState[file.id];
              const analysis = result?.documentAnalysis;
              const hasEntities = analysis && (
                analysis.entities.people.length > 0 ||
                analysis.entities.companies.length > 0 ||
                analysis.entities.locations.length > 0 ||
                analysis.entities.projects.length > 0
              );
              const hasKeyData = analysis && (
                analysis.keyDates.length > 0 ||
                analysis.keyAmounts.length > 0 ||
                analysis.keyTerms.length > 0
              );

              return (
                <div key={file.id}>
                  <button
                    onClick={() => toggleExpandedFile(file.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      background: colors.bg.cardAlt,
                      borderRadius: 4,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.dim }} />
                    ) : (
                      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.dim }} />
                    )}
                    <FileText className="w-5 h-5 flex-shrink-0" style={{ color: colors.text.dim }} />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="truncate" style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>{file.file.name}</p>
                      <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
                        {result?.documentType && <StatusPill label={result.documentType} tone={colors.text.muted} />}
                        {result?.confidence != null && (
                          <StatusPill label={`${Math.round(result.confidence * 100)}%`} tone={getConfidenceTone(result.confidence)} />
                        )}
                        <span className="flex items-center gap-1" style={{ fontSize: 11, color: colors.accent.green }}>
                          <CheckCircle className="w-3 h-3" /> Saved
                        </span>
                      </div>
                    </div>
                    {review && review.confirmedChecklistItemIds.size > 0 && (
                      <StatusPill label={`${review.confirmedChecklistItemIds.size} checklist`} tone={colors.accent.green} />
                    )}
                  </button>

                  {isExpanded && (
                    <div
                      style={{
                        padding: '12px 16px',
                        border: `1px solid ${colors.border.default}`,
                        borderTop: 'none',
                        borderRadius: '0 0 4px 4px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 16,
                      }}
                    >
                      {/* Executive Summary */}
                      {analysis?.executiveSummary && (
                        <div>
                          <div style={sectionLabel('Summary')}>Summary</div>
                          <p style={{ fontSize: 12, color: colors.text.secondary, lineHeight: 1.5 }}>{analysis.executiveSummary}</p>
                        </div>
                      )}

                      {/* Entities */}
                      {hasEntities && (
                        <div>
                          <div style={sectionLabel('Entities')}>Entities</div>
                          <div className="flex flex-wrap gap-2">
                            {analysis.entities.people.map((p, i) => (
                              <span key={`p-${i}`} className="flex items-center gap-1" style={{ fontSize: 11, color: colors.text.secondary, background: colors.bg.cardAlt, padding: '2px 6px', borderRadius: 2 }}>
                                <Users className="w-3 h-3" />{p}
                              </span>
                            ))}
                            {analysis.entities.companies.map((c, i) => (
                              <span key={`c-${i}`} className="flex items-center gap-1" style={{ fontSize: 11, color: colors.text.secondary, background: colors.bg.cardAlt, padding: '2px 6px', borderRadius: 2 }}>
                                <Building2 className="w-3 h-3" />{c}
                              </span>
                            ))}
                            {analysis.entities.locations.map((l, i) => (
                              <span key={`l-${i}`} className="flex items-center gap-1" style={{ fontSize: 11, color: colors.text.secondary, background: colors.bg.cardAlt, padding: '2px 6px', borderRadius: 2 }}>
                                <MapPin className="w-3 h-3" />{l}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Key Data */}
                      {hasKeyData && (
                        <div>
                          <div style={sectionLabel('Key Data')}>Key Data</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                            {analysis.keyDates.length > 0 && (
                              <div className="flex items-start gap-2">
                                <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.text.dim, marginTop: 2 }} />
                                <div className="flex flex-wrap gap-1">
                                  {analysis.keyDates.map((d, i) => <span key={i}>{chip(d)}</span>)}
                                </div>
                              </div>
                            )}
                            {analysis.keyAmounts.length > 0 && (
                              <div className="flex items-start gap-2">
                                <DollarSign className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.text.dim, marginTop: 2 }} />
                                <div className="flex flex-wrap gap-1">
                                  {analysis.keyAmounts.map((a, i) => <span key={i}>{chip(a)}</span>)}
                                </div>
                              </div>
                            )}
                            {analysis.keyTerms.length > 0 && (
                              <div className="flex items-start gap-2">
                                <Tag className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.text.dim, marginTop: 2 }} />
                                <div className="flex flex-wrap gap-1">
                                  {analysis.keyTerms.map((t, i) => <span key={i}>{chip(t)}</span>)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Checklist Matches */}
                      {result?.checklistMatches && result.checklistMatches.length > 0 && (
                        <div>
                          <div style={sectionLabel('Checklist Matches')}>Checklist Matches</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {result.checklistMatches.map((match) => {
                              const isConfirmed = review?.confirmedChecklistItemIds.has(match.itemId) ?? false;
                              return (
                                <label
                                  key={match.itemId}
                                  className="flex items-center gap-2.5"
                                  style={{
                                    padding: 8,
                                    borderRadius: 4,
                                    cursor: review?.checklistLinked ? 'default' : 'pointer',
                                    background: isConfirmed ? `${colors.accent.green}15` : 'transparent',
                                    border: `1px solid ${isConfirmed ? `${colors.accent.green}40` : colors.border.default}`,
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    if (!review?.checklistLinked) toggleChecklistItem(file.id, match.itemId);
                                  }}
                                >
                                  <span style={checkboxBox(isConfirmed, colors)}>
                                    {isConfirmed && <CheckCircle className="w-3 h-3" />}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <span style={{ fontSize: 12, color: colors.text.primary }}>{match.itemName}</span>
                                    <span style={{ fontSize: 11, color: colors.text.muted, marginLeft: 8 }}>{match.category}</span>
                                  </div>
                                  <StatusPill label={`${Math.round(match.confidence * 100)}%`} tone={getConfidenceTone(match.confidence)} />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
