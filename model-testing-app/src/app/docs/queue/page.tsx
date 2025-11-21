'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileText, Clock, CheckCircle2, AlertCircle, ArrowRight, Building2, Edit, ChevronRight, Trash2 } from 'lucide-react';
import Link from 'next/link';
import InstructionsModal from '@/components/InstructionsModal';
import CompactMetricCard from '@/components/CompactMetricCard';

export default function DocsQueuePage() {
  const router = useRouter();
  const [instructionsModalOpen, setInstructionsModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<Id<"fileUploadQueue"> | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [selectedInstructions, setSelectedInstructions] = useState<string | undefined>(undefined);
  
  // Mutations
  const deleteJob = useMutation(api.fileQueue.deleteJob);
  
  // Get all jobs that need confirmation
  const pendingJobs = useQuery(api.fileQueue.getJobs, { 
    status: 'needs_confirmation',
    limit: 100 
  });
  
  // Get all completed jobs that might have enrichments to review
  const completedJobs = useQuery(api.fileQueue.getJobs, {
    status: 'completed',
    limit: 50
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const pendingCount = pendingJobs?.length || 0;
  const completedCount = completedJobs?.length || 0;

  const handleOpenInstructionsModal = (jobId: Id<"fileUploadQueue">, fileName: string, instructions?: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedJobId(jobId);
    setSelectedFileName(fileName);
    setSelectedInstructions(instructions);
    setInstructionsModalOpen(true);
  };

  const handleInstructionsSaved = () => {
    // Refresh the page or refetch jobs
    // The query will automatically refetch
  };

  const handleDeleteJob = async (jobId: Id<"fileUploadQueue">, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (confirm('Are you sure you want to delete this document from the queue?')) {
      await deleteJob({ jobId });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumbs */}
        <div className="mb-4">
          <nav className="flex items-center gap-2 text-sm text-gray-600">
            <Link 
              href="/docs" 
              className="hover:text-gray-900 transition-colors"
              onClick={(e) => {
                e.preventDefault();
                router.push('/docs');
              }}
            >
              Docs
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-900 font-medium">Document Queue</span>
          </nav>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Document Queue</h1>
              <p className="mt-2 text-gray-600">
                Review and file documents that have been uploaded and analyzed
              </p>
            </div>
            <Link href="/docs">
              <Button variant="outline">
                View Document Library
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
          <CompactMetricCard
            label="Pending Review"
            value={pendingCount}
            icon={Clock}
            iconColor="yellow"
            className="bg-black text-white"
          />
          <CompactMetricCard
            label="Completed"
            value={completedCount}
            icon={CheckCircle2}
            iconColor="green"
            className="bg-black text-white"
          />
          <CompactMetricCard
            label="Total Processed"
            value={pendingCount + completedCount}
            icon={FileText}
            iconColor="blue"
            className="bg-black text-white"
          />
        </div>

        {/* Pending Documents */}
        {pendingCount > 0 && (
          <div className="mb-8">
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-blue-600 text-white px-6 py-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Pending Review ({pendingCount})
                </h2>
              </div>
              <div className="overflow-hidden">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingJobs?.map((job) => {
                    const analysisResult = job.analysisResult as any;
                    const clientName = analysisResult?.clientName || analysisResult?.suggestedClientName || '—';
                    const needsInstructions = job.hasCustomInstructions && !job.customInstructions;
                    return (
                      <TableRow 
                        key={job._id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => router.push(`/uploads/${job._id}`)}
                      >
                        <TableCell className="font-medium">
                          <div className="max-w-[200px]">
                            <div className="truncate" title={job.fileName}>
                              {job.fileName}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {clientName !== '—' ? (
                            <div className="flex items-center gap-1.5 max-w-[150px]">
                              <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="text-sm text-gray-700 truncate" title={clientName}>{clientName}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {analysisResult?.fileType && (
                            <Badge variant="secondary" className="text-xs">
                              {analysisResult.fileType}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {analysisResult?.category && (
                            <Badge variant="outline" className="text-xs">
                              {analysisResult.category}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {formatFileSize(job.fileSize)}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {formatTimeAgo(job.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-yellow-100 text-yellow-700">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Review
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {needsInstructions ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => handleOpenInstructionsModal(job._id, job.fileName, job.customInstructions, e)}
                                className="text-xs"
                              >
                                <Edit className="w-3 h-3 mr-1" />
                                Add Instructions
                              </Button>
                            ) : job.hasCustomInstructions && job.customInstructions ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleOpenInstructionsModal(job._id, job.fileName, job.customInstructions, e)}
                                className="text-xs"
                              >
                                <Edit className="w-3 h-3 mr-1" />
                                Edit
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleDeleteJob(job._id, e)}
                              className="text-xs text-red-600 hover:text-red-700"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </Card>
          </div>
        )}

        {/* Completed Documents (Recent) */}
        {completedCount > 0 && (
          <div>
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-blue-600 text-white px-6 py-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Recently Completed ({completedCount})
                </h2>
              </div>
              <div className="overflow-hidden">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedJobs?.slice(0, 20).map((job) => {
                    const analysisResult = job.analysisResult as any;
                    const clientName = analysisResult?.clientName || analysisResult?.suggestedClientName || '—';
                    return (
                      <TableRow 
                        key={job._id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => router.push(`/uploads/${job._id}`)}
                      >
                        <TableCell className="font-medium">
                          <div className="max-w-[200px]">
                            <div className="truncate" title={job.fileName}>
                              {job.fileName}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {clientName !== '—' ? (
                            <div className="flex items-center gap-1.5 max-w-[150px]">
                              <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="text-sm text-gray-700 truncate" title={clientName}>{clientName}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {analysisResult?.fileType && (
                            <Badge variant="secondary" className="text-xs">
                              {analysisResult.fileType}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {analysisResult?.category && (
                            <Badge variant="outline" className="text-xs">
                              {analysisResult.category}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {formatFileSize(job.fileSize)}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {formatTimeAgo(job.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Filed
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {job.documentId ? (
                              <Link 
                                href={`/docs/${job.documentId}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-700"
                              >
                                <ArrowRight className="w-4 h-4" />
                              </Link>
                            ) : (
                              <ArrowRight className="w-4 h-4 text-gray-400" />
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleDeleteJob(job._id, e)}
                              className="text-xs text-red-600 hover:text-red-700"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </Card>
          </div>
        )}

        {/* Empty State */}
        {pendingCount === 0 && completedCount === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No documents in queue</h3>
              <p className="text-sm text-gray-500 mb-4">
                Upload files to see them appear here for review
              </p>
              <Link href="/">
                <Button>
                  Upload Files
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Instructions Modal */}
        {selectedJobId && (
          <InstructionsModal
            open={instructionsModalOpen}
            onOpenChange={setInstructionsModalOpen}
            jobId={selectedJobId}
            fileName={selectedFileName}
            existingInstructions={selectedInstructions}
            onInstructionsSaved={handleInstructionsSaved}
          />
        )}
      </div>
    </div>
  );
}

