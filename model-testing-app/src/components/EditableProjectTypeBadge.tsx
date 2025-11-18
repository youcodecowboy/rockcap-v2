'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProjectType = 'new-build' | 'roof-renovation' | 'new-development' | 'renovation' | 'refurbishment' | 'extension' | 'commercial' | 'residential';

interface EditableProjectTypeBadgeProps {
  type: ProjectType | string | undefined;
  onTypeChange: (type: ProjectType) => void;
  className?: string;
}

const typeConfig = {
  'new-build': {
    label: 'New Build',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  'roof-renovation': {
    label: 'Roof Renovation',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  'new-development': {
    label: 'New Development',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  'renovation': {
    label: 'Renovation',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  'refurbishment': {
    label: 'Refurbishment',
    className: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  'extension': {
    label: 'Extension',
    className: 'bg-pink-100 text-pink-800 border-pink-200',
  },
  'commercial': {
    label: 'Commercial',
    className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  'residential': {
    label: 'Residential',
    className: 'bg-teal-100 text-teal-800 border-teal-200',
  },
};

export default function EditableProjectTypeBadge({ 
  type, 
  onTypeChange, 
  className = '' 
}: EditableProjectTypeBadgeProps) {
  // Normalize type - handle variations
  const normalizedType = type || 'new-build';
  
  const currentType = (Object.keys(typeConfig).includes(normalizedType) 
    ? normalizedType 
    : 'new-build') as ProjectType;
  
  const config = typeConfig[currentType] || typeConfig['new-build'];
  
  return (
    <Select
      value={currentType}
      onValueChange={(value) => onTypeChange(value as ProjectType)}
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
        {Object.entries(typeConfig).map(([value, config]) => (
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







