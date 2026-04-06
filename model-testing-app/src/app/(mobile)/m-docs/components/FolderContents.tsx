'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { ChevronLeft } from 'lucide-react';
import FolderRow from './shared/FolderRow';
import FileRow from './shared/FileRow';

type SortMode = 'newest' | 'oldest' | 'az' | 'za' | 'largest';

const SORT_LABELS: Record<SortMode, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  az: 'A–Z',
  za: 'Z–A',
  largest: 'Largest',
};

const SORT_CYCLE: SortMode[] = ['newest', 'oldest', 'az', 'za', 'largest'];

interface FolderContentsProps {
  clientId: string;
  clientName: string;
  projectId?: string;
  projectName?: string;
  folderRecordId: string;
  folderTypeKey: string;
  folderName: string;
  folderLevel: 'client' | 'project';
  onBack: () => void;
  onOpenSubfolder: (folderRecordId: string, folderTypeKey: string, folderName: string) => void;
  onOpenViewer: (documentId: string) => void;
}

export default function FolderContents({
  clientId,
  clientName,
  projectId,
  projectName,
  folderRecordId,
  folderTypeKey,
  folderName,
  folderLevel,
  onBack,
  onOpenSubfolder,
  onOpenViewer,
}: FolderContentsProps) {
  const [sort, setSort] = useState<SortMode>('newest');

  const foldersData = useQuery(api.folderStructure.getAllFoldersForClient, {
    clientId: clientId as Id<'clients'>,
  });

  const docs = useQuery(api.documents.getByFolder, {
    clientId: clientId as Id<'clients'>,
    folderType: folderTypeKey,
    level: folderLevel,
    ...(projectId ? { projectId: projectId as Id<'projects'> } : {}),
  });

  // Find child subfolders — folders whose parentFolderId matches our folderRecordId
  const subfolders = useMemo(() => {
    if (!foldersData) return [];
    if (folderLevel === 'project' && projectId) {
      const projectGroup = foldersData.projectFolders?.find(g => g.project._id === projectId);
      return (projectGroup?.folders ?? []).filter(f => f.parentFolderId === folderRecordId);
    } else {
      return (foldersData.clientFolders ?? []).filter(f => f.parentFolderId === folderRecordId);
    }
  }, [foldersData, folderLevel, projectId, folderRecordId]);

  // Sort docs client-side
  const sortedDocs = useMemo(() => {
    if (!docs) return null;
    return [...docs].sort((a, b) => {
      switch (sort) {
        case 'newest':
          return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        case 'oldest':
          return new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
        case 'az': {
          const nameA = (a.displayName || a.fileName).toLowerCase();
          const nameB = (b.displayName || b.fileName).toLowerCase();
          return nameA.localeCompare(nameB);
        }
        case 'za': {
          const nameA = (a.displayName || a.fileName).toLowerCase();
          const nameB = (b.displayName || b.fileName).toLowerCase();
          return nameB.localeCompare(nameA);
        }
        case 'largest':
          return (b.fileSize ?? 0) - (a.fileSize ?? 0);
        default:
          return 0;
      }
    });
  }, [docs, sort]);

  function cycleSort() {
    const idx = SORT_CYCLE.indexOf(sort);
    setSort(SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]);
  }

  const isLoading = docs === undefined;
  const docCount = sortedDocs?.length ?? 0;
  const isEmpty = !isLoading && subfolders.length === 0 && docCount === 0;
  const backLabel = projectName || clientName;
  const contextLine = [projectName, `${docCount} document${docCount !== 1 ? 's' : ''}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      {/* Header */}
      <div className="px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)]">
        <button onClick={onBack} className="flex items-center gap-1 mb-1">
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
          <span className="text-[12px] text-[var(--m-accent-indicator)]">{backLabel}</span>
        </button>
        <div className="text-[16px] font-semibold text-[var(--m-text-primary)]">{folderName}</div>
        <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5">{contextLine}</div>
      </div>

      {/* Sort bar */}
      <div className="flex items-center justify-between px-[var(--m-page-px)] py-2 border-b border-[var(--m-border-subtle)]">
        <span className="text-[11px] text-[var(--m-text-tertiary)]">
          {isLoading ? '' : `${docCount} document${docCount !== 1 ? 's' : ''}`}
        </span>
        <button
          onClick={cycleSort}
          className="text-[11px] text-[var(--m-accent-indicator)] font-medium"
        >
          Sort: {SORT_LABELS[sort]}
        </button>
      </div>

      {/* Subfolders */}
      {subfolders.length > 0 && (
        <div>
          <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
            <span className="text-[12px] font-semibold text-[var(--m-text-secondary)]">Subfolders</span>
          </div>
          {subfolders.map(folder => (
            <FolderRow
              key={folder._id}
              name={folder.name}
              docCount={0}
              variant={folderLevel === 'project' ? 'project' : 'client'}
              onTap={() => onOpenSubfolder(folder._id, folder.folderType, folder.name)}
            />
          ))}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
          Loading...
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
          No documents in this folder
        </div>
      )}

      {/* File list */}
      {sortedDocs && sortedDocs.length > 0 && (
        <div>
          {subfolders.length > 0 && (
            <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
              <span className="text-[12px] font-semibold text-[var(--m-text-secondary)]">Documents</span>
            </div>
          )}
          {sortedDocs.map(doc => (
            <FileRow
              key={doc._id}
              fileName={doc.fileName}
              displayName={doc.displayName}
              documentCode={doc.documentCode}
              fileType={doc.fileType ?? ''}
              category={doc.category}
              fileSize={doc.fileSize ?? 0}
              uploadedAt={doc.uploadedAt}
              onTap={() => onOpenViewer(doc._id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
