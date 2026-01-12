'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Download,
  ExternalLink,
  X,
  Calendar,
  HardDrive,
  User,
  FolderOpen,
  Tag,
  FileType,
  Clock,
  Trash2,
  FolderInput,
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
  savedAt?: string;
  fileStorageId?: Id<"_storage">;
  clientName?: string;
  projectName?: string;
  version?: string;
  uploaderInitials?: string;
  isInternal?: boolean;
}

interface FileDetailPanelProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: () => void;
  onMove?: () => void;
}

export default function FileDetailPanel({
  document,
  isOpen,
  onClose,
  onDelete,
  onMove,
}: FileDetailPanelProps) {
  // Get file URL for preview/download
  const fileUrl = useQuery(
    api.documents.getFileUrl,
    document?.fileStorageId ? { storageId: document.fileStorageId } : "skip"
  );

  if (!document) return null;

  const getFileIcon = () => {
    const type = document.fileType.toLowerCase();
    if (type.includes('pdf')) {
      return <FileText className="w-12 h-12 text-red-500" />;
    }
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) {
      return <FileSpreadsheet className="w-12 h-12 text-green-600" />;
    }
    if (type.includes('image') || type.includes('png') || type.includes('jpg') || type.includes('jpeg')) {
      return <FileImage className="w-12 h-12 text-blue-500" />;
    }
    return <File className="w-12 h-12 text-gray-500" />;
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
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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

  const handleDownload = async () => {
    if (!fileUrl) {
      alert('File not available for download');
      return;
    }
    
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.fileName;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download file');
    }
  };

  const handleOpenExternal = () => {
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    }
  };

  const canPreview = document.fileType.toLowerCase().includes('pdf') || 
                     document.fileType.toLowerCase().includes('image');

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[450px] sm:max-w-[450px] p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold truncate pr-4">
              {document.documentCode || document.fileName}
            </SheetTitle>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Preview Section */}
            <div className="bg-gray-50 rounded-lg p-6 flex flex-col items-center justify-center">
              {canPreview && fileUrl ? (
                <div className="w-full">
                  {document.fileType.toLowerCase().includes('pdf') ? (
                    <iframe
                      src={`${fileUrl}#toolbar=0`}
                      className="w-full h-[300px] rounded border border-gray-200"
                      title="PDF Preview"
                    />
                  ) : (
                    <img
                      src={fileUrl}
                      alt={document.fileName}
                      className="max-w-full max-h-[300px] mx-auto rounded border border-gray-200"
                    />
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  {getFileIcon()}
                  <p className="mt-3 text-sm text-gray-500">Preview not available</p>
                </div>
              )}
              
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-2"
                onClick={handleOpenExternal}
                disabled={!fileUrl}
              >
                <ExternalLink className="w-4 h-4" />
                Open in New Tab
              </Button>
            </div>

            {/* Details Section */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Details</h3>
              
              {/* Original Filename */}
              {document.documentCode && (
                <div className="flex items-start gap-3">
                  <File className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Original Filename</div>
                    <div className="text-sm text-gray-900 break-all">{document.fileName}</div>
                  </div>
                </div>
              )}

              {/* Document Type */}
              {document.fileTypeDetected && (
                <div className="flex items-start gap-3">
                  <FileType className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Document Type</div>
                    <Badge variant="outline" className="text-sm">
                      {document.fileTypeDetected}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Category */}
              <div className="flex items-start gap-3">
                <Tag className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Category</div>
                  <Badge variant="outline" className={cn("text-sm", getCategoryColor(document.category))}>
                    {document.category}
                  </Badge>
                </div>
              </div>

              {/* Client/Project */}
              {(document.clientName || document.projectName) && (
                <div className="flex items-start gap-3">
                  <FolderOpen className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Location</div>
                    <div className="text-sm text-gray-900">
                      {document.clientName}
                      {document.projectName && (
                        <span className="text-gray-500"> / {document.projectName}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* File Size */}
              <div className="flex items-start gap-3">
                <HardDrive className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">File Size</div>
                  <div className="text-sm text-gray-900">{formatFileSize(document.fileSize)}</div>
                </div>
              </div>

              {/* Upload Date */}
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Uploaded</div>
                  <div className="text-sm text-gray-900">{formatDate(document.uploadedAt)}</div>
                </div>
              </div>

              {/* Version */}
              {document.version && (
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Version</div>
                    <Badge variant="secondary" className="text-sm">{document.version}</Badge>
                  </div>
                </div>
              )}

              {/* Uploader */}
              {document.uploaderInitials && (
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Uploaded By</div>
                    <div className="text-sm text-gray-900">{document.uploaderInitials}</div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Summary Section */}
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900">Summary</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {document.summary}
              </p>
            </div>
          </div>
        </ScrollArea>

        {/* Actions Footer */}
        <div className="border-t border-gray-200 p-4 space-y-2">
          <Button 
            className="w-full gap-2" 
            onClick={handleDownload}
            disabled={!fileUrl}
          >
            <Download className="w-4 h-4" />
            Download File
          </Button>
          
          <div className="flex gap-2">
            {onMove && (
              <Button variant="outline" className="flex-1 gap-2" onClick={onMove}>
                <FolderInput className="w-4 h-4" />
                Move
              </Button>
            )}
            {onDelete && (
              <Button 
                variant="outline" 
                className="flex-1 gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={onDelete}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
