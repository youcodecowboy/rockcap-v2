'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Id } from '../../../../convex/_generated/dataModel';
import {
  useClient,
  useProjectsByClient,
  useUpdateClient,
  useContactsByClient,
  useDeleteClient,
} from '@/lib/clientStorage';
import { useDocumentsByClient } from '@/lib/documentStorage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import EditableStatusBadge from '@/components/EditableStatusBadge';
import EditableClientTypeBadge from '@/components/EditableClientTypeBadge';
import CompactMetricCard from '@/components/CompactMetricCard';
import {
  FolderKanban,
  FileText,
  MessageSquare,
  Users,
  Building2,
  ChevronRight,
  Calendar,
  Archive,
  Trash2,
  Plus,
  Mail,
  StickyNote,
  Database,
  Lightbulb,
  LayoutGrid,
  Phone,
  Globe,
  MapPin,
  ArrowLeft,
  TrendingUp,
} from 'lucide-react';

// Import tab components
import ClientDocumentLibrary from './components/ClientDocumentLibrary';
import ClientOverviewTab from './components/ClientOverviewTab';
import ClientProjectsTab from './components/ClientProjectsTab';
import ClientCommunicationsTab from './components/ClientCommunicationsTab';
import ClientDataTab from './components/ClientDataTab';
import ClientNotesTab from './components/ClientNotesTab';

type TabType = 'overview' | 'documents' | 'projects' | 'communications' | 'data' | 'knowledge' | 'notes';

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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Convex hooks
  const client = useClient(clientId);
  const projects = useProjectsByClient(clientId) || [];
  const documents = useDocumentsByClient(clientId) || [];
  const contacts = useContactsByClient(clientId) || [];

  // Mutations
  const updateClientMutation = useUpdateClient();
  const deleteClientMutation = useDeleteClient();

  // Computed values
  const activeProjects = projects.filter((p: any) => p.status === 'active');
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

  const handleTypeChange = async (newType: 'lender' | 'developer' | 'broker' | 'borrower') => {
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

  const handleDeleteClient = async () => {
    if (!client) return;
    try {
      await deleteClientMutation({ id: clientId });
      setShowDeleteDialog(false);
      router.push('/clients');
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('Failed to delete client. Please try again.');
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Not found
  if (!client) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Client not found.</p>
            <Link href="/clients" className="mt-4 text-blue-600 hover:text-blue-700">
              Back to Clients
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Format address
  const formatAddress = () => {
    const parts = [];
    if (client.address) parts.push(client.address);
    if (client.city) parts.push(client.city);
    if (client.state) parts.push(client.state);
    if (client.zip) parts.push(client.zip);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  // Last activity
  const lastActivity = documents.length > 0 
    ? new Date(documents.sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0].uploadedAt)
    : null;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'documents', label: 'Documents', icon: FileText, count: documents.length },
    { id: 'projects', label: 'Projects', icon: FolderKanban, count: projects.length },
    { id: 'communications', label: 'Communications', icon: MessageSquare, count: communications.length },
    { id: 'data', label: 'Data', icon: Database },
    { id: 'knowledge', label: 'Knowledge', icon: Lightbulb },
    { id: 'notes', label: 'Notes', icon: StickyNote },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top Header with Back + Title */}
      <header className="bg-white border-b px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/clients">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Clients
              </Button>
            </Link>
            <div className="h-6 w-px bg-gray-200" />
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                client.type?.toLowerCase() === 'lender' 
                  ? 'bg-blue-100' 
                  : 'bg-green-100'
              }`}>
                <Building2 className={`w-5 h-5 ${
                  client.type?.toLowerCase() === 'lender'
                    ? 'text-blue-600'
                    : 'text-green-600'
                }`} />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{client.name}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <EditableStatusBadge 
                    status={client.status as 'prospect' | 'active' | 'archived' | 'past' | undefined}
                    onStatusChange={handleStatusChange}
                  />
                  <EditableClientTypeBadge
                    type={client.type}
                    onTypeChange={handleTypeChange}
                  />
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleTabChange('projects')}
              className="bg-black text-white hover:bg-gray-800"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowArchiveDialog(true)}
            >
              <Archive className="w-4 h-4 mr-2" />
              Archive
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs at the top - like Document Queue */}
      <Tabs 
        value={activeTab} 
        onValueChange={handleTabChange}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="bg-white border-b px-6 flex-shrink-0">
          <TabsList className="h-12 bg-transparent p-0 gap-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger 
                  key={tab.id}
                  value={tab.id}
                  className="relative h-12 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <Badge 
                      variant="secondary" 
                      className="ml-2 bg-gray-100 text-gray-700 hover:bg-gray-100"
                    >
                      {tab.count}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Slim Metrics Row */}
        <div className="bg-white border-b px-6 py-3 flex-shrink-0">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <CompactMetricCard
              label="Documents"
              value={documents.length}
              icon={FileText}
              iconColor="blue"
            />
            <CompactMetricCard
              label="Projects"
              value={projects.length}
              icon={FolderKanban}
              iconColor="purple"
              badge={activeProjects.length > 0 ? { text: `${activeProjects.length} active`, variant: 'outline' } : undefined}
            />
            <CompactMetricCard
              label="Contacts"
              value={contacts.length}
              icon={Users}
              iconColor="green"
            />
            <CompactMetricCard
              label="Last Activity"
              value={lastActivity ? lastActivity.toLocaleDateString() : 'No activity'}
              icon={TrendingUp}
              iconColor="orange"
            />
            {client.email && (
              <CompactMetricCard
                label="Email"
                value={client.email}
                icon={Mail}
                iconColor="blue"
                onClick={() => window.location.href = `mailto:${client.email}`}
              />
            )}
            {client.phone && (
              <CompactMetricCard
                label="Phone"
                value={client.phone}
                icon={Phone}
                iconColor="green"
                onClick={() => window.location.href = `tel:${client.phone}`}
              />
            )}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <TabsContent value="overview" className="mt-0">
              <ClientOverviewTab
                client={client}
                clientId={clientId}
                documents={documents}
                projects={projects}
                contacts={contacts}
              />
            </TabsContent>

            <TabsContent value="documents" className="mt-0">
              <ClientDocumentLibrary
                clientId={clientId}
                clientName={client.name}
                clientType={client.type}
              />
            </TabsContent>

            <TabsContent value="projects" className="mt-0">
              <ClientProjectsTab
                clientId={clientId}
                clientName={client.name}
                projects={projects}
              />
            </TabsContent>

            <TabsContent value="communications" className="mt-0">
              <ClientCommunicationsTab
                clientId={clientId}
                communications={communications}
                documents={documents}
              />
            </TabsContent>

            <TabsContent value="data" className="mt-0">
              <ClientDataTab
                clientId={clientId}
                clientName={client.name}
              />
            </TabsContent>

            <TabsContent value="knowledge" className="mt-0">
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <Lightbulb className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Knowledge Library</h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  The Knowledge Library feature is coming soon. This will show a checklist of required documents and help generate templated notes like lender's notes.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-0">
              <ClientNotesTab
                clientId={clientId}
                clientName={client.name}
              />
            </TabsContent>
          </div>
        </div>
      </Tabs>

      {/* Archive Dialog */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Client?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the client. You can restore them later by changing their status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveClient}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the client and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteClient}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Loading fallback
function ClientProfileLoading() {
  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-500">Loading client profile...</p>
      </div>
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
