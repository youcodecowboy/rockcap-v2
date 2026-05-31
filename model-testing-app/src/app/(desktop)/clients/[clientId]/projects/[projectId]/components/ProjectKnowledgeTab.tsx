'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../../convex/_generated/dataModel';
import { Button, StatusPill, Skeleton } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  FolderKanban,
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Mail,
} from 'lucide-react';

// Import shared components
import KnowledgeChecklistPanel from '../../../components/KnowledgeChecklistPanel';
import EmailRequestModal from '../../../components/EmailRequestModal';
import DynamicChecklistInput from '../../../components/DynamicChecklistInput';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface ProjectKnowledgeTabProps {
  projectId: Id<"projects">;
  projectName: string;
  clientId: Id<"clients">;
  clientName: string;
  clientType?: string;
  dealPhase?: string;
}

export default function ProjectKnowledgeTab({
  projectId,
  projectName,
  clientId,
  clientName,
  clientType = 'borrower',
  dealPhase,
}: ProjectKnowledgeTabProps) {
  const colors = useColors();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showDynamicInput, setShowDynamicInput] = useState(false);

  // Queries
  const projectChecklist = useQuery(
    api.knowledgeLibrary.getChecklistByProject,
    { projectId }
  );

  const lastEmailGeneration = useQuery(
    api.knowledgeLibrary.getLastEmailGeneration,
    { clientId, projectId }
  );

  // Mutations
  const initializeProject = useMutation(api.knowledgeLibrary.initializeChecklistForProject);

  // Initialize checklist if needed
  useEffect(() => {
    if (projectChecklist !== undefined && projectChecklist.length === 0) {
      initializeProject({ clientId, projectId, clientType }).catch(console.error);
    }
  }, [projectChecklist, clientId, projectId, clientType, initializeProject]);

  // Get categories from checklist
  const categories = useMemo(() => {
    if (!projectChecklist) return [];

    const categoryMap = new Map<string, { total: number; fulfilled: number; missing: number; pendingReview: number }>();

    for (const item of projectChecklist) {
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
  }, [projectChecklist]);

  // Filter items by selected category
  const filteredItems = useMemo(() => {
    if (!projectChecklist) return [];
    if (!selectedCategory) return projectChecklist;
    return projectChecklist.filter((item: { category: string }) => item.category === selectedCategory);
  }, [projectChecklist, selectedCategory]);

  // Calculate overall stats
  const stats = useMemo(() => {
    if (!projectChecklist) return { total: 0, fulfilled: 0, missing: 0, pendingReview: 0, percentage: 0 };

    const total = projectChecklist.length;
    const fulfilled = projectChecklist.filter((i: { status: string }) => i.status === 'fulfilled').length;
    const missing = projectChecklist.filter((i: { status: string }) => i.status === 'missing').length;
    const pendingReview = projectChecklist.filter((i: { status: string }) => i.status === 'pending_review').length;

    return {
      total,
      fulfilled,
      missing,
      pendingReview,
      percentage: total > 0 ? Math.round((fulfilled / total) * 100) : 0,
    };
  }, [projectChecklist]);

  const accent = colors.entityTypes.project;

  // Token-styled progress bar (replaces shadcn <Progress>).
  const ProgressBar = ({ value, height = 6, tone }: { value: number; height?: number; tone?: string }) => (
    <div
      style={{
        width: '100%',
        height,
        background: colors.bg.cardAlt,
        border: `1px solid ${colors.border.light}`,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: '100%',
          background: tone ?? accent,
          transition: 'width 150ms linear',
        }}
      />
    </div>
  );

  const sectionLabel: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: colors.text.muted,
    fontWeight: 500,
  };

  // Loading state
  if (projectChecklist === undefined) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: colors.bg.base, padding: 24 }}>
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={16} />
          <Skeleton height={10} width="60%" />
          <Skeleton height={48} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: colors.bg.base }}>
      {/* Column 1: Project Info & Stats */}
      <div
        className="w-64 flex flex-col"
        style={{ background: colors.bg.card, borderRight: `1px solid ${colors.border.default}` }}
      >
        <div className="flex-shrink-0" style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}` }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>Project Checklist</h3>
          <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>Document requirements</p>
        </div>

        {/* Project Section */}
        <div style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}` }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
            <div
              className="flex items-center justify-center"
              style={{
                width: 40,
                height: 40,
                borderRadius: 4,
                background: `${accent}15`,
                border: `1px solid ${accent}40`,
              }}
            >
              <FolderKanban size={20} style={{ color: accent }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate" style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{projectName}</p>
              {dealPhase && (
                <div style={{ marginTop: 4 }}>
                  <StatusPill label={dealPhase.replace('_', ' ')} tone={accent} />
                </div>
              )}
            </div>
          </div>

          {/* Overall Progress */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12, color: colors.text.muted }}>Completion</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary, fontFamily: MONO }}>{stats.percentage}%</span>
            </div>
            <ProgressBar value={stats.percentage} height={8} />
            <div className="flex items-center justify-between" style={{ fontSize: 10, color: colors.text.muted, fontFamily: MONO }}>
              <span>{stats.fulfilled} of {stats.total}</span>
              {stats.pendingReview > 0 && (
                <span style={{ color: colors.accent.yellow }}>{stats.pendingReview} pending</span>
              )}
            </div>
          </div>
        </div>

        {/* Status Summary */}
        <div style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} style={{ color: colors.entityTypes.client }} />
              <span style={{ fontSize: 12, color: colors.text.muted }}>Fulfilled</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: colors.entityTypes.client, fontFamily: MONO }}>{stats.fulfilled}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} style={{ color: colors.accent.yellow }} />
              <span style={{ fontSize: 12, color: colors.text.muted }}>Pending Review</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: colors.accent.yellow, fontFamily: MONO }}>{stats.pendingReview}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Circle size={16} style={{ color: colors.text.muted }} />
              <span style={{ fontSize: 12, color: colors.text.muted }}>Missing</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary, fontFamily: MONO }}>{stats.missing}</span>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="mt-auto flex-shrink-0" style={{ padding: 12, borderTop: `1px solid ${colors.border.default}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button
            variant="secondary"
            size="sm"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => setShowEmailModal(true)}
          >
            <Mail size={12} />
            Request Missing Docs
          </Button>
          {lastEmailGeneration && (
            <p style={{ fontSize: 10, color: colors.text.muted, padding: '0 8px', fontFamily: MONO }}>
              Last sent: {new Date(lastEmailGeneration).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Column 2: Categories */}
      <div
        className="w-56 flex flex-col"
        style={{ background: colors.bg.card, borderRight: `1px solid ${colors.border.default}` }}
      >
        <div className="flex-shrink-0" style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}` }}>
          <h4 style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>Categories</h4>
          <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>Filter by type</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* All Items Option */}
          <button
            onClick={() => setSelectedCategory(null)}
            className="w-full flex items-center justify-between text-left"
            style={{
              padding: '12px 16px',
              background: selectedCategory === null ? colors.bg.cardAlt : 'transparent',
              border: 'none',
              borderBottom: `1px solid ${colors.border.light}`,
              cursor: 'pointer',
              transition: 'background 100ms linear',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: selectedCategory === null ? 500 : 400, color: colors.text.primary }}>All Items</span>
            <StatusPill label={String(projectChecklist?.length || 0)} tone={colors.text.muted} />
          </button>

          {/* Category List */}
          {categories.map(category => (
            <button
              key={category.name}
              onClick={() => setSelectedCategory(category.name)}
              className="w-full text-left"
              style={{
                padding: '12px 16px',
                background: selectedCategory === category.name ? colors.bg.cardAlt : 'transparent',
                border: 'none',
                borderBottom: `1px solid ${colors.border.light}`,
                cursor: 'pointer',
                transition: 'background 100ms linear',
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                <span
                  className="truncate"
                  style={{
                    fontSize: 12,
                    fontWeight: selectedCategory === category.name ? 500 : 400,
                    color: colors.text.primary,
                  }}
                >
                  {category.name}
                </span>
                <span style={{ fontSize: 11, color: colors.text.muted, fontFamily: MONO }}>
                  {category.fulfilled}/{category.total}
                </span>
              </div>
              <ProgressBar value={category.percentage} height={4} />
              {category.pendingReview > 0 && (
                <div className="flex items-center gap-1" style={{ marginTop: 6 }}>
                  <Clock size={12} style={{ color: colors.accent.yellow }} />
                  <span style={{ fontSize: 10, color: colors.accent.yellow }}>
                    {category.pendingReview} pending review
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Add Dynamic Requirement */}
        <div className="flex-shrink-0" style={{ padding: 12, borderTop: `1px solid ${colors.border.default}` }}>
          <Button
            variant="secondary"
            size="sm"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => setShowDynamicInput(true)}
          >
            <Plus size={12} />
            Add Requirement
          </Button>
        </div>
      </div>

      {/* Column 3: Checklist Items */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: colors.bg.card }}>
        <KnowledgeChecklistPanel
          items={filteredItems}
          clientId={clientId}
          projectId={projectId}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />
      </div>

      {/* Modals */}
      {showEmailModal && (
        <EmailRequestModal
          clientId={clientId}
          clientName={clientName}
          projectId={projectId}
          projectName={projectName}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {showDynamicInput && (
        <DynamicChecklistInput
          clientId={clientId}
          projectId={projectId}
          onClose={() => setShowDynamicInput(false)}
        />
      )}
    </div>
  );
}
