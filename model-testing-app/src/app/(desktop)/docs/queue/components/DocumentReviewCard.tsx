'use client';

import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Panel, Field, Input, Textarea, Select, StatusPill, FlagChip } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
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
  const colors = useColors();

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
      return <ImageIcon className="w-6 h-6" style={{ color: colors.accent.purple }} />;
    }
    if (job.fileType === 'application/pdf') {
      return <FileText className="w-6 h-6" style={{ color: colors.accent.red }} />;
    }
    return <File className="w-6 h-6" style={{ color: colors.text.muted }} />;
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
      <div
        className="flex-1 min-w-0 overflow-hidden flex flex-col"
        style={{ background: colors.bg.cardAlt, borderRadius: 4, border: `1px solid ${colors.border.default}` }}
      >
        <div
          className="flex items-center gap-3"
          style={{ padding: 12, background: colors.bg.card, borderBottom: `1px solid ${colors.border.default}` }}
        >
          {getFileIcon()}
          <div className="min-w-0 flex-1">
            <p className="truncate" style={{ fontWeight: 500, color: colors.text.primary }}>{job.fileName}</p>
            <p style={{ fontSize: 11, color: colors.text.muted }}>{formatFileSize(job.fileSize)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-auto" style={{ padding: 16 }}>
          {canPreview && fileUrl ? (
            job.fileType.startsWith('image/') ? (
              <img
                src={fileUrl}
                alt={job.fileName}
                className="max-w-full h-auto"
                style={{ borderRadius: 4 }}
              />
            ) : (
              <iframe
                src={fileUrl}
                className="w-full h-full min-h-[500px]"
                style={{ borderRadius: 4, background: colors.bg.card }}
                title={job.fileName}
              />
            )
          ) : (
            <div className="flex items-center justify-center h-full" style={{ color: colors.text.muted }}>
              <div className="text-center">
                {getFileIcon()}
                <p style={{ marginTop: 8, fontSize: 12 }}>Preview not available</p>
                <p style={{ fontSize: 11, color: colors.text.dim }}>{job.fileType}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Filing Info */}
      <div className="w-[400px] flex-shrink-0 flex flex-col gap-4 overflow-auto">
        {/* Analysis Result Section */}
        <Panel
          title="Filing Information"
          actions={
            job.analysisResult?.confidence ? (
              <FlagChip label={`${Math.round(job.analysisResult.confidence * 100)}% confidence`} severity="info" />
            ) : undefined
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Reasoning/Attention needed */}
            {job.analysisResult?.reasoning && (
              <div
                style={{
                  background: `${colors.accent.orange}15`,
                  border: `1px solid ${colors.accent.orange}40`,
                  borderRadius: 4,
                  padding: 12,
                }}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: colors.accent.orange }} />
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 500, color: colors.accent.orange }}>AI Reasoning</p>
                    <p style={{ fontSize: 11, color: colors.text.secondary, marginTop: 4 }}>{job.analysisResult.reasoning}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Summary */}
            <Field label="Summary">
              <Textarea
                value={filingData.summary}
                onChange={(e) => onFilingDataChange({ summary: e.target.value })}
                placeholder="Document summary..."
                rows={3}
              />
            </Field>

            {/* Document Type */}
            <Field label="Document Type">
              <Input
                value={filingData.fileTypeDetected}
                onChange={(e) => onFilingDataChange({ fileTypeDetected: e.target.value })}
                placeholder="e.g., Term Sheet, Invoice..."
              />
            </Field>

            {/* Category */}
            <Field label="Category">
              <Select
                value={filingData.category}
                onChange={(e) => onFilingDataChange({ category: e.target.value })}
              >
                <option value="">Select category</option>
                {FILE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </Select>
            </Field>
          </div>
        </Panel>

        {/* Filing Destination Section */}
        <Panel title="Filing Destination">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Client Selection */}
            <Field label="Client *">
              <Select
                value={filingData.clientId || ""}
                onChange={(e) => {
                  onFilingDataChange({
                    clientId: e.target.value as Id<"clients">,
                    projectId: null, // Reset project when client changes
                    folderId: '',
                  });
                }}
              >
                <option value="">Select client</option>
                {clients?.map((client) => (
                  <option key={client._id} value={client._id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Project Selection (Optional) */}
            {filingData.clientId && (
              <Field label="Project (Optional)">
                <Select
                  value={filingData.projectId || "none"}
                  onChange={(e) => {
                    const value = e.target.value;
                    const projectId = value === "none" ? null : value as Id<"projects">;
                    onFilingDataChange({
                      projectId,
                      folderType: projectId ? 'project' : 'client',
                      folderId: '',
                    });
                  }}
                >
                  <option value="none">No project (client-level)</option>
                  {projects?.map((project) => (
                    <option key={project._id} value={project._id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {/* Folder Selection */}
            {filingData.clientId && (
              <Field label="Folder *">
                <Select
                  value={filingData.folderId}
                  onChange={(e) => onFilingDataChange({ folderId: e.target.value })}
                  disabled={filingData.folderType === 'project' && !filingData.projectId}
                >
                  <option value="">Select folder</option>
                  {availableFolders.map((folder) => (
                    <option key={folder._id} value={folder.folderType}>
                      {folder.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </Panel>

        {/* Knowledge Library Checklist (Optional) */}
        {filingData.clientId && availableChecklistItems.length > 0 && (
          <div
            style={{
              background: colors.bg.card,
              border: `1px solid ${colors.border.default}`,
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            {/* Collapsible Header */}
            <button
              onClick={() => setChecklistExpanded(!checklistExpanded)}
              className="w-full flex items-center justify-between"
              style={{ padding: 14, background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4" style={{ color: colors.accent.orange }} />
                <span
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 9,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: colors.text.muted,
                    fontWeight: 500,
                  }}
                >
                  Knowledge Library
                </span>
                <FlagChip label="Optional" severity="info" />
                {filingData.checklistItemIds.length > 0 && (
                  <StatusPill label={`${filingData.checklistItemIds.length} selected`} tone={colors.accent.blue} />
                )}
              </div>
              {checklistExpanded ? (
                <ChevronUp className="w-4 h-4" style={{ color: colors.text.muted }} />
              ) : (
                <ChevronDown className="w-4 h-4" style={{ color: colors.text.muted }} />
              )}
            </button>

            {/* Expanded Content */}
            {checklistExpanded && (
              <div style={{ padding: 14, paddingTop: 0, borderTop: `1px solid ${colors.border.default}`, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 14 }}>
                  Link this document to checklist requirements. Most documents don't need linking.
                </p>

                {/* AI Suggestions */}
                {suggestedChecklistItems.length > 0 && (
                  <div
                    style={{
                      background: `${colors.accent.orange}15`,
                      border: `1px solid ${colors.accent.orange}40`,
                      borderRadius: 4,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div className="flex items-center gap-2" style={{ fontSize: 11, fontWeight: 500, color: colors.accent.orange }}>
                      <Sparkles className="w-3.5 h-3.5" />
                      AI Suggestions
                    </div>
                    {suggestedChecklistItems.map((suggestion) => {
                      const isSelected = filingData.checklistItemIds.includes(
                        suggestion.itemId as Id<"knowledgeChecklistItems">
                      );
                      return (
                        <div key={suggestion.itemId} className="flex items-start gap-2" style={{ fontSize: 12 }}>
                          <Checkbox
                            id={`suggestion-${suggestion.itemId}`}
                            checked={isSelected}
                            onCheckedChange={() => toggleChecklistItem(suggestion.itemId)}
                            className="mt-0.5"
                          />
                          <label htmlFor={`suggestion-${suggestion.itemId}`} className="flex-1 cursor-pointer">
                            <div className="flex items-center gap-2">
                              <span style={{ fontWeight: 500, color: colors.text.primary }}>
                                {suggestion.itemName}
                              </span>
                              <StatusPill label={`${Math.round(suggestion.confidence * 100)}% match`} tone={colors.accent.orange} />
                            </div>
                            {suggestion.reasoning && (
                              <p style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 256, overflowY: 'auto' }}>
                  {Object.entries(groupedChecklistItems).map(([category, items]) => (
                    <div key={category}>
                      <h4
                        style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: 9,
                          fontWeight: 500,
                          color: colors.text.muted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          marginBottom: 8,
                        }}
                      >
                        {category}
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {items.map((item) => {
                          const isSelected = filingData.checklistItemIds.includes(
                            item._id as Id<"knowledgeChecklistItems">
                          );
                          const suggestion = getSuggestion(item._id);
                          const isFulfilled = item.status === 'fulfilled';

                          return (
                            <div
                              key={item._id}
                              className="flex items-center gap-2"
                              style={{
                                padding: 8,
                                borderRadius: 4,
                                background: isSelected ? `${colors.accent.blue}15` : 'transparent',
                              }}
                            >
                              <Checkbox
                                id={`checklist-${item._id}`}
                                checked={isSelected}
                                onCheckedChange={() => toggleChecklistItem(item._id)}
                              />
                              <label
                                htmlFor={`checklist-${item._id}`}
                                className="flex-1 flex items-center gap-2 cursor-pointer"
                                style={{ fontSize: 12 }}
                              >
                                {isFulfilled ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.accent.green }} />
                                ) : (
                                  <Circle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.text.dim }} />
                                )}
                                <span style={{ color: isFulfilled ? colors.text.muted : colors.text.secondary }}>
                                  {item.name}
                                </span>
                                {isFulfilled && (
                                  <StatusPill
                                    label={`${item.linkedDocumentCount} doc${item.linkedDocumentCount !== 1 ? 's' : ''}`}
                                    tone={colors.accent.green}
                                  />
                                )}
                                {suggestion && !suggestedChecklistItems.some(s => s.itemId === item._id) && (
                                  <StatusPill label="AI match" tone={colors.accent.orange} />
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
                <div style={{ fontSize: 11, color: colors.text.muted, paddingTop: 8, borderTop: `1px solid ${colors.border.light}` }}>
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
