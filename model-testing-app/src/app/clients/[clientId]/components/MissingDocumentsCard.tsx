'use client';

import { useQuery } from 'convex/react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MissingDocumentsCardProps {
  clientId: Id<"clients">;
  className?: string;
  onViewAll?: () => void;
}

export default function MissingDocumentsCard({
  clientId,
  className,
  onViewAll,
}: MissingDocumentsCardProps) {
  const router = useRouter();

  // Get checklist summary
  const summary = useQuery(
    api.knowledgeLibrary.getChecklistSummary,
    { clientId }
  );

  // Get missing items
  const missingItems = useQuery(
    api.knowledgeLibrary.getMissingItems,
    { clientId }
  );

  // Handle click to go to Knowledge tab
  const handleViewAll = () => {
    if (onViewAll) {
      onViewAll();
    } else {
      router.push(`/clients/${clientId}?tab=knowledge`);
    }
  };

  // Loading state
  if (summary === undefined || missingItems === undefined) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardHeader className="py-3">
          <div className="h-5 bg-gray-200 rounded w-32"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No checklist initialized yet
  if (!summary || summary.overall.total === 0) {
    return (
      <Card className={className}>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            Knowledge Library
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            No document requirements configured yet.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 text-xs"
            onClick={handleViewAll}
          >
            Set up requirements
            <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Calculate completion percentage
  const completionPercentage = Math.round(
    (summary.overall.fulfilled / summary.overall.total) * 100
  );

  // Get required items that are missing
  const requiredMissing = missingItems.filter(item => item.priority === 'required');
  const topMissingItems = requiredMissing.slice(0, 5);

  // All complete state
  if (summary.overall.missing === 0) {
    return (
      <Card className={cn("border-green-200 bg-green-50", className)}>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base text-green-800">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            Knowledge Library
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-800">All Complete!</span>
            <span className="text-sm text-green-600">
              {summary.overall.fulfilled}/{summary.overall.total}
            </span>
          </div>
          <Progress value={100} className="h-2 bg-green-200" />
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 text-xs text-green-700 hover:text-green-800"
            onClick={handleViewAll}
          >
            View all documents
            <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="py-3 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          Knowledge Library
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          onClick={handleViewAll}
        >
          View All
          <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </CardHeader>
      <CardContent>
        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">
              {completionPercentage}% Complete
            </span>
            <span className="text-xs text-gray-500">
              {summary.overall.fulfilled}/{summary.overall.total} documents
            </span>
          </div>
          <Progress value={completionPercentage} className="h-2" />
        </div>

        {/* Missing Required Alert */}
        {requiredMissing.length > 0 && (
          <div className="mb-3 p-2 bg-red-50 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="font-medium">
                {requiredMissing.length} required document{requiredMissing.length !== 1 ? 's' : ''} missing
              </span>
            </div>
          </div>
        )}

        {/* Top Missing Items */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Priority Missing
          </p>
          {topMissingItems.map(item => (
            <div
              key={item._id}
              className="flex items-center gap-2 text-sm text-gray-600"
            >
              <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="truncate flex-1">{item.name}</span>
              {item.priority === 'required' && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                  Required
                </Badge>
              )}
            </div>
          ))}
          {requiredMissing.length > 5 && (
            <p className="text-xs text-gray-400 pl-5">
              +{requiredMissing.length - 5} more required documents
            </p>
          )}
        </div>

        {/* Category Breakdown */}
        {Object.keys(summary.byCategory).length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              By Category
            </p>
            <div className="space-y-1.5">
              {Object.entries(summary.byCategory).map(([category, stats]) => (
                <div key={category} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{category}</span>
                  <span className={cn(
                    stats.missing > 0 ? "text-red-600" : "text-green-600"
                  )}>
                    {stats.fulfilled}/{stats.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
