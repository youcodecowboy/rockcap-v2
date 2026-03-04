'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Layers,
  ArrowUp,
  ArrowDown,
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
  version?: string;
  previousVersionId?: string;
}

interface LinkAsVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceDocument: Document;
  folderDocuments: Document[];
}

export default function LinkAsVersionModal({
  isOpen,
  onClose,
  sourceDocument,
  folderDocuments,
}: LinkAsVersionModalProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<'newer' | 'older'>('newer');
  const [isLinking, setIsLinking] = useState(false);

  const linkAsVersion = useMutation(api.documents.linkAsVersion);

  const getFileIcon = (fileType: string) => {
    const type = fileType.toLowerCase();
    if (type.includes('pdf')) return <FileText className="w-4 h-4 text-red-500" />;
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv'))
      return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
    if (type.includes('image') || type.includes('png') || type.includes('jpg'))
      return <FileImage className="w-4 h-4 text-blue-500" />;
    return <File className="w-4 h-4 text-gray-500" />;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleLink = async () => {
    if (!selectedTargetId) return;
    setIsLinking(true);
    try {
      await linkAsVersion({
        sourceDocumentId: sourceDocument._id,
        targetDocumentId: selectedTargetId as Id<"documents">,
        relationship,
      });
      onClose();
    } catch (error) {
      console.error('Failed to link versions:', error);
      alert('Failed to link documents as versions');
    } finally {
      setIsLinking(false);
    }
  };

  const handleClose = () => {
    setSelectedTargetId(null);
    setRelationship('newer');
    onClose();
  };

  const selectedTarget = folderDocuments.find(d => d._id === selectedTargetId);

  // Filter out documents that are already in the same version chain
  const availableDocuments = folderDocuments.filter(d => d._id !== sourceDocument._id);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Link as Version
          </DialogTitle>
          <DialogDescription>
            Link &ldquo;{sourceDocument.documentCode || sourceDocument.fileName}&rdquo; as a version of another document.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Select target document */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700">Select document to link with</label>
          <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
            {availableDocuments.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">
                No other documents in this folder to link with.
              </div>
            ) : (
              availableDocuments.map((doc) => (
                <button
                  key={doc._id}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors",
                    selectedTargetId === doc._id && "bg-blue-50 hover:bg-blue-50"
                  )}
                  onClick={() => setSelectedTargetId(doc._id)}
                >
                  <div className="flex-shrink-0">{getFileIcon(doc.fileType)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {doc.documentCode || doc.fileName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(doc.uploadedAt)}
                      {doc.version && <span className="ml-2 font-mono">{doc.version}</span>}
                    </div>
                  </div>
                  {doc.fileTypeDetected && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                      {doc.fileTypeDetected}
                    </Badge>
                  )}
                  {selectedTargetId === doc._id && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Step 2: Choose relationship */}
        {selectedTarget && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">Relationship</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-center transition-colors",
                  relationship === 'newer'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
                onClick={() => setRelationship('newer')}
              >
                <ArrowUp className="w-4 h-4 text-blue-600" />
                <div className="text-sm font-medium">Newer version</div>
                <div className="text-[10px] text-gray-500 leading-tight">
                  This replaces the selected doc
                </div>
              </button>
              <button
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-center transition-colors",
                  relationship === 'older'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
                onClick={() => setRelationship('older')}
              >
                <ArrowDown className="w-4 h-4 text-orange-600" />
                <div className="text-sm font-medium">Older version</div>
                <div className="text-[10px] text-gray-500 leading-tight">
                  This is an earlier version
                </div>
              </button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLinking}>
            Cancel
          </Button>
          <Button
            onClick={handleLink}
            disabled={!selectedTargetId || isLinking}
          >
            {isLinking ? 'Linking...' : 'Link Versions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
