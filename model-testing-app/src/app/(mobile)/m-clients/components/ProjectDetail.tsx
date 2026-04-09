'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { ChevronLeft } from 'lucide-react';

import ProjectOverviewTab from './tabs/ProjectOverviewTab';
import ProjectDocsTab from './tabs/ProjectDocsTab';
import ProjectTasksTab from './tabs/ProjectTasksTab';
import ProjectIntelligenceTab from './tabs/ProjectIntelligenceTab';
import ProjectChecklistTab from './tabs/ProjectChecklistTab';
import ProjectNotesTab from './tabs/ProjectNotesTab';

const PROJECT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'docs', label: 'Docs' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'notes', label: 'Notes' },
] as const;

type ProjectTab = typeof PROJECT_TABS[number]['key'];

interface ProjectDetailProps {
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  onBack: () => void;
}

export default function ProjectDetail({ clientId, clientName, projectId, projectName, onBack }: ProjectDetailProps) {
  const [activeTab, setActiveTab] = useState<ProjectTab>('overview');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const project = useQuery(api.projects.get, { id: projectId as Id<'projects'> });
  const status = (project as any)?.status as string | undefined;

  // Auto-scroll active tab into view
  useEffect(() => {
    const el = tabRefs.current[activeTab];
    if (el && scrollContainerRef.current) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeTab]);

  void projectName;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)]">
        <button onClick={onBack} className="flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
          <span className="text-[12px] text-[var(--m-accent-indicator)]">{clientName}</span>
        </button>
        <div className="flex items-center gap-2 ml-2 min-w-0">
          <span className="text-[14px] font-semibold text-[var(--m-text-primary)] truncate">
            {project?.name ?? projectName}
          </span>
          {status && (
            <span className="text-[10px] bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)] rounded px-1.5 py-0.5 flex-shrink-0 capitalize">
              {status}
            </span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div
        ref={scrollContainerRef}
        className="flex gap-1.5 px-[var(--m-page-px)] py-2 overflow-x-auto border-b border-[var(--m-border)] scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {PROJECT_TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              ref={el => { tabRefs.current[tab.key] = el; }}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                isActive
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <ProjectOverviewTab projectId={projectId} clientId={clientId} onSwitchTab={(tab) => setActiveTab(tab as ProjectTab)} />
      )}
      {activeTab === 'docs' && (
        <ProjectDocsTab projectId={projectId} clientId={clientId} clientName={clientName} />
      )}
      {activeTab === 'tasks' && (
        <ProjectTasksTab projectId={projectId} />
      )}
      {activeTab === 'intelligence' && (
        <ProjectIntelligenceTab projectId={projectId} />
      )}
      {activeTab === 'checklist' && (
        <ProjectChecklistTab projectId={projectId} />
      )}
      {activeTab === 'notes' && (
        <ProjectNotesTab projectId={projectId} />
      )}
    </div>
  );
}
