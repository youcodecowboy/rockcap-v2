'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { ChevronLeft } from 'lucide-react';

import ClientOverviewTab from './tabs/ClientOverviewTab';
import ClientProjectsTab from './tabs/ClientProjectsTab';
import ClientDocsTab from './tabs/ClientDocsTab';
import ClientIntelligenceTab from './tabs/ClientIntelligenceTab';
import ClientNotesTab from './tabs/ClientNotesTab';
import ClientTasksTab from './tabs/ClientTasksTab';
import ClientChecklistTab from './tabs/ClientChecklistTab';
import ClientMeetingsTab from './tabs/ClientMeetingsTab';
import ClientThreadsTab from './tabs/ClientThreadsTab';

const CLIENT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'projects', label: 'Projects' },
  { key: 'docs', label: 'Docs' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'notes', label: 'Notes' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'threads', label: 'Flags' },
] as const;

type ClientTab = typeof CLIENT_TABS[number]['key'];

interface ClientDetailProps {
  clientId: string;
  clientName: string;
  onBack: () => void;
  onSelectProject: (projectId: string, projectName: string) => void;
}

export default function ClientDetail({ clientId, clientName, onBack, onSelectProject }: ClientDetailProps) {
  const [activeTab, setActiveTab] = useState<ClientTab>('overview');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const client = useQuery(api.clients.get, { id: clientId as Id<'clients'> });
  const status = (client as any)?.status as string | undefined;

  // Auto-scroll active tab into view
  useEffect(() => {
    const el = tabRefs.current[activeTab];
    if (el && scrollContainerRef.current) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeTab]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)]">
        <button onClick={onBack} className="flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
          <span className="text-[12px] text-[var(--m-accent-indicator)]">Clients</span>
        </button>
        <div className="flex items-center gap-2 ml-2 min-w-0">
          <span className="text-[14px] font-semibold text-[var(--m-text-primary)] truncate">
            {clientName}
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
        {CLIENT_TABS.map(tab => {
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
        <ClientOverviewTab clientId={clientId} onSwitchTab={(tab) => setActiveTab(tab as ClientTab)} />
      )}
      {activeTab === 'projects' && (
        <ClientProjectsTab clientId={clientId} onSelectProject={onSelectProject} />
      )}
      {activeTab === 'docs' && (
        <ClientDocsTab clientId={clientId} clientName={clientName} />
      )}
      {activeTab === 'intelligence' && (
        <ClientIntelligenceTab clientId={clientId} />
      )}
      {activeTab === 'notes' && (
        <ClientNotesTab clientId={clientId} />
      )}
      {activeTab === 'tasks' && (
        <ClientTasksTab clientId={clientId} clientName={clientName} />
      )}
      {activeTab === 'checklist' && (
        <ClientChecklistTab clientId={clientId} />
      )}
      {activeTab === 'meetings' && (
        <ClientMeetingsTab clientId={clientId} />
      )}
      {activeTab === 'threads' && (
        <ClientThreadsTab clientId={clientId} clientName={clientName} />
      )}
    </div>
  );
}
