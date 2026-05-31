'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery, useConvex } from 'convex/react';
import { useUser } from '@clerk/nextjs';
import { api } from '../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../convex/_generated/dataModel';
import { Modal, Button, FlagChip } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  X,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
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
  const colors = useColors();
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
  const convex = useConvex();

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
          getStorageUrl: (storageId) => convex.query(api.documents.getFileUrl, { storageId }),
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
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Upload More Files"
      width={600}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isProcessing}>
            {allComplete ? 'Done' : 'Cancel'}
          </Button>
          {!allComplete && (
            <Button variant="primary" onClick={processFiles} disabled={pendingFiles === 0 || isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload {pendingFiles} {pendingFiles === 1 ? 'file' : 'files'}
                </>
              )}
            </Button>
          )}
        </>
      }
    >
      {/* Destination summary */}
      <div className="flex items-center gap-2" style={{ fontSize: 12, color: colors.text.muted, marginBottom: 16 }}>
        <span>{batch.clientName}</span>
        {batch.projectName && (
          <>
            <span>/</span>
            <span>{batch.projectName}</span>
          </>
        )}
        <FlagChip label={batch.isInternal ? 'Internal' : 'External'} severity="info" />
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className="text-center"
        style={{
          border: `2px dashed ${isDragOver ? colors.accent.blue : colors.border.mid}`,
          background: isDragOver ? `${colors.accent.blue}15` : colors.bg.light,
          borderRadius: 4,
          padding: 32,
          cursor: isProcessing ? 'default' : 'pointer',
          pointerEvents: isProcessing ? 'none' : 'auto',
          opacity: isProcessing ? 0.5 : 1,
          transition: 'border-color 100ms linear, background 100ms linear',
        }}
      >
        <Upload
          className="mx-auto"
          style={{ width: 40, height: 40, marginBottom: 12, color: isDragOver ? colors.accent.blue : colors.text.muted }}
        />
        <p style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
          {isDragOver ? 'Drop files here' : 'Drag & drop files here'}
        </p>
        <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>
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
        <div style={{ marginTop: 16, maxHeight: 300, overflowY: 'auto' }}>
          <div
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 9,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.text.muted,
              fontWeight: 500,
              marginBottom: 8,
            }}
          >
            Files ({files.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3"
                style={{ padding: 8, background: colors.bg.light, borderRadius: 4, border: `1px solid ${colors.border.light}` }}
              >
                <FileText className="w-8 h-8 flex-shrink-0" style={{ color: colors.text.muted }} />
                <div className="flex-1 min-w-0">
                  <p className="truncate" style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                    {file.file.name}
                  </p>
                  <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: colors.text.muted }}>
                      {formatFileSize(file.file.size)}
                    </span>
                    {file.status === 'pending' && (
                      <span style={{ fontSize: 11, color: colors.text.muted }}>Ready to upload</span>
                    )}
                    {file.status === 'uploading' && (
                      <span className="flex items-center gap-1" style={{ fontSize: 11, color: colors.accent.blue }}>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Uploading...
                      </span>
                    )}
                    {file.status === 'analyzing' && (
                      <span className="flex items-center gap-1" style={{ fontSize: 11, color: colors.accent.purple }}>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Analyzing...
                      </span>
                    )}
                    {file.status === 'complete' && (
                      <span className="flex items-center gap-1" style={{ fontSize: 11, color: colors.accent.green }}>
                        <CheckCircle className="w-3 h-3" />
                        Complete
                      </span>
                    )}
                    {file.status === 'error' && (
                      <span className="flex items-center gap-1" style={{ fontSize: 11, color: colors.accent.red }}>
                        <AlertCircle className="w-3 h-3" />
                        {file.error || 'Failed'}
                      </span>
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
                    aria-label="Remove file"
                    style={{ background: 'transparent', border: 'none', color: colors.text.muted, cursor: 'pointer' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
