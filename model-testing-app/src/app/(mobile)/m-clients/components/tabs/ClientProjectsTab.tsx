'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { ChevronRight, Plus } from 'lucide-react';

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
  const createProject = useMutation(api.projects.create);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newShortcode, setNewShortcode] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const projectId = await createProject({
        name: newName.trim(),
        projectShortcode: newShortcode.trim() || undefined,
        clientRoles: [{ clientId: clientId as Id<'clients'>, role: 'primary' }],
      });
      setShowCreate(false);
      setNewName('');
      setNewShortcode('');
      onSelectProject(projectId, newName.trim());
    } catch (error) {
      console.error('Error creating project:', error);
    } finally {
      setIsCreating(false);
    }
  };

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

  const createForm = showCreate && (
    <div className="mx-[var(--m-page-px)] mt-3 mb-2 bg-[var(--m-bg-card)] border border-[var(--m-border-subtle)] rounded-xl p-3">
      <div className="text-[13px] font-medium text-[var(--m-text-primary)] mb-2">New Project</div>
      <input
        type="text"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder="Project name"
        className="w-full bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] outline-none"
        style={{ fontSize: '16px' }}
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
      />
      <input
        type="text"
        value={newShortcode}
        onChange={(e) => setNewShortcode(e.target.value.toUpperCase().slice(0, 10))}
        placeholder="Shortcode (optional, max 10 chars)"
        maxLength={10}
        className="w-full mt-2 bg-[var(--m-bg-inset)] text-[var(--m-text-primary)] rounded-lg px-3 py-2 border border-[var(--m-border-subtle)] outline-none font-mono"
        style={{ fontSize: '16px' }}
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => { setShowCreate(false); setNewName(''); setNewShortcode(''); }}
          className="px-3 py-1.5 text-[12px] font-medium text-[var(--m-text-secondary)]"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!newName.trim() || isCreating}
          className="px-4 py-1.5 text-[12px] font-semibold text-white bg-[var(--m-accent)] rounded-lg disabled:opacity-40"
        >
          {isCreating ? 'Creating...' : 'Create Project'}
        </button>
      </div>
    </div>
  );

  if (filtered.length === 0) {
    return (
      <div>
        {createForm || (
          <div className="px-[var(--m-page-px)] py-8 text-center">
            <p className="text-[12px] text-[var(--m-text-tertiary)]">No projects yet</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 text-[12px] font-medium text-[var(--m-accent-indicator)]"
            >
              Create a project
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* New project button / form */}
      {showCreate ? createForm : (
        <div className="px-[var(--m-page-px)] pt-3">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 mb-2 text-[12px] font-medium text-[var(--m-accent-indicator)]"
          >
            <Plus className="w-3.5 h-3.5" /> New Project
          </button>
        </div>
      )}

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
