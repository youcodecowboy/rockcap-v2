'use client';

import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface DocumentNotesIndicatorProps {
  noteCount: number;
  className?: string;
  size?: 'sm' | 'md';
}

export default function DocumentNotesIndicator({
  noteCount,
  className,
  size = 'sm',
}: DocumentNotesIndicatorProps) {
  if (noteCount <= 0) return null;

  const sizeClasses = {
    sm: 'h-5 px-1.5 text-[10px]',
    md: 'h-6 px-2 text-xs',
  };

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 font-medium',
              sizeClasses[size],
              className
            )}
          >
            <MessageSquare className={iconSize} />
            {noteCount}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{noteCount} {noteCount === 1 ? 'note' : 'notes'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
