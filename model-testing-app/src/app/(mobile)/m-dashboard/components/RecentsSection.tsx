'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FolderKanban, Building2, FileText } from 'lucide-react';
import { type LucideIcon } from 'lucide-react';

type TabKey = 'projects' | 'clients' | 'docs';

interface Project {
  _id: string;
  name: string;
  clientRoles: { clientId: string; role: string }[];
  status?: string;
}

interface Client {
  _id: string;
  name: string;
  lastAccessedAt?: string;
}

interface Document {
  _id: string;
  fileName: string;
  displayName?: string;
  clientName?: string;
  category?: string;
  fileType?: string;
  uploadedAt: string;
}

interface RecentsSectionProps {
  projects: Project[] | undefined;
  clients: Client[] | undefined;
  documents: Document[] | undefined;
  clientMap: Map<string, string>;
  taskCountByProject: Map<string, number>;
  projectCountByClient: Map<string, number>;
}

const tabs: { key: TabKey; label: string }[] = [
  { key: 'projects', label: 'Projects' },
  { key: 'clients', label: 'Clients' },
  { key: 'docs', label: 'Docs' },
];

function formatRelativeDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function RecentRow({
  title,
  subtitle,
  href,
  icon: Icon,
  pill,
}: {
  title: string;
  subtitle: string;
  href: string;
  icon: LucideIcon;
  pill?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 border-b border-[var(--m-border-subtle)] last:border-b-0 active:bg-[var(--m-bg-subtle)]"
    >
      <Icon className="w-4 h-4 text-[var(--m-text-tertiary)] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-[var(--m-text-primary)] truncate">{title}</div>
        <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5 truncate">{subtitle}</div>
      </div>
      {pill && (
        <span className="text-[11px] text-[var(--m-text-secondary)] bg-[var(--m-bg-subtle)] px-2 py-0.5 rounded-md font-medium flex-shrink-0">
          {pill}
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-[var(--m-text-placeholder)] flex-shrink-0" />
    </Link>
  );
}

export default function RecentsSection({
  projects,
  clients,
  documents,
  clientMap,
  taskCountByProject,
  projectCountByClient,
}: RecentsSectionProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('projects');

  const dedupe = <T extends { _id: string }>(items: T[]): T[] => {
    const seen = new Set<string>();
    return items.filter(item => {
      if (seen.has(item._id)) return false;
      seen.add(item._id);
      return true;
    });
  };

  const recentProjects = dedupe(projects ?? []).slice(0, 3);
  const recentClients = dedupe(clients ?? []).slice(0, 3);
  const recentDocs = dedupe(documents ?? []).slice(0, 3);

  const viewAllLinks: Record<TabKey, { href: string; label: string }> = {
    projects: { href: '/m-clients', label: 'View all projects' },
    clients: { href: '/m-clients', label: 'View all clients' },
    docs: { href: '/m-docs', label: 'View all documents' },
  };

  return (
    <div className="mx-[var(--m-page-px)] mb-3">
      <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-[var(--m-border-subtle)]">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 text-center py-2.5 text-[13px] font-medium transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'text-[var(--m-text-primary)] border-[var(--m-accent-indicator)]'
                  : 'text-[var(--m-text-tertiary)] border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'projects' && (
            <>
              {recentProjects.length === 0 ? (
                <div className="px-4 py-6 text-center text-[13px] text-[var(--m-text-tertiary)]">
                  No projects yet
                </div>
              ) : (
                recentProjects.map(project => {
                  const clientName = project.clientRoles[0]
                    ? clientMap.get(project.clientRoles[0].clientId) ?? 'Unknown client'
                    : 'No client';
                  const taskCount = taskCountByProject.get(project._id) ?? 0;
                  return (
                    <RecentRow
                      key={project._id}
                      title={project.name}
                      subtitle={`${clientName} · ${project.status || 'Active'}`}
                      icon={FolderKanban}
                      pill={taskCount > 0 ? `${taskCount} task${taskCount !== 1 ? 's' : ''}` : undefined}
                      href="/m-clients"
                    />
                  );
                })
              )}
            </>
          )}

          {activeTab === 'clients' && (
            <>
              {recentClients.length === 0 ? (
                <div className="px-4 py-6 text-center text-[13px] text-[var(--m-text-tertiary)]">
                  No clients yet
                </div>
              ) : (
                recentClients.map(client => {
                  const projectCount = projectCountByClient.get(client._id) ?? 0;
                  const lastAccessed = formatRelativeDate(client.lastAccessedAt);
                  const parts = [`${projectCount} project${projectCount !== 1 ? 's' : ''}`];
                  if (lastAccessed) parts.push(lastAccessed);
                  return (
                    <RecentRow
                      key={client._id}
                      title={client.name}
                      subtitle={parts.join(' · ')}
                      icon={Building2}
                      href="/m-clients"
                    />
                  );
                })
              )}
            </>
          )}

          {activeTab === 'docs' && (
            <>
              {recentDocs.length === 0 ? (
                <div className="px-4 py-6 text-center text-[13px] text-[var(--m-text-tertiary)]">
                  No documents yet
                </div>
              ) : (
                recentDocs.map(doc => {
                  const name = doc.displayName || doc.fileName;
                  const parts = [doc.clientName || 'Unassigned'];
                  if (doc.category) parts.push(doc.category);
                  return (
                    <RecentRow
                      key={doc._id}
                      title={name}
                      subtitle={parts.join(' · ')}
                      icon={FileText}
                      href="/m-docs"
                    />
                  );
                })
              )}
            </>
          )}

          {/* View all */}
          <div className="py-3 text-center border-t border-[var(--m-border-subtle)]">
            <Link
              href={viewAllLinks[activeTab].href}
              className="text-[13px] font-medium text-[var(--m-text-tertiary)]"
            >
              {viewAllLinks[activeTab].label} →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
