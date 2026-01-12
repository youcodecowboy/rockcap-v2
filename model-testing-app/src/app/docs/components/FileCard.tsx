'use client';

import { Id } from '../../../../convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Document {
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
}

interface FileCardProps {
  document: Document;
  viewMode: 'grid' | 'list';
  onClick: () => void;
  onView: () => void;
  onDownload: () => void;
  onMove?: () => void;
  onDelete?: () => void;
}

export default function FileCard({
  document,
  viewMode,
  onClick,
  onView,
  onDownload,
  onMove,
  onDelete,
}: FileCardProps) {
  const getFileIcon = () => {
    const type = document.fileType.toLowerCase();
    if (type.includes('pdf')) {
      return <FileText className="w-8 h-8 text-red-500" />;
    }
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) {
      return <FileSpreadsheet className="w-8 h-8 text-green-600" />;
    }
    if (type.includes('image') || type.includes('png') || type.includes('jpg') || type.includes('jpeg')) {
      return <FileImage className="w-8 h-8 text-blue-500" />;
    }
    return <File className="w-8 h-8 text-gray-500" />;
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
      'Appraisals': 'bg-purple-100 text-purple-800 border-purple-200',
      'Financial': 'bg-green-100 text-green-800 border-green-200',
      'Legal': 'bg-blue-100 text-blue-800 border-blue-200',
      'Terms': 'bg-orange-100 text-orange-800 border-orange-200',
      'Credit': 'bg-red-100 text-red-800 border-red-200',
      'KYC': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'Correspondence': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    };
    return colors[category] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const handleDropdownAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  if (viewMode === 'list') {
    return (
      <div
        onClick={onClick}
        className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 group"
      >
        {/* Icon */}
        <div className="flex-shrink-0">
          {getFileIcon()}
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">
            {document.documentCode || document.fileName}
          </div>
          <div className="text-sm text-gray-500 truncate">
            {document.documentCode ? document.fileName : document.summary.slice(0, 60) + '...'}
          </div>
        </div>

        {/* Type Badge */}
        <div className="flex-shrink-0 hidden sm:block">
          {document.fileTypeDetected && (
            <Badge variant="outline" className="text-xs">
              {document.fileTypeDetected}
            </Badge>
          )}
        </div>

        {/* Category Badge */}
        <div className="flex-shrink-0 hidden md:block">
          <Badge variant="outline" className={cn("text-xs", getCategoryColor(document.category))}>
            {document.category}
          </Badge>
        </div>

        {/* Date */}
        <div className="flex-shrink-0 text-sm text-gray-500 hidden lg:block w-24">
          {formatDate(document.uploadedAt)}
        </div>

        {/* Size */}
        <div className="flex-shrink-0 text-sm text-gray-500 hidden lg:block w-20 text-right">
          {formatFileSize(document.fileSize)}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onView)}>
                <Eye className="w-4 h-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onDownload)}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {onMove && (
                <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onMove)}>
                  <FolderInput className="w-4 h-4 mr-2" />
                  Move to Folder
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem 
                  onClick={(e) => handleDropdownAction(e as any, onDelete)}
                  className="text-red-600"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
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
            <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onView)}>
              <Eye className="w-4 h-4 mr-2" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onDownload)}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {onMove && (
              <DropdownMenuItem onClick={(e) => handleDropdownAction(e as any, onMove)}>
                <FolderInput className="w-4 h-4 mr-2" />
                Move to Folder
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem 
                onClick={(e) => handleDropdownAction(e as any, onDelete)}
                className="text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
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
        {document.fileTypeDetected && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {document.fileTypeDetected}
          </Badge>
        )}
        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", getCategoryColor(document.category))}>
          {document.category}
        </Badge>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{formatDate(document.uploadedAt)}</span>
        <span>{formatFileSize(document.fileSize)}</span>
      </div>
    </div>
  );
}
