'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/layouts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useColors } from '@/lib/useColors';

interface QueueNavigationFooterProps {
  currentJobId: Id<"fileUploadQueue">;
}

export default function QueueNavigationFooter({ currentJobId }: QueueNavigationFooterProps) {
  const colors = useColors();
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [prevPosition, setPrevPosition] = useState<number>(0);

  // Get all recent jobs (completed and needs_confirmation)
  const allJobs = useQuery(api.fileQueue.getRecentJobs, { includeRead: true });
  const relevantJobs = allJobs?.filter(
    job => job.status === 'completed' || job.status === 'needs_confirmation'
  ) || [];

  const currentIndex = relevantJobs.findIndex(job => job._id === currentJobId);
  const currentPosition = currentIndex + 1;
  const totalFiles = relevantJobs.length;

  // Track position changes for smooth transitions
  useEffect(() => {
    if (currentPosition !== prevPosition && prevPosition > 0) {
      setIsNavigating(true);
      const timer = setTimeout(() => setIsNavigating(false), 300);
      return () => clearTimeout(timer);
    }
    setPrevPosition(currentPosition);
  }, [currentPosition, prevPosition]);

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < relevantJobs.length - 1;

  const handlePrevious = () => {
    if (hasPrevious && relevantJobs[currentIndex - 1] && !isNavigating) {
      setIsNavigating(true);
      router.push(`/uploads/${relevantJobs[currentIndex - 1]._id}`);
    }
  };

  const handleNext = () => {
    if (hasNext && relevantJobs[currentIndex + 1] && !isNavigating) {
      setIsNavigating(true);
      router.push(`/uploads/${relevantJobs[currentIndex + 1]._id}`);
    }
  };

  const handleDotClick = (jobId: Id<"fileUploadQueue">) => {
    if (!isNavigating && jobId !== currentJobId) {
      setIsNavigating(true);
      router.push(`/uploads/${jobId}`);
    }
  };

  if (totalFiles <= 1) {
    return null; // Don't show navigation if only one file
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: colors.bg.card,
        borderTop: `1px solid ${colors.border.default}`,
        transition: 'all 300ms ease-in-out',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrevious}
              disabled={!hasPrevious || isNavigating}
            >
              <ChevronLeft size={14} />
              Previous
            </Button>
            <span
              className="min-w-[100px] text-center"
              style={{
                fontSize: 12,
                color: colors.text.secondary,
                opacity: isNavigating ? 0.5 : 1,
                transition: 'opacity 300ms linear',
              }}
            >
              File {currentPosition} of {totalFiles}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleNext}
              disabled={!hasNext || isNavigating}
            >
              Next
              <ChevronRight size={14} />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {relevantJobs.map((job, index) => {
              const active = index === currentIndex;
              return (
                <button
                  key={job._id}
                  onClick={() => handleDotClick(job._id)}
                  disabled={isNavigating}
                  style={{
                    borderRadius: 9999,
                    border: 'none',
                    height: 8,
                    width: active ? 32 : 8,
                    background: active ? colors.accent.blue : colors.border.mid,
                    opacity: isNavigating ? 0.5 : 1,
                    cursor: isNavigating ? 'wait' : 'pointer',
                    transition: 'all 300ms ease-in-out',
                  }}
                  title={job.fileName}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
