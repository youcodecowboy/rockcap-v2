'use client';

import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button, Modal } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Building2, Building, User, FolderKanban, FileText, ChevronRight, ChevronDown, Folder, Loader2 } from 'lucide-react';

type DocumentScope = 'client' | 'internal' | 'personal';

interface MoveDocumentCrossScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: Id<"documents">;
  currentScope: DocumentScope;
  currentClientId?: Id<"clients">;
  currentProjectId?: Id<"projects">;
  currentFolderId?: string;
  onMoveComplete?: () => void;
}

export default function MoveDocumentCrossScopeModal({
  isOpen,
  onClose,
  documentId,
  currentScope,
  currentClientId,
  currentProjectId,
  currentFolderId,
  onMoveComplete,
}: MoveDocumentCrossScopeModalProps) {
  const colors = useColors();
  const [selectedScope, setSelectedScope] = useState<DocumentScope>(currentScope);
  const [selectedClientId, setSelectedClientId] = useState<Id<"clients"> | null>(currentClientId || null);
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | 'base-documents' | null>(
    currentProjectId || (currentScope === 'client' && !currentProjectId ? 'base-documents' : null)
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId || null);
  const [isMoving, setIsMoving] = useState(false);
  const [expandedMoveTargets, setExpandedMoveTargets] = useState<Set<string>>(new Set());

  // Reset selections when scope changes
  useEffect(() => {
    if (selectedScope !== currentScope) {
      setSelectedClientId(null);
      setSelectedProjectId(null);
      setSelectedFolderId(null);
    }
  }, [selectedScope, currentScope]);

  // Queries
  const clients = useQuery(api.clients.list, {}) || [];
  const projects = useQuery(
    api.projects.getByClient,
    selectedScope === 'client' && selectedClientId ? { clientId: selectedClientId } : 'skip'
  ) || [];
  const internalFolders = useQuery(
    api.internalFolders.list,
    selectedScope === 'internal' ? {} : 'skip'
  ) || [];
  const personalFolders = useQuery(
    api.personalFolders.list,
    selectedScope === 'personal' ? {} : 'skip'
  ) || [];
  const clientFolders = useQuery(
    api.clients.getClientFolders,
    selectedScope === 'client' && selectedClientId && selectedProjectId === 'base-documents'
      ? { clientId: selectedClientId }
      : 'skip'
  ) || [];
  const projectFolders = useQuery(
    api.projects.getProjectFolders,
    selectedScope === 'client' && selectedProjectId && selectedProjectId !== 'base-documents'
      ? { projectId: selectedProjectId as Id<"projects"> }
      : 'skip'
  ) || [];

  const moveDocument = useMutation(api.documents.moveDocumentCrossScope);

  // Check if current location matches selection
  const isCurrentLocation = () => {
    if (selectedScope !== currentScope) return false;
    if (selectedScope === 'client') {
      return selectedClientId === currentClientId &&
        ((selectedProjectId === 'base-documents' && !currentProjectId) ||
         (selectedProjectId === currentProjectId));
    }
    return selectedFolderId === currentFolderId;
  };

  // Can we move?
  const canMove = () => {
    if (isCurrentLocation()) return false;
    if (selectedScope === 'client') {
      return !!selectedClientId && !!selectedProjectId;
    }
    return !!selectedFolderId;
  };

  const handleMove = async () => {
    if (!canMove()) return;

    setIsMoving(true);
    try {
      const isBaseDocument = selectedProjectId === 'base-documents';
      const projectId = isBaseDocument ? undefined : (selectedProjectId as Id<"projects">);

      // Determine folder and folder type for client scope
      const targetFolderId = selectedFolderId || undefined;
      const targetFolderType: 'client' | 'project' | undefined =
        (selectedScope === 'client' && selectedFolderId)
          ? (isBaseDocument ? 'client' : 'project')
          : undefined;

      await moveDocument({
        documentId,
        targetScope: selectedScope,
        targetClientId: selectedScope === 'client' ? selectedClientId! : undefined,
        targetProjectId: projectId,
        targetIsBaseDocument: selectedScope === 'client' ? isBaseDocument : undefined,
        targetFolderId,
        targetFolderType,
      });

      onMoveComplete?.();
      onClose();
    } catch (error) {
      console.error('Failed to move document:', error);
      alert(error instanceof Error ? error.message : 'Failed to move document');
    } finally {
      setIsMoving(false);
    }
  };

  const scopeTabs = [
    { id: 'client' as const, label: 'Client Documents', icon: Building2 },
    { id: 'internal' as const, label: 'RockCap Internal', icon: Building },
    { id: 'personal' as const, label: 'Personal', icon: User },
  ];

  const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  const fieldLabel: React.CSSProperties = {
    display: 'block',
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: colors.text.muted,
    fontWeight: 500,
    marginBottom: 8,
  };

  const listItemStyle = (selected: boolean): React.CSSProperties => ({
    width: '100%',
    textAlign: 'left',
    padding: 8,
    borderRadius: 4,
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: selected ? `${colors.accent.blue}15` : 'transparent',
    color: selected ? colors.accent.blue : colors.text.secondary,
    border: `1px solid ${selected ? `${colors.accent.blue}40` : 'transparent'}`,
    cursor: 'pointer',
    transition: 'background 100ms linear',
  });

  const cardItemStyle = (accent: string, selected: boolean, dimmed: boolean): React.CSSProperties => ({
    width: '100%',
    textAlign: 'left',
    padding: 12,
    borderRadius: 4,
    border: `1px solid ${selected ? accent : colors.border.default}`,
    background: selected ? `${accent}15` : colors.bg.card,
    opacity: dimmed ? 0.5 : 1,
    cursor: 'pointer',
    transition: 'border-color 100ms linear, background 100ms linear',
  });

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Move Document"
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isMoving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleMove} disabled={!canMove() || isMoving}>
            {isMoving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Moving...
              </>
            ) : (
              'Move Document'
            )}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 12 }}>
        Choose where to move this document. You can move between clients, internal, or personal spaces.
      </p>

      {/* Scope Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border.default}` }}>
        {scopeTabs.map((tab) => {
          const Icon = tab.icon;
          const active = selectedScope === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedScope(tab.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 0',
                fontSize: 12,
                fontWeight: 500,
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? colors.accent.blue : 'transparent'}`,
                color: active ? colors.accent.blue : colors.text.muted,
                cursor: 'pointer',
                transition: 'color 100ms linear, border-color 100ms linear',
              }}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Destination Selection */}
      <div style={{ padding: '16px 0', maxHeight: 320, overflowY: 'auto' }}>
        {selectedScope === 'client' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Client Selection */}
            <div>
              <label style={fieldLabel}>Select Client</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                {clients.map((client) => (
                  <button
                    key={client._id}
                    onClick={() => {
                      setSelectedClientId(client._id);
                      setSelectedProjectId(null);
                      setSelectedFolderId(null);
                    }}
                    style={listItemStyle(selectedClientId === client._id)}
                  >
                    {client.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Project Selection */}
            {selectedClientId && (
              <div>
                <label style={fieldLabel}>Select Destination</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                  <button
                    onClick={() => {
                      setSelectedProjectId('base-documents');
                      setSelectedFolderId(null);
                    }}
                    style={listItemStyle(selectedProjectId === 'base-documents')}
                  >
                    <FileText size={16} />
                    Base Documents
                  </button>
                  {projects.map((project) => (
                    <button
                      key={project._id}
                      onClick={() => {
                        setSelectedProjectId(project._id);
                        setSelectedFolderId(null);
                      }}
                      style={listItemStyle(selectedProjectId === project._id)}
                    >
                      <FolderKanban size={16} />
                      {project.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Folder Selection (optional) */}
            {selectedProjectId && (
              <div>
                <label style={fieldLabel}>Select Folder (optional)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 128, overflowY: 'auto' }}>
                  <button
                    onClick={() => setSelectedFolderId(null)}
                    style={{
                      ...listItemStyle(false),
                      background: selectedFolderId === null ? colors.bg.cardAlt : 'transparent',
                      color: colors.text.secondary,
                    }}
                  >
                    No specific folder
                  </button>
                  {(() => {
                    const folders = selectedProjectId === 'base-documents' ? clientFolders : projectFolders;
                    // Build tree: split into root and children by parentFolderId
                    const root: any[] = [];
                    const children: Record<string, any[]> = {};
                    for (const f of folders as any[]) {
                      if (f.parentFolderId) {
                        const parentId = f.parentFolderId.toString();
                        if (!children[parentId]) children[parentId] = [];
                        children[parentId].push(f);
                      } else {
                        root.push(f);
                      }
                    }
                    const renderFolder = (f: any, depth: number = 0): React.ReactNode => {
                      const fId = f._id.toString();
                      const childList = children[fId] || [];
                      const hasChildren = childList.length > 0;
                      const isExpanded = expandedMoveTargets.has(fId);
                      return (
                        <div key={f._id}>
                          <button
                            onClick={() => setSelectedFolderId(f.folderType)}
                            style={{ ...listItemStyle(selectedFolderId === f.folderType), paddingLeft: 16 + depth * 16 }}
                          >
                            {hasChildren && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = new Set(expandedMoveTargets);
                                  if (next.has(fId)) next.delete(fId); else next.add(fId);
                                  setExpandedMoveTargets(next);
                                }}
                                style={{ flexShrink: 0, cursor: 'pointer', display: 'inline-flex' }}
                              >
                                {isExpanded ? (
                                  <ChevronDown size={14} style={{ color: colors.text.dim }} />
                                ) : (
                                  <ChevronRight size={14} style={{ color: colors.text.dim }} />
                                )}
                              </span>
                            )}
                            <Folder size={14} style={{ color: colors.accent.yellow, flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          </button>
                          {hasChildren && isExpanded && (
                            <div>
                              {childList.map((child: any) => renderFolder(child, depth + 1))}
                            </div>
                          )}
                        </div>
                      );
                    };
                    return root.map((f) => renderFolder(f));
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedScope === 'internal' && (
          <div>
            <label style={fieldLabel}>Select Internal Folder</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {internalFolders.map((folder: any) => {
                const selected = selectedFolderId === folder.folderType;
                const dimmed = currentScope === 'internal' && currentFolderId === folder.folderType && !selected;
                return (
                  <button
                    key={folder._id}
                    onClick={() => setSelectedFolderId(folder.folderType)}
                    style={cardItemStyle(colors.accent.blue, selected, dimmed)}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{folder.name}</div>
                    {folder.description && (
                      <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>{folder.description}</div>
                    )}
                    {currentScope === 'internal' && currentFolderId === folder.folderType && (
                      <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>Current location</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {selectedScope === 'personal' && (
          <div>
            <label style={fieldLabel}>Select Personal Folder</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {personalFolders.map((folder: any) => {
                const selected = selectedFolderId === folder.folderType;
                const dimmed = currentScope === 'personal' && currentFolderId === folder.folderType && !selected;
                return (
                  <button
                    key={folder._id}
                    onClick={() => setSelectedFolderId(folder.folderType)}
                    style={cardItemStyle(colors.accent.purple, selected, dimmed)}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{folder.name}</div>
                    {folder.description && (
                      <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>{folder.description}</div>
                    )}
                    {currentScope === 'personal' && currentFolderId === folder.folderType && (
                      <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>Current location</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      {canMove() && (
        <div style={{ background: colors.bg.light, borderRadius: 4, padding: 12, fontSize: 12, border: `1px solid ${colors.border.default}` }}>
          <div style={{ fontWeight: 500, color: colors.text.secondary, marginBottom: 4 }}>Moving to:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: colors.text.muted }}>
            {selectedScope === 'client' && (
              <>
                <span>{clients.find(c => c._id === selectedClientId)?.name}</span>
                <ChevronRight size={16} />
                <span>
                  {selectedProjectId === 'base-documents'
                    ? 'Base Documents'
                    : projects.find(p => p._id === selectedProjectId)?.name}
                </span>
                {selectedFolderId && (
                  <>
                    <ChevronRight size={16} />
                    <span>
                      {(selectedProjectId === 'base-documents' ? clientFolders : projectFolders)
                        .find((f: any) => f.folderType === selectedFolderId)?.name}
                    </span>
                  </>
                )}
              </>
            )}
            {selectedScope === 'internal' && (
              <>
                <Building size={16} />
                <span>RockCap Internal</span>
                <ChevronRight size={16} />
                <span>{internalFolders.find((f: any) => f.folderType === selectedFolderId)?.name}</span>
              </>
            )}
            {selectedScope === 'personal' && (
              <>
                <User size={16} />
                <span>Personal</span>
                <ChevronRight size={16} />
                <span>{personalFolders.find((f: any) => f.folderType === selectedFolderId)?.name}</span>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
