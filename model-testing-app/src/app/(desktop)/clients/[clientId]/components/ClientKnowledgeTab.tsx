'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Button, StatusPill, FlagChip, SkeletonText } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  Building2,
  FolderKanban,
  Clock,
  Mail,
  ChevronRight,
  Brain,
  ExternalLink,
  Plus,
} from 'lucide-react';

// Import sub-components (will create these next)
import KnowledgeChecklistPanel from './KnowledgeChecklistPanel';
import EmailRequestModal from './EmailRequestModal';
import DynamicChecklistInput from './DynamicChecklistInput';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface ClientKnowledgeTabProps {
  clientId: Id<"clients">;
  clientName: string;
  clientType?: string;
  projects: Array<{
    _id: Id<"projects">;
    name: string;
    status?: string;
    dealPhase?: string;
  }>;
}

type ViewScope = 'client' | { projectId: Id<"projects">; projectName: string };

// Small component to fetch and display project intelligence count
function ProjectIntelligenceCount({ projectId }: { projectId: Id<"projects"> }) {
  const colors = useColors();
  const stats = useQuery(api.knowledgeLibrary.getKnowledgeStats, { projectId });

  if (!stats || stats.total === 0) return null;

  const label =
    `${stats.total} intelligence item${stats.total !== 1 ? 's' : ''} extracted` +
    (stats.canonical > 0 ? ` (${stats.canonical} canonical)` : '');

  return (
    <span
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '1px 5px',
        borderRadius: 2,
        fontFamily: MONO,
        fontSize: 9,
        background: `${colors.accent.purple}20`,
        color: colors.accent.purple,
        border: `1px solid ${colors.accent.purple}40`,
      }}
    >
      <Brain size={10} />
      {stats.total}
    </span>
  );
}

export default function ClientKnowledgeTab({
  clientId,
  clientName,
  clientType = 'borrower',
  projects,
}: ClientKnowledgeTabProps) {
  const colors = useColors();
  const router = useRouter();
  const [viewScope, setViewScope] = useState<ViewScope>('client');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showDynamicInput, setShowDynamicInput] = useState(false);

  // Queries
  const clientChecklist = useQuery(
    api.knowledgeLibrary.getClientLevelChecklist,
    { clientId }
  );

  const hasChecklist = useQuery(
    api.knowledgeLibrary.hasChecklist,
    { clientId }
  );

  const checklistSummary = useQuery(
    api.knowledgeLibrary.getChecklistSummary,
    { clientId }
  );

  const lastEmailGeneration = useQuery(
    api.knowledgeLibrary.getLastEmailGeneration,
    { clientId }
  );

  // Get project checklist if viewing a project
  const projectChecklist = useQuery(
    api.knowledgeLibrary.getChecklistByProject,
    viewScope !== 'client' ? { projectId: viewScope.projectId } : 'skip'
  );

  // Mutations
  const initializeClient = useMutation(api.knowledgeLibrary.initializeChecklistForClient);
  const initializeProject = useMutation(api.knowledgeLibrary.initializeChecklistForProject);

  // Initialize checklist if needed
  useEffect(() => {
    if (hasChecklist === false && clientType) {
      initializeClient({ clientId, clientType }).catch(console.error);
    }
  }, [hasChecklist, clientId, clientType, initializeClient]);

  // Get current checklist based on view scope
  const currentChecklist = useMemo(() => {
    if (viewScope === 'client') {
      return clientChecklist || [];
    }
    return projectChecklist || [];
  }, [viewScope, clientChecklist, projectChecklist]);

  // Get categories from current checklist
  const categories = useMemo(() => {
    const categoryMap = new Map<string, { total: number; fulfilled: number; missing: number; pendingReview: number }>();

    for (const item of currentChecklist) {
      const existing = categoryMap.get(item.category) || { total: 0, fulfilled: 0, missing: 0, pendingReview: 0 };
      existing.total++;
      if (item.status === 'fulfilled') existing.fulfilled++;
      if (item.status === 'missing') existing.missing++;
      if (item.status === 'pending_review') existing.pendingReview++;
      categoryMap.set(item.category, existing);
    }

    return Array.from(categoryMap.entries()).map(([name, stats]) => ({
      name,
      ...stats,
      percentage: stats.total > 0 ? Math.round((stats.fulfilled / stats.total) * 100) : 0,
    }));
  }, [currentChecklist]);

  // Filter items by selected category
  const filteredItems = useMemo(() => {
    if (!selectedCategory) return currentChecklist;
    return currentChecklist.filter(item => item.category === selectedCategory);
  }, [currentChecklist, selectedCategory]);

  // Handle project initialization
  const handleProjectClick = async (project: { _id: Id<"projects">; name: string }) => {
    setViewScope({ projectId: project._id, projectName: project.name });
    setSelectedCategory(null);

    // Check if project checklist exists, initialize if not
    const projectItems = await initializeProject({
      clientId,
      projectId: project._id,
      clientType,
    });

    if (projectItems.created > 0) {
      console.log(`Initialized ${projectItems.created} checklist items for project`);
    }
  };

  // Loading state
  if (hasChecklist === undefined || clientChecklist === undefined) {
    return (
      <div style={{ padding: 24 }}>
        <SkeletonText lines={8} />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: colors.bg.light }}>
      {/* Column 1: Client/Projects Navigation */}
      <div
        className="flex flex-col"
        style={{ width: 256, background: colors.bg.card, borderRight: `1px solid ${colors.border.default}` }}
      >
        <div style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}`, flexShrink: 0 }}>
          <h3 style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500 }}>
            Knowledge Library
          </h3>
          <p style={{ fontSize: 10, color: colors.text.muted, marginTop: 4 }}>Document requirements checklist</p>
        </div>

        {/* Client Section */}
        <div className="flex-1 overflow-y-auto">
          <button
            onClick={() => {
              setViewScope('client');
              setSelectedCategory(null);
            }}
            className="w-full flex items-center gap-3 text-left"
            style={{
              padding: '12px 16px',
              background: viewScope === 'client' ? `${colors.entityTypes.client}12` : 'transparent',
              borderLeft: `2px solid ${viewScope === 'client' ? colors.entityTypes.client : 'transparent'}`,
              cursor: 'pointer',
              transition: 'background 100ms linear',
            }}
          >
            <Building2 size={18} style={{ color: viewScope === 'client' ? colors.entityTypes.client : colors.text.muted }} />
            <div className="flex-1 min-w-0">
              <p
                className="truncate"
                style={{ fontSize: 12, fontWeight: 500, color: viewScope === 'client' ? colors.entityTypes.client : colors.text.primary }}
              >
                {clientName}
              </p>
              <p style={{ fontSize: 10, color: colors.text.muted }}>Client Documents (KYC)</p>
            </div>
            {checklistSummary?.client && (
              <div className="flex items-center gap-1" style={{ fontFamily: MONO, fontSize: 10 }}>
                <span style={{ fontWeight: 500, color: colors.entityTypes.client }}>
                  {checklistSummary.client.fulfilled}
                </span>
                <span style={{ color: colors.text.muted }}>/</span>
                <span style={{ color: colors.text.muted }}>
                  {checklistSummary.client.total}
                </span>
              </div>
            )}
          </button>

          {/* Projects Section */}
          {projects.length > 0 && (
            <div style={{ borderTop: `1px solid ${colors.border.default}`, marginTop: 8, paddingTop: 8 }}>
              <div style={{ padding: '8px 16px' }}>
                <h4 style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500 }}>
                  Projects
                </h4>
              </div>
              {projects.map(project => {
                const isSelected = viewScope !== 'client' && viewScope.projectId === project._id;
                return (
                  <div key={project._id} className="group">
                    <button
                      onClick={() => handleProjectClick(project)}
                      className="w-full flex items-center gap-3 text-left"
                      style={{
                        padding: '12px 16px',
                        background: isSelected ? `${colors.entityTypes.project}12` : 'transparent',
                        borderLeft: `2px solid ${isSelected ? colors.entityTypes.project : 'transparent'}`,
                        cursor: 'pointer',
                        transition: 'background 100ms linear',
                      }}
                    >
                      <FolderKanban size={18} style={{ color: isSelected ? colors.entityTypes.project : colors.text.muted }} />
                      <div className="flex-1 min-w-0">
                        <p
                          className="truncate"
                          style={{ fontSize: 12, fontWeight: 500, color: isSelected ? colors.entityTypes.project : colors.text.primary }}
                        >
                          {project.name}
                        </p>
                        <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
                          {project.dealPhase && (
                            <FlagChip label={project.dealPhase.replace('_', ' ')} severity="info" />
                          )}
                          <ProjectIntelligenceCount projectId={project._id} />
                        </div>
                      </div>
                      <ChevronRight size={14} style={{ color: colors.text.muted }} />
                    </button>
                    {/* Quick link to project intelligence */}
                    <div style={{ padding: '0 16px 8px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/clients/${clientId}/projects/${project._id}?tab=knowledge`);
                        }}
                        className="flex items-center gap-1.5"
                        style={{ fontSize: 10, color: colors.text.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}
                      >
                        <Brain size={12} />
                        <span>View extracted intelligence</span>
                        <ExternalLink size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div style={{ padding: 12, borderTop: `1px solid ${colors.border.default}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={() => setShowEmailModal(true)}>
            <Mail size={12} />
            Request missing docs
          </Button>
          {lastEmailGeneration && (
            <p style={{ fontSize: 9, color: colors.text.muted, padding: '0 8px', fontFamily: MONO }}>
              Last sent: {new Date(lastEmailGeneration).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Column 2: Categories */}
      <div
        className="flex flex-col"
        style={{ width: 224, background: colors.bg.card, borderRight: `1px solid ${colors.border.default}` }}
      >
        <div style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}`, flexShrink: 0 }}>
          <h4 style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500 }}>
            Categories
          </h4>
          <p style={{ fontSize: 10, color: colors.text.muted, marginTop: 4 }}>
            {viewScope === 'client' ? 'Client-level' : viewScope.projectName}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* All Items Option */}
          <button
            onClick={() => setSelectedCategory(null)}
            className="w-full flex items-center justify-between text-left"
            style={{
              padding: '12px 16px',
              background: selectedCategory === null ? colors.bg.cardAlt : 'transparent',
              cursor: 'pointer',
              transition: 'background 100ms linear',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: selectedCategory === null ? 500 : 400, color: colors.text.primary }}>All Items</span>
            <StatusPill label={String(currentChecklist.length)} tone={colors.text.muted} />
          </button>

          {/* Category List */}
          {categories.map(category => {
            const isActive = selectedCategory === category.name;
            return (
              <button
                key={category.name}
                onClick={() => setSelectedCategory(category.name)}
                className="w-full text-left"
                style={{
                  padding: '12px 16px',
                  borderBottom: `1px solid ${colors.border.light}`,
                  background: isActive ? colors.bg.cardAlt : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 100ms linear',
                }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                  <span className="truncate" style={{ fontSize: 12, fontWeight: isActive ? 500 : 400, color: colors.text.primary }}>
                    {category.name}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: colors.text.muted }}>
                    {category.fulfilled}/{category.total}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ height: 3, borderRadius: 2, background: colors.bg.cardAlt, overflow: 'hidden' }}>
                  <div style={{ width: `${category.percentage}%`, height: '100%', background: colors.entityTypes.client }} />
                </div>
                {category.pendingReview > 0 && (
                  <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
                    <Clock size={11} style={{ color: colors.accent.yellow }} />
                    <span style={{ fontSize: 9, color: colors.accent.yellow }}>
                      {category.pendingReview} pending review
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Add Dynamic Requirement */}
        <div style={{ padding: 12, borderTop: `1px solid ${colors.border.default}`, flexShrink: 0 }}>
          <Button variant="secondary" size="sm" onClick={() => setShowDynamicInput(true)}>
            <Plus size={12} />
            Add requirement
          </Button>
        </div>
      </div>

      {/* Column 3: Checklist Items */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: colors.bg.card }}>
        <KnowledgeChecklistPanel
          items={filteredItems}
          clientId={clientId}
          projectId={viewScope !== 'client' ? viewScope.projectId : undefined}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />
      </div>

      {/* Modals */}
      {showEmailModal && (
        <EmailRequestModal
          clientId={clientId}
          clientName={clientName}
          projectId={viewScope !== 'client' ? viewScope.projectId : undefined}
          projectName={viewScope !== 'client' ? viewScope.projectName : undefined}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {showDynamicInput && (
        <DynamicChecklistInput
          clientId={clientId}
          projectId={viewScope !== 'client' ? viewScope.projectId : undefined}
          onClose={() => setShowDynamicInput(false)}
        />
      )}
    </div>
  );
}
