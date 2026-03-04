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
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import DocumentNotesIndicator from '@/components/DocumentNotesIndicator';

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
  onDelete?: () => void;
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
  onDelete,
  onOpenReader,
  onLinkAsVersion,
  onUnlinkVersion,
  versionCount,
  isVersionExpanded,
  onToggleVersions,
}: FileCardProps) {
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

  if (viewMode === 'list') {
    // Combine type + category into one badge with category color
    const typeCategoryLabel = document.fileTypeDetected && document.fileTypeDetected !== document.category
      ? document.fileTypeDetected
      : document.category;

    return (
      <div
        onClick={onClick}
        className="flex items-center gap-2.5 px-3 py-2 hover:bg-stone-50/80 cursor-pointer border-b border-stone-100 group transition-colors"
      >
        {/* Leading action: chevron for version groups, checkbox for standalone */}
        <div className="flex-shrink-0 w-5 flex items-center justify-center">
          {onToggleVersions ? (
            <button
              className="p-0.5 hover:bg-stone-200/60 rounded transition-colors"
              onClick={(e) => { e.stopPropagation(); onToggleVersions(); }}
            >
              {isVersionExpanded
                ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
              }
            </button>
          ) : onSelectionChange ? (
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onSelectionChange(!!checked)}
              />
            </div>
          ) : null}
        </div>

        {/* File icon */}
        <div className="flex-shrink-0">
          {getFileIcon("w-4 h-4")}
        </div>

        {/* Name block — takes all remaining space */}
        <div className="flex-1 min-w-0 mr-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-medium text-stone-800 truncate leading-tight">
              {document.documentCode || document.fileName}
            </span>
            {document.version && (
              <span className="text-[10px] font-mono text-stone-400 flex-shrink-0 leading-none">
                {document.version}
              </span>
            )}
            {versionCount && versionCount > 1 && (
              <span className="text-[10px] text-stone-400 bg-stone-100 rounded px-1.5 py-px flex-shrink-0 leading-none">
                {versionCount}v
              </span>
            )}
            {document.noteCount && document.noteCount > 0 ? (
              <div className="flex-shrink-0">
                <DocumentNotesIndicator noteCount={document.noteCount} />
              </div>
            ) : null}
          </div>
          <p className="text-[11px] text-stone-400 truncate leading-tight mt-0.5">
            {document.documentCode ? document.fileName : document.summary?.slice(0, 80)}
          </p>
        </div>

        {/* Type+Category — single badge, fixed column */}
        <div className="flex-shrink-0 w-[7.5rem] hidden sm:flex">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0 truncate max-w-full font-normal",
              getCategoryColor(document.category),
            )}
          >
            {typeCategoryLabel}
          </Badge>
        </div>

        {/* Date */}
        <div className="flex-shrink-0 text-[11px] text-stone-400 tabular-nums hidden lg:block w-[5.5rem] text-right">
          {formatDate(document.uploadedAt)}
        </div>

        {/* Size */}
        <div className="flex-shrink-0 text-[11px] text-stone-400 tabular-nums hidden lg:block w-16 text-right">
          {formatFileSize(document.fileSize)}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 w-7">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-3.5 h-3.5 text-stone-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {renderDropdownItems()}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all group"
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
        <div className="font-medium text-gray-900 text-sm truncate">
          {document.documentCode || document.fileName}
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
  );
}
