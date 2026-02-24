'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Folder,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileStack,
  ChevronRight,
  Building2,
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkBatchListProps {
  userId: string;
}

export default function BulkBatchList({ userId }: BulkBatchListProps) {
  const router = useRouter();
  
  // Query for pending batches
  const pendingBatches = useQuery(
    api.bulkUpload.getPendingBatches,
    userId ? { userId: userId as any } : "skip"
  );
  
  // Query for recent batches
  const recentBatches = useQuery(
    api.bulkUpload.getRecentBatches,
    userId ? { userId: userId as any, limit: 10 } : "skip"
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'uploading':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Uploading
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      case 'review':
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            <AlertCircle className="w-3 h-3 mr-1" />
            Needs Review
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {status}
          </Badge>
        );
    }
  };

  const handleBatchClick = (batchId: string) => {
    router.push(`/docs/bulk/${batchId}`);
  };

  // Loading state
  if (!pendingBatches || !recentBatches) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Empty state
  if (pendingBatches.length === 0 && recentBatches.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <FileStack className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          No bulk uploads yet
        </h3>
        <p className="text-gray-500 max-w-md mb-4">
          Use the Bulk Upload feature in the Filing Agent to upload multiple documents at once.
        </p>
        <Button
          variant="outline"
          onClick={() => router.push('/filing')}
        >
          Go to Bulk Upload
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Pending Batches */}
      {pendingBatches.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            Needs Attention ({pendingBatches.length})
          </h3>
          <div className="space-y-3">
            {pendingBatches.map((batch) => (
              <div
                key={batch._id}
                onClick={() => handleBatchClick(batch._id)}
                className="bg-white border border-amber-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-gray-900">{batch.clientName}</span>
                      {batch.projectName && (
                        <>
                          <ChevronRight className="w-3 h-3 text-gray-400" />
                          <Briefcase className="w-4 h-4 text-purple-500" />
                          <span className="text-gray-700">{batch.projectName}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Folder className="w-4 h-4" />
                        {batch.processedFiles} / {batch.totalFiles} files
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatDate(batch.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(batch.status)}
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Batches */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Recent Batches
        </h3>
        <div className="space-y-2">
          {recentBatches
            .filter(b => !pendingBatches.find(p => p._id === b._id))
            .map((batch) => (
              <div
                key={batch._id}
                onClick={() => handleBatchClick(batch._id)}
                className="bg-white border rounded-lg p-4 hover:shadow-sm transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-gray-900">{batch.clientName}</span>
                      {batch.projectName && (
                        <>
                          <ChevronRight className="w-3 h-3 text-gray-400" />
                          <span className="text-gray-600 text-sm">{batch.projectName}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{batch.filedFiles} / {batch.totalFiles} filed</span>
                      <span>{formatDate(batch.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(batch.status)}
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
