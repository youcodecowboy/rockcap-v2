'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useUser } from '@clerk/nextjs';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DirectUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: Id<"clients">;
  clientName: string;
  clientType: string;
  folderType: string;
  folderName: string;
  level: 'client' | 'project';
  projectId?: Id<"projects">;
  projectName?: string;
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

export default function DirectUploadModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  clientType,
  folderType,
  folderName,
  level,
  projectId,
  projectName,
}: DirectUploadModalProps) {
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
    }
  };

  const addFiles = (newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      status: 'pending',
      progress: 0,
    }));
    setFiles(prev => [...prev, ...uploadFiles]);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    
    setIsProcessing(true);
    const initials = getUserInitials();
    const today = new Date().toISOString().split('T')[0];

    for (const uploadFile of files) {
      if (uploadFile.status !== 'pending') continue;

      try {
        // Update to uploading
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 20 } : f
        ));

        // Upload to Convex storage
        const uploadUrl = await generateUploadUrl();
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': uploadFile.file.type },
          body: uploadFile.file,
        });

        if (!uploadResponse.ok) throw new Error('Upload failed');
        
        const { storageId } = await uploadResponse.json();

        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id ? { ...f, progress: 50, status: 'analyzing' } : f
        ));

        // Analyze with AI
        const formData = new FormData();
        formData.append('file', uploadFile.file);
        formData.append('clientType', clientType);

        const analysisResponse = await fetch('/api/v4-analyze', {
          method: 'POST',
          body: formData,
        });

        let analysisResult = {
          documentType: 'Other',
          category: 'Miscellaneous',
          summary: 'Document uploaded directly to folder.',
        };

        if (analysisResponse.ok) {
          const data = await analysisResponse.json();
          // V4 returns results in a documents[] array; fall back to top-level fields for V3 compat
          const doc = data.documents?.[0];
          analysisResult = {
            documentType: doc?.fileType || data.documentType || 'Other',
            category: doc?.category || data.category || 'Miscellaneous',
            summary: doc?.summary || data.summary || 'Document uploaded directly to folder.',
          };
        }

        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id ? { ...f, progress: 80, result: analysisResult } : f
        ));

        // Generate document name
        const shortcode = projectId ? (projectName?.slice(0, 10).toUpperCase() || 'DOC') : clientName.slice(0, 10).toUpperCase();
        const typeCode = analysisResult.documentType?.toUpperCase().replace(/\s+/g, '-').slice(0, 20) || 'DOC';
        const documentCode = `${shortcode}-${typeCode}-EXT-${initials}-V1.0-${today}`;

        // Create document
        await createDocument({
          fileName: uploadFile.file.name,
          documentCode,
          fileType: uploadFile.file.type,
          fileSize: uploadFile.file.size,
          fileStorageId: storageId,
          summary: analysisResult.summary,
          category: analysisResult.category,
          fileTypeDetected: analysisResult.documentType,
          clientId,
          projectId: projectId || undefined,
          folderId: folderType,
          folderType: level,
          uploadedBy: currentUser?._id,
          uploaderInitials: initials,
          version: 'V1.0',
          isInternal: false,
        });

        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id ? { ...f, status: 'complete', progress: 100 } : f
        ));

      } catch (error) {
        console.error('Upload error:', error);
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' } 
            : f
        ));
      }
    }

    setIsProcessing(false);
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload to {folderName}
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
            <span>{clientName}</span>
            {projectName && (
              <>
                <span>→</span>
                <span>{projectName}</span>
              </>
            )}
            <span>→</span>
            <Badge variant="outline" className="text-xs">{folderName}</Badge>
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
                ? "border-blue-500 bg-blue-50" 
                : "border-gray-300 hover:border-gray-400 hover:bg-gray-50",
              isProcessing && "pointer-events-none opacity-50"
            )}
          >
            <Upload className={cn(
              "w-10 h-10 mx-auto mb-3",
              isDragOver ? "text-blue-500" : "text-gray-400"
            )} />
            <p className="text-sm font-medium text-gray-700">
              {isDragOver ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              or click to browse
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessing}
            />
          </div>

          {/* File List */}
          {hasFiles && (
            <div className="mt-4 flex-1 overflow-auto max-h-[300px]">
              <div className="text-sm font-medium text-gray-700 mb-2">
                Files ({files.length})
              </div>
              <div className="space-y-2">
                {files.map((file) => (
                  <div 
                    key={file.id}
                    className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
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
                            <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
                            <span className="text-xs text-purple-600">Analyzing...</span>
                          </>
                        )}
                        {file.status === 'complete' && (
                          <>
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            <span className="text-xs text-green-600">Complete</span>
                            {file.result?.documentType && (
                              <Badge variant="outline" className="text-xs">
                                {file.result.documentType}
                              </Badge>
                            )}
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
                        className="p-1 text-gray-400 hover:text-gray-600"
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
            {allComplete ? 'Close' : 'Cancel'}
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
