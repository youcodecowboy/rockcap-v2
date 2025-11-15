'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    useProject,
    useUpdateProject,
    useClient,
    useContactsByProject,
    useCreateContact,
    useUpdateContact,
    useDeleteContact,
    useEnrichmentByProject,
    useAcceptEnrichment,
    useRejectEnrichment,
} from '@/lib/clientStorage';
import {
    useDocumentsByProject,
    useDeleteDocument
} from '@/lib/documentStorage';
import {
    useProspectingContextsByProject,
} from '@/lib/prospectingStorage';
import { Id } from '../../../convex/_generated/dataModel';
import { Project } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import StatusBadge from '@/components/StatusBadge';
import EditableProjectStatusBadge from '@/components/EditableProjectStatusBadge';
import EditableProjectTypeBadge from '@/components/EditableProjectTypeBadge';
import StatsCard from '@/components/StatsCard';
import MetricCard from '@/components/MetricCard';
import ContactCard from '@/components/ContactCard';
import EnrichmentSuggestionCard from '@/components/EnrichmentSuggestionCard';
import ProspectingContextCard from '@/components/ProspectingContextCard';
import CommunicationTimeline from '@/components/CommunicationTimeline';
import FileUpload from '@/components/FileUpload';
import KnowledgeBankView from '@/components/KnowledgeBankView';
import MetricCardsSlideshow, { MetricCardsControls } from '@/components/MetricCardsSlideshow';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
    FileText, Calendar,
    MessageSquare,
    Users,
    FolderKanban,
    Sparkles,
    Edit2,
    Save,
    X,
    Plus,
    TrendingUp,
    ChevronRight,
    Mail,
    StickyNote,
    Upload,
} from 'lucide-react';

type TabType = 'overview' | 'documents' | 'extracted' | 'communications' | 'contacts' | 'info' | 'enrichment' | 'knowledge-bank';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectIdParam = params.projectId as string;
  const projectId = projectIdParam as Id<"projects">;

  // Convex hooks
  const project = useProject(projectId);
  const documents = useDocumentsByProject(projectId) || [];
  const contacts = useContactsByProject(projectId) || [];
  const enrichmentSuggestions = useEnrichmentByProject(projectId) || [];
  const prospectingContexts = useProspectingContextsByProject(projectId) || [];

  // Mutations
  const updateProjectMutation = useUpdateProject();
  const createContact = useCreateContact();
  const updateContactMutation = useUpdateContact();
  const deleteContactMutation = useDeleteContact();
  const acceptEnrichment = useAcceptEnrichment();
  const rejectEnrichment = useRejectEnrichment();
  const deleteDocumentMutation = useDeleteDocument();

  // Get first client from clientRoles
  const firstClientRole = project?.clientRoles?.[0];
  const firstClientId = firstClientRole ? ((firstClientRole.clientId as any)?._id || firstClientRole.clientId) as Id<"clients"> : null;
  const client = useClient(firstClientId);

  // Computed values
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

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [metricCardsIndex, setMetricCardsIndex] = useState(0);
  const [projectFormData, setProjectFormData] = useState({
    name: '',
    description: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    loanNumber: '',
    loanAmount: '',
    interestRate: '',
    status: 'active' as Project['status'],
    startDate: '',
    endDate: '',
    expectedCompletionDate: '',
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

  // Initialize form data when project loads
  useEffect(() => {
    if (project) {
      setProjectFormData({
        name: project.name,
        description: project.description || '',
        address: project.address || '',
        city: project.city || '',
        state: project.state || '',
        zip: project.zip || '',
        country: project.country || '',
        loanNumber: project.loanNumber || '',
        loanAmount: project.loanAmount?.toString() || '',
        interestRate: project.interestRate?.toString() || '',
        status: project.status || 'active',
        startDate: project.startDate ? project.startDate.split('T')[0] : '',
        endDate: project.endDate ? project.endDate.split('T')[0] : '',
        expectedCompletionDate: project.expectedCompletionDate ? project.expectedCompletionDate.split('T')[0] : '',
        notes: project.notes || '',
      });
    }
  }, [project]);

  const handleSaveProject = async () => {
    if (!project) return;
    await updateProjectMutation({
      id: projectId,
      ...projectFormData,
      loanAmount: projectFormData.loanAmount ? parseFloat(projectFormData.loanAmount) : undefined,
      interestRate: projectFormData.interestRate ? parseFloat(projectFormData.interestRate) : undefined,
      startDate: projectFormData.startDate ? new Date(projectFormData.startDate).toISOString() : undefined,
      endDate: projectFormData.endDate ? new Date(projectFormData.endDate).toISOString() : undefined,
      expectedCompletionDate: projectFormData.expectedCompletionDate ? new Date(projectFormData.expectedCompletionDate).toISOString() : undefined,
    });
    setIsEditingInfo(false);
  };

  const handleCancelEdit = () => {
    if (!project) return;
    setProjectFormData({
      name: project.name,
      description: project.description || '',
      address: project.address || '',
      city: project.city || '',
      state: project.state || '',
      zip: project.zip || '',
      country: project.country || '',
      loanNumber: project.loanNumber || '',
      loanAmount: project.loanAmount?.toString() || '',
      interestRate: project.interestRate?.toString() || '',
      status: project.status || 'active',
      startDate: project.startDate ? project.startDate.split('T')[0] : '',
      endDate: project.endDate ? project.endDate.split('T')[0] : '',
      expectedCompletionDate: project.expectedCompletionDate ? project.expectedCompletionDate.split('T')[0] : '',
      notes: project.notes || '',
    });
    setIsEditingInfo(false);
  };

  const handleStatusChange = async (newStatus: 'active' | 'inactive' | 'completed' | 'on-hold' | 'cancelled') => {
    await updateProjectMutation({
      id: projectId,
      status: newStatus,
    });
  };

  const handleTypeChange = async (newType: 'new-build' | 'roof-renovation' | 'new-development' | 'renovation' | 'refurbishment' | 'extension' | 'commercial' | 'residential') => {
    await updateProjectMutation({
      id: projectId,
      metadata: {
        ...(project?.metadata || {}),
        type: newType,
      },
    });
  };

  const handleContactProject = () => {
    // Navigate to email creation page for the client associated with this project
    if (firstClientId) {
      router.push(`/prospects/${firstClientId}/email`);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !project) return;
    
    const currentNotes = project.notes || '';
    const timestamp = new Date().toLocaleString();
    const noteEntry = `[${timestamp}] ${newNote.trim()}\n\n`;
    const updatedNotes = currentNotes ? `${currentNotes}${noteEntry}` : noteEntry;
    
    await updateProjectMutation({
      id: projectId,
      notes: updatedNotes,
    });
    
    setNewNote('');
    setIsAddingNote(false);
  };

  const handleFileAnalyzed = (file: any, result: any) => {
    // FileUpload component handles the modal and confirmation
    // After confirmation, it will automatically associate with this project
    setIsAnalysisOpen(false);
  };

  const handleFileError = (file: any, error: string) => {
    console.error('File analysis error:', error);
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
        projectId,
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
    const contactId = (contact._id || contact.id) as string;
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
    await acceptEnrichment({ id: suggestionId as Id<"enrichmentSuggestions"> });
  };

  const handleRejectEnrichment = async (suggestionId: string) => {
    await rejectEnrichment({ id: suggestionId as Id<"enrichmentSuggestions"> });
  };

  const handleDelete = async (id: Id<"documents">) => {
    if (confirm('Are you sure you want to delete this document?')) {
      await deleteDocumentMutation({ id });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getDocumentName = (documentId: Id<"documents">): string => {
    const doc = documents.find(d => (d._id as string) === (documentId as string));
    return doc?.fileName || 'Unknown Document';
  };

  const documentsWithExtractedData = documents.filter(
    (doc: any) => doc.extractedData
  );

  // Calculate total metric cards for slideshow controls
  const calculateMetricCardsCount = () => {
    if (!project) return 1; // Return minimum count if project not loaded yet
    let count = 1; // Always show Total Documents
    if (project.loanAmount || documents.some((d: any) => d.extractedData?.financing?.loanAmount)) count++;
    if (documents.some((d: any) => d.extractedData?.costsTotal?.amount)) count++;
    if (documents.some((d: any) => d.extractedData?.financing?.interestPercentage || d.extractedData?.averageInterest?.percentage)) count++;
    if (documents.some((d: any) => d.extractedData?.profit?.total)) count++;
    if (documents.some((d: any) => d.extractedData?.units?.count || d.extractedData?.plots?.length)) count++;
    if (documents.some((d: any) => d.extractedData?.revenue?.totalSales)) count++;
    count++; // Communications
    if (documents.length > 0) count++; // Last Activity
    return count;
  };

  const totalMetricCards = calculateMetricCardsCount();
  const canGoBackMetric = metricCardsIndex > 0;
  const canGoForwardMetric = metricCardsIndex + 4 < totalMetricCards;

  const tabs: Array<{ id: TabType; label: string; icon: typeof FileText; count?: number }> = [
    { id: 'overview', label: 'Overview', icon: FolderKanban },
    { id: 'documents', label: 'Documents', icon: FileText, count: documents.length },
    { id: 'extracted', label: 'Extracted Data', icon: TrendingUp, count: documentsWithExtractedData.length },
    { id: 'communications', label: 'Communications', icon: MessageSquare, count: communications.length },
    { id: 'contacts', label: 'Contacts', icon: Users, count: contacts.length },
    { id: 'info', label: 'Project Info', icon: FolderKanban },
    { id: 'enrichment', label: 'Enrichment', icon: Sparkles, count: enrichmentSuggestions.length + prospectingContexts.length },
    { id: 'knowledge-bank', label: 'Knowledge Bank', icon: StickyNote },
  ];

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Project not found.</p>
            <Link href="/projects" className="mt-4 text-blue-600 hover:text-blue-700">
              Back to Projects
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Format address
  const formatProjectAddress = () => {
    const parts = [];
    if (project.address) parts.push(project.address);
    if (project.city) parts.push(project.city);
    if (project.state) parts.push(project.state);
    if (project.zip) parts.push(project.zip);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Link href="/projects" className="hover:text-gray-900 transition-colors">
            Projects
          </Link>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="text-gray-900 font-medium">{project.name}</span>
        </nav>

        {/* New Note Dialog */}
        <Dialog open={isAddingNote} onOpenChange={setIsAddingNote}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Note</DialogTitle>
              <DialogDescription>
                Add a note to this project's record. Notes are timestamped and appended to the project's notes.
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

        {/* New Analysis Dialog */}
        <Dialog open={isAnalysisOpen} onOpenChange={setIsAnalysisOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Analysis</DialogTitle>
              <DialogDescription>
                Upload files to analyze and associate with this project. This will build scenarios and extract data.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <FileUpload
                onFileAnalyzed={handleFileAnalyzed}
                onError={handleFileError}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
              <div className="flex items-center gap-2">
                <EditableProjectStatusBadge 
                  status={project.status as 'active' | 'inactive' | 'completed' | 'on-hold' | 'cancelled' | undefined}
                  onStatusChange={handleStatusChange}
                />
                <EditableProjectTypeBadge
                  type={(project as any).metadata?.type || (project as any).type}
                  onTypeChange={handleTypeChange}
                />
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleContactProject}
                className="whitespace-nowrap"
                disabled={!firstClientId}
              >
                <Mail className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Contact</span>
                <span className="sm:hidden">Contact</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddingNote(true)}
                className="whitespace-nowrap"
              >
                <StickyNote className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">New Note</span>
                <span className="sm:hidden">Note</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAnalysisOpen(true)}
                className="whitespace-nowrap"
              >
                <Upload className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">New Analysis</span>
                <span className="sm:hidden">Analysis</span>
              </Button>
            </div>
          </div>

          {/* Info Row */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600 mb-4">
            <span>Created: {new Date(project.createdAt).toLocaleDateString()}</span>
            {client && (
              <>
                <span className="text-gray-400">•</span>
                <span>
                  Client: <Link href={`/clients/${firstClientId}`} className="text-blue-600 hover:text-blue-700">{client.name}</Link>
                </span>
              </>
            )}
            {formatProjectAddress() && (
              <>
                <span className="text-gray-400">•</span>
                <span>{formatProjectAddress()}</span>
              </>
            )}
            {project.zip && (
              <>
                <span className="text-gray-400">•</span>
                <span>Postal Code: {project.zip}</span>
              </>
            )}
          </div>

          {/* Tags */}
          {project.tags && project.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {project.tags.map(tag => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        {/* Metric Cards Slideshow */}
        <div className="relative mb-8">
          <MetricCardsSlideshow
            documents={documents}
            projectLoanAmount={project.loanAmount}
            communicationsCount={communications.length}
            showControls={false}
            currentIndex={metricCardsIndex}
            onControlsChange={setMetricCardsIndex}
          />
          {/* Metric Cards Controls - positioned above rightmost card */}
          {totalMetricCards > 4 && (
            <div className="absolute -top-10 right-0 lg:right-0">
              <MetricCardsControls
                currentIndex={metricCardsIndex}
                totalCards={totalMetricCards}
                onPrevious={() => setMetricCardsIndex(Math.max(0, metricCardsIndex - 4))}
                onNext={() => setMetricCardsIndex(Math.min(totalMetricCards - 4, metricCardsIndex + 4))}
                canGoBack={canGoBackMetric}
                canGoForward={canGoForwardMetric}
              />
            </div>
          )}
        </div>

        {/* Tabs Navigation */}
        <div className="bg-white border-b border-gray-200 mb-6">
          {/* Mobile: Dropdown */}
          <div className="lg:hidden px-4 py-3">
            <Select value={activeTab} onValueChange={(value) => setActiveTab(value as TabType)}>
              <SelectTrigger className="w-full">
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
          <nav className="hidden lg:flex">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`px-1.5 py-0.5 text-xs rounded-full flex-shrink-0 ${
                      activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Financial Summary */}
                {documentsWithExtractedData.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Financial Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {documentsWithExtractedData.map((doc: any) => {
                        const docId = (doc._id || doc.id) as Id<"documents">;
                        const extracted = doc.extractedData;
                        if (!extracted) return null;
                        return (
                          <div key={docId} className="bg-white rounded-md p-3 border border-gray-200">
                            <p className="text-xs text-gray-500 mb-1">{doc.fileName}</p>
                            {extracted.costsTotal && (
                              <p className="text-sm font-medium text-gray-900">
                                Total: {extracted.costsTotal.currency || 'GBP'} {extracted.costsTotal.amount.toLocaleString()}
                              </p>
                            )}
                            {extracted.financing?.loanAmount && (
                              <p className="text-sm text-gray-700">
                                Loan: {extracted.financing.currency || 'GBP'} {extracted.financing.loanAmount.toLocaleString()}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Project Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Project Details</h3>
                    <div className="space-y-2 text-sm">
                      {project.loanNumber && (
                        <div>
                          <span className="text-gray-600">Loan Number: </span>
                          <span className="text-gray-900 font-medium">{project.loanNumber}</span>
                        </div>
                      )}
                      {project.loanAmount && (
                        <div>
                          <span className="text-gray-600">Loan Amount: </span>
                          <span className="text-gray-900 font-medium">
                            {project.loanAmount.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {project.interestRate && (
                        <div>
                          <span className="text-gray-600">Interest Rate: </span>
                          <span className="text-gray-900 font-medium">
                            {(project.interestRate * 100).toFixed(2)}%
                          </span>
                        </div>
                      )}
                      {project.startDate && (
                        <div>
                          <span className="text-gray-600">Start Date: </span>
                          <span className="text-gray-900">
                            {new Date(project.startDate).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {project.expectedCompletionDate && (
                        <div>
                          <span className="text-gray-600">Expected Completion: </span>
                          <span className="text-gray-900">
                            {new Date(project.expectedCompletionDate).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Recent Documents</h3>
                    {documents.length > 0 ? (
                      <div className="space-y-2">
                        {documents
                          .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
                          .slice(0, 5)
                          .map((doc: any) => {
                            const docId = (doc._id || doc.id) as Id<"documents">;
                            return (
                              <div
                                key={docId}
                                className="flex items-center justify-between p-2 bg-white rounded hover:bg-gray-100 transition-colors cursor-pointer"
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
                                <Badge variant="secondary" className="ml-2 text-xs">
                                  {doc.fileTypeDetected}
                                </Badge>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No documents yet</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Documents Tab */}
            {activeTab === 'documents' && (
              <div>
                {documents.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No documents found for this project.
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
                          const docId = (doc._id || doc.id) as Id<"documents">;
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

            {/* Extracted Data Tab */}
            {activeTab === 'extracted' && (
              <div>
                {documentsWithExtractedData.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No documents with extracted data found.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {documentsWithExtractedData.map((doc: any) => {
                      const docId = (doc._id || doc.id) as Id<"documents">;
                      const extracted = doc.extractedData;
                      if (!extracted) return null;

                      return (
                        <div key={docId} className="border border-gray-200 rounded-lg p-6 bg-white">
                          <div className="flex items-start justify-between mb-4">
                            <h3 className="font-semibold text-gray-900">{doc.fileName}</h3>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/docs/${docId}`)}
                              className="text-blue-600 hover:text-blue-700"
                            >
                              View Document
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {extracted.costsTotal && (
                              <div className="bg-blue-50 rounded-md p-3">
                                <p className="text-xs text-gray-600 mb-1">Total Costs</p>
                                <p className="text-lg font-bold text-gray-900">
                                  {extracted.costsTotal.currency || 'GBP'} {extracted.costsTotal.amount.toLocaleString()}
                                </p>
                              </div>
                            )}

                            {extracted.financing?.loanAmount && (
                              <div className="bg-green-50 rounded-md p-3">
                                <p className="text-xs text-gray-600 mb-1">Loan Amount</p>
                                <p className="text-lg font-bold text-gray-900">
                                  {extracted.financing.currency || 'GBP'} {extracted.financing.loanAmount.toLocaleString()}
                                </p>
                                {extracted.financing.interestRate && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    Interest Rate: {(extracted.financing.interestRate * 100).toFixed(2)}%
                                  </p>
                                )}
                              </div>
                            )}

                            {extracted.units && (
                              <div className="bg-purple-50 rounded-md p-3">
                                <p className="text-xs text-gray-600 mb-1">Units</p>
                                <p className="text-lg font-bold text-gray-900">
                                  {extracted.units.count} {extracted.units.type}
                                </p>
                                {extracted.units.costPerUnit && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    Cost per unit: {extracted.units.currency || 'GBP'} {extracted.units.costPerUnit.toLocaleString()}
                                  </p>
                                )}
                              </div>
                            )}

                            {extracted.profit && (
                              <div className="bg-yellow-50 rounded-md p-3">
                                <p className="text-xs text-gray-600 mb-1">Profit</p>
                                {extracted.profit.total && (
                                  <p className="text-lg font-bold text-gray-900">
                                    {extracted.profit.currency || extracted.detectedCurrency || 'GBP'} {extracted.profit.total.toLocaleString()}
                                  </p>
                                )}
                                {extracted.profit.percentage && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    {extracted.profit.percentage.toFixed(2)}%
                                  </p>
                                )}
                              </div>
                            )}

                            {extracted.revenue && (
                              <div className="bg-emerald-50 rounded-md p-3">
                                <p className="text-xs text-gray-600 mb-1">Revenue / Sales</p>
                                {extracted.revenue.totalSales && (
                                  <p className="text-lg font-bold text-gray-900">
                                    {extracted.revenue.currency || extracted.detectedCurrency || 'GBP'} {extracted.revenue.totalSales.toLocaleString()}
                                  </p>
                                )}
                                {extracted.revenue.salesPerUnit && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    {extracted.revenue.currency || extracted.detectedCurrency || 'GBP'} {extracted.revenue.salesPerUnit.toLocaleString()} per unit
                                  </p>
                                )}
                              </div>
                            )}

                            {extracted.averageInterest && (
                              <div className="bg-indigo-50 rounded-md p-3">
                                <p className="text-xs text-gray-600 mb-1">Average Interest Rate</p>
                                <p className="text-lg font-bold text-gray-900">
                                  {extracted.averageInterest.percentage ? `${extracted.averageInterest.percentage.toFixed(2)}%` : `${(extracted.averageInterest.rate * 100).toFixed(2)}%`}
                                </p>
                              </div>
                            )}

                            {extracted.plotsTotal && (
                              <div className="bg-teal-50 rounded-md p-3">
                                <p className="text-xs text-gray-600 mb-1">Plots Total</p>
                                <p className="text-lg font-bold text-gray-900">
                                  {extracted.plotsTotal.currency || extracted.detectedCurrency || 'GBP'} {extracted.plotsTotal.amount.toLocaleString()}
                                </p>
                              </div>
                            )}
                          </div>

                          {extracted.plots && extracted.plots.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <p className="text-sm font-medium text-gray-900 mb-2">Plots</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {extracted.plots.map((plot, idx) => (
                                  <div key={idx} className="bg-gray-50 rounded-md p-2">
                                    <p className="text-sm font-medium text-gray-900">{plot.name}</p>
                                    <p className="text-sm text-gray-700">
                                      {plot.currency || 'GBP'} {plot.cost.toLocaleString()}
                                    </p>
                                    {plot.squareFeet && (
                                      <p className="text-xs text-gray-500">
                                        {plot.squareFeet.toLocaleString()} sq ft
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {extracted.costCategories && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <p className="text-sm font-medium text-gray-900 mb-3">Cost Breakdown by Category</p>
                              <div className="space-y-3">
                                {extracted.costCategories.siteCosts && (
                                  <div className="bg-gray-50 rounded-md p-3">
                                    <div className="flex justify-between items-center mb-2">
                                      <span className="text-sm font-semibold text-gray-900">Site Costs</span>
                                      <span className="text-sm font-bold text-gray-900">
                                        {extracted.costCategories.siteCosts.currency || 'GBP'} {extracted.costCategories.siteCosts.subtotal.toLocaleString()}
                                      </span>
                                    </div>
                                    {extracted.costCategories.siteCosts.items && extracted.costCategories.siteCosts.items.length > 0 && (
                                      <div className="mt-2 space-y-1">
                                        {extracted.costCategories.siteCosts.items.map((item, idx) => (
                                          <div key={idx} className="flex justify-between text-xs text-gray-600 pl-2">
                                            <span>{item.type}</span>
                                            <span>{item.currency || 'GBP'} {item.amount.toLocaleString()}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {extracted.costCategories.netConstructionCosts && (
                                  <div className="bg-gray-50 rounded-md p-3">
                                    <div className="flex justify-between items-center mb-2">
                                      <span className="text-sm font-semibold text-gray-900">Net Construction Costs</span>
                                      <span className="text-sm font-bold text-gray-900">
                                        {extracted.costCategories.netConstructionCosts.currency || 'GBP'} {extracted.costCategories.netConstructionCosts.subtotal.toLocaleString()}
                                      </span>
                                    </div>
                                    {extracted.costCategories.netConstructionCosts.items && extracted.costCategories.netConstructionCosts.items.length > 0 && (
                                      <div className="mt-2 space-y-1">
                                        {extracted.costCategories.netConstructionCosts.items.map((item, idx) => (
                                          <div key={idx} className="flex justify-between text-xs text-gray-600 pl-2">
                                            <span>{item.type}</span>
                                            <span>{item.currency || 'GBP'} {item.amount.toLocaleString()}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {extracted.costCategories.professionalFees && (
                                  <div className="bg-gray-50 rounded-md p-3">
                                    <div className="flex justify-between items-center mb-2">
                                      <span className="text-sm font-semibold text-gray-900">Professional Fees</span>
                                      <span className="text-sm font-bold text-gray-900">
                                        {extracted.costCategories.professionalFees.currency || 'GBP'} {extracted.costCategories.professionalFees.subtotal.toLocaleString()}
                                      </span>
                                    </div>
                                    {extracted.costCategories.professionalFees.items && extracted.costCategories.professionalFees.items.length > 0 && (
                                      <div className="mt-2 space-y-1">
                                        {extracted.costCategories.professionalFees.items.map((item, idx) => (
                                          <div key={idx} className="flex justify-between text-xs text-gray-600 pl-2">
                                            <span>{item.type}</span>
                                            <span>{item.currency || 'GBP'} {item.amount.toLocaleString()}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {extracted.costCategories.financingLegalFees && (
                                  <div className="bg-gray-50 rounded-md p-3">
                                    <div className="flex justify-between items-center mb-2">
                                      <span className="text-sm font-semibold text-gray-900">Financing/Legal Fees</span>
                                      <span className="text-sm font-bold text-gray-900">
                                        {extracted.costCategories.financingLegalFees.currency || 'GBP'} {extracted.costCategories.financingLegalFees.subtotal.toLocaleString()}
                                      </span>
                                    </div>
                                    {extracted.costCategories.financingLegalFees.items && extracted.costCategories.financingLegalFees.items.length > 0 && (
                                      <div className="mt-2 space-y-1">
                                        {extracted.costCategories.financingLegalFees.items.map((item, idx) => (
                                          <div key={idx} className="flex justify-between text-xs text-gray-600 pl-2">
                                            <span>{item.type}</span>
                                            <span>{item.currency || 'GBP'} {item.amount.toLocaleString()}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {extracted.costCategories.disposalFees && (
                                  <div className="bg-gray-50 rounded-md p-3">
                                    <div className="flex justify-between items-center mb-2">
                                      <span className="text-sm font-semibold text-gray-900">Disposal Fees</span>
                                      <span className="text-sm font-bold text-gray-900">
                                        {extracted.costCategories.disposalFees.currency || 'GBP'} {extracted.costCategories.disposalFees.subtotal.toLocaleString()}
                                      </span>
                                    </div>
                                    {extracted.costCategories.disposalFees.items && extracted.costCategories.disposalFees.items.length > 0 && (
                                      <div className="mt-2 space-y-1">
                                        {extracted.costCategories.disposalFees.items.map((item, idx) => (
                                          <div key={idx} className="flex justify-between text-xs text-gray-600 pl-2">
                                            <span>{item.type}</span>
                                            <span>{item.currency || 'GBP'} {item.amount.toLocaleString()}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {extracted.costs && extracted.costs.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <p className="text-sm font-medium text-gray-900 mb-3">Individual Cost Items</p>
                              <div className="space-y-2 max-h-64 overflow-y-auto">
                                {extracted.costs.map((cost, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm bg-gray-50 rounded-md p-2">
                                    <div className="flex-1">
                                      <span className="font-medium text-gray-900">{cost.type}</span>
                                      {cost.category && (
                                        <Badge variant="outline" className="ml-2 text-xs">
                                          {cost.category}
                                        </Badge>
                                      )}
                                    </div>
                                    <span className="font-semibold text-gray-900">
                                      {cost.currency || extracted.detectedCurrency || 'GBP'} {cost.amount.toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {extracted.miscellaneous && extracted.miscellaneous.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <p className="text-sm font-medium text-gray-900 mb-3">Miscellaneous Costs</p>
                              <div className="space-y-2">
                                {extracted.miscellaneous.map((misc, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm bg-gray-50 rounded-md p-2">
                                    <span className="font-medium text-gray-900">{misc.type}</span>
                                    <span className="font-semibold text-gray-900">
                                      {misc.currency || extracted.detectedCurrency || 'GBP'} {misc.amount.toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {extracted.detectedCurrency && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <p className="text-xs text-gray-500">
                                <span className="font-medium">Detected Currency:</span> {extracted.detectedCurrency}
                              </p>
                            </div>
                          )}

                          {extracted.extractionNotes && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <p className="text-xs text-gray-500 italic">{extracted.extractionNotes}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Communications Tab */}
            {activeTab === 'communications' && (
              <div>
                {communications.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No communications found for this project.
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
                      const contactId = (contact._id || contact.id) as string;
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

            {/* Project Info Tab */}
            {activeTab === 'info' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Project Information</h3>
                  {!isEditingInfo && (
                    <Button
                      onClick={() => setIsEditingInfo(true)}
                      variant="outline"
                      size="sm"
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  )}
                </div>

                {isEditingInfo ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Project Name *
                        </label>
                        <input
                          type="text"
                          value={projectFormData.name}
                          onChange={(e) => setProjectFormData({ ...projectFormData, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Status
                        </label>
                        <select
                          value={projectFormData.status}
                          onChange={(e) => handleStatusChange(e.target.value as Project['status'])}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="completed">Completed</option>
                          <option value="on-hold">On Hold</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Loan Number
                        </label>
                        <input
                          type="text"
                          value={projectFormData.loanNumber}
                          onChange={(e) => setProjectFormData({ ...projectFormData, loanNumber: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Loan Amount
                        </label>
                        <input
                          type="number"
                          value={projectFormData.loanAmount}
                          onChange={(e) => setProjectFormData({ ...projectFormData, loanAmount: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Interest Rate (%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={projectFormData.interestRate}
                          onChange={(e) => setProjectFormData({ ...projectFormData, interestRate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Start Date
                        </label>
                        <input
                          type="date"
                          value={projectFormData.startDate}
                          onChange={(e) => setProjectFormData({ ...projectFormData, startDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Expected Completion Date
                        </label>
                        <input
                          type="date"
                          value={projectFormData.expectedCompletionDate}
                          onChange={(e) => setProjectFormData({ ...projectFormData, expectedCompletionDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          End Date
                        </label>
                        <input
                          type="date"
                          value={projectFormData.endDate}
                          onChange={(e) => setProjectFormData({ ...projectFormData, endDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Address
                        </label>
                        <input
                          type="text"
                          value={projectFormData.address}
                          onChange={(e) => setProjectFormData({ ...projectFormData, address: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          City
                        </label>
                        <input
                          type="text"
                          value={projectFormData.city}
                          onChange={(e) => setProjectFormData({ ...projectFormData, city: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          State
                        </label>
                        <input
                          type="text"
                          value={projectFormData.state}
                          onChange={(e) => setProjectFormData({ ...projectFormData, state: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ZIP Code
                        </label>
                        <input
                          type="text"
                          value={projectFormData.zip}
                          onChange={(e) => setProjectFormData({ ...projectFormData, zip: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Country
                        </label>
                        <input
                          type="text"
                          value={projectFormData.country}
                          onChange={(e) => setProjectFormData({ ...projectFormData, country: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <textarea
                          value={projectFormData.description}
                          onChange={(e) => setProjectFormData({ ...projectFormData, description: e.target.value })}
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Notes
                        </label>
                        <textarea
                          value={projectFormData.notes}
                          onChange={(e) => setProjectFormData({ ...projectFormData, notes: e.target.value })}
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveProject} size="sm">
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={handleCancelEdit} size="sm">
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Check if project has minimal data */}
                    {(!project.loanNumber && !project.loanAmount && !project.interestRate && 
                      !project.startDate && !project.expectedCompletionDate && !project.endDate &&
                      !project.address && !project.city && !project.description && !project.notes) ? (
                      <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
                        <FolderKanban className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                        <h4 className="text-lg font-semibold text-gray-900 mb-2">Project Details Pending</h4>
                        <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
                          Project details will be automatically updated when more information is provided through document analysis, or you can manually add details below.
                        </p>
                        <Button
                          onClick={() => setIsEditingInfo(true)}
                          variant="default"
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Add Project Details
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-medium text-gray-900 mb-3">Basic Information</h4>
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-gray-600">Project Name: </span>
                              <span className="text-gray-900 font-medium">{project.name}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Status: </span>
                              {project.status && <StatusBadge status={project.status} />}
                            </div>
                            {project.loanNumber ? (
                              <div>
                                <span className="text-gray-600">Loan Number: </span>
                                <span className="text-gray-900">{project.loanNumber}</span>
                              </div>
                            ) : (
                              <div className="text-gray-400 italic">Loan Number: Not provided</div>
                            )}
                            {project.loanAmount ? (
                              <div>
                                <span className="text-gray-600">Loan Amount: </span>
                                <span className="text-gray-900 font-medium">
                                  ${project.loanAmount.toLocaleString()}
                                </span>
                              </div>
                            ) : (
                              <div className="text-gray-400 italic">Loan Amount: Not provided</div>
                            )}
                            {project.interestRate ? (
                              <div>
                                <span className="text-gray-600">Interest Rate: </span>
                                <span className="text-gray-900">
                                  {(project.interestRate * 100).toFixed(2)}%
                                </span>
                              </div>
                            ) : (
                              <div className="text-gray-400 italic">Interest Rate: Not provided</div>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 mb-3">Timeline</h4>
                          <div className="space-y-2 text-sm">
                            {project.startDate ? (
                              <div>
                                <span className="text-gray-600">Start Date: </span>
                                <span className="text-gray-900">
                                  {new Date(project.startDate).toLocaleDateString()}
                                </span>
                              </div>
                            ) : (
                              <div className="text-gray-400 italic">Start Date: Not provided</div>
                            )}
                            {project.expectedCompletionDate ? (
                              <div>
                                <span className="text-gray-600">Expected Completion: </span>
                                <span className="text-gray-900">
                                  {new Date(project.expectedCompletionDate).toLocaleDateString()}
                                </span>
                              </div>
                            ) : (
                              <div className="text-gray-400 italic">Expected Completion: Not provided</div>
                            )}
                            {project.endDate ? (
                              <div>
                                <span className="text-gray-600">End Date: </span>
                                <span className="text-gray-900">
                                  {new Date(project.endDate).toLocaleDateString()}
                                </span>
                              </div>
                            ) : (
                              <div className="text-gray-400 italic">End Date: Not provided</div>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 mb-3">Address</h4>
                          {(project.address || project.city) ? (
                            <div className="text-sm text-gray-700">
                              {project.address && <div>{project.address}</div>}
                              {(project.city || project.state || project.zip) && (
                                <div>
                                  {project.city && <span>{project.city}</span>}
                                  {project.city && project.state && <span>, </span>}
                                  {project.state && <span>{project.state}</span>}
                                  {project.zip && <span> {project.zip}</span>}
                                </div>
                              )}
                              {project.country && <div>{project.country}</div>}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-400 italic">Address: Not provided</div>
                          )}
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 mb-3">Description</h4>
                          {project.description ? (
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{project.description}</p>
                          ) : (
                            <p className="text-sm text-gray-400 italic">No description provided</p>
                          )}
                        </div>
                        {project.notes && (
                          <div className="md:col-span-2">
                            <h4 className="font-medium text-gray-900 mb-3">Notes</h4>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{project.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
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
                          {enrichmentSuggestions.map((suggestion: any) => {
                            const suggestionId = (suggestion._id || suggestion.id) as string;
                            return (
                              <EnrichmentSuggestionCard
                                key={suggestionId}
                                suggestion={suggestion}
                                onAccept={() => handleAcceptEnrichment(suggestionId)}
                                onReject={() => handleRejectEnrichment(suggestionId)}
                                documentName={getDocumentName(suggestion.documentId as Id<"documents">)}
                              />
                            );
                          })}
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
                          {prospectingContexts.map((context) => (
                            <ProspectingContextCard
                              key={context.documentId}
                              context={context}
                              documentName={getDocumentName(context.documentId)}
                            />
                          ))}
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
                    Consolidated view of all information about this project from documents, emails, and interactions.
                  </p>
                </div>
                <KnowledgeBankView projectId={projectId} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
