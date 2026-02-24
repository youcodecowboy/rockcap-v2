'use client';

import React, { useState, useMemo } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Database,
  ChevronDown,
  ChevronRight,
  Edit2,
  Info,
  ClipboardCheck,
  Sparkles,
  Brain,
  Building2,
  User,
  MapPin,
  Calendar,
  DollarSign,
  Tag,
  FileSearch,
  HardDrive,
} from 'lucide-react';
import { FILE_CATEGORIES, FILE_TYPES as FILE_TYPES_LIST } from '@/lib/categories';

// Use the centralized categories and file types
const CATEGORIES = [...FILE_CATEGORIES];
const FILE_TYPES = [...FILE_TYPES_LIST];

// Default folder options for project-level (fallback if no custom folders loaded)
const DEFAULT_PROJECT_FOLDERS = [
  { value: 'background', label: 'Background', isCustom: false },
  { value: 'terms_comparison', label: 'Terms Comparison', isCustom: false },
  { value: 'terms_request', label: 'Terms Request', isCustom: false },
  { value: 'credit_submission', label: 'Credit Submission', isCustom: false },
  { value: 'post_completion', label: 'Post-completion', isCustom: false },
  { value: 'appraisals', label: 'Appraisals', isCustom: false },
  { value: 'notes', label: 'Notes', isCustom: false },
  { value: 'operational_model', label: 'Operational Model', isCustom: false },
];

// Default client-level folders (fallback if no custom folders loaded)
const DEFAULT_CLIENT_FOLDERS = [
  { value: 'kyc', label: 'KYC', isCustom: false },
  { value: 'background_docs', label: 'Background', isCustom: false },
  { value: 'miscellaneous', label: 'Miscellaneous', isCustom: false },
];

interface SuggestedChecklistItem {
  itemId: Id<"knowledgeChecklistItems">;
  itemName: string;
  category?: string;
  confidence: number;
  reasoning?: string;
}

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

interface BulkUploadItem {
  _id: Id<"bulkUploadItems">;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileStorageId?: string;
  status: "pending" | "processing" | "ready_for_review" | "filed" | "error";
  summary?: string;
  fileTypeDetected?: string;
  category?: string;
  targetFolder?: string;
  confidence?: number;
  isInternal?: boolean;
  extractionEnabled?: boolean;
  extractedData?: {
    costs?: Array<any>;
    projectInfo?: any;
    budgetSummary?: any;
    confidence?: number;
    tokensUsed?: number;
    extractionNotes?: string;
  };
  generatedDocumentCode?: string;
  version?: string;
  isDuplicate?: boolean;
  duplicateOfDocumentId?: Id<"documents">;
  versionType?: "minor" | "significant";
  error?: string;
  checklistItemIds?: Id<"knowledgeChecklistItems">[];
  suggestedChecklistItems?: SuggestedChecklistItem[];
  userEdits?: {
    fileTypeDetected?: boolean;
    category?: boolean;
    targetFolder?: boolean;
    isInternal?: boolean;
    checklistItems?: boolean;
  };
  userNote?: {
    content: string;
    addToIntelligence: boolean;
    intelligenceTarget?: "client" | "project";
    createdAt: string;
    updatedAt: string;
  };
  // Document analysis from multi-stage pipeline (Stage 1: Summary Agent)
  documentAnalysis?: DocumentAnalysis;
  // Classification reasoning from Stage 2 Classification Agent
  classificationReasoning?: string;
}

interface ChecklistItem {
  _id: Id<"knowledgeChecklistItems">;
  name: string;
  category: string;
  status: string;
  linkedDocumentCount?: number;
}

interface BulkReviewTableProps {
  items: BulkUploadItem[];
  batchIsInternal: boolean;
  hasProject: boolean;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
  onRefresh?: () => void;
}

export default function BulkReviewTable({
  items,
  batchIsInternal,
  hasProject,
  clientId,
  projectId,
  onRefresh,
}: BulkReviewTableProps) {
  const [selectedItems, setSelectedItems] = useState<Set<Id<"bulkUploadItems">>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<Id<"bulkUploadItems">>>(new Set());
  const [versionDialogItem, setVersionDialogItem] = useState<BulkUploadItem | null>(null);
  const [checklistPopoverOpen, setChecklistPopoverOpen] = useState<Id<"bulkUploadItems"> | null>(null);

  // Note editing state
  const [editingNoteItemId, setEditingNoteItemId] = useState<Id<"bulkUploadItems"> | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [addToIntelligence, setAddToIntelligence] = useState(false);
  const [intelligenceTarget, setIntelligenceTarget] = useState<"client" | "project">("project");
  const [noteSaving, setNoteSaving] = useState(false);

  // Query for checklist items
  const checklistItems = useQuery(
    // @ts-ignore - Known Convex TypeScript type instantiation depth issue
    api.knowledgeLibrary.getAllChecklistItemsForClient,
    clientId ? { clientId, projectId } : "skip"
  ) as ChecklistItem[] | undefined;

  // Query for client folders (when no project selected)
  const clientFolders = useQuery(
    api.clients.getClientFolders,
    clientId && !projectId ? { clientId } : "skip"
  );

  // Query for project folders (when project selected)
  const projectFolders = useQuery(
    api.projects.getProjectFolders,
    projectId ? { projectId } : "skip"
  );

  // Build folder options combining defaults with custom folders
  const folderOptions = useMemo(() => {
    if (hasProject && projectFolders) {
      // Project level: use project folders from database
      return projectFolders.map(f => ({
        value: f.folderType,
        label: f.name,
        isCustom: f.isCustom || false,
      }));
    } else if (!hasProject && clientFolders) {
      // Client level: use client folders from database
      return clientFolders.map(f => ({
        value: f.folderType,
        label: f.name,
        isCustom: f.isCustom || false,
      }));
    } else {
      // Fallback to defaults
      return hasProject ? DEFAULT_PROJECT_FOLDERS : DEFAULT_CLIENT_FOLDERS;
    }
  }, [hasProject, projectFolders, clientFolders]);

  // Mutations
  const updateItemDetails = useMutation(api.bulkUpload.updateItemDetails);
  const toggleExtraction = useMutation(api.bulkUpload.toggleExtraction);
  const setVersionType = useMutation(api.bulkUpload.setVersionType);
  const saveExtractedData = useMutation(api.bulkUpload.saveExtractedData);
  const updateItemNote = useMutation(api.bulkUpload.updateItemNote);

  // Stats
  const stats = useMemo(() => {
    const total = items.length;
    const pending = items.filter(i => i.status === 'pending').length;
    const processing = items.filter(i => i.status === 'processing').length;
    const ready = items.filter(i => i.status === 'ready_for_review').length;
    const filed = items.filter(i => i.status === 'filed').length;
    const errors = items.filter(i => i.status === 'error').length;
    const duplicates = items.filter(i => i.isDuplicate).length;
    const unresolvedDuplicates = items.filter(i => i.isDuplicate && !i.versionType).length;
    const extractionEnabled = items.filter(i => i.extractionEnabled).length;

    return {
      total,
      pending,
      processing,
      ready,
      filed,
      errors,
      duplicates,
      unresolvedDuplicates,
      extractionEnabled,
    };
  }, [items]);

  // Toggle item selection
  const toggleSelection = (itemId: Id<"bulkUploadItems">) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Toggle all selection
  const toggleAllSelection = () => {
    const reviewableItems = items.filter(i => i.status === 'ready_for_review');
    if (selectedItems.size === reviewableItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(reviewableItems.map(i => i._id)));
    }
  };

  // Toggle expanded row
  const toggleExpanded = (itemId: Id<"bulkUploadItems">) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Handle field updates
  const handleUpdateField = async (
    itemId: Id<"bulkUploadItems">,
    field: keyof Pick<BulkUploadItem, 'fileTypeDetected' | 'category' | 'isInternal' | 'targetFolder'>,
    value: string | boolean
  ) => {
    try {
      await updateItemDetails({
        itemId,
        [field]: value,
      });
      onRefresh?.();
    } catch (error) {
      console.error('Failed to update field:', error);
    }
  };

  // Handle checklist item toggle
  const handleToggleChecklistItem = async (
    itemId: Id<"bulkUploadItems">,
    checklistItemId: Id<"knowledgeChecklistItems">,
    currentChecklistIds: Id<"knowledgeChecklistItems">[]
  ) => {
    try {
      const isSelected = currentChecklistIds.includes(checklistItemId);
      const newIds = isSelected
        ? currentChecklistIds.filter(id => id !== checklistItemId)
        : [...currentChecklistIds, checklistItemId];
      
      await updateItemDetails({
        itemId,
        checklistItemIds: newIds,
      });
      onRefresh?.();
    } catch (error) {
      console.error('Failed to update checklist items:', error);
    }
  };

  // Group checklist items by category
  const groupedChecklistItems = useMemo(() => {
    if (!checklistItems) return {};
    return checklistItems.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, ChecklistItem[]>);
  }, [checklistItems]);

  // Handle extraction toggle (just marks intent, extraction runs after filing)
  const handleToggleExtraction = async (itemId: Id<"bulkUploadItems">, enabled: boolean) => {
    try {
      await toggleExtraction({ itemId, enabled });
      onRefresh?.();
    } catch (error) {
      console.error('Failed to toggle extraction:', error);
    }
  };

  // Handle version type selection
  const handleSetVersionType = async (itemId: Id<"bulkUploadItems">, versionType: "minor" | "significant") => {
    try {
      await setVersionType({ itemId, versionType });
      setVersionDialogItem(null);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to set version type:', error);
    }
  };

  // Get status badge - compact version
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="text-[10px] h-5 px-1.5">Wait</Badge>;
      case 'processing':
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-[10px] h-5 px-1.5">
            <Loader2 className="w-2.5 h-2.5 mr-0.5 animate-spin" />
          </Badge>
        );
      case 'ready_for_review':
        return <Badge variant="default" className="text-[10px] h-5 px-1.5">Ready</Badge>;
      case 'filed':
        return (
          <Badge variant="default" className="bg-green-100 text-green-700 text-[10px] h-5 px-1.5">
            <CheckCircle2 className="w-2.5 h-2.5" />
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
            <XCircle className="w-2.5 h-2.5" />
          </Badge>
        );
      default:
        return <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{status}</Badge>;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Stats Bar - Compact */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg text-xs">
          <span className="font-medium">{stats.total} files</span>
          {stats.ready > 0 && (
            <Badge variant="default" className="text-[10px] h-5">{stats.ready} ready</Badge>
          )}
          {stats.processing > 0 && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-[10px] h-5">
              {stats.processing} processing
            </Badge>
          )}
          {stats.filed > 0 && (
            <Badge variant="default" className="bg-green-100 text-green-700 text-[10px] h-5">
              {stats.filed} filed
            </Badge>
          )}
          {stats.errors > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5">{stats.errors} errors</Badge>
          )}
          {stats.unresolvedDuplicates > 0 && (
            <Badge variant="outline" className="border-amber-500 text-amber-700 text-[10px] h-5">
              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
              {stats.unresolvedDuplicates} duplicates
            </Badge>
          )}
          {stats.extractionEnabled > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="border-blue-500 text-blue-700 text-[10px] h-5">
                  <Database className="w-2.5 h-2.5 mr-0.5" />
                  {stats.extractionEnabled} for extraction
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Data extraction will run after filing</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          <div className="flex-1" />
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-x-auto">
          <Table className="w-full min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 px-2">
                  <Checkbox
                    checked={selectedItems.size === items.filter(i => i.status === 'ready_for_review').length && selectedItems.size > 0}
                    onCheckedChange={toggleAllSelection}
                  />
                </TableHead>
                <TableHead className="w-8 px-1"></TableHead>
                <TableHead className="min-w-[100px]">File</TableHead>
                <TableHead className="min-w-[140px] hidden xl:table-cell">Generated Name</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead className="w-[90px]">Category</TableHead>
                <TableHead className="w-[90px] hidden lg:table-cell">Folder</TableHead>
                {clientId && checklistItems && checklistItems.length > 0 && (
                  <TableHead className="w-[80px] hidden lg:table-cell">Checklist</TableHead>
                )}
                <TableHead className="w-10 text-center px-1">Int</TableHead>
                <TableHead className="w-10 text-center px-1">Ver</TableHead>
                <TableHead className="w-10 text-center px-1 hidden lg:table-cell">Ext</TableHead>
                <TableHead className="w-14 px-2">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <React.Fragment key={item._id}>
                  <TableRow className={item.isDuplicate && !item.versionType ? 'bg-amber-50' : ''}>
                    <TableCell className="px-2">
                      <Checkbox
                        checked={selectedItems.has(item._id)}
                        onCheckedChange={() => toggleSelection(item._id)}
                        disabled={item.status !== 'ready_for_review'}
                      />
                    </TableCell>
                    <TableCell className="px-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => toggleExpanded(item._id)}
                      >
                        {expandedItems.has(item._id) ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </TableCell>
                    {/* Original File Name */}
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs truncate max-w-[150px]" title={item.fileName}>
                          {item.fileName}
                        </span>
                      </div>
                    </TableCell>
                    
                    {/* Generated Document Name - Hidden on smaller screens */}
                    <TableCell className="py-2 hidden xl:table-cell">
                      {item.generatedDocumentCode ? (
                        <span className="text-xs font-mono text-muted-foreground truncate block max-w-[180px]" title={item.generatedDocumentCode}>
                          {item.generatedDocumentCode}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Pending...</span>
                      )}
                    </TableCell>
                    
                    {/* Type */}
                    <TableCell className="py-2">
                      {item.status === 'ready_for_review' ? (
                        <div className="flex items-center gap-1">
                          {item.fileTypeDetected && !item.userEdits?.fileTypeDetected && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Sparkles className="w-3 h-3 text-amber-500 flex-shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>AI suggested</TooltipContent>
                            </Tooltip>
                          )}
                          <Select
                            value={item.fileTypeDetected || ''}
                            onValueChange={(value) => handleUpdateField(item._id, 'fileTypeDetected', value)}
                          >
                            <SelectTrigger className="h-7 text-xs flex-1">
                              <SelectValue placeholder="Type..." />
                            </SelectTrigger>
                            <SelectContent>
                              {FILE_TYPES.map((type) => (
                                <SelectItem key={type} value={type} className="text-xs">
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <span className="text-xs truncate">{item.fileTypeDetected || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      {item.status === 'ready_for_review' ? (
                        <div className="flex items-center gap-1">
                          {item.category && !item.userEdits?.category && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Sparkles className="w-3 h-3 text-amber-500 flex-shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>AI suggested</TooltipContent>
                            </Tooltip>
                          )}
                          <Select
                            value={item.category || ''}
                            onValueChange={(value) => handleUpdateField(item._id, 'category', value)}
                          >
                            <SelectTrigger className="h-7 text-xs flex-1">
                              <SelectValue placeholder="..." />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map((cat) => (
                                <SelectItem key={cat} value={cat} className="text-xs">
                                  {cat}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <span className="text-xs truncate">{item.category || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 hidden lg:table-cell">
                      {item.status === 'ready_for_review' ? (
                        <div className="flex items-center gap-1">
                          {item.targetFolder && !item.userEdits?.targetFolder && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Sparkles className="w-3 h-3 text-amber-500 flex-shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>AI suggested</TooltipContent>
                            </Tooltip>
                          )}
                          <Select
                            value={item.targetFolder || ''}
                            onValueChange={(value) => handleUpdateField(item._id, 'targetFolder', value)}
                          >
                            <SelectTrigger className="h-7 text-xs flex-1">
                              <SelectValue placeholder="..." />
                            </SelectTrigger>
                            <SelectContent>
                              {/* Standard folders first */}
                              {folderOptions.filter(f => !f.isCustom).map((folder) => (
                                <SelectItem key={folder.value} value={folder.value} className="text-xs">
                                  {folder.label}
                                </SelectItem>
                              ))}
                              {/* Custom folders section */}
                              {folderOptions.some(f => f.isCustom) && (
                                <>
                                  <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground border-t mt-1">
                                    Custom Folders
                                  </div>
                                  {folderOptions.filter(f => f.isCustom).map((folder) => (
                                    <SelectItem key={folder.value} value={folder.value} className="text-xs">
                                      <span className="flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
                                        {folder.label}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <span className="text-xs truncate flex items-center gap-1">
                          {folderOptions.find(f => f.value === item.targetFolder)?.isCustom && (
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
                          )}
                          {folderOptions.find(f => f.value === item.targetFolder)?.label || item.targetFolder || '-'}
                        </span>
                      )}
                    </TableCell>
                    {/* Checklist Column */}
                    {clientId && checklistItems && checklistItems.length > 0 && (
                      <TableCell className="py-2 hidden lg:table-cell">
                        {item.status === 'ready_for_review' ? (
                          <Popover 
                            open={checklistPopoverOpen === item._id} 
                            onOpenChange={(open) => setChecklistPopoverOpen(open ? item._id : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-full text-xs justify-start px-2"
                              >
                                <ClipboardCheck className="w-3 h-3 mr-1 flex-shrink-0" />
                                <span className="truncate">
                                  {(item.checklistItemIds?.length || 0) > 0 
                                    ? `${item.checklistItemIds?.length}`
                                    : '-'}
                                </span>
                                {item.suggestedChecklistItems && item.suggestedChecklistItems.length > 0 && 
                                  !(item.checklistItemIds?.length) && (
                                  <Sparkles className="w-2.5 h-2.5 ml-auto text-amber-500" />
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-0 max-h-[400px] flex flex-col" align="start" side="left">
                              <div className="p-3 border-b bg-muted/50 flex-shrink-0">
                                <h4 className="font-medium text-sm">Link to Checklist</h4>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Select requirements this document fulfills
                                </p>
                              </div>

                              <div className="flex-1 overflow-y-auto">
                                {/* AI Suggestions */}
                                {item.suggestedChecklistItems && item.suggestedChecklistItems.length > 0 && (
                                  <div className="p-2 bg-amber-50 border-b">
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800 mb-2">
                                      <Sparkles className="w-3.5 h-3.5" />
                                      AI Suggested
                                    </div>
                                    {item.suggestedChecklistItems.map((suggestion) => {
                                      const isSelected = item.checklistItemIds?.includes(suggestion.itemId);
                                      return (
                                        <div
                                          key={suggestion.itemId}
                                          className="flex items-center gap-2 py-1"
                                        >
                                          <Checkbox
                                            id={`suggestion-${item._id}-${suggestion.itemId}`}
                                            checked={isSelected}
                                            onCheckedChange={() =>
                                              handleToggleChecklistItem(
                                                item._id,
                                                suggestion.itemId,
                                                item.checklistItemIds || []
                                              )
                                            }
                                          />
                                          <label
                                            htmlFor={`suggestion-${item._id}-${suggestion.itemId}`}
                                            className="text-xs cursor-pointer flex-1"
                                          >
                                            <span className="font-medium">{suggestion.itemName}</span>
                                            <span className="text-amber-600 ml-1">
                                              ({Math.round(suggestion.confidence * 100)}%)
                                            </span>
                                          </label>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* All Checklist Items */}
                                <div className="p-2">
                                {Object.entries(groupedChecklistItems).map(([category, catItems]) => (
                                  <div key={category} className="mb-3 last:mb-0">
                                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                      {category}
                                    </div>
                                    {catItems.map((checkItem) => {
                                      const isSelected = item.checklistItemIds?.includes(checkItem._id);
                                      const isFulfilled = checkItem.status === 'fulfilled';
                                      return (
                                        <div
                                          key={checkItem._id}
                                          className="flex items-center gap-2 py-1"
                                        >
                                          <Checkbox
                                            id={`check-${item._id}-${checkItem._id}`}
                                            checked={isSelected}
                                            onCheckedChange={() => 
                                              handleToggleChecklistItem(
                                                item._id, 
                                                checkItem._id, 
                                                item.checklistItemIds || []
                                              )
                                            }
                                          />
                                          <label
                                            htmlFor={`check-${item._id}-${checkItem._id}`}
                                            className={`text-xs cursor-pointer flex-1 ${isFulfilled ? 'text-muted-foreground' : ''}`}
                                          >
                                            {checkItem.name}
                                            {isFulfilled && (
                                              <Badge variant="outline" className="ml-1.5 text-[9px] h-4 text-green-600">
                                                ✓
                                              </Badge>
                                            )}
                                          </label>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                                </div>
                              </div>

                              <div className="p-2 border-t bg-muted/30 flex-shrink-0">
                                <p className="text-[10px] text-muted-foreground">
                                  {(item.checklistItemIds?.length || 0) === 0
                                    ? 'No items linked — document will be filed without checklist linking'
                                    : `${item.checklistItemIds?.length} item(s) will be marked fulfilled`}
                                </p>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {(item.checklistItemIds?.length || 0) > 0 
                              ? `${item.checklistItemIds?.length} linked` 
                              : '-'}
                          </span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-center px-1 py-2">
                      {item.status === 'ready_for_review' ? (
                        <Switch
                          checked={item.isInternal ?? batchIsInternal}
                          onCheckedChange={(checked) => handleUpdateField(item._id, 'isInternal', checked)}
                          className="scale-75"
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {(item.isInternal ?? batchIsInternal) ? 'I' : 'E'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center px-1 py-2">
                      {item.isDuplicate ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant={item.versionType ? "outline" : "destructive"}
                              size="sm"
                              className="h-6 text-[10px] px-1.5"
                              onClick={() => setVersionDialogItem(item)}
                              disabled={item.status !== 'ready_for_review'}
                            >
                              {item.versionType ? (
                                item.version || '!'
                              ) : (
                                <AlertTriangle className="w-3 h-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Duplicate - select version</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {item.version || 'V1.0'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center px-1 py-2 hidden lg:table-cell">
                      {item.status === 'ready_for_review' && item.fileName.match(/\.(xlsx?|csv)$/i) ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Switch
                                checked={item.extractionEnabled ?? false}
                                onCheckedChange={(checked) => handleToggleExtraction(item._id, checked)}
                                className="scale-75"
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              {item.extractionEnabled 
                                ? 'Data extraction queued - will run after filing' 
                                : 'Enable to extract data after filing'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      ) : item.extractionEnabled ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="secondary" className="text-[9px] h-5 px-1 bg-blue-100 text-blue-700">
                              <Database className="w-2.5 h-2.5" />
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Extraction queued</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {getStatusBadge(item.status)}
                    </TableCell>
                  </TableRow>
                  
                  {/* Expanded Row */}
                  {expandedItems.has(item._id) && (
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={20}>
                        <div className="p-4 space-y-3 max-w-full">
                          {/* Tabbed Interface for Document Details */}
                          <Tabs defaultValue="summary" className="w-full">
                            <TabsList className="mb-3">
                              <TabsTrigger value="summary" className="text-xs">
                                <FileText className="w-3 h-3 mr-1" />
                                Summary
                              </TabsTrigger>
                              {item.documentAnalysis && (
                                <>
                                  <TabsTrigger value="entities" className="text-xs">
                                    <Building2 className="w-3 h-3 mr-1" />
                                    Entities
                                  </TabsTrigger>
                                  <TabsTrigger value="keyTerms" className="text-xs">
                                    <Tag className="w-3 h-3 mr-1" />
                                    Key Terms
                                  </TabsTrigger>
                                </>
                              )}
                              <TabsTrigger value="docInfo" className="text-xs">
                                <HardDrive className="w-3 h-3 mr-1" />
                                Doc Info
                              </TabsTrigger>
                              {item.classificationReasoning && (
                                <TabsTrigger value="reasoning" className="text-xs">
                                  <FileSearch className="w-3 h-3 mr-1" />
                                  Classification
                                </TabsTrigger>
                              )}
                            </TabsList>

                            {/* Summary Tab */}
                            <TabsContent value="summary" className="mt-0">
                              <div className="space-y-3">
                                {item.documentAnalysis ? (
                                  <>
                                    <div>
                                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Executive Summary</span>
                                      <p className="text-sm mt-1 break-words whitespace-pre-wrap">
                                        {item.documentAnalysis.executiveSummary}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Detailed Summary</span>
                                      <p className="text-sm text-muted-foreground mt-1 break-words whitespace-pre-wrap">
                                        {item.documentAnalysis.detailedSummary}
                                      </p>
                                    </div>
                                    {item.documentAnalysis.sectionBreakdown && item.documentAnalysis.sectionBreakdown.length > 0 && (
                                      <div>
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Section Breakdown</span>
                                        <ul className="text-sm text-muted-foreground mt-1 list-disc list-inside space-y-0.5">
                                          {item.documentAnalysis.sectionBreakdown.map((section, i) => (
                                            <li key={i}>{section}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div>
                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Summary</span>
                                    <p className="text-sm text-muted-foreground mt-1 break-words whitespace-pre-wrap">
                                      {item.summary || 'No summary available'}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </TabsContent>

                            {/* Entities Tab */}
                            {item.documentAnalysis && (
                              <TabsContent value="entities" className="mt-0">
                                <div className="grid grid-cols-2 gap-4">
                                  {/* People */}
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <User className="w-3.5 h-3.5 text-blue-600" />
                                      <span className="text-xs font-medium uppercase tracking-wide">People</span>
                                    </div>
                                    {item.documentAnalysis.entities.people.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {item.documentAnalysis.entities.people.map((person, i) => (
                                          <Badge key={i} variant="secondary" className="text-xs">
                                            {person}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">None identified</span>
                                    )}
                                  </div>

                                  {/* Companies */}
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <Building2 className="w-3.5 h-3.5 text-purple-600" />
                                      <span className="text-xs font-medium uppercase tracking-wide">Companies</span>
                                    </div>
                                    {item.documentAnalysis.entities.companies.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {item.documentAnalysis.entities.companies.map((company, i) => (
                                          <Badge key={i} variant="secondary" className="text-xs bg-purple-50">
                                            {company}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">None identified</span>
                                    )}
                                  </div>

                                  {/* Locations */}
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <MapPin className="w-3.5 h-3.5 text-green-600" />
                                      <span className="text-xs font-medium uppercase tracking-wide">Locations</span>
                                    </div>
                                    {item.documentAnalysis.entities.locations.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {item.documentAnalysis.entities.locations.map((location, i) => (
                                          <Badge key={i} variant="secondary" className="text-xs bg-green-50">
                                            {location}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">None identified</span>
                                    )}
                                  </div>

                                  {/* Projects */}
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <FileText className="w-3.5 h-3.5 text-amber-600" />
                                      <span className="text-xs font-medium uppercase tracking-wide">Projects</span>
                                    </div>
                                    {item.documentAnalysis.entities.projects.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {item.documentAnalysis.entities.projects.map((project, i) => (
                                          <Badge key={i} variant="secondary" className="text-xs bg-amber-50">
                                            {project}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">None identified</span>
                                    )}
                                  </div>
                                </div>
                              </TabsContent>
                            )}

                            {/* Key Terms Tab */}
                            {item.documentAnalysis && (
                              <TabsContent value="keyTerms" className="mt-0">
                                <div className="space-y-4">
                                  {/* Key Terms */}
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <Tag className="w-3.5 h-3.5 text-blue-600" />
                                      <span className="text-xs font-medium uppercase tracking-wide">Key Terms</span>
                                    </div>
                                    {item.documentAnalysis.keyTerms.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {item.documentAnalysis.keyTerms.map((term, i) => (
                                          <Badge key={i} variant="outline" className="text-xs">
                                            {term}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">None identified</span>
                                    )}
                                  </div>

                                  {/* Key Dates */}
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <Calendar className="w-3.5 h-3.5 text-green-600" />
                                      <span className="text-xs font-medium uppercase tracking-wide">Key Dates</span>
                                    </div>
                                    {item.documentAnalysis.keyDates.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {item.documentAnalysis.keyDates.map((date, i) => (
                                          <Badge key={i} variant="outline" className="text-xs bg-green-50">
                                            {date}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">None identified</span>
                                    )}
                                  </div>

                                  {/* Key Amounts */}
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                                      <span className="text-xs font-medium uppercase tracking-wide">Key Amounts</span>
                                    </div>
                                    {item.documentAnalysis.keyAmounts.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {item.documentAnalysis.keyAmounts.map((amount, i) => (
                                          <Badge key={i} variant="outline" className="text-xs bg-amber-50 font-mono">
                                            {amount}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">None identified</span>
                                    )}
                                  </div>
                                </div>
                              </TabsContent>
                            )}

                            {/* Document Info Tab */}
                            <TabsContent value="docInfo" className="mt-0">
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div>
                                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">File Size</span>
                                  <p className="text-sm font-mono mt-1">{formatFileSize(item.fileSize)}</p>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">File Type</span>
                                  <p className="text-sm mt-1">{item.fileType}</p>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Confidence</span>
                                  <p className="text-sm mt-1">
                                    {item.confidence ? `${(item.confidence * 100).toFixed(0)}%` : '-'}
                                  </p>
                                </div>
                                {item.documentAnalysis && (
                                  <div>
                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Analysis Confidence</span>
                                    <p className="text-sm mt-1">
                                      {(item.documentAnalysis.confidenceInAnalysis * 100).toFixed(0)}%
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Document Characteristics */}
                              {item.documentAnalysis && (
                                <div className="mt-4">
                                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Document Characteristics</span>
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {item.documentAnalysis.documentCharacteristics.isFinancial && (
                                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700">Financial</Badge>
                                    )}
                                    {item.documentAnalysis.documentCharacteristics.isLegal && (
                                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">Legal</Badge>
                                    )}
                                    {item.documentAnalysis.documentCharacteristics.isIdentity && (
                                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">Identity</Badge>
                                    )}
                                    {item.documentAnalysis.documentCharacteristics.isReport && (
                                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700">Report</Badge>
                                    )}
                                    {item.documentAnalysis.documentCharacteristics.isDesign && (
                                      <Badge variant="outline" className="text-xs bg-pink-50 text-pink-700">Design</Badge>
                                    )}
                                    {item.documentAnalysis.documentCharacteristics.isCorrespondence && (
                                      <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700">Correspondence</Badge>
                                    )}
                                    {item.documentAnalysis.documentCharacteristics.hasMultipleProjects && (
                                      <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700">Multi-Project</Badge>
                                    )}
                                    {item.documentAnalysis.documentCharacteristics.isInternal && (
                                      <Badge variant="outline" className="text-xs bg-gray-100 text-gray-700">Internal</Badge>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Training Badge */}
                              {item.userEdits && Object.values(item.userEdits).some(Boolean) && (
                                <div className="mt-4 pt-4 border-t">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                                          <Brain className="w-3 h-3 mr-1" />
                                          AI Learning from Your Corrections
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs">
                                        <p className="font-medium mb-1">Feedback Loop Active</p>
                                        <p className="text-xs text-muted-foreground">
                                          Your edits are being recorded to improve future classifications.
                                        </p>
                                        <ul className="text-xs mt-1 space-y-0.5">
                                          {item.userEdits.fileTypeDetected && (
                                            <li className="text-purple-600">• File type corrected</li>
                                          )}
                                          {item.userEdits.category && (
                                            <li className="text-purple-600">• Category corrected</li>
                                          )}
                                          {item.userEdits.targetFolder && (
                                            <li className="text-purple-600">• Folder corrected</li>
                                          )}
                                          {item.userEdits.isInternal && (
                                            <li className="text-purple-600">• Internal flag corrected</li>
                                          )}
                                          {item.userEdits.checklistItems && (
                                            <li className="text-purple-600">• Checklist items corrected</li>
                                          )}
                                        </ul>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              )}
                            </TabsContent>

                            {/* Classification Reasoning Tab */}
                            {item.classificationReasoning && (
                              <TabsContent value="reasoning" className="mt-0">
                                <div>
                                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Classification Reasoning</span>
                                  <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                    <p className="text-sm text-blue-900 break-words whitespace-pre-wrap">
                                      {item.classificationReasoning}
                                    </p>
                                  </div>
                                </div>
                              </TabsContent>
                            )}
                          </Tabs>
                          
                          {/* Extraction Status Section */}
                          {item.fileName.match(/\.(xlsx?|csv)$/i) && item.status === 'ready_for_review' && (
                            <div className={`p-3 rounded border ${item.extractionEnabled ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className={`text-sm font-medium ${item.extractionEnabled ? 'text-blue-800' : 'text-gray-700'}`}>
                                    Data Extraction {item.extractionEnabled ? 'Enabled' : 'Available'}
                                  </span>
                                  <p className={`text-xs mt-0.5 ${item.extractionEnabled ? 'text-blue-600' : 'text-gray-500'}`}>
                                    {item.extractionEnabled 
                                      ? 'Extraction will run automatically after you file this document. You can leave the page.'
                                      : 'Enable extraction to automatically process this spreadsheet after filing.'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">Extract</span>
                                  <Switch
                                    checked={item.extractionEnabled ?? false}
                                    onCheckedChange={(checked) => handleToggleExtraction(item._id, checked)}
                                  />
                                </div>
                              </div>
                              {item.extractionEnabled && (
                                <div className="mt-2 pt-2 border-t border-blue-200">
                                  <p className="text-xs text-blue-700">
                                    <Sparkles className="w-3 h-3 inline mr-1" />
                                    After filing, extracted data will appear in the Data Library. 
                                    Go to Modeling to confirm the codified values.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* User Notes Section */}
                          {item.status === 'ready_for_review' && (
                            <div className="p-3 rounded border bg-gray-50 border-gray-200 mt-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                  <FileText className="w-4 h-4" />
                                  Document Notes
                                </span>
                                {item.userNote?.content && !editingNoteItemId && (
                                  <Badge variant="outline" className="text-xs">
                                    {item.userNote.addToIntelligence ? 'Will file to intelligence' : 'Local note only'}
                                  </Badge>
                                )}
                              </div>

                              <textarea
                                value={editingNoteItemId === item._id ? noteContent : (item.userNote?.content || '')}
                                onChange={(e) => {
                                  if (editingNoteItemId !== item._id) {
                                    setEditingNoteItemId(item._id);
                                    setNoteContent(e.target.value);
                                    setAddToIntelligence(item.userNote?.addToIntelligence ?? false);
                                    setIntelligenceTarget(item.userNote?.intelligenceTarget ?? (hasProject ? "project" : "client"));
                                  } else {
                                    setNoteContent(e.target.value);
                                  }
                                }}
                                onFocus={() => {
                                  if (editingNoteItemId !== item._id) {
                                    setEditingNoteItemId(item._id);
                                    setNoteContent(item.userNote?.content || '');
                                    setAddToIntelligence(item.userNote?.addToIntelligence ?? false);
                                    setIntelligenceTarget(item.userNote?.intelligenceTarget ?? (hasProject ? "project" : "client"));
                                  }
                                }}
                                placeholder="Add notes about this document for future reference..."
                                className="w-full text-sm min-h-[60px] p-2 border border-gray-200 rounded bg-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />

                              {/* Intelligence Toggle */}
                              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={editingNoteItemId === item._id ? addToIntelligence : (item.userNote?.addToIntelligence ?? false)}
                                    onCheckedChange={(checked) => {
                                      if (editingNoteItemId !== item._id) {
                                        setEditingNoteItemId(item._id);
                                        setNoteContent(item.userNote?.content || '');
                                        setIntelligenceTarget(item.userNote?.intelligenceTarget ?? (hasProject ? "project" : "client"));
                                      }
                                      setAddToIntelligence(checked);
                                    }}
                                    className="scale-90"
                                  />
                                  <label className="text-xs text-gray-600 flex items-center gap-1">
                                    <Brain className="w-3 h-3" />
                                    Add to {hasProject ? 'project' : 'client'} intelligence
                                  </label>
                                </div>

                                {editingNoteItemId === item._id && (
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingNoteItemId(null);
                                        setNoteContent('');
                                        setAddToIntelligence(false);
                                      }}
                                      className="text-xs h-7"
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      disabled={noteSaving}
                                      onClick={async () => {
                                        setNoteSaving(true);
                                        try {
                                          await updateItemNote({
                                            itemId: item._id,
                                            content: noteContent,
                                            addToIntelligence,
                                            intelligenceTarget: addToIntelligence ? intelligenceTarget : undefined,
                                          });
                                          setEditingNoteItemId(null);
                                          onRefresh?.();
                                        } finally {
                                          setNoteSaving(false);
                                        }
                                      }}
                                      className="text-xs h-7"
                                    >
                                      {noteSaving ? (
                                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                      ) : null}
                                      Save Note
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {/* Intelligence Target Options (when toggle is on and project exists) */}
                              {(editingNoteItemId === item._id ? addToIntelligence : item.userNote?.addToIntelligence) && hasProject && (
                                <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-100">
                                  <div className="flex items-center gap-3 text-xs">
                                    <span className="text-blue-700">File to:</span>
                                    <label className="flex items-center gap-1 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`intel-target-${item._id}`}
                                        checked={(editingNoteItemId === item._id ? intelligenceTarget : item.userNote?.intelligenceTarget) === "project"}
                                        onChange={() => {
                                          if (editingNoteItemId !== item._id) {
                                            setEditingNoteItemId(item._id);
                                            setNoteContent(item.userNote?.content || '');
                                            setAddToIntelligence(item.userNote?.addToIntelligence ?? false);
                                          }
                                          setIntelligenceTarget("project");
                                        }}
                                        className="w-3 h-3"
                                      />
                                      <span className="text-blue-700">Project</span>
                                    </label>
                                    <label className="flex items-center gap-1 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`intel-target-${item._id}`}
                                        checked={(editingNoteItemId === item._id ? intelligenceTarget : item.userNote?.intelligenceTarget) === "client"}
                                        onChange={() => {
                                          if (editingNoteItemId !== item._id) {
                                            setEditingNoteItemId(item._id);
                                            setNoteContent(item.userNote?.content || '');
                                            setAddToIntelligence(item.userNote?.addToIntelligence ?? false);
                                          }
                                          setIntelligenceTarget("client");
                                        }}
                                        className="w-3 h-3"
                                      />
                                      <span className="text-blue-700">Client</span>
                                    </label>
                                  </div>
                                </div>
                              )}

                              {/* Info text */}
                              {(editingNoteItemId === item._id ? addToIntelligence : item.userNote?.addToIntelligence) && (
                                <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1">
                                  <Sparkles className="w-3 h-3" />
                                  Note will be available for document generation via client intelligence
                                </p>
                              )}
                            </div>
                          )}

                          {item.error && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                              <span className="font-medium">Error:</span> {item.error}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Version Selection Dialog */}
        <Dialog open={!!versionDialogItem} onOpenChange={() => setVersionDialogItem(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Duplicate Document Detected</DialogTitle>
              <DialogDescription>
                A document with a similar name already exists. Please select the version type for this upload.
              </DialogDescription>
            </DialogHeader>
            {versionDialogItem && (
              <div className="space-y-4 py-4">
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm font-medium">{versionDialogItem.fileName}</div>
                  {versionDialogItem.generatedDocumentCode && (
                    <div className="text-xs text-muted-foreground">
                      {versionDialogItem.generatedDocumentCode}
                    </div>
                  )}
                </div>
                
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto py-3"
                    onClick={() => handleSetVersionType(versionDialogItem._id, 'minor')}
                  >
                    <div className="text-left">
                      <div className="font-medium">Minor Change (V1.1)</div>
                      <div className="text-xs text-muted-foreground">
                        Small corrections, formatting changes, typo fixes
                      </div>
                    </div>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto py-3"
                    onClick={() => handleSetVersionType(versionDialogItem._id, 'significant')}
                  >
                    <div className="text-left">
                      <div className="font-medium">Significant Change (V2.0)</div>
                      <div className="text-xs text-muted-foreground">
                        Major updates, new content, structural changes
                      </div>
                    </div>
                  </Button>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setVersionDialogItem(null)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
