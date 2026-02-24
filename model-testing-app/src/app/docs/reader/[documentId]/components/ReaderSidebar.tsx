'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  FileType,
  Tag,
  FolderOpen,
  Calendar,
  Clock,
  HardDrive,
  User,
  CheckSquare,
  FileText,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import DocumentNoteForm from './DocumentNoteForm';
import DocumentNoteCard from './DocumentNoteCard';

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
  clientId?: Id<"clients">;
  clientName?: string;
  projectId?: Id<"projects">;
  projectName?: string;
  version?: string;
  uploaderInitials?: string;
  lastOpenedAt?: string;
  hasNotes?: boolean;
  noteCount?: number;
}

interface ReaderSidebarProps {
  document: Document;
  documentId: Id<"documents">;
}

export default function ReaderSidebar({ document, documentId }: ReaderSidebarProps) {
  // Query document notes
  const notes = useQuery(api.documentNotes.getByDocument, { documentId });

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

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Classification Section */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <FileType className="w-4 h-4" />
            Classification
          </h3>
          <div className="space-y-3">
            {/* Document Type */}
            {document.fileTypeDetected && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Document Type</div>
                <Badge variant="outline" className="text-xs">
                  {document.fileTypeDetected}
                </Badge>
              </div>
            )}

            {/* Category */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Category</div>
              <Badge variant="outline" className={cn("text-xs", getCategoryColor(document.category))}>
                {document.category}
              </Badge>
            </div>

            {/* Location */}
            {(document.clientName || document.projectName) && (
              <div>
                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <FolderOpen className="w-3 h-3" />
                  Location
                </div>
                <div className="text-sm text-gray-900">
                  {document.clientName}
                  {document.projectName && (
                    <span className="text-gray-500"> / {document.projectName}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* File Details Section */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            File Details
          </h3>
          <div className="space-y-3">
            {/* Original Filename */}
            {document.documentCode && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Original Filename</div>
                <div className="text-sm text-gray-900 break-all">{document.fileName}</div>
              </div>
            )}

            {/* File Size */}
            <div className="flex items-center gap-2">
              <HardDrive className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-500">Size:</span>
              <span className="text-sm text-gray-900">{formatFileSize(document.fileSize)}</span>
            </div>

            {/* Version */}
            {document.version && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Version:</span>
                <Badge variant="secondary" className="text-xs">{document.version}</Badge>
              </div>
            )}

            {/* Uploader */}
            {document.uploaderInitials && (
              <div className="flex items-center gap-2">
                <User className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-500">Uploaded by:</span>
                <span className="text-sm text-gray-900">{document.uploaderInitials}</span>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Dates Section */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Dates
          </h3>
          <div className="space-y-3">
            {/* Uploaded */}
            <div>
              <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Uploaded
              </div>
              <div className="text-sm text-gray-900">{formatDate(document.uploadedAt)}</div>
            </div>

            {/* Last Opened */}
            {document.lastOpenedAt && (
              <div>
                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last Opened
                </div>
                <div className="text-sm text-gray-900">{formatDate(document.lastOpenedAt)}</div>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Summary Section */}
        {document.summary && (
          <>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Summary</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{document.summary}</p>
            </div>
            <Separator />
          </>
        )}

        {/* Notes Section */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Notes
            {notes && notes.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-auto">
                {notes.length}
              </Badge>
            )}
          </h3>

          {/* Add Note Form */}
          <DocumentNoteForm
            documentId={documentId}
            clientId={document.clientId}
            projectId={document.projectId}
          />

          {/* Existing Notes */}
          {notes && notes.length > 0 && (
            <div className="mt-4 space-y-3">
              {notes.map((note) => (
                <DocumentNoteCard key={note._id} note={note} />
              ))}
            </div>
          )}

          {notes && notes.length === 0 && (
            <p className="text-xs text-gray-400 mt-3 text-center">
              No notes yet. Add a note above.
            </p>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
