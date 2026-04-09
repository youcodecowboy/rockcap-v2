'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { ChevronRight } from 'lucide-react';

interface ProjectOverviewTabProps {
  projectId: string;
  clientId: string;
  onSwitchTab: (tab: string) => void;
}

function formatGBP(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ProjectOverviewTab({ projectId, clientId, onSwitchTab }: ProjectOverviewTabProps) {
  const typedProjectId = projectId as Id<'projects'>;

  const project = useQuery(api.projects.get, { id: typedProjectId });
  const stats = useQuery(api.projects.getStats, { projectId: typedProjectId });
  const activeTaskCount = useQuery(api.tasks.getActiveCountByProject, { projectId: typedProjectId });
  const checklist = useQuery(api.knowledgeLibrary.getChecklistByProject, { projectId: typedProjectId });

  void clientId;

  const fulfilledCount = checklist?.filter((i: any) => i.status === 'fulfilled').length ?? 0;
  const totalChecklist = checklist?.length ?? 0;
  const checklistPct = totalChecklist > 0 ? Math.round((fulfilledCount / totalChecklist) * 100) : 0;

  return (
    <div>
      {/* Project Info Card */}
      <div className="border-b border-[var(--m-border)] px-[var(--m-page-px)] py-3">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-[var(--m-text-primary)]">
            {project?.name ?? '...'}
          </span>
          {(project as any)?.status && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)] capitalize">
              {(project as any).status}
            </span>
          )}
        </div>
        {(project as any)?.projectShortcode && (
          <div className="mt-1">
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]">
              {(project as any).projectShortcode}
            </span>
          </div>
        )}
        <div className="mt-2 space-y-1">
          {stats?.loanAmount != null && (
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[var(--m-text-secondary)]">Loan Amount</span>
              <span className="text-[12px] font-medium text-[var(--m-text-primary)]">{formatGBP(stats.loanAmount)}</span>
            </div>
          )}
          {(project as any)?.startDate && (
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[var(--m-text-secondary)]">Start Date</span>
              <span className="text-[12px] text-[var(--m-text-primary)]">{formatDate((project as any).startDate)}</span>
            </div>
          )}
          {(project as any)?.endDate && (
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[var(--m-text-secondary)]">End Date</span>
              <span className="text-[12px] text-[var(--m-text-primary)]">{formatDate((project as any).endDate)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Documents Card */}
      <div className="border-b border-[var(--m-border)] px-[var(--m-page-px)] py-3">
        <button
          onClick={() => onSwitchTab('docs')}
          className="flex items-center justify-between w-full active:bg-[var(--m-bg-subtle)] -mx-[var(--m-page-px)] px-[var(--m-page-px)] py-0.5 rounded"
        >
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--m-text-primary)]">Documents</span>
            <span className="text-[12px] text-[var(--m-text-tertiary)]">
              {stats?.totalDocuments !== undefined ? stats.totalDocuments : '...'}
            </span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
        </button>
      </div>

      {/* Active Tasks Card */}
      <div className="border-b border-[var(--m-border)] px-[var(--m-page-px)] py-3">
        <button
          onClick={() => onSwitchTab('tasks')}
          className="flex items-center justify-between w-full active:bg-[var(--m-bg-subtle)] -mx-[var(--m-page-px)] px-[var(--m-page-px)] py-0.5 rounded"
        >
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--m-text-primary)]">Active Tasks</span>
            <span className="text-[12px] text-[var(--m-text-tertiary)]">
              {activeTaskCount !== undefined ? activeTaskCount : '...'}
            </span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
        </button>
      </div>

      {/* Checklist Progress Card */}
      <div className="border-b border-[var(--m-border)] px-[var(--m-page-px)] py-3">
        <button
          onClick={() => onSwitchTab('checklist')}
          className="flex items-center justify-between w-full active:bg-[var(--m-bg-subtle)] -mx-[var(--m-page-px)] px-[var(--m-page-px)] py-0.5 rounded"
        >
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--m-text-primary)]">Checklist</span>
            <span className="text-[12px] text-[var(--m-text-tertiary)]">
              {checklist ? `${checklistPct}%` : '...'}
            </span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
        </button>
        {checklist && (
          <div className="mt-1.5">
            <div className="h-2 rounded-full bg-[var(--m-bg-inset)]">
              <div
                className="h-2 rounded-full bg-green-500 transition-all"
                style={{ width: `${checklistPct}%` }}
              />
            </div>
            <span className="text-[12px] text-[var(--m-text-secondary)] mt-1 block">
              {fulfilledCount}/{totalChecklist} fulfilled
            </span>
          </div>
        )}
      </div>

      {/* Intelligence Card */}
      <div className="border-b border-[var(--m-border)] px-[var(--m-page-px)] py-3">
        <button
          onClick={() => onSwitchTab('intelligence')}
          className="flex items-center justify-between w-full active:bg-[var(--m-bg-subtle)] -mx-[var(--m-page-px)] px-[var(--m-page-px)] py-0.5 rounded"
        >
          <span className="text-[13px] font-semibold text-[var(--m-text-primary)]">Intelligence</span>
          <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
        </button>
      </div>
    </div>
  );
}
