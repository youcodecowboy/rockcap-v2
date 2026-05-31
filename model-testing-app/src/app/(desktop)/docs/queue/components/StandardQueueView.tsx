'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Button, EmptyState, SkeletonCard } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Save,
  Loader2,
  FileCheck,
} from 'lucide-react';
import DocumentReviewCard from './DocumentReviewCard';

interface FilingData {
  clientId: Id<"clients"> | null;
  projectId: Id<"projects"> | null;
  folderId: string;
  folderType: 'client' | 'project';
  summary: string;
  category: string;
  fileTypeDetected: string;
  checklistItemIds: Id<"knowledgeChecklistItems">[];
}

export default function StandardQueueView() {
  const colors = useColors();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFiling, setIsFiling] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  // Query for all jobs needing review
  const queueData = useQuery(api.fileQueue.getReviewQueueWithNav);

  // Get current user for linking
  const currentUser = useQuery(api.users.getCurrent);

  // Mutations
  const fileDocument = useMutation(api.fileQueue.fileDocument);
  const skipDocument = useMutation(api.fileQueue.skipDocument);

  const jobs = queueData?.jobs || [];
  const total = queueData?.total || 0;
  const currentJob = jobs[currentIndex];

  // Initialize filing data from current job
  const [filingData, setFilingData] = useState<FilingData>({
    clientId: null,
    projectId: null,
    folderId: '',
    folderType: 'client',
    summary: '',
    category: '',
    fileTypeDetected: '',
    checklistItemIds: [],
  });

  // Update filing data when job changes
  useEffect(() => {
    if (currentJob?.analysisResult) {
      const analysis = currentJob.analysisResult;
      // Pre-select AI-suggested checklist items with confidence > 70%
      const suggestedIds = (analysis.suggestedChecklistItems || [])
        .filter((item: { confidence: number }) => item.confidence >= 0.7)
        .map((item: { itemId: string }) => item.itemId as Id<"knowledgeChecklistItems">);

      setFilingData({
        clientId: null, // User must select
        projectId: null,
        folderId: '',
        folderType: 'client',
        summary: analysis.summary || '',
        category: analysis.category || '',
        fileTypeDetected: analysis.fileTypeDetected || '',
        checklistItemIds: suggestedIds,
      });
    } else {
      setFilingData({
        clientId: null,
        projectId: null,
        folderId: '',
        folderType: 'client',
        summary: '',
        category: '',
        fileTypeDetected: '',
        checklistItemIds: [],
      });
    }
  }, [currentJob?._id]);

  // Navigation handlers
  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < total - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, total]);

  // Auto-advance after filing
  const advanceToNext = useCallback(() => {
    // If we're at the last item, stay there (list will refresh)
    // Otherwise, stay at current index (next item will slide into position)
    if (currentIndex >= total - 1) {
      setCurrentIndex(Math.max(0, currentIndex - 1));
    }
  }, [currentIndex, total]);

  // Handle filing
  const handleFile = async () => {
    if (!currentJob || !filingData.clientId || !filingData.folderId) return;

    setIsFiling(true);
    try {
      // Get extracted intelligence from analysis result if available
      const analysisResult = currentJob.analysisResult as any;
      const extractedIntelligence = analysisResult?.extractedIntelligence;

      await fileDocument({
        jobId: currentJob._id,
        clientId: filingData.clientId,
        projectId: filingData.projectId || undefined,
        folderId: filingData.folderId,
        folderType: filingData.folderType,
        summary: filingData.summary || undefined,
        category: filingData.category || undefined,
        fileTypeDetected: filingData.fileTypeDetected || undefined,
        // Knowledge Library checklist linking
        checklistItemIds: filingData.checklistItemIds.length > 0
          ? filingData.checklistItemIds
          : undefined,
        userId: currentUser?._id,
        // Pass pre-extracted intelligence (Sprint 4+)
        extractedIntelligence: extractedIntelligence ? {
          fields: extractedIntelligence.fields || [],
          insights: extractedIntelligence.insights,
        } : undefined,
      });
      advanceToNext();
    } catch (error) {
      console.error('Failed to file document:', error);
      alert('Failed to file document. Please try again.');
    } finally {
      setIsFiling(false);
    }
  };

  // Handle skip
  const handleSkip = async () => {
    if (!currentJob) return;

    setIsSkipping(true);
    try {
      await skipDocument({ jobId: currentJob._id });
      advanceToNext();
    } catch (error) {
      console.error('Failed to skip document:', error);
      alert('Failed to skip document. Please try again.');
    } finally {
      setIsSkipping(false);
    }
  };

  // Handle filing data changes
  const handleFilingDataChange = (updates: Partial<FilingData>) => {
    setFilingData(prev => ({ ...prev, ...updates }));
  };

  // Check if can file
  const canFile = filingData.clientId && filingData.folderId;

  // Loading state
  if (!queueData) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ padding: 24 }}>
        <div style={{ width: 360 }}>
          <SkeletonCard lines={4} />
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ padding: 32 }}>
        <EmptyState
          icon={<FileCheck className="w-8 h-8" />}
          title="All caught up"
          body="No documents need review right now. Upload new documents or check back later."
        />
      </div>
    );
  }

  if (!currentJob) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ padding: 32 }}>
        <EmptyState title="No document selected" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Navigation Header */}
      <div
        className="flex items-center justify-between"
        style={{ padding: '12px 24px', borderBottom: `1px solid ${colors.border.default}`, background: colors.bg.light }}
      >
        <Button variant="secondary" size="sm" onClick={goToPrevious} disabled={currentIndex === 0}>
          <ChevronLeft className="w-4 h-4" />
          Previous
        </Button>

        <div className="flex items-center gap-2">
          <span style={{ fontSize: 12, color: colors.text.secondary }}>
            Document <span style={{ fontWeight: 600, color: colors.text.primary }}>{currentIndex + 1}</span> of{' '}
            <span style={{ fontWeight: 600, color: colors.text.primary }}>{total}</span>
          </span>
        </div>

        <Button variant="secondary" size="sm" onClick={goToNext} disabled={currentIndex >= total - 1}>
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden" style={{ padding: 24 }}>
        <DocumentReviewCard
          job={currentJob}
          filingData={filingData}
          onFilingDataChange={handleFilingDataChange}
        />
      </div>

      {/* Sticky Footer */}
      <div
        className="flex items-center justify-between"
        style={{ borderTop: `1px solid ${colors.border.default}`, background: colors.bg.card, padding: '16px 24px' }}
      >
        <Button variant="ghost" onClick={handleSkip} disabled={isSkipping || isFiling}>
          {isSkipping ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <SkipForward className="w-4 h-4" />
          )}
          Skip
        </Button>

        <div className="flex items-center gap-3">
          {!canFile && (
            <span style={{ fontSize: 12, color: colors.accent.orange }}>
              Select a client and folder to file
            </span>
          )}
          <Button
            variant="primary"
            accent={canFile ? colors.accent.green : undefined}
            onClick={handleFile}
            disabled={!canFile || isFiling || isSkipping}
            style={{ minWidth: 140, justifyContent: 'center' }}
          >
            {isFiling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            File Document
          </Button>
        </div>
      </div>
    </div>
  );
}
