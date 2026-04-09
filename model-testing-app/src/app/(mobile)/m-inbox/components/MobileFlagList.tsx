'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { ENTITY_TYPE_SHORT } from '@/components/threads/utils';
import MobileFlagDetail from './MobileFlagDetail';

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function MobileFlagList() {
  const [showResolved, setShowResolved] = useState(false);
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);

  const flags = useQuery(api.flags.getMyFlags, {
    status: showResolved ? 'resolved' : 'open',
  });

  if (selectedFlagId) {
    return <MobileFlagDetail flagId={selectedFlagId} onBack={() => setSelectedFlagId(null)} />;
  }

  return (
    <div>
      <div className="flex gap-2 px-[var(--m-page-px)] py-2 bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
        <button
          onClick={() => setShowResolved(false)}
          className={`px-3 py-1 rounded-full text-[11px] font-medium ${
            !showResolved
              ? 'bg-[var(--m-accent)] text-white'
              : 'bg-[var(--m-bg)] text-[var(--m-text-secondary)] border border-[var(--m-border)]'
          }`}
        >
          Open
        </button>
        <button
          onClick={() => setShowResolved(true)}
          className={`px-3 py-1 rounded-full text-[11px] font-medium ${
            showResolved
              ? 'bg-[var(--m-accent)] text-white'
              : 'bg-[var(--m-bg)] text-[var(--m-text-secondary)] border border-[var(--m-border)]'
          }`}
        >
          Resolved
        </button>
      </div>

      {!flags || flags.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[13px] text-[var(--m-text-tertiary)]">
            No {showResolved ? 'resolved' : 'open'} flags
          </p>
        </div>
      ) : (
        flags.map((flag: any) => (
          <button
            key={flag._id}
            onClick={() => setSelectedFlagId(flag._id)}
            className={`w-full flex items-start gap-3 px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)] text-left ${
              flag.priority === 'urgent' ? 'border-l-2 border-l-[var(--m-error)]' : ''
            }`}
          >
            <Flag
              className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                flag.priority === 'urgent' ? 'text-[var(--m-error)]' : 'text-orange-500'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {flag.entityType && (
                  <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-medium bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)] uppercase tracking-wide">
                    {ENTITY_TYPE_SHORT[flag.entityType] || flag.entityType}
                  </span>
                )}
                <span className="text-[11px] text-[var(--m-text-tertiary)]">
                  {formatTime(flag.createdAt)}
                </span>
              </div>
              <p className="text-[13px] text-[var(--m-text-primary)] mt-0.5 line-clamp-2">
                {flag.note}
              </p>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
