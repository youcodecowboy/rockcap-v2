'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useUser } from '@clerk/nextjs';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
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
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createBulkQueueProcessor, BatchInfo } from '@/lib/bulkQueueProcessor';
import { getUserInitials } from '@/lib/documentNaming';

interface UploadMoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchId: Id<"bulkUploadBatches">;
  batch: {
    clientId?: Id<"clients">;
    clientName?: string;
    clientType?: string;
    projectId?: Id<"projects">;
    projectName?: string;
    projectShortcode?: string;
    isInternal: boolean;
    instructions?: string;
  };
}

interface UploadFile {
  id: string;
  file: File;
  itemId?: Id<"bulkUploadItems">;
  status: 'pending' | 'uploading' | 'analyzing' | 'complete' | 'error';
  progress: number;
  error?: string;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export default function UploadMoreModal({
  isOpen,
  onClose,
  batchId,
  batch,
}: UploadMoreModalProps) {
  const { user } = useUser();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const currentUser = useQuery(api.users.getCurrent, {});

  // Mutations
  const addItemToBatch = useMutation(api.bulkUpload.addItemToBatch);
  const updateItemStatus = useMutation(api.bulkUpload.updateItemStatus);
  const updateItemAnalysis = useMutation(api.bulkUpload.updateItemAnalysis);
  const updateBatchStatus = useMutation(api.bulkUpload.updateBatchStatus);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  // User initials
  const uploaderInitials = getUserInitials(
    user?.fullName || user?.firstName || currentUser?.name || 'User'
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
      e.target.value = '';
    }
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles: UploadFile[] = [];
    const errors: string[] = [];

    for (const file of newFiles) {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File too large (max 100MB)`);
        continue;
      }
      validFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: 'pending',
        progress: 0,
      });
    }

    if (errors.length > 0) {
      alert(errors.join('\n'));
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const processFiles = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);

    try {
      // Create the processor
      const processor = createBulkQueueProcessor(
        {
          updateItemStatus,
          updateItemAnalysis,
          updateBatchStatus,
          checkForDuplicates: async (args) => {
            const params = new URLSearchParams({
              originalFileName: args.originalFileName,
              clientId: args.clientId,
            });
            if (args.projectId) {
              params.append('projectId', args.projectId);
            }
            const response = await fetch(`/api/check-duplicates?${params.toString()}`);
            if (!response.ok) {
              return { isDuplicate: false, existingDocuments: [] };
            }
            return response.json();
          },
          generateUploadUrl,
        },
        {
          onProgress: (processed, total, currentFile) => {
            // Update progress for the current file
            setFiles(prev => prev.map(f => {
              if (f.file.name === currentFile) {
                return { ...f, status: 'analyzing' as const, progress: 75 };
              }
              return f;
            }));
          },
          onError: (itemId, error) => {
            console.error(`Error processing item ${itemId}:`, error);
            setFiles(prev => prev.map(f =>
              f.itemId === itemId
                ? { ...f, status: 'error' as const, error }
                : f
            ));
          },
        }
      );

      // Set batch info
      const batchInfo: BatchInfo = {
        batchId,
        clientId: batch.clientId!,
        clientName: batch.clientName || '',
        clientType: batch.clientType || 'borrower',
        projectId: batch.projectId,
        projectShortcode: batch.projectShortcode,
        isInternal: batch.isInternal,
        instructions: batch.instructions,
        uploaderInitials,
      };
      processor.setBatchInfo(batchInfo);

      // Add files to batch and processor
      for (const uploadFile of files.filter(f => f.status === 'pending')) {
        // Mark as uploading
        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id ? { ...f, status: 'uploading' as const, progress: 20 } : f
        ));

        // Add item to batch in Convex
        const itemId = await addItemToBatch({
          batchId,
          fileName: uploadFile.file.name,
          fileSize: uploadFile.file.size,
          fileType: uploadFile.file.type,
        });

        // Update file with itemId
        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id ? { ...f, itemId, progress: 40 } : f
        ));

        // Add to processor queue
        processor.addItem(itemId, uploadFile.file);
      }

      // Process all files
      await processor.processQueue();

      // Mark all as complete
      setFiles(prev => prev.map(f =>
        f.status !== 'error' ? { ...f, status: 'complete' as const, progress: 100 } : f
      ));

    } catch (error) {
      console.error('Error processing files:', error);
      alert(error instanceof Error ? error.message : 'Failed to process files');
    } finally {
      setIsProcessing(false);
    }
  };

  const allComplete = files.length > 0 && files.every(f => f.status === 'complete' || f.status === 'error');
  const hasFiles = files.length > 0;
  const pendingFiles = files.filter(f => f.status === 'pending').length;

  const handleClose = () => {
    if (!isProcessing) {
      setFiles([]);
      onClose();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Upload More Files
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <span>{batch.clientName}</span>
            {batch.projectName && (
              <>
                <span>/</span>
                <span>{batch.projectName}</span>
              </>
            )}
            <Badge variant="outline" className="text-xs ml-2">
              {batch.isInternal ? 'Internal' : 'External'}
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
              isDragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50",
              isProcessing && "pointer-events-none opacity-50"
            )}
          >
            <Upload className={cn(
              "w-10 h-10 mx-auto mb-3",
              isDragOver ? "text-primary" : "text-muted-foreground"
            )} />
            <p className="text-sm font-medium">
              {isDragOver ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or click to browse
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessing}
            />
          </div>

          {/* File List */}
          {hasFiles && (
            <div className="mt-4 flex-1 overflow-auto max-h-[300px]">
              <div className="text-sm font-medium mb-2">
                Files ({files.length})
              </div>
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg"
                  >
                    <FileText className="w-8 h-8 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {file.file.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(file.file.size)}
                        </span>
                        {file.status === 'pending' && (
                          <span className="text-xs text-muted-foreground">Ready to upload</span>
                        )}
                        {file.status === 'uploading' && (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                            <span className="text-xs text-blue-600">Uploading...</span>
                          </>
                        )}
                        {file.status === 'analyzing' && (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
                            <span className="text-xs text-purple-600">Analyzing...</span>
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
                            <span className="text-xs text-red-600">{file.error || 'Failed'}</span>
                          </>
                        )}
                      </div>
                      {(file.status === 'uploading' || file.status === 'analyzing') && (
                        <Progress value={file.progress} className="mt-2 h-1" />
                      )}
                    </div>
                    {file.status === 'pending' && !isProcessing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(file.id);
                        }}
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
          >
            {allComplete ? 'Done' : 'Cancel'}
          </Button>
          {!allComplete && (
            <Button
              onClick={processFiles}
              disabled={pendingFiles === 0 || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload {pendingFiles} {pendingFiles === 1 ? 'file' : 'files'}
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
