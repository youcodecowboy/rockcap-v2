'use client';

import { ChevronRight, Home, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbNavProps {
  clientName?: string;
  projectName?: string;
  folderName?: string;
  isInbox?: boolean;
  onHomeClick: () => void;
  onClientClick?: () => void;
  onProjectClick?: () => void;
}

export default function BreadcrumbNav({
  clientName,
  projectName,
  folderName,
  isInbox,
  onHomeClick,
  onClientClick,
  onProjectClick,
}: BreadcrumbNavProps) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      {/* Home */}
      <button
        onClick={onHomeClick}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <Home className="w-4 h-4" />
        <span>Documents</span>
      </button>

      {/* Inbox path */}
      {isInbox && (
        <>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="flex items-center gap-1 px-2 py-1 text-gray-900 font-medium">
            <Inbox className="w-4 h-4" />
            Inbox
          </span>
        </>
      )}

      {/* Client */}
      {clientName && !isInbox && (
        <>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <button
            onClick={onClientClick}
            className={cn(
              "px-2 py-1 rounded transition-colors",
              folderName || projectName
                ? "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                : "text-gray-900 font-medium"
            )}
          >
            {clientName}
          </button>
        </>
      )}

      {/* Project */}
      {projectName && (
        <>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <button
            onClick={onProjectClick}
            className={cn(
              "px-2 py-1 rounded transition-colors",
              folderName
                ? "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                : "text-gray-900 font-medium"
            )}
          >
            {projectName}
          </button>
        </>
      )}

      {/* Folder */}
      {folderName && (
        <>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="px-2 py-1 text-gray-900 font-medium">
            {folderName}
          </span>
        </>
      )}
    </nav>
  );
}
