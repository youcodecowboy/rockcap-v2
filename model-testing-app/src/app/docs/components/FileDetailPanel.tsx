'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Download,
  ExternalLink,
  Calendar,
  HardDrive,
  User,
  FolderOpen,
  Tag,
  FileType,
  Clock,
  Trash2,
  FolderInput,
  BookOpen,
  Info,
  Sparkles,
  Loader2,
  Brain,
  CheckCircle,
  ClipboardCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocumentAnalysis {
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
}

interface Document {
  _id: Id<"documents">;
  fileName: string;
  documentCode?: string;
  summary: string;
  category: string;
  fileTypeDetected?: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  savedAt?: string;
  fileStorageId?: Id<"_storage">;
  clientId?: Id<"clients">;
  clientName?: string;
  projectId?: Id<"projects">;
  projectName?: string;
  version?: string;
  uploaderInitials?: string;
  isInternal?: boolean;
  documentAnalysis?: DocumentAnalysis;
  classificationReasoning?: string;
  addedToIntelligence?: boolean;
  scope?: 'client' | 'internal' | 'personal';
  textContent?: string;
}

interface FileDetailPanelProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: () => void;
  onMove?: () => void;
  onAnalysisComplete?: () => void;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-red-100 text-red-700 border-red-200',
};

function getConfidenceLevel(confidence: number): string {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

const CATEGORY_ICONS: Record<string, string> = {
  financials: 'text-green-600',
  overview: 'text-blue-600',
  timeline: 'text-amber-600',
  location: 'text-emerald-600',
  legal: 'text-purple-600',
  contact: 'text-cyan-600',
  company: 'text-indigo-600',
  financial: 'text-green-600',
  custom: 'text-gray-600',
};

export default function FileDetailPanel({
  document: initialDocument,
  isOpen,
  onClose,
  onDelete,
  onMove,
  onAnalysisComplete,
}: FileDetailPanelProps) {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const updateDocument = useMutation(api.documents.update);
  const saveDocumentIntelligence = useMutation(api.documents.saveDocumentIntelligence);

  // Query document by ID to get reactive updates (e.g., after analysis)
  const liveDocument = useQuery(
    api.documents.get,
    initialDocument?._id ? { id: initialDocument._id } : "skip"
  );

  // Use live document data if available, fall back to initial
  const document = liveDocument || initialDocument;

  // Get file URL for preview/download
  const fileUrl = useQuery(
    api.documents.getFileUrl,
    document?.fileStorageId ? { storageId: document.fileStorageId } : "skip"
  );

  // Query checklist items linked to this document
  const checklistLinks = useQuery(
    api.knowledgeLibrary.getChecklistItemsForDocument,
    document?._id ? { documentId: document._id } : "skip"
  );

  // Query intelligence items extracted from this document
  const intelligenceItems = useQuery(
    api.documents.getDocumentIntelligence,
    document?._id ? { documentId: document._id } : "skip"
  );

  if (!document) return null;

  const handleOpenReader = () => {
    router.push(`/docs/reader/${document._id}`);
    onClose();
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setAnalyzeError(null);

    try {
      // 1. Get text content — prefer saved, fall back to re-extraction via file
      let text = document.textContent;

      if (!text && fileUrl) {
        // Fall back: fetch file and send to v4-analyze to extract text
        const fileResponse = await fetch(fileUrl);
        if (!fileResponse.ok) throw new Error('Failed to fetch file');
        const blob = await fileResponse.blob();

        const formData = new FormData();
        formData.append('file', new globalThis.File([blob], document.fileName, { type: document.fileType }));
        if (document.clientId) {
          formData.append('metadata', JSON.stringify({
            clientContext: { clientId: document.clientId },
          }));
        }

        const v4Response = await fetch('/api/v4-analyze', {
          method: 'POST',
          body: formData,
        });

        if (!v4Response.ok) {
          const errorData = await v4Response.json();
          throw new Error(errorData.error || 'Classification failed');
        }

        const v4Data = await v4Response.json();
        const v4Doc = v4Data.documents?.[0];

        // Save classification results + textContent
        if (v4Doc) {
          const updatePayload: Record<string, any> = { id: document._id };
          if (v4Doc.documentAnalysis) updatePayload.documentAnalysis = v4Doc.documentAnalysis;
          if (v4Doc.summary) updatePayload.summary = v4Doc.summary;
          if (v4Doc.fileType) updatePayload.fileTypeDetected = v4Doc.fileType;
          if (v4Doc.category) updatePayload.category = v4Doc.category;
          if (v4Doc.classificationReasoning) updatePayload.classificationReasoning = v4Doc.classificationReasoning;
          if (v4Doc.extractedText) updatePayload.textContent = v4Doc.extractedText;
          await updateDocument(updatePayload as any);
          text = v4Doc.extractedText;
        }
      }

      if (!text) {
        throw new Error('No text content available for intelligence extraction');
      }

      // 2. Call lightweight intelligence extraction route
      const res = await fetch('/api/intelligence-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document._id,
          documentContent: text,
          documentName: document.fileName,
          documentType: document.fileTypeDetected || 'Unknown',
          documentCategory: document.category || 'Miscellaneous',
          clientId: document.clientId,
          projectId: document.projectId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Intelligence extraction failed');
      }

      const extractionResult = await res.json();
      console.log('[FileDetailPanel] Intelligence extraction result:', extractionResult);

      // Mark document as having intelligence
      if (!document.addedToIntelligence) {
        await updateDocument({ id: document._id, addedToIntelligence: true } as any);
      }

      // Trigger refresh callback
      onAnalysisComplete?.();
    } catch (error) {
      console.error('Analysis error:', error);
      setAnalyzeError(error instanceof Error ? error.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getFileIcon = () => {
    const type = document.fileType.toLowerCase();
    if (type.includes('pdf')) {
      return <FileText className="w-12 h-12 text-red-500" />;
    }
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) {
      return <FileSpreadsheet className="w-12 h-12 text-green-600" />;
    }
    if (type.includes('image') || type.includes('png') || type.includes('jpg') || type.includes('jpeg')) {
      return <FileImage className="w-12 h-12 text-blue-500" />;
    }
    return <File className="w-12 h-12 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Appraisals': 'bg-purple-100 text-purple-800 border-purple-200',
      'Financial': 'bg-green-100 text-green-800 border-green-200',
      'Legal': 'bg-blue-100 text-blue-800 border-blue-200',
      'Terms': 'bg-orange-100 text-orange-800 border-orange-200',
      'Credit': 'bg-red-100 text-red-800 border-red-200',
      'KYC': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'Correspondence': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    };
    return colors[category] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const handleDownload = async () => {
    if (!fileUrl) {
      alert('File not available for download');
      return;
    }

    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.fileName;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download file');
    }
  };

  const handleOpenExternal = () => {
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    }
  };

  const canPreview = document.fileType.toLowerCase().includes('pdf') ||
                     document.fileType.toLowerCase().includes('image');

  const hasAnalysis = !!document.documentAnalysis;
  const hasSummary = hasAnalysis || !!document.summary;
  const hasChecklist = checklistLinks && checklistLinks.length > 0;
  const hasIntelligence = intelligenceItems && intelligenceItems.length > 0;

  // Group intelligence items by category
  const intelligenceByCategory = intelligenceItems
    ? intelligenceItems.reduce((acc: Record<string, any[]>, item: any) => {
        const cat = item.category || 'general';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
      }, {} as Record<string, any[]>)
    : {};

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[1080px] sm:max-w-[1080px] p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl font-semibold truncate pr-4">
              {document.documentCode || document.fileName}
            </SheetTitle>
          </div>
        </SheetHeader>

        {/* Two-column layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column - Document Info */}
          <div className="w-[450px] flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
            <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
              {/* Tab Header */}
              <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <TabsList className="grid grid-cols-4 h-auto p-1">
                    <TabsTrigger value="details" className="text-xs px-2 py-1.5">
                      Details
                    </TabsTrigger>
                    <TabsTrigger value="summary" className="text-xs px-2 py-1.5" disabled={!hasSummary}>
                      Summary
                    </TabsTrigger>
                    <TabsTrigger value="intelligence" className="text-xs px-2 py-1.5">
                      Intelligence
                    </TabsTrigger>
                    <TabsTrigger value="checklist" className="text-xs px-2 py-1.5" disabled={!hasChecklist}>
                      Checklist
                    </TabsTrigger>
                  </TabsList>
                </div>
                {/* Action Button Area */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="h-7 text-xs gap-1.5"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Extracting Intelligence...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        {hasIntelligence ? 'Re-analyze' : 'Analyze Document'}
                      </>
                    )}
                  </Button>
                  {analyzeError && (
                    <span className="text-xs text-red-600">{analyzeError}</span>
                  )}
                </div>
              </div>

              {/* Tab Content - Scrollable */}
              <div className="flex-1 overflow-y-auto min-h-0 scrollbar-subtle">
                {/* Details Tab */}
                <TabsContent value="details" className="mt-0 p-5 space-y-4 data-[state=inactive]:hidden">
                  {/* Original Filename */}
                  {document.documentCode && (
                    <div className="flex items-start gap-2">
                      <File className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Original Filename</div>
                        <div className="text-sm text-gray-900 break-all mt-0.5">{document.fileName}</div>
                      </div>
                    </div>
                  )}

                  {/* Document Type */}
                  {document.fileTypeDetected && (
                    <div className="flex items-start gap-2">
                      <FileType className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Document Type</div>
                        <Badge variant="outline" className="text-sm mt-0.5">
                          {document.fileTypeDetected}
                        </Badge>
                      </div>
                    </div>
                  )}

                  {/* Category */}
                  <div className="flex items-start gap-2">
                    <Tag className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Category</div>
                      <Badge variant="outline" className={cn("text-sm mt-0.5", getCategoryColor(document.category))}>
                        {document.category}
                      </Badge>
                    </div>
                  </div>

                  {/* Client/Project */}
                  {(document.clientName || document.projectName) && (
                    <div className="flex items-start gap-2">
                      <FolderOpen className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Location</div>
                        <div className="text-sm text-gray-900 mt-0.5">
                          {document.clientName}
                          {document.projectName && (
                            <span className="text-gray-500"> / {document.projectName}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* File Size */}
                  <div className="flex items-start gap-2">
                    <HardDrive className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">File Size</div>
                      <div className="text-sm text-gray-900 mt-0.5">{formatFileSize(document.fileSize)}</div>
                    </div>
                  </div>

                  {/* Upload Date */}
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Uploaded</div>
                      <div className="text-sm text-gray-900 mt-0.5">{formatDate(document.uploadedAt)}</div>
                    </div>
                  </div>

                  {/* Version */}
                  {document.version && (
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Version</div>
                        <Badge variant="secondary" className="text-sm mt-0.5">{document.version}</Badge>
                      </div>
                    </div>
                  )}

                  {/* Uploader */}
                  {document.uploaderInitials && (
                    <div className="flex items-start gap-2">
                      <User className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Uploaded By</div>
                        <div className="text-sm text-gray-900 mt-0.5">{document.uploaderInitials}</div>
                      </div>
                    </div>
                  )}

                  {/* Characteristics (show in details if analysis exists) */}
                  {hasAnalysis && (
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Characteristics</div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {document.documentAnalysis!.documentCharacteristics.isFinancial && (
                            <Badge variant="outline" className="text-xs px-2 py-0.5 bg-green-50 text-green-700">Financial</Badge>
                          )}
                          {document.documentAnalysis!.documentCharacteristics.isLegal && (
                            <Badge variant="outline" className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700">Legal</Badge>
                          )}
                          {document.documentAnalysis!.documentCharacteristics.isIdentity && (
                            <Badge variant="outline" className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700">Identity</Badge>
                          )}
                          {document.documentAnalysis!.documentCharacteristics.isReport && (
                            <Badge variant="outline" className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700">Report</Badge>
                          )}
                          {document.documentAnalysis!.documentCharacteristics.isDesign && (
                            <Badge variant="outline" className="text-xs px-2 py-0.5 bg-pink-50 text-pink-700">Design</Badge>
                          )}
                          {document.documentAnalysis!.documentCharacteristics.isCorrespondence && (
                            <Badge variant="outline" className="text-xs px-2 py-0.5 bg-cyan-50 text-cyan-700">Correspondence</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Summary Tab */}
                <TabsContent value="summary" className="mt-0 p-5 space-y-4 data-[state=inactive]:hidden">
                  {hasAnalysis ? (
                    <>
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1.5">Executive Summary</div>
                        <p className="text-sm text-gray-900 leading-relaxed">
                          {document.documentAnalysis!.executiveSummary}
                        </p>
                      </div>
                      <Separator />
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1.5">Detailed Summary</div>
                        <p className="text-sm text-gray-700 leading-relaxed">
                          {document.documentAnalysis!.detailedSummary}
                        </p>
                      </div>
                      {document.classificationReasoning && (
                        <>
                          <Separator />
                          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                            <div className="text-xs text-blue-700 uppercase tracking-wide font-medium mb-1.5">Classification Reasoning</div>
                            <p className="text-xs text-blue-800 leading-relaxed">
                              {document.classificationReasoning}
                            </p>
                          </div>
                        </>
                      )}
                    </>
                  ) : document.summary ? (
                    <>
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1.5">Summary</div>
                        <p className="text-sm text-gray-900 leading-relaxed">
                          {document.summary}
                        </p>
                      </div>
                      {document.classificationReasoning && (
                        <>
                          <Separator />
                          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                            <div className="text-xs text-blue-700 uppercase tracking-wide font-medium mb-1.5">Classification Reasoning</div>
                            <p className="text-xs text-blue-800 leading-relaxed">
                              {document.classificationReasoning}
                            </p>
                          </div>
                        </>
                      )}
                    </>
                  ) : null}
                </TabsContent>

                {/* Intelligence Tab */}
                <TabsContent value="intelligence" className="mt-0 p-5 space-y-4 data-[state=inactive]:hidden">
                  {hasIntelligence ? (
                    <div className="space-y-4">
                      <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        Extracted Fields ({intelligenceItems.length})
                      </div>
                      {Object.entries(intelligenceByCategory).map(([category, items]) => (
                        <div key={category} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Brain className={cn("w-4 h-4", CATEGORY_ICONS[category] || 'text-gray-500')} />
                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                              {category.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                            </span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {(items as any[]).length}
                            </Badge>
                          </div>
                          <div className="space-y-1.5 pl-6">
                            {(items as any[]).map((item: any) => {
                              const level = getConfidenceLevel(item.normalizationConfidence ?? item.confidence ?? 0);
                              return (
                                <div
                                  key={item._id}
                                  className="flex items-start justify-between gap-2 p-2 rounded-md bg-gray-50 border border-gray-100"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-gray-800">
                                      {item.label || item.fieldPath}
                                    </div>
                                    <div className="text-sm text-gray-900 mt-0.5 break-words">
                                      {typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value)}
                                    </div>
                                    {item.sourceText && (
                                      <div className="text-[10px] text-gray-400 mt-0.5 truncate" title={item.sourceText}>
                                        {item.sourceText}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {item.isCanonical && (
                                      <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200">
                                        Canonical
                                      </Badge>
                                    )}
                                    <Badge
                                      variant="outline"
                                      className={cn("text-[10px] px-1 py-0", CONFIDENCE_COLORS[level])}
                                    >
                                      {Math.round((item.normalizationConfidence ?? item.confidence ?? 0) * 100)}%
                                    </Badge>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Brain className="w-8 h-8 text-gray-300 mb-2" />
                      <p className="text-sm text-gray-500">No intelligence extracted yet</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Click &quot;Analyze Document&quot; to extract structured intelligence
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* Checklist Tab */}
                <TabsContent value="checklist" className="mt-0 p-5 space-y-4 data-[state=inactive]:hidden">
                  {hasChecklist ? (
                    <div className="space-y-3">
                      <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">
                        Fulfilled Requirements ({checklistLinks.length})
                      </div>
                      {checklistLinks.map((link: any) => (
                        <div
                          key={link._id}
                          className="flex items-center gap-2.5 p-2.5 bg-green-50 rounded-lg border border-green-100"
                        >
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900">
                              {link.checklistItem?.name || 'Unknown requirement'}
                            </div>
                            {link.checklistItem?.category && (
                              <div className="text-xs text-gray-500 mt-0.5">{link.checklistItem.category}</div>
                            )}
                          </div>
                          {link.isPrimary && (
                            <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-200">
                              Primary
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <ClipboardCheck className="w-8 h-8 text-gray-300 mb-2" />
                      <p className="text-sm text-gray-500">No checklist items linked</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Upload with analysis enabled to match checklist requirements
                      </p>
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>

          {/* Right Column - Document Preview */}
          <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
            <div className="flex-1 p-4 flex flex-col">
              {canPreview && fileUrl ? (
                <div className="w-full flex-1 min-h-0">
                  {document.fileType.toLowerCase().includes('pdf') ? (
                    <iframe
                      src={`${fileUrl}#toolbar=0`}
                      className="w-full h-full rounded-lg border border-gray-200 bg-white"
                      style={{ minHeight: '600px' }}
                      title="PDF Preview"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <img
                        src={fileUrl}
                        alt={document.fileName}
                        className="max-w-full max-h-full rounded-lg border border-gray-200"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-center">
                  {getFileIcon()}
                  <p className="mt-4 text-base text-gray-500">Preview not available</p>
                  <p className="mt-1 text-sm text-gray-400">
                    {document.fileType.toUpperCase()} files cannot be previewed
                  </p>
                  <Button
                    variant="outline"
                    size="default"
                    className="mt-4 gap-2"
                    onClick={handleOpenExternal}
                    disabled={!fileUrl}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in New Tab
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sticky Footer Actions */}
        <div className="border-t border-gray-200 p-4 flex-shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <Button
              size="lg"
              className="flex-1 gap-2"
              onClick={handleOpenReader}
            >
              <BookOpen className="w-5 h-5" />
              Open in Reader
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              onClick={handleDownload}
              disabled={!fileUrl}
            >
              <Download className="w-5 h-5" />
              Download
            </Button>
            {onMove && (
              <Button variant="outline" size="lg" className="gap-2" onClick={onMove}>
                <FolderInput className="w-5 h-5" />
                Move
              </Button>
            )}
            {onDelete && (
              <Button
                variant="outline"
                size="lg"
                className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={onDelete}
              >
                <Trash2 className="w-5 h-5" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
