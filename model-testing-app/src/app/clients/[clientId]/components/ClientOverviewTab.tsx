'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  FileText,
  FolderKanban,
  Calendar,
  ExternalLink,
  Briefcase,
  Pencil,
  CheckSquare,
  Clock,
  AlertCircle,
  Check,
  X,
  StickyNote,
  DollarSign,
  User,
  Video,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';
import MissingDocumentsCard from './MissingDocumentsCard';

interface ClientOverviewTabProps {
  client: {
    _id: string;
    name: string;
    type?: string;
    status?: string;
    companyName?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    phone?: string;
    email?: string;
    website?: string;
    industry?: string;
    notes?: string;
    tags?: string[];
    stageNote?: string;
    stageNoteUpdatedAt?: string;
    createdAt: string;
  };
  clientId: Id<"clients">;
  documents: any[];
  projects: any[];
  contacts: any[];
  onOpenSettings?: () => void;
}

// Helper to format currency
function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

export default function ClientOverviewTab({
  client,
  clientId,
  documents,
  projects,
  contacts,
  onOpenSettings,
}: ClientOverviewTabProps) {
  const router = useRouter();
  const [isEditingStageNote, setIsEditingStageNote] = useState(false);
  const [stageNoteValue, setStageNoteValue] = useState(client.stageNote || '');
  const [isEditingDealValue, setIsEditingDealValue] = useState(false);
  const [dealValueInput, setDealValueInput] = useState('');

  // Fetch active tasks for this client
  const clientTasks = useQuery(api.tasks.getByClient, { clientId });
  const activeTasks = useMemo(() => {
    if (!clientTasks) return [];
    return clientTasks
      .filter(t => t.status === 'todo' || t.status === 'in_progress')
      .slice(0, 5);
  }, [clientTasks]);

  // Fetch meetings for this client
  const meetings = useQuery(api.meetings.getByClient, { clientId, limit: 5 });

  // Stage note mutation
  const updateStageNote = useMutation(api.clients.updateStageNote);

  // Project mutation for updating loan amount
  const updateProject = useMutation(api.projects.update);

  // Calculate recent documents
  const recentDocuments = useMemo(() => {
    return documents
      .sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .slice(0, 5);
  }, [documents]);

  // Calculate total deal value from projects
  const totalDealValue = useMemo(() => {
    return projects.reduce((sum: number, p: any) => sum + (p.loanAmount || 0), 0);
  }, [projects]);

  // Get the first/main project for editing deal value
  const mainProject = useMemo(() => {
    if (!projects || projects.length === 0) return null;
    // Prefer active projects, otherwise first project
    const active = projects.find((p: any) => p.status === 'active');
    return active || projects[0];
  }, [projects]);

  // Calculate active projects count
  const activeProjectsCount = useMemo(() => {
    return projects.filter((p: any) => p.status === 'active').length;
  }, [projects]);

  // Get primary contact (first contact or one marked as primary)
  const primaryContact = useMemo(() => {
    if (!contacts || contacts.length === 0) return null;
    // For now, just return the first contact
    return contacts[0];
  }, [contacts]);

  // Get last meeting
  const lastMeeting = useMemo(() => {
    if (!meetings || meetings.length === 0) return null;
    return meetings[0]; // Already sorted by date descending
  }, [meetings]);

  // Handle stage note save
  const handleSaveStageNote = async () => {
    await updateStageNote({ id: clientId, stageNote: stageNoteValue });
    setIsEditingStageNote(false);
  };

  // Handle stage note cancel
  const handleCancelStageNote = () => {
    setStageNoteValue(client.stageNote || '');
    setIsEditingStageNote(false);
  };

  // Handle deal value edit start
  const handleStartEditDealValue = () => {
    setDealValueInput(totalDealValue > 0 ? totalDealValue.toString() : '');
    setIsEditingDealValue(true);
  };

  // Handle deal value save
  const handleSaveDealValue = async () => {
    if (!mainProject) return;
    const newValue = parseFloat(dealValueInput.replace(/[^0-9.]/g, ''));
    if (!isNaN(newValue)) {
      await updateProject({
        id: mainProject._id,
        loanAmount: newValue,
      });
    }
    setIsEditingDealValue(false);
  };

  // Handle deal value cancel
  const handleCancelDealValue = () => {
    setDealValueInput('');
    setIsEditingDealValue(false);
  };

  // Get priority color
  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  // Format address
  const formatAddress = () => {
    const parts = [];
    if (client.address) parts.push(client.address);
    if (client.city) parts.push(client.city);
    if (client.state) parts.push(client.state);
    if (client.zip) parts.push(client.zip);
    if (client.country) parts.push(client.country);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  // Handle navigation to knowledge tab
  const handleViewKnowledge = () => {
    router.push(`/clients/${clientId}?tab=checklist`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Left Column - Knowledge Library */}
      <div className="lg:col-span-1">
        <MissingDocumentsCard
          clientId={clientId}
          onViewAll={handleViewKnowledge}
        />
      </div>

      {/* Right Column - Everything Else */}
      <div className="lg:col-span-3 space-y-4">
        {/* Stage Note - Slim Banner */}
        <div className="bg-white rounded-lg border border-l-4 border-l-blue-500 px-4 py-2">
          <div className="flex items-center gap-3">
            <StickyNote className="w-4 h-4 text-blue-500 flex-shrink-0" />
            {isEditingStageNote ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  value={stageNoteValue}
                  onChange={(e) => setStageNoteValue(e.target.value)}
                  placeholder="Enter current stage/status (e.g., 'Awaiting KYC docs', 'Loan approved - closing')"
                  className="flex-1 h-7 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveStageNote();
                    if (e.key === 'Escape') handleCancelStageNote();
                  }}
                />
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleSaveStageNote}>
                  <Check className="w-4 h-4 text-green-600" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleCancelStageNote}>
                  <X className="w-4 h-4 text-gray-400" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-sm flex-1">
                  <span className="font-semibold text-gray-700">Status:</span>{' '}
                  {client.stageNote ? (
                    <span className="font-medium text-gray-900">{client.stageNote}</span>
                  ) : (
                    <span className="text-gray-400 italic">Click to add...</span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-gray-400 hover:text-gray-600"
                  onClick={() => setIsEditingStageNote(true)}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Deal Value - Editable */}
        <div
          className="bg-white rounded-lg border p-4 cursor-pointer hover:border-green-300 transition-colors group"
          onClick={!isEditingDealValue ? handleStartEditDealValue : undefined}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="text-xs text-gray-500 font-medium">Deal Value</p>
                {!isEditingDealValue && mainProject && (
                  <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
              {isEditingDealValue ? (
                <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                  <span className="text-lg font-semibold text-gray-500">$</span>
                  <Input
                    type="text"
                    value={dealValueInput}
                    onChange={(e) => setDealValueInput(e.target.value)}
                    placeholder="0"
                    className="h-8 text-lg font-semibold w-24"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveDealValue();
                      if (e.key === 'Escape') handleCancelDealValue();
                    }}
                  />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleSaveDealValue}>
                    <Check className="w-4 h-4 text-green-600" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleCancelDealValue}>
                    <X className="w-4 h-4 text-gray-400" />
                  </Button>
                </div>
              ) : (
                <p className="text-lg font-semibold text-gray-900 truncate">
                  {totalDealValue > 0 ? formatCurrency(totalDealValue) : '—'}
                  {!mainProject && <span className="text-xs font-normal text-gray-400 ml-1">(no projects)</span>}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Active Projects */}
        <div
          className="bg-white rounded-lg border p-4 cursor-pointer hover:border-blue-300 transition-colors"
          onClick={() => router.push(`/clients/${clientId}?tab=projects`)}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <FolderKanban className="w-5 h-5 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium">Active Projects</p>
              <p className="text-lg font-semibold text-gray-900">
                {activeProjectsCount} <span className="text-sm font-normal text-gray-500">of {projects.length}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Primary Contact */}
        <div
          className="bg-white rounded-lg border p-4 cursor-pointer hover:border-blue-300 transition-colors"
          onClick={() => router.push(`/clients/${clientId}?tab=contacts`)}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500 font-medium">Primary Contact</p>
              {primaryContact ? (
                <div>
                  <p className="text-sm font-semibold text-gray-900 truncate">{primaryContact.name}</p>
                  <p className="text-xs text-gray-500 truncate">{primaryContact.role || primaryContact.email || '—'}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No contacts</p>
              )}
            </div>
          </div>
        </div>

        {/* Last Meeting */}
        <div
          className="bg-white rounded-lg border p-4 cursor-pointer hover:border-blue-300 transition-colors"
          onClick={() => router.push(`/clients/${clientId}?tab=meetings`)}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Video className="w-5 h-5 text-orange-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500 font-medium">Last Meeting</p>
              {lastMeeting ? (
                <div>
                  <p className="text-sm font-semibold text-gray-900 truncate">{lastMeeting.title}</p>
                  <p className="text-xs text-gray-500">{new Date(lastMeeting.meetingDate).toLocaleDateString()}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No meetings</p>
              )}
            </div>
          </div>
        </div>
      </div>

        {/* Main Content - Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left - Company Info + Recent Activity */}
          <div className="lg:col-span-2 space-y-4">
          {/* Company Information Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="w-4 h-4" />
                Company Information
              </CardTitle>
              {onOpenSettings && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={onOpenSettings}
                >
                  <Pencil className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                <div>
                  <p className="text-xs text-gray-500">Company Name</p>
                  <p className="text-sm font-medium">{client.companyName || client.name}</p>
                </div>

                {client.industry && (
                  <div>
                    <p className="text-xs text-gray-500">Industry</p>
                    <p className="text-sm font-medium">{client.industry}</p>
                  </div>
                )}

                {formatAddress() && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500">Address</p>
                    <p className="text-sm font-medium flex items-start gap-2">
                      <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                      {formatAddress()}
                    </p>
                  </div>
                )}

                {client.email && (
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <a
                      href={`mailto:${client.email}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
                    >
                      <Mail className="w-3 h-3" />
                      {client.email}
                    </a>
                  </div>
                )}

                {client.phone && (
                  <div>
                    <p className="text-xs text-gray-500">Phone</p>
                    <a
                      href={`tel:${client.phone}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
                    >
                      <Phone className="w-3 h-3" />
                      {client.phone}
                    </a>
                  </div>
                )}

                {client.website && (
                  <div>
                    <p className="text-xs text-gray-500">Website</p>
                    <a
                      href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
                    >
                      <Globe className="w-3 h-3" />
                      {client.website}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-500">Client Since</p>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 text-gray-400" />
                    {new Date(client.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {client.tags && client.tags.length > 0 && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-1.5">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {client.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {client.notes && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500">Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {client.notes.substring(0, 300)}
                      {client.notes.length > 300 && '...'}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity - Combined Documents + Projects */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="w-4 h-4" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Recent Documents Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Documents</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 px-2"
                      onClick={() => router.push(`/clients/${clientId}?tab=documents`)}
                    >
                      View All <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                  {recentDocuments.length === 0 ? (
                    <p className="text-gray-400 text-sm py-2">No documents yet</p>
                  ) : (
                    <div className="space-y-1">
                      {recentDocuments.slice(0, 3).map((doc: any) => (
                        <div
                          key={doc._id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => router.push(`/docs/${doc._id}`)}
                        >
                          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {doc.documentCode || doc.fileName}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                            {doc.category}
                          </Badge>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {new Date(doc.uploadedAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t" />

                {/* Projects Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Projects</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 px-2"
                      onClick={() => router.push(`/clients/${clientId}?tab=projects`)}
                    >
                      View All <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                  {projects.length === 0 ? (
                    <p className="text-gray-400 text-sm py-2">No projects yet</p>
                  ) : (
                    <div className="space-y-1">
                      {projects.slice(0, 3).map((project: any) => (
                        <div
                          key={project._id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => router.push(`/clients/${clientId}/projects/${project._id}`)}
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            project.status === 'active' ? 'bg-green-100' : 'bg-gray-100'
                          }`}>
                            <Briefcase className={`w-3.5 h-3.5 ${
                              project.status === 'active' ? 'text-green-600' : 'text-gray-500'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{project.name}</p>
                          </div>
                          {project.loanAmount && (
                            <span className="text-xs text-gray-500 flex-shrink-0">
                              {formatCurrency(project.loanAmount)}
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${
                              project.status === 'active'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-gray-50 text-gray-700 border-gray-200'
                            }`}
                          >
                            {project.status || 'Unknown'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

          {/* Right - Active Tasks */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckSquare className="w-4 h-4" />
                Active Tasks
                {activeTasks.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    {activeTasks.length}
                  </Badge>
                )}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6 px-2"
                onClick={() => router.push(`/clients/${clientId}?tab=tasks`)}
              >
                View All
              </Button>
            </CardHeader>
            <CardContent>
              {activeTasks.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No active tasks</p>
              ) : (
                <div className="space-y-2">
                  {activeTasks.map((task: any) => (
                    <div
                      key={task._id}
                      className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/clients/${clientId}?tab=tasks&task=${task._id}`)}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${
                        task.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${getPriorityColor(task.priority)}`}
                          >
                            {task.priority || 'medium'}
                          </Badge>
                          {task.dueDate && (
                            <span className={`text-[10px] flex items-center gap-0.5 ${
                              new Date(task.dueDate) < new Date() ? 'text-red-500' : 'text-gray-400'
                            }`}>
                              <Clock className="w-2.5 h-2.5" />
                              {new Date(task.dueDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
