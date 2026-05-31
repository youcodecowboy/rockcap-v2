'use client';

import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Modal, Field, Select, Button } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Loader2, FolderInput, Building2, FolderKanban, ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { toast } from 'sonner';

type DestinationType = 'project' | 'client';

interface BulkMoveModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentIds: string[];
  currentClientId?: Id<'clients'>;
  currentProjectId?: Id<'projects'>;
  onMoveComplete?: () => void;
}

export default function BulkMoveModal({
  isOpen,
  onClose,
  documentIds,
  currentClientId,
  currentProjectId,
  onMoveComplete,
}: BulkMoveModalProps) {
  const colors = useColors();
  const [selectedClientId, setSelectedClientId] = useState<Id<'clients'> | null>(
    currentClientId || null
  );
  const [destinationType, setDestinationType] = useState<DestinationType>('project');
  const [selectedProjectId, setSelectedProjectId] = useState<Id<'projects'> | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedClientId(currentClientId || null);
      setDestinationType('project');
      setSelectedProjectId(null);
      setSelectedFolderId(null);
    }
  }, [isOpen, currentClientId]);

  // Reset downstream selections when client changes
  useEffect(() => {
    setSelectedProjectId(null);
    setSelectedFolderId(null);
  }, [selectedClientId]);

  // Reset folder when project changes
  useEffect(() => {
    setSelectedFolderId(null);
  }, [selectedProjectId]);

  // Reset project and folder when destination type changes
  useEffect(() => {
    setSelectedProjectId(null);
    setSelectedFolderId(null);
  }, [destinationType]);

  // Queries
  const clients = useQuery(api.clients.list, {}) || [];
  const projects = useQuery(
    api.projects.getByClient,
    selectedClientId ? { clientId: selectedClientId } : 'skip'
  ) || [];
  const clientFolders = useQuery(
    api.clients.getClientFolders,
    destinationType === 'client' && selectedClientId
      ? { clientId: selectedClientId }
      : 'skip'
  ) || [];
  const projectFolders = useQuery(
    api.projects.getProjectFolders,
    destinationType === 'project' && selectedProjectId
      ? { projectId: selectedProjectId }
      : 'skip'
  ) || [];

  const bulkMove = useMutation(api.documents.bulkMove);

  const activeFolders = destinationType === 'client' ? clientFolders : projectFolders;
  const [expandedMoveTargets, setExpandedMoveTargets] = useState<Set<string>>(new Set());

  // Build tree structure for folder selector
  const { rootFolders: moveRootFolders, childFolderMap: moveChildMap } = (() => {
    const root: typeof activeFolders = [];
    const children: Record<string, typeof activeFolders> = {};
    for (const folder of activeFolders as any[]) {
      if (folder.parentFolderId) {
        const parentId = folder.parentFolderId.toString();
        if (!children[parentId]) children[parentId] = [];
        children[parentId].push(folder);
      } else {
        root.push(folder);
      }
    }
    return { rootFolders: root, childFolderMap: children };
  })();

  const canMove =
    !!selectedClientId &&
    !!selectedFolderId &&
    (destinationType === 'client' || !!selectedProjectId);

  const handleMove = async () => {
    if (!canMove || !selectedClientId || !selectedFolderId) return;

    setIsMoving(true);
    try {
      const result = await bulkMove({
        documentIds: documentIds as Id<'documents'>[],
        targetScope: 'client',
        targetClientId: selectedClientId,
        targetProjectId:
          destinationType === 'project' && selectedProjectId ? selectedProjectId : undefined,
        targetFolderId: selectedFolderId,
        targetFolderType: destinationType,
      });

      toast.success(
        `Successfully moved ${(result as any)?.movedCount ?? documentIds.length} document${documentIds.length !== 1 ? 's' : ''}`
      );
      onMoveComplete?.();
      onClose();
    } catch (error) {
      console.error('Failed to bulk move documents:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to move documents');
    } finally {
      setIsMoving(false);
    }
  };

  const selectedClient = clients.find((c) => c._id === selectedClientId);
  const selectedProject = projects.find((p) => p._id === selectedProjectId);
  const selectedFolder = activeFolders.find((f: any) => f.folderType === selectedFolderId);

  const destToggleStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    background: active ? `${colors.accent.blue}15` : 'transparent',
    color: active ? colors.accent.blue : colors.text.secondary,
    border: `1px solid ${active ? `${colors.accent.blue}40` : colors.border.default}`,
    transition: 'background 100ms linear, border-color 100ms linear',
  });

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      width={448}
      title={`Move ${documentIds.length} Document${documentIds.length !== 1 ? 's' : ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isMoving}>
            Cancel
          </Button>
          <Button variant="primary" accent={colors.accent.blue} onClick={handleMove} disabled={!canMove || isMoving}>
            {isMoving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Moving...
              </>
            ) : (
              `Move ${documentIds.length} Document${documentIds.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-2" style={{ fontSize: 11, color: colors.text.muted, marginBottom: 14 }}>
        <FolderInput className="w-3.5 h-3.5" />
        Choose a destination to move the selected documents.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Client Selector */}
        <Field label="Client">
          <Select
            value={selectedClientId ?? ''}
            onChange={(e) => setSelectedClientId((e.target.value || null) as Id<'clients'>)}
          >
            <option value="">Select a client...</option>
            {clients.map((client) => (
              <option key={client._id} value={client._id}>
                {client.name}
              </option>
            ))}
          </Select>
        </Field>

        {/* Destination Type Toggle */}
        {selectedClientId && (
          <Field label="Destination Type">
            <div className="flex gap-2">
              <button type="button" onClick={() => setDestinationType('project')} style={destToggleStyle(destinationType === 'project')}>
                <FolderKanban className="w-4 h-4" />
                Project Folder
              </button>
              <button type="button" onClick={() => setDestinationType('client')} style={destToggleStyle(destinationType === 'client')}>
                <Building2 className="w-4 h-4" />
                Client Folder
              </button>
            </div>
          </Field>
        )}

        {/* Project Selector (only for project destination type) */}
        {selectedClientId && destinationType === 'project' && (
          <Field label="Project">
            <Select
              value={selectedProjectId ?? ''}
              onChange={(e) => setSelectedProjectId((e.target.value || null) as Id<'projects'>)}
            >
              <option value="">Select a project...</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {/* Folder Selector */}
        {selectedClientId &&
          (destinationType === 'client' || selectedProjectId) &&
          activeFolders.length > 0 && (
            <Field label="Folder">
              <div
                style={{
                  maxHeight: 176,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  borderRadius: 4,
                  border: `1px solid ${colors.border.default}`,
                  padding: 4,
                }}
              >
                {moveRootFolders.map((folder: any) => {
                  const renderMoveFolder = (f: any, depth: number = 0): React.ReactNode => {
                    const fId = f._id.toString();
                    const children = moveChildMap[fId] || [];
                    const hasChildren = children.length > 0;
                    const isExpanded = expandedMoveTargets.has(fId);
                    const isSelected = selectedFolderId === f.folderType;
                    return (
                      <div key={f._id}>
                        <button
                          type="button"
                          onClick={() => setSelectedFolderId(f.folderType)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 12px',
                            paddingLeft: 12 + depth * 16,
                            borderRadius: 4,
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            background: isSelected ? `${colors.accent.blue}15` : 'transparent',
                            color: isSelected ? colors.accent.blue : colors.text.primary,
                            border: `1px solid ${isSelected ? `${colors.accent.blue}40` : 'transparent'}`,
                            transition: 'background 100ms linear',
                          }}
                        >
                          {hasChildren && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = new Set(expandedMoveTargets);
                                if (next.has(fId)) next.delete(fId); else next.add(fId);
                                setExpandedMoveTargets(next);
                              }}
                              style={{ flexShrink: 0, cursor: 'pointer', color: colors.text.dim }}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </span>
                          )}
                          <Folder className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.accent.yellow }} />
                          <span className="truncate">{f.name}</span>
                        </button>
                        {hasChildren && isExpanded && (
                          <div>
                            {children.map((child: any) => renderMoveFolder(child, depth + 1))}
                          </div>
                        )}
                      </div>
                    );
                  };
                  return renderMoveFolder(folder);
                })}
              </div>
            </Field>
          )}

        {/* No folders available message */}
        {selectedClientId &&
          (destinationType === 'client' || selectedProjectId) &&
          activeFolders.length === 0 && (
            <p style={{ fontSize: 12, color: colors.text.muted, textAlign: 'center', padding: '8px 0' }}>
              No folders available for this destination.
            </p>
          )}

        {/* Summary */}
        {canMove && selectedClient && selectedFolder && (
          <div style={{ background: colors.bg.cardAlt, borderRadius: 4, padding: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 500, color: colors.text.secondary, marginBottom: 4 }}>Moving to:</div>
            <div style={{ color: colors.text.muted }}>
              {selectedClient.name}
              {destinationType === 'project' && selectedProject && (
                <> &rsaquo; {selectedProject.name}</>
              )}
              {' '}&rsaquo; {selectedFolder.name}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
