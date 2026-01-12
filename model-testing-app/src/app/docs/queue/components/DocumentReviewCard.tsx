'use client';

import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  FileText, 
  Image as ImageIcon,
  File,
  AlertCircle,
} from 'lucide-react';
import FilingPreview from './FilingPreview';

interface Job {
  _id: Id<"fileUploadQueue">;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileStorageId?: Id<"_storage">;
  documentId?: Id<"documents">;
  analysisResult?: {
    summary?: string;
    fileTypeDetected?: string;
    category?: string;
    suggestedClientName?: string;
    suggestedProjectName?: string;
    confidence?: number;
    reasoning?: string;
  };
  status: string;
  createdAt: string;
}

interface FilingData {
  clientId: Id<"clients"> | null;
  projectId: Id<"projects"> | null;
  folderId: string;
  folderType: 'client' | 'project';
  summary: string;
  category: string;
  fileTypeDetected: string;
}

interface DocumentReviewCardProps {
  job: Job;
  filingData: FilingData;
  onFilingDataChange: (data: Partial<FilingData>) => void;
}

export default function DocumentReviewCard({
  job,
  filingData,
  onFilingDataChange,
}: DocumentReviewCardProps) {
  // Fetch file URL for preview
  const fileUrl = useQuery(
    api.documents.getFileUrl,
    job.fileStorageId ? { storageId: job.fileStorageId } : "skip"
  );

  // Fetch clients for selection
  const clients = useQuery(api.clients.list, {});

  // Fetch projects for selected client
  const projects = useQuery(
    api.projects.list,
    filingData.clientId ? { clientId: filingData.clientId } : "skip"
  );

  // Fetch client folders
  const clientFolders = useQuery(
    api.clients.getClientFolders,
    filingData.clientId ? { clientId: filingData.clientId } : "skip"
  );

  // Fetch project folders
  const projectFolders = useQuery(
    api.projects.getProjectFolders,
    filingData.projectId ? { projectId: filingData.projectId } : "skip"
  );

  // Get file icon based on type
  const getFileIcon = () => {
    if (job.fileType.startsWith('image/')) {
      return <ImageIcon className="w-6 h-6 text-purple-500" />;
    }
    if (job.fileType === 'application/pdf') {
      return <FileText className="w-6 h-6 text-red-500" />;
    }
    return <File className="w-6 h-6 text-gray-500" />;
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Determine available folders based on context
  const availableFolders = filingData.folderType === 'project' 
    ? projectFolders || []
    : clientFolders?.filter(f => !f.parentFolderId) || [];

  // Check if can show document preview
  const canPreview = job.fileType.startsWith('image/') || job.fileType === 'application/pdf';

  return (
    <div className="flex-1 flex gap-6 overflow-hidden">
      {/* Left Panel: Document Preview */}
      <div className="flex-1 min-w-0 bg-gray-100 rounded-lg overflow-hidden flex flex-col">
        <div className="p-3 bg-white border-b flex items-center gap-3">
          {getFileIcon()}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900 truncate">{job.fileName}</p>
            <p className="text-xs text-gray-500">{formatFileSize(job.fileSize)}</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          {canPreview && fileUrl ? (
            job.fileType.startsWith('image/') ? (
              <img 
                src={fileUrl} 
                alt={job.fileName}
                className="max-w-full h-auto rounded shadow-sm"
              />
            ) : (
              <iframe
                src={fileUrl}
                className="w-full h-full min-h-[500px] rounded shadow-sm bg-white"
                title={job.fileName}
              />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                {getFileIcon()}
                <p className="mt-2 text-sm">Preview not available</p>
                <p className="text-xs text-gray-400">{job.fileType}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Filing Info */}
      <div className="w-[400px] flex-shrink-0 flex flex-col gap-4 overflow-auto">
        {/* Analysis Result Section */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Filing Information</h3>
            {job.analysisResult?.confidence && (
              <Badge variant="outline" className="text-xs">
                {Math.round(job.analysisResult.confidence * 100)}% confidence
              </Badge>
            )}
          </div>

          {/* Reasoning/Attention needed */}
          {job.analysisResult?.reasoning && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-amber-800">AI Reasoning</p>
                  <p className="text-xs text-amber-700 mt-1">{job.analysisResult.reasoning}</p>
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Summary
            </label>
            <Textarea
              value={filingData.summary}
              onChange={(e) => onFilingDataChange({ summary: e.target.value })}
              placeholder="Document summary..."
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Document Type */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Document Type
            </label>
            <Input
              value={filingData.fileTypeDetected}
              onChange={(e) => onFilingDataChange({ fileTypeDetected: e.target.value })}
              placeholder="e.g., Term Sheet, Invoice..."
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Category
            </label>
            <Select
              value={filingData.category}
              onValueChange={(value) => onFilingDataChange({ category: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Appraisals">Appraisals</SelectItem>
                <SelectItem value="Terms">Terms</SelectItem>
                <SelectItem value="Credit">Credit</SelectItem>
                <SelectItem value="Financial">Financial</SelectItem>
                <SelectItem value="Legal">Legal</SelectItem>
                <SelectItem value="Correspondence">Correspondence</SelectItem>
                <SelectItem value="KYC">KYC</SelectItem>
                <SelectItem value="Notes">Notes</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filing Destination Section */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <h3 className="font-semibold text-gray-900">Filing Destination</h3>

          {/* Client Selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Client <span className="text-red-500">*</span>
            </label>
            <Select
              value={filingData.clientId || ""}
              onValueChange={(value) => {
                onFilingDataChange({ 
                  clientId: value as Id<"clients">,
                  projectId: null, // Reset project when client changes
                  folderId: '',
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients?.map((client) => (
                  <SelectItem key={client._id} value={client._id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Project Selection (Optional) */}
          {filingData.clientId && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Project (Optional)
              </label>
              <Select
                value={filingData.projectId || "none"}
                onValueChange={(value) => {
                  const projectId = value === "none" ? null : value as Id<"projects">;
                  onFilingDataChange({ 
                    projectId,
                    folderType: projectId ? 'project' : 'client',
                    folderId: '',
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project (client-level)</SelectItem>
                  {projects?.map((project) => (
                    <SelectItem key={project._id} value={project._id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Folder Selection */}
          {filingData.clientId && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Folder <span className="text-red-500">*</span>
              </label>
              <Select
                value={filingData.folderId}
                onValueChange={(value) => onFilingDataChange({ folderId: value })}
                disabled={filingData.folderType === 'project' && !filingData.projectId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select folder" />
                </SelectTrigger>
                <SelectContent>
                  {availableFolders.map((folder) => (
                    <SelectItem key={folder._id} value={folder.folderType}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Filing Preview */}
        <FilingPreview
          clientId={filingData.clientId}
          projectId={filingData.projectId}
          folderId={filingData.folderId}
          folderType={filingData.folderType}
        />
      </div>
    </div>
  );
}
