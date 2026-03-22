'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
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
import CompactMetricCard from '@/components/CompactMetricCard';
import {
  FolderKanban,
  FileText,
  MessageSquare,
  Building2,
  Calendar,
  Archive,
  Trash2,
  StickyNote,
  Database,
  LayoutGrid,
  ArrowLeft,
  Users,
  Briefcase,
  TrendingUp,
  DollarSign,
  Settings,
  Flag,
} from 'lucide-react';
import FlagCreationModal from '@/components/FlagCreationModal';
import { FlagIndicator } from '@/components/FlagIndicator';

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
import { Brain, CheckSquare, ListTodo } from 'lucide-react';

type TabType = 'overview' | 'documents' | 'intelligence' | 'checklist' | 'threads' | 'data' | 'notes' | 'tasks';

function ProjectDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = params.clientId as Id<"clients">;
  const projectId = params.projectId as Id<"projects">;

  const initialTab = (searchParams.get('tab') as TabType) || 'overview';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
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
  const deleteProject = useMutation(api.projects.remove);

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

  const handleDeleteProject = async () => {
    if (!project) return;
    try {
      await deleteProject({ id: projectId });
      setShowDeleteDialog(false);
      router.push(`/clients/${clientId}?tab=projects`);
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Failed to delete project. Please try again.');
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Active</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">Completed</Badge>;
      case 'on-hold':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">On Hold</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Cancelled</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200 text-xs">Archived</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status || 'Unknown'}</Badge>;
    }
  };

  // Loading state
  if (project === undefined || client === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Not found
  if (!project || !client) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <FolderKanban className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Project not found.</p>
            <Link href={`/clients/${clientId}`} className="mt-4 text-blue-600 hover:text-blue-700">
              Back to Client
            </Link>
          </div>
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

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Compact Header */}
      <header className="bg-white border-b px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/clients/${clientId}`}>
              <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs px-2">
                <ArrowLeft className="w-3.5 h-3.5" />
                {client.name}
              </Button>
            </Link>
            <div className="h-5 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                project.status === 'active'
                  ? 'bg-purple-100'
                  : 'bg-gray-100'
              }`}>
                <Briefcase className={`w-3.5 h-3.5 ${
                  project.status === 'active'
                    ? 'text-purple-600'
                    : 'text-gray-500'
                }`} />
              </div>
              <h1 className="text-base font-semibold text-gray-900">{project.name}</h1>
              <FlagIndicator entityType="project" entityId={projectId} />
              {getStatusBadge(project.status)}
              {project.projectShortcode && (
                <Badge variant="outline" className="font-mono text-xs">
                  {project.projectShortcode}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2"
              onClick={() => {
                setSettingsDefaultTab('general');
                setShowSettingsPanel(true);
              }}
            >
              <Settings className="w-3.5 h-3.5 mr-1" />
              Settings
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 h-7 text-xs px-2"
              onClick={() => setFlagModalOpen(true)}
            >
              <Flag className="w-3.5 h-3.5 mr-1" />
              Flag
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2"
              onClick={() => setShowArchiveDialog(true)}
            >
              <Archive className="w-3.5 h-3.5 mr-1" />
              Archive
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 text-xs px-2"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Delete
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs at the top */}
      <Tabs 
        value={activeTab} 
        onValueChange={handleTabChange}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="bg-white border-b px-4 flex-shrink-0 overflow-x-auto scrollbar-hide">
          <TabsList className="h-11 bg-transparent p-0 gap-1 min-w-max">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="relative h-11 px-2.5 text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-purple-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none whitespace-nowrap"
                >
                  <Icon className="w-3.5 h-3.5 mr-1.5" />
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1.5 bg-gray-100 text-gray-700 hover:bg-gray-100 text-[10px] px-1.5 py-0"
                    >
                      {tab.count}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Slim Metrics Row - Overview only */}
        {activeTab === 'overview' && (
          <div className="bg-white border-b px-6 py-3 flex-shrink-0">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <CompactMetricCard
                label="Documents"
                value={documents.length}
                icon={FileText}
                iconColor="purple"
              />
              <CompactMetricCard
                label="Clients"
                value={clientRoles.length || 1}
                icon={Building2}
                iconColor="blue"
              />
              {project.loanAmount && (
                <CompactMetricCard
                  label="Loan"
                  value={formatCurrency(project.loanAmount) || ''}
                  icon={DollarSign}
                  iconColor="green"
                />
              )}
              <CompactMetricCard
                label="Last Activity"
                value={lastActivity ? lastActivity.toLocaleDateString() : 'No activity'}
                icon={TrendingUp}
                iconColor="orange"
              />
              <CompactMetricCard
                label="Created"
                value={new Date(project.createdAt).toLocaleDateString()}
                icon={Calendar}
                iconColor="gray"
              />
              {project.expectedCompletionDate && (
                <CompactMetricCard
                  label="Due"
                  value={new Date(project.expectedCompletionDate).toLocaleDateString()}
                  icon={Calendar}
                  iconColor="red"
                />
              )}
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Edge-to-Edge Tabs */}
          <TabsContent value="intelligence" className="mt-0 flex-1 overflow-hidden">
            <ProjectIntelligenceTab
              projectId={projectId}
            />
          </TabsContent>

          <TabsContent value="documents" className="mt-0 flex-1 overflow-hidden">
            <ProjectDocumentsTab
              projectId={projectId}
              clientId={clientId}
              clientName={client.name}
              clientType={client.type}
            />
          </TabsContent>

          <TabsContent value="checklist" className="mt-0 flex-1 overflow-hidden">
            <ProjectKnowledgeTab
              projectId={projectId}
              projectName={project.name}
              clientId={clientId}
              clientName={client.name}
              clientType={client.type}
              dealPhase={project.dealPhase}
            />
          </TabsContent>

          <TabsContent value="notes" className="mt-0 flex-1 overflow-hidden">
            <ProjectNotesTab
              projectId={projectId}
              projectName={project.name}
              clientId={clientId}
            />
          </TabsContent>

          <TabsContent value="tasks" className="mt-0 flex-1 overflow-hidden">
            <ProjectTasksTab
              projectId={projectId}
              projectName={project.name}
              clientId={clientId}
            />
          </TabsContent>

          <TabsContent value="threads" className="mt-0 flex-1 overflow-hidden">
            <ProjectThreadsTab
              projectId={projectId}
              clientId={clientId}
            />
          </TabsContent>

          {/* Contained Tabs - With Max Width Container */}
          <div className={`flex-1 overflow-auto ${['intelligence', 'documents', 'checklist', 'notes', 'tasks', 'threads'].includes(activeTab) ? 'hidden' : ''}`}>
            <div className="max-w-7xl mx-auto px-6 py-6">
              <TabsContent value="overview" className="mt-0">
                <ProjectOverviewTab
                  project={project}
                  projectId={projectId}
                  clientId={clientId}
                  client={client}
                  documents={documents}
                  clientRoles={clientRoles}
                  onOpenSettings={() => {
                    setSettingsDefaultTab('general');
                    setShowSettingsPanel(true);
                  }}
                  onTabChange={handleTabChange}
                />
              </TabsContent>

              <TabsContent value="data" className="mt-0">
                <ProjectDataTab
                  projectId={projectId}
                  projectName={project.name}
                />
              </TabsContent>
            </div>
          </div>
        </div>
      </Tabs>

      {/* Archive Dialog */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the project. You can restore it later by changing its status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveProject}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the project and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settings Panel */}
      <ProjectSettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        projectId={projectId}
        clientId={clientId}
        defaultTab={settingsDefaultTab}
      />

      {/* Flag Modal */}
      <FlagCreationModal
        isOpen={flagModalOpen}
        onClose={() => setFlagModalOpen(false)}
        entityType="project"
        entityId={projectId}
        entityName={project.name}
        entityContext={client.name}
        clientId={clientId}
        projectId={projectId}
      />
    </div>
  );
}

// Loading fallback
function ProjectDetailLoading() {
  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
        <p className="text-gray-500">Loading project...</p>
      </div>
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
