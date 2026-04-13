'use client';

import { useState, useMemo } from 'react';
import { Flag, Building2, FolderKanban, FileText, ListTodo, Calendar, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import MobileFlagDetail from './MobileFlagDetail';

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const ENTITY_ICONS: Record<string, any> = {
  client: Building2,
  project: FolderKanban,
  document: FileText,
  task: ListTodo,
  meeting: Calendar,
  checklist_item: ClipboardCheck,
};

const ENTITY_LABELS: Record<string, string> = {
  client: 'Client',
  project: 'Project',
  document: 'Document',
  task: 'Task',
  meeting: 'Meeting',
  checklist_item: 'Checklist',
};

export default function MobileFlagList() {
  const [showResolved, setShowResolved] = useState(false);
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);

  const enrichedItems = useQuery(api.flags.getInboxItemsEnriched, {
    filter: showResolved ? 'resolved' : 'flags',
  });

  // Extract only flag items (the query can also return notifications)
  const flags = useMemo(() => {
    if (!enrichedItems) return undefined;
    return enrichedItems
      .filter((item: any) => item.kind === 'flag')
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [enrichedItems]);

  if (selectedFlagId) {
    return <MobileFlagDetail flagId={selectedFlagId} onBack={() => setSelectedFlagId(null)} />;
  }

  return (
    <div>
      <div className="flex gap-2 px-[var(--m-page-px)] py-2 bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
        <button
          onClick={() => setShowResolved(false)}
          className={`px-3 py-1 rounded-full text-[11px] font-medium ${
            !showResolved
              ? 'bg-[var(--m-accent)] text-white'
              : 'bg-[var(--m-bg)] text-[var(--m-text-secondary)] border border-[var(--m-border)]'
          }`}
        >
          Open
        </button>
        <button
          onClick={() => setShowResolved(true)}
          className={`px-3 py-1 rounded-full text-[11px] font-medium ${
            showResolved
              ? 'bg-[var(--m-accent)] text-white'
              : 'bg-[var(--m-bg)] text-[var(--m-text-secondary)] border border-[var(--m-border)]'
          }`}
        >
          Resolved
        </button>
      </div>

      {!flags || flags.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[13px] text-[var(--m-text-tertiary)]">
            No {showResolved ? 'resolved' : 'open'} flags
          </p>
        </div>
      ) : (
        flags.map((item: any) => {
          const flag = item.data;
          const entityType = flag.entityType || '';
          const EntityIcon = ENTITY_ICONS[entityType] || Flag;
          const entityLabel = ENTITY_LABELS[entityType] || entityType;
          const isUrgent = flag.priority === 'urgent';

          return (
            <button
              key={item.id}
              onClick={() => setSelectedFlagId(item.id)}
              className={`w-full flex items-start gap-3 px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)] text-left ${
                isUrgent ? 'border-l-2 border-l-[var(--m-error)]' : ''
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                isUrgent ? 'bg-red-50' : 'bg-amber-50'
              }`}>
                <EntityIcon className={`w-4 h-4 ${isUrgent ? 'text-red-500' : 'text-amber-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                {/* Entity name + type + time */}
                <div className="flex items-center gap-1.5">
                  {item.entityName && (
                    <span className="text-[12px] font-semibold text-[var(--m-text-primary)] truncate">
                      {item.entityName}
                    </span>
                  )}
                  <span className="text-[9px] font-medium uppercase tracking-wide px-1 py-px rounded bg-[var(--m-bg-inset)] text-[var(--m-text-tertiary)] shrink-0">
                    {entityLabel}
                  </span>
                  {isUrgent && (
                    <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                  )}
                  <span className="text-[10px] text-[var(--m-text-tertiary)] ml-auto shrink-0">
                    {formatTime(item.createdAt)}
                  </span>
                </div>
                {/* Context subtitle (e.g. client/project for documents) */}
                {item.entityContext && (
                  <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5 truncate">
                    {item.entityContext}
                  </div>
                )}
                {/* Flag note */}
                <p className="text-[13px] text-[var(--m-text-primary)] mt-0.5 line-clamp-2">
                  {flag.note}
                </p>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
