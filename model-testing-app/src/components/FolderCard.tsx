'use client';

import { useRouter } from 'next/navigation';
import { Building2, FolderKanban, FileText, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FolderCardProps {
  type: 'client' | 'project';
  id: string;
  name: string;
  documentCount: number;
  lastUpdated: string | null;
  clientName?: string; // For project folders
  onClick?: () => void;
}

export default function FolderCard({
  type,
  id,
  name,
  documentCount,
  lastUpdated,
  clientName,
  onClick,
}: FolderCardProps) {
  const router = useRouter();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      if (type === 'client') {
        router.push(`/docs/client/${id}`);
      } else {
        router.push(`/docs/project/${id}`);
      }
    }
  };

  const formatLastUpdated = (dateString: string | null) => {
    if (!dateString) return 'Never';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) return 'Just now';
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      onClick={handleClick}
      className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {type === 'client' ? (
            <Building2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
          ) : (
            <FolderKanban className="w-5 h-5 text-purple-600 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
              {name}
            </h3>
            {clientName && (
              <p className="text-sm text-gray-500 truncate mt-0.5">{clientName}</p>
            )}
          </div>
        </div>
        <Badge variant="outline" className="flex-shrink-0">
          <FileText className="w-3 h-3 mr-1" />
          {documentCount}
        </Badge>
      </div>
      
      {lastUpdated && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>Updated {formatLastUpdated(lastUpdated)}</span>
        </div>
      )}
    </div>
  );
}

