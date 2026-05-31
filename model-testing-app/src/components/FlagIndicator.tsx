'use client';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Flag } from 'lucide-react';
import { useColors } from '@/lib/useColors';

interface FlagIndicatorProps {
  entityType: "document" | "meeting" | "task" | "project" | "client" | "checklist_item";
  entityId: string;
}

export function FlagIndicator({ entityType, entityId }: FlagIndicatorProps) {
  const colors = useColors();
  const count = useQuery(api.flags.getOpenCountByEntity, { entityType, entityId });
  if (!count) return null;
  return (
    <span
      title={`${count} open flag${count > 1 ? 's' : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: colors.accent.orange }}
    >
      <Flag style={{ width: 12, height: 12 }} />
      {count > 1 && (
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10 }}>
          {count}
        </span>
      )}
    </span>
  );
}
