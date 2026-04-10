'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Folder, FolderOpen, Check, Loader2 } from 'lucide-react';
import type { UploadScope } from './ScopeToggle';

interface FolderSheetProps {
  scope: UploadScope;
  clientId?: string;
  projectId?: string;
  selectedFolderKey: string | null;
  onSelect: (folderKey: string | null, folderName: string | null, folderLevel: 'client' | 'project' | null) => void;
  onClose: () => void;
}

export default function FolderSheet({
  scope,
  clientId,
  projectId,
  selectedFolderKey,
  onSelect,
  onClose,
}: FolderSheetProps) {
  const clientFolders = useQuery(
    api.clients.getClientFolders,
    scope === 'client' && clientId ? { clientId: clientId as Id<'clients'> } : 'skip'
  );

  const projectFolders = useQuery(
    api.projects.getProjectFolders,
    scope === 'client' && projectId ? { projectId: projectId as Id<'projects'> } : 'skip'
  );

  const internalFolders = useQuery(
    api.internalFolders.list,
    scope === 'internal' ? {} : 'skip'
  );

  const personalFolders = useQuery(
    api.personalFolders.list,
    scope === 'personal' ? {} : 'skip'
  );

  const isLoading =
    (scope === 'client' && clientId && clientFolders === undefined) ||
    (scope === 'client' && projectId && projectFolders === undefined) ||
    (scope === 'internal' && internalFolders === undefined) ||
    (scope === 'personal' && personalFolders === undefined);

  function handleSelect(key: string | null, name: string | null, level: 'client' | 'project' | null) {
    onSelect(key, name, level);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-2xl max-h-[75vh] flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-[var(--m-page-px)] pt-1 pb-3 border-b border-[var(--m-border)] flex-shrink-0">
          <div className="text-[15px] font-semibold text-[var(--m-text-primary)]">Select Folder</div>
          <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5">
            Choose a destination folder for uploads
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-8 gap-2 text-[12px] text-[var(--m-text-tertiary)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading folders...
            </div>
          )}

          {/* No specific folder option */}
          <button
            onClick={() => handleSelect(null, null, null)}
            className={`flex items-center gap-2.5 w-full py-3 px-[var(--m-page-px)] border-b border-[var(--m-border-subtle)] text-left active:bg-[var(--m-bg-subtle)] ${
              selectedFolderKey === null ? 'bg-[var(--m-bg-subtle)]' : ''
            }`}
          >
            <Folder className="w-[18px] h-[18px] text-[var(--m-text-tertiary)] flex-shrink-0" />
            <span className="flex-1 text-[13px] text-[var(--m-text-secondary)] italic">No specific folder</span>
            {selectedFolderKey === null && <Check className="w-4 h-4 text-[var(--m-accent-indicator)] flex-shrink-0" />}
          </button>

          {/* Client-scope folders */}
          {scope === 'client' && clientFolders && clientFolders.length > 0 && (
            <div>
              <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)]">
                  Client Level
                </span>
              </div>
              {clientFolders.map((f: any) => {
                const isSelected = selectedFolderKey === f.folderType;
                return (
                  <button
                    key={f._id}
                    onClick={() => handleSelect(f.folderType, f.name, 'client')}
                    className={`flex items-center gap-2.5 w-full py-3 px-[var(--m-page-px)] border-b border-[var(--m-border-subtle)] text-left active:bg-[var(--m-bg-subtle)] ${
                      isSelected ? 'bg-[var(--m-bg-subtle)]' : ''
                    }`}
                  >
                    {isSelected ? (
                      <FolderOpen className="w-[18px] h-[18px] text-[var(--m-accent-indicator)] flex-shrink-0" />
                    ) : (
                      <Folder className="w-[18px] h-[18px] text-[var(--m-text-tertiary)] flex-shrink-0" />
                    )}
                    <span className="flex-1 text-[13px] text-[var(--m-text-primary)] truncate">{f.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-[var(--m-accent-indicator)] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Project-scope folders */}
          {scope === 'client' && projectFolders && projectFolders.length > 0 && (
            <div>
              <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)]">
                  Project Level
                </span>
              </div>
              {projectFolders.map((f: any) => {
                const isSelected = selectedFolderKey === f.folderType;
                return (
                  <button
                    key={f._id}
                    onClick={() => handleSelect(f.folderType, f.name, 'project')}
                    className={`flex items-center gap-2.5 w-full py-3 px-[var(--m-page-px)] border-b border-[var(--m-border-subtle)] text-left active:bg-[var(--m-bg-subtle)] ${
                      isSelected ? 'bg-[var(--m-bg-subtle)]' : ''
                    }`}
                  >
                    {isSelected ? (
                      <FolderOpen className="w-[18px] h-[18px] text-[var(--m-accent-indicator)] flex-shrink-0" />
                    ) : (
                      <Folder className="w-[18px] h-[18px] text-[var(--m-text-tertiary)] flex-shrink-0" />
                    )}
                    <span className="flex-1 text-[13px] text-[var(--m-text-primary)] truncate">{f.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-[var(--m-accent-indicator)] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Internal folders */}
          {scope === 'internal' && internalFolders && internalFolders.length > 0 && (
            <div>
              <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)]">
                  Internal Folders
                </span>
              </div>
              {internalFolders.map((f: any) => {
                const isSelected = selectedFolderKey === f.folderType;
                return (
                  <button
                    key={f._id}
                    onClick={() => handleSelect(f.folderType, f.name, null)}
                    className={`flex items-center gap-2.5 w-full py-3 px-[var(--m-page-px)] border-b border-[var(--m-border-subtle)] text-left active:bg-[var(--m-bg-subtle)] ${
                      isSelected ? 'bg-[var(--m-bg-subtle)]' : ''
                    }`}
                  >
                    {isSelected ? (
                      <FolderOpen className="w-[18px] h-[18px] text-[var(--m-accent-indicator)] flex-shrink-0" />
                    ) : (
                      <Folder className="w-[18px] h-[18px] text-[var(--m-text-tertiary)] flex-shrink-0" />
                    )}
                    <span className="flex-1 text-[13px] text-[var(--m-text-primary)] truncate">{f.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-[var(--m-accent-indicator)] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Personal folders */}
          {scope === 'personal' && personalFolders && personalFolders.length > 0 && (
            <div>
              <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)]">
                  Personal Folders
                </span>
              </div>
              {personalFolders.map((f: any) => {
                const isSelected = selectedFolderKey === f.folderType;
                return (
                  <button
                    key={f._id}
                    onClick={() => handleSelect(f.folderType, f.name, null)}
                    className={`flex items-center gap-2.5 w-full py-3 px-[var(--m-page-px)] border-b border-[var(--m-border-subtle)] text-left active:bg-[var(--m-bg-subtle)] ${
                      isSelected ? 'bg-[var(--m-bg-subtle)]' : ''
                    }`}
                  >
                    {isSelected ? (
                      <FolderOpen className="w-[18px] h-[18px] text-[var(--m-accent-indicator)] flex-shrink-0" />
                    ) : (
                      <Folder className="w-[18px] h-[18px] text-[var(--m-text-tertiary)] flex-shrink-0" />
                    )}
                    <span className="flex-1 text-[13px] text-[var(--m-text-primary)] truncate">{f.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-[var(--m-accent-indicator)] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cancel button */}
        <div className="flex-shrink-0 border-t border-[var(--m-border)] px-[var(--m-page-px)] pt-2.5 pb-1">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-center text-[14px] font-medium text-[var(--m-text-secondary)] bg-[var(--m-bg-inset)] rounded-lg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
