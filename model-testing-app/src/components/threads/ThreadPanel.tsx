'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { Loader2, Plus, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ThreadListView from './ThreadListView';
import ThreadDetailView from './ThreadDetailView';

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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-900">Threads</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  const flagCount = flags?.length ?? 0;
  const openCount = flags?.filter((f: any) => f.status === 'open').length ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-900">Threads</span>
          {flagCount > 0 && (
            <span className="inline-flex items-center justify-center px-1.5 py-0 min-w-[20px] h-5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
              {openCount > 0 ? openCount : flagCount}
            </span>
          )}
        </div>
        {showCreateButton && onCreateFlag && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCreateFlag}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Flag
          </Button>
        )}
      </div>

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
