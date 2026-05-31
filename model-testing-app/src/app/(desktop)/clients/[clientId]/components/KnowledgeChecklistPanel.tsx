'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Modal, Button, IconButton, StatusPill, FlagChip, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
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
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Plus,
  Flag,
} from 'lucide-react';
import FlagCreationModal from '@/components/FlagCreationModal';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

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
}: KnowledgeChecklistPanelProps) {
  const colors = useColors();
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
        return <CheckCircle2 size={18} style={{ color: colors.entityTypes.client }} />;
      case 'pending_review':
        return <Clock size={18} style={{ color: colors.accent.yellow }} />;
      default:
        return <Circle size={18} style={{ color: colors.text.dim }} />;
    }
  };

  // Priority pill
  const priorityPill = (priority: string) => {
    if (priority === 'required') return <StatusPill label="Required" tone={colors.accent.red} />;
    if (priority === 'nice_to_have') return <StatusPill label="Nice to have" tone={colors.accent.blue} />;
    return <StatusPill label="Optional" tone={colors.text.muted} />;
  };

  // Get phase label
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

  // Row accent tint by status
  const itemAccent = (status: string) =>
    status === 'fulfilled'
      ? colors.entityTypes.client
      : status === 'pending_review'
      ? colors.accent.yellow
      : colors.border.default;

  // Render single item
  const renderItem = (item: ChecklistItem) => (
    <div
      key={item._id}
      style={{
        marginBottom: 8,
        background: colors.bg.card,
        border: `1px solid ${colors.border.default}`,
        borderLeft: `2px solid ${itemAccent(item.status)}`,
        borderRadius: 4,
        padding: 14,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Status Icon */}
        <div style={{ marginTop: 1 }}>
          {getStatusIcon(item.status)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{item.name}</h4>
            {priorityPill(item.priority)}
            {item.isCustom && (
              item.customSource === 'llm' ? (
                <FlagChip label="Dynamic" severity="info" />
              ) : (
                <FlagChip label="Custom" severity="info" />
              )
            )}
          </div>

          {item.description && (
            <p className="line-clamp-2" style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>{item.description}</p>
          )}

          <div className="flex items-center gap-2" style={{ marginTop: 8, fontSize: 10, color: colors.text.muted, fontFamily: MONO }}>
            <span>{getPhaseLabel(item.phaseRequired)}</span>
            <span>·</span>
            <span>{item.category}</span>
          </div>

          {/* AI Suggestion */}
          {item.status === 'pending_review' && item.suggestedDocumentId && (
            <div
              style={{
                marginTop: 12,
                padding: 8,
                background: `${colors.accent.yellow}12`,
                border: `1px solid ${colors.accent.yellow}40`,
                borderRadius: 4,
              }}
            >
              <div className="flex items-center gap-2" style={{ fontSize: 11, color: colors.text.secondary }}>
                <Sparkles size={13} style={{ color: colors.accent.yellow }} />
                <span style={{ fontWeight: 500 }}>AI suggestion:</span>
                <span className="truncate">{item.suggestedDocumentName}</span>
                {item.suggestedConfidence && (
                  <span style={{ color: colors.text.muted, fontFamily: MONO }}>
                    ({Math.round(item.suggestedConfidence * 100)}% confidence)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
                <Button variant="primary" accent={colors.entityTypes.client} size="sm" onClick={() => handleConfirmSuggestion(item._id)}>
                  <Check size={12} />
                  Confirm
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleRejectSuggestion(item._id)}>
                  <X size={12} />
                  Reject
                </Button>
              </div>
            </div>
          )}

          {/* Linked Documents */}
          {item.status === 'fulfilled' && item.primaryDocument && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Primary Document + Count */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpandedItemId(expandedItemId === item._id ? null : item._id)}
                  className="flex items-center gap-2"
                  style={{ fontSize: 11, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0' }}
                >
                  <FileText size={13} style={{ color: colors.entityTypes.client }} />
                  <a
                    href={`/docs/reader/${item.primaryDocument.documentId}`}
                    className="truncate"
                    style={{ color: colors.entityTypes.client, fontWeight: 500, maxWidth: 150, textDecoration: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.primaryDocument.documentName}
                  </a>
                  {(item.linkedDocumentCount || 0) > 1 && (
                    <FlagChip label={`+${(item.linkedDocumentCount || 1) - 1} more`} severity="ok" />
                  )}
                  {(item.linkedDocumentCount || 0) > 1 && (
                    expandedItemId === item._id
                      ? <ChevronUp size={12} style={{ color: colors.text.muted }} />
                      : <ChevronDown size={12} style={{ color: colors.text.muted }} />
                  )}
                </button>
                {item.primaryDocument.linkedAt && (
                  <span style={{ fontSize: 9, color: colors.text.muted, fontFamily: MONO }}>
                    {new Date(item.primaryDocument.linkedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Expanded List of All Linked Documents */}
              {expandedItemId === item._id && linkedDocuments && linkedDocuments.length > 0 && (
                <div style={{ marginLeft: 16, paddingLeft: 12, borderLeft: `2px solid ${colors.entityTypes.client}40`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {linkedDocuments.map((doc) => (
                    <div key={doc._id} className="flex items-center gap-2 group" style={{ fontSize: 11 }}>
                      <FileText size={12} style={{ color: colors.text.muted }} />
                      <a
                        href={`/docs/reader/${doc.documentId}`}
                        className="truncate"
                        style={{
                          maxWidth: 140,
                          textDecoration: 'none',
                          color: doc.isPrimary ? colors.entityTypes.client : colors.text.muted,
                          fontWeight: doc.isPrimary ? 500 : 400,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {doc.documentName}
                      </a>
                      {doc.isPrimary && <FlagChip label="Primary" severity="ok" />}
                      <span style={{ fontSize: 9, color: colors.text.muted, fontFamily: MONO }}>
                        {new Date(doc.linkedAt).toLocaleDateString()}
                      </span>
                      <span className="opacity-0 group-hover:opacity-100">
                        <IconButton label="Unlink document" onClick={() => handleUnlinkSpecific(item._id, doc.documentId)}>
                          <X size={12} />
                        </IconButton>
                      </span>
                      <span className="opacity-0 group-hover:opacity-100">
                        <IconButton label="Open document" onClick={() => window.open(`/docs/${doc.documentId}`, '_blank')}>
                          <ExternalLink size={12} />
                        </IconButton>
                      </span>
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
          <IconButton
            label={item.status === 'fulfilled' ? 'Add another document' : 'Link document'}
            onClick={() => setLinkingItemId(item._id)}
          >
            {item.status === 'fulfilled' ? <Plus size={15} /> : <LinkIcon size={15} />}
          </IconButton>

          {/* Unlink All Button - only for fulfilled items */}
          {item.status === 'fulfilled' && (
            <IconButton label="Unlink all documents" onClick={() => handleUnlinkAll(item._id)}>
              <Unlink size={15} />
            </IconButton>
          )}

          {/* View Primary Document */}
          {item.primaryDocument && (
            <IconButton label="View primary document" onClick={() => window.open(`/docs/${item.primaryDocument?.documentId}`, '_blank')}>
              <ExternalLink size={15} />
            </IconButton>
          )}

          <IconButton label="Flag for review" onClick={() => setFlaggingItem(item)}>
            <Flag size={15} />
          </IconButton>

          {item.isCustom && (
            <IconButton label="Delete requirement" onClick={() => handleDeleteCustom(item._id)}>
              <Trash2 size={15} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header with filters */}
        <div style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="flex items-center justify-between">
            <h3 style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
              {selectedCategory || 'All Requirements'}
            </h3>
            <div style={{ fontSize: 11, color: colors.text.muted, fontFamily: MONO }}>
              {filteredItems.filter(i => i.status === 'fulfilled').length} / {filteredItems.length} complete
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-2 flex-1"
              style={{
                background: colors.bg.card,
                border: `1px solid ${colors.border.default}`,
                borderRadius: 4,
                padding: '0 10px',
              }}
            >
              <Search size={14} style={{ color: colors.text.muted, flexShrink: 0 }} />
              <input
                placeholder="Search requirements..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, padding: '6px 0', fontSize: 12, color: colors.text.primary, background: 'transparent', border: 'none', outline: 'none' }}
              />
            </div>

            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value)}
              style={{
                padding: '6px 8px', fontSize: 11, color: colors.text.primary, background: colors.bg.card,
                border: `1px solid ${colors.border.default}`, borderRadius: 4, cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="all">All Phases</option>
              <option value="indicative_terms">Indicative Terms</option>
              <option value="credit_submission">Credit Submission</option>
              <option value="post_credit">Post-Credit</option>
              <option value="always">Always Required</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              style={{
                padding: '6px 8px', fontSize: 11, color: colors.text.primary, background: colors.bg.card,
                border: `1px solid ${colors.border.default}`, borderRadius: 4, cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="all">All</option>
              <option value="required">Required</option>
              <option value="nice_to_have">Nice to have</option>
              <option value="optional">Optional</option>
            </select>
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
          {filteredItems.length === 0 ? (
            <EmptyState
              icon={<AlertCircle size={32} />}
              title="No requirements found"
              body="Try adjusting your filters"
            />
          ) : (
            <>
              {/* Pending Review Section */}
              {groupedItems.pending_review.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                    <Clock size={14} style={{ color: colors.accent.yellow }} />
                    <h4 style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.accent.yellow, fontWeight: 500 }}>
                      Pending Review ({groupedItems.pending_review.length})
                    </h4>
                  </div>
                  {groupedItems.pending_review.map(renderItem)}
                </div>
              )}

              {/* Missing Section */}
              {groupedItems.missing.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                    <Circle size={14} style={{ color: colors.text.muted }} />
                    <h4 style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500 }}>
                      Missing ({groupedItems.missing.length})
                    </h4>
                  </div>
                  {groupedItems.missing.map(renderItem)}
                </div>
              )}

              {/* Fulfilled Section */}
              {groupedItems.fulfilled.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                    <CheckCircle2 size={14} style={{ color: colors.entityTypes.client }} />
                    <h4 style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.entityTypes.client, fontWeight: 500 }}>
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

      {/* Document Linking Modal */}
      <Modal
        open={!!linkingItemId}
        onClose={() => {
          setLinkingItemId(null);
          setSelectedDocIds(new Set());
          setDocSearchQuery('');
          setCollapsedFolders(new Set());
        }}
        title="Link documents"
        width={680}
        footer={
          <>
            <span style={{ fontSize: 10, color: colors.text.muted, marginRight: 'auto', fontFamily: MONO }}>
              {selectedDocIds.size > 0
                ? `${selectedDocIds.size} document${selectedDocIds.size > 1 ? 's' : ''} selected`
                : 'Select documents to link'}
            </span>
            <Button
              variant="secondary"
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
              variant="primary"
              accent={colors.entityTypes.client}
              disabled={selectedDocIds.size === 0 || isLinking}
              onClick={handleBatchLinkDocuments}
            >
              {isLinking ? 'Linking' : `Link selected (${selectedDocIds.size})`}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 11, color: colors.text.muted }}>
            Select one or more documents to link to this requirement
          </p>

          {/* Search */}
          <div
            className="flex items-center gap-2"
            style={{
              background: colors.bg.card,
              border: `1px solid ${colors.border.default}`,
              borderRadius: 4,
              padding: '0 10px',
            }}
          >
            <Search size={14} style={{ color: colors.text.muted, flexShrink: 0 }} />
            <input
              placeholder="Search documents..."
              value={docSearchQuery}
              onChange={(e) => setDocSearchQuery(e.target.value)}
              style={{ flex: 1, padding: '7px 0', fontSize: 12, color: colors.text.primary, background: 'transparent', border: 'none', outline: 'none' }}
            />
          </div>

          <div style={{ maxHeight: '28rem', overflowY: 'auto' }}>
            {groupedDocuments.length === 0 ? (
              <EmptyState
                icon={<FileText size={32} />}
                title={docSearchQuery ? 'No documents match your search' : 'No documents available'}
                body={docSearchQuery ? 'Try a different search term' : "Upload documents to the client's library first"}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {groupedDocuments.map(({ folderId, displayName, docs }) => {
                  const isCollapsed = collapsedFolders.has(folderId);
                  return (
                    <div key={folderId}>
                      {/* Folder Header */}
                      <button
                        className="w-full flex items-center gap-2 text-left"
                        style={{ padding: '8px', borderRadius: 4, background: 'transparent', border: 'none', cursor: 'pointer' }}
                        onClick={() => toggleFolder(folderId)}
                      >
                        {isCollapsed ? (
                          <ChevronRight size={14} style={{ color: colors.text.muted, flexShrink: 0 }} />
                        ) : (
                          <ChevronDown size={14} style={{ color: colors.text.muted, flexShrink: 0 }} />
                        )}
                        <Folder size={14} style={{ color: colors.accent.yellow, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>{displayName}</span>
                        <span style={{ fontSize: 10, color: colors.text.muted, marginLeft: 'auto', fontFamily: MONO }}>{docs.length}</span>
                      </button>

                      {/* Folder Contents */}
                      {!isCollapsed && (
                        <div style={{ marginLeft: 24, display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
                          {docs.map((doc: any) => {
                            const isAlreadyLinked = alreadyLinkedIds.has(doc._id as string);
                            const isSelected = selectedDocIds.has(doc._id);
                            const rowBg = isAlreadyLinked
                              ? `${colors.entityTypes.client}10`
                              : isSelected
                              ? `${colors.accent.blue}10`
                              : 'transparent';
                            const rowBorder = isAlreadyLinked
                              ? `${colors.entityTypes.client}40`
                              : isSelected
                              ? `${colors.accent.blue}40`
                              : 'transparent';
                            const checked = isAlreadyLinked || isSelected;
                            const tickColor = isAlreadyLinked ? colors.entityTypes.client : colors.accent.blue;
                            return (
                              <label
                                key={doc._id}
                                className="flex items-center gap-3"
                                style={{
                                  padding: '8px 10px',
                                  borderRadius: 4,
                                  cursor: isAlreadyLinked ? 'default' : 'pointer',
                                  background: rowBg,
                                  border: `1px solid ${rowBorder}`,
                                }}
                              >
                                {/* Token-styled checkbox — keeps the original toggle logic */}
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={checked}
                                  disabled={isAlreadyLinked}
                                  onClick={() => !isAlreadyLinked && toggleDocSelection(doc._id)}
                                  style={{
                                    width: 16,
                                    height: 16,
                                    flexShrink: 0,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: 3,
                                    border: `1px solid ${checked ? tickColor : colors.border.mid}`,
                                    background: checked ? tickColor : colors.bg.card,
                                    color: '#ffffff',
                                    cursor: isAlreadyLinked ? 'default' : 'pointer',
                                    padding: 0,
                                  }}
                                >
                                  {checked && <Check size={11} />}
                                </button>
                                <FileText size={14} style={{ color: colors.text.muted, flexShrink: 0 }} />
                                <div className="flex-1 min-w-0">
                                  <p className="truncate" style={{ fontSize: 12, color: colors.text.primary }}>
                                    {doc.fileName}
                                  </p>
                                  <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
                                    <StatusPill label={doc.fileTypeDetected || doc.category || 'doc'} tone={colors.text.muted} />
                                    <span style={{ fontSize: 9, color: colors.text.muted, fontFamily: MONO }}>
                                      {new Date(doc.uploadedAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                                {isAlreadyLinked && (
                                  <span style={{ flexShrink: 0 }}>
                                    <FlagChip label="Linked" severity="ok" />
                                  </span>
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
        </div>
      </Modal>

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
