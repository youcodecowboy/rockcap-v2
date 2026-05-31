'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useUser } from '@clerk/nextjs';
import { api } from '../../../../../convex/_generated/api';
import { Modal, Button, StatusPill, IconButton } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
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
  const colors = useColors();
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
  const scopeColor = scope === 'internal' ? colors.accent.blue : colors.accent.purple;

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      width={512}
      title={`Upload to ${scopeLabel}`}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isProcessing}>
            {completedCount > 0 && !pendingCount ? 'Done' : 'Cancel'}
          </Button>
          {pendingCount > 0 && (
            <Button variant="primary" accent={scopeColor} onClick={handleUploadAll} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload {pendingCount} {pendingCount === 1 ? 'File' : 'Files'}
                </>
              )}
            </Button>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Destination Info */}
        <div
          className="flex items-center gap-2"
          style={{ fontSize: 12, color: colors.text.secondary, background: `${scopeColor}15`, padding: 8, borderRadius: 4 }}
        >
          <ScopeIcon className="w-4 h-4" style={{ color: scopeColor }} />
          <span>Uploading to:</span>
          <StatusPill label={folderName} tone={scopeColor} />
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `1px dashed ${isDragOver ? scopeColor : colors.border.mid}`,
            borderRadius: 4,
            padding: 32,
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragOver ? `${scopeColor}15` : 'transparent',
            transition: 'background 100ms linear, border-color 100ms linear',
          }}
        >
          <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: isDragOver ? scopeColor : colors.text.dim }} />
          <p style={{ fontSize: 12, color: colors.text.secondary }}>
            <span style={{ fontWeight: 500, color: scopeColor }}>Click to upload</span> or drag and drop
          </p>
          <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>PDF, Word, Excel, Images</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.xlsm,.eml,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif"
        />

        {/* File List */}
        {files.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
            {files.map(file => (
              <div
                key={file.id}
                className="flex items-center gap-3"
                style={{ padding: 12, background: colors.bg.cardAlt, borderRadius: 4 }}
              >
                <FileText className="w-7 h-7 flex-shrink-0" style={{ color: colors.text.dim }} />
                <div className="flex-1 min-w-0">
                  <p className="truncate" style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                    {file.file.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {file.status === 'pending' && (
                      <span style={{ fontSize: 11, color: colors.text.muted }}>Ready to upload</span>
                    )}
                    {file.status === 'uploading' && (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" style={{ color: colors.accent.blue }} />
                        <span style={{ fontSize: 11, color: colors.accent.blue }}>Uploading...</span>
                      </>
                    )}
                    {file.status === 'analyzing' && (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" style={{ color: colors.accent.orange }} />
                        <span style={{ fontSize: 11, color: colors.accent.orange }}>Processing...</span>
                      </>
                    )}
                    {file.status === 'complete' && (
                      <>
                        <CheckCircle className="w-3 h-3" style={{ color: colors.accent.green }} />
                        <span style={{ fontSize: 11, color: colors.accent.green }}>Complete</span>
                      </>
                    )}
                    {file.status === 'error' && (
                      <>
                        <AlertCircle className="w-3 h-3" style={{ color: colors.accent.red }} />
                        <span style={{ fontSize: 11, color: colors.accent.red }}>{file.error || 'Error'}</span>
                      </>
                    )}
                  </div>
                  {(file.status === 'uploading' || file.status === 'analyzing') && (
                    <div style={{ height: 4, borderRadius: 2, background: colors.bg.base, marginTop: 8, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${file.progress}%`, background: scopeColor, transition: 'width 150ms linear' }} />
                    </div>
                  )}
                </div>
                {file.status === 'pending' && (
                  <IconButton
                    label="Remove file"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(file.id);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </IconButton>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Status summary */}
        {(completedCount > 0 || pendingCount > 0) && (
          <div style={{ fontSize: 12, color: colors.text.muted }}>
            {completedCount > 0 && (
              <span style={{ color: colors.accent.green }}>{completedCount} uploaded</span>
            )}
            {completedCount > 0 && pendingCount > 0 && ' • '}
            {pendingCount > 0 && <span>{pendingCount} pending</span>}
          </div>
        )}
      </div>
    </Modal>
  );
}
