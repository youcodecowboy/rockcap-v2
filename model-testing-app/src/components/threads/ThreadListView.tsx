'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { StatusPill, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';
import { relativeTime, getInitial, ENTITY_TYPE_SHORT } from './utils';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// ---------------------------------------------------------------------------
// Entity type → canon accent token
// ---------------------------------------------------------------------------
function entityTone(entityType: string, colors: ColorPalette): string {
  switch (entityType) {
    case 'document':
      return colors.accent.blue;
    case 'project':
      return colors.accent.purple;
    case 'client':
      return colors.accent.green;
    case 'task':
      return colors.accent.yellow;
    case 'meeting':
      return colors.accent.cyan;
    case 'checklist_item':
      return colors.accent.orange;
    default:
      return colors.accent.blue;
  }
}

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
  const colors = useColors();
  const [hover, setHover] = useState(false);
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
  const tone = entityTone(flag.entityType, colors);
  const statusDot = isOpen ? colors.accent.orange : colors.accent.green;

  return (
    <button
      onClick={() => onSelect(flag._id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="w-full text-left flex items-center gap-3 px-4 py-3 group"
      style={{
        background: hover ? colors.bg.cardAlt : 'transparent',
        transition: 'background 100ms linear',
      }}
    >
      {/* Left accent border */}
      <div
        className="flex-shrink-0 w-0.5 self-stretch"
        style={{ background: isOpen ? colors.accent.orange : 'transparent', borderRadius: 2 }}
      />

      {/* Status dot */}
      <div className="flex-shrink-0">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: statusDot }} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Entity badge row */}
        {showEntityBadge && (
          <div className="flex items-center gap-1.5 mb-1">
            <StatusPill
              label={ENTITY_TYPE_SHORT[flag.entityType] || flag.entityType}
              tone={tone}
            />
            {entityContext?.name && (
              <span
                className="truncate"
                style={{ fontSize: 11, color: colors.text.muted }}
              >
                {entityContext.name}
              </span>
            )}
          </div>
        )}

        {/* Title + timestamp row */}
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-sm truncate"
            style={{
              fontWeight: isOpen ? 600 : 500,
              color: isOpen ? colors.text.primary : colors.text.dim,
            }}
          >
            {title}
          </span>
          <span
            className="whitespace-nowrap flex-shrink-0"
            style={{ fontFamily: MONO, fontSize: 10, color: colors.text.dim }}
          >
            {relativeTime(flag.createdAt)}
          </span>
        </div>

        {/* Preview + metadata row */}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-xs truncate" style={{ color: colors.text.muted }}>
            {preview}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Participant avatars */}
            {users && users.length > 0 && (
              <div className="flex -space-x-1">
                {users.slice(0, 3).map((u) => (
                  <div
                    key={u._id}
                    className="w-4 h-4 rounded-full flex items-center justify-center"
                    style={{
                      fontSize: 8,
                      fontWeight: 500,
                      background: colors.text.secondary,
                      color: colors.bg.card,
                      boxShadow: `0 0 0 1px ${colors.bg.card}`,
                    }}
                    title={u.name || u.email || undefined}
                  >
                    {getInitial(u.name || u.email)}
                  </div>
                ))}
              </div>
            )}

            {/* Reply count */}
            {replyCount > 0 && (
              <span style={{ fontFamily: MONO, fontSize: 10, color: colors.text.dim }}>
                {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
              </span>
            )}

            {/* Status / priority badge */}
            {isUrgent ? (
              <StatusPill label="Urgent" tone={colors.accent.red} />
            ) : (
              <StatusPill
                label={isOpen ? 'Open' : 'Resolved'}
                tone={isOpen ? colors.accent.orange : colors.accent.green}
              />
            )}
          </div>
        </div>
      </div>

      {/* Chevron */}
      <ChevronRight
        className="flex-shrink-0 h-4 w-4"
        style={{ color: hover ? colors.text.muted : colors.text.dim, transition: 'color 100ms linear' }}
      />
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
  const colors = useColors();
  const [showResolved, setShowResolved] = useState(false);
  const [toggleHover, setToggleHover] = useState(false);

  // Split into open and resolved
  const openFlags = useMemo(() => flags.filter((f) => f.status === 'open'), [flags]);
  const resolvedFlags = useMemo(() => flags.filter((f) => f.status === 'resolved'), [flags]);

  const visibleFlags = showResolved ? [...openFlags, ...resolvedFlags] : openFlags;

  // Empty state
  if (flags.length === 0) {
    return (
      <div className="px-4 py-6">
        <EmptyState icon={<MessageSquare className="h-8 w-8" />} title="No threads yet" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Thread list */}
      <div className={compact ? 'text-xs' : ''}>
        {visibleFlags.map((flag, i) => (
          <div
            key={flag._id}
            style={i > 0 ? { borderTop: `1px solid ${colors.border.light}` } : undefined}
          >
            <ThreadListItem flag={flag} onSelect={onSelect} showEntityBadge={showEntityBadge} />
          </div>
        ))}
      </div>

      {/* Show/hide resolved toggle */}
      {resolvedFlags.length > 0 && (
        <button
          onClick={() => setShowResolved((v) => !v)}
          onMouseEnter={() => setToggleHover(true)}
          onMouseLeave={() => setToggleHover(false)}
          className="w-full py-2.5 text-xs"
          style={{
            color: toggleHover ? colors.text.secondary : colors.text.dim,
            background: toggleHover ? colors.bg.cardAlt : 'transparent',
            borderTop: `1px solid ${colors.border.default}`,
            transition: 'background 100ms linear, color 100ms linear',
          }}
        >
          {showResolved ? 'Hide resolved' : `Show ${resolvedFlags.length} resolved`}
        </button>
      )}
    </div>
  );
}
