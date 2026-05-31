'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../convex/_generated/dataModel';
import {
  FileText,
  Briefcase,
  Archive,
  StickyNote,
  Database,
  LayoutGrid,
  Flag,
  Settings,
  Brain,
  CheckSquare,
  ListTodo,
} from 'lucide-react';
import FlagCreationModal from '@/components/FlagCreationModal';
import { FlagIndicator } from '@/components/FlagIndicator';
import RestorationBanner from '@/components/RestorationBanner';
import { useColors } from '@/lib/useColors';
import { EntityDetailScaffold, StatusPill, projectStatusTone, type Kpi, type TabDef, SkeletonText, Button, Modal } from '@/components/layouts';
import { ProjectDetailAside } from './components/ProjectDetailAside';

// Import project-specific components
import ProjectOverviewTab from './components/ProjectOverviewTab';
import ProjectDocumentsTab from './components/ProjectDocumentsTab';
import ProjectNotesTab from './components/ProjectNotesTab';
import ProjectKnowledgeTab from './components/ProjectKnowledgeTab';
import ProjectDataTab from './components/ProjectDataTab';
import ProjectTasksTab from './components/ProjectTasksTab';
import ProjectThreadsTab from './components/ProjectThreadsTab';
import { ProjectIntelligenceTab } from '@/components/IntelligenceTab';
import ProjectSettingsPanel from '@/components/ProjectSettingsPanel';

type TabType = 'overview' | 'documents' | 'intelligence' | 'checklist' | 'threads' | 'data' | 'notes' | 'tasks';

function ProjectDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = params.clientId as Id<"clients">;
  const projectId = params.projectId as Id<"projects">;
  const colors = useColors();

  const initialTab = (searchParams.get('tab') as TabType) || 'overview';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<'general' | 'naming' | 'fields' | 'folders'>('general');
  const [flagModalOpen, setFlagModalOpen] = useState(false);

  // Queries
  const client = useQuery(api.clients.get, { id: clientId });
  const project = useQuery(api.projects.get, { id: projectId });
  const documents = useQuery(api.documents.getByProject, { projectId }) || [];
  const activeTasksCount = useQuery(api.tasks.getActiveCountByProject, { projectId }) || 0;
  const openFlagCount = useQuery(api.flags.getOpenCountByProject, { projectId }) || 0;

  // Get client roles with full client data
  const clientRoles = useMemo(() => {
    if (!project?.clientRoles) return [];
    return project.clientRoles;
  }, [project]);

  // Mutations
  const updateProject = useMutation(api.projects.update);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as TabType);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());
  };

  const handleArchiveProject = async () => {
    if (!project) return;
    try {
      await updateProject({
        id: projectId,
        status: 'inactive',
      });
      setShowArchiveDialog(false);
    } catch (error) {
      console.error('Error archiving project:', error);
      alert('Failed to archive project. Please try again.');
    }
  };

  // Loading state
  if (project === undefined || client === undefined) {
    return (<div style={{ padding: 24 }}><SkeletonText lines={2} /></div>);
  }

  // Not found
  if (!project || !client) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, padding: 48, textAlign: 'center', color: colors.text.muted }}>
          <p style={{ marginBottom: 12 }}>Project not found.</p>
          <Link href={`/clients/${clientId}`} style={{ color: colors.accent.blue, textDecoration: 'underline' }}>Back to Client</Link>
        </div>
      </div>
    );
  }

  // Last activity
  const lastActivity = documents.length > 0
    ? new Date(documents.sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0].uploadedAt)
    : null;

  // Format currency
  const formatCurrency = (amount?: number) => {
    if (!amount) return null;
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'documents', label: 'Documents', icon: FileText, count: documents.length },
    { id: 'tasks', label: 'Tasks', icon: ListTodo, count: activeTasksCount > 0 ? activeTasksCount : undefined },
    { id: 'intelligence', label: 'Intelligence', icon: Brain },
    { id: 'checklist', label: 'Checklist', icon: CheckSquare },
    { id: 'threads', label: 'Threads', icon: Flag, count: openFlagCount > 0 ? openFlagCount : undefined },
    { id: 'data', label: 'Data', icon: Database },
    { id: 'notes', label: 'Notes', icon: StickyNote },
  ];

  const scaffoldTabs: TabDef[] = tabs.map((t) => ({ id: t.id, label: t.label, count: t.count }));

  const kpis: Kpi[] = [
    { label: 'Loan', value: project.loanAmount ? (formatCurrency(project.loanAmount) || '—') : '—', accent: colors.accent.green },
    { label: 'Documents', value: documents.length, accent: colors.entityTypes.project },
    { label: 'Clients', value: clientRoles.length || 1, accent: colors.entityTypes.client },
    { label: 'Last activity', value: lastActivity ? lastActivity.toLocaleDateString() : '—', accent: colors.entityTypes.skillRun },
    { label: 'Created', value: new Date(project.createdAt).toLocaleDateString(), accent: colors.entityTypes.cadence },
  ];

  const actions = (
    <>
      <Button size="sm" variant="ghost" onClick={() => { setSettingsDefaultTab('general'); setShowSettingsPanel(true); }}>
        <Settings className="w-3.5 h-3.5" /> Settings
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setFlagModalOpen(true)} style={{ color: colors.accent.orange }}>
        <Flag className="w-3.5 h-3.5" /> Flag
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setShowArchiveDialog(true)}>
        <Archive className="w-3.5 h-3.5" /> Archive
      </Button>
    </>
  );

  const statusSlot = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <FlagIndicator entityType="project" entityId={projectId} />
      <StatusPill label={project.status ?? 'unknown'} tone={projectStatusTone(project.status, colors)} />
      {project.projectShortcode && (
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: colors.text.muted }}>{project.projectShortcode}</span>
      )}
    </div>
  );

  return (
    <>
      <EntityDetailScaffold
        entityType="project"
        breadcrumbs={[
          { label: 'Clients', type: 'client', onClick: () => router.push('/clients') },
          { label: client.name, type: 'client', onClick: () => router.push(`/clients/${clientId}`) },
          { label: project.name, type: 'project' },
        ]}
        icon={<Briefcase className="w-[18px] h-[18px]" />}
        title={project.name}
        status={statusSlot}
        actions={actions}
        kpis={kpis}
        tabs={scaffoldTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        banner={project.isDeleted ? (
          <RestorationBanner
            entityType="project"
            entityName={project.name}
            entityId={projectId}
            deletedAt={project.deletedAt}
            onRestored={() => {}}
            onPermanentlyDeleted={() => router.push(`/clients/${clientId}?tab=projects`)}
          />
        ) : undefined}
        aside={<ProjectDetailAside project={project} client={client} counts={{ documents: documents.length, clients: clientRoles.length || 1 }} />}
      >
        {activeTab === 'overview' && (
          <ProjectOverviewTab project={project} projectId={projectId} clientId={clientId} client={client} documents={documents} clientRoles={clientRoles} onOpenSettings={() => { setSettingsDefaultTab('general'); setShowSettingsPanel(true); }} onTabChange={handleTabChange} />
        )}
        {activeTab === 'documents' && <ProjectDocumentsTab projectId={projectId} clientId={clientId} clientName={client.name} clientType={client.type} />}
        {activeTab === 'checklist' && <ProjectKnowledgeTab projectId={projectId} projectName={project.name} clientId={clientId} clientName={client.name} clientType={client.type} dealPhase={project.dealPhase} />}
        {activeTab === 'notes' && <ProjectNotesTab projectId={projectId} projectName={project.name} clientId={clientId} />}
        {activeTab === 'tasks' && <ProjectTasksTab projectId={projectId} projectName={project.name} clientId={clientId} />}
        {activeTab === 'threads' && <ProjectThreadsTab projectId={projectId} clientId={clientId} />}
        {activeTab === 'intelligence' && <ProjectIntelligenceTab projectId={projectId} />}
        {activeTab === 'data' && <ProjectDataTab projectId={projectId} projectName={project.name} />}
      </EntityDetailScaffold>

      <Modal
        open={showArchiveDialog}
        onClose={() => setShowArchiveDialog(false)}
        title="Archive project?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowArchiveDialog(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleArchiveProject}>Archive</Button>
          </>
        }
      >
        <p style={{ fontSize: 12, color: colors.text.secondary }}>
          This will archive the project. You can restore it later by changing its status.
        </p>
      </Modal>

      <ProjectSettingsPanel isOpen={showSettingsPanel} onClose={() => setShowSettingsPanel(false)} projectId={projectId} clientId={clientId} defaultTab={settingsDefaultTab} onTrash={() => router.push(`/clients/${clientId}?tab=projects`)} />

      <FlagCreationModal isOpen={flagModalOpen} onClose={() => setFlagModalOpen(false)} entityType="project" entityId={projectId} entityName={project.name} entityContext={client.name} clientId={clientId} projectId={projectId} />
    </>
  );
}

// Loading fallback
function ProjectDetailLoading() {
  return (
    <div style={{ padding: 24 }}>
      <SkeletonText lines={2} />
    </div>
  );
}

// Main export with Suspense boundary
export default function ProjectDetailPage() {
  return (
    <Suspense fallback={<ProjectDetailLoading />}>
      <ProjectDetailContent />
    </Suspense>
  );
}
