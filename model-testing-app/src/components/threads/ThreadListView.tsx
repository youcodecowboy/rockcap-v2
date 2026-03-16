'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { relativeTime, getInitial, ENTITY_TYPE_SHORT } from './utils';

// ---------------------------------------------------------------------------
// Entity type chip color config
// ---------------------------------------------------------------------------
const ENTITY_CHIP_COLORS: Record<string, { bg: string; text: string }> = {
  document: { bg: 'bg-blue-50', text: 'text-blue-700' },
  project: { bg: 'bg-purple-50', text: 'text-purple-700' },
  client: { bg: 'bg-green-50', text: 'text-green-700' },
  task: { bg: 'bg-amber-50', text: 'text-amber-700' },
  meeting: { bg: 'bg-cyan-50', text: 'text-cyan-700' },
  checklist_item: { bg: 'bg-orange-50', text: 'text-orange-700' },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ThreadListViewProps {
  flags: any[];
  onSelect: (flagId: string) => void;
  showEntityBadge?: boolean;
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Single thread list item — does its own queries for entity context,
// participant names, and reply count (Convex deduplicates identical queries)
// ---------------------------------------------------------------------------
function ThreadListItem({
  flag,
  onSelect,
  showEntityBadge,
}: {
  flag: any;
  onSelect: (flagId: string) => void;
  showEntityBadge?: boolean;
}) {
  const typedFlagId = flag._id as Id<'flags'>;

  // Entity context for badge
  const entityContext = useQuery(
    api.flags.getEntityContext,
    showEntityBadge
      ? { entityType: flag.entityType as any, entityId: flag.entityId }
      : 'skip',
  );

  // Participant user IDs (creator + assignee, deduplicated)
  const participantIds = useMemo(() => {
    const ids = new Set<string>();
    ids.add(flag.createdBy);
    if (flag.assignedTo) ids.add(flag.assignedTo);
    return [...ids] as Id<'users'>[];
  }, [flag.createdBy, flag.assignedTo]);

  const users = useQuery(
    api.users.getByIds,
    participantIds.length > 0 ? { userIds: participantIds } : 'skip',
  );

  // Reply count
  const thread = useQuery(api.flags.getThread, { flagId: typedFlagId });
  const replyCount = thread ? thread.filter((e) => e.entryType === 'message').length : 0;

  // Derived values
  const isOpen = flag.status === 'open';
  const isUrgent = flag.priority === 'urgent';
  const firstLine = flag.note?.split('\n')[0] || '';
  const title = firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine;
  const preview = flag.note?.length > 60 ? flag.note.slice(0, 60) + '...' : flag.note;
  const chipColors = ENTITY_CHIP_COLORS[flag.entityType] || ENTITY_CHIP_COLORS.document;

  return (
    <button
      onClick={() => onSelect(flag._id)}
      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
    >
      {/* Left accent border */}
      <div
        className={`flex-shrink-0 w-0.5 self-stretch rounded-full ${
          isOpen ? 'bg-orange-400' : 'bg-transparent'
        }`}
      />

      {/* Status dot */}
      <div className="flex-shrink-0">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            isOpen ? 'bg-orange-400' : 'bg-green-400'
          }`}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Entity badge row */}
        {showEntityBadge && (
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold uppercase tracking-wide ${chipColors.bg} ${chipColors.text}`}
            >
              {ENTITY_TYPE_SHORT[flag.entityType] || flag.entityType}
            </span>
            {entityContext?.name && (
              <span className="text-[11px] text-gray-500 truncate">
                {entityContext.name}
              </span>
            )}
          </div>
        )}

        {/* Title + timestamp row */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-sm truncate ${
              isOpen ? 'font-semibold text-gray-900' : 'font-medium text-gray-400'
            }`}
          >
            {title}
          </span>
          <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
            {relativeTime(flag.createdAt)}
          </span>
        </div>

        {/* Preview + metadata row */}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-xs text-gray-400 truncate">{preview}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Participant avatars */}
            {users && users.length > 0 && (
              <div className="flex -space-x-1">
                {users.slice(0, 3).map((u) => (
                  <div
                    key={u._id}
                    className="w-4 h-4 rounded-full bg-gray-700 text-white flex items-center justify-center text-[8px] font-medium ring-1 ring-white"
                    title={u.name || u.email || undefined}
                  >
                    {getInitial(u.name || u.email)}
                  </div>
                ))}
              </div>
            )}

            {/* Reply count */}
            {replyCount > 0 && (
              <span className="text-[10px] text-gray-400">
                {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
              </span>
            )}

            {/* Status / priority badge */}
            {isUrgent ? (
              <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-semibold uppercase tracking-wide bg-red-50 text-red-600">
                Urgent
              </span>
            ) : (
              <span
                className={`inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-semibold uppercase tracking-wide ${
                  isOpen
                    ? 'bg-orange-50 text-orange-600'
                    : 'bg-green-50 text-green-600'
                }`}
              >
                {isOpen ? 'Open' : 'Resolved'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chevron */}
      <ChevronRight className="flex-shrink-0 h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// ThreadListView
// ---------------------------------------------------------------------------
export default function ThreadListView({
  flags,
  onSelect,
  showEntityBadge = false,
  compact = false,
}: ThreadListViewProps) {
  const [showResolved, setShowResolved] = useState(false);

  // Split into open and resolved
  const openFlags = useMemo(() => flags.filter((f) => f.status === 'open'), [flags]);
  const resolvedFlags = useMemo(() => flags.filter((f) => f.status === 'resolved'), [flags]);

  const visibleFlags = showResolved ? [...openFlags, ...resolvedFlags] : openFlags;

  // Empty state
  if (flags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <MessageSquare className="h-8 w-8 text-gray-300 mb-2" />
        <p className="text-sm text-gray-400">No threads yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Thread list */}
      <div className={`divide-y divide-gray-50 ${compact ? 'text-xs' : ''}`}>
        {visibleFlags.map((flag) => (
          <ThreadListItem
            key={flag._id}
            flag={flag}
            onSelect={onSelect}
            showEntityBadge={showEntityBadge}
          />
        ))}
      </div>

      {/* Show/hide resolved toggle */}
      {resolvedFlags.length > 0 && (
        <button
          onClick={() => setShowResolved((v) => !v)}
          className="w-full py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors border-t border-gray-100"
        >
          {showResolved
            ? 'Hide resolved'
            : `Show ${resolvedFlags.length} resolved`}
        </button>
      )}
    </div>
  );
}
