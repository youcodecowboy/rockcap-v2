'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Briefcase,
  Plus,
  Trash2,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { FolderSelection } from '@/types/folders';

interface FolderBrowserProps {
  clientId: Id<"clients">;
  clientName: string;
  clientType?: string;
  selectedFolder: FolderSelection | null;
  onFolderSelect: (folder: FolderSelection | null) => void;
  projectFilter?: Id<"projects">;
}

interface FolderWithCount {
  _id: string;
  folderType: string;
  name: string;
  parentFolderId?: string;
  documentCount: number;
  isCustom?: boolean;
}

interface ProjectWithFolders {
  _id: Id<"projects">;
  name: string;
  projectShortcode?: string;
  folders: FolderWithCount[];
  totalDocuments: number;
  unfiledCount: number;
}

type AddFolderTarget =
  | { type: 'client' }
  | { type: 'project'; projectId: Id<"projects">; projectName: string; parentFolderId?: Id<"projectFolders">; parentFolderName?: string }
  | null;

// Inline unfiled folder row — uses computed count (total - sum of folder counts)
function UnfiledFolderRow({
  projectId,
  count,
  selectedFolder,
  onFolderSelect,
}: {
  projectId: Id<"projects">;
  count: number;
  selectedFolder: FolderSelection | null;
  onFolderSelect: (folder: FolderSelection) => void;
}) {
  const selected =
    selectedFolder?.type === 'project' &&
    selectedFolder?.folderId === 'unfiled' &&
    selectedFolder?.projectId === projectId;

  return (
    <button
      onClick={() => onFolderSelect({
        type: 'project',
        folderId: 'unfiled',
        folderName: 'Unfiled',
        projectId,
      })}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors rounded-md",
        selected
          ? "bg-orange-100 text-orange-900"
          : "hover:bg-gray-100 text-orange-600/70"
      )}
    >
      {selected ? (
        <FolderOpen className="w-4 h-4 text-orange-400 flex-shrink-0" />
      ) : (
        <Folder className="w-4 h-4 text-orange-300 flex-shrink-0" />
      )}
      <span className="flex-1 text-left truncate min-w-0 italic">Unfiled</span>
      <span className="text-xs text-orange-400 flex-shrink-0 ml-auto">({count})</span>
    </button>
  );
}

// Client-level unfiled folder row
function ClientUnfiledFolderRow({
  count,
  selectedFolder,
  onFolderSelect,
}: {
  count: number;
  selectedFolder: FolderSelection | null;
  onFolderSelect: (folder: FolderSelection) => void;
}) {
  const selected =
    selectedFolder?.type === 'client' &&
    selectedFolder?.folderId === 'unfiled';

  return (
    <button
      onClick={() => onFolderSelect({
        type: 'client',
        folderId: 'unfiled',
        folderName: 'Unfiled',
      })}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors rounded-md",
        selected
          ? "bg-orange-100 text-orange-900"
          : "hover:bg-gray-100 text-orange-600/70"
      )}
    >
      {selected ? (
        <FolderOpen className="w-4 h-4 text-orange-400 flex-shrink-0" />
      ) : (
        <Folder className="w-4 h-4 text-orange-300 flex-shrink-0" />
      )}
      <span className="flex-1 text-left truncate min-w-0 italic">Unfiled</span>
      <span className="text-xs text-orange-400 flex-shrink-0 ml-auto">({count})</span>
    </button>
  );
}

export default function FolderBrowser({
  clientId,
  clientName,
  clientType,
  selectedFolder,
  onFolderSelect,
}: FolderBrowserProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedProjectFolders, setExpandedProjectFolders] = useState<Set<string>>(new Set());
  const [addFolderTarget, setAddFolderTarget] = useState<AddFolderTarget>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isAddingFolder, setIsAddingFolder] = useState(false);

  // Queries
  const clientFolders = useQuery(api.clients.getClientFolders, { clientId });
  const folderCounts = useQuery(api.documents.getFolderCounts, { clientId });
  const projects = useQuery(api.projects.list, { clientId });
  const projectFoldersMap = useQuery(api.documents.getProjectFolderCounts, { clientId });
  const allProjectFolders = useQuery(api.projects.getAllProjectFoldersForClient, { clientId });

  // Mutations
  const addClientFolder = useMutation(api.clients.addCustomFolder);
  const deleteClientFolder = useMutation(api.clients.deleteCustomFolder);
  const addProjectFolder = useMutation(api.projects.addCustomProjectFolder);
  const deleteProjectFolder = useMutation(api.projects.deleteCustomProjectFolder);

  // Build client folders with counts
  const clientFoldersWithCounts = useMemo(() => {
    if (!clientFolders) return [];
    const counts = folderCounts?.clientFolders || {};

    return clientFolders.map(folder => ({
      ...folder,
      _id: folder._id.toString(),
      documentCount: counts[folder.folderType] || 0,
      isCustom: folder.isCustom,
    }));
  }, [clientFolders, folderCounts]);

  // Compute client-level unfiled count
  const clientUnfiledCount = useMemo(() => {
    const total = folderCounts?.clientTotal || 0;
    const filedCount = clientFoldersWithCounts.reduce((sum, f) => sum + f.documentCount, 0);
    return total - filedCount;
  }, [folderCounts, clientFoldersWithCounts]);

  // Handle adding a new folder
  const handleAddFolder = async () => {
    if (!newFolderName.trim() || !addFolderTarget) return;
    
    setIsAddingFolder(true);
    try {
      if (addFolderTarget.type === 'client') {
        await addClientFolder({
          clientId,
          name: newFolderName.trim(),
        });
      } else {
        await addProjectFolder({
          projectId: addFolderTarget.projectId,
          name: newFolderName.trim(),
          parentFolderId: addFolderTarget.parentFolderId,
        });
      }
      setAddFolderTarget(null);
      setNewFolderName('');
    } catch (error) {
      console.error('Failed to add folder:', error);
      alert(error instanceof Error ? error.message : 'Failed to add folder');
    } finally {
      setIsAddingFolder(false);
    }
  };

  // Handle deleting a custom folder
  const handleDeleteFolder = async (
    folderId: string, 
    folderName: string, 
    type: 'client' | 'project'
  ) => {
    if (!confirm(`Delete folder "${folderName}"? Documents inside will be moved to the parent folder. This cannot be undone.`)) return;
    
    try {
      if (type === 'client') {
        await deleteClientFolder({ folderId: folderId as Id<"clientFolders"> });
      } else {
        await deleteProjectFolder({ folderId: folderId as Id<"projectFolders"> });
      }
    } catch (error) {
      console.error('Failed to delete folder:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete folder');
    }
  };

  // Build projects with folders and counts - using actual folders from database
  const projectsWithFolders = useMemo((): ProjectWithFolders[] => {
    if (!projects) return [];
    const projectCounts = projectFoldersMap || {};
    const projectFoldersData = allProjectFolders || {};
    
    return projects.map(project => {
      const projectData = projectCounts[project._id] || { folders: {}, total: 0 };
      const actualFolders = projectFoldersData[project._id] || [];
      
      // Use actual folders from database, with document counts
      const folders = actualFolders.map(folder => ({
        _id: folder._id,
        folderType: folder.folderType,
        name: folder.name,
        parentFolderId: folder.parentFolderId,
        documentCount: (projectData.folders?.[folder.folderType] as number) || 0,
        isCustom: folder.isCustom,
      }));
      
      const filedCount = folders.reduce((sum, f) => sum + f.documentCount, 0);
      const total = projectData.total || 0;

      return {
        _id: project._id,
        name: project.name,
        projectShortcode: project.projectShortcode,
        folders,
        totalDocuments: total,
        unfiledCount: total - filedCount,
      };
    });
  }, [projects, projectFoldersMap, allProjectFolders]);

  const toggleProject = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  const isSelected = (folderId: string, type: 'client' | 'project') => {
    return selectedFolder?.folderId === folderId && selectedFolder?.type === type;
  };

  // Build nested folder structure for client folders
  const { rootFolders, childFolders } = useMemo(() => {
    const root: FolderWithCount[] = [];
    const children: Record<string, FolderWithCount[]> = {};

    for (const folder of clientFoldersWithCounts) {
      if (folder.parentFolderId) {
        if (!children[folder.parentFolderId]) {
          children[folder.parentFolderId] = [];
        }
        children[folder.parentFolderId].push(folder);
      } else {
        root.push(folder);
      }
    }

    return { rootFolders: root, childFolders: children };
  }, [clientFoldersWithCounts]);

  // Build nested folder structure for project folders within a project
  const buildProjectFolderTree = (folders: FolderWithCount[]) => {
    const root: FolderWithCount[] = [];
    const children: Record<string, FolderWithCount[]> = {};

    for (const folder of folders) {
      if (folder.parentFolderId) {
        if (!children[folder.parentFolderId]) {
          children[folder.parentFolderId] = [];
        }
        children[folder.parentFolderId].push(folder);
      } else {
        root.push(folder);
      }
    }

    // Compute aggregated counts (bottom-up: include all descendant docs)
    const aggregatedCounts: Record<string, number> = {};
    const computeAggregated = (folderId: string, directCount: number): number => {
      const childList = children[folderId] || [];
      let total = directCount;
      for (const child of childList) {
        total += computeAggregated(child._id, child.documentCount);
      }
      aggregatedCounts[folderId] = total;
      return total;
    };
    for (const folder of root) {
      computeAggregated(folder._id, folder.documentCount);
    }

    return { root, children, aggregatedCounts };
  };

  // Build parent path for breadcrumbs when selecting a subfolder
  const buildParentPath = (folderId: string, allFolders: FolderWithCount[]): Array<{ folderId: string; folderName: string }> => {
    const folderMap = new Map(allFolders.map(f => [f._id, f]));
    const path: Array<{ folderId: string; folderName: string }> = [];
    let current = folderMap.get(folderId);
    while (current?.parentFolderId) {
      const parent = folderMap.get(current.parentFolderId);
      if (parent) {
        path.unshift({ folderId: parent.folderType, folderName: parent.name });
        current = parent;
      } else {
        break;
      }
    }
    return path;
  };

  const toggleProjectFolder = (folderId: string) => {
    const newExpanded = new Set(expandedProjectFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedProjectFolders(newExpanded);
  };

  const renderProjectFolder = (
    folder: FolderWithCount,
    projectId: Id<"projects">,
    projectName: string,
    allFolders: FolderWithCount[],
    childMap: Record<string, FolderWithCount[]>,
    aggregatedCounts: Record<string, number>,
    depth: number = 0
  ) => {
    const children = childMap[folder._id] || [];
    const hasChildren = children.length > 0;
    const selected = isSelected(folder.folderType, 'project') &&
      selectedFolder?.projectId === projectId;
    const isExpanded = expandedProjectFolders.has(folder._id);
    const displayCount = aggregatedCounts[folder._id] ?? folder.documentCount;

    return (
      <div key={folder._id} className="group/projfolder">
        <button
          onClick={() => onFolderSelect({
            type: 'project',
            folderId: folder.folderType,
            folderName: folder.name,
            projectId,
            parentPath: buildParentPath(folder._id, allFolders),
          })}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors rounded-md",
            selected
              ? "bg-blue-100 text-blue-900"
              : "hover:bg-gray-100 text-gray-700",
            depth > 0 && "ml-4"
          )}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleProjectFolder(folder._id);
              }}
              className="p-0 hover:bg-gray-200 rounded flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              )}
            </button>
          )}
          {selected ? (
            <FolderOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
          ) : (
            <Folder className={cn(
              "w-4 h-4 flex-shrink-0",
              folder.isCustom ? "text-purple-500" : "text-amber-500"
            )} />
          )}
          <span className="flex-1 text-left truncate min-w-0">{folder.name}</span>
          {folder.isCustom && (
            <Sparkles className="w-3 h-3 text-purple-400 flex-shrink-0" />
          )}
          <span className="text-xs text-gray-400 flex-shrink-0 ml-auto">({displayCount})</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setAddFolderTarget({
                type: 'project',
                projectId,
                projectName,
                parentFolderId: folder._id as Id<"projectFolders">,
                parentFolderName: folder.name,
              });
            }}
            className="opacity-0 group-hover/projfolder:opacity-100 p-0.5 hover:bg-gray-200 rounded transition-opacity flex-shrink-0"
            title="Add subfolder"
          >
            <Plus className="w-3 h-3 text-gray-500" />
          </button>
          {folder.isCustom && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(folder._id, folder.name, 'project');
              }}
              className="opacity-0 group-hover/projfolder:opacity-100 p-0.5 hover:bg-red-100 rounded transition-opacity flex-shrink-0"
            >
              <Trash2 className="w-3 h-3 text-red-500" />
            </button>
          )}
        </button>
        {hasChildren && isExpanded && (
          <div className="ml-2 border-l border-gray-200">
            {children.map(child => renderProjectFolder(
              child, projectId, projectName, allFolders, childMap, aggregatedCounts, depth + 1
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderClientFolder = (folder: FolderWithCount, depth: number = 0) => {
    const children = childFolders[folder._id] || [];
    const hasChildren = children.length > 0;
    const selected = isSelected(folder.folderType, 'client');

    return (
      <div key={folder._id} className="group">
        <button
          onClick={() => onFolderSelect({
            type: 'client',
            folderId: folder.folderType,
            folderName: folder.name,
          })}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors rounded-md",
            selected
              ? "bg-blue-100 text-blue-900"
              : "hover:bg-gray-100 text-gray-700",
            depth > 0 && "ml-4"
          )}
        >
          {selected ? (
            <FolderOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
          ) : (
            <Folder className={cn(
              "w-4 h-4 flex-shrink-0",
              folder.isCustom ? "text-purple-500" : "text-amber-500"
            )} />
          )}
          <span className="flex-1 text-left truncate min-w-0">{folder.name}</span>
          {folder.isCustom && (
            <Sparkles className="w-3 h-3 text-purple-400 flex-shrink-0" />
          )}
          <span className="text-xs text-gray-400 flex-shrink-0 ml-auto">({folder.documentCount})</span>
          {folder.isCustom && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(folder._id, folder.name, 'client');
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded transition-opacity"
            >
              <Trash2 className="w-3 h-3 text-red-500" />
            </button>
          )}
        </button>
        {hasChildren && (
          <div className="ml-2 border-l border-gray-200">
            {children.map(child => renderClientFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-[380px] min-w-[320px] border-r border-gray-200 bg-white flex flex-col h-full">
      {/* Client Header */}
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <div className="font-semibold text-gray-900 truncate flex-1">{clientName}</div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={`/clients/${clientId}`}
                  className="p-1 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                <p>View client profile</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {clientType && (
          <Badge
            variant="outline"
            className={cn(
              "text-xs mt-1",
              clientType.toLowerCase() === 'lender'
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-green-50 text-green-700 border-green-200"
            )}
          >
            {clientType}
          </Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="p-2">
          {/* Client-level Folders */}
          <div className="mb-4">
            <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between">
              <span>Client Folders</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setAddFolderTarget({ type: 'client' })}
                      className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Add custom folder</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="space-y-0.5">
              {rootFolders.map(folder => renderClientFolder(folder))}
              <ClientUnfiledFolderRow
                count={clientUnfiledCount}
                selectedFolder={selectedFolder}
                onFolderSelect={onFolderSelect}
              />
            </div>
          </div>

          {/* Projects Section */}
          {projectsWithFolders.length > 0 && (
            <div>
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider border-t border-gray-200 pt-3">
                Projects
              </div>
              <div className="space-y-1 mt-1">
                {projectsWithFolders.map((project) => {
                  const isExpanded = expandedProjects.has(project._id);
                  
                  return (
                    <div key={project._id}>
                      {/* Project Header */}
                      <button
                        onClick={() => toggleProject(project._id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 rounded-md transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                        <Briefcase className="w-4 h-4 text-purple-500 flex-shrink-0" />
                        <div className="flex-1 text-left min-w-0">
                          <div className="font-medium text-gray-900 truncate">
                            {project.name}
                          </div>
                          {project.projectShortcode && (
                            <div className="text-xs text-gray-500 font-mono">
                              {project.projectShortcode}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          ({project.totalDocuments})
                        </span>
                      </button>

                      {/* Project Folders — Tree View */}
                      {isExpanded && (() => {
                        const { root, children: childMap, aggregatedCounts } = buildProjectFolderTree(project.folders);
                        return (
                          <div className="ml-6 space-y-0.5 pb-2">
                            {root.map((folder) => renderProjectFolder(
                              folder, project._id, project.name, project.folders, childMap, aggregatedCounts
                            ))}
                            {/* Unfiled Folder Row */}
                            <UnfiledFolderRow
                              projectId={project._id}
                              count={project.unfiledCount}
                              selectedFolder={selectedFolder}
                              onFolderSelect={onFolderSelect}
                            />
                            {/* Add Custom Folder Button */}
                            <button
                              onClick={() => setAddFolderTarget({
                                type: 'project',
                                projectId: project._id,
                                projectName: project.name
                              })}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                            >
                              <FolderPlus className="w-4 h-4 flex-shrink-0" />
                              <span className="text-xs">Add custom folder...</span>
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {rootFolders.length === 0 && projectsWithFolders.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              No folders available
            </div>
          )}
        </div>
      </div>

      {/* Add Custom Folder Dialog */}
      <Dialog open={addFolderTarget !== null} onOpenChange={(open) => !open && setAddFolderTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-purple-500" />
              Add Custom Folder
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-sm text-gray-500">
              {addFolderTarget?.type === 'client'
                ? `Add a custom folder to ${clientName}`
                : addFolderTarget?.type === 'project'
                  ? addFolderTarget.parentFolderName
                    ? `Add a subfolder inside "${addFolderTarget.parentFolderName}"`
                    : `Add a custom folder to project "${addFolderTarget.projectName}"`
                  : ''
              }
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Folder Name
              </label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g., Special Documents"
                className="w-full"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFolderName.trim()) {
                    handleAddFolder();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddFolderTarget(null);
                setNewFolderName('');
              }}
              disabled={isAddingFolder}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddFolder}
              disabled={!newFolderName.trim() || isAddingFolder}
            >
              {isAddingFolder ? 'Adding...' : 'Add Folder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper to format folder type to display name
function formatFolderName(folderType: string): string {
  return folderType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
