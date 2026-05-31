'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';

// Lazy-loaded xlsx renderer (shared with mobile). ExcelJS + SheetJS are heavy
// and only needed when previewing a spreadsheet, so we keep them out of the
// initial bundle.
const XlsxPreview = dynamic(() => import('@/components/preview/XlsxPreview'), { ssr: false });
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button, IconButton, Input, StatusPill, FlagChip, Section, Row, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
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
  FolderOpen,
  Trash2,
  FolderInput,
  BookOpen,
  Sparkles,
  Loader2,
  Brain,
  CheckCircle,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Link as LinkIcon,
  Unlink,
  Search,
  Clock,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThreadPanel } from '@/components/threads';
import DocumentNotes from '@/components/DocumentNotes';

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

function getConfidenceLevel(confidence: number): string {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

export default function FileDetailPanel({
  document: initialDocument,
  isOpen,
  onClose,
  onDelete,
  onMove,
  onAnalysisComplete,
}: FileDetailPanelProps) {
  const colors = useColors();
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  // Zoom state for xlsx preview (1.0 = 100%, range 0.5 → 4.0 in 0.25 steps)
  const [xlsxZoom, setXlsxZoom] = useState(1);
  const xlsxZoomIn = () => setXlsxZoom(z => Math.min(4, +(z + 0.25).toFixed(2)));
  const xlsxZoomOut = () => setXlsxZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)));
  const xlsxZoomReset = () => setXlsxZoom(1);
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

  // Query all checklist items for this document's client (for checklist tab)
  const allChecklistItems = useQuery(
    api.knowledgeLibrary.getChecklistByClient,
    document?.clientId ? { clientId: document.clientId } : "skip"
  ) as any[] | undefined;

  // Query open flag count for this document
  const openFlagCount = useQuery(
    api.flags.getOpenCountByEntity,
    document?._id ? { entityType: "document" as const, entityId: document._id } : "skip"
  );

  // Current user for linking
  const currentUser = useQuery(api.users.getCurrent) as { _id: Id<"users"> } | null | undefined;

  // Mutations for linking/unlinking
  const linkDocToChecklist = useMutation(api.knowledgeLibrary.linkDocumentToRequirement);
  const unlinkDocFromChecklist = useMutation(api.knowledgeLibrary.unlinkDocumentFromChecklistItem);

  // Search state for checklist tab
  const [checklistSearch, setChecklistSearch] = useState('');

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
      return <FileText className="w-12 h-12" style={{ color: colors.accent.red }} />;
    }
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) {
      return <FileSpreadsheet className="w-12 h-12" style={{ color: colors.accent.green }} />;
    }
    if (type.includes('image') || type.includes('png') || type.includes('jpg') || type.includes('jpeg')) {
      return <FileImage className="w-12 h-12" style={{ color: colors.accent.blue }} />;
    }
    return <File className="w-12 h-12" style={{ color: colors.text.muted }} />;
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

  // Map document category to a canon accent tone.
  const getCategoryTone = (category: string): string => {
    const tones: Record<string, string> = {
      'Appraisals': colors.accent.purple,
      'Financial': colors.accent.green,
      'Legal': colors.accent.blue,
      'Terms': colors.accent.orange,
      'Credit': colors.accent.red,
      'KYC': colors.accent.yellow,
      'Correspondence': colors.accent.cyan,
    };
    return tones[category] || colors.text.muted;
  };

  const confidenceTone = (level: string): string =>
    level === 'high' ? colors.accent.green : level === 'medium' ? colors.accent.yellow : colors.accent.red;

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
      link.download = document.displayName || document.documentCode || document.fileName;
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

  const isXlsx = (() => {
    const t = document.fileType.toLowerCase();
    if (t.includes('spreadsheetml') || t.includes('ms-excel')) return true;
    return /\.(xlsx|xls|xlsm)$/i.test(document.fileName);
  })();

  const canPreview = document.fileType.toLowerCase().includes('pdf') ||
                     document.fileType.toLowerCase().includes('image') ||
                     isXlsx;

  const hasAnalysis = !!document.documentAnalysis;
  const hasSummary = hasAnalysis || !!document.summary;
  const hasChecklist = checklistLinks && checklistLinks.length > 0;
  const hasIntelligence = intelligenceItems && intelligenceItems.length > 0;

  // Derive set of checklist item IDs already linked to this document
  const linkedChecklistItemIds = new Set(
    (checklistLinks || []).map((link: any) => link.checklistItem?._id as string).filter(Boolean)
  );

  // Filter and group checklist items for display
  const filteredChecklistItems = (allChecklistItems || []).filter((item: any) =>
    !checklistSearch ||
    item.name?.toLowerCase().includes(checklistSearch.toLowerCase()) ||
    item.category?.toLowerCase().includes(checklistSearch.toLowerCase())
  );

  const checklistByCategory = filteredChecklistItems.reduce((acc: Record<string, any[]>, item: any) => {
    const cat = item.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, any[]>);

  // Group intelligence items by category
  const intelligenceByCategory = intelligenceItems
    ? intelligenceItems.reduce((acc: Record<string, any[]>, item: any) => {
        const cat = item.category || 'general';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
      }, {} as Record<string, any[]>)
    : {};

  const tabTrigger = "text-xs px-2 py-1.5";

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[1460px] sm:max-w-[1460px] p-0 flex flex-col" style={{ background: colors.bg.card }}>
        <SheetHeader className="px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl font-semibold truncate pr-4" style={{ color: colors.text.primary }}>
              {document.displayName || document.documentCode || document.fileName}
            </SheetTitle>
          </div>
        </SheetHeader>

        {/* Two-column layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column - Document Info */}
          <div className="w-[450px] flex-shrink-0 flex flex-col overflow-hidden" style={{ borderRight: `1px solid ${colors.border.default}` }}>
            <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
              {/* Tab Header */}
              <div className="px-4 pt-4 pb-2 flex-shrink-0" style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                <div className="flex items-center justify-between mb-3">
                  <TabsList className="grid grid-cols-6 h-auto p-1">
                    <TabsTrigger value="details" className={tabTrigger}>Details</TabsTrigger>
                    <TabsTrigger value="summary" className={tabTrigger} disabled={!hasSummary}>Summary</TabsTrigger>
                    <TabsTrigger value="intelligence" className={tabTrigger}>Intel</TabsTrigger>
                    <TabsTrigger value="checklist" className={tabTrigger}>Checklist</TabsTrigger>
                    <TabsTrigger value="notes" className={tabTrigger}>Notes</TabsTrigger>
                    <TabsTrigger value="threads" className={cn(tabTrigger, 'relative')}>
                      Threads
                      {openFlagCount !== undefined && openFlagCount > 0 && (
                        <span
                          className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 rounded-full text-[10px] font-semibold px-1"
                          style={{ background: `${colors.accent.orange}20`, color: colors.accent.orange }}
                        >
                          {openFlagCount}
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>
                </div>
                {/* Action Button Area */}
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={handleAnalyze} disabled={isAnalyzing}>
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
                    <span className="text-xs" style={{ color: colors.accent.red }}>{analyzeError}</span>
                  )}
                </div>
              </div>

              {/* Tab Content - Scrollable */}
              <div className="flex-1 overflow-y-auto min-h-0 scrollbar-subtle">
                {/* Details Tab */}
                <TabsContent value="details" className="mt-0 p-5 data-[state=inactive]:hidden">
                  <Section title="Document">
                    {document.documentCode && (
                      <Row label="Original filename" value={document.fileName} mono />
                    )}
                    {document.fileTypeDetected && (
                      <Row label="Document type" value={document.fileTypeDetected} />
                    )}
                    <Row
                      label="Category"
                      value={document.category}
                      pill={getCategoryTone(document.category)}
                    />
                    {(document.clientName || document.projectName) && (
                      <Row
                        label="Location"
                        value={
                          <>
                            {document.clientName}
                            {document.projectName && (
                              <span style={{ color: colors.text.muted }}> / {document.projectName}</span>
                            )}
                          </>
                        }
                      />
                    )}
                    <Row label="File size" value={formatFileSize(document.fileSize)} />
                    <Row label="Uploaded" value={formatDate(document.uploadedAt)} />
                    {document.version && (
                      <Row label="Version" value={document.version} mono />
                    )}
                    {document.uploaderInitials && (
                      <Row label="Uploaded by" value={document.uploaderInitials} />
                    )}
                  </Section>

                  {/* Characteristics (show in details if analysis exists) */}
                  {hasAnalysis && (
                    <Section title="Characteristics">
                      <div className="flex flex-wrap gap-1.5">
                        {document.documentAnalysis!.documentCharacteristics.isFinancial && (
                          <StatusPill label="Financial" tone={colors.accent.green} />
                        )}
                        {document.documentAnalysis!.documentCharacteristics.isLegal && (
                          <StatusPill label="Legal" tone={colors.accent.blue} />
                        )}
                        {document.documentAnalysis!.documentCharacteristics.isIdentity && (
                          <StatusPill label="Identity" tone={colors.accent.purple} />
                        )}
                        {document.documentAnalysis!.documentCharacteristics.isReport && (
                          <StatusPill label="Report" tone={colors.accent.orange} />
                        )}
                        {document.documentAnalysis!.documentCharacteristics.isDesign && (
                          <StatusPill label="Design" tone={colors.accent.purple} />
                        )}
                        {document.documentAnalysis!.documentCharacteristics.isCorrespondence && (
                          <StatusPill label="Correspondence" tone={colors.accent.cyan} />
                        )}
                      </div>
                    </Section>
                  )}
                </TabsContent>

                {/* Summary Tab */}
                <TabsContent value="summary" className="mt-0 p-5 space-y-4 data-[state=inactive]:hidden">
                  {hasAnalysis ? (
                    <>
                      <div>
                        <div className="text-xs uppercase tracking-wide font-medium mb-1.5" style={{ color: colors.text.muted }}>Executive Summary</div>
                        <p className="text-sm leading-relaxed" style={{ color: colors.text.primary }}>
                          {document.documentAnalysis!.executiveSummary}
                        </p>
                      </div>
                      <Separator />
                      <div>
                        <div className="text-xs uppercase tracking-wide font-medium mb-1.5" style={{ color: colors.text.muted }}>Detailed Summary</div>
                        <p className="text-sm leading-relaxed" style={{ color: colors.text.secondary }}>
                          {document.documentAnalysis!.detailedSummary}
                        </p>
                      </div>
                      {document.classificationReasoning && (
                        <>
                          <Separator />
                          <div className="p-3 rounded" style={{ background: `${colors.accent.blue}10`, border: `1px solid ${colors.accent.blue}30` }}>
                            <div className="text-xs uppercase tracking-wide font-medium mb-1.5" style={{ color: colors.accent.blue }}>Classification Reasoning</div>
                            <p className="text-xs leading-relaxed" style={{ color: colors.accent.blue }}>
                              {document.classificationReasoning}
                            </p>
                          </div>
                        </>
                      )}
                    </>
                  ) : document.summary ? (
                    <>
                      <div>
                        <div className="text-xs uppercase tracking-wide font-medium mb-1.5" style={{ color: colors.text.muted }}>Summary</div>
                        <p className="text-sm leading-relaxed" style={{ color: colors.text.primary }}>
                          {document.summary}
                        </p>
                      </div>
                      {document.classificationReasoning && (
                        <>
                          <Separator />
                          <div className="p-3 rounded" style={{ background: `${colors.accent.blue}10`, border: `1px solid ${colors.accent.blue}30` }}>
                            <div className="text-xs uppercase tracking-wide font-medium mb-1.5" style={{ color: colors.accent.blue }}>Classification Reasoning</div>
                            <p className="text-xs leading-relaxed" style={{ color: colors.accent.blue }}>
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
                      <div className="text-xs uppercase tracking-wide font-medium" style={{ color: colors.text.muted }}>
                        Extracted Fields ({intelligenceItems.length})
                      </div>
                      {Object.entries(intelligenceByCategory).map(([category, items]) => (
                        <div key={category} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Brain className="w-4 h-4" style={{ color: colors.text.muted }} />
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.text.secondary }}>
                              {category.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                            </span>
                            <StatusPill label={String((items as any[]).length)} tone={colors.text.muted} />
                          </div>
                          <div className="space-y-1.5 pl-6">
                            {(items as any[]).map((item: any) => {
                              const level = getConfidenceLevel(item.normalizationConfidence ?? item.confidence ?? 0);
                              return (
                                <div
                                  key={item._id}
                                  className="flex items-start justify-between gap-2 p-2 rounded"
                                  style={{ background: colors.bg.cardAlt, border: `1px solid ${colors.border.light}` }}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium" style={{ color: colors.text.secondary }}>
                                      {item.label || item.fieldPath}
                                    </div>
                                    <div className="text-sm mt-0.5 break-words" style={{ color: colors.text.primary }}>
                                      {typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value)}
                                    </div>
                                    {item.sourceText && (
                                      <div className="text-[10px] mt-0.5 truncate" style={{ color: colors.text.dim }} title={item.sourceText}>
                                        {item.sourceText}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {item.isCanonical && (
                                      <StatusPill label="Canonical" tone={colors.accent.blue} />
                                    )}
                                    <StatusPill
                                      label={`${Math.round((item.normalizationConfidence ?? item.confidence ?? 0) * 100)}%`}
                                      tone={confidenceTone(level)}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Brain className="w-8 h-8" />}
                      title="No intelligence extracted yet"
                      body='Click "Analyze Document" to extract structured intelligence'
                    />
                  )}
                </TabsContent>

                {/* Checklist Tab */}
                <TabsContent value="checklist" className="mt-0 p-5 space-y-4 data-[state=inactive]:hidden">
                  {!document.clientId ? (
                    <EmptyState
                      icon={<ClipboardCheck className="w-8 h-8" />}
                      title="No client associated"
                      body="This document must be filed to a client to view checklist items"
                    />
                  ) : (
                    <>
                      {/* Search */}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: colors.text.dim, pointerEvents: 'none', zIndex: 1 }} />
                        <Input
                          placeholder="Search checklist items..."
                          value={checklistSearch}
                          onChange={(e) => setChecklistSearch(e.target.value)}
                          style={{ paddingLeft: 30 }}
                        />
                      </div>

                      {/* Linked Requirements */}
                      {hasChecklist && (
                        <div className="space-y-2">
                          <div className="text-xs uppercase tracking-wide font-medium" style={{ color: colors.text.muted }}>
                            Linked to this Document ({checklistLinks.length})
                          </div>
                          {checklistLinks.map((link: any) => (
                            <div
                              key={link._id}
                              className="flex items-center gap-2.5 p-2.5 rounded group"
                              style={{ background: `${colors.accent.green}10`, border: `1px solid ${colors.accent.green}30` }}
                            >
                              <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.green }} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium" style={{ color: colors.text.primary }}>
                                  {link.checklistItem?.name || 'Unknown requirement'}
                                </div>
                                {link.checklistItem?.category && (
                                  <div className="text-xs mt-0.5" style={{ color: colors.text.muted }}>{link.checklistItem.category}</div>
                                )}
                              </div>
                              {link.isPrimary && (
                                <StatusPill label="Primary" tone={colors.accent.green} />
                              )}
                              <span
                                className="opacity-0 group-hover:opacity-100 flex-shrink-0"
                                onClick={async () => {
                                  await unlinkDocFromChecklist({
                                    checklistItemId: link.checklistItem?._id,
                                    documentId: document._id,
                                  });
                                }}
                              >
                                <IconButton label="Unlink" style={{ width: 24, height: 24 }}>
                                  <Unlink className="w-3.5 h-3.5" />
                                </IconButton>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* All Available Requirements */}
                      {allChecklistItems === undefined ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin" style={{ color: colors.text.dim }} />
                        </div>
                      ) : Object.keys(checklistByCategory).length === 0 ? (
                        <EmptyState
                          icon={<ClipboardCheck className="w-8 h-8" />}
                          title={checklistSearch ? 'No matching requirements' : 'No checklist items for this client'}
                        />
                      ) : (
                        <div className="space-y-3">
                          <div className="text-xs uppercase tracking-wide font-medium" style={{ color: colors.text.muted }}>
                            Available Requirements
                          </div>
                          {Object.entries(checklistByCategory).map(([category, items]) => (
                            <div key={category}>
                              <div className="text-xs font-medium mb-1.5 px-1" style={{ color: colors.text.secondary }}>{category}</div>
                              <div className="space-y-1">
                                {(items as any[]).map((item: any) => {
                                  const isLinked = linkedChecklistItemIds.has(item._id as string);
                                  return (
                                    <div
                                      key={item._id}
                                      className="flex items-center gap-2.5 p-2 rounded"
                                      style={{
                                        background: isLinked
                                          ? `${colors.accent.green}10`
                                          : item.status === 'fulfilled'
                                          ? colors.bg.cardAlt
                                          : colors.bg.card,
                                        border: `1px solid ${isLinked ? `${colors.accent.green}30` : colors.border.default}`,
                                        transition: 'border-color 100ms linear',
                                      }}
                                    >
                                      {item.status === 'fulfilled' ? (
                                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.green }} />
                                      ) : item.status === 'pending_review' ? (
                                        <Clock className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.orange }} />
                                      ) : (
                                        <Circle className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.dim }} />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium truncate" style={{ color: colors.text.primary }}>
                                          {item.name}
                                        </div>
                                      </div>
                                      {isLinked ? (
                                        <StatusPill label="Linked" tone={colors.accent.green} />
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={async () => {
                                            if (!currentUser?._id) return;
                                            await linkDocToChecklist({
                                              checklistItemId: item._id,
                                              documentId: document._id,
                                              userId: currentUser._id,
                                            });
                                          }}
                                        >
                                          <LinkIcon className="w-3 h-3" />
                                          Link
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                {/* Notes Tab */}
                <TabsContent value="notes" className="mt-0 p-5 flex-1 data-[state=inactive]:hidden">
                  <DocumentNotes
                    documentId={document._id}
                    clientId={document.clientId}
                    projectId={document.projectId}
                  />
                </TabsContent>

                {/* Threads Tab */}
                <TabsContent value="threads" className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
                  <div className="h-full">
                    <ThreadPanel
                      entityType="document"
                      entityId={document._id}
                      clientId={document.clientId}
                      projectId={document.projectId}
                      compact
                      showCreateButton
                    />
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>

          {/* Right Column - Document Preview */}
          <div className="flex-1 flex flex-col min-w-0" style={{ background: colors.bg.light }}>
            <div className="flex-1 p-4 flex flex-col">
              {canPreview && fileUrl ? (
                <div className="w-full flex-1 min-h-0 relative">
                  {document.fileType.toLowerCase().includes('pdf') ? (
                    // Browser's native PDF viewer. toolbar=1 exposes the
                    // built-in zoom / pan / page controls inside the iframe
                    // chrome. Our custom zoom toolbar is xlsx-only and not
                    // shown for PDFs — the browser's viewer handles it.
                    <iframe
                      src={`${fileUrl}#toolbar=1&navpanes=0`}
                      className="w-full h-full"
                      style={{ minHeight: '600px', borderRadius: 4, border: `1px solid ${colors.border.default}`, background: colors.bg.card }}
                      title="PDF Preview"
                    />
                  ) : isXlsx ? (
                    /* Absolute inset-0 escapes the deeply-nested flex/percentage
                       height chain. The parent canPreview wrapper has 'relative'
                       so this fills the parent's content rect with a definite
                       size — flex-1 inside resolves cleanly without depending on
                       CSS percentage height resolution at this nesting depth. */
                    <div className="absolute inset-0 flex flex-col">
                      {/* Zoom toolbar */}
                      <div className="flex items-center justify-center gap-1 mb-2 flex-shrink-0">
                        <IconButton label="Zoom out" onClick={xlsxZoomOut}>
                          <ZoomOut className="w-4 h-4" />
                        </IconButton>
                        <span className="text-xs w-12 text-center font-medium tabular-nums" style={{ color: colors.text.secondary }}>
                          {Math.round(xlsxZoom * 100)}%
                        </span>
                        <IconButton label="Zoom in" onClick={xlsxZoomIn}>
                          <ZoomIn className="w-4 h-4" />
                        </IconButton>
                        {xlsxZoom !== 1 && (
                          <IconButton label="Reset zoom" onClick={xlsxZoomReset} style={{ marginLeft: 4 }}>
                            <RotateCcw className="w-3.5 h-3.5" />
                          </IconButton>
                        )}
                      </div>
                      {/* Scrollable canvas — flex flex-col so XlsxPreview's
                          outer flex-1 has a flex parent to grow within. */}
                      <div className="flex-1 min-h-0 flex flex-col">
                        <XlsxPreview
                          fileUrl={fileUrl}
                          zoom={xlsxZoom}
                          fillParent
                          forceVisibleScrollbars
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <img
                        src={fileUrl}
                        alt={document.fileName}
                        className="max-w-full max-h-full"
                        style={{ borderRadius: 4, border: `1px solid ${colors.border.default}` }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-center">
                  {getFileIcon()}
                  <p className="mt-4 text-base" style={{ color: colors.text.muted }}>Preview not available</p>
                  <p className="mt-1 text-sm" style={{ color: colors.text.dim }}>
                    {document.fileType.toUpperCase()} files cannot be previewed
                  </p>
                  <div className="mt-4">
                    <Button variant="secondary" onClick={handleOpenExternal} disabled={!fileUrl}>
                      <ExternalLink className="w-4 h-4" />
                      Open in New Tab
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sticky Footer Actions */}
        <div className="p-4 flex-shrink-0" style={{ borderTop: `1px solid ${colors.border.default}`, background: colors.bg.card }}>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={handleOpenReader} style={{ flex: 1, justifyContent: 'center', padding: '10px 14px' }}>
              <BookOpen className="w-5 h-5" />
              Open in Reader
            </Button>
            <Button variant="secondary" onClick={handleDownload} disabled={!fileUrl} style={{ padding: '10px 14px' }}>
              <Download className="w-5 h-5" />
              Download
            </Button>
            {onMove && (
              <Button variant="secondary" onClick={onMove} style={{ padding: '10px 14px' }}>
                <FolderInput className="w-5 h-5" />
                Move
              </Button>
            )}
            {onDelete && (
              <Button variant="danger" onClick={onDelete} style={{ padding: '10px 14px' }}>
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
