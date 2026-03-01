'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useUser } from '@clerk/nextjs';
import { api } from '../../../../convex/_generated/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  X,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  Building,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface InternalUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  scope: 'internal' | 'personal';
  folderId: string;
  folderName: string;
}

interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'analyzing' | 'complete' | 'error';
  progress: number;
  error?: string;
  result?: {
    documentType?: string;
    category?: string;
    summary?: string;
  };
}

export default function InternalUploadModal({
  isOpen,
  onClose,
  scope,
  folderId,
  folderName,
}: InternalUploadModalProps) {
  const { user } = useUser();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const createDocument = useMutation(api.documents.create);
  const currentUser = useQuery(api.users.getCurrent);

  // Get user initials
  const getUserInitials = () => {
    if (user?.fullName) {
      return user.fullName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return 'XX';
  };

  const handleFiles = useCallback((fileList: FileList) => {
    const newFiles: UploadFile[] = Array.from(fileList).map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending' as const,
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [handleFiles]);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const uploadFile = async (uploadFile: UploadFile) => {
    const { file, id } = uploadFile;

    try {
      // Update status to uploading
      setFiles(prev => prev.map(f =>
        f.id === id ? { ...f, status: 'uploading' as const, progress: 10 } : f
      ));

      // Get upload URL
      const uploadUrl = await generateUploadUrl();

      // Upload the file
      setFiles(prev => prev.map(f =>
        f.id === id ? { ...f, progress: 30 } : f
      ));

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const { storageId } = await response.json();

      // Update to analyzing
      setFiles(prev => prev.map(f =>
        f.id === id ? { ...f, status: 'analyzing' as const, progress: 60 } : f
      ));

      // Determine file type
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      const mimeType = file.type;
      let fileType = 'document';

      if (['pdf'].includes(extension) || mimeType === 'application/pdf') {
        fileType = 'pdf';
      } else if (['doc', 'docx'].includes(extension) || mimeType.includes('word')) {
        fileType = 'document';
      } else if (['xls', 'xlsx', 'csv'].includes(extension) || mimeType.includes('sheet') || mimeType.includes('excel')) {
        fileType = 'spreadsheet';
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension) || mimeType.startsWith('image/')) {
        fileType = 'image';
      }

      // Create document record
      await createDocument({
        fileName: file.name,
        fileType,
        fileTypeDetected: file.type || fileType,
        fileSize: file.size,
        fileStorageId: storageId,
        category: 'Miscellaneous',
        summary: `${scope === 'internal' ? 'Internal' : 'Personal'} document uploaded to ${folderName}`,
        status: 'completed',
        // Internal/Personal specific fields
        scope,
        folderId,
        ownerId: scope === 'personal' ? currentUser?._id : undefined,
        uploaderInitials: getUserInitials(),
        uploadedBy: currentUser?._id,
      });

      // Mark as complete
      setFiles(prev => prev.map(f =>
        f.id === id ? {
          ...f,
          status: 'complete' as const,
          progress: 100,
          result: {
            category: 'Miscellaneous',
            summary: 'Document uploaded successfully',
          }
        } : f
      ));

    } catch (error) {
      console.error('Upload error:', error);
      setFiles(prev => prev.map(f =>
        f.id === id ? {
          ...f,
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Upload failed'
        } : f
      ));
    }
  };

  const handleUploadAll = async () => {
    setIsProcessing(true);
    const pendingFiles = files.filter(f => f.status === 'pending');

    for (const file of pendingFiles) {
      await uploadFile(file);
    }

    setIsProcessing(false);
  };

  const handleClose = () => {
    if (!isProcessing) {
      setFiles([]);
      onClose();
    }
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const completedCount = files.filter(f => f.status === 'complete').length;

  const ScopeIcon = scope === 'internal' ? Building : User;
  const scopeLabel = scope === 'internal' ? 'RockCap Internal' : 'Personal';
  const scopeColor = scope === 'internal' ? 'blue' : 'purple';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScopeIcon className={`w-5 h-5 text-${scopeColor}-600`} />
            Upload to {scopeLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Destination Info */}
          <div className={`flex items-center gap-2 text-sm text-gray-600 bg-${scopeColor}-50 p-2 rounded-md`}>
            <span>Uploading to:</span>
            <Badge variant="outline" className={`bg-${scopeColor}-100 text-${scopeColor}-700 border-${scopeColor}-200`}>
              {folderName}
            </Badge>
          </div>

          {/* Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              isDragOver
                ? `border-${scopeColor}-500 bg-${scopeColor}-50`
                : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
            )}
          >
            <Upload className={cn(
              "w-10 h-10 mx-auto mb-3",
              isDragOver ? `text-${scopeColor}-500` : "text-gray-400"
            )} />
            <p className="text-sm text-gray-600">
              <span className={`font-medium text-${scopeColor}-600`}>Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-gray-500 mt-1">PDF, Word, Excel, Images</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept=".pdf,.docx,.doc,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif"
          />

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {files.map(file => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <FileText className="w-8 h-8 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {file.file.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {file.status === 'pending' && (
                        <span className="text-xs text-gray-500">Ready to upload</span>
                      )}
                      {file.status === 'uploading' && (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                          <span className="text-xs text-blue-600">Uploading...</span>
                        </>
                      )}
                      {file.status === 'analyzing' && (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                          <span className="text-xs text-amber-600">Processing...</span>
                        </>
                      )}
                      {file.status === 'complete' && (
                        <>
                          <CheckCircle className="w-3 h-3 text-green-500" />
                          <span className="text-xs text-green-600">Complete</span>
                        </>
                      )}
                      {file.status === 'error' && (
                        <>
                          <AlertCircle className="w-3 h-3 text-red-500" />
                          <span className="text-xs text-red-600">{file.error || 'Error'}</span>
                        </>
                      )}
                    </div>
                    {(file.status === 'uploading' || file.status === 'analyzing') && (
                      <Progress value={file.progress} className="h-1 mt-2" />
                    )}
                  </div>
                  {file.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(file.id);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-gray-500">
              {completedCount > 0 && (
                <span className="text-green-600">{completedCount} uploaded</span>
              )}
              {completedCount > 0 && pendingCount > 0 && ' • '}
              {pendingCount > 0 && (
                <span>{pendingCount} pending</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
                {completedCount > 0 && !pendingCount ? 'Done' : 'Cancel'}
              </Button>
              {pendingCount > 0 && (
                <Button
                  onClick={handleUploadAll}
                  disabled={isProcessing}
                  className={scope === 'internal' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload {pendingCount} {pendingCount === 1 ? 'File' : 'Files'}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
