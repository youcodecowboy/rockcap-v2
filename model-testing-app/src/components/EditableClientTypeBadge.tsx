'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type ClientType = 'lender' | 'developer' | 'broker';

interface EditableClientTypeBadgeProps {
  type: ClientType | string | undefined;
  onTypeChange: (type: ClientType) => void;
  className?: string;
}

const typeConfig = {
  lender: {
    label: 'Lender',
    className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  developer: {
    label: 'Developer',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  broker: {
    label: 'Broker',
    className: 'bg-teal-100 text-teal-800 border-teal-200',
  },
};

export default function EditableClientTypeBadge({ 
  type, 
  onTypeChange, 
  className = '' 
}: EditableClientTypeBadgeProps) {
  // Normalize type - handle variations like "real-estate-developer" -> "developer"
  const normalizedType = type === 'real-estate-developer' || type === 'developer' 
    ? 'developer' 
    : (type as ClientType) || 'lender';
  
  const currentType = (['lender', 'developer', 'broker'].includes(normalizedType) 
    ? normalizedType 
    : 'lender') as ClientType;
  
  const config = typeConfig[currentType] || typeConfig.lender;
  
  return (
    <Select
      value={currentType}
      onValueChange={(value) => onTypeChange(value as ClientType)}
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

