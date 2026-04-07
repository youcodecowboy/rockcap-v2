'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Check, Folder, FolderOpen, Loader2 } from 'lucide-react';

interface MoveFileSheetProps {
  documentId: string;
  documentName: string;
  clientId: string;
  clientName: string;
  currentFolderTypeKey: string;
  currentFolderLevel: 'client' | 'project';
  currentProjectId?: string;
  onClose: () => void;
  onMoved?: () => void;
}

type Destination =
  | { kind: 'client'; folderRecordId: string; folderTypeKey: string; name: string; parentFolderId?: string }
  | { kind: 'project'; projectId: string; projectName: string; folderRecordId: string; folderTypeKey: string; name: string; parentFolderId?: string };

export default function MoveFileSheet({
  documentId,
  documentName,
  clientId,
  clientName,
  currentFolderTypeKey,
  currentFolderLevel,
  currentProjectId,
  onClose,
  onMoved,
}: MoveFileSheetProps) {
  const [selected, setSelected] = useState<Destination | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const foldersData = useQuery(api.folderStructure.getAllFoldersForClient, {
    clientId: clientId as Id<'clients'>,
  });

  const bulkMove = useMutation(api.documents.bulkMove);

  // Flatten client folders (only top-level for clarity, children shown indented if present)
  const clientFolders = useMemo(() => {
    if (!foldersData) return [];
    return (foldersData.clientFolders ?? []).filter(f =>
      !(currentFolderLevel === 'client' && f.folderType === currentFolderTypeKey)
    );
  }, [foldersData, currentFolderLevel, currentFolderTypeKey]);

  const projectGroups = useMemo(() => {
    if (!foldersData) return [];
    return (foldersData.projectFolders ?? []).map(group => ({
      ...group,
      folders: group.folders.filter(f =>
        !(currentFolderLevel === 'project' && group.project._id === currentProjectId && f.folderType === currentFolderTypeKey)
      ),
    })).filter(g => g.folders.length > 0);
  }, [foldersData, currentFolderLevel, currentFolderTypeKey, currentProjectId]);

  const isLoading = foldersData === undefined;

  async function handleConfirm() {
    if (!selected || isMoving) return;
    setIsMoving(true);
    setError(null);
    try {
      await bulkMove({
        documentIds: [documentId as Id<'documents'>],
        targetScope: 'client',
        targetClientId: clientId as Id<'clients'>,
        targetProjectId: selected.kind === 'project' ? (selected.projectId as Id<'projects'>) : undefined,
        targetFolderId: selected.folderTypeKey,
        targetFolderType: selected.kind === 'client' ? 'client' : 'project',
      });
      onMoved?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to move document';
      setError(msg);
      setIsMoving(false);
    }
  }

  function isSelected(d: Destination) {
    if (!selected) return false;
    if (selected.kind !== d.kind) return false;
    if (selected.kind === 'client' && d.kind === 'client') {
      return selected.folderRecordId === d.folderRecordId;
    }
    if (selected.kind === 'project' && d.kind === 'project') {
      return selected.projectId === d.projectId && selected.folderRecordId === d.folderRecordId;
    }
    return false;
  }

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-xl max-h-[85vh] flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-[var(--m-page-px)] pt-1 pb-3 border-b border-[var(--m-border)] flex-shrink-0">
          <div className="text-[15px] font-semibold text-[var(--m-text-primary)]">Move Document</div>
          <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5 truncate">
            {documentName} · {clientName}
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
              Loading folders...
            </div>
          )}

          {!isLoading && clientFolders.length === 0 && projectGroups.length === 0 && (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
              No other folders available
            </div>
          )}

          {/* Client-level folders */}
          {clientFolders.length > 0 && (
            <div>
              <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)]">
                  Client Level
                </span>
              </div>
              {clientFolders.map(f => {
                const dest: Destination = {
                  kind: 'client',
                  folderRecordId: f._id,
                  folderTypeKey: f.folderType,
                  name: f.name,
                  parentFolderId: f.parentFolderId,
                };
                const selectedRow = isSelected(dest);
                const indented = !!f.parentFolderId;
                return (
                  <button
                    key={f._id}
                    onClick={() => setSelected(dest)}
                    className={`flex items-center gap-2.5 w-full py-3 border-b border-[var(--m-border-subtle)] text-left active:bg-[var(--m-bg-subtle)] ${
                      selectedRow ? 'bg-[var(--m-bg-subtle)]' : ''
                    }`}
                    style={{ paddingLeft: indented ? 'calc(var(--m-page-px) + 1.25rem)' : 'var(--m-page-px)', paddingRight: 'var(--m-page-px)' }}
                  >
                    {selectedRow ? (
                      <FolderOpen className="w-[18px] h-[18px] text-[var(--m-accent-indicator)] flex-shrink-0" />
                    ) : (
                      <Folder className="w-[18px] h-[18px] text-[var(--m-text-tertiary)] flex-shrink-0" />
                    )}
                    <span className="flex-1 text-[13px] text-[var(--m-text-primary)] truncate">{f.name}</span>
                    {selectedRow && <Check className="w-[16px] h-[16px] text-[var(--m-accent-indicator)] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Project folders, grouped by project */}
          {projectGroups.map(group => (
            <div key={group.project._id}>
              <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)]">
                  {group.project.name}
                </span>
              </div>
              {group.folders.map(f => {
                const dest: Destination = {
                  kind: 'project',
                  projectId: group.project._id,
                  projectName: group.project.name,
                  folderRecordId: f._id,
                  folderTypeKey: f.folderType,
                  name: f.name,
                  parentFolderId: f.parentFolderId,
                };
                const selectedRow = isSelected(dest);
                const indented = !!f.parentFolderId;
                return (
                  <button
                    key={f._id}
                    onClick={() => setSelected(dest)}
                    className={`flex items-center gap-2.5 w-full py-3 border-b border-[var(--m-border-subtle)] text-left active:bg-[var(--m-bg-subtle)] ${
                      selectedRow ? 'bg-[var(--m-bg-subtle)]' : ''
                    }`}
                    style={{ paddingLeft: indented ? 'calc(var(--m-page-px) + 1.25rem)' : 'var(--m-page-px)', paddingRight: 'var(--m-page-px)' }}
                  >
                    {selectedRow ? (
                      <FolderOpen className="w-[18px] h-[18px] text-[var(--m-accent-indicator)] flex-shrink-0" />
                    ) : (
                      <Folder className="w-[18px] h-[18px] text-[var(--m-text-tertiary)] flex-shrink-0" />
                    )}
                    <span className="flex-1 text-[13px] text-[var(--m-text-primary)] truncate">{f.name}</span>
                    {selectedRow && <Check className="w-[16px] h-[16px] text-[var(--m-accent-indicator)] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex-shrink-0 border-t border-[var(--m-border)] px-[var(--m-page-px)] pt-2.5 pb-1">
          {error && (
            <div className="text-[11px] text-[var(--m-error)] pb-2">{error}</div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isMoving}
              className="flex-1 py-2.5 text-center text-[14px] font-medium text-[var(--m-text-secondary)] bg-[var(--m-bg-inset)] rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected || isMoving}
              className="flex-1 py-2.5 text-center text-[14px] font-medium text-white bg-black rounded-lg disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {isMoving && <Loader2 className="w-[14px] h-[14px] animate-spin" />}
              {isMoving ? 'Moving...' : 'Move Here'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
