'use client';

import { useState } from 'react';
import { MoreVertical, Eye, Pencil, Download, Copy, Flag, Trash2 } from 'lucide-react';
import FileTypeBadge from './FileTypeBadge';

interface FileRowProps {
  fileName: string;
  displayName?: string;
  documentCode?: string;
  fileType: string;
  category?: string;
  fileSize: number;
  uploadedAt: string;
  fileUrl?: string | null;
  onTap: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onFlag?: () => void;
  onDelete?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface ActionSheetProps {
  onClose: () => void;
  onViewDetails: () => void;
  onRename?: () => void;
  onDownload?: () => void;
  onDuplicate?: () => void;
  onFlag?: () => void;
  onDelete?: () => void;
}

function ActionSheet({ onClose, onViewDetails, onRename, onDownload, onDuplicate, onFlag, onDelete }: ActionSheetProps) {
  const actions = [
    { label: 'View Details', icon: Eye, action: onViewDetails },
    onRename ? { label: 'Rename', icon: Pencil, action: onRename } : null,
    onDownload ? { label: 'Download', icon: Download, action: onDownload } : null,
    onDuplicate ? { label: 'Duplicate', icon: Copy, action: onDuplicate } : null,
    onFlag ? { label: 'Flag for Review', icon: Flag, action: onFlag } : null,
    onDelete ? { label: 'Delete', icon: Trash2, action: onDelete, destructive: true } : null,
  ].filter(Boolean) as { label: string; icon: typeof Eye; action: () => void; destructive?: boolean }[];

  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-xl pb-[max(0.5rem,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
        </div>
        <div className="py-1">
          {actions.map(({ label, icon: Icon, action, destructive }) => (
            <button
              key={label}
              onClick={() => { action(); onClose(); }}
              className={`flex items-center gap-3 w-full px-5 py-3 text-left active:bg-[var(--m-bg-subtle)] ${
                destructive ? 'text-[var(--m-error)]' : 'text-[var(--m-text-primary)]'
              }`}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              <span className="text-[14px]">{label}</span>
            </button>
          ))}
        </div>
        <div className="px-4 pt-1 pb-1">
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

export default function FileRow({ fileName, displayName, documentCode, fileType, category, fileSize, uploadedAt, fileUrl, onTap, onRename, onDuplicate, onFlag, onDelete }: FileRowProps) {
  const [showActions, setShowActions] = useState(false);
  const name = documentCode || displayName || fileName;
  const parts = [category, formatFileSize(fileSize), formatDate(uploadedAt)].filter(Boolean);

  return (
    <>
      <div className="flex items-center border-b border-[var(--m-border-subtle)]">
        <button
          onClick={onTap}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left px-[var(--m-page-px)] py-2.5 active:bg-[var(--m-bg-subtle)]"
        >
          <FileTypeBadge fileType={fileType} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">{name}</div>
            <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5 truncate">{parts.join(' · ')}</div>
          </div>
        </button>
        <button
          onClick={() => setShowActions(true)}
          className="px-3 py-2.5 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)] flex-shrink-0"
          aria-label="More actions"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {showActions && (
        <ActionSheet
          onClose={() => setShowActions(false)}
          onViewDetails={onTap}
          onRename={onRename}
          onDownload={fileUrl ? () => {
            const a = document.createElement('a');
            a.href = fileUrl;
            a.download = fileName;
            a.click();
          } : undefined}
          onDuplicate={onDuplicate}
          onFlag={onFlag}
          onDelete={onDelete}
        />
      )}
    </>
  );
}
