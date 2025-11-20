'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
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
import { FileText, Clock, CheckCircle2, AlertCircle, ArrowRight, Building2, Edit, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import InstructionsModal from '@/components/InstructionsModal';

export default function DocsQueuePage() {
  const router = useRouter();
  const [instructionsModalOpen, setInstructionsModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<Id<"fileUploadQueue"> | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [selectedInstructions, setSelectedInstructions] = useState<string | undefined>(undefined);
  
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumbs */}
        <div className="mb-4">
          <nav className="flex items-center gap-2 text-sm text-gray-600">
            <Link href="/docs" className="hover:text-gray-900 transition-colors">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Pending Review</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
                  <p className="text-sm text-gray-500">Awaiting assignment</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{completedCount}</p>
                  <p className="text-sm text-gray-500">Recently filed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Processed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{pendingCount + completedCount}</p>
                  <p className="text-sm text-gray-500">In queue</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Documents */}
        {pendingCount > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Pending Review ({pendingCount})
              </h2>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">File Name</TableHead>
                    <TableHead className="w-[150px]">Client</TableHead>
                    <TableHead className="w-[120px]">Type</TableHead>
                    <TableHead className="w-[120px]">Category</TableHead>
                    <TableHead className="w-[100px]">Size</TableHead>
                    <TableHead className="w-[100px]">Uploaded</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
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
                          <div className="max-w-[300px]">
                            <div className="truncate" title={job.fileName}>
                              {job.fileName}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {clientName !== '—' ? (
                            <div className="flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-sm text-gray-700">{clientName}</span>
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
                        </TableCell>
                        <TableCell>
                          <ArrowRight className="w-4 h-4 text-gray-400" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Completed Documents (Recent) */}
        {completedCount > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Recently Completed ({completedCount})
              </h2>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">File Name</TableHead>
                    <TableHead className="w-[150px]">Client</TableHead>
                    <TableHead className="w-[120px]">Type</TableHead>
                    <TableHead className="w-[120px]">Category</TableHead>
                    <TableHead className="w-[100px]">Size</TableHead>
                    <TableHead className="w-[100px]">Uploaded</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
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
                          <div className="max-w-[300px]">
                            <div className="truncate" title={job.fileName}>
                              {job.fileName}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {clientName !== '—' ? (
                            <div className="flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-sm text-gray-700">{clientName}</span>
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
                        <TableCell>
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
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

