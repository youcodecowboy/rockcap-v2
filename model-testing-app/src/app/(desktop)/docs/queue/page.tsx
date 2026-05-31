'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Button, TabStrip, SkeletonCard } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { ArrowLeft, Clock } from 'lucide-react';
import Link from 'next/link';
import StandardQueueView from './components/StandardQueueView';
import BulkBatchList from './components/BulkBatchList';

export default function DocumentQueuePage() {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<'standard' | 'bulk'>('standard');

  // Get current user
  const currentUser = useQuery(api.users.getCurrent);

  // Get queue counts for badges
  const standardQueue = useQuery(api.fileQueue.getReviewQueueWithNav);
  const pendingBatches = useQuery(
    api.bulkUpload.getPendingBatches,
    currentUser?._id ? { userId: currentUser._id } : "skip"
  );

  const standardCount = standardQueue?.total || 0;
  const bulkCount = pendingBatches?.length || 0;

  return (
    <div className="flex flex-col h-screen" style={{ background: colors.bg.light }}>
      {/* Header */}
      <header
        style={{ background: colors.bg.card, borderBottom: `1px solid ${colors.border.default}`, padding: '16px 24px' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/docs">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
                Back to Library
              </Button>
            </Link>
            <div style={{ height: 24, width: 1, background: colors.border.default }} />
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 600, color: colors.text.primary }}>Document Queue</h1>
              <p style={{ fontSize: 12, color: colors.text.muted }}>Review and file uploaded documents</p>
            </div>
          </div>

          <div className="flex items-center gap-2" style={{ fontSize: 12, color: colors.text.muted }}>
            <Clock className="w-4 h-4" />
            <span>{standardCount + bulkCount} items need attention</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <TabStrip
        entityType="dashboard"
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as 'standard' | 'bulk')}
        tabs={[
          { id: 'standard', label: 'Standard Upload', count: standardCount },
          { id: 'bulk', label: 'Bulk Upload', count: bulkCount },
        ]}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'standard' && <StandardQueueView />}
        {activeTab === 'bulk' && (
          currentUser?._id ? (
            <BulkBatchList userId={currentUser._id} />
          ) : (
            <div className="flex-1 flex items-center justify-center" style={{ padding: 24 }}>
              <div style={{ width: 360 }}>
                <SkeletonCard lines={4} />
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
