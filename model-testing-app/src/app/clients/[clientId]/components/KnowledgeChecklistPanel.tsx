'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Folder,
  Link as LinkIcon,
  Unlink,
  ExternalLink,
  Search,
  AlertCircle,
  Sparkles,
  X,
  Check,
  Trash2,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Plus,
  Flag,
} from 'lucide-react';
import FlagCreationModal from '@/components/FlagCreationModal';
import { cn } from '@/lib/utils';

interface LinkedDocument {
  _id: Id<"knowledgeChecklistDocumentLinks">;
  documentId: Id<"documents">;
  documentName: string;
  linkedAt: string;
  isPrimary: boolean;
}

interface ChecklistItem {
  _id: Id<"knowledgeChecklistItems">;
  name: string;
  category: string;
  phaseRequired: string;
  priority: string;
  description?: string;
  status: string;
  isCustom: boolean;
  customSource?: string;
  // New multi-document linking
  linkedDocumentCount?: number;
  primaryDocument?: {
    documentId: Id<"documents">;
    documentName: string;
    linkedAt: string;
  } | null;
  // AI suggestions
  suggestedDocumentId?: Id<"documents">;
  suggestedDocumentName?: string;
  suggestedConfidence?: number;
}

interface KnowledgeChecklistPanelProps {
  items: ChecklistItem[];
  clientId: Id<"clients">;
  projectId?: Id<"projects">;
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
}

export default function KnowledgeChecklistPanel({
  items,
  clientId,
  projectId,
  selectedCategory,
  onCategoryChange,
}: KnowledgeChecklistPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [linkingItemId, setLinkingItemId] = useState<Id<"knowledgeChecklistItems"> | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<Id<"knowledgeChecklistItems"> | null>(null);
  const [flaggingItem, setFlaggingItem] = useState<ChecklistItem | null>(null);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState<Set<Id<"documents">>>(new Set());
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // Query for available documents to link
  // @ts-ignore - Known Convex TypeScript type instantiation depth issue
  const documents = useQuery(api.documents.getByClient, { clientId }) as any[] | undefined;
  
  // Query for linked documents when an item is expanded
  const linkedDocuments = useQuery(
    api.knowledgeLibrary.getLinkedDocuments,
    expandedItemId ? { checklistItemId: expandedItemId } : "skip"
  ) as LinkedDocument[] | undefined;

  // Query for already-linked documents when linking modal is open
  const linkingLinkedDocs = useQuery(
    api.knowledgeLibrary.getLinkedDocuments,
    linkingItemId ? { checklistItemId: linkingItemId } : "skip"
  ) as LinkedDocument[] | undefined;
  const alreadyLinkedIds = new Set(
    (linkingLinkedDocs || []).map((d) => d.documentId as string)
  );

  // Get current user
  const user = useQuery(api.users.getCurrent) as { _id: Id<"users"> } | null | undefined;

  // Mutations
  const linkDocument = useMutation(api.knowledgeLibrary.linkDocumentToRequirement);
  const unlinkAllDocuments = useMutation(api.knowledgeLibrary.unlinkDocument);
  const unlinkSpecificDocument = useMutation(api.knowledgeLibrary.unlinkDocumentFromChecklistItem);
  const confirmSuggestion = useMutation(api.knowledgeLibrary.confirmSuggestedLink);
  const rejectSuggestion = useMutation(api.knowledgeLibrary.rejectSuggestedLink);
  const deleteCustom = useMutation(api.knowledgeLibrary.deleteCustomRequirement);

  // Filter items
  const filteredItems = items.filter(item => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!item.name.toLowerCase().includes(query) &&
          !item.description?.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (phaseFilter !== 'all' && item.phaseRequired !== phaseFilter) {
      return false;
    }
    if (priorityFilter !== 'all' && item.priority !== priorityFilter) {
      return false;
    }
    return true;
  });

  // Group items by status for display
  const groupedItems = {
    pending_review: filteredItems.filter(i => i.status === 'pending_review'),
    missing: filteredItems.filter(i => i.status === 'missing'),
    fulfilled: filteredItems.filter(i => i.status === 'fulfilled'),
  };

  // Handle document linking
  const handleLinkDocument = async (itemId: Id<"knowledgeChecklistItems">, documentId: Id<"documents">) => {
    if (!user?._id) return;
    
    await linkDocument({
      checklistItemId: itemId,
      documentId,
      userId: user._id,
    });
    setLinkingItemId(null);
  };

  // Handle unlink all documents from an item
  const handleUnlinkAll = async (itemId: Id<"knowledgeChecklistItems">) => {
    if (confirm('Are you sure you want to unlink all documents from this requirement?')) {
      await unlinkAllDocuments({ checklistItemId: itemId });
      setExpandedItemId(null);
    }
  };

  // Handle unlink specific document
  const handleUnlinkSpecific = async (itemId: Id<"knowledgeChecklistItems">, documentId: Id<"documents">) => {
    await unlinkSpecificDocument({ 
      checklistItemId: itemId, 
      documentId 
    });
  };

  // Handle confirm suggestion
  const handleConfirmSuggestion = async (itemId: Id<"knowledgeChecklistItems">) => {
    if (!user?._id) return;
    await confirmSuggestion({ checklistItemId: itemId, userId: user._id });
  };

  // Handle reject suggestion
  const handleRejectSuggestion = async (itemId: Id<"knowledgeChecklistItems">) => {
    await rejectSuggestion({ checklistItemId: itemId });
  };

  // Handle delete custom
  const handleDeleteCustom = async (itemId: Id<"knowledgeChecklistItems">) => {
    if (confirm('Are you sure you want to delete this custom requirement?')) {
      await deleteCustom({ checklistItemId: itemId });
    }
  };

  // Handle batch link documents
  const [isLinking, setIsLinking] = useState(false);
  const handleBatchLinkDocuments = async () => {
    if (!linkingItemId || !user?._id || selectedDocIds.size === 0) return;
    setIsLinking(true);
    try {
      for (const docId of selectedDocIds) {
        await linkDocument({
          checklistItemId: linkingItemId,
          documentId: docId,
          userId: user._id,
        });
      }
    } finally {
      setIsLinking(false);
      setSelectedDocIds(new Set());
      setDocSearchQuery('');
      setCollapsedFolders(new Set());
      setLinkingItemId(null);
    }
  };

  // Toggle doc selection for multi-select
  const toggleDocSelection = (docId: Id<"documents">) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  // Toggle folder collapse
  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Format folder name for display
  const formatFolderName = (folderId: string) => {
    if (folderId === '_unfiled') return 'Unfiled Documents';
    return folderId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Group documents by folder for the linking modal
  const groupedDocuments = (() => {
    if (!documents) return [];
    const filtered = documents.filter((doc: any) =>
      !docSearchQuery || doc.fileName?.toLowerCase().includes(docSearchQuery.toLowerCase())
    );
    const groups: Record<string, any[]> = {};
    for (const doc of filtered) {
      const key = doc.folderId || '_unfiled';
      if (!groups[key]) groups[key] = [];
      groups[key].push(doc);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => {
        if (a === '_unfiled') return 1;
        if (b === '_unfiled') return -1;
        return a.localeCompare(b);
      })
      .map(([folderId, docs]) => ({
        folderId,
        displayName: formatFolderName(folderId),
        docs: docs.sort((a: any, b: any) => (a.fileName || '').localeCompare(b.fileName || '')),
      }));
  })();

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'fulfilled':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'pending_review':
        return <Clock className="w-5 h-5 text-amber-500" />;
      default:
        return <Circle className="w-5 h-5 text-gray-300" />;
    }
  };

  // Get priority badge
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'required':
        return <Badge variant="destructive" className="text-[10px] h-4">Required</Badge>;
      case 'nice_to_have':
        return <Badge variant="secondary" className="text-[10px] h-4">Nice to have</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] h-4">Optional</Badge>;
    }
  };

  // Get phase badge
  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case 'indicative_terms':
        return 'Indicative Terms';
      case 'credit_submission':
        return 'Credit Submission';
      case 'post_credit':
        return 'Post-Credit';
      default:
        return 'All Phases';
    }
  };

  // Render single item
  const renderItem = (item: ChecklistItem) => (
    <Card key={item._id} className={cn(
      "mb-2 transition-all",
      item.status === 'fulfilled' && "bg-green-50 border-green-200",
      item.status === 'pending_review' && "bg-amber-50 border-amber-200"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Status Icon */}
          <div className="mt-0.5">
            {getStatusIcon(item.status)}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-gray-900 text-sm">{item.name}</h4>
              {getPriorityBadge(item.priority)}
              {item.isCustom && (
                <Badge variant="outline" className="text-[10px] h-4 bg-purple-50 text-purple-700 border-purple-200">
                  {item.customSource === 'llm' ? (
                    <><Sparkles className="w-2.5 h-2.5 mr-1" />Dynamic</>
                  ) : (
                    'Custom'
                  )}
                </Badge>
              )}
            </div>
            
            {item.description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
            )}

            <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
              <span>{getPhaseLabel(item.phaseRequired)}</span>
              <span>•</span>
              <span>{item.category}</span>
            </div>

            {/* AI Suggestion */}
            {item.status === 'pending_review' && item.suggestedDocumentId && (
              <div className="mt-3 p-2 bg-amber-100 rounded-md">
                <div className="flex items-center gap-2 text-xs text-amber-800">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="font-medium">AI Suggestion:</span>
                  <span className="truncate">{item.suggestedDocumentName}</span>
                  {item.suggestedConfidence && (
                    <span className="text-amber-600">
                      ({Math.round(item.suggestedConfidence * 100)}% confidence)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-6 text-xs bg-green-600 hover:bg-green-700"
                    onClick={() => handleConfirmSuggestion(item._id)}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={() => handleRejectSuggestion(item._id)}
                  >
                    <X className="w-3 h-3 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            )}

            {/* Linked Documents */}
            {item.status === 'fulfilled' && item.primaryDocument && (
              <div className="mt-2 space-y-2">
                {/* Primary Document + Count */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedItemId(expandedItemId === item._id ? null : item._id)}
                    className="flex items-center gap-2 text-xs hover:bg-gray-100 rounded px-1 py-0.5 -ml-1"
                  >
                    <FileText className="w-3.5 h-3.5 text-green-600" />
                    <a
                      href={`/docs/reader/${item.primaryDocument.documentId}`}
                      className="text-green-700 font-medium truncate max-w-[150px] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.primaryDocument.documentName}
                    </a>
                    {(item.linkedDocumentCount || 0) > 1 && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        +{(item.linkedDocumentCount || 1) - 1} more
                      </Badge>
                    )}
                    {(item.linkedDocumentCount || 0) > 1 && (
                      expandedItemId === item._id 
                        ? <ChevronUp className="w-3 h-3 text-gray-400" />
                        : <ChevronDown className="w-3 h-3 text-gray-400" />
                    )}
                  </button>
                  {item.primaryDocument.linkedAt && (
                    <span className="text-[10px] text-gray-400">
                      {new Date(item.primaryDocument.linkedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Expanded List of All Linked Documents */}
                {expandedItemId === item._id && linkedDocuments && linkedDocuments.length > 0 && (
                  <div className="ml-4 space-y-1 border-l-2 border-green-200 pl-3">
                    {linkedDocuments.map((doc) => (
                      <div key={doc._id} className="flex items-center gap-2 text-xs group">
                        <FileText className="w-3 h-3 text-gray-400" />
                        <a
                          href={`/docs/reader/${doc.documentId}`}
                          className={cn(
                            "truncate max-w-[140px] hover:underline",
                            doc.isPrimary ? "text-green-700 font-medium" : "text-gray-600"
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {doc.documentName}
                        </a>
                        {doc.isPrimary && (
                          <Badge variant="outline" className="text-[9px] h-3 text-green-600">
                            Primary
                          </Badge>
                        )}
                        <span className="text-[10px] text-gray-400">
                          {new Date(doc.linkedAt).toLocaleDateString()}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                          onClick={() => handleUnlinkSpecific(item._id, doc.documentId)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500"
                          onClick={() => window.open(`/docs/${doc.documentId}`, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {/* Link/Add Document Button - always available */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-gray-400 hover:text-blue-500"
                    onClick={() => setLinkingItemId(item._id)}
                  >
                    {item.status === 'fulfilled' ? (
                      <Plus className="w-4 h-4" />
                    ) : (
                      <LinkIcon className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {item.status === 'fulfilled' ? 'Add another document' : 'Link document'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Unlink All Button - only for fulfilled items */}
            {item.status === 'fulfilled' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                      onClick={() => handleUnlinkAll(item._id)}
                    >
                      <Unlink className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Unlink all documents</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* View Primary Document */}
            {item.primaryDocument && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-gray-400 hover:text-blue-500"
                      onClick={() => window.open(`/docs/${item.primaryDocument?.documentId}`, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>View primary document</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-gray-400 hover:text-amber-500"
                    onClick={() => setFlaggingItem(item)}
                  >
                    <Flag className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Flag for review</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {item.isCustom && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                      onClick={() => handleDeleteCustom(item._id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete requirement</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header with filters */}
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900">
              {selectedCategory || 'All Requirements'}
            </h3>
            <div className="text-sm text-gray-500">
              {filteredItems.filter(i => i.status === 'fulfilled').length} / {filteredItems.length} complete
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search requirements..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            
            <Select value={phaseFilter} onValueChange={setPhaseFilter}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Phase" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Phases</SelectItem>
                <SelectItem value="indicative_terms">Indicative Terms</SelectItem>
                <SelectItem value="credit_submission">Credit Submission</SelectItem>
                <SelectItem value="post_credit">Post-Credit</SelectItem>
                <SelectItem value="always">Always Required</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="required">Required</SelectItem>
                <SelectItem value="nice_to_have">Nice to have</SelectItem>
                <SelectItem value="optional">Optional</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <AlertCircle className="w-8 h-8 mb-2 text-gray-300" />
              <p className="text-sm">No requirements found</p>
              <p className="text-xs text-gray-400 mt-1">
                Try adjusting your filters
              </p>
            </div>
          ) : (
            <>
              {/* Pending Review Section */}
              {groupedItems.pending_review.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <h4 className="text-xs font-medium text-amber-700 uppercase tracking-wide">
                      Pending Review ({groupedItems.pending_review.length})
                    </h4>
                  </div>
                  {groupedItems.pending_review.map(renderItem)}
                </div>
              )}

              {/* Missing Section */}
              {groupedItems.missing.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Circle className="w-4 h-4 text-gray-400" />
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Missing ({groupedItems.missing.length})
                    </h4>
                  </div>
                  {groupedItems.missing.map(renderItem)}
                </div>
              )}

              {/* Fulfilled Section */}
              {groupedItems.fulfilled.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <h4 className="text-xs font-medium text-green-700 uppercase tracking-wide">
                      Fulfilled ({groupedItems.fulfilled.length})
                    </h4>
                  </div>
                  {groupedItems.fulfilled.map(renderItem)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Document Linking Dialog */}
      <Dialog
        open={!!linkingItemId}
        onOpenChange={() => {
          setLinkingItemId(null);
          setSelectedDocIds(new Set());
          setDocSearchQuery('');
          setCollapsedFolders(new Set());
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Link Documents</DialogTitle>
            <DialogDescription>
              Select one or more documents to link to this requirement
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search documents..."
              value={docSearchQuery}
              onChange={(e) => setDocSearchQuery(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>

          <div className="max-h-[28rem] overflow-y-auto">
            {groupedDocuments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">
                  {docSearchQuery ? 'No documents match your search' : 'No documents available'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {docSearchQuery ? 'Try a different search term' : 'Upload documents to the client\'s library first'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {groupedDocuments.map(({ folderId, displayName, docs }) => {
                  const isCollapsed = collapsedFolders.has(folderId);
                  return (
                    <div key={folderId}>
                      {/* Folder Header */}
                      <button
                        className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-gray-50 rounded-md transition-colors"
                        onClick={() => toggleFolder(folderId)}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                        <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-700">{displayName}</span>
                        <span className="text-xs text-gray-400 ml-auto">{docs.length}</span>
                      </button>

                      {/* Folder Contents */}
                      {!isCollapsed && (
                        <div className="ml-6 space-y-0.5 mb-2">
                          {docs.map((doc: any) => {
                            const isAlreadyLinked = alreadyLinkedIds.has(doc._id as string);
                            const isSelected = selectedDocIds.has(doc._id);
                            return (
                              <label
                                key={doc._id}
                                className={cn(
                                  "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors",
                                  isAlreadyLinked
                                    ? "bg-green-50 border border-green-100 cursor-default"
                                    : isSelected
                                    ? "bg-blue-50 border border-blue-200"
                                    : "hover:bg-gray-50 border border-transparent"
                                )}
                              >
                                <Checkbox
                                  checked={isAlreadyLinked || isSelected}
                                  disabled={isAlreadyLinked}
                                  onCheckedChange={() => !isAlreadyLinked && toggleDocSelection(doc._id)}
                                />
                                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-900 truncate">
                                    {doc.fileName}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="secondary" className="text-[10px] h-4">
                                      {doc.fileTypeDetected || doc.category}
                                    </Badge>
                                    <span className="text-[10px] text-gray-400">
                                      {new Date(doc.uploadedAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                                {isAlreadyLinked && (
                                  <Badge variant="outline" className="text-[10px] h-4 bg-green-100 text-green-700 border-green-200 flex-shrink-0">
                                    Linked
                                  </Badge>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              {selectedDocIds.size > 0
                ? `${selectedDocIds.size} document${selectedDocIds.size > 1 ? 's' : ''} selected`
                : 'Select documents to link'}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLinkingItemId(null);
                  setSelectedDocIds(new Set());
                  setDocSearchQuery('');
                  setCollapsedFolders(new Set());
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={selectedDocIds.size === 0 || isLinking}
                onClick={handleBatchLinkDocuments}
              >
                {isLinking ? 'Linking...' : `Link Selected (${selectedDocIds.size})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Flag Modal */}
      {flaggingItem && (
        <FlagCreationModal
          isOpen={!!flaggingItem}
          onClose={() => setFlaggingItem(null)}
          entityType="checklist_item"
          entityId={flaggingItem._id}
          entityName={flaggingItem.name}
          entityContext={flaggingItem.category}
          clientId={clientId}
          projectId={projectId}
        />
      )}
    </>
  );
}
