'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Building2,
  MapPin,
  DollarSign,
  Info,
  Sparkles,
  Loader2,
  AlertCircle,
  Brain,
  CheckCircle,
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
}

interface FileDetailPanelProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: () => void;
  onMove?: () => void;
  onAnalysisComplete?: () => void;
}

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
  const [isAddingToIntelligence, setIsAddingToIntelligence] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null);

  // @ts-ignore - Convex type instantiation is excessively deep
  const addToIntelligence = useMutation(api.intelligence.addDocumentToIntelligence);

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

  if (!document) return null;

  const handleOpenReader = () => {
    router.push(`/docs/reader/${document._id}`);
    onClose();
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setAnalyzeError(null);

    try {
      // Fetch the file from storage to re-analyze via V4 pipeline
      if (!fileUrl) {
        throw new Error('File not available for analysis');
      }

      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) throw new Error('Failed to fetch file');
      const blob = await fileResponse.blob();

      const formData = new FormData();
      formData.append('file', new File([blob], document.fileName, { type: document.fileType }));
      if (document.clientId) {
        formData.append('metadata', JSON.stringify({
          clientContext: { clientId: document.clientId },
        }));
      }

      const response = await fetch('/api/v4-analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Analysis failed');
      }

      // Trigger refresh — the Convex live query will pick up updated document data
      onAnalysisComplete?.();
    } catch (error) {
      console.error('Analysis error:', error);
      setAnalyzeError(error instanceof Error ? error.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddToIntelligence = async () => {
    if (!document) return;

    setIsAddingToIntelligence(true);
    setIntelligenceError(null);

    try {
      await addToIntelligence({ documentId: document._id });
    } catch (error) {
      console.error('Add to intelligence error:', error);
      setIntelligenceError(error instanceof Error ? error.message : 'Failed to add to intelligence');
    } finally {
      setIsAddingToIntelligence(false);
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
                    <TabsTrigger value="entities" className="text-xs px-2 py-1.5" disabled={!hasAnalysis}>
                      Entities
                    </TabsTrigger>
                    <TabsTrigger value="data" className="text-xs px-2 py-1.5" disabled={!hasAnalysis}>
                      Key Data
                    </TabsTrigger>
                  </TabsList>
                </div>
                {/* Action Button Area */}
                <div className="flex items-center gap-2">
                  {!hasAnalysis ? (
                    // No analysis yet - show Analyze button
                    <>
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
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3" />
                            Analyze Document
                          </>
                        )}
                      </Button>
                      {analyzeError && (
                        <span className="text-xs text-red-600">{analyzeError}</span>
                      )}
                    </>
                  ) : document.addedToIntelligence ? (
                    // Already added to intelligence - show success indicator
                    <div className="flex items-center gap-1.5 text-xs text-green-600">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Added to Intelligence</span>
                    </div>
                  ) : document.clientId ? (
                    // Has analysis and clientId but not added - show Add to Intelligence button
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAddToIntelligence}
                        disabled={isAddingToIntelligence}
                        className="h-7 text-xs gap-1.5"
                      >
                        {isAddingToIntelligence ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <Brain className="w-3 h-3" />
                            Add to Intelligence
                          </>
                        )}
                      </Button>
                      {intelligenceError && (
                        <span className="text-xs text-red-600">{intelligenceError}</span>
                      )}
                    </>
                  ) : null}
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

                {/* Entities Tab */}
                <TabsContent value="entities" className="mt-0 p-5 space-y-4 data-[state=inactive]:hidden">
                  {hasAnalysis && (
                    <>
                      {/* People */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <User className="w-4 h-4 text-blue-600" />
                          <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">People</span>
                        </div>
                        {document.documentAnalysis!.entities.people.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {document.documentAnalysis!.entities.people.map((person, i) => (
                              <Badge key={i} variant="secondary" className="text-xs px-2 py-1">
                                {person}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">None identified</span>
                        )}
                      </div>

                      <Separator />

                      {/* Companies */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Building2 className="w-4 h-4 text-purple-600" />
                          <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Companies</span>
                        </div>
                        {document.documentAnalysis!.entities.companies.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {document.documentAnalysis!.entities.companies.map((company, i) => (
                              <Badge key={i} variant="secondary" className="text-xs px-2 py-1 bg-purple-50">
                                {company}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">None identified</span>
                        )}
                      </div>

                      <Separator />

                      {/* Locations */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <MapPin className="w-4 h-4 text-green-600" />
                          <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Locations</span>
                        </div>
                        {document.documentAnalysis!.entities.locations.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {document.documentAnalysis!.entities.locations.map((location, i) => (
                              <Badge key={i} variant="secondary" className="text-xs px-2 py-1 bg-green-50">
                                {location}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">None identified</span>
                        )}
                      </div>

                      <Separator />

                      {/* Projects */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-4 h-4 text-amber-600" />
                          <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Projects</span>
                        </div>
                        {document.documentAnalysis!.entities.projects.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {document.documentAnalysis!.entities.projects.map((project, i) => (
                              <Badge key={i} variant="secondary" className="text-xs px-2 py-1 bg-amber-50">
                                {project}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">None identified</span>
                        )}
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* Key Data Tab */}
                <TabsContent value="data" className="mt-0 p-5 space-y-4 data-[state=inactive]:hidden">
                  {hasAnalysis && (
                    <>
                      {/* Key Dates */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className="w-4 h-4 text-green-600" />
                          <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Key Dates</span>
                        </div>
                        {document.documentAnalysis!.keyDates.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {document.documentAnalysis!.keyDates.map((date, i) => (
                              <Badge key={i} variant="outline" className="text-xs px-2 py-1 bg-green-50">
                                {date}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">None identified</span>
                        )}
                      </div>

                      <Separator />

                      {/* Key Amounts */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <DollarSign className="w-4 h-4 text-amber-600" />
                          <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Key Amounts</span>
                        </div>
                        {document.documentAnalysis!.keyAmounts.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {document.documentAnalysis!.keyAmounts.map((amount, i) => (
                              <Badge key={i} variant="outline" className="text-xs px-2 py-1 bg-amber-50 font-mono">
                                {amount}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">None identified</span>
                        )}
                      </div>

                      <Separator />

                      {/* Key Terms */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Tag className="w-4 h-4 text-blue-600" />
                          <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Key Terms</span>
                        </div>
                        {document.documentAnalysis!.keyTerms.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {document.documentAnalysis!.keyTerms.map((term, i) => (
                              <Badge key={i} variant="outline" className="text-xs px-2 py-1">
                                {term}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">None identified</span>
                        )}
                      </div>
                    </>
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
