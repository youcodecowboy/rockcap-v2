'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useUser } from '@clerk/nextjs';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import { cn } from '@/lib/utils';

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
  const linkDocumentToChecklistItem = useMutation(api.knowledgeLibrary.linkDocumentToChecklistItem);
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

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800 border-green-200';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
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
          await linkDocumentToChecklistItem({
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={cn(
        "max-h-[85vh] overflow-hidden flex flex-col",
        step === 'review' ? "sm:max-w-[800px]" : "sm:max-w-[600px]"
      )}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'review' ? (
              <>
                <Sparkles className="w-5 h-5 text-purple-600" />
                Review Analysis
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Upload to {folderName}
              </>
            )}
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
            <span>{clientName}</span>
            {projectName && (
              <>
                <span>&rarr;</span>
                <span>{projectName}</span>
              </>
            )}
            <span>&rarr;</span>
            <Badge variant="outline" className="text-xs">{folderName}</Badge>
          </div>
        </DialogHeader>

        {step === 'upload' ? (
          <>
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
                  isDragOver
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 hover:border-gray-400 hover:bg-gray-50",
                  isProcessing && "pointer-events-none opacity-50"
                )}
              >
                <Upload className={cn(
                  "w-10 h-10 mx-auto mb-3",
                  isDragOver ? "text-blue-500" : "text-gray-400"
                )} />
                <p className="text-sm font-medium text-gray-700">
                  {isDragOver ? 'Drop files here' : 'Drag & drop files here'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  or click to browse
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isProcessing}
                />
              </div>

              {/* Analysis Toggle */}
              {hasFiles && !isProcessing && pendingFiles > 0 && (
                <label className="flex items-start gap-3 mt-4 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                  <Checkbox
                    checked={analyzeEnabled}
                    onCheckedChange={(checked) => setAnalyzeEnabled(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-gray-900">Analyze and add to client intelligence</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      AI will classify documents, extract key data, and match to checklist requirements
                    </p>
                  </div>
                </label>
              )}

              {/* File List */}
              {hasFiles && (
                <div className="mt-4 flex-1 overflow-auto max-h-[300px]">
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    Files ({files.length})
                  </div>
                  <div className="space-y-2">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
                      >
                        <FileText className="w-8 h-8 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {file.file.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {file.status === 'pending' && (
                              <span className="text-xs text-gray-500">Ready to upload</span>
                            )}
                            {file.status === 'uploading' && (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                                <span className="text-xs text-blue-600">Uploading...</span>
                              </>
                            )}
                            {file.status === 'analyzing' && (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
                                <span className="text-xs text-purple-600">Analyzing...</span>
                              </>
                            )}
                            {file.status === 'complete' && (
                              <>
                                <CheckCircle className="w-3 h-3 text-green-500" />
                                <span className="text-xs text-green-600">Saved to folder</span>
                                {file.result?.documentType && (
                                  <Badge variant="outline" className="text-xs">
                                    {file.result.documentType}
                                  </Badge>
                                )}
                              </>
                            )}
                            {file.status === 'error' && (
                              <>
                                <AlertCircle className="w-3 h-3 text-red-500" />
                                <span className="text-xs text-red-600">{file.error || 'Failed'}</span>
                              </>
                            )}
                          </div>
                          {(file.status === 'uploading' || file.status === 'analyzing') && (
                            <Progress value={file.progress} className="mt-2 h-1" />
                          )}
                        </div>
                        {file.status === 'pending' && !isProcessing && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(file.id);
                            }}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer - Upload Step */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isProcessing}
              >
                {pendingFiles === 0 && hasFiles ? 'Close' : 'Cancel'}
              </Button>
              {pendingFiles > 0 && (
                <Button
                  onClick={processFiles}
                  disabled={pendingFiles === 0 || isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {analyzeEnabled ? 'Analyzing...' : 'Uploading...'}
                    </>
                  ) : (
                    <>
                      {analyzeEnabled ? (
                        <Brain className="w-4 h-4 mr-2" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      {analyzeEnabled ? 'Upload & Analyze' : 'Upload'} {pendingFiles} {pendingFiles === 1 ? 'file' : 'files'}
                    </>
                  )}
                </Button>
              )}
            </div>
          </>
        ) : (
          /* Review Step */
          <>
            <div className="flex-1 overflow-auto">
              {/* Success banner */}
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg mb-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">
                    {completedCount} {completedCount === 1 ? 'document' : 'documents'} saved to {folderName}
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {totalChecklistMatches > 0
                      ? `${totalChecklistMatches} checklist ${totalChecklistMatches === 1 ? 'match' : 'matches'} found — confirm below to link them`
                      : 'Review the analysis results below'}
                  </p>
                </div>
              </div>

              {/* Accordion per file */}
              <div className="space-y-2">
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
                    <Collapsible key={file.id} open={isExpanded} onOpenChange={() => toggleExpandedFile(file.id)}>
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                          <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-sm font-medium text-gray-900 truncate">{file.file.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {result?.documentType && (
                                <Badge variant="outline" className="text-xs">{result.documentType}</Badge>
                              )}
                              {result?.confidence != null && (
                                <Badge variant="outline" className={cn("text-xs", getConfidenceColor(result.confidence))}>
                                  {Math.round(result.confidence * 100)}%
                                </Badge>
                              )}
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle className="w-3 h-3" /> Saved
                              </span>
                            </div>
                          </div>
                          {review && review.confirmedChecklistItemIds.size > 0 && (
                            <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                              {review.confirmedChecklistItemIds.size} checklist
                            </Badge>
                          )}
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="px-4 py-3 border border-t-0 border-gray-200 rounded-b-lg space-y-4">
                          {/* Executive Summary */}
                          {analysis?.executiveSummary && (
                            <div>
                              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Summary</div>
                              <p className="text-sm text-gray-700 leading-relaxed">{analysis.executiveSummary}</p>
                            </div>
                          )}

                          {/* Entities */}
                          {hasEntities && (
                            <div>
                              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Entities</div>
                              <div className="flex flex-wrap gap-2">
                                {analysis.entities.people.map((p, i) => (
                                  <Badge key={`p-${i}`} variant="outline" className="text-xs gap-1">
                                    <Users className="w-3 h-3" />{p}
                                  </Badge>
                                ))}
                                {analysis.entities.companies.map((c, i) => (
                                  <Badge key={`c-${i}`} variant="outline" className="text-xs gap-1">
                                    <Building2 className="w-3 h-3" />{c}
                                  </Badge>
                                ))}
                                {analysis.entities.locations.map((l, i) => (
                                  <Badge key={`l-${i}`} variant="outline" className="text-xs gap-1">
                                    <MapPin className="w-3 h-3" />{l}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Key Data */}
                          {hasKeyData && (
                            <div>
                              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Key Data</div>
                              <div className="grid grid-cols-1 gap-2">
                                {analysis.keyDates.length > 0 && (
                                  <div className="flex items-start gap-2">
                                    <Calendar className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                                    <div className="flex flex-wrap gap-1">
                                      {analysis.keyDates.map((d, i) => (
                                        <span key={i} className="text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{d}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {analysis.keyAmounts.length > 0 && (
                                  <div className="flex items-start gap-2">
                                    <DollarSign className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                                    <div className="flex flex-wrap gap-1">
                                      {analysis.keyAmounts.map((a, i) => (
                                        <span key={i} className="text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{a}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {analysis.keyTerms.length > 0 && (
                                  <div className="flex items-start gap-2">
                                    <Tag className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                                    <div className="flex flex-wrap gap-1">
                                      {analysis.keyTerms.map((t, i) => (
                                        <span key={i} className="text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{t}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Checklist Matches */}
                          {result?.checklistMatches && result.checklistMatches.length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Checklist Matches</div>
                              <div className="space-y-1.5">
                                {result.checklistMatches.map((match) => {
                                  const isConfirmed = review?.confirmedChecklistItemIds.has(match.itemId) ?? false;
                                  return (
                                    <label
                                      key={match.itemId}
                                      className={cn(
                                        "flex items-center gap-2.5 p-2 rounded-md border cursor-pointer transition-colors",
                                        isConfirmed
                                          ? "border-green-200 bg-green-50"
                                          : "border-gray-200 hover:bg-gray-50"
                                      )}
                                    >
                                      <Checkbox
                                        checked={isConfirmed}
                                        onCheckedChange={() => toggleChecklistItem(file.id, match.itemId)}
                                        disabled={review?.checklistLinked}
                                      />
                                      <div className="flex-1 min-w-0">
                                        <span className="text-sm text-gray-900">{match.itemName}</span>
                                        <span className="text-xs text-gray-500 ml-2">{match.category}</span>
                                      </div>
                                      <Badge variant="outline" className={cn("text-xs", getConfidenceColor(match.confidence))}>
                                        {Math.round(match.confidence * 100)}%
                                      </Badge>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </div>

            {/* Footer - Review Step */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isLinking}
              >
                {hasUnlinkedChecklist ? 'Skip & Close' : 'Done'}
              </Button>
              {hasUnlinkedChecklist && (
                <Button
                  onClick={linkChecklistItems}
                  disabled={isLinking}
                >
                  {isLinking ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Confirm & Link Checklist
                    </>
                  )}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
