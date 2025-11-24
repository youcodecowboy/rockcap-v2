'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  useClient,
  useProjectsByClient,
  useUpdateClient,
  useContactsByClient,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  useEnrichmentByClient,
  useAcceptEnrichment,
  useRejectEnrichment,
  useClientStats,
  useCreateProject,
  useDeleteClient,
} from '@/lib/clientStorage';
import {
  useDocumentsByClient,
  useDeleteDocument,
  useDocument,
} from '@/lib/documentStorage';
import {
  useProspectingContextsByClient,
} from '@/lib/prospectingStorage';
import { Id } from '../../../../convex/_generated/dataModel';
import { Client, Project, Contact, EnrichmentSuggestion, Communication, ProspectingContext } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from '@/components/StatusBadge';
import EditableStatusBadge from '@/components/EditableStatusBadge';
import EditableClientTypeBadge from '@/components/EditableClientTypeBadge';
import StatsCard from '@/components/StatsCard';
import MetricCard from '@/components/MetricCard';
import ContactCard from '@/components/ContactCard';
import EnrichmentSuggestionCard from '@/components/EnrichmentSuggestionCard';
import ProspectingContextCard from '@/components/ProspectingContextCard';
import CommunicationTimeline from '@/components/CommunicationTimeline';
import ProjectCard from '@/components/ProjectCard';
import KnowledgeBankView from '@/components/KnowledgeBankView';
import {
  FolderKanban,
  FileText,
  MessageSquare,
  Users,
  Building2,
  Sparkles,
  Edit2,
  Save,
  X,
  Plus,
  Tag,
  Mail,
  StickyNote,
  ChevronRight,
  FolderKanban as FolderKanbanIcon,
  Calendar,
  Archive,
  Trash2,
} from 'lucide-react';

type TabType = 'overview' | 'projects' | 'documents' | 'communications' | 'contacts' | 'enrichment' | 'knowledge-bank';

export default function ClientProfilePage() {
  const params = useParams();
  const router = useRouter();
  const clientIdParam = params.clientId as string;
  const clientId = clientIdParam as Id<"clients">;

  // Convex hooks
  const client = useClient(clientId);
  const projects = useProjectsByClient(clientId) || [];
  const documents = useDocumentsByClient(clientId) || [];
  const contacts = useContactsByClient(clientId) || [];
  const enrichmentSuggestions = useEnrichmentByClient(clientId) || [];
  const prospectingContexts = useProspectingContextsByClient(clientId) || [];
  const stats = useClientStats(clientId);

  // Mutations
  const updateClientMutation = useUpdateClient();
  const createContact = useCreateContact();
  const updateContactMutation = useUpdateContact();
  const deleteContactMutation = useDeleteContact();
  const acceptEnrichment = useAcceptEnrichment();
  const rejectEnrichment = useRejectEnrichment();
  const deleteDocumentMutation = useDeleteDocument();
  const createProject = useCreateProject();
  const deleteClientMutation = useDeleteClient();

  // Computed values
  const communications = useMemo(() => {
    // Extract communications from documents
    return documents.map(doc => ({
      id: doc._id as string,
      type: 'document' as const,
      date: doc.uploadedAt,
      participants: [],
      documentId: doc._id as string,
      summary: doc.summary,
    }));
  }, [documents]);

  const currentProjects = projects.filter((p: any) => p.status === 'active');
  const pastProjects = projects.filter((p: any) => p.status !== 'active' && p.status !== undefined);
  
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [companyFormData, setCompanyFormData] = useState({
    companyName: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    phone: '',
    email: '',
    website: '',
    notes: '',
  });
  const [contactFormData, setContactFormData] = useState({
    name: '',
    role: '',
    email: '',
    phone: '',
    company: '',
    notes: '',
  });

  // Initialize form data when client loads
  useEffect(() => {
    if (client) {
      setCompanyFormData({
        companyName: client.companyName || '',
        address: client.address || '',
        city: client.city || '',
        state: client.state || '',
        zip: client.zip || '',
        country: client.country || '',
        phone: client.phone || '',
        email: client.email || '',
        website: client.website || '',
        notes: client.notes || '',
      });
    }
  }, [client]);

  const handleSaveCompany = async () => {
    if (!client) return;
    await updateClientMutation({
      id: clientId,
      ...companyFormData,
    });
    setIsEditingCompany(false);
  };

  const handleCancelEditCompany = () => {
    if (!client) return;
    setCompanyFormData({
      companyName: client.companyName || '',
      address: client.address || '',
      city: client.city || '',
      state: client.state || '',
      zip: client.zip || '',
      country: client.country || '',
      phone: client.phone || '',
      email: client.email || '',
      website: client.website || '',
      notes: client.notes || '',
    });
    setIsEditingCompany(false);
  };

  const handleSaveContact = async () => {
    if (editingContactId) {
      await updateContactMutation({
        id: editingContactId as Id<"contacts">,
        ...contactFormData,
      });
      setEditingContactId(null);
    } else {
      await createContact({
        clientId,
        ...contactFormData,
      });
      setIsAddingContact(false);
    }
    setContactFormData({
      name: '',
      role: '',
      email: '',
      phone: '',
      company: '',
      notes: '',
    });
  };

  const handleEditContact = (contact: any) => {
    const contactId = contact._id as string;
    setEditingContactId(contactId);
    setContactFormData({
      name: contact.name,
      role: contact.role || '',
      email: contact.email || '',
      phone: contact.phone || '',
      company: contact.company || '',
      notes: contact.notes || '',
    });
    setIsAddingContact(true);
  };

  const handleDeleteContact = async (contactId: string) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      await deleteContactMutation({ id: contactId as Id<"contacts"> });
    }
  };

  const handleAcceptEnrichment = async (suggestionId: string) => {
    try {
      await acceptEnrichment({ id: suggestionId as Id<"enrichmentSuggestions"> });
      // The client data should automatically refresh via Convex reactivity
      // But we can force a small delay to ensure the update propagates
      setTimeout(() => {
        // Trigger a re-render by updating state if needed
        // Convex queries are reactive, so this should happen automatically
      }, 100);
    } catch (error) {
      console.error('Error accepting enrichment:', error);
      alert(`Failed to accept enrichment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRejectEnrichment = async (suggestionId: string) => {
    try {
      await rejectEnrichment({ id: suggestionId as Id<"enrichmentSuggestions"> });
    } catch (error) {
      console.error('Error rejecting enrichment:', error);
      alert(`Failed to reject enrichment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async (id: Id<"documents">) => {
    if (confirm('Are you sure you want to delete this document?')) {
      await deleteDocumentMutation({ id });
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !client) return;
    
    const currentNotes = client.notes || '';
    const timestamp = new Date().toLocaleString();
    const noteEntry = `[${timestamp}] ${newNote.trim()}\n\n`;
    const updatedNotes = currentNotes ? `${currentNotes}${noteEntry}` : noteEntry;
    
    await updateClientMutation({
      id: clientId,
      notes: updatedNotes,
    });
    
    setNewNote('');
    setIsAddingNote(false);
  };

  const handleContactClient = () => {
    // Navigate to email creation page for this client
    router.push(`/prospects/${clientId}/email`);
  };

  const handleStatusChange = async (newStatus: 'prospect' | 'active' | 'archived' | 'past') => {
    await updateClientMutation({
      id: clientId,
      status: newStatus,
    });
  };

  const handleTypeChange = async (newType: 'lender' | 'developer' | 'broker') => {
    await updateClientMutation({
      id: clientId,
      type: newType,
    });
  };

  const handleCreateProject = async () => {
    if (!client) return;
    
    const projectName = prompt('Enter project name:');
    if (!projectName?.trim()) return;

    try {
      const projectId = await createProject({
        name: projectName.trim(),
        clientRoles: [{ clientId: clientId, role: 'primary' }],
      });
      
      // Navigate to the new project
      router.push(`/projects/${projectId}`);
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project. Please try again.');
    }
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getDocumentName = (documentId: string): string => {
    // Find document in the documents array
    const doc = documents.find(d => (d._id as string) === documentId);
    return doc?.fileName || 'Unknown Document';
  };

  if (!client) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Client not found.</p>
            <Link href="/clients" className="mt-4 text-blue-600 hover:text-blue-700">
              Back to Clients
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: TabType; label: string; icon: typeof FolderKanban; count?: number }> = [
    { id: 'overview', label: 'Overview', icon: Building2 },
    { id: 'projects', label: 'Projects', icon: FolderKanban, count: projects.length },
    { id: 'documents', label: 'Documents', icon: FileText, count: documents.length },
    { id: 'communications', label: 'Communications', icon: MessageSquare, count: communications.length },
    { id: 'contacts', label: 'Contacts', icon: Users, count: contacts.length },
    { id: 'enrichment', label: 'Enrichment', icon: Sparkles, count: enrichmentSuggestions.length + prospectingContexts.length },
    { id: 'knowledge-bank', label: 'Knowledge Bank', icon: StickyNote },
  ];

  // Format address
  const formatAddress = () => {
    const parts = [];
    if (client.address) parts.push(client.address);
    if (client.city) parts.push(client.city);
    if (client.state) parts.push(client.state);
    if (client.zip) parts.push(client.zip);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Link href="/clients" className="hover:text-gray-900 transition-colors">
            Clients
          </Link>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="text-gray-900 font-medium">{client.name}</span>
        </nav>

        {/* New Note Dialog */}
        <Dialog open={isAddingNote} onOpenChange={setIsAddingNote}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Note</DialogTitle>
              <DialogDescription>
                Add a note to this client's record. Notes are timestamped and appended to the client's notes.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Textarea
                placeholder="Enter your note here..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={6}
                className="w-full"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsAddingNote(false);
                setNewNote('');
              }}>
                Cancel
              </Button>
              <Button onClick={handleAddNote} disabled={!newNote.trim()}>
                <Save className="w-4 h-4 mr-2" />
                Save Note
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Header Section */}
        <div className="mb-8">
          {/* Title, Badges, and Action Buttons Row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
            <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
              <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', fontWeight: 700 }}>
                {client.name}
              </h1>
              <div className="flex items-center gap-2 flex-shrink-0">
                <EditableStatusBadge 
                  status={client.status as 'prospect' | 'active' | 'archived' | 'past' | undefined}
                  onStatusChange={handleStatusChange}
                />
                <EditableClientTypeBadge
                  type={client.type}
                  onTypeChange={handleTypeChange}
                />
                {client.hubspotLifecycleStage && (
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                    {client.hubspotLifecycleStage.charAt(0).toUpperCase() + client.hubspotLifecycleStage.slice(1)}
                  </Badge>
                )}
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                onClick={handleCreateProject}
                className="bg-black text-white hover:bg-gray-800 whitespace-nowrap"
              >
                <FolderKanbanIcon className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">New Project</span>
                <span className="sm:hidden">Project</span>
              </Button>
              <Button
                size="sm"
                onClick={handleContactClient}
                className="bg-black text-white hover:bg-gray-800 whitespace-nowrap"
              >
                <Mail className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Contact Client</span>
                <span className="sm:hidden">Contact</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setIsAddingNote(true)}
                className="bg-black text-white hover:bg-gray-800 whitespace-nowrap"
              >
                <StickyNote className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">New Note</span>
                <span className="sm:hidden">Note</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setShowArchiveDialog(true)}
                variant="outline"
                className="whitespace-nowrap"
              >
                <Archive className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Archive</span>
                <span className="sm:hidden">Archive</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                variant="outline"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Delete</span>
                <span className="sm:hidden">Delete</span>
              </Button>
            </div>
          </div>

          {/* Info Row with Icons */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600 mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span>Created: {new Date(client.createdAt).toLocaleDateString()}</span>
            </div>
            {formatAddress() && (
              <>
                <span className="text-gray-400">•</span>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-500" />
                  <span>{formatAddress()}</span>
                </div>
              </>
            )}
            {currentProjects.length > 0 && (
              <>
                <span className="text-gray-400">•</span>
                <div className="flex items-center gap-2">
                  <FolderKanban className="w-4 h-4 text-gray-500" />
                  <span>{currentProjects.length} {currentProjects.length === 1 ? 'Active Project' : 'Active Projects'}</span>
                </div>
              </>
            )}
          </div>

          {/* Tags and Projects */}
          <div className="flex flex-wrap items-center gap-3">
            {client.tags && client.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {client.tags.map(tag => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            )}
            {currentProjects.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {currentProjects.slice(0, 3).map((project: any) => {
                  const projectId = project._id as Id<"projects">;
                  return (
                    <Button
                      key={projectId}
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/projects/${projectId}`)}
                      className="h-7 text-xs"
                    >
                      {project.name}
                    </Button>
                  );
                })}
                {currentProjects.length > 3 && (
                  <span className="text-sm text-gray-500">+{currentProjects.length - 3} more</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            label="Total Projects"
            value={projects.length}
            icon={FolderKanban}
            iconColor="purple"
            className="bg-black text-white border-black"
          />
          <MetricCard
            label="Active Projects"
            value={currentProjects.length}
            icon={FolderKanban}
            iconColor="green"
            className="bg-black text-white border-black"
          />
          <MetricCard
            label="Total Documents"
            value={documents.length}
            icon={FileText}
            iconColor="blue"
            className="bg-black text-white border-black"
          />
          <MetricCard
            label="Communications"
            value={communications.length}
            icon={MessageSquare}
            iconColor="orange"
            className="bg-black text-white border-black"
          />
        </div>

        {/* Tabs Navigation */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="bg-blue-600">
            <div className="flex items-center justify-between">
              {/* Mobile: Dropdown */}
              <div className="lg:hidden px-4 py-3 flex-1">
                <Select value={activeTab} onValueChange={(value) => setActiveTab(value as TabType)}>
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue>
                      {(() => {
                        const currentTab = tabs.find(t => t.id === activeTab);
                        const Icon = currentTab?.icon;
                        return (
                          <div className="flex items-center gap-2">
                            {Icon && <Icon className="w-4 h-4" />}
                            <span>{currentTab?.label}</span>
                            {currentTab?.count !== undefined && currentTab.count > 0 && (
                              <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                                {currentTab.count}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <SelectItem key={tab.id} value={tab.id}>
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4" />
                            <span>{tab.label}</span>
                            {tab.count !== undefined && tab.count > 0 && (
                              <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                                {tab.count}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Desktop: Tabs */}
              <nav className="hidden lg:flex flex-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                        activeTab === tab.id
                          ? 'border-white text-white'
                          : 'border-transparent text-white/80 hover:text-white hover:border-white/50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{tab.label}</span>
                      {tab.count !== undefined && tab.count > 0 && (
                        <Badge variant="outline" className={`ml-1 flex-shrink-0 text-[10px] px-1 py-0 ${
                          activeTab === tab.id 
                            ? 'bg-white/20 text-white border-white/30' 
                            : 'bg-white/10 text-white/80 border-white/20'
                        }`}>
                          {tab.count}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Company Information */}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Company Information</h3>
                  {!isEditingCompany && (
                    <Button
                      onClick={() => setIsEditingCompany(true)}
                      variant="outline"
                      size="sm"
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  )}
                </div>

                {isEditingCompany ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Company Name
                        </label>
                        <input
                          type="text"
                          value={companyFormData.companyName}
                          onChange={(e) => setCompanyFormData({ ...companyFormData, companyName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email
                        </label>
                        <input
                          type="email"
                          value={companyFormData.email}
                          onChange={(e) => setCompanyFormData({ ...companyFormData, email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Phone
                        </label>
                        <input
                          type="tel"
                          value={companyFormData.phone}
                          onChange={(e) => setCompanyFormData({ ...companyFormData, phone: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Website
                        </label>
                        <input
                          type="url"
                          value={companyFormData.website}
                          onChange={(e) => setCompanyFormData({ ...companyFormData, website: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          placeholder="https://example.com"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Address
                        </label>
                        <input
                          type="text"
                          value={companyFormData.address}
                          onChange={(e) => setCompanyFormData({ ...companyFormData, address: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          City
                        </label>
                        <input
                          type="text"
                          value={companyFormData.city}
                          onChange={(e) => setCompanyFormData({ ...companyFormData, city: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          State
                        </label>
                        <input
                          type="text"
                          value={companyFormData.state}
                          onChange={(e) => setCompanyFormData({ ...companyFormData, state: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ZIP Code
                        </label>
                        <input
                          type="text"
                          value={companyFormData.zip}
                          onChange={(e) => setCompanyFormData({ ...companyFormData, zip: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Country
                        </label>
                        <input
                          type="text"
                          value={companyFormData.country}
                          onChange={(e) => setCompanyFormData({ ...companyFormData, country: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Notes
                        </label>
                        <textarea
                          value={companyFormData.notes}
                          onChange={(e) => setCompanyFormData({ ...companyFormData, notes: e.target.value })}
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveCompany} size="sm">
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={handleCancelEditCompany} size="sm">
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3">Contact Information</h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-gray-600">Company Name: </span>
                          <span className="text-gray-900">{client.companyName || client.name || '—'}</span>
                        </div>
                        {client.email ? (
                          <div>
                            <span className="text-gray-600">Email: </span>
                            <a href={`mailto:${client.email}`} className="text-blue-600 hover:underline">
                              {client.email}
                            </a>
                          </div>
                        ) : (
                          <div className="text-gray-400 italic">Email: Not available</div>
                        )}
                        {client.phone ? (
                          <div>
                            <span className="text-gray-600">Phone: </span>
                            <a href={`tel:${client.phone}`} className="text-blue-600 hover:underline">
                              {client.phone}
                            </a>
                          </div>
                        ) : (
                          <div className="text-gray-400 italic">Phone: Not available</div>
                        )}
                        {client.website ? (
                          <div>
                            <span className="text-gray-600">Website: </span>
                            <a href={client.website.startsWith('http') ? client.website : `https://${client.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              {client.website}
                            </a>
                          </div>
                        ) : (
                          <div className="text-gray-400 italic">Website: Not available</div>
                        )}
                        {client.industry && (
                          <div>
                            <span className="text-gray-600">Industry: </span>
                            <span className="text-gray-900">{client.industry}</span>
                          </div>
                        )}
                        {/* Show metadata fields if they exist (like contactName) */}
                        {client.metadata && typeof client.metadata === 'object' && (
                          <>
                            {(client.metadata as any).contactName && (
                              <div>
                                <span className="text-gray-600">Contact: </span>
                                <span className="text-gray-900">{(client.metadata as any).contactName}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3">Address</h4>
                      <div className="text-sm text-gray-700">
                        {client.address || client.city ? (
                          <>
                            {client.address && <div>{client.address}</div>}
                            {(client.city || client.state || client.zip) && (
                              <div>
                                {client.city && <span>{client.city}</span>}
                                {client.city && client.state && <span>, </span>}
                                {client.state && <span>{client.state}</span>}
                                {client.zip && <span> {client.zip}</span>}
                              </div>
                            )}
                            {client.country && <div>{client.country}</div>}
                          </>
                        ) : (
                          <span className="text-gray-400">No address available</span>
                        )}
                      </div>
                    </div>
                    {client.notes && (
                      <div className="md:col-span-2 bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3">Notes</h4>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{client.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Key Contacts */}
                {contacts.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Key Contacts</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {contacts.slice(0, 3).map((contact: any) => {
                        const contactId = contact._id as string;
                        return (
                          <ContactCard
                            key={contactId}
                            contact={contact}
                            onEdit={() => handleEditContact(contact)}
                            onDelete={() => handleDeleteContact(contactId)}
                          />
                        );
                      })}
                    </div>
                    {contacts.length > 3 && (
                      <Button
                        variant="ghost"
                        onClick={() => setActiveTab('contacts')}
                        className="mt-4"
                      >
                        View All Contacts ({contacts.length})
                      </Button>
                    )}
                  </div>
                )}

                {/* Recent Activity */}
                {documents.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Recent Activity</h3>
                    <div className="space-y-2">
                      {documents
                        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
                        .slice(0, 5)
                        .map((doc: any) => {
                          const docId = doc._id as Id<"documents">;
                          return (
                            <div
                              key={docId}
                              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                              onClick={() => router.push(`/docs/${docId}`)}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {doc.fileName}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {new Date(doc.uploadedAt).toLocaleDateString()}
                                </p>
                              </div>
                              <Badge variant="secondary" className="ml-2">
                                {doc.fileTypeDetected}
                              </Badge>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Projects Tab */}
            {activeTab === 'projects' && (
              <div className="space-y-6">
                {currentProjects.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Projects</h3>
                    <div className="space-y-4">
                      {currentProjects.map((project: any) => (
                        <ProjectCard key={project._id || project.id} project={project} />
                      ))}
                    </div>
                  </div>
                )}

                {pastProjects.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Past Projects</h3>
                    <div className="space-y-4">
                      {pastProjects.map((project: any) => (
                        <ProjectCard key={project._id || project.id} project={project} isPast={true} />
                      ))}
                    </div>
                  </div>
                )}

                {projects.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <FolderKanban className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-500">No projects found for this client.</p>
                  </div>
                )}
              </div>
            )}

            {/* Documents Tab */}
            {activeTab === 'documents' && (
              <div>
                {documents.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No documents found for this client.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[200px]">
                            File Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                            Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                            Category
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[250px]">
                            Summary
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                            Project
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[140px]">
                            Upload Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {documents.map((doc: any) => {
                          const docId = doc._id as Id<"documents">;
                          const projectId = doc.projectId ? ((doc.projectId as any)?._id || doc.projectId) as Id<"projects"> : null;
                          return (
                            <tr key={docId} className="hover:bg-gray-50">
                              <td className="px-6 py-4 max-w-[200px]">
                                <div className="text-sm font-medium text-gray-900 truncate" title={doc.fileName}>
                                  {doc.fileName}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <Badge variant="secondary" className="text-xs">
                                  {doc.fileTypeDetected}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <Badge variant="outline" className="text-xs">
                                  {doc.category}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 max-w-[250px]">
                                <div className="text-sm text-gray-900 truncate" title={doc.summary}>
                                  {doc.summary}
                                </div>
                              </td>
                              <td className="px-6 py-4 max-w-[120px] whitespace-nowrap">
                                {projectId ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => router.push(`/projects/${projectId}`)}
                                    className="text-blue-600 hover:text-blue-700 h-auto py-1 text-xs truncate max-w-full"
                                    title={doc.projectName || 'Unknown'}
                                  >
                                    <span className="truncate">{doc.projectName || 'Unknown'}</span>
                                  </Button>
                                ) : (
                                  <span className="text-sm text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {new Date(doc.uploadedAt).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => router.push(`/docs/${docId}`)}
                                    className="text-blue-600 hover:text-blue-700 h-auto py-1"
                                  >
                                    View
                                  </Button>
                                  <button
                                    onClick={() => handleDelete(docId)}
                                    className="text-red-600 hover:text-red-700 text-sm"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Communications Tab */}
            {activeTab === 'communications' && (
              <div>
                {communications.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No communications found for this client.
                  </div>
                ) : (
                  <CommunicationTimeline
                    communications={communications}
                    getDocumentName={getDocumentName}
                  />
                )}
              </div>
            )}

            {/* Contacts Tab */}
            {activeTab === 'contacts' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Contacts</h3>
                  <Button
                    onClick={() => {
                      setIsAddingContact(true);
                      setEditingContactId(null);
                      setContactFormData({
                        name: '',
                        role: '',
                        email: '',
                        phone: '',
                        company: '',
                        notes: '',
                      });
                    }}
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Contact
                  </Button>
                </div>

                {isAddingContact && (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-4">
                      {editingContactId ? 'Edit Contact' : 'Add New Contact'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Name *
                        </label>
                        <input
                          type="text"
                          value={contactFormData.name}
                          onChange={(e) => setContactFormData({ ...contactFormData, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          placeholder="John Doe"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Role
                        </label>
                        <input
                          type="text"
                          value={contactFormData.role}
                          onChange={(e) => setContactFormData({ ...contactFormData, role: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          placeholder="Project Manager"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email
                        </label>
                        <input
                          type="email"
                          value={contactFormData.email}
                          onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          placeholder="john@example.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Phone
                        </label>
                        <input
                          type="tel"
                          value={contactFormData.phone}
                          onChange={(e) => setContactFormData({ ...contactFormData, phone: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          placeholder="+1-555-123-4567"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Company
                        </label>
                        <input
                          type="text"
                          value={contactFormData.company}
                          onChange={(e) => setContactFormData({ ...contactFormData, company: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          placeholder="Company Name"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Notes
                        </label>
                        <textarea
                          value={contactFormData.notes}
                          onChange={(e) => setContactFormData({ ...contactFormData, notes: e.target.value })}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          placeholder="Additional notes..."
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button
                        onClick={handleSaveContact}
                        disabled={!contactFormData.name.trim()}
                        size="sm"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsAddingContact(false);
                          setEditingContactId(null);
                        }}
                        size="sm"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {contacts.length === 0 && !isAddingContact ? (
                  <div className="text-center py-12 text-gray-500">
                    No contacts found. Add your first contact above.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {contacts.map((contact: any) => {
                      const contactId = contact._id as string;
                      return (
                        <ContactCard
                          key={contactId}
                          contact={contact}
                          onEdit={() => handleEditContact(contact)}
                          onDelete={() => handleDeleteContact(contactId)}
                          showSource={true}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Enrichment Tab */}
            {activeTab === 'enrichment' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Enrichment Suggestions</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Review AI-suggested information found in your documents. Accept or reject each suggestion.
                  </p>
                </div>

                {enrichmentSuggestions.length === 0 && prospectingContexts.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No enrichment data available. Suggestions and prospecting context will appear here when documents are analyzed.
                  </div>
                ) : (
                  <>
                    {enrichmentSuggestions.length > 0 && (
                      <div className="mb-8">
                        <h4 className="text-md font-semibold text-gray-900 mb-4">Data Enrichment Suggestions</h4>
                        <div className="space-y-4">
                          {/* Show pending suggestions first */}
                          {enrichmentSuggestions
                            .filter((s: any) => !s.status || s.status === 'pending')
                            .map((suggestion: any) => {
                              const suggestionId = suggestion._id as string;
                              return (
                                <EnrichmentSuggestionCard
                                  key={suggestionId}
                                  suggestion={suggestion}
                                  onAccept={async () => {
                                    console.log('onAccept called for suggestion:', suggestionId, suggestion);
                                    try {
                                      await handleAcceptEnrichment(suggestionId);
                                    } catch (error) {
                                      console.error('Error in onAccept handler:', error);
                                    }
                                  }}
                                  onReject={async () => {
                                    console.log('onReject called for suggestion:', suggestionId, suggestion);
                                    try {
                                      await handleRejectEnrichment(suggestionId);
                                    } catch (error) {
                                      console.error('Error in onReject handler:', error);
                                    }
                                  }}
                                  documentName={getDocumentName(suggestion.documentId as Id<"documents">)}
                                />
                              );
                            })}
                          
                          {/* Show accepted/rejected suggestions in a collapsed section */}
                          {enrichmentSuggestions.filter((s: any) => s.status && s.status !== 'pending').length > 0 && (
                            <div className="mt-6">
                              <details className="group">
                                <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                                  Processed Suggestions ({enrichmentSuggestions.filter((s: any) => s.status && s.status !== 'pending').length})
                                </summary>
                                <div className="mt-4 space-y-4">
                                  {enrichmentSuggestions
                                    .filter((s: any) => s.status && s.status !== 'pending')
                                    .map((suggestion: any) => {
                                      const suggestionId = suggestion._id as string;
                                      return (
                                        <EnrichmentSuggestionCard
                                          key={suggestionId}
                                          suggestion={suggestion}
                                          onAccept={() => {}}
                                          onReject={() => {}}
                                          documentName={getDocumentName(suggestion.documentId as Id<"documents">)}
                                        />
                                      );
                                    })}
                                </div>
                              </details>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {prospectingContexts.length > 0 && (
                      <div>
                        <h4 className="text-md font-semibold text-gray-900 mb-4">Prospecting Intelligence</h4>
                        <p className="text-sm text-gray-600 mb-4">
                          Context extracted from documents to help personalize outreach and prospecting communications.
                        </p>
                        <div className="space-y-4">
                          {prospectingContexts.map((context) => {
                            const mappedContext: ProspectingContext = {
                              documentId: context.documentId as string,
                              clientId: context.clientId ? (context.clientId as string) : null,
                              projectId: context.projectId ? (context.projectId as string) : null,
                              extractedAt: context.extractedAt,
                              keyPoints: context.keyPoints || [],
                              painPoints: context.painPoints || [],
                              opportunities: context.opportunities || [],
                              decisionMakers: context.decisionMakers || [],
                              businessContext: context.businessContext || {},
                              financialContext: context.financialContext,
                              relationshipContext: context.relationshipContext,
                              competitiveMentions: context.competitiveMentions,
                              timeline: context.timeline,
                              templateSnippets: context.templateSnippets,
                              confidence: context.confidence,
                              tokensUsed: context.tokensUsed,
                            };
                            return (
                              <ProspectingContextCard
                                key={context.documentId}
                                context={mappedContext}
                                documentName={getDocumentName(context.documentId as string)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Knowledge Bank Tab */}
            {activeTab === 'knowledge-bank' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Knowledge Bank</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Consolidated view of all information about this client from documents, emails, and interactions.
                  </p>
                </div>
                <KnowledgeBankView clientId={clientId} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Archive Confirmation Dialog */}
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

      {/* Delete Confirmation Dialog */}
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
