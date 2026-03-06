'use client';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Flag } from 'lucide-react';

interface FlagIndicatorProps {
  entityType: "document" | "meeting" | "task" | "project" | "client" | "checklist_item";
  entityId: string;
}

export function FlagIndicator({ entityType, entityId }: FlagIndicatorProps) {
  const count = useQuery(api.flags.getOpenCountByEntity, { entityType, entityId });
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-orange-500" title={`${count} open flag${count > 1 ? 's' : ''}`}>
      <Flag className="h-3 w-3" />
      {count > 1 && <span className="text-xs">{count}</span>}
    </span>
  );
}
