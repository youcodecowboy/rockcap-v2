'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { useColors } from '@/lib/useColors';
import {
  Panel,
  StatTile,
  StatusPill,
  FlagChip,
  EmptyState,
  Button,
  IconButton,
  Input,
  projectStatusTone,
} from '@/components/layouts';
import {
  Mail,
  Phone,
  Globe,
  MapPin,
  FileText,
  Calendar,
  ExternalLink,
  Briefcase,
  Pencil,
  CheckSquare,
  Clock,
  Check,
  X,
  StickyNote,
  ChevronRight,
} from 'lucide-react';
import MissingDocumentsCard from './MissingDocumentsCard';
import ClientHubSpotSection from './ClientHubSpotSection';

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
  onTabChange?: (tab: string) => void;
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
  onTabChange,
}: ClientOverviewTabProps) {
  const router = useRouter();
  const colors = useColors();
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

  // Get priority severity for FlagChip
  const getPrioritySeverity = (priority?: string): 'ok' | 'info' | 'warn' => {
    switch (priority) {
      case 'high': return 'warn';
      case 'medium': return 'info';
      case 'low': return 'ok';
      default: return 'info';
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

  const labelStyle = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: colors.text.muted,
    fontWeight: 500,
  };

  const linkStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 500,
    color: colors.accent.blue,
    textDecoration: 'none',
  };

  // Reusable field for the company info grid
  const InfoField = ({ label, children, colSpan }: { label: string; children: React.ReactNode; colSpan?: boolean }) => (
    <div className={colSpan ? 'md:col-span-2' : undefined}>
      <p style={{ ...labelStyle, margin: 0, marginBottom: 4 }}>{label}</p>
      {children}
    </div>
  );

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
        <div
          style={{
            background: colors.bg.card,
            border: `1px solid ${colors.border.default}`,
            borderLeft: `3px solid ${colors.accent.blue}`,
            borderRadius: 4,
            padding: '8px 14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <StickyNote size={16} color={colors.accent.blue} style={{ flexShrink: 0 }} />
            {isEditingStageNote ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <Input
                  value={stageNoteValue}
                  onChange={(e) => setStageNoteValue(e.target.value)}
                  placeholder="Enter current stage/status (e.g., 'Awaiting KYC docs', 'Loan approved - closing')"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveStageNote();
                    if (e.key === 'Escape') handleCancelStageNote();
                  }}
                />
                <IconButton label="Save" onClick={handleSaveStageNote}>
                  <Check size={16} color={colors.accent.green} />
                </IconButton>
                <IconButton label="Cancel" onClick={handleCancelStageNote}>
                  <X size={16} color={colors.text.muted} />
                </IconButton>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ fontSize: 13, flex: 1, color: colors.text.primary }}>
                  <span style={{ fontWeight: 600 }}>Status:</span>{' '}
                  {client.stageNote ? (
                    <span style={{ fontWeight: 500 }}>{client.stageNote}</span>
                  ) : (
                    <span style={{ color: colors.text.muted, fontStyle: 'italic' }}>Click to add...</span>
                  )}
                </span>
                <IconButton label="Edit status" onClick={() => setIsEditingStageNote(true)}>
                  <Pencil size={12} />
                </IconButton>
              </div>
            )}
          </div>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Deal Value - Editable */}
          {isEditingDealValue ? (
            <div
              style={{
                background: colors.bg.card,
                border: `1px solid ${colors.border.default}`,
                borderTop: `2px solid ${colors.entityTypes.client}`,
                borderRadius: 4,
                padding: '12px 14px',
              }}
            >
              <div style={{ ...labelStyle }}>Deal Value</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                <span style={{ fontSize: 18, fontWeight: 300, color: colors.text.muted }}>$</span>
                <Input
                  type="text"
                  value={dealValueInput}
                  onChange={(e) => setDealValueInput(e.target.value)}
                  placeholder="0"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveDealValue();
                    if (e.key === 'Escape') handleCancelDealValue();
                  }}
                />
                <IconButton label="Save" onClick={handleSaveDealValue}>
                  <Check size={16} color={colors.accent.green} />
                </IconButton>
                <IconButton label="Cancel" onClick={handleCancelDealValue}>
                  <X size={16} color={colors.text.muted} />
                </IconButton>
              </div>
            </div>
          ) : (
            <StatTile
              label="Deal Value"
              accent={colors.entityTypes.client}
              value={
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                  {totalDealValue > 0 ? formatCurrency(totalDealValue) : '—'}
                  {!mainProject && <span style={{ fontSize: 11, color: colors.text.muted }}>(no projects)</span>}
                </span>
              }
              meta={mainProject ? 'Click to edit' : undefined}
              onClick={handleStartEditDealValue}
            />
          )}

          {/* Active Projects */}
          <StatTile
            label="Active Projects"
            accent={colors.entityTypes.project}
            value={
              <span>
                {activeProjectsCount}{' '}
                <span style={{ fontSize: 13, color: colors.text.muted }}>of {projects.length}</span>
              </span>
            }
            onClick={() => router.push(`/clients/${clientId}?tab=projects`)}
          />

          {/* Primary Contact */}
          <StatTile
            label="Primary Contact"
            accent={colors.accent.blue}
            value={
              primaryContact ? (
                <span style={{ fontSize: 15, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                  {primaryContact.name}
                </span>
              ) : (
                <span style={{ fontSize: 15, color: colors.text.muted }}>No contacts</span>
              )
            }
            meta={primaryContact ? (primaryContact.role || primaryContact.email || '—') : undefined}
            onClick={() => router.push(`/clients/${clientId}?tab=contacts`)}
          />

          {/* Last Meeting */}
          <StatTile
            label="Last Meeting"
            accent={colors.accent.orange}
            value={
              lastMeeting ? (
                <span style={{ fontSize: 15, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                  {lastMeeting.title}
                </span>
              ) : (
                <span style={{ fontSize: 15, color: colors.text.muted }}>No meetings</span>
              )
            }
            meta={lastMeeting ? new Date(lastMeeting.meetingDate).toLocaleDateString() : undefined}
            onClick={() => router.push(`/clients/${clientId}?tab=meetings`)}
          />
        </div>

        {/* HubSpot parity section — desktop port of the mobile Overview hero
            (SyncStrip + OpenDeals + RecentActivity + Beauhurst). Conditional
            on the client having a promoted HubSpot company, so legacy
            clients don't see an empty section. */}
        <ClientHubSpotSection clientId={clientId} />

        {/* Main Content - Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left - Company Info + Recent Activity */}
          <div className="lg:col-span-2 space-y-4">
            {/* Company Information Card */}
            <Panel
              title="Company Information"
              actions={
                onOpenSettings ? (
                  <Button variant="ghost" size="sm" onClick={onOpenSettings}>
                    <Pencil size={12} />
                    Edit
                  </Button>
                ) : undefined
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                <InfoField label="Company Name">
                  <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, margin: 0 }}>{client.companyName || client.name}</p>
                </InfoField>

                {client.industry && (
                  <InfoField label="Industry">
                    <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, margin: 0 }}>{client.industry}</p>
                  </InfoField>
                )}

                {formatAddress() && (
                  <InfoField label="Address" colSpan>
                    <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, margin: 0, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <MapPin size={12} color={colors.text.muted} style={{ marginTop: 3, flexShrink: 0 }} />
                      {formatAddress()}
                    </p>
                  </InfoField>
                )}

                {client.email && (
                  <InfoField label="Email">
                    <a href={`mailto:${client.email}`} style={linkStyle}>
                      <Mail size={12} />
                      {client.email}
                    </a>
                  </InfoField>
                )}

                {client.phone && (
                  <InfoField label="Phone">
                    <a href={`tel:${client.phone}`} style={linkStyle}>
                      <Phone size={12} />
                      {client.phone}
                    </a>
                  </InfoField>
                )}

                {client.website && (
                  <InfoField label="Website">
                    <a
                      href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={linkStyle}
                    >
                      <Globe size={12} />
                      {client.website}
                      <ExternalLink size={10} />
                    </a>
                  </InfoField>
                )}

                <InfoField label="Client Since">
                  <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={12} color={colors.text.muted} />
                    {new Date(client.createdAt).toLocaleDateString()}
                  </p>
                </InfoField>

                {client.tags && client.tags.length > 0 && (
                  <InfoField label="Tags" colSpan>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {client.tags.map((tag) => (
                        <StatusPill key={tag} label={tag} tone={colors.text.muted} />
                      ))}
                    </div>
                  </InfoField>
                )}

                {client.notes && (
                  <InfoField label="Notes" colSpan>
                    <p style={{ fontSize: 13, color: colors.text.primary, whiteSpace: 'pre-wrap', margin: 0 }}>
                      {client.notes.substring(0, 300)}
                      {client.notes.length > 300 && '...'}
                    </p>
                  </InfoField>
                )}
              </div>
            </Panel>

            {/* Recent internal work (documents + projects). Renamed from
                'Recent Activity' because the new ClientHubSpotSection above
                also has a 'Recent activity' card showing HubSpot engagements
                — two things named the same thing was confusing (Task A sub-item
                'dedup duplicate Recent Activity'). These two sections now have
                distinct labels: 'Recent activity' (HubSpot) + 'Recent work'
                (internal docs/projects). */}
            <Panel title="Recent work">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Recent Documents Section */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <p style={{ ...labelStyle, margin: 0 }}>Documents</p>
                    <Button variant="ghost" size="sm" onClick={() => onTabChange?.('documents')}>
                      View All <ChevronRight size={12} />
                    </Button>
                  </div>
                  {recentDocuments.length === 0 ? (
                    <EmptyState icon={<FileText size={20} />} title="No documents yet" />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {recentDocuments.slice(0, 3).map((doc: any) => (
                        <RowItem key={doc._id} onClick={() => router.push(`/docs/${doc._id}`)}>
                          <FileText size={16} color={colors.text.muted} style={{ flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.displayName || doc.documentCode || doc.fileName}
                            </p>
                          </div>
                          <StatusPill label={doc.category} tone={colors.text.muted} />
                          <span style={{ fontSize: 10, color: colors.text.muted, flexShrink: 0, fontFamily: 'ui-monospace, monospace' }}>
                            {new Date(doc.uploadedAt).toLocaleDateString()}
                          </span>
                        </RowItem>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: `1px solid ${colors.border.light}` }} />

                {/* Projects Section */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <p style={{ ...labelStyle, margin: 0 }}>Projects</p>
                    <Button variant="ghost" size="sm" onClick={() => onTabChange?.('projects')}>
                      View All <ChevronRight size={12} />
                    </Button>
                  </div>
                  {projects.length === 0 ? (
                    <EmptyState icon={<Briefcase size={20} />} title="No projects yet" />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {projects.slice(0, 3).map((project: any) => (
                        <RowItem key={project._id} onClick={() => router.push(`/clients/${clientId}/projects/${project._id}`)}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 4,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              background: project.status === 'active' ? `${colors.accent.green}15` : colors.bg.cardAlt,
                            }}
                          >
                            <Briefcase size={14} color={project.status === 'active' ? colors.accent.green : colors.text.muted} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</p>
                          </div>
                          {project.loanAmount && (
                            <span style={{ fontSize: 11, color: colors.text.muted, flexShrink: 0, fontFamily: 'ui-monospace, monospace' }}>
                              {formatCurrency(project.loanAmount)}
                            </span>
                          )}
                          <StatusPill label={project.status || 'Unknown'} tone={projectStatusTone(project.status, colors)} />
                        </RowItem>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          </div>

          {/* Right - Active Tasks */}
          <Panel
            title={`Active Tasks${activeTasks.length > 0 ? ` · ${activeTasks.length}` : ''}`}
            actions={
              <Button variant="ghost" size="sm" onClick={() => onTabChange?.('tasks')}>
                View All
              </Button>
            }
          >
            {activeTasks.length === 0 ? (
              <EmptyState icon={<CheckSquare size={20} />} title="No active tasks" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeTasks.map((task: any) => (
                  <RowItem
                    key={task._id}
                    align="flex-start"
                    onClick={() => router.push(`/clients/${clientId}?tab=tasks&task=${task._id}`)}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        marginTop: 6,
                        flexShrink: 0,
                        background: task.status === 'in_progress' ? colors.accent.blue : colors.text.dim,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <FlagChip label={task.priority || 'medium'} severity={getPrioritySeverity(task.priority)} />
                        {task.dueDate && (
                          <span
                            style={{
                              fontSize: 10,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 2,
                              fontFamily: 'ui-monospace, monospace',
                              color: new Date(task.dueDate) < new Date() ? colors.accent.red : colors.text.muted,
                            }}
                          >
                            <Clock size={10} />
                            {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </RowItem>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// Hoverable clickable row — replaces the hover:bg-muted row blocks.
function RowItem({
  children,
  onClick,
  align = 'center',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  align?: 'center' | 'flex-start';
}) {
  const colors = useColors();
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: align,
        gap: 12,
        padding: 8,
        borderRadius: 4,
        cursor: onClick ? 'pointer' : 'default',
        background: hover ? colors.bg.cardAlt : 'transparent',
        transition: 'background 100ms linear',
      }}
    >
      {children}
    </div>
  );
}
