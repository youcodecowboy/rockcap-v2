'use client';

import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive?: boolean;
    period?: string;
  };
  icon?: LucideIcon;
  iconColor?: 'blue' | 'green' | 'purple' | 'orange' | 'yellow' | 'gray';
  className?: string;
  onClick?: () => void;
}

const iconColorClasses = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  purple: 'bg-purple-50 text-purple-600',
  orange: 'bg-orange-50 text-orange-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  gray: 'bg-gray-50 text-gray-600',
};

export default function MetricCard({
  label,
  value,
  trend,
  icon: Icon,
  iconColor = 'blue',
  className,
  onClick,
}: MetricCardProps) {
  const formatTrend = () => {
    if (!trend) return null;
    const { value: trendValue, isPositive, period = 'vs last month' } = trend;
    
    if (trendValue === 0) {
      return (
        <div className="flex items-center gap-1 text-xs text-gray-600 mt-1">
          <Minus className="w-3 h-3" />
          <span>0.0% {period}</span>
        </div>
      );
    }

    const TrendIcon = isPositive ? TrendingUp : TrendingDown;
    const trendColor = isPositive ? 'text-green-600' : 'text-red-600';
    const sign = isPositive ? '+' : '';

    return (
      <div className={cn('flex items-center gap-1 text-xs mt-1', trendColor)}>
        <TrendIcon className="w-3 h-3" />
        <span>
          {sign}{Math.abs(trendValue).toFixed(1)}% {period}
        </span>
      </div>
    );
  };

  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-gray-200 shadow-sm p-6 transition-shadow hover:shadow-md',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-600 mb-2">{label}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {formatTrend()}
        </div>
        {Icon && (
          <div className={cn('p-3 rounded-lg flex-shrink-0 ml-4', iconColorClasses[iconColor])}>
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>
    </div>
  );
}

