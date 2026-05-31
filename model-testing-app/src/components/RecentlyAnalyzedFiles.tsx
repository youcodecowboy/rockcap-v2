'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Panel, Button, IconButton, StatusPill, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  FileText,
  ChevronDown,
  ChevronRight,
  X,
  RefreshCw,
  Eye,
  Building2,
  FolderKanban,
  AlertCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ClientProjectSearch from './ClientProjectSearch';
import RefileModal from './RefileModal';
import { useDocuments } from '@/lib/documentStorage';
import { useClients, useProjects } from '@/lib/clientStorage';

interface RecentlyAnalyzedFilesProps {
  // No props needed - component queries its own data
}

export default function RecentlyAnalyzedFiles({}: RecentlyAnalyzedFilesProps) {
  const colors = useColors();
  const router = useRouter();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [refileModalOpen, setRefileModalOpen] = useState<string | null>(null);
  const [quickFixClientId, setQuickFixClientId] = useState<Record<string, Id<'clients'> | undefined>>({});
  const [quickFixProjectId, setQuickFixProjectId] = useState<Record<string, Id<'projects'> | undefined>>({});
  const [currentPage, setCurrentPage] = useState(1);

  const FILES_PER_PAGE = 10;
  const MAX_RECENT_FILES = 25; // Cap at 25 files - older files go to docs page

  // Query completed and needs_confirmation jobs
  const allJobs = useQuery(api.fileQueue.getRecentJobs, { includeRead: true });
  const allCompletedJobsUnfiltered = allJobs?.filter(
    job => job.status === 'completed' || job.status === 'needs_confirmation'
  ) || [];
  const totalCompletedCount = allCompletedJobsUnfiltered.length;
  const allCompletedJobs = allCompletedJobsUnfiltered.slice(0, MAX_RECENT_FILES); // Cap at 25 most recent files

  // Pagination
  const totalPages = Math.ceil(allCompletedJobs.length / FILES_PER_PAGE);
  const startIndex = (currentPage - 1) * FILES_PER_PAGE;
  const endIndex = startIndex + FILES_PER_PAGE;
  const completedJobs = allCompletedJobs.slice(startIndex, endIndex);

  // Get all document IDs from jobs
  const documentIds = useMemo(() => {
    return completedJobs
      .map(job => job.documentId)
      .filter((id): id is Id<'documents'> => id !== undefined);
  }, [completedJobs]);

  // Query all documents at once
  const allDocuments = useDocuments();
  const documentsMap = useMemo(() => {
    const map = new Map<Id<'documents'>, NonNullable<NonNullable<typeof allDocuments>[number]>>();
    allDocuments?.forEach(doc => {
      if (doc && documentIds.includes(doc._id)) {
        map.set(doc._id, doc);
      }
    });
    return map;
  }, [allDocuments, documentIds]);

  // Get unique user IDs from documents and jobs
  const userIds = useMemo(() => {
    const ids = new Set<Id<'users'>>();
    documentsMap.forEach(doc => {
      if (doc.uploadedBy) {
        ids.add(doc.uploadedBy);
      }
    });
    // Also include userIds from jobs (for documents that might not have uploadedBy set yet)
    completedJobs.forEach(job => {
      if (job.userId) {
        try {
          ids.add(job.userId as Id<'users'>);
        } catch (e) {
          // Skip invalid user IDs
        }
      }
    });
    return Array.from(ids);
  }, [documentsMap, completedJobs]);

  // Query users for display
  const users = useQuery(api.users.getByIds, userIds.length > 0 ? { userIds } : "skip");
  const usersMap = useMemo(() => {
    const map = new Map<Id<'users'>, { name?: string; email: string }>();
    users?.forEach(user => {
      if (user) {
        map.set(user._id, { name: user.name, email: user.email });
      }
    });
    if (process.env.NODE_ENV === 'development') {
      console.log('[RecentlyAnalyzedFiles] Users map:', {
        userIdsToQuery: userIds,
        usersFound: users?.length || 0,
        usersMapSize: map.size,
      });
    }
    return map;
  }, [users, userIds]);

  const deleteJob = useMutation(api.fileQueue.deleteJob);
  const markAsRead = useMutation(api.fileQueue.markAsRead);
  const updateDocument = useMutation(api.documents.update);
  
  // Query clients and projects for quick fix
  const clients = useClients();
  const projects = useProjects();

  const toggleExpand = (jobId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
  };

  const handleClear = async (jobId: Id<'fileUploadQueue'>) => {
    try {
      await deleteJob({ jobId });
    } catch (error) {
      console.error('Error clearing job:', error);
      alert('Failed to clear item. Please try again.');
    }
  };

  const handleQuickFix = async (jobId: Id<'fileUploadQueue'>, documentId?: Id<'documents'>) => {
    if (!documentId) {
      alert('Document not found. Please use "View Full Summary" to file this document.');
      return;
    }

    const clientId = quickFixClientId[jobId];
    const projectId = quickFixProjectId[jobId];

    try {
      // Get client and project names from queried data
      const clientName = clientId ? clients?.find(c => c._id === clientId)?.name : undefined;
      const projectName = projectId ? projects?.find(p => p._id === projectId)?.name : undefined;

      await updateDocument({
        id: documentId,
        clientId: clientId || null,
        clientName: clientName || undefined,
        projectId: projectId || null,
        projectName: projectName || undefined,
      });

      // Clear the quick fix state
      setQuickFixClientId(prev => {
        const newState = { ...prev };
        delete newState[jobId];
        return newState;
      });
      setQuickFixProjectId(prev => {
        const newState = { ...prev };
        delete newState[jobId];
        return newState;
      });

      // Collapse the item
      setExpandedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });

      // Mark as read
      await markAsRead({ jobId });
    } catch (error) {
      console.error('Error updating document:', error);
      alert('Failed to update document. Please try again.');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <Panel
      title="Recently Analyzed"
      accent={colors.accent.blue}
      actions={
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>
          {allCompletedJobs.length} {allCompletedJobs.length === 1 ? 'File' : 'Files'}
          {totalCompletedCount > MAX_RECENT_FILES && (
            <span style={{ marginLeft: 4, color: colors.text.dim }}>(Recent)</span>
          )}
        </span>
      }
    >
      <div className="flex flex-col">
        <div className="flex-1 overflow-y-auto">
          {allCompletedJobs.length === 0 ? (
            <EmptyState
              icon={<FileText size={28} />}
              title="No files analyzed yet"
              body={`Upload files to see them here after analysis. Showing up to ${MAX_RECENT_FILES} most recent files.`}
            />
          ) : (
            <div className="space-y-3">
              {completedJobs.map((job) => {
                const isExpanded = expandedItems.has(job._id);
                const analysisResult = job.analysisResult as any;
                const needsReview = job.status === 'needs_confirmation';
                const document = job.documentId ? documentsMap.get(job.documentId) : null;

                return (
                  <div
                    key={job._id}
                    style={{
                      border: `1px solid ${needsReview ? `${colors.accent.yellow}40` : colors.border.default}`,
                      borderRadius: 4,
                      background: needsReview ? `${colors.accent.yellow}15` : colors.bg.card,
                    }}
                  >
                    {/* Main row - always visible */}
                    <div style={{ padding: 14 }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <button
                              onClick={() => toggleExpand(job._id)}
                              style={{ color: colors.text.muted, background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex' }}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                            <FileText className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.muted }} />
                            <p className="truncate" style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                              {job.fileName}
                            </p>
                            {needsReview && (
                              <StatusPill label="Needs Review" tone={colors.accent.yellow} />
                            )}
                            {!needsReview && (
                              <StatusPill label="Filed" tone={colors.accent.green} />
                            )}
                          </div>
                          <div className="flex items-center gap-3" style={{ fontSize: 11, color: colors.text.muted, marginLeft: 24 }}>
                            {analysisResult?.fileTypeDetected && (
                              <span className="flex items-center gap-1">
                                <span style={{ fontWeight: 500 }}>Type:</span>
                                {analysisResult.fileTypeDetected}
                              </span>
                            )}
                            {analysisResult?.category && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <span style={{ fontWeight: 500 }}>Category:</span>
                                  {analysisResult.category}
                                </span>
                              </>
                            )}
                            {document?.clientName && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  {document.clientName}
                                </span>
                              </>
                            )}
                            {document?.projectName && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <FolderKanban className="w-3 h-3" />
                                  {document.projectName}
                                </span>
                              </>
                            )}
                            {(() => {
                              const userId = document?.uploadedBy || (job.userId ? (job.userId as Id<'users'>) : undefined);
                              if (!userId) return null;
                              const user = usersMap.get(userId);
                              const displayName = user?.name || user?.email || (job.userId ? 'Loading...' : 'Unknown');
                              return (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <span style={{ fontWeight: 500 }}>Uploaded by:</span>
                                    {displayName}
                                  </span>
                                </>
                              );
                            })()}
                            <span>•</span>
                            <span>{formatFileSize(job.fileSize)}</span>
                            <span>•</span>
                            <span>{formatDate(job.updatedAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {job.documentId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRefileModalOpen(job._id)}
                            >
                              <RefreshCw className="w-3 h-3" />
                              Refile
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/uploads/${job._id}`)}
                          >
                            <Eye className="w-3 h-3" />
                            View Summary
                          </Button>
                          <IconButton label="Clear" onClick={() => handleClear(job._id)}>
                            <X className="w-4 h-4" />
                          </IconButton>
                        </div>
                      </div>
                    </div>

                    {/* Expanded content - quick fix UI */}
                    {isExpanded && needsReview && (
                      <div style={{ borderTop: `1px solid ${colors.accent.yellow}40`, background: `${colors.accent.yellow}15`, padding: 14 }} className="space-y-4">
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 500, color: colors.text.secondary, marginBottom: 8 }}>
                            What needs review:
                          </p>
                          <div className="space-y-2" style={{ fontSize: 11, color: colors.text.muted }}>
                            {!analysisResult?.clientId && !document?.clientId && (
                              <div className="flex items-center gap-2">
                                <AlertCircle className="w-3 h-3" style={{ color: colors.accent.yellow }} />
                                <span>Client not identified</span>
                              </div>
                            )}
                            {analysisResult?.suggestedClientName && (
                              <div className="flex items-center gap-2">
                                <AlertCircle className="w-3 h-3" style={{ color: colors.accent.yellow }} />
                                <span>Suggested client: {analysisResult.suggestedClientName}</span>
                              </div>
                            )}
                            {analysisResult?.suggestedProjectName && !analysisResult?.projectId && (
                              <div className="flex items-center gap-2">
                                <AlertCircle className="w-3 h-3" style={{ color: colors.accent.yellow }} />
                                <span>Suggested project: {analysisResult.suggestedProjectName}</span>
                              </div>
                            )}
                            {analysisResult?.confidence !== undefined && analysisResult.confidence < 0.9 && (
                              <div className="flex items-center gap-2">
                                <AlertCircle className="w-3 h-3" style={{ color: colors.accent.yellow }} />
                                <span>Low confidence: {Math.round(analysisResult.confidence * 100)}%</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {job.documentId && (
                          <div className="space-y-3">
                            <p style={{ fontSize: 11, fontWeight: 500, color: colors.text.secondary }}>
                              Quick Fix:
                            </p>
                            <ClientProjectSearch
                              selectedClientId={quickFixClientId[job._id] || document?.clientId}
                              selectedProjectId={quickFixProjectId[job._id] || document?.projectId}
                              onClientSelect={(clientId) => {
                                setQuickFixClientId(prev => ({
                                  ...prev,
                                  [job._id]: clientId,
                                }));
                              }}
                              onProjectSelect={(projectId) => {
                                setQuickFixProjectId(prev => ({
                                  ...prev,
                                  [job._id]: projectId,
                                }));
                              }}
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              accent={colors.accent.blue}
                              onClick={() => handleQuickFix(job._id, job.documentId)}
                            >
                              File Document
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Pagination */}
        {allCompletedJobs.length > FILES_PER_PAGE && (
          <div className="space-y-2" style={{ paddingTop: 14, marginTop: 14, borderTop: `1px solid ${colors.border.default}` }}>
            <div className="flex items-center justify-between">
              <div style={{ fontSize: 11, color: colors.text.muted }}>
                Showing {startIndex + 1}-{Math.min(endIndex, allCompletedJobs.length)} of {allCompletedJobs.length}
                {totalCompletedCount > MAX_RECENT_FILES && (
                  <span style={{ marginLeft: 4, color: colors.text.dim }}>
                    (showing {MAX_RECENT_FILES} most recent)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span style={{ fontSize: 11, color: colors.text.muted }}>
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
            {totalCompletedCount > MAX_RECENT_FILES && (
              <p style={{ fontSize: 11, color: colors.text.muted, textAlign: 'center' }}>
                View older files in the <Link href="/docs" style={{ color: colors.accent.blue, textDecoration: 'none' }}>Document Library</Link>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Refile Modals */}
      {completedJobs.map((job) => {
        if (job.documentId && refileModalOpen === job._id) {
          const document = documentsMap.get(job.documentId);
          if (!document) return null;

          return (
            <RefileModal
              key={`refile-${job._id}`}
              documentId={job.documentId}
              currentClientId={document.clientId || undefined}
              currentProjectId={document.projectId || undefined}
              currentFileType={document.fileTypeDetected}
              currentCategory={document.category}
              isOpen={refileModalOpen === job._id}
              onClose={() => setRefileModalOpen(null)}
              onRefiled={() => {
                setRefileModalOpen(null);
              }}
            />
          );
        }
        return null;
      })}
    </Panel>
  );
}

