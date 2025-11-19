'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProjectStatus = 'active' | 'inactive' | 'completed' | 'on-hold' | 'cancelled';

interface EditableProjectStatusBadgeProps {
  status: ProjectStatus | undefined;
  onStatusChange: (status: ProjectStatus) => void;
  className?: string;
}

const statusConfig = {
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

export default function EditableProjectStatusBadge({ 
  status, 
  onStatusChange, 
  className = '' 
}: EditableProjectStatusBadgeProps) {
  const currentStatus = status || 'active';
  const config = statusConfig[currentStatus] || statusConfig.active;
  
  return (
    <Select
      value={currentStatus}
      onValueChange={(value) => onStatusChange(value as ProjectStatus)}
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









