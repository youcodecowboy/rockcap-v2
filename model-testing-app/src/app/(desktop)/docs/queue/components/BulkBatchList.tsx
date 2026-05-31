'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { DataTable, StatusPill, EmptyState, Button, SkeletonTable } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  Clock,
  Loader2,
  FileStack,
  ChevronRight,
  Building2,
} from 'lucide-react';

interface BulkBatchListProps {
  userId: string;
}

export default function BulkBatchList({ userId }: BulkBatchListProps) {
  const colors = useColors();
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

  const statusTone = (status: string) => {
    switch (status) {
      case 'uploading':
        return colors.accent.blue;
      case 'processing':
        return colors.accent.purple;
      case 'review':
        return colors.accent.orange;
      case 'completed':
        return colors.accent.green;
      default:
        return colors.text.muted;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'uploading':
        return 'Uploading';
      case 'processing':
        return 'Processing';
      case 'review':
        return 'Needs Review';
      case 'completed':
        return 'Completed';
      default:
        return status;
    }
  };

  const handleBatchClick = (batchId: string) => {
    router.push(`/docs/bulk/${batchId}`);
  };

  const renderClientCell = (batch: any) => (
    <div className="flex items-center gap-2">
      <Building2 className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.blue }} />
      <span style={{ fontWeight: 500, color: colors.text.primary }}>{batch.clientName}</span>
      {batch.projectName && (
        <>
          <ChevronRight className="w-3 h-3" style={{ color: colors.text.dim }} />
          <span style={{ color: colors.text.muted }}>{batch.projectName}</span>
        </>
      )}
    </div>
  );

  // Loading state
  if (!pendingBatches || !recentBatches) {
    return (
      <div className="flex-1 overflow-auto" style={{ padding: 24 }}>
        <SkeletonTable rows={6} cols={4} />
      </div>
    );
  }

  // Empty state
  if (pendingBatches.length === 0 && recentBatches.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ padding: 32 }}>
        <EmptyState
          icon={<FileStack className="w-8 h-8" />}
          title="No bulk uploads yet"
          body="Use the Bulk Upload feature in the Filing Agent to upload multiple documents at once."
          action={
            <Button variant="primary" onClick={() => router.push('/filing')}>
              Go to Bulk Upload
            </Button>
          }
        />
      </div>
    );
  }

  const recentRows = recentBatches.filter(b => !pendingBatches.find(p => p._id === b._id));

  return (
    <div className="flex-1 overflow-auto" style={{ padding: 24 }}>
      {/* Pending Batches */}
      {pendingBatches.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3
            className="flex items-center gap-2"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 9,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.text.muted,
              fontWeight: 500,
              marginBottom: 12,
            }}
          >
            Needs Attention ({pendingBatches.length})
          </h3>
          <DataTable
            rows={pendingBatches}
            getRowKey={(b) => b._id}
            onRowClick={(b) => handleBatchClick(b._id)}
            columns={[
              { key: 'client', header: 'Client', render: renderClientCell },
              {
                key: 'files',
                header: 'Files',
                mono: true,
                width: 120,
                render: (b) => `${b.processedFiles} / ${b.totalFiles}`,
              },
              {
                key: 'created',
                header: 'Created',
                mono: true,
                align: 'right',
                width: 180,
                render: (b) => formatDate(b.createdAt),
              },
              {
                key: 'status',
                header: 'Status',
                align: 'right',
                width: 140,
                render: (b) => <StatusPill label={statusLabel(b.status)} tone={statusTone(b.status)} />,
              },
            ]}
          />
        </div>
      )}

      {/* Recent Batches */}
      <div>
        <h3
          className="flex items-center gap-2"
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 9,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: colors.text.muted,
            fontWeight: 500,
            marginBottom: 12,
          }}
        >
          <Clock className="w-3.5 h-3.5" />
          Recent Batches
        </h3>
        <DataTable
          rows={recentRows}
          getRowKey={(b) => b._id}
          onRowClick={(b) => handleBatchClick(b._id)}
          empty={<EmptyState icon={<Clock className="w-6 h-6" />} title="No recent batches" />}
          columns={[
            { key: 'client', header: 'Client', render: renderClientCell },
            {
              key: 'filed',
              header: 'Filed',
              mono: true,
              width: 120,
              render: (b) => `${b.filedFiles} / ${b.totalFiles}`,
            },
            {
              key: 'created',
              header: 'Created',
              mono: true,
              align: 'right',
              width: 180,
              render: (b) => formatDate(b.createdAt),
            },
            {
              key: 'status',
              header: 'Status',
              align: 'right',
              width: 140,
              render: (b) => <StatusPill label={statusLabel(b.status)} tone={statusTone(b.status)} />,
            },
          ]}
        />
      </div>
    </div>
  );
}
