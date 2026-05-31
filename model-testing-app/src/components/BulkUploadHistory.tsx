'use client';

import { useState } from 'react';
import { useQuery, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Button, StatusPill, EmptyState, SkeletonText } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';
import { Loader2, ArrowRight, FileText, RefreshCw } from 'lucide-react';

type BatchStatus = 'queued' | 'uploading' | 'processing' | 'review' | 'completed' | 'partial';

function statusTone(status: BatchStatus, colors: ColorPalette): string {
  switch (status) {
    case 'queued': return colors.accent.yellow;
    case 'uploading': return colors.accent.blue;
    case 'processing': return colors.accent.blue;
    case 'review': return colors.accent.orange;
    case 'completed': return colors.accent.green;
    case 'partial': return colors.accent.yellow;
    default: return colors.text.muted;
  }
}

function statusLabel(status: BatchStatus): string {
  switch (status) {
    case 'queued': return 'Queued';
    case 'uploading': return 'Uploading';
    case 'processing': return 'Processing';
    case 'review': return 'In Review';
    case 'completed': return 'Completed';
    case 'partial': return 'Partial';
    default: return status;
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
  const colors = useColors();
  const router = useRouter();
  const [retryingQueue, setRetryingQueue] = useState(false);
  const retryQueue = useAction(api.bulkUpload.checkAndStartNextQueued);

  const currentUser = useQuery(api.users.getCurrent, {});

  const batches = useQuery(
    api.bulkUpload.getRecentBatches,
    currentUser?._id ? { userId: currentUser._id, limit: 25 } : 'skip'
  );

  if (!batches) {
    return <SkeletonText lines={4} />;
  }

  if (batches.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={28} />}
        title="No upload batches yet"
        body="Start an upload to see your history here."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: 12,
              borderRadius: 4,
              border: `1px solid ${colors.border.default}`,
              background: colors.bg.card,
            }}
          >
            {/* Status + Name */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{ paddingTop: 2, flexShrink: 0 }}>
                <StatusPill label={statusLabel(batch.status as BatchStatus)} tone={statusTone(batch.status as BatchStatus, colors)} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }} className="truncate">
                  {batchName}{projectLabel}
                </div>
                <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>{batch.totalFiles} files</span>
                  {(batch.processedFiles ?? 0) > 0 && (
                    <span>· {batch.processedFiles} processed</span>
                  )}
                  {(batch.errorFiles ?? 0) > 0 && (
                    <span style={{ color: colors.accent.red }}>· {batch.errorFiles} errors</span>
                  )}
                  {batch.status === 'queued' && batch.queuePosition && (
                    <span style={{ color: colors.accent.yellow }}>· Position {batch.queuePosition} in queue</span>
                  )}
                  <span>· {relativeDate(batch.createdAt)}</span>
                </div>
                {/* Progress bar for active batches */}
                {isActive && batch.totalFiles > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, maxWidth: 200, height: 6, borderRadius: 3, background: colors.bg.cardAlt, overflow: 'hidden' }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: colors.accent.blue, transition: 'width 200ms linear' }} />
                    </div>
                    <span style={{ fontSize: 11, color: colors.text.muted }}>{progress}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action */}
            {batch.status === 'queued' && currentUser?._id && (
              <Button
                variant="secondary"
                size="sm"
                style={{ flexShrink: 0 }}
                disabled={retryingQueue}
                onClick={async () => {
                  setRetryingQueue(true);
                  try {
                    await retryQueue({
                      userId: currentUser._id,
                      baseUrl: window.location.origin,
                    });
                  } finally {
                    setRetryingQueue(false);
                  }
                }}
              >
                {retryingQueue ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Retry
              </Button>
            )}
            {(batch.status === 'review' || batch.status === 'processing' || batch.status === 'partial' || batch.status === 'completed') && (
              <Button
                variant="secondary"
                size="sm"
                style={{ flexShrink: 0 }}
                onClick={() => router.push(`/docs/bulk/${batch._id}`)}
              >
                {batch.status === 'completed' ? 'View' : 'Review'}
                <ArrowRight className="w-3 h-3" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
