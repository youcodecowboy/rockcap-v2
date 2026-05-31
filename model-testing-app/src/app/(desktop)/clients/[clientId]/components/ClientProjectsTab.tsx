'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import {
  Panel,
  DataTable,
  type Column,
  StatusPill,
  EmptyState,
  Button,
  Modal,
  Field,
  Input,
  projectStatusTone,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  FolderKanban,
  Plus,
  Search,
  Trash2,
  ArrowLeft,
} from 'lucide-react';
import { useDocumentsByProject } from '@/lib/documentStorage';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface ClientProjectsTabProps {
  clientId: Id<"clients">;
  clientName: string;
  projects: any[];
}

export default function ClientProjectsTab({
  clientId,
  clientName,
  projects,
}: ClientProjectsTabProps) {
  const colors = useColors();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectShortcode, setNewProjectShortcode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const createProject = useMutation(api.projects.create);
  const deletedProjectsCount = useQuery(api.projects.deletedCountByClient, { clientId });
  const deletedProjects = useQuery(
    api.projects.listDeletedByClient,
    showDeleted ? { clientId } : "skip"
  );

  // Filter projects
  const filteredProjects = projects.filter((project: any) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      project.name?.toLowerCase().includes(query) ||
      project.projectShortcode?.toLowerCase().includes(query) ||
      project.description?.toLowerCase().includes(query)
    );
  });

  // Separate active and other projects
  const activeProjects = filteredProjects.filter((p: any) => p.status === 'active');
  const otherProjects = filteredProjects.filter((p: any) => p.status !== 'active');

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    try {
      const projectId = await createProject({
        name: newProjectName.trim(),
        projectShortcode: newProjectShortcode.trim() || undefined,
        clientRoles: [{ clientId: clientId, role: 'primary' }],
      });

      setShowCreateDialog(false);
      setNewProjectName('');
      setNewProjectShortcode('');

      // Navigate to the new project
      router.push(`/clients/${clientId}/projects/${projectId}`);
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  // Docs count is fetched per-project via a hook; a tiny cell component keeps
  // the hook call legal (one per row) while feeding the count into the table.
  const DocsCount = ({ projectId }: { projectId: Id<"projects"> }) => {
    const documents = useDocumentsByProject(projectId) || [];
    return <>{documents.length}</>;
  };

  const fmtLoan = (amount?: number) =>
    typeof amount === 'number'
      ? `£${amount.toLocaleString('en-GB')}`
      : '—';

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('en-GB') : '—';

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 500, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.name}
          </span>
          {p.projectShortcode && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: colors.text.muted }}>
              {p.projectShortcode}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      width: 120,
      render: (p) => (
        <StatusPill label={p.status || 'unknown'} tone={projectStatusTone(p.status, colors)} />
      ),
    },
    {
      key: 'loan',
      header: 'Loan amount',
      mono: true,
      align: 'right',
      width: 140,
      render: (p) => fmtLoan(p.loanAmount),
    },
    {
      key: 'docs',
      header: 'Docs',
      align: 'right',
      width: 70,
      render: (p) => <DocsCount projectId={p._id} />,
    },
    {
      key: 'activity',
      header: 'Last activity',
      mono: true,
      align: 'right',
      width: 120,
      render: (p) => fmtDate(p.lastActivityDate ?? p.createdAt),
    },
  ];

  const goToProject = (p: any) => router.push(`/clients/${clientId}/projects/${p._id}`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: 1,
            maxWidth: 360,
            padding: '0 10px',
            background: colors.bg.card,
            border: `1px solid ${colors.border.default}`,
            borderRadius: 4,
          }}
        >
          <Search size={14} color={colors.text.muted} style={{ flexShrink: 0 }} />
          <input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '7px 0',
              fontSize: 12,
              color: colors.text.primary,
              background: 'transparent',
              border: 'none',
              outline: 'none',
            }}
          />
        </div>
        <Button variant="primary" accent={colors.entityTypes.project} onClick={() => setShowCreateDialog(true)}>
          <Plus size={14} />
          New Project
        </Button>
      </div>

      {/* Projects */}
      {showDeleted ? (
        <Panel title={`Deleted Projects (${deletedProjects?.length ?? 0})`}>
          <DataTable
            rows={deletedProjects ?? []}
            getRowKey={(p) => p._id}
            onRowClick={goToProject}
            columns={columns}
            empty={
              <EmptyState
                icon={<Trash2 size={28} />}
                title="No deleted projects"
              />
            }
          />
        </Panel>
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={32} />}
          title={searchQuery ? 'No projects found' : 'No projects yet'}
          body={
            searchQuery
              ? 'Try adjusting your search terms'
              : `Create your first project for ${clientName} to get started.`
          }
          action={
            !searchQuery ? (
              <Button variant="primary" accent={colors.entityTypes.project} onClick={() => setShowCreateDialog(true)}>
                <Plus size={14} />
                Create Project
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Active Projects */}
          {activeProjects.length > 0 && (
            <Panel title={`Active Projects (${activeProjects.length})`} accent={colors.entityTypes.project} padded={false}>
              <DataTable
                rows={activeProjects}
                getRowKey={(p) => p._id}
                onRowClick={goToProject}
                columns={columns}
              />
            </Panel>
          )}

          {/* Other Projects */}
          {otherProjects.length > 0 && (
            <Panel title={`Other Projects (${otherProjects.length})`} padded={false}>
              <DataTable
                rows={otherProjects}
                getRowKey={(p) => p._id}
                onRowClick={goToProject}
                columns={columns}
              />
            </Panel>
          )}
        </div>
      )}

      {/* Show Deleted Toggle */}
      {(deletedProjectsCount ?? 0) > 0 && (
        <div>
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: colors.text.muted,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {showDeleted ? (
              <>
                <ArrowLeft size={12} />
                Back to active projects
              </>
            ) : (
              <>
                <Trash2 size={12} />
                Show deleted ({deletedProjectsCount})
              </>
            )}
          </button>
        </div>
      )}

      {/* Create Project Modal */}
      <Modal
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        title="Create New Project"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateDialog(false);
                setNewProjectName('');
                setNewProjectShortcode('');
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              accent={colors.entityTypes.project}
              onClick={handleCreateProject}
              disabled={!newProjectName.trim() || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Project'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 11, color: colors.text.muted }}>
            Create a new project for {clientName}
          </div>
          <Field label="Project Name">
            <Input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="e.g., Wimbledon Development Phase 2"
              autoFocus
            />
          </Field>
          <Field label="Project Shortcode" hint="Max 10 characters. Used for document naming.">
            <Input
              value={newProjectShortcode}
              onChange={(e) => setNewProjectShortcode(e.target.value.toUpperCase().slice(0, 10))}
              placeholder="e.g., WIMBDEV2"
              maxLength={10}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
