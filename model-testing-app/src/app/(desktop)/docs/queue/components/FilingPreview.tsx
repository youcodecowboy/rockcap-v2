'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Panel, StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Building2, Briefcase, FolderOpen, ChevronRight } from 'lucide-react';

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
  const colors = useColors();

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
      <div
        style={{
          background: colors.bg.light,
          borderRadius: 4,
          padding: 16,
          border: `1px dashed ${colors.border.mid}`,
        }}
      >
        <p style={{ fontSize: 12, color: colors.text.muted, textAlign: 'center' }}>
          Select a client to see filing preview
        </p>
      </div>
    );
  }

  const showMissing = !folderId || (folderType === 'project' && !projectId);

  return (
    <Panel title="Filing Destination">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Client Level */}
        <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
          <Building2 className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.blue }} />
          <span style={{ fontWeight: 500, color: client ? colors.text.primary : colors.text.dim }}>
            {client?.name || 'Loading...'}
          </span>
          {client?.type && (
            <StatusPill
              label={client.type}
              tone={client.type === 'lender' ? colors.accent.blue : colors.accent.green}
            />
          )}
        </div>

        {/* Project Level (if selected) */}
        {projectId && (
          <div className="flex items-center gap-2" style={{ fontSize: 12, marginLeft: 16 }}>
            <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: colors.text.dim, marginLeft: -4 }} />
            <Briefcase className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.purple }} />
            <span style={{ fontWeight: 500, color: project ? colors.text.primary : colors.text.dim }}>
              {project?.name || 'Loading...'}
            </span>
            {project?.projectShortcode && (
              <span
                style={{
                  fontSize: 11,
                  color: colors.text.muted,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                ({project.projectShortcode})
              </span>
            )}
          </div>
        )}

        {/* Folder Level (if selected) */}
        {folderId && folderName && (
          <div className="flex items-center gap-2" style={{ fontSize: 12, marginLeft: projectId ? 32 : 16 }}>
            <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: colors.text.dim, marginLeft: -4 }} />
            <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.orange }} />
            <span style={{ fontWeight: 500, color: colors.accent.orange }}>
              {folderName}
            </span>
          </div>
        )}
      </div>

      {/* Missing selection indicator */}
      {showMissing && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border.light}` }}>
          <p style={{ fontSize: 11, color: colors.accent.orange }}>
            {!projectId && folderType === 'project'
              ? 'Select a project to choose a folder'
              : !folderId
                ? 'Select a folder to complete filing'
                : null}
          </p>
        </div>
      )}
    </Panel>
  );
}
