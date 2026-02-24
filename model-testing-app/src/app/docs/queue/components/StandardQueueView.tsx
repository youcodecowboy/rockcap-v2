'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeft, 
  ChevronRight, 
  SkipForward,
  Save,
  Loader2,
  FileCheck,
  Inbox,
} from 'lucide-react';
import DocumentReviewCard from './DocumentReviewCard';
import { cn } from '@/lib/utils';

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

  // Empty state
  if (!queueData) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <FileCheck className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          All caught up!
        </h3>
        <p className="text-gray-500 max-w-md">
          No documents need review right now. Upload new documents or check back later.
        </p>
      </div>
    );
  }

  if (!currentJob) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">No document selected</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Navigation Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50">
        <Button
          variant="outline"
          size="sm"
          onClick={goToPrevious}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Previous
        </Button>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            Document <span className="font-semibold">{currentIndex + 1}</span> of <span className="font-semibold">{total}</span>
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={goToNext}
          disabled={currentIndex >= total - 1}
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-6">
        <DocumentReviewCard
          job={currentJob}
          filingData={filingData}
          onFilingDataChange={handleFilingDataChange}
        />
      </div>

      {/* Sticky Footer */}
      <div className="border-t bg-white px-6 py-4 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={handleSkip}
          disabled={isSkipping || isFiling}
        >
          {isSkipping ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <SkipForward className="w-4 h-4 mr-2" />
          )}
          Skip
        </Button>

        <div className="flex items-center gap-3">
          {!canFile && (
            <span className="text-sm text-amber-600">
              Select a client and folder to file
            </span>
          )}
          <Button
            onClick={handleFile}
            disabled={!canFile || isFiling || isSkipping}
            className={cn(
              "min-w-[140px]",
              canFile && "bg-green-600 hover:bg-green-700"
            )}
          >
            {isFiling ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            File Document
          </Button>
        </div>
      </div>
    </div>
  );
}
