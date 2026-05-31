'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../../convex/_generated/dataModel';
import { useColors } from '@/lib/useColors';
import {
  Panel,
  StatTile,
  DataTable,
  EmptyState,
  StatusPill,
  Button,
  IconButton,
  Row,
} from '@/components/layouts';
import {
  Building2,
  FileText,
  Calendar,
  ExternalLink,
  Briefcase,
  MapPin,
  CheckSquare,
  CheckCircle2,
  Clock,
  Circle,
  AlertCircle,
  Pencil,
} from 'lucide-react';

interface ProjectOverviewTabProps {
  project: any;
  projectId: Id<"projects">;
  clientId: Id<"clients">;
  client: any;
  documents: any[];
  clientRoles: any[];
  onOpenSettings?: () => void;
  onTabChange?: (tab: string) => void;
}

export default function ProjectOverviewTab({
  project,
  projectId,
  clientId,
  client,
  documents,
  clientRoles,
  onOpenSettings,
  onTabChange,
}: ProjectOverviewTabProps) {
  const router = useRouter();
  const colors = useColors();
  const accent = colors.entityTypes.project;

  // Get all clients associated with this project
  const allClients = useQuery(api.clients.list, {}) || [];

  // Get project checklist
  const projectChecklist = useQuery(api.knowledgeLibrary.getChecklistByProject, { projectId }) || [];

  // Calculate checklist stats
  const checklistStats = useMemo(() => {
    const total = projectChecklist.length;
    const fulfilled = projectChecklist.filter((i: any) => i.status === 'fulfilled').length;
    const pendingReview = projectChecklist.filter((i: any) => i.status === 'pending_review').length;
    const missing = projectChecklist.filter((i: any) => i.status === 'missing').length;
    const percentage = total > 0 ? Math.round((fulfilled / total) * 100) : 0;

    // Group by category
    const byCategory: Record<string, { fulfilled: number; total: number }> = {};
    projectChecklist.forEach((item: any) => {
      if (!byCategory[item.category]) {
        byCategory[item.category] = { fulfilled: 0, total: 0 };
      }
      byCategory[item.category].total++;
      if (item.status === 'fulfilled') {
        byCategory[item.category].fulfilled++;
      }
    });

    return { total, fulfilled, pendingReview, missing, percentage, byCategory };
  }, [projectChecklist]);

  // Map client roles to full client data
  const clientsWithRoles = useMemo(() => {
    return clientRoles.map((role: any) => {
      const roleClientId = (role.clientId as any)?._id || role.clientId;
      const clientData = allClients.find((c: any) => c._id === roleClientId);
      return {
        ...role,
        client: clientData,
      };
    }).filter((r: any) => r.client);
  }, [clientRoles, allClients]);

  // Calculate recent documents
  const recentDocuments = useMemo(() => {
    return documents
      .sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .slice(0, 5);
  }, [documents]);

  // Calculate documents per client role
  const docsByClient = useMemo(() => {
    const counts: Record<string, number> = {};
    documents.forEach((doc: any) => {
      const cId = doc.clientId;
      if (cId) {
        counts[cId] = (counts[cId] || 0) + 1;
      }
    });
    return counts;
  }, [documents]);

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

  const addressLine = [project.address, project.city, project.state, project.zip].filter(Boolean).join(', ');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Project Information */}
      <Panel
        title="Project Information"
        accent={accent}
        actions={
          onOpenSettings && (
            <IconButton label="Edit" onClick={onOpenSettings}>
              <Pencil size={14} />
            </IconButton>
          )
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Row label="Project Name" value={project.name} />
          {project.projectShortcode && (
            <Row label="Shortcode" value={project.projectShortcode} mono />
          )}
          {project.description && (
            <Row label="Description" value={project.description} />
          )}
          {addressLine && (
            <Row
              label="Address"
              value={
                <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6 }}>
                  <MapPin size={12} color={colors.text.muted} style={{ marginTop: 2, flexShrink: 0 }} />
                  {addressLine}
                </span>
              }
            />
          )}
          {project.startDate && (
            <Row
              label="Start Date"
              value={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={12} color={colors.text.muted} />
                  {new Date(project.startDate).toLocaleDateString()}
                </span>
              }
            />
          )}
          {project.expectedCompletionDate && (
            <Row
              label="Expected Completion"
              value={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={12} color={colors.text.muted} />
                  {new Date(project.expectedCompletionDate).toLocaleDateString()}
                </span>
              }
            />
          )}
          {project.loanAmount && (
            <Row label="Loan Amount" value={formatCurrency(project.loanAmount)} mono />
          )}
          {project.interestRate && (
            <Row label="Interest Rate" value={`${project.interestRate}%`} mono />
          )}
        </div>
      </Panel>

      {/* Checklist Progress */}
      <Panel
        title="Document Checklist"
        accent={accent}
        actions={
          <Button variant="ghost" size="sm" onClick={() => onTabChange?.('checklist')}>
            View All
          </Button>
        }
      >
        {checklistStats.total === 0 ? (
          <EmptyState icon={<CheckSquare size={28} />} title="No checklist items yet" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Overall Progress */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  marginBottom: 8,
                }}
              >
                <span style={{ color: colors.text.muted }}>Overall Completion</span>
                <span style={{ color: colors.text.primary, fontWeight: 500 }}>{checklistStats.percentage}%</span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 2,
                  background: colors.bg.cardAlt,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${checklistStats.percentage}%`,
                    background: accent,
                    transition: 'width 200ms linear',
                  }}
                />
              </div>
              <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>
                {checklistStats.fulfilled} of {checklistStats.total} documents
              </p>
            </div>

            {/* Status Breakdown */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                paddingTop: 8,
                borderTop: `1px solid ${colors.border.light}`,
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                  <CheckCircle2 size={16} color={colors.accent.green} />
                  <span style={{ fontSize: 18, fontWeight: 300, color: colors.accent.green }}>{checklistStats.fulfilled}</span>
                </div>
                <p style={{ fontSize: 10, color: colors.text.muted }}>Fulfilled</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                  <Clock size={16} color={colors.accent.yellow} />
                  <span style={{ fontSize: 18, fontWeight: 300, color: colors.accent.yellow }}>{checklistStats.pendingReview}</span>
                </div>
                <p style={{ fontSize: 10, color: colors.text.muted }}>Pending</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                  <Circle size={16} color={colors.text.muted} />
                  <span style={{ fontSize: 18, fontWeight: 300, color: colors.text.primary }}>{checklistStats.missing}</span>
                </div>
                <p style={{ fontSize: 10, color: colors.text.muted }}>Missing</p>
              </div>
            </div>

            {/* Top Categories */}
            {Object.keys(checklistStats.byCategory).length > 0 && (
              <div style={{ paddingTop: 8, borderTop: `1px solid ${colors.border.light}` }}>
                <p
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 9,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: colors.text.muted,
                    fontWeight: 500,
                    marginBottom: 8,
                  }}
                >
                  By Category
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(checklistStats.byCategory).slice(0, 4).map(([category, stats]) => (
                    <div
                      key={category}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}
                    >
                      <span style={{ color: colors.text.secondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {category}
                      </span>
                      <span
                        style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: 11,
                          color: colors.text.muted,
                          marginLeft: 8,
                        }}
                      >
                        {stats.fulfilled}/{stats.total}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Alert if many missing */}
            {checklistStats.missing > 3 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: 8,
                  borderRadius: 4,
                  background: `${colors.accent.orange}12`,
                  border: `1px solid ${colors.accent.orange}40`,
                }}
              >
                <AlertCircle size={16} color={colors.accent.orange} style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 11, color: colors.accent.orange }}>
                  {checklistStats.missing} documents still missing. Use the checklist tab to request them.
                </p>
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Associated Clients */}
      <Panel title="Associated Clients" accent={accent}>
        {clientsWithRoles.length === 0 ? (
          <EmptyState icon={<Building2 size={28} />} title="No clients associated" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clientsWithRoles.map((roleData: any, index: number) => {
              const isLender = roleData.role === 'lender' || roleData.client.type?.toLowerCase() === 'lender';
              const tone = isLender ? colors.entityTypes.lender : colors.entityTypes.client;
              return (
                <div
                  key={index}
                  onClick={() => router.push(`/clients/${roleData.client._id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: 8,
                    borderRadius: 4,
                    cursor: 'pointer',
                    transition: 'background 100ms linear',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = colors.bg.cardAlt)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background: `${tone}15`,
                      border: `1px solid ${tone}40`,
                    }}
                  >
                    <Building2 size={16} color={tone} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: colors.text.primary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {roleData.client.name}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <StatusPill label={roleData.role || roleData.client.type || 'Client'} tone={tone} />
                      <span style={{ fontSize: 10, color: colors.text.muted }}>
                        {docsByClient[roleData.client._id] || 0} docs
                      </span>
                    </div>
                  </div>
                  <ExternalLink size={14} color={colors.text.muted} />
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Recent Documents */}
      <Panel
        title="Recent Documents"
        accent={accent}
        actions={
          <Button variant="ghost" size="sm" onClick={() => onTabChange?.('documents')}>
            View All
          </Button>
        }
      >
        <DataTable
          rows={recentDocuments}
          getRowKey={(d: any) => d._id}
          empty={<EmptyState icon={<FileText size={28} />} title="No documents yet" />}
          columns={[
            {
              key: 'name',
              header: 'Document',
              render: (d: any) => (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                  <FileText size={14} color={colors.text.muted} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: colors.text.primary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {d.displayName || d.documentCode || d.fileName}
                    </div>
                    {d.summary && (
                      <div
                        style={{
                          fontSize: 11,
                          color: colors.text.muted,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {d.summary}
                      </div>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'category',
              header: 'Category',
              width: 140,
              render: (d: any) =>
                d.category ? <StatusPill label={d.category} tone={colors.text.muted} /> : null,
            },
            {
              key: 'uploaded',
              header: 'Uploaded',
              mono: true,
              align: 'right',
              width: 110,
              render: (d: any) => new Date(d.uploadedAt).toLocaleDateString(),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
