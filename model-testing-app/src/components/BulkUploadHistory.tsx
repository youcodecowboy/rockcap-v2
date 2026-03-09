'use client';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Clock, CheckCircle2, AlertCircle, ArrowRight, FileText, ListOrdered } from 'lucide-react';

type BatchStatus = 'queued' | 'uploading' | 'processing' | 'review' | 'completed' | 'partial';

function StatusBadge({ status }: { status: BatchStatus }) {
  switch (status) {
    case 'queued':
      return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50"><ListOrdered className="w-3 h-3 mr-1" />Queued</Badge>;
    case 'uploading':
      return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Uploading</Badge>;
    case 'processing':
      return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
    case 'review':
      return <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50"><Clock className="w-3 h-3 mr-1" />In Review</Badge>;
    case 'completed':
      return <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
    case 'partial':
      return <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50"><AlertCircle className="w-3 h-3 mr-1" />Partial</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function relativeDate(isoString: string) {
  try {
    return formatDistanceToNow(new Date(isoString), { addSuffix: true });
  } catch {
    return isoString;
  }
}

export default function BulkUploadHistory() {
  const router = useRouter();

  const currentUser = useQuery(api.users.getCurrent, {});

  const batches = useQuery(
    api.bulkUpload.getRecentBatches,
    currentUser?._id ? { userId: currentUser._id, limit: 25 } : 'skip'
  );

  if (!batches) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading history...
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <FileText className="w-10 h-10 opacity-30" />
        <p className="text-sm">No upload batches yet</p>
        <p className="text-xs">Start an upload to see your history here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(batches as any[]).map((batch) => {
        const batchName =
          batch.clientName ||
          batch.internalFolderName ||
          batch.personalFolderName ||
          'Upload batch';

        const projectLabel = batch.projectName ? ` → ${batch.projectName}` : '';
        const isActive = batch.status === 'processing' || batch.status === 'uploading';
        const progress = batch.totalFiles > 0
          ? Math.round(((batch.processedFiles || 0) / batch.totalFiles) * 100)
          : 0;

        return (
          <div
            key={batch._id}
            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors gap-4"
          >
            {/* Status + Name */}
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="pt-0.5 flex-shrink-0">
                <StatusBadge status={batch.status as BatchStatus} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {batchName}{projectLabel}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                  <span>{batch.totalFiles} files</span>
                  {(batch.processedFiles ?? 0) > 0 && (
                    <span>· {batch.processedFiles} processed</span>
                  )}
                  {(batch.errorFiles ?? 0) > 0 && (
                    <span className="text-red-500">· {batch.errorFiles} errors</span>
                  )}
                  {batch.status === 'queued' && batch.queuePosition && (
                    <span className="text-amber-600">· Position {batch.queuePosition} in queue</span>
                  )}
                  <span>· {relativeDate(batch.createdAt)}</span>
                </div>
                {/* Progress bar for active batches */}
                {isActive && batch.totalFiles > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={progress} className="h-1.5 flex-1 max-w-[200px]" />
                    <span className="text-xs text-muted-foreground">{progress}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action */}
            {(batch.status === 'review' || batch.status === 'processing' || batch.status === 'partial') && (
              <Button
                variant="outline"
                size="sm"
                className="flex-shrink-0"
                onClick={() => router.push(`/docs/bulk/${batch._id}`)}
              >
                Review
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
