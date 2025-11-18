'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Building2, FolderKanban, CheckCircle2, AlertCircle, X, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useDocument } from '@/lib/documentStorage';
import { useProspectingContext } from '@/lib/prospectingStorage';
import { useEnrichmentByDocument } from '@/lib/clientStorage';
import FileAssignmentCard from '@/components/FileAssignmentCard';
import EnrichmentReviewCard from '@/components/EnrichmentReviewCard';
import EditableFileTypeBadge from '@/components/EditableFileTypeBadge';
import InstructionsModal from '@/components/InstructionsModal';
import { useState, useEffect } from 'react';
import { AnalysisResult } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function UploadSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as Id<"fileUploadQueue">;
  
  const job = useQuery(api.fileQueue.getJob, { jobId });
  const updateJobStatus = useMutation(api.fileQueue.updateJobStatus);
  const markAsRead = useMutation(api.fileQueue.markAsRead);
  const deleteJob = useMutation(api.fileQueue.deleteJob);

  const [isDeleting, setIsDeleting] = useState(false);
  const [filedDocumentId, setFiledDocumentId] = useState<Id<"documents"> | null>(null);
  const [editedFileType, setEditedFileType] = useState<string | null>(null);
  const [editedCategory, setEditedCategory] = useState<string | null>(null);
  const [instructionsModalOpen, setInstructionsModalOpen] = useState(false);
  
  // Update filedDocumentId when job loads or updates
  useEffect(() => {
    if (job?.documentId) {
      setFiledDocumentId(job.documentId);
    }
  }, [job?.documentId]);
  
  const document = useDocument(filedDocumentId || undefined);
  const prospectingContext = useProspectingContext(filedDocumentId || undefined);
  const enrichmentSuggestions = useEnrichmentByDocument(filedDocumentId || undefined) || [];

  // Mark as read when page loads
  useEffect(() => {
    if (job && !job.isRead) {
      markAsRead({ jobId });
    }
  }, [job, jobId, markAsRead]);

  // Show instructions modal if needed
  useEffect(() => {
    if (job && job.hasCustomInstructions && !job.customInstructions && !filedDocumentId) {
      setInstructionsModalOpen(true);
    }
  }, [job, filedDocumentId]);

  const handleInstructionsSaved = () => {
    // Instructions saved, modal will close
    // The job query will automatically refetch
  };

  if (!job) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Upload job not found.</p>
            <Button
              variant="outline"
              onClick={() => router.push('/')}
              className="mt-4"
            >
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const analysisResult = job.analysisResult as AnalysisResult | undefined;
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this upload job?')) {
      return;
    }
    
    setIsDeleting(true);
    try {
      await deleteJob({ jobId });
      router.push('/');
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Failed to delete job');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFiled = (documentId: Id<"documents">) => {
    setFiledDocumentId(documentId);
    // Refresh the page data by updating the job query
  };

  const handleFileTypeChange = async (fileType: string, category: string) => {
    if (!job || !analysisResult) return;
    
    setEditedFileType(fileType);
    setEditedCategory(category);
    
    // Update the analysis result in the job
    const updatedAnalysisResult = {
      ...analysisResult,
      fileType,
      category,
    };
    
    try {
      await updateJobStatus({
        jobId,
        analysisResult: updatedAnalysisResult,
      });
    } catch (error) {
      console.error('Error updating file type:', error);
      // Revert on error
      setEditedFileType(null);
      setEditedCategory(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4"
          >
            ← Back
          </Button>
          
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {job.fileName}
                  </h1>
                  {job.status === 'completed' && (
                    <Badge className="bg-green-100 text-green-700">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Filed
                    </Badge>
                  )}
                  {job.status === 'needs_confirmation' && (
                    <Badge className="bg-yellow-100 text-yellow-700">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Needs Review
                    </Badge>
                  )}
                  {job.status === 'error' && (
                    <Badge className="bg-red-100 text-red-700">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Error
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                  <span>{formatFileSize(job.fileSize)}</span>
                  <span>•</span>
                  {analysisResult && !filedDocumentId ? (
                    <EditableFileTypeBadge
                      fileType={editedFileType || analysisResult.fileType || 'Other'}
                      category={editedCategory || analysisResult.category || 'General'}
                      onFileTypeChange={handleFileTypeChange}
                    />
                  ) : (
                    <span>{analysisResult?.fileType || job.fileType}</span>
                  )}
                  {analysisResult?.category && (
                    <>
                      <span>•</span>
                      <Badge variant="outline" className="text-xs">
                        {editedCategory || analysisResult.category}
                      </Badge>
                    </>
                  )}
                  <span>•</span>
                  <span>Uploaded {new Date(job.createdAt).toLocaleString()}</span>
                  {analysisResult && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        Confidence: 
                        <Badge 
                          variant={analysisResult.confidence >= 0.9 ? "default" : "secondary"}
                          className={analysisResult.confidence < 0.9 ? "bg-yellow-100 text-yellow-700" : ""}
                        >
                          {(analysisResult.confidence * 100).toFixed(0)}%
                        </Badge>
                      </span>
                    </>
                  )}
                </div>

                {job.error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800 font-medium">Error:</p>
                    <p className="text-sm text-red-700">{job.error}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {filedDocumentId && (
                  <Link href={`/docs/${filedDocumentId}`}>
                    <Button variant="outline">
                      <FileText className="w-4 h-4 mr-2" />
                      View Document
                    </Button>
                  </Link>
                )}
                <Button
                  variant="ghost"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-red-600 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Instructions Section */}
        {job.hasCustomInstructions && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Custom Instructions</CardTitle>
                {!filedDocumentId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInstructionsModalOpen(true)}
                  >
                    {job.customInstructions ? 'Edit Instructions' : 'Add Instructions'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {job.customInstructions ? (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{job.customInstructions}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  No instructions provided yet. Click "Add Instructions" to provide context for better filing accuracy.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* File Assignment Card - Show when not filed yet */}
        {analysisResult && job.status !== 'error' && !filedDocumentId && (
          <FileAssignmentCard
            fileName={job.fileName}
            fileSize={job.fileSize}
            fileType={job.fileType}
            fileStorageId={job.fileStorageId}
            analysisResult={{
              ...analysisResult,
              fileType: editedFileType || analysisResult.fileType,
              category: editedCategory || analysisResult.category,
            }}
            jobId={jobId}
            onFiled={handleFiled}
          />
        )}

        {/* Enrichment Review Card - Show after filing */}
        {filedDocumentId && (
          <EnrichmentReviewCard
            documentId={filedDocumentId}
            onReviewComplete={() => {
              // Optionally refresh or show completion message
            }}
          />
        )}

        {/* Content Tabs */}
        {analysisResult && (
          <Tabs defaultValue="analysis" className="space-y-4">
            <TabsList>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              {filedDocumentId && (
                <>
                  <TabsTrigger value="filing">Filing Details</TabsTrigger>
                  {enrichmentSuggestions.length > 0 && (
                    <TabsTrigger value="enrichment">
                      Enrichment ({enrichmentSuggestions.length})
                    </TabsTrigger>
                  )}
                  {prospectingContext && (
                    <TabsTrigger value="prospecting">Prospecting Context</TabsTrigger>
                  )}
                </>
              )}
            </TabsList>

            {/* Analysis Tab */}
            <TabsContent value="analysis" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>File Analysis</CardTitle>
                  <CardDescription>AI analysis results for this file</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-1">Summary</h3>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{analysisResult.summary}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">File Type</h3>
                      <Badge variant="secondary">{analysisResult.fileType}</Badge>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Category</h3>
                      <Badge variant="outline">{analysisResult.category}</Badge>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-1">Confidence</h3>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${analysisResult.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-600">
                        {(analysisResult.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {analysisResult.clientName && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Client</h3>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900">{analysisResult.clientName}</span>
                        {analysisResult.clientId && (
                          <Link href={`/clients/${analysisResult.clientId}`}>
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  )}

                  {analysisResult.projectName && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Project</h3>
                      <div className="flex items-center gap-2">
                        <FolderKanban className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900">{analysisResult.projectName}</span>
                        {analysisResult.projectId && (
                          <Link href={`/projects/${analysisResult.projectId}`}>
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  )}

                  {analysisResult.suggestedClientName && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <h3 className="text-sm font-medium text-yellow-900 mb-1">Suggested Client</h3>
                      <p className="text-sm text-yellow-800">{analysisResult.suggestedClientName}</p>
                    </div>
                  )}

                  {analysisResult.suggestedProjectName && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <h3 className="text-sm font-medium text-yellow-900 mb-1">Suggested Project</h3>
                      <p className="text-sm text-yellow-800">{analysisResult.suggestedProjectName}</p>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-1">Reasoning</h3>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{analysisResult.reasoning}</p>
                  </div>

                  {analysisResult.extractedData && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Extracted Data</h3>
                      <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-auto max-h-64">
                        {JSON.stringify(analysisResult.extractedData, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Filing Details Tab */}
            {filedDocumentId && (
              <TabsContent value="filing" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Filing Details</CardTitle>
                    <CardDescription>Where this document was filed</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {document ? (
                      <>
                        <div>
                          <h3 className="text-sm font-medium text-gray-700 mb-1">Document ID</h3>
                          <p className="text-sm text-gray-900 font-mono">{document._id}</p>
                        </div>
                        {document.clientName && (
                          <div>
                            <h3 className="text-sm font-medium text-gray-700 mb-1">Client</h3>
                            <Link href={`/clients/${document.clientId}`}>
                              <Button variant="link" className="p-0 h-auto">
                                {document.clientName}
                              </Button>
                            </Link>
                          </div>
                        )}
                        {document.projectName && (
                          <div>
                            <h3 className="text-sm font-medium text-gray-700 mb-1">Project</h3>
                            <Link href={`/projects/${document.projectId}`}>
                              <Button variant="link" className="p-0 h-auto">
                                {document.projectName}
                              </Button>
                            </Link>
                          </div>
                        )}
                        <div>
                          <h3 className="text-sm font-medium text-gray-700 mb-1">Filed At</h3>
                          <p className="text-sm text-gray-900">
                            {new Date(document.savedAt).toLocaleString()}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">Document details loading...</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Enrichment Tab */}
            {enrichmentSuggestions.length > 0 && (
              <TabsContent value="enrichment" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Enrichment Suggestions</CardTitle>
                    <CardDescription>Data extracted from this document</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {enrichmentSuggestions.map((suggestion) => (
                        <div
                          key={suggestion._id}
                          className="p-3 border border-gray-200 rounded-lg"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline">{suggestion.type}</Badge>
                                <span className="text-sm font-medium text-gray-900">
                                  {suggestion.field}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700">{String(suggestion.value)}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                Confidence: {(suggestion.confidence * 100).toFixed(0)}%
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Prospecting Context Tab */}
            {prospectingContext && (
              <TabsContent value="prospecting" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Prospecting Context</CardTitle>
                    <CardDescription>Insights extracted for prospecting</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {prospectingContext.keyPoints && prospectingContext.keyPoints.length > 0 && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-700 mb-2">Key Points</h3>
                          <ul className="list-disc list-inside space-y-1 text-sm text-gray-900">
                            {prospectingContext.keyPoints.map((point, i) => (
                              <li key={i}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {prospectingContext.painPoints && prospectingContext.painPoints.length > 0 && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-700 mb-2">Pain Points</h3>
                          <ul className="list-disc list-inside space-y-1 text-sm text-gray-900">
                            {prospectingContext.painPoints.map((point, i) => (
                              <li key={i}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {prospectingContext.opportunities && prospectingContext.opportunities.length > 0 && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-700 mb-2">Opportunities</h3>
                          <ul className="list-disc list-inside space-y-1 text-sm text-gray-900">
                            {prospectingContext.opportunities.map((opp, i) => (
                              <li key={i}>{opp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        )}

        {/* Instructions Modal */}
        <InstructionsModal
          open={instructionsModalOpen}
          onOpenChange={setInstructionsModalOpen}
          jobId={jobId}
          fileName={job.fileName}
          existingInstructions={job.customInstructions}
          onInstructionsSaved={handleInstructionsSaved}
        />
      </div>
    </div>
  );
}

