'use client';

import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  FileText, 
  Image as ImageIcon,
  File,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Sparkles,
  Lightbulb,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import FilingPreview from './FilingPreview';
import { FILE_CATEGORIES } from '@/lib/categories';

interface SuggestedChecklistItem {
  itemId: string;
  itemName: string;
  category: string;
  confidence: number;
  reasoning?: string;
}

interface AvailableChecklistItem {
  _id: string;
  name: string;
  category: string;
  status: string;
  linkedDocumentCount: number;
}

interface Job {
  _id: Id<"fileUploadQueue">;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileStorageId?: Id<"_storage">;
  documentId?: Id<"documents">;
  analysisResult?: {
    summary?: string;
    fileTypeDetected?: string;
    category?: string;
    suggestedClientName?: string;
    suggestedProjectName?: string;
    confidence?: number;
    reasoning?: string;
    suggestedChecklistItems?: SuggestedChecklistItem[];
  };
  availableChecklistItems?: AvailableChecklistItem[];
  status: string;
  createdAt: string;
}

interface FilingData {
  clientId: Id<"clients"> | null;
  projectId: Id<"projects"> | null;
  folderId: string;
  folderType: 'client' | 'project';
  summary: string;
  category: string;
  fileTypeDetected: string;
  checklistItemIds: Id<"knowledgeChecklistItems">[];
}

interface DocumentReviewCardProps {
  job: Job;
  filingData: FilingData;
  onFilingDataChange: (data: Partial<FilingData>) => void;
}

export default function DocumentReviewCard({
  job,
  filingData,
  onFilingDataChange,
}: DocumentReviewCardProps) {
  // Fetch file URL for preview
  const fileUrl = useQuery(
    api.documents.getFileUrl,
    job.fileStorageId ? { storageId: job.fileStorageId } : "skip"
  );

  // Fetch clients for selection
  const clients = useQuery(api.clients.list, {});

  // Fetch projects for selected client
  const projects = useQuery(
    api.projects.list,
    filingData.clientId ? { clientId: filingData.clientId } : "skip"
  );

  // Fetch client folders
  const clientFolders = useQuery(
    api.clients.getClientFolders,
    filingData.clientId ? { clientId: filingData.clientId } : "skip"
  );

  // Fetch project folders
  const projectFolders = useQuery(
    api.projects.getProjectFolders,
    filingData.projectId ? { projectId: filingData.projectId } : "skip"
  );

  // State for checklist section
  const [checklistExpanded, setChecklistExpanded] = useState(false);

  // Get available checklist items (from job or fetch them)
  const availableChecklistItems = job.availableChecklistItems || [];
  const suggestedChecklistItems = job.analysisResult?.suggestedChecklistItems || [];

  // Auto-expand if there are AI suggestions
  useEffect(() => {
    if (suggestedChecklistItems.length > 0) {
      setChecklistExpanded(true);
    }
  }, [suggestedChecklistItems.length]);

  // Group checklist items by category
  const groupedChecklistItems = availableChecklistItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof availableChecklistItems>);

  // Check if an item is suggested by AI
  const getSuggestion = (itemId: string) => 
    suggestedChecklistItems.find(s => s.itemId === itemId);

  // Toggle checklist item selection
  const toggleChecklistItem = (itemId: string) => {
    const currentIds = filingData.checklistItemIds || [];
    const isSelected = currentIds.includes(itemId as Id<"knowledgeChecklistItems">);
    
    if (isSelected) {
      onFilingDataChange({
        checklistItemIds: currentIds.filter(id => id !== itemId),
      });
    } else {
      onFilingDataChange({
        checklistItemIds: [...currentIds, itemId as Id<"knowledgeChecklistItems">],
      });
    }
  };

  // Get file icon based on type
  const getFileIcon = () => {
    if (job.fileType.startsWith('image/')) {
      return <ImageIcon className="w-6 h-6 text-purple-500" />;
    }
    if (job.fileType === 'application/pdf') {
      return <FileText className="w-6 h-6 text-red-500" />;
    }
    return <File className="w-6 h-6 text-gray-500" />;
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Determine available folders based on context
  const availableFolders = filingData.folderType === 'project' 
    ? projectFolders || []
    : clientFolders?.filter(f => !f.parentFolderId) || [];

  // Check if can show document preview
  const canPreview = job.fileType.startsWith('image/') || job.fileType === 'application/pdf';

  return (
    <div className="flex-1 flex gap-6 overflow-hidden">
      {/* Left Panel: Document Preview */}
      <div className="flex-1 min-w-0 bg-gray-100 rounded-lg overflow-hidden flex flex-col">
        <div className="p-3 bg-white border-b flex items-center gap-3">
          {getFileIcon()}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900 truncate">{job.fileName}</p>
            <p className="text-xs text-gray-500">{formatFileSize(job.fileSize)}</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          {canPreview && fileUrl ? (
            job.fileType.startsWith('image/') ? (
              <img 
                src={fileUrl} 
                alt={job.fileName}
                className="max-w-full h-auto rounded shadow-sm"
              />
            ) : (
              <iframe
                src={fileUrl}
                className="w-full h-full min-h-[500px] rounded shadow-sm bg-white"
                title={job.fileName}
              />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                {getFileIcon()}
                <p className="mt-2 text-sm">Preview not available</p>
                <p className="text-xs text-gray-400">{job.fileType}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Filing Info */}
      <div className="w-[400px] flex-shrink-0 flex flex-col gap-4 overflow-auto">
        {/* Analysis Result Section */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Filing Information</h3>
            {job.analysisResult?.confidence && (
              <Badge variant="outline" className="text-xs">
                {Math.round(job.analysisResult.confidence * 100)}% confidence
              </Badge>
            )}
          </div>

          {/* Reasoning/Attention needed */}
          {job.analysisResult?.reasoning && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-amber-800">AI Reasoning</p>
                  <p className="text-xs text-amber-700 mt-1">{job.analysisResult.reasoning}</p>
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Summary
            </label>
            <Textarea
              value={filingData.summary}
              onChange={(e) => onFilingDataChange({ summary: e.target.value })}
              placeholder="Document summary..."
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Document Type */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Document Type
            </label>
            <Input
              value={filingData.fileTypeDetected}
              onChange={(e) => onFilingDataChange({ fileTypeDetected: e.target.value })}
              placeholder="e.g., Term Sheet, Invoice..."
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Category
            </label>
            <Select
              value={filingData.category}
              onValueChange={(value) => onFilingDataChange({ category: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {FILE_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filing Destination Section */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <h3 className="font-semibold text-gray-900">Filing Destination</h3>

          {/* Client Selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Client <span className="text-red-500">*</span>
            </label>
            <Select
              value={filingData.clientId || ""}
              onValueChange={(value) => {
                onFilingDataChange({ 
                  clientId: value as Id<"clients">,
                  projectId: null, // Reset project when client changes
                  folderId: '',
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients?.map((client) => (
                  <SelectItem key={client._id} value={client._id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Project Selection (Optional) */}
          {filingData.clientId && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Project (Optional)
              </label>
              <Select
                value={filingData.projectId || "none"}
                onValueChange={(value) => {
                  const projectId = value === "none" ? null : value as Id<"projects">;
                  onFilingDataChange({ 
                    projectId,
                    folderType: projectId ? 'project' : 'client',
                    folderId: '',
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project (client-level)</SelectItem>
                  {projects?.map((project) => (
                    <SelectItem key={project._id} value={project._id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Folder Selection */}
          {filingData.clientId && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Folder <span className="text-red-500">*</span>
              </label>
              <Select
                value={filingData.folderId}
                onValueChange={(value) => onFilingDataChange({ folderId: value })}
                disabled={filingData.folderType === 'project' && !filingData.projectId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select folder" />
                </SelectTrigger>
                <SelectContent>
                  {availableFolders.map((folder) => (
                    <SelectItem key={folder._id} value={folder.folderType}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Knowledge Library Checklist (Optional) */}
        {filingData.clientId && availableChecklistItems.length > 0 && (
          <div className="bg-white rounded-lg border overflow-hidden">
            {/* Collapsible Header */}
            <button
              onClick={() => setChecklistExpanded(!checklistExpanded)}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <h3 className="font-semibold text-gray-900">Knowledge Library</h3>
                <Badge variant="outline" className="text-xs">Optional</Badge>
                {filingData.checklistItemIds.length > 0 && (
                  <Badge className="bg-blue-100 text-blue-700 text-xs">
                    {filingData.checklistItemIds.length} selected
                  </Badge>
                )}
              </div>
              {checklistExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {/* Expanded Content */}
            {checklistExpanded && (
              <div className="p-4 pt-0 space-y-4 border-t">
                <p className="text-xs text-gray-500">
                  Link this document to checklist requirements. Most documents don't need linking.
                </p>

                {/* AI Suggestions */}
                {suggestedChecklistItems.length > 0 && (
                  <div className="bg-amber-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-amber-800">
                      <Sparkles className="w-3.5 h-3.5" />
                      AI Suggestions
                    </div>
                    {suggestedChecklistItems.map((suggestion) => {
                      const isSelected = filingData.checklistItemIds.includes(
                        suggestion.itemId as Id<"knowledgeChecklistItems">
                      );
                      return (
                        <div
                          key={suggestion.itemId}
                          className="flex items-start gap-2 text-sm"
                        >
                          <Checkbox
                            id={`suggestion-${suggestion.itemId}`}
                            checked={isSelected}
                            onCheckedChange={() => toggleChecklistItem(suggestion.itemId)}
                            className="mt-0.5"
                          />
                          <label
                            htmlFor={`suggestion-${suggestion.itemId}`}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-amber-900">
                                {suggestion.itemName}
                              </span>
                              <Badge variant="outline" className="text-[10px] h-4">
                                {Math.round(suggestion.confidence * 100)}% match
                              </Badge>
                            </div>
                            {suggestion.reasoning && (
                              <p className="text-xs text-amber-700 mt-0.5">
                                {suggestion.reasoning}
                              </p>
                            )}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* All Checklist Items by Category */}
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {Object.entries(groupedChecklistItems).map(([category, items]) => (
                    <div key={category}>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        {category}
                      </h4>
                      <div className="space-y-1">
                        {items.map((item) => {
                          const isSelected = filingData.checklistItemIds.includes(
                            item._id as Id<"knowledgeChecklistItems">
                          );
                          const suggestion = getSuggestion(item._id);
                          const isFulfilled = item.status === 'fulfilled';
                          
                          return (
                            <div
                              key={item._id}
                              className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                                isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                              }`}
                            >
                              <Checkbox
                                id={`checklist-${item._id}`}
                                checked={isSelected}
                                onCheckedChange={() => toggleChecklistItem(item._id)}
                              />
                              <label
                                htmlFor={`checklist-${item._id}`}
                                className="flex-1 flex items-center gap-2 cursor-pointer text-sm"
                              >
                                {isFulfilled ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                ) : (
                                  <Circle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                                )}
                                <span className={isFulfilled ? 'text-gray-500' : 'text-gray-700'}>
                                  {item.name}
                                </span>
                                {isFulfilled && (
                                  <Badge variant="outline" className="text-[10px] h-4 text-green-600">
                                    {item.linkedDocumentCount} doc{item.linkedDocumentCount !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                                {suggestion && !suggestedChecklistItems.some(s => s.itemId === item._id) && (
                                  <Badge className="text-[10px] h-4 bg-amber-100 text-amber-700">
                                    AI match
                                  </Badge>
                                )}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Selection Summary */}
                <div className="text-xs text-gray-500 pt-2 border-t">
                  {filingData.checklistItemIds.length === 0 ? (
                    <span>No checklist items selected — document will be filed without linking</span>
                  ) : (
                    <span>
                      {filingData.checklistItemIds.length} item{filingData.checklistItemIds.length !== 1 ? 's' : ''} will be marked as fulfilled
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filing Preview */}
        <FilingPreview
          clientId={filingData.clientId}
          projectId={filingData.projectId}
          folderId={filingData.folderId}
          folderType={filingData.folderType}
        />
      </div>
    </div>
  );
}
