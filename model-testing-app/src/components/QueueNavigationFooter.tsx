'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';

interface QueueNavigationFooterProps {
  currentJobId: Id<"fileUploadQueue">;
}

export default function QueueNavigationFooter({ currentJobId }: QueueNavigationFooterProps) {
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
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 transition-all duration-300 ease-in-out">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevious}
              disabled={!hasPrevious || isNavigating}
              className="flex items-center gap-2 transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
              Previous
            </Button>
            <span className={`text-sm text-gray-600 min-w-[100px] text-center transition-all duration-300 ${
              isNavigating ? 'opacity-50' : 'opacity-100'
            }`}>
              File {currentPosition} of {totalFiles}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={!hasNext || isNavigating}
              className="flex items-center gap-2 transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4 transition-transform duration-200" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {relevantJobs.map((job, index) => (
              <button
                key={job._id}
                onClick={() => handleDotClick(job._id)}
                disabled={isNavigating}
                className={`rounded-full transition-all duration-300 ease-in-out ${
                  index === currentIndex
                    ? 'bg-blue-600 w-8 h-2'
                    : 'bg-gray-300 hover:bg-gray-400 w-2 h-2'
                } ${isNavigating ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                title={job.fileName}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

