'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { ChevronRight } from 'lucide-react';

interface ClientProjectsTabProps {
  clientId: string;
  onSelectProject: (projectId: string, projectName: string) => void;
}

const statusBadgeClasses: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-600',
  on_hold: 'bg-amber-100 text-amber-700',
  'on-hold': 'bg-amber-100 text-amber-700',
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(amount);

export default function ClientProjectsTab({ clientId, onSelectProject }: ClientProjectsTabProps) {
  const projects = useQuery(api.projects.getByClient, { clientId: clientId as Id<'clients'> });

  if (projects === undefined) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Loading projects...
      </div>
    );
  }

  const filtered = projects
    .filter((p) => !p.isDeleted)
    .sort((a, b) => {
      const aActive = a.status === 'active' ? 0 : 1;
      const bActive = b.status === 'active' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });

  if (filtered.length === 0) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        No projects yet
      </div>
    );
  }

  return (
    <div>
      {filtered.map((project) => (
        <button
          key={project._id}
          onClick={() => onSelectProject(project._id, project.name)}
          className="flex items-center gap-2.5 w-full text-left px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                {project.name}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                  statusBadgeClasses[project.status] ??
                  'bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)]'
                }`}
              >
                {project.status}
              </span>
              {project.projectShortcode && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)] font-mono whitespace-nowrap">
                  {project.projectShortcode}
                </span>
              )}
            </div>
            <div className="text-[11px] text-[var(--m-text-secondary)] mt-0.5">
              {project.loanAmount ? formatCurrency(project.loanAmount) : project.status}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--m-text-tertiary)] shrink-0" />
        </button>
      ))}
    </div>
  );
}
