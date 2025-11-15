'use client';

import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type ClientStatus = 'prospect' | 'active' | 'archived' | 'past';

interface EditableStatusBadgeProps {
  status: ClientStatus | undefined;
  onStatusChange: (status: ClientStatus) => void;
  className?: string;
}

const statusConfig = {
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
};

export default function EditableStatusBadge({ 
  status, 
  onStatusChange, 
  className = '' 
}: EditableStatusBadgeProps) {
  const currentStatus = status || 'active';
  const config = statusConfig[currentStatus] || statusConfig.active;
  
  return (
    <Select
      value={currentStatus}
      onValueChange={(value) => onStatusChange(value as ClientStatus)}
    >
      <SelectTrigger
        className={cn(
          "h-auto py-0.5 px-2 border rounded-md cursor-pointer hover:opacity-80 transition-opacity shadow-none",
          config.className,
          "data-[state=open]:ring-2 data-[state=open]:ring-blue-500 data-[state=open]:ring-offset-1",
          "focus:ring-0 focus-visible:ring-0",
          "[&>svg]:hidden", // Hide the default SelectPrimitive.Icon chevron
          className
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{config.label}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(statusConfig).map(([value, config]) => (
          <SelectItem key={value} value={value}>
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", config.className.split(' ')[0])} />
              <span>{config.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

