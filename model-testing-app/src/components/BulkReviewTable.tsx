'use client';

import React, { useState, useMemo } from 'react';
import { useMutation } from 'convex/react';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
} from 'lucide-react';

// Document categories for dropdown
const CATEGORIES = [
  'Appraisals',
  'Terms',
  'Credit',
  'Financial',
  'Legal',
  'Correspondence',
  'KYC',
  'Notes',
  'Other',
];

// File type options
const FILE_TYPES = [
  'Red Book Valuation',
  'RICS Valuation',
  'Term Sheet',
  'Credit Memo',
  'Operating Statement',
  'Financial Model',
  'Contract',
  'Agreement',
  'Invoice',
  'Correspondence',
  'KYC Document',
  'Note',
  'Report',
  'Other',
];

// Folder options for project-level
const PROJECT_FOLDERS = [
  { value: 'background', label: 'Background' },
  { value: 'terms_comparison', label: 'Terms Comparison' },
  { value: 'terms_request', label: 'Terms Request' },
  { value: 'credit_submission', label: 'Credit Submission' },
  { value: 'post_completion', label: 'Post-completion' },
  { value: 'appraisals', label: 'Appraisals' },
  { value: 'notes', label: 'Notes' },
  { value: 'operational_model', label: 'Operational Model' },
];

// Client-level folders
const CLIENT_FOLDERS = [
  { value: 'kyc', label: 'KYC' },
  { value: 'background_docs', label: 'Background' },
  { value: 'miscellaneous', label: 'Miscellaneous' },
];

interface BulkUploadItem {
  _id: Id<"bulkUploadItems">;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: "pending" | "processing" | "ready_for_review" | "filed" | "error";
  summary?: string;
  fileTypeDetected?: string;
  category?: string;
  targetFolder?: string;
  confidence?: number;
  isInternal?: boolean;
  extractionEnabled?: boolean;
  generatedDocumentCode?: string;
  version?: string;
  isDuplicate?: boolean;
  duplicateOfDocumentId?: Id<"documents">;
  versionType?: "minor" | "significant";
  error?: string;
}

interface BulkReviewTableProps {
  items: BulkUploadItem[];
  batchIsInternal: boolean;
  hasProject: boolean;
  onRefresh?: () => void;
}

export default function BulkReviewTable({
  items,
  batchIsInternal,
  hasProject,
  onRefresh,
}: BulkReviewTableProps) {
  const [selectedItems, setSelectedItems] = useState<Set<Id<"bulkUploadItems">>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<Id<"bulkUploadItems">>>(new Set());
  const [versionDialogItem, setVersionDialogItem] = useState<BulkUploadItem | null>(null);

  // Mutations
  const updateItemDetails = useMutation(api.bulkUpload.updateItemDetails);
  const toggleExtraction = useMutation(api.bulkUpload.toggleExtraction);
  const setVersionType = useMutation(api.bulkUpload.setVersionType);

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

  // Handle extraction toggle
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

  // Enable extraction for selected items
  const handleBulkEnableExtraction = async () => {
    for (const itemId of selectedItems) {
      try {
        await toggleExtraction({ itemId, enabled: true });
      } catch (error) {
        console.error('Failed to enable extraction:', error);
      }
    }
    onRefresh?.();
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'processing':
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      case 'ready_for_review':
        return <Badge variant="default">Ready</Badge>;
      case 'filed':
        return (
          <Badge variant="default" className="bg-green-100 text-green-700">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Filed
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const folderOptions = hasProject ? PROJECT_FOLDERS : CLIENT_FOLDERS;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Stats Bar */}
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-sm">
            <span className="font-medium">{stats.total}</span> files
          </div>
          {stats.ready > 0 && (
            <Badge variant="default">{stats.ready} ready</Badge>
          )}
          {stats.processing > 0 && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-700">
              {stats.processing} processing
            </Badge>
          )}
          {stats.filed > 0 && (
            <Badge variant="default" className="bg-green-100 text-green-700">
              {stats.filed} filed
            </Badge>
          )}
          {stats.errors > 0 && (
            <Badge variant="destructive">{stats.errors} errors</Badge>
          )}
          {stats.unresolvedDuplicates > 0 && (
            <Badge variant="outline" className="border-amber-500 text-amber-700">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {stats.unresolvedDuplicates} duplicates need attention
            </Badge>
          )}
          
          <div className="flex-1" />
          
          {selectedItems.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkEnableExtraction}
            >
              <Database className="w-4 h-4 mr-1" />
              Enable Extraction ({selectedItems.size})
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-x-auto">
          <Table className="table-fixed w-full min-w-[1000px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectedItems.size === items.filter(i => i.status === 'ready_for_review').length && selectedItems.size > 0}
                    onCheckedChange={toggleAllSelection}
                  />
                </TableHead>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-[180px]">Original File</TableHead>
                <TableHead className="w-[200px]">Generated Name</TableHead>
                <TableHead className="w-[140px]">Type</TableHead>
                <TableHead className="w-[120px]">Category</TableHead>
                <TableHead className="w-[140px]">Folder</TableHead>
                <TableHead className="w-16 text-center">Int/Ext</TableHead>
                <TableHead className="w-16 text-center">Version</TableHead>
                <TableHead className="w-16 text-center">Extract</TableHead>
                <TableHead className="w-20">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <React.Fragment key={item._id}>
                  <TableRow className={item.isDuplicate && !item.versionType ? 'bg-amber-50' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedItems.has(item._id)}
                        onCheckedChange={() => toggleSelection(item._id)}
                        disabled={item.status !== 'ready_for_review'}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => toggleExpanded(item._id)}
                      >
                        {expandedItems.has(item._id) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </Button>
                    </TableCell>
                    {/* Original File Name */}
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm truncate" title={item.fileName}>
                          {item.fileName}
                        </span>
                      </div>
                    </TableCell>
                    
                    {/* Generated Document Name */}
                    <TableCell>
                      {item.generatedDocumentCode ? (
                        <span className="text-xs font-mono text-muted-foreground truncate block" title={item.generatedDocumentCode}>
                          {item.generatedDocumentCode}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Pending...</span>
                      )}
                    </TableCell>
                    
                    {/* Type */}
                    <TableCell>
                      {item.status === 'ready_for_review' ? (
                        <Select
                          value={item.fileTypeDetected || ''}
                          onValueChange={(value) => handleUpdateField(item._id, 'fileTypeDetected', value)}
                        >
                          <SelectTrigger className="h-8 w-[150px]">
                            <SelectValue placeholder="Select type..." />
                          </SelectTrigger>
                          <SelectContent>
                            {FILE_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">{item.fileTypeDetected || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.status === 'ready_for_review' ? (
                        <Select
                          value={item.category || ''}
                          onValueChange={(value) => handleUpdateField(item._id, 'category', value)}
                        >
                          <SelectTrigger className="h-8 w-[120px]">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">{item.category || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.status === 'ready_for_review' ? (
                        <Select
                          value={item.targetFolder || ''}
                          onValueChange={(value) => handleUpdateField(item._id, 'targetFolder', value)}
                        >
                          <SelectTrigger className="h-8 w-[130px]">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {folderOptions.map((folder) => (
                              <SelectItem key={folder.value} value={folder.value}>
                                {folder.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">{item.targetFolder || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.status === 'ready_for_review' ? (
                        <Switch
                          checked={item.isInternal ?? batchIsInternal}
                          onCheckedChange={(checked) => handleUpdateField(item._id, 'isInternal', checked)}
                        />
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {(item.isInternal ?? batchIsInternal) ? 'INT' : 'EXT'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.isDuplicate ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant={item.versionType ? "outline" : "destructive"}
                              size="sm"
                              className="h-7"
                              onClick={() => setVersionDialogItem(item)}
                              disabled={item.status !== 'ready_for_review'}
                            >
                              {item.versionType ? (
                                item.version || 'Set'
                              ) : (
                                <>
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Set
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Duplicate detected - select version type</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {item.version || 'V1.0'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={item.extractionEnabled || false}
                        onCheckedChange={(checked) => handleToggleExtraction(item._id, checked)}
                        disabled={item.status !== 'ready_for_review'}
                      />
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(item.status)}
                    </TableCell>
                  </TableRow>
                  
                  {/* Expanded Row */}
                  {expandedItems.has(item._id) && (
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={11}>
                        <div className="p-4 space-y-3 max-w-full">
                          <div>
                            <span className="text-sm font-medium">Summary:</span>
                            <p className="text-sm text-muted-foreground mt-1 break-words whitespace-pre-wrap">
                              {item.summary || 'No summary available'}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span>
                              <span className="font-medium">Size:</span>{' '}
                              {formatFileSize(item.fileSize)}
                            </span>
                            <span>
                              <span className="font-medium">Confidence:</span>{' '}
                              {item.confidence ? `${(item.confidence * 100).toFixed(0)}%` : '-'}
                            </span>
                          </div>
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
