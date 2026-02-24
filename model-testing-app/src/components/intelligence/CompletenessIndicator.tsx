'use client';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CompletenessIndicatorProps {
  filled: number;
  total: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function CompletenessIndicator({
  filled,
  total,
  size = 'sm',
  showLabel = false,
  className
}: CompletenessIndicatorProps) {
  const percentage = total > 0 ? Math.round((filled / total) * 100) : 0;
  const dotCount = Math.min(total, 5); // Max 5 dots for visual clarity
  const filledDots = total > 5
    ? Math.round((filled / total) * 5)
    : filled;

  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };

  const getStatusColor = () => {
    if (percentage === 100) return 'text-green-600';
    if (percentage >= 50) return 'text-blue-600';
    if (percentage > 0) return 'text-amber-600';
    return 'text-gray-400';
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-1', className)}>
            <div className="flex gap-0.5">
              {Array.from({ length: dotCount }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    dotSizes[size],
                    'rounded-full transition-colors',
                    i < filledDots
                      ? percentage === 100
                        ? 'bg-green-500'
                        : 'bg-blue-500'
                      : 'bg-gray-200'
                  )}
                />
              ))}
            </div>
            {showLabel && (
              <span className={cn('text-xs font-medium ml-1', getStatusColor())}>
                {filled}/{total}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          <p>{filled} of {total} fields filled ({percentage}%)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface CompletenessBarProps {
  filled: number;
  total: number;
  showPercentage?: boolean;
  className?: string;
}

export function CompletenessBar({
  filled,
  total,
  showPercentage = true,
  className
}: CompletenessBarProps) {
  const percentage = total > 0 ? Math.round((filled / total) * 100) : 0;

  const getBarColor = () => {
    if (percentage === 100) return 'bg-green-500';
    if (percentage >= 50) return 'bg-blue-500';
    if (percentage > 0) return 'bg-amber-500';
    return 'bg-gray-300';
  };

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between mb-1">
        {showPercentage && (
          <span className="text-xs text-gray-500">
            {filled} of {total} fields
          </span>
        )}
        <span className="text-xs font-medium text-gray-700">
          {percentage}%
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', getBarColor())}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
