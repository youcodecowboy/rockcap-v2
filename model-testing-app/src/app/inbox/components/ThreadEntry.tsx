'use client';

import { RefreshCw, ArrowRight, Activity } from 'lucide-react';

interface ThreadEntryProps {
  entryType: 'message' | 'activity';
  userName: string | null;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getInitial(name: string | null): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

function getActivityIcon(content: string) {
  const lower = content.toLowerCase();
  if (lower.includes('reopen')) return <RefreshCw className="h-3.5 w-3.5 text-gray-400" />;
  if (lower.includes('resolve')) return <ArrowRight className="h-3.5 w-3.5 text-gray-400" />;
  return <Activity className="h-3.5 w-3.5 text-gray-400" />;
}

export default function ThreadEntry({ entryType, userName, content, createdAt }: ThreadEntryProps) {
  if (entryType === 'activity') {
    return (
      <div className="flex items-center gap-3 py-2.5 px-4">
        <div className="flex items-center justify-center w-6 h-6">
          {getActivityIcon(content)}
        </div>
        <div className="flex-1 min-w-0 border-l border-dashed border-gray-200 pl-3">
          <p className="text-xs text-gray-400">
            {userName && <span className="text-gray-500">{userName}</span>}
            {userName && ' \u00b7 '}
            {content}
            <span className="ml-2 text-gray-300">{relativeTime(createdAt)}</span>
          </p>
        </div>
      </div>
    );
  }

  // Message variant
  return (
    <div className="flex items-start gap-3 py-3 px-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-800 text-white flex items-center justify-center text-xs font-medium">
        {getInitial(userName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-900">
            {userName || 'Unknown'}
          </span>
          <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
            {relativeTime(createdAt)}
          </span>
        </div>
        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
