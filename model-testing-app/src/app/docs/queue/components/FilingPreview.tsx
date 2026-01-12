'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Building2, Briefcase, Folder, FolderOpen, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilingPreviewProps {
  clientId: Id<"clients"> | null;
  projectId: Id<"projects"> | null;
  folderId: string | null;
  folderType: 'client' | 'project';
}

export default function FilingPreview({
  clientId,
  projectId,
  folderId,
  folderType,
}: FilingPreviewProps) {
  // Fetch client info
  const client = useQuery(
    api.clients.get,
    clientId ? { id: clientId } : "skip"
  );

  // Fetch project info
  const project = useQuery(
    api.projects.get,
    projectId ? { id: projectId } : "skip"
  );

  // Fetch client folders
  const clientFolders = useQuery(
    api.clients.getClientFolders,
    clientId ? { clientId } : "skip"
  );

  // Fetch project folders
  const projectFolders = useQuery(
    api.projects.getProjectFolders,
    projectId ? { projectId } : "skip"
  );

  // Find the selected folder name
  const getFolderName = () => {
    if (!folderId) return null;
    
    if (folderType === 'project' && projectFolders) {
      const folder = projectFolders.find(f => f.folderType === folderId);
      return folder?.name || folderId;
    }
    
    if (folderType === 'client' && clientFolders) {
      const folder = clientFolders.find(f => f.folderType === folderId);
      return folder?.name || folderId;
    }
    
    return folderId;
  };

  const folderName = getFolderName();

  // Empty state
  if (!clientId) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 border border-dashed border-gray-300">
        <p className="text-sm text-gray-500 text-center">
          Select a client to see filing preview
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Filing Destination
      </h4>
      
      <div className="space-y-1">
        {/* Client Level */}
        <div className="flex items-center gap-2 text-sm">
          <Building2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className={cn(
            "font-medium",
            client ? "text-gray-900" : "text-gray-400"
          )}>
            {client?.name || 'Loading...'}
          </span>
          {client?.type && (
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded",
              client.type === 'lender' 
                ? "bg-blue-100 text-blue-700"
                : "bg-green-100 text-green-700"
            )}>
              {client.type}
            </span>
          )}
        </div>

        {/* Project Level (if selected) */}
        {projectId && (
          <div className="flex items-center gap-2 text-sm ml-4">
            <ChevronRight className="w-3 h-3 text-gray-400 -ml-1" />
            <Briefcase className="w-4 h-4 text-purple-500 flex-shrink-0" />
            <span className={cn(
              "font-medium",
              project ? "text-gray-900" : "text-gray-400"
            )}>
              {project?.name || 'Loading...'}
            </span>
            {project?.projectShortcode && (
              <span className="text-xs text-gray-500 font-mono">
                ({project.projectShortcode})
              </span>
            )}
          </div>
        )}

        {/* Folder Level (if selected) */}
        {folderId && folderName && (
          <div className={cn(
            "flex items-center gap-2 text-sm",
            projectId ? "ml-8" : "ml-4"
          )}>
            <ChevronRight className="w-3 h-3 text-gray-400 -ml-1" />
            <FolderOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="font-medium text-amber-700">
              {folderName}
            </span>
          </div>
        )}
      </div>

      {/* Missing selection indicator */}
      {(!folderId || (folderType === 'project' && !projectId)) && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-amber-600">
            {!projectId && folderType === 'project' 
              ? '⚠️ Select a project to choose a folder'
              : !folderId 
                ? '⚠️ Select a folder to complete filing'
                : null
            }
          </p>
        </div>
      )}
    </div>
  );
}
