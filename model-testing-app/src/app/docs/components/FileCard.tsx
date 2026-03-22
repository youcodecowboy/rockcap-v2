'use client';

import { Id } from '../../../../convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
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
  const [flagModalOpen, setFlagModalOpen] = useState(false);

  const getFileIcon = (iconClass = "w-8 h-8") => {
    const type = document.fileType.toLowerCase();
    if (type.includes('pdf')) {
      return <FileText className={cn(iconClass, "text-red-500")} />;
    }
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) {
      return <FileSpreadsheet className={cn(iconClass, "text-green-600")} />;
    }
    if (type.includes('image') || type.includes('png') || type.includes('jpg') || type.includes('jpeg')) {
      return <FileImage className={cn(iconClass, "text-blue-500")} />;
    }
    return <File className={cn(iconClass, "text-gray-500")} />;
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

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Appraisals':          'bg-violet-50 text-violet-700 border-violet-200',
      'Communications':      'bg-sky-50 text-sky-700 border-sky-200',
      'Financial Documents': 'bg-emerald-50 text-emerald-700 border-emerald-200',
      'Inspections':         'bg-amber-50 text-amber-700 border-amber-200',
      'Insurance':           'bg-teal-50 text-teal-700 border-teal-200',
      'KYC':                 'bg-yellow-50 text-yellow-700 border-yellow-200',
      'Legal Documents':     'bg-blue-50 text-blue-700 border-blue-200',
      'Loan Terms':          'bg-orange-50 text-orange-700 border-orange-200',
      'Photographs':         'bg-pink-50 text-pink-700 border-pink-200',
      'Plans':               'bg-indigo-50 text-indigo-700 border-indigo-200',
      'Professional Reports':'bg-cyan-50 text-cyan-700 border-cyan-200',
      'Project Documents':   'bg-lime-50 text-lime-700 border-lime-200',
      'Warranties':          'bg-rose-50 text-rose-700 border-rose-200',
    };
    return colors[category] || 'bg-stone-50 text-stone-600 border-stone-200';
  };

  const getCategoryDot = (category: string) => {
    const dots: Record<string, string> = {
      'Appraisals':          'bg-violet-500',
      'Communications':      'bg-sky-500',
      'Financial Documents': 'bg-emerald-500',
      'Inspections':         'bg-amber-500',
      'Insurance':           'bg-teal-500',
      'KYC':                 'bg-yellow-500',
      'Legal Documents':     'bg-blue-500',
      'Loan Terms':          'bg-orange-500',
      'Photographs':         'bg-pink-500',
      'Plans':               'bg-indigo-500',
      'Professional Reports':'bg-cyan-500',
      'Project Documents':   'bg-lime-500',
      'Warranties':          'bg-rose-500',
    };
    return dots[category] || 'bg-gray-400';
  };

  const handleDropdownAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  const renderDropdownItems = () => (
    <>
      <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onView)}>
        <Eye className="w-4 h-4 mr-2" />
        View Details
      </DropdownMenuItem>
      {onOpenReader && (
        <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onOpenReader)}>
          <BookOpen className="w-4 h-4 mr-2" />
          Open in Reader
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onDownload)}>
        <Download className="w-4 h-4 mr-2" />
        Download
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {onLinkAsVersion && (
        <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onLinkAsVersion)}>
          <Layers className="w-4 h-4 mr-2" />
          Link as Version
        </DropdownMenuItem>
      )}
      {onUnlinkVersion && document.previousVersionId && (
        <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onUnlinkVersion)}>
          <Unlink className="w-4 h-4 mr-2" />
          Unlink Version
        </DropdownMenuItem>
      )}
      {onMove && (
        <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onMove)}>
          <FolderInput className="w-4 h-4 mr-2" />
          Move to Folder
        </DropdownMenuItem>
      )}
      {onDuplicate && (
        <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onDuplicate)}>
          <Copy className="w-4 h-4 mr-2" />
          Duplicate
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, () => setFlagModalOpen(true))}>
        <Flag className="w-4 h-4 mr-2" />
        Flag for Review
      </DropdownMenuItem>
      {onDelete && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => handleDropdownAction(e as any, onDelete)}
            className="text-red-600"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  const flagModal = (
    <FlagCreationModal
      isOpen={flagModalOpen}
      onClose={() => setFlagModalOpen(false)}
      entityType="document"
      entityId={document._id}
      entityName={document.documentCode || document.fileName}
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
        className={cn(
          "flex items-center px-3 border-b border-gray-100 cursor-pointer group transition-colors",
          hasSubline ? "py-1.5" : "py-2",
          isSelected ? "bg-blue-50/50" : "hover:bg-gray-50/60",
          isDragging && "opacity-35",
          onDragStart && "cursor-grab",
        )}
      >
        {/* Expand chevron — fixed width for alignment */}
        <div className="flex-shrink-0 w-5 flex items-center justify-center">
          {onToggleVersions && (
            <button
              className="p-0.5 rounded hover:bg-gray-200/50 transition-colors"
              onClick={(e) => { e.stopPropagation(); onToggleVersions(); }}
            >
              {isVersionExpanded
                ? <ChevronDown className="w-3 h-3 text-gray-400" />
                : <ChevronRight className="w-3 h-3 text-gray-400" />
              }
            </button>
          )}
        </div>

        {/* Checkbox */}
        {onSelectionChange && (
          <div className="flex-shrink-0 w-5 flex items-center" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelectionChange(!!checked)}
              className="h-3.5 w-3.5"
            />
          </div>
        )}

        {/* Name block */}
        <div className="flex-1 min-w-0 pl-2 pr-4">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-medium text-gray-900 truncate">
              {document.documentCode || document.fileName}
            </span>
            {document.version && (
              <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
                {document.version}
              </span>
            )}
            {versionCount && versionCount > 1 && (
              <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">
                +{versionCount - 1} ver
              </span>
            )}
            <FlagIndicator entityType="document" entityId={document._id} />
            {document.noteCount && document.noteCount > 0 ? (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-600 flex-shrink-0">
                <MessageSquareText className="w-3 h-3" />
                {document.noteCount}
              </span>
            ) : null}
          </div>
          {hasSubline && (
            <p className="text-[11px] text-gray-400 truncate leading-tight">
              {document.fileName}
            </p>
          )}
        </div>

        {/* Type */}
        <div className="flex-shrink-0 w-32 hidden md:block text-[12px] text-gray-500 truncate pr-3">
          {document.fileTypeDetected || '—'}
        </div>

        {/* Category with color dot */}
        <div className="flex-shrink-0 w-32 hidden lg:flex items-center gap-1.5 pr-3">
          <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", getCategoryDot(document.category))} />
          <span className="text-[12px] text-gray-500 truncate">{document.category}</span>
        </div>

        {/* Date */}
        <div className="flex-shrink-0 w-20 hidden sm:block text-[12px] text-gray-400 tabular-nums text-right">
          {formatDate(document.uploadedAt)}
        </div>

        {/* Size */}
        <div className="flex-shrink-0 w-16 hidden sm:block text-[12px] text-gray-400 tabular-nums text-right">
          {formatFileSize(document.fileSize)}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 w-7 flex justify-end ml-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {renderDropdownItems()}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {flagModal}
      </>
    );
  }

  // Grid view
  return (
    <>
    <div
      onClick={onClick}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      className={cn(
        "bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all group",
        isDragging && "opacity-35",
        onDragStart && "cursor-grab",
      )}
    >
      {/* Header with Icon and Actions */}
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 bg-gray-50 rounded-lg">
          {getFileIcon()}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {renderDropdownItems()}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Document Name */}
      <div className="mb-2">
        <div className="flex items-center gap-1 font-medium text-gray-900 text-sm">
          <span className="truncate">{document.documentCode || document.fileName}</span>
          <FlagIndicator entityType="document" entityId={document._id} />
        </div>
        {document.documentCode && (
          <div className="text-xs text-gray-500 truncate mt-0.5">
            {document.fileName}
          </div>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {document.version && (
          <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
            {document.version}
          </Badge>
        )}
        {document.fileTypeDetected && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {document.fileTypeDetected}
          </Badge>
        )}
        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", getCategoryColor(document.category))}>
          {document.category}
        </Badge>
        {document.noteCount && document.noteCount > 0 && (
          <DocumentNotesIndicator noteCount={document.noteCount} size="sm" />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{formatDate(document.uploadedAt)}</span>
        <span>{formatFileSize(document.fileSize)}</span>
      </div>
    </div>
    {flagModal}
    </>
  );
}
