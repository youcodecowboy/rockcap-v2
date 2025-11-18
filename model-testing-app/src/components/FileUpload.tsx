'use client';

import { useState, useCallback, useEffect } from 'react';
import { useFileQueue } from '@/lib/useFileQueue';
import { Id } from '../../convex/_generated/dataModel';
import { X, Upload, CheckCircle2, AlertCircle, Loader2, Power } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Switch } from '@/components/ui/switch';
import InstructionsModal from '@/components/InstructionsModal';
import { usePathname } from 'next/navigation';

interface FileUploadProps {
  onFileAnalyzed?: () => void; // Optional callback for when files are analyzed
  onError?: (fileName: string, error: string) => void; // Optional error callback
}

const MAX_FILES = 15;

export default function FileUpload({ onFileAnalyzed, onError }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [localFiles, setLocalFiles] = useState<Map<Id<"fileUploadQueue">, File>>(new Map());
  const [hasCustomInstructions, setHasCustomInstructions] = useState(false);
  const [instructionsModalOpen, setInstructionsModalOpen] = useState(false);
  const [pendingJobId, setPendingJobId] = useState<Id<"fileUploadQueue"> | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');
  
  const pathname = usePathname();
  const isMainPage = pathname === '/';
  
  const { addFile, removeFile, getQueueSize, isProcessing, isReady } = useFileQueue();
  
  // Subscribe to queue jobs to show status
  const queueJobs = useQuery(api.fileQueue.getRecentJobs, { includeRead: true });
  
  // Watch for jobs that need instructions (single file uploads on main page)
  useEffect(() => {
    if (isMainPage && hasCustomInstructions && pendingJobId) {
      const job = queueJobs?.find(j => j._id === pendingJobId);
      if (job && job.status === 'needs_confirmation' && job.hasCustomInstructions && !job.customInstructions) {
        // File is ready for instructions - show modal
        setInstructionsModalOpen(true);
      }
    }
  }, [queueJobs, pendingJobId, isMainPage, hasCustomInstructions]);

  const handleFiles = useCallback(async (files: File[]) => {
    if (!isReady) {
      alert('File upload system is initializing. Please wait a moment and try again.');
      return;
    }

    const currentQueueSize = getQueueSize();
    const remainingSlots = MAX_FILES - currentQueueSize;
    
    if (files.length > remainingSlots) {
      alert(`You can only upload ${remainingSlots} more file(s). Maximum ${MAX_FILES} files allowed.`);
      return;
    }

    const filesToUpload = files.slice(0, remainingSlots);
    const isSingleFileWithInstructions = isMainPage && filesToUpload.length === 1 && hasCustomInstructions;
    
    for (const file of filesToUpload) {
      try {
        const jobId = await addFile(file, hasCustomInstructions);
        if (jobId) {
          setLocalFiles(prev => new Map(prev).set(jobId, file));
          
          // If single file with instructions on main page, track it for immediate modal
          if (isSingleFileWithInstructions) {
            setPendingJobId(jobId);
            setPendingFileName(file.name);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to add file to queue';
        console.error('Error adding file to queue:', error);
        if (onError) {
          onError(file.name, errorMessage);
        }
      }
    }
  }, [isReady, addFile, getQueueSize, onError, hasCustomInstructions, isMainPage]);

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      await handleFiles(droppedFiles);
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      await handleFiles(selectedFiles);
      // Reset input so same file can be selected again
      e.target.value = '';
    },
    [handleFiles]
  );

  const handleRemoveFile = async (jobId: Id<"fileUploadQueue">) => {
    try {
      await removeFile(jobId);
      setLocalFiles(prev => {
        const newMap = new Map(prev);
        newMap.delete(jobId);
        return newMap;
      });
    } catch (error) {
      console.error('Error removing file:', error);
      alert('Failed to remove file from queue. Please try again.');
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusBadge = (status: string, progress?: number) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case 'needs_confirmation':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            <AlertCircle className="w-3 h-3" />
            Needs Review
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <AlertCircle className="w-3 h-3" />
            Error
          </span>
        );
      case 'uploading':
      case 'analyzing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <Loader2 className="w-3 h-3 animate-spin" />
            {status === 'uploading' ? 'Uploading' : 'Analyzing'} {progress !== undefined ? `${progress}%` : ''}
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            <Loader2 className="w-3 h-3 animate-spin" />
            Queued
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  // Filter queue jobs to only show active ones (not completed)
  // Completed items should be removed from the queue display
  const activeJobs = queueJobs?.filter(
    job => job.status !== 'completed'
  ).slice(0, 20) || [];
  const currentQueueSize = isReady ? getQueueSize() : 0;
  const isDisabled = !isReady || currentQueueSize >= MAX_FILES;

  const handleInstructionsSaved = () => {
    setPendingJobId(null);
    setPendingFileName('');
  };

  const pendingJob = pendingJobId ? queueJobs?.find(j => j._id === pendingJobId) : null;

  return (
    <div className="space-y-4">
      {/* Add Instructions Switch */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 flex-1">
          <Power className={`w-4 h-4 transition-colors ${hasCustomInstructions ? 'text-blue-600' : 'text-gray-400'}`} />
          <label htmlFor="add-instructions" className="text-sm font-medium text-gray-700 cursor-pointer">
            Add instructions
          </label>
        </div>
        <Switch
          id="add-instructions"
          checked={hasCustomInstructions}
          onCheckedChange={setHasCustomInstructions}
        />
        {hasCustomInstructions && (
          <span className="text-xs text-gray-500 ml-2">
            {isMainPage ? 'Single file: modal will appear • Multiple files: go to queue' : 'Files will go to review queue'}
          </span>
        )}
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
        } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          type="file"
          id="file-input"
          multiple
          accept=".txt,.md,.pdf,.doc,.docx,.csv,.xlsx,.xls"
          onChange={handleFileInput}
          className="hidden"
          disabled={isDisabled}
        />
        <label
          htmlFor="file-input"
          className={`cursor-pointer flex flex-col items-center space-y-2 ${currentQueueSize >= MAX_FILES ? 'cursor-not-allowed' : ''}`}
        >
          <Upload className="w-12 h-12 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">
            Drag and drop files here, or click to select
          </p>
          <p className="text-xs text-gray-500">
            Supported: .txt, .md, .pdf, .docx, .csv, .xlsx, .xls (max 10MB per file)
          </p>
          <p className="text-xs text-gray-500">
            {!isReady 
              ? 'Initializing upload system...'
              : currentQueueSize >= MAX_FILES 
              ? `Queue full (${MAX_FILES}/${MAX_FILES})`
              : `Up to ${MAX_FILES} files at once (${currentQueueSize}/${MAX_FILES} in queue)`
            }
          </p>
        </label>
      </div>

      {/* Queue Status - Only show active jobs (not completed) */}
      {activeJobs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Upload Queue {isProcessing() && <span className="text-blue-600">(Processing...)</span>}
            </h3>
            <span className="text-xs text-gray-500">
              {activeJobs.filter(j => j.status === 'pending' || j.status === 'uploading' || j.status === 'analyzing').length} active
            </span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {activeJobs.map((job) => {
              const file = localFiles.get(job._id);
              const canRemove = job.status === 'pending' || job.status === 'error';
              
              return (
                <div
                  key={job._id}
                  className={`p-3 rounded-lg border ${
                    job.status === 'completed'
                      ? 'bg-green-50 border-green-200'
                      : job.status === 'error'
                      ? 'bg-red-50 border-red-200'
                      : job.status === 'needs_confirmation'
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium truncate text-gray-900">{job.fileName}</p>
                        {getStatusBadge(job.status, job.progress)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span>{formatFileSize(job.fileSize)}</span>
                        {job.progress !== undefined && job.progress > 0 && job.progress < 100 && (
                          <>
                            <span>•</span>
                            <div className="flex-1 bg-gray-200 rounded-full h-1.5 max-w-[100px]">
                              <div
                                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${job.progress}%` }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                      {job.error && (
                        <p className="text-xs text-red-600 mt-1">{job.error}</p>
                      )}
                    </div>
                    {canRemove && (
                      <button
                        onClick={() => handleRemoveFile(job._id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        aria-label="Remove from queue"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Instructions Modal for single file uploads on main page */}
      {pendingJobId && pendingJob && (
        <InstructionsModal
          open={instructionsModalOpen}
          onOpenChange={setInstructionsModalOpen}
          jobId={pendingJobId}
          fileName={pendingFileName || pendingJob.fileName}
          existingInstructions={pendingJob.customInstructions}
          onInstructionsSaved={handleInstructionsSaved}
        />
      )}
    </div>
  );
}
