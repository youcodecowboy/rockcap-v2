'use client';

import { StatusPill, clientStatusTone, projectStatusTone } from '@/components/layouts';
import { useColors } from '@/lib/useColors';

type ClientStatus = 'prospect' | 'active' | 'archived' | 'past' | 'inactive';
type ProjectStatus = 'active' | 'inactive' | 'completed' | 'on-hold' | 'cancelled';

interface StatusBadgeProps {
  status: ClientStatus | ProjectStatus;
  className?: string;
}

const labelMap: Record<string, string> = {
  prospect: 'Prospective',
  active: 'Active',
  archived: 'Archived',
  past: 'Inactive',
  inactive: 'Inactive',
  completed: 'Completed',
  'on-hold': 'On Hold',
  cancelled: 'Cancelled',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const colors = useColors();
  const isClientStatus = ['prospect', 'active', 'archived', 'past', 'inactive'].includes(status);
  const tone = isClientStatus
    ? clientStatusTone(status, colors)
    : projectStatusTone(status, colors);
  const label = labelMap[status] ?? 'Inactive';

  return <StatusPill label={label} tone={tone} />;
}
