'use client';

import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface CompactMetricCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  iconColor?: 'blue' | 'green' | 'purple' | 'orange' | 'yellow' | 'gray' | 'red';
  badge?: {
    text: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  };
  className?: string;
  onClick?: () => void;
}

const iconColorClasses = {
  blue: 'text-blue-600',
  green: 'text-green-600',
  purple: 'text-purple-600',
  orange: 'text-orange-600',
  yellow: 'text-yellow-600',
  gray: 'text-gray-600',
  red: 'text-red-600',
};

export default function CompactMetricCard({
  label,
  value,
  icon: Icon,
  iconColor = 'blue',
  badge,
  className,
  onClick,
}: CompactMetricCardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-2.5 transition-shadow hover:shadow-md flex items-center gap-3',
        onClick && 'cursor-pointer hover:border-gray-300',
        className
      )}
      onClick={onClick}
    >
      {Icon && (
        <Icon className={cn('w-5 h-5 flex-shrink-0', iconColorClasses[iconColor])} />
      )}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-600 whitespace-nowrap">{label}:</span>
        <span className="text-lg font-bold text-gray-900">{value}</span>
        {badge && (
          <Badge variant={badge.variant || 'outline'} className="ml-1">
            {badge.text}
          </Badge>
        )}
      </div>
    </div>
  );
}

