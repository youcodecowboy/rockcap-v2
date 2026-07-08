'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button, IconButton, Field, Input, Modal, StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { toast } from 'sonner';
import { showUndoToast } from '@/components/UndoToast';
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
import EditableClientTypeBadge from '@/components/EditableClientTypeBadge';

interface FolderBrowserProps {
  clientId: Id<"clients">;
  clientName: string;
  clientType?: string;
  selectedFolder: FolderSelection | null;
  onFolderSelect: (folder: FolderSelection | null) => void;
  projectFilter?: Id<"projects">;
  onClientTypeChange?: (newType: string) => void;
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
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  projectId: Id<"projects">;
  count: number;
  selectedFolder: FolderSelection | null;
  onFolderSelect: (folder: FolderSelection) => void;
  isDropTarget?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  const colors = useColors();
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
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md"
      style={{
        background: selected ? `${colors.accent.orange}20` : isDropTarget ? `${colors.accent.orange}15` : 'transparent',
        color: selected ? colors.accent.orange : `${colors.accent.orange}b0`,
        border: `1px ${isDropTarget ? 'dashed' : 'solid'} ${isDropTarget ? colors.accent.orange : 'transparent'}`,
        transition: 'background 100ms linear',
      }}
      onMouseEnter={(e) => { if (!selected && !isDropTarget) e.currentTarget.style.background = colors.bg.cardAlt; }}
      onMouseLeave={(e) => { if (!selected && !isDropTarget) e.currentTarget.style.background = 'transparent'; }}
    >
      {selected ? (
        <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.orange }} />
      ) : (
        <Folder className="w-4 h-4 flex-shrink-0" style={{ color: `${colors.accent.orange}90` }} />
      )}
      <span className="flex-1 text-left truncate min-w-0 italic">Unfiled</span>
      <span className="text-xs flex-shrink-0 ml-auto" style={{ color: colors.accent.orange }}>({count})</span>
    </button>
  );
}

// Client-level unfiled folder row
function ClientUnfiledFolderRow({
  count,
  selectedFolder,
  onFolderSelect,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  count: number;
  selectedFolder: FolderSelection | null;
  onFolderSelect: (folder: FolderSelection) => void;
  isDropTarget?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  const colors = useColors();
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
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md"
      style={{
        background: selected ? `${colors.accent.orange}20` : isDropTarget ? `${colors.accent.orange}15` : 'transparent',
        color: selected ? colors.accent.orange : `${colors.accent.orange}b0`,
        border: `1px ${isDropTarget ? 'dashed' : 'solid'} ${isDropTarget ? colors.accent.orange : 'transparent'}`,
        transition: 'background 100ms linear',
      }}
      onMouseEnter={(e) => { if (!selected && !isDropTarget) e.currentTarget.style.background = colors.bg.cardAlt; }}
      onMouseLeave={(e) => { if (!selected && !isDropTarget) e.currentTarget.style.background = 'transparent'; }}
    >
      {selected ? (
        <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.orange }} />
      ) : (
        <Folder className="w-4 h-4 flex-shrink-0" style={{ color: `${colors.accent.orange}90` }} />
      )}
      <span className="flex-1 text-left truncate min-w-0 italic">Unfiled</span>
      <span className="text-xs flex-shrink-0 ml-auto" style={{ color: colors.accent.orange }}>({count})</span>
    </button>
  );
}

export default function FolderBrowser({
  clientId,
  clientName,
  clientType,
  selectedFolder,
  onFolderSelect,
  onClientTypeChange,
}: FolderBrowserProps) {
  const colors = useColors();
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

  const bulkMove = useMutation(api.documents.bulkMove);

  // Drop target state
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const handleFolderDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(folderId);
  }, []);

  const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetId(null);
  }, []);

  const handleFolderDrop = useCallback(async (
    e: React.DragEvent,
    targetFolder: {
      type: "client" | "project";
      folderId: string;
      folderName: string;
      projectId?: string;
      clientId: string;
    }
  ) => {
    e.preventDefault();
    setDropTargetId(null);

    const data = e.dataTransfer.getData("application/x-document-ids");
    if (!data) return;

    const docIds: string[] = JSON.parse(data);
    if (docIds.length === 0) return;

    const count = docIds.length;

    try {
      // Always use bulkMove — it correctly sets folderId/folderType.
      // moveDocument only updates projectId/isBaseDocument, not the folder.
      await bulkMove({
        documentIds: docIds as Id<"documents">[],
        targetScope: "client",
        targetClientId: targetFolder.clientId as Id<"clients">,
        targetProjectId: targetFolder.projectId as Id<"projects"> | undefined,
        targetFolderId: targetFolder.folderId,
        targetFolderType: targetFolder.type,
      });

      showUndoToast({
        message: `Moved ${count} file${count !== 1 ? "s" : ""} to ${targetFolder.folderName}`,
        onUndo: async () => {
          toast.info("Use the Move option to move files back to their original folder");
        },
      });
    } catch (error) {
      toast.error(`Failed to move file${count !== 1 ? "s" : ""}`);
    }
  }, [bulkMove]);

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


  // Sibling ordering: explicit `order` first (template/backfill-stamped), unset
  // orders last, name as the stable tie-break.
  const byFolderOrder = (a: FolderWithCount, b: FolderWithCount) =>
    ((a as any).order ?? Number.MAX_SAFE_INTEGER) - ((b as any).order ?? Number.MAX_SAFE_INTEGER) ||
    a.name.localeCompare(b.name);

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

    root.sort(byFolderOrder);
    for (const list of Object.values(children)) list.sort(byFolderOrder);

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

    root.sort(byFolderOrder);
    for (const list of Object.values(children)) list.sort(byFolderOrder);

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
    const isDrop = dropTargetId === folder._id;

    return (
      <div key={folder._id} className="group/projfolder">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onFolderSelect({
            type: 'project',
            folderId: folder.folderType,
            folderName: folder.name,
            projectId,
            parentPath: buildParentPath(folder._id, allFolders),
          })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onFolderSelect({
                type: 'project',
                folderId: folder.folderType,
                folderName: folder.name,
                projectId,
                parentPath: buildParentPath(folder._id, allFolders),
              });
            }
          }}
          onDragOver={(e) => handleFolderDragOver(e, folder._id)}
          onDragLeave={handleFolderDragLeave}
          onDrop={(e) => handleFolderDrop(e, {
            type: "project",
            folderId: folder.folderType,
            folderName: folder.name,
            projectId,
            clientId: clientId,
          })}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md cursor-pointer",
            depth > 0 && "ml-4",
          )}
          style={{
            background: selected ? `${colors.accent.blue}15` : isDrop ? `${colors.accent.orange}15` : 'transparent',
            color: selected ? colors.accent.blue : colors.text.secondary,
            border: `1px ${isDrop ? 'dashed' : 'solid'} ${isDrop ? colors.accent.orange : selected ? `${colors.accent.blue}40` : 'transparent'}`,
            transition: 'background 100ms linear',
          }}
          onMouseEnter={(e) => { if (!selected && !isDrop) e.currentTarget.style.background = colors.bg.cardAlt; }}
          onMouseLeave={(e) => { if (!selected && !isDrop) e.currentTarget.style.background = 'transparent'; }}
        >
          {hasChildren && (
            <IconButton
              label={isExpanded ? 'Collapse' : 'Expand'}
              style={{ width: 18, height: 18 }}
              onClick={(e) => {
                e.stopPropagation();
                toggleProjectFolder(folder._id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </IconButton>
          )}
          {selected ? (
            <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.yellow }} />
          ) : (
            <Folder className="w-4 h-4 flex-shrink-0" style={{ color: folder.isCustom ? colors.accent.purple : colors.accent.yellow }} />
          )}
          <span className="flex-1 text-left truncate min-w-0">{folder.name}</span>
          {folder.isCustom && (
            <Sparkles className="w-3 h-3 flex-shrink-0" style={{ color: colors.accent.purple }} />
          )}
          <span className="text-xs flex-shrink-0 ml-auto" style={{ color: colors.text.dim }}>({displayCount})</span>
          <span
            className="opacity-0 group-hover/projfolder:opacity-100 flex-shrink-0"
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
          >
            <IconButton label="Add subfolder" style={{ width: 20, height: 20 }}>
              <Plus className="w-3 h-3" />
            </IconButton>
          </span>
          {folder.isCustom && (
            <span
              className="opacity-0 group-hover/projfolder:opacity-100 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(folder._id, folder.name, 'project');
              }}
            >
              <IconButton label="Delete folder" style={{ width: 20, height: 20 }}>
                <Trash2 className="w-3 h-3" style={{ color: colors.accent.red }} />
              </IconButton>
            </span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="ml-2" style={{ borderLeft: `1px solid ${colors.border.default}` }}>
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
    const isDrop = dropTargetId === folder._id;

    return (
      <div key={folder._id} className="group">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onFolderSelect({
            type: 'client',
            folderId: folder.folderType,
            folderName: folder.name,
          })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onFolderSelect({
                type: 'client',
                folderId: folder.folderType,
                folderName: folder.name,
              });
            }
          }}
          onDragOver={(e) => handleFolderDragOver(e, folder._id)}
          onDragLeave={handleFolderDragLeave}
          onDrop={(e) => handleFolderDrop(e, {
            type: "client",
            folderId: folder.folderType,
            folderName: folder.name,
            clientId: clientId,
          })}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md cursor-pointer",
            depth > 0 && "ml-4",
          )}
          style={{
            background: selected ? `${colors.accent.blue}15` : isDrop ? `${colors.accent.orange}15` : 'transparent',
            color: selected ? colors.accent.blue : colors.text.secondary,
            border: `1px ${isDrop ? 'dashed' : 'solid'} ${isDrop ? colors.accent.orange : selected ? `${colors.accent.blue}40` : 'transparent'}`,
            transition: 'background 100ms linear',
          }}
          onMouseEnter={(e) => { if (!selected && !isDrop) e.currentTarget.style.background = colors.bg.cardAlt; }}
          onMouseLeave={(e) => { if (!selected && !isDrop) e.currentTarget.style.background = 'transparent'; }}
        >
          {selected ? (
            <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.yellow }} />
          ) : (
            <Folder className="w-4 h-4 flex-shrink-0" style={{ color: folder.isCustom ? colors.accent.purple : colors.accent.yellow }} />
          )}
          <span className="flex-1 text-left truncate min-w-0">{folder.name}</span>
          {folder.isCustom && (
            <Sparkles className="w-3 h-3 flex-shrink-0" style={{ color: colors.accent.purple }} />
          )}
          <span className="text-xs flex-shrink-0 ml-auto" style={{ color: colors.text.dim }}>({folder.documentCount})</span>
          {folder.isCustom && (
            <span
              className="opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(folder._id, folder.name, 'client');
              }}
            >
              <IconButton label="Delete folder" style={{ width: 20, height: 20 }}>
                <Trash2 className="w-3 h-3" style={{ color: colors.accent.red }} />
              </IconButton>
            </span>
          )}
        </div>
        {hasChildren && (
          <div className="ml-2" style={{ borderLeft: `1px solid ${colors.border.default}` }}>
            {children.map(child => renderClientFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const sectionHeader: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: colors.text.muted,
    fontWeight: 500,
  };

  return (
    <div
      className="w-[380px] min-w-[320px] flex flex-col h-full"
      style={{ borderRight: `1px solid ${colors.border.default}`, background: colors.bg.card }}
    >
      {/* Client Header */}
      <div className="p-3" style={{ borderBottom: `1px solid ${colors.border.default}`, background: colors.bg.light }}>
        <div className="flex items-center gap-2">
          <div className="font-semibold truncate flex-1" style={{ color: colors.text.primary }}>{clientName}</div>
          <Link href={`/clients/${clientId}`} title="View client profile" className="flex-shrink-0">
            <IconButton label="View client profile">
              <ExternalLink className="w-3.5 h-3.5" />
            </IconButton>
          </Link>
        </div>
        {clientType && onClientTypeChange && (
          <div className="mt-1">
            <EditableClientTypeBadge
              type={clientType}
              onTypeChange={onClientTypeChange}
              compact
            />
          </div>
        )}
        {clientType && !onClientTypeChange && (
          <div className="mt-1">
            <StatusPill
              label={clientType}
              tone={clientType.toLowerCase() === 'lender' ? colors.entityTypes.lender : colors.entityTypes.client}
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="p-2">
          {/* Client-level Folders */}
          <div className="mb-4">
            <div className="px-3 py-1 flex items-center justify-between" style={sectionHeader}>
              <span>Client Folders</span>
              <span onClick={() => setAddFolderTarget({ type: 'client' })}>
                <IconButton label="Add custom folder" style={{ width: 20, height: 20 }}>
                  <Plus className="w-3.5 h-3.5" />
                </IconButton>
              </span>
            </div>
            <div className="space-y-0.5">
              {rootFolders.map(folder => renderClientFolder(folder))}
              <ClientUnfiledFolderRow
                count={clientUnfiledCount}
                selectedFolder={selectedFolder}
                onFolderSelect={onFolderSelect}
                isDropTarget={dropTargetId === 'client-unfiled'}
                onDragOver={(e) => handleFolderDragOver(e, 'client-unfiled')}
                onDragLeave={handleFolderDragLeave}
                onDrop={(e) => handleFolderDrop(e, {
                  type: "client",
                  folderId: "unfiled",
                  folderName: "Unfiled",
                  clientId: clientId,
                })}
              />
            </div>
          </div>

          {/* Projects Section */}
          {projectsWithFolders.length > 0 && (
            <div>
              <div className="px-3 py-1 pt-3" style={{ ...sectionHeader, borderTop: `1px solid ${colors.border.default}` }}>
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
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md"
                        style={{ background: 'transparent', transition: 'background 100ms linear' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardAlt; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.dim }} />
                        ) : (
                          <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.dim }} />
                        )}
                        <Briefcase className="w-4 h-4 flex-shrink-0" style={{ color: colors.entityTypes.project }} />
                        <div className="flex-1 text-left min-w-0">
                          <div className="font-medium truncate" style={{ color: colors.text.primary }}>
                            {project.name}
                          </div>
                          {project.projectShortcode && (
                            <div className="text-xs" style={{ fontFamily: 'ui-monospace, monospace', color: colors.text.muted }}>
                              {project.projectShortcode}
                            </div>
                          )}
                        </div>
                        <span className="text-xs flex-shrink-0" style={{ color: colors.text.dim }}>
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
                              isDropTarget={dropTargetId === `project-unfiled-${project._id}`}
                              onDragOver={(e) => handleFolderDragOver(e, `project-unfiled-${project._id}`)}
                              onDragLeave={handleFolderDragLeave}
                              onDrop={(e) => handleFolderDrop(e, {
                                type: "project",
                                folderId: "unfiled",
                                folderName: "Unfiled",
                                projectId: project._id,
                                clientId: clientId,
                              })}
                            />
                            {/* Add Custom Folder Button */}
                            <button
                              onClick={() => setAddFolderTarget({
                                type: 'project',
                                projectId: project._id,
                                projectName: project.name
                              })}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md"
                              style={{ color: colors.text.dim, transition: 'background 100ms linear' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardAlt; e.currentTarget.style.color = colors.text.muted; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.text.dim; }}
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
            <div className="text-center py-8 text-sm" style={{ color: colors.text.muted }}>
              No folders available
            </div>
          )}
        </div>
      </div>

      {/* Add Custom Folder Dialog */}
      <Modal
        open={addFolderTarget !== null}
        onClose={() => { setAddFolderTarget(null); setNewFolderName(''); }}
        title="Add Custom Folder"
        width={400}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => { setAddFolderTarget(null); setNewFolderName(''); }}
              disabled={isAddingFolder}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAddFolder}
              disabled={!newFolderName.trim() || isAddingFolder}
            >
              {isAddingFolder ? 'Adding...' : 'Add Folder'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="text-sm" style={{ color: colors.text.muted }}>
            {addFolderTarget?.type === 'client'
              ? `Add a custom folder to ${clientName}`
              : addFolderTarget?.type === 'project'
                ? addFolderTarget.parentFolderName
                  ? `Add a subfolder inside "${addFolderTarget.parentFolderName}"`
                  : `Add a custom folder to project "${addFolderTarget.projectName}"`
                : ''
            }
          </div>
          <Field label="Folder Name">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g., Special Documents"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  handleAddFolder();
                }
              }}
            />
          </Field>
        </div>
      </Modal>
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
