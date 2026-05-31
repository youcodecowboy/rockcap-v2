'use client';

import { Id } from '../../../../../convex/_generated/dataModel';
import { IconButton, Panel, StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  MoreVertical,
  Eye,
  Download,
  FolderInput,
  Trash2,
  BookOpen,
  Layers,
  Unlink,
  Copy,
  ChevronDown,
  ChevronRight,
  MessageSquareText,
  Flag,
  Pencil,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import DocumentNotesIndicator from '@/components/DocumentNotesIndicator';
import FlagCreationModal from '@/components/FlagCreationModal';
import { FlagIndicator } from '@/components/FlagIndicator';

export interface Document {
  _id: Id<"documents">;
  fileName: string;
  documentCode?: string;
  summary: string;
  category: string;
  fileTypeDetected?: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  clientName?: string;
  projectName?: string;
  displayName?: string;
  customFieldValues?: Record<string, string>;
  hasNotes?: boolean;
  noteCount?: number;
  version?: string;
  previousVersionId?: string;
  versionNote?: string;
}

interface FileCardProps {
  document: Document;
  viewMode: 'grid' | 'list';
  isSelected?: boolean;
  onSelectionChange?: (selected: boolean) => void;
  onClick: () => void;
  onView: () => void;
  onDownload: () => void;
  onMove?: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  isDragging?: boolean;
  onOpenReader?: () => void;
  onLinkAsVersion?: () => void;
  onUnlinkVersion?: () => void;
  // Version group props (passed by FileList for group heads)
  versionCount?: number;
  isVersionExpanded?: boolean;
  onToggleVersions?: () => void;
}

export default function FileCard({
  document,
  viewMode,
  isSelected,
  onSelectionChange,
  onClick,
  onView,
  onDownload,
  onMove,
  onRename,
  onDuplicate,
  onDelete,
  onDragStart,
  isDragging,
  onOpenReader,
  onLinkAsVersion,
  onUnlinkVersion,
  versionCount,
  isVersionExpanded,
  onToggleVersions,
}: FileCardProps) {
  const colors = useColors();
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.document.addEventListener('mousedown', onDoc);
    return () => window.document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const getFileIcon = (iconClass = "w-8 h-8") => {
    const type = document.fileType.toLowerCase();
    if (type.includes('pdf')) {
      return <FileText className={iconClass} style={{ color: colors.accent.red }} />;
    }
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) {
      return <FileSpreadsheet className={iconClass} style={{ color: colors.accent.green }} />;
    }
    if (type.includes('image') || type.includes('png') || type.includes('jpg') || type.includes('jpeg')) {
      return <FileImage className={iconClass} style={{ color: colors.accent.blue }} />;
    }
    return <File className={iconClass} style={{ color: colors.text.muted }} />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Map document category to a canon accent tone.
  const getCategoryTone = (category: string): string => {
    const tones: Record<string, string> = {
      'Appraisals':          colors.accent.purple,
      'Communications':      colors.accent.cyan,
      'Financial Documents': colors.accent.green,
      'Inspections':         colors.accent.orange,
      'Insurance':           colors.accent.teal,
      'KYC':                 colors.accent.yellow,
      'Legal Documents':     colors.accent.blue,
      'Loan Terms':          colors.accent.orange,
      'Photographs':         colors.accent.purple,
      'Plans':               colors.accent.indigo,
      'Professional Reports':colors.accent.cyan,
      'Project Documents':   colors.accent.green,
      'Warranties':          colors.accent.red,
    };
    return tones[category] || colors.text.muted;
  };

  // Token-styled dropdown menu item
  const MenuItem = ({
    icon,
    label,
    onSelect,
    danger,
  }: { icon: React.ReactNode; label: string; onSelect: () => void; danger?: boolean }) => (
    <button
      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onSelect(); }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '7px 10px',
        fontSize: 12,
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: danger ? colors.accent.red : colors.text.secondary,
        transition: 'background 100ms linear',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
      {label}
    </button>
  );

  const MenuSeparator = () => (
    <div style={{ height: 1, background: colors.border.light, margin: '4px 0' }} />
  );

  const dropdownMenu = (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <IconButton label="Actions" onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}>
        <MoreVertical className="w-3.5 h-3.5" />
      </IconButton>
      {menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            minWidth: 180,
            zIndex: 50,
            background: colors.bg.card,
            border: `1px solid ${colors.border.default}`,
            borderRadius: 4,
            padding: 4,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          }}
        >
          <MenuItem icon={<Eye className="w-4 h-4" />} label="View Details" onSelect={onView} />
          {onRename && <MenuItem icon={<Pencil className="w-4 h-4" />} label="Rename" onSelect={onRename} />}
          {onOpenReader && <MenuItem icon={<BookOpen className="w-4 h-4" />} label="Open in Reader" onSelect={onOpenReader} />}
          <MenuItem icon={<Download className="w-4 h-4" />} label="Download" onSelect={onDownload} />
          <MenuSeparator />
          {onLinkAsVersion && <MenuItem icon={<Layers className="w-4 h-4" />} label="Link as Version" onSelect={onLinkAsVersion} />}
          {onUnlinkVersion && document.previousVersionId && (
            <MenuItem icon={<Unlink className="w-4 h-4" />} label="Unlink Version" onSelect={onUnlinkVersion} />
          )}
          {onMove && <MenuItem icon={<FolderInput className="w-4 h-4" />} label="Move to Folder" onSelect={onMove} />}
          {onDuplicate && <MenuItem icon={<Copy className="w-4 h-4" />} label="Duplicate" onSelect={onDuplicate} />}
          <MenuSeparator />
          <MenuItem icon={<Flag className="w-4 h-4" />} label="Flag for Review" onSelect={() => setFlagModalOpen(true)} />
          {onDelete && (
            <>
              <MenuSeparator />
              <MenuItem icon={<Trash2 className="w-4 h-4" />} label="Delete" onSelect={onDelete} danger />
            </>
          )}
        </div>
      )}
    </div>
  );

  const flagModal = (
    <FlagCreationModal
      isOpen={flagModalOpen}
      onClose={() => setFlagModalOpen(false)}
      entityType="document"
      entityId={document._id}
      entityName={document.displayName || document.documentCode || document.fileName}
      entityContext={[document.clientName, document.projectName].filter(Boolean).join(' / ') || undefined}
    />
  );

  if (viewMode === 'list') {
    const hasSubline = !!document.documentCode;

    return (
      <>
      <div
        onClick={onClick}
        draggable={!!onDragStart}
        onDragStart={onDragStart}
        className="flex items-center px-3 group"
        style={{
          borderBottom: `1px solid ${colors.border.light}`,
          paddingTop: hasSubline ? 6 : 8,
          paddingBottom: hasSubline ? 6 : 8,
          cursor: onDragStart ? 'grab' : 'pointer',
          background: isSelected ? `${colors.accent.blue}10` : 'transparent',
          opacity: isDragging ? 0.35 : 1,
          transition: 'background 100ms linear',
        }}
        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = colors.bg.cardAlt; }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Expand chevron — fixed width for alignment */}
        <div className="flex-shrink-0 w-5 flex items-center justify-center">
          {onToggleVersions && (
            <IconButton
              label={isVersionExpanded ? 'Collapse versions' : 'Expand versions'}
              style={{ width: 20, height: 20 }}
              onClick={(e) => { e.stopPropagation(); onToggleVersions(); }}
            >
              {isVersionExpanded
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />
              }
            </IconButton>
          )}
        </div>

        {/* Checkbox */}
        {onSelectionChange && (
          <div className="flex-shrink-0 w-5 flex items-center" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={(e) => onSelectionChange(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: colors.accent.blue, cursor: 'pointer' }}
            />
          </div>
        )}

        {/* Name block */}
        <div className="flex-1 min-w-0 pl-2 pr-4">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-medium truncate" style={{ color: colors.text.primary }}>
              {document.displayName || document.documentCode || document.fileName}
            </span>
            {document.version && (
              <span className="text-[10px] flex-shrink-0" style={{ fontFamily: 'ui-monospace, monospace', color: colors.text.dim }}>
                {document.version}
              </span>
            )}
            {versionCount && versionCount > 1 && (
              <span className="text-[10px] flex-shrink-0 tabular-nums" style={{ color: colors.text.dim }}>
                +{versionCount - 1} ver
              </span>
            )}
            <FlagIndicator entityType="document" entityId={document._id} />
            {document.noteCount && document.noteCount > 0 ? (
              <span className="flex items-center gap-0.5 text-[10px] flex-shrink-0" style={{ color: colors.accent.orange }}>
                <MessageSquareText className="w-3 h-3" />
                {document.noteCount}
              </span>
            ) : null}
          </div>
          {hasSubline && (
            <p className="text-[11px] truncate leading-tight" style={{ color: colors.text.dim }}>
              {document.fileName}
            </p>
          )}
        </div>

        {/* Type */}
        <div className="flex-shrink-0 w-32 hidden md:block text-[12px] truncate pr-3" style={{ color: colors.text.muted }}>
          {document.fileTypeDetected || '—'}
        </div>

        {/* Category with color dot */}
        <div className="flex-shrink-0 w-32 hidden lg:flex items-center gap-1.5 pr-3">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: getCategoryTone(document.category) }} />
          <span className="text-[12px] truncate" style={{ color: colors.text.muted }}>{document.category}</span>
        </div>

        {/* Date */}
        <div className="flex-shrink-0 w-20 hidden sm:block text-[12px] tabular-nums text-right" style={{ color: colors.text.dim }}>
          {formatDate(document.uploadedAt)}
        </div>

        {/* Size */}
        <div className="flex-shrink-0 w-16 hidden sm:block text-[12px] tabular-nums text-right" style={{ color: colors.text.dim }}>
          {formatFileSize(document.fileSize)}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 w-7 flex justify-end ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {dropdownMenu}
        </div>
      </div>
      {flagModal}
      </>
    );
  }

  // Grid view
  const catTone = getCategoryTone(document.category);
  return (
    <>
    <div
      onClick={onClick}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      className="group"
      style={{ cursor: onDragStart ? 'grab' : 'pointer', opacity: isDragging ? 0.35 : 1 }}
    >
      <Panel>
        {/* Header with Icon and Actions */}
        <div className="flex items-start justify-between mb-3">
          <div style={{ padding: 8, background: colors.bg.cardAlt, borderRadius: 4 }}>
            {getFileIcon()}
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            {dropdownMenu}
          </div>
        </div>

        {/* Document Name */}
        <div className="mb-2">
          <div className="flex items-center gap-1 font-medium text-sm" style={{ color: colors.text.primary }}>
            <span className="truncate">{document.displayName || document.documentCode || document.fileName}</span>
            <FlagIndicator entityType="document" entityId={document._id} />
          </div>
          {document.documentCode && (
            <div className="text-xs truncate mt-0.5" style={{ color: colors.text.muted }}>
              {document.fileName}
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {document.version && (
            <StatusPill label={document.version} tone={colors.text.muted} />
          )}
          {document.fileTypeDetected && (
            <StatusPill label={document.fileTypeDetected} tone={colors.text.muted} />
          )}
          <StatusPill label={document.category} tone={catTone} />
          {document.noteCount && document.noteCount > 0 && (
            <DocumentNotesIndicator noteCount={document.noteCount} size="sm" />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs" style={{ color: colors.text.muted }}>
          <span>{formatDate(document.uploadedAt)}</span>
          <span>{formatFileSize(document.fileSize)}</span>
        </div>
      </Panel>
    </div>
    {flagModal}
    </>
  );
}
