'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Clock, AlertCircle, CheckCircle2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function RecentUploadCard() {
  const router = useRouter();
  
  // Get the most recent file from the queue (any status)
  const recentJobs = useQuery(api.fileQueue.getJobs, { 
    limit: 1 
  });
  
  const recentJob = recentJobs?.[0];
  
  const getStatusInfo = (status?: string) => {
    switch (status) {
      case 'needs_confirmation':
        return {
          icon: AlertCircle,
          iconColor: 'text-orange-600',
          label: 'Recent Upload',
        };
      case 'completed':
        return {
          icon: CheckCircle2,
          iconColor: 'text-green-600',
          label: 'Recent Upload',
        };
      case 'analyzing':
      case 'uploading':
        return {
          icon: Upload,
          iconColor: 'text-blue-600',
          label: 'Recent Upload',
        };
      case 'error':
        return {
          icon: AlertCircle,
          iconColor: 'text-red-600',
          label: 'Recent Upload',
        };
      default:
        return {
          icon: Clock,
          iconColor: 'text-gray-600',
          label: 'Recent Upload',
        };
    }
  };
  
  const statusInfo = getStatusInfo(recentJob?.status);
  const Icon = statusInfo.icon;
  
  const handleClick = () => {
    if (recentJob?.documentId) {
      router.push(`/docs/${recentJob.documentId}`);
    } else if (recentJob?.status === 'needs_confirmation') {
      router.push('/docs/queue');
    }
  };
  
  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 min';
    if (diffMins < 60) return `${diffMins} mins`;
    if (diffHours === 1) return '1 hr';
    if (diffHours < 24) return `${diffHours} hrs`;
    if (diffDays === 1) return '1 day';
    return `${diffDays} days`;
  };
  
  if (!recentJob) {
    return (
      <div className="bg-black rounded-lg border border-gray-800 shadow-sm px-3 py-2 flex items-center gap-3 border-dashed h-[42px]">
        <Clock className="w-4 h-4 flex-shrink-0 text-gray-400" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-medium text-gray-300 whitespace-nowrap">Recent Upload:</span>
          <span className="text-xs text-gray-400 italic">No recent uploads</span>
        </div>
      </div>
    );
  }
  
  return (
    <div
      className={cn(
        'bg-black rounded-lg border shadow-sm px-3 py-2 transition-all flex items-center gap-3 h-[42px]',
        recentJob.status === 'needs_confirmation' 
          ? 'border-orange-600 hover:shadow-md hover:border-orange-500 cursor-pointer' 
          : 'border-gray-800 hover:shadow-md hover:border-gray-700 cursor-pointer'
      )}
      onClick={handleClick}
    >
      <Icon className={cn('w-4 h-4 flex-shrink-0', statusInfo.iconColor)} />
      <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
        <span className="text-xs font-medium text-gray-300 whitespace-nowrap">{statusInfo.label}:</span>
        <span className="text-xs font-semibold text-white truncate">{recentJob.fileName}</span>
      </div>
      <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 ml-auto">
        {formatTimeAgo(recentJob.createdAt)}
      </span>
    </div>
  );
}

