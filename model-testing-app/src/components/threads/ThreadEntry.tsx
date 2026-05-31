'use client';

import { RefreshCw, ArrowRight, Activity } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { relativeTime, getInitial } from './utils';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface ThreadEntryProps {
  entryType: 'message' | 'activity';
  userName: string | null;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

function getActivityIcon(content: string, color: string) {
  const lower = content.toLowerCase();
  if (lower.includes('reopen')) return <RefreshCw className="h-3.5 w-3.5" style={{ color }} />;
  if (lower.includes('resolve')) return <ArrowRight className="h-3.5 w-3.5" style={{ color }} />;
  return <Activity className="h-3.5 w-3.5" style={{ color }} />;
}

export default function ThreadEntry({ entryType, userName, content, createdAt }: ThreadEntryProps) {
  const colors = useColors();

  if (entryType === 'activity') {
    return (
      <div className="flex items-center gap-3 py-2.5 px-4">
        <div className="flex items-center justify-center w-6 h-6">
          {getActivityIcon(content, colors.text.dim)}
        </div>
        <div
          className="flex-1 min-w-0 border-l border-dashed pl-3"
          style={{ borderColor: colors.border.default }}
        >
          <p className="text-xs" style={{ color: colors.text.muted }}>
            {userName && <span style={{ color: colors.text.secondary }}>{userName}</span>}
            {userName && ' · '}
            {content}
            <span
              className="ml-2"
              style={{ fontFamily: MONO, fontSize: 10, color: colors.text.dim }}
            >
              {relativeTime(createdAt)}
            </span>
          </p>
        </div>
      </div>
    );
  }

  // Message variant
  return (
    <div className="flex items-start gap-3 py-3 px-4">
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
        style={{ background: colors.text.primary, color: colors.bg.card }}
      >
        {getInitial(userName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium" style={{ color: colors.text.primary }}>
            {userName || 'Unknown'}
          </span>
          <span
            className="whitespace-nowrap flex-shrink-0"
            style={{ fontFamily: MONO, fontSize: 10, color: colors.text.dim }}
          >
            {relativeTime(createdAt)}
          </span>
        </div>
        <p
          className="text-sm mt-1 whitespace-pre-wrap"
          style={{ color: colors.text.secondary }}
        >
          {content}
        </p>
      </div>
    </div>
  );
}
