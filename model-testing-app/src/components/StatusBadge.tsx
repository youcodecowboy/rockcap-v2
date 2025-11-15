'use client';

import { Badge } from '@/components/ui/badge';

type ClientStatus = 'prospect' | 'active' | 'archived' | 'past' | 'inactive';
type ProjectStatus = 'active' | 'inactive' | 'completed' | 'on-hold' | 'cancelled';

interface StatusBadgeProps {
  status: ClientStatus | ProjectStatus;
  className?: string;
}

const clientStatusConfig = {
  prospect: {
    label: 'Prospective',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  active: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  archived: {
    label: 'Archived',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
  past: {
    label: 'Inactive',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
  inactive: {
    label: 'Inactive',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
};

const projectStatusConfig = {
  active: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  inactive: {
    label: 'Inactive',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
  completed: {
    label: 'Completed',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  'on-hold': {
    label: 'On Hold',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
};

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  // Check if it's a client status or project status
  const isClientStatus = ['prospect', 'active', 'archived', 'past', 'inactive'].includes(status);
  const config = isClientStatus 
    ? (clientStatusConfig[status as ClientStatus] || clientStatusConfig.inactive)
    : (projectStatusConfig[status as ProjectStatus] || projectStatusConfig.inactive);
  
  return (
    <Badge
      variant="outline"
      className={`${config.className} ${className}`}
    >
      {config.label}
    </Badge>
  );
}

