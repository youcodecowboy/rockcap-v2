'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { ChevronRight, Mail, Phone } from 'lucide-react';

interface ClientOverviewTabProps {
  clientId: string;
  onSwitchTab: (tab: string) => void;
}

export default function ClientOverviewTab({ clientId, onSwitchTab }: ClientOverviewTabProps) {
  const typedId = clientId as Id<'clients'>;

  const client = useQuery(api.clients.get, { id: typedId });
  const stats = useQuery(api.clients.getStats, { clientId: typedId });
  const tasks = useQuery(api.tasks.getByClient, { clientId: typedId });
  const openFlagCount = useQuery(api.flags.getOpenCountByClient, { clientId: typedId });
  const checklist = useQuery(api.knowledgeLibrary.getClientLevelChecklist, { clientId: typedId });
  const contacts = useQuery(api.contacts.getByClient, { clientId: typedId });

  const activeTasks = tasks?.filter((t: any) => t.status !== 'completed').slice(0, 3);
  const fulfilledCount = checklist?.filter((i: any) => i.status === 'fulfilled').length ?? 0;
  const totalChecklist = checklist?.length ?? 0;
  const checklistPct = totalChecklist > 0 ? Math.round((fulfilledCount / totalChecklist) * 100) : 0;

  return (
    <div>
      {/* Client Info Header */}
      <div className="border-b border-[var(--m-border)] px-[var(--m-page-px)] py-3">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-[var(--m-text-primary)]">
            {client?.name ?? '...'}
          </span>
          {client?.type && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)] capitalize">
              {client.type}
            </span>
          )}
          {(client as any)?.status && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)] capitalize">
              {(client as any).status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 mt-1.5">
          {client?.email && (
            <a href={`mailto:${client.email}`} className="flex items-center gap-1 text-[12px] text-[var(--m-accent-indicator)]">
              <Mail className="w-3 h-3" />
              {client.email}
            </a>
          )}
          {client?.phone && (
            <a href={`tel:${client.phone}`} className="flex items-center gap-1 text-[12px] text-[var(--m-accent-indicator)]">
              <Phone className="w-3 h-3" />
              {client.phone}
            </a>
          )}
        </div>
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
              {activeTasks ? activeTasks.length : '...'}
            </span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
        </button>
        {activeTasks && activeTasks.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {activeTasks.map((task: any) => (
              <div key={task._id} className="flex items-center justify-between">
                <span className="text-[12px] text-[var(--m-text-secondary)] truncate">{task.title}</span>
                {task.dueDate && (
                  <span className="text-[11px] text-[var(--m-text-tertiary)] flex-shrink-0 ml-2">
                    {new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open Flags Card */}
      <div className="border-b border-[var(--m-border)] px-[var(--m-page-px)] py-3">
        <button
          onClick={() => onSwitchTab('threads')}
          className="flex items-center justify-between w-full active:bg-[var(--m-bg-subtle)] -mx-[var(--m-page-px)] px-[var(--m-page-px)] py-0.5 rounded"
        >
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--m-text-primary)]">Open Flags</span>
            <span className="text-[12px] text-[var(--m-text-tertiary)]">
              {openFlagCount !== undefined ? openFlagCount : '...'}
            </span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
        </button>
      </div>

      {/* Recent Documents Card */}
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

      {/* Key Contacts Card */}
      <div className="border-b border-[var(--m-border)] px-[var(--m-page-px)] py-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--m-text-primary)]">Contacts</span>
          <span className="text-[12px] text-[var(--m-text-tertiary)]">
            {contacts ? contacts.length : '...'}
          </span>
        </div>
        {contacts && contacts.length > 0 && (
          <div className="mt-1.5 space-y-2">
            {contacts.map((contact: any) => (
              <div key={contact._id}>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[var(--m-text-secondary)]">{contact.name}</span>
                  {contact.role && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)]">
                      {contact.role}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="text-[12px] text-[var(--m-accent-indicator)]">
                      {contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="text-[12px] text-[var(--m-accent-indicator)]">
                      {contact.phone}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
