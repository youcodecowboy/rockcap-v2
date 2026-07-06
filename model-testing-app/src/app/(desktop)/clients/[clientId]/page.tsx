'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import {
  useClient,
  useProjectsByClient,
  useUpdateClient,
  useContactsByClient,
} from '@/lib/clientStorage';
import { useDocumentsByClient } from '@/lib/documentStorage';
import EditableStatusBadge from '@/components/EditableStatusBadge';
import EditableClientTypeBadge from '@/components/EditableClientTypeBadge';
import {
  Building2,
  Archive,
  Plus,
  Settings,
  Flag,
  Network,
} from 'lucide-react';
import KnowledgeGraphDrawer from '@/components/knowledge/KnowledgeGraphDrawer';
import FlagCreationModal from '@/components/FlagCreationModal';
import { FlagIndicator } from '@/components/FlagIndicator';
import RestorationBanner from '@/components/RestorationBanner';
import { useColors } from '@/lib/useColors';
import {
  EntityDetailScaffold,
  type Kpi,
  type TabDef,
  SkeletonText,
  Button,
  Modal,
} from '@/components/layouts';
import { ClientDetailAside } from './components/ClientDetailAside';

// Import tab components
import ClientDocumentLibrary from './components/ClientDocumentLibrary';
import ClientOverviewTab from './components/ClientOverviewTab';
import ClientProjectsTab from './components/ClientProjectsTab';
import ClientCommunicationsTab from './components/ClientCommunicationsTab';
import ClientDataTab from './components/ClientDataTab';
import ClientCompanyTab from './components/ClientCompanyTab';
import ClientNotesTab from './components/ClientNotesTab';
import ClientKnowledgeTab from './components/ClientKnowledgeTab';
import ClientContactsTab from './components/ClientContactsTab';
import ClientMeetingsTab from './components/ClientMeetingsTab';
import ClientTasksTab from './components/ClientTasksTab';
import ClientThreadsTab from './components/ClientThreadsTab';
import { ClientIntelligenceTab } from '@/components/IntelligenceTab';
import ClientBeauhurstCards from './components/ClientBeauhurstCards';
import ClientDealsTab from './components/ClientDealsTab';
import ClientActivityTab from './components/ClientActivityTab';
import ClientSettingsPanel from '@/components/ClientSettingsPanel';

type TabType = 'overview' | 'company' | 'documents' | 'projects' | 'communications' | 'contacts' | 'data' | 'intelligence' | 'checklist' | 'notes' | 'meetings' | 'tasks' | 'threads' | 'deals' | 'activity';

function ClientProfileContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientIdParam = params.clientId as string;
  const clientId = clientIdParam as Id<"clients">;

  // Get initial tab from URL params
  const initialTab = (searchParams.get('tab') as TabType) || 'overview';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<'general' | 'naming' | 'fields' | 'folders'>('general');

  // Convex hooks
  const client = useClient(clientId);
  const allClients = useQuery(api.clients.list, {});
  const projects = useProjectsByClient(clientId) || [];
  const documents = useDocumentsByClient(clientId) || [];
  const contacts = useContactsByClient(clientId) || [];
  const meetingsCount = useQuery(api.meetings.getCountByClient, { clientId }) || 0;
  const activeTasksCount = useQuery(api.tasks.getActiveCountByClient, { clientId }) || 0;
  const openFlagCount = useQuery(api.flags.getOpenCountByClient, { clientId }) || 0;
  // Primary HubSpot company for this client — powers the header chip strip
  // (Task A sub-item: desktop HubSpot chips in client header). Same query
  // the mobile client profile + the ClientHubSpotSection use.
  const promotedCompanies = useQuery(api.companies.listByPromotedClient, { clientId });
  const primaryCompany = promotedCompanies?.[0];

  // Mutations
  const updateClientMutation = useUpdateClient();

  const colors = useColors();

  // Computed values
  const activeProjects = projects.filter((p: any) => p.status === 'active');
  const customTypes = useMemo(() => {
    const types = new Set<string>();
    allClients?.forEach((c: any) => { if (c.type) types.add(c.type.toLowerCase()); });
    return Array.from(types);
  }, [allClients]);
  const communications = useMemo(() => {
    return documents.map(doc => ({
      id: doc._id as string,
      type: 'document' as const,
      date: doc.uploadedAt,
      participants: [],
      documentId: doc._id as string,
      summary: doc.summary,
    }));
  }, [documents]);

  const handleStatusChange = async (newStatus: 'prospect' | 'active' | 'archived' | 'past') => {
    await updateClientMutation({
      id: clientId,
      status: newStatus,
    });
  };

  const handleTypeChange = async (newType: string) => {
    await updateClientMutation({
      id: clientId,
      type: newType,
    });
  };

  const handleArchiveClient = async () => {
    if (!client) return;
    try {
      await updateClientMutation({
        id: clientId,
        status: 'archived',
      });
      setShowArchiveDialog(false);
      router.push('/clients');
    } catch (error) {
      console.error('Error archiving client:', error);
      alert('Failed to archive client. Please try again.');
    }
  };

  // Update URL when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab as TabType);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());
  };

  // Loading state
  if (client === undefined) {
    return (
      <div style={{ padding: 24 }}>
        <SkeletonText lines={2} />
      </div>
    );
  }

  // Not found
  if (!client) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, padding: 48, textAlign: 'center', color: colors.text.muted }}>
          <p style={{ marginBottom: 12 }}>Client not found.</p>
          <Link href="/clients" style={{ color: colors.accent.blue, textDecoration: 'underline' }}>Back to Clients</Link>
        </div>
      </div>
    );
  }

  // Last activity
  const lastActivity = documents.length > 0 
    ? new Date(documents.sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0].uploadedAt)
    : null;

  const tabs: TabDef[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'company', label: 'Company' },
    { id: 'deals', label: 'Deals' },
    { id: 'activity', label: 'Activity' },
    { id: 'documents', label: 'Documents', count: documents.length },
    { id: 'projects', label: 'Projects', count: projects.length },
    { id: 'contacts', label: 'Contacts', count: contacts.length },
    { id: 'tasks', label: 'Tasks', count: activeTasksCount > 0 ? activeTasksCount : undefined },
    { id: 'threads', label: 'Threads', count: openFlagCount > 0 ? openFlagCount : undefined },
    { id: 'communications', label: 'Communications', count: communications.length },
    { id: 'meetings', label: 'Meetings', count: meetingsCount },
    { id: 'data', label: 'Data' },
    { id: 'intelligence', label: 'Intelligence' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'notes', label: 'Notes' },
  ];

  const kpis: Kpi[] = [
    { label: 'Projects', value: projects.length, meta: activeProjects.length ? `${activeProjects.length} active` : 'none active', accent: colors.entityTypes.project },
    { label: 'Documents', value: documents.length, accent: colors.entityTypes.client },
    { label: 'Contacts', value: contacts.length, accent: colors.entityTypes.contact },
    { label: 'Meetings', value: meetingsCount, accent: colors.entityTypes.cadence },
    { label: 'Last activity', value: lastActivity ? lastActivity.toLocaleDateString() : '—', accent: colors.entityTypes.skillRun },
  ];

  const actions = (
    <>
      <Button size="sm" variant="ghost" onClick={() => setGraphOpen(true)} title="Knowledge graph">
        <Network className="w-3.5 h-3.5" /> Knowledge graph
      </Button>
      <Button size="sm" variant="ghost" onClick={() => { setSettingsDefaultTab('general'); setShowSettingsPanel(true); }}>
        <Settings className="w-3.5 h-3.5" /> Settings
      </Button>
      <Button size="sm" variant="primary" accent={colors.entityTypes.client} onClick={() => handleTabChange('projects')}>
        <Plus className="w-3.5 h-3.5" /> New Project
      </Button>
      <Button size="sm" variant="ghost" accent={colors.accent.orange} onClick={() => setFlagModalOpen(true)} style={{ color: colors.accent.orange }}>
        <Flag className="w-3.5 h-3.5" /> Flag
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setShowArchiveDialog(true)}>
        <Archive className="w-3.5 h-3.5" /> Archive
      </Button>
    </>
  );

  const statusSlot = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <FlagIndicator entityType="client" entityId={clientId} />
      <EditableStatusBadge status={client.status as 'prospect' | 'active' | 'archived' | 'past' | undefined} onStatusChange={handleStatusChange} />
      <EditableClientTypeBadge type={client.type} onTypeChange={handleTypeChange} customTypes={customTypes} onAddCustomType={() => {}} />
    </div>
  );

  return (
    <>
      <EntityDetailScaffold
        entityType="client"
        breadcrumbs={[
          { label: 'Clients', type: 'client', onClick: () => router.push('/clients') },
          { label: client.name, type: 'client' },
        ]}
        icon={<Building2 className="w-[18px] h-[18px]" />}
        title={client.name}
        status={statusSlot}
        actions={actions}
        kpis={kpis}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        banner={client.isDeleted ? (
          <RestorationBanner
            entityType="client"
            entityName={client.name}
            entityId={clientId}
            deletedAt={client.deletedAt}
            onRestored={() => {}}
            onPermanentlyDeleted={() => router.push('/clients')}
          />
        ) : undefined}
        aside={<ClientDetailAside client={client} primaryCompany={primaryCompany} counts={{ projects: projects.length, documents: documents.length, contacts: contacts.length, meetings: meetingsCount }} />}
      >
        {activeTab === 'overview' && (
          <ClientOverviewTab client={client} clientId={clientId} documents={documents} projects={projects} contacts={contacts} onOpenSettings={() => { setSettingsDefaultTab('general'); setShowSettingsPanel(true); }} onTabChange={handleTabChange} />
        )}
        {activeTab === 'intelligence' && (
          <div className="space-y-6">
            <ClientBeauhurstCards clientId={clientId} />
            <ClientIntelligenceTab clientId={clientId} clientName={client.name} clientType={client.type} projects={projects} />
          </div>
        )}
        {activeTab === 'company' && <ClientCompanyTab clientId={clientId} client={client} />}
        {activeTab === 'deals' && <ClientDealsTab clientId={clientId} />}
        {activeTab === 'activity' && <ClientActivityTab clientId={clientId} />}
        {activeTab === 'documents' && <ClientDocumentLibrary clientId={clientId} clientName={client.name} clientType={client.type} />}
        {activeTab === 'checklist' && <ClientKnowledgeTab clientId={clientId} clientName={client.name} clientType={client.type} projects={projects} />}
        {activeTab === 'notes' && <ClientNotesTab clientId={clientId} clientName={client.name} />}
        {activeTab === 'meetings' && <ClientMeetingsTab clientId={clientId} clientName={client.name} />}
        {activeTab === 'tasks' && <ClientTasksTab clientId={clientId} clientName={client.name} />}
        {activeTab === 'data' && <ClientDataTab clientId={clientId} clientName={client.name} />}
        {activeTab === 'threads' && <ClientThreadsTab clientId={clientId} />}
        {activeTab === 'projects' && <ClientProjectsTab clientId={clientId} clientName={client.name} projects={projects} />}
        {activeTab === 'contacts' && <ClientContactsTab clientId={clientId} clientName={client.name} contacts={contacts} />}
        {activeTab === 'communications' && <ClientCommunicationsTab clientId={clientId} communications={communications} documents={documents} />}
      </EntityDetailScaffold>

      {/* Archive Dialog */}
      <Modal
        open={showArchiveDialog}
        onClose={() => setShowArchiveDialog(false)}
        title="Archive client?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowArchiveDialog(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleArchiveClient}>Archive</Button>
          </>
        }
      >
        <p style={{ fontSize: 12, color: colors.text.secondary }}>
          This will archive the client. You can restore them later by changing their status.
        </p>
      </Modal>

      {/* Settings Panel */}
      <ClientSettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        clientId={clientId}
        defaultTab={settingsDefaultTab}
        onTrash={() => router.push('/clients')}
      />

      {/* Flag Modal */}
      <FlagCreationModal
        isOpen={flagModalOpen}
        onClose={() => setFlagModalOpen(false)}
        entityType="client"
        entityId={clientId}
        entityName={client.name}
        clientId={clientId}
      />

      {/* Knowledge Graph Drawer */}
      {graphOpen && (
        <KnowledgeGraphDrawer
          entryEntityType="client"
          entryEntityId={clientId}
          entryName={client.name}
          onClose={() => setGraphOpen(false)}
        />
      )}
    </>
  );
}

// Loading fallback
function ClientProfileLoading() {
  return (
    <div style={{ padding: 24 }}>
      <SkeletonText lines={2} />
    </div>
  );
}

// Main export with Suspense boundary
export default function ClientProfilePage() {
  return (
    <Suspense fallback={<ClientProfileLoading />}>
      <ClientProfileContent />
    </Suspense>
  );
}
