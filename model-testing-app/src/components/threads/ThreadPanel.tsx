'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { Plus, Flag } from 'lucide-react';
import { Button, SkeletonText } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import ThreadListView from './ThreadListView';
import ThreadDetailView from './ThreadDetailView';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ThreadPanelProps {
  // Filter scope — at least one required
  entityType?: string;
  entityId?: string;
  clientId?: string;
  projectId?: string;

  // Display options
  showEntityBadge?: boolean;
  showCreateButton?: boolean;
  compact?: boolean;

  // Optional callbacks
  onCreateFlag?: () => void;
}

// ---------------------------------------------------------------------------
// ThreadPanel
// ---------------------------------------------------------------------------
export default function ThreadPanel({
  entityType,
  entityId,
  clientId,
  projectId,
  showEntityBadge = false,
  showCreateButton = false,
  compact = false,
  onCreateFlag,
}: ThreadPanelProps) {
  const colors = useColors();
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);

  // Determine which query to use based on provided props
  const byEntityArgs =
    entityType && entityId
      ? { entityType: entityType as any, entityId }
      : 'skip';

  const byClientArgs =
    !entityType && !entityId && clientId
      ? { clientId: clientId as Id<'clients'> }
      : 'skip';

  const byProjectArgs =
    !entityType && !entityId && !clientId && projectId
      ? { projectId: projectId as Id<'projects'> }
      : 'skip';

  const entityFlags = useQuery(api.flags.getByEntity, byEntityArgs as any);
  const clientFlags = useQuery(api.flags.getByClient, byClientArgs as any);
  const projectFlags = useQuery(api.flags.getByProject, byProjectArgs as any);

  // Pick the active result
  const flags = entityFlags ?? clientFlags ?? projectFlags;
  const isLoading = flags === undefined;

  // Detail view
  if (selectedFlagId) {
    return (
      <ThreadDetailView
        flagId={selectedFlagId}
        onBack={() => setSelectedFlagId(null)}
        showEntityContext={showEntityBadge}
        compact={compact}
      />
    );
  }

  const Header = ({ count, open }: { count: number; open: number }) => (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ borderBottom: `1px solid ${colors.border.default}` }}
    >
      <div className="flex items-center gap-2">
        <Flag className="h-4 w-4" style={{ color: colors.text.dim }} />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: colors.text.muted,
            fontWeight: 500,
          }}
        >
          Threads
        </span>
        {count > 0 && (
          <span
            className="inline-flex items-center justify-center px-1.5 min-w-[20px] h-5"
            style={{
              fontFamily: MONO,
              fontSize: 10,
              borderRadius: 2,
              background: colors.bg.cardAlt,
              border: `1px solid ${colors.border.default}`,
              color: colors.text.muted,
            }}
          >
            {open > 0 ? open : count}
          </span>
        )}
      </div>
      {showCreateButton && onCreateFlag && (
        <Button variant="ghost" size="sm" onClick={onCreateFlag}>
          <Plus className="h-3.5 w-3.5" />
          New Flag
        </Button>
      )}
    </div>
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header count={0} open={0} />
        <div className="flex-1 px-4 py-4">
          <SkeletonText lines={5} />
        </div>
      </div>
    );
  }

  const flagCount = flags?.length ?? 0;
  const openCount = flags?.filter((f: any) => f.status === 'open').length ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <Header count={flagCount} open={openCount} />

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <ThreadListView
          flags={flags ?? []}
          onSelect={setSelectedFlagId}
          showEntityBadge={showEntityBadge}
          compact={compact}
        />
      </div>
    </div>
  );
}
