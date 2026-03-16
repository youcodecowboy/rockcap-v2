/**
 * Shared utilities for thread/flag components.
 * Used by ThreadEntry, FlagDetailPanel, and entity-scoped flag lists.
 */

// ---------------------------------------------------------------------------
// Relative timestamp formatter
// ---------------------------------------------------------------------------
export function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// Avatar initial helper
// ---------------------------------------------------------------------------
export function getInitial(name: string | null | undefined): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

// ---------------------------------------------------------------------------
// Entity type label maps
// ---------------------------------------------------------------------------
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  document: 'Document',
  meeting: 'Meeting',
  task: 'Task',
  project: 'Project',
  client: 'Client',
  checklist_item: 'Checklist',
};

export const ENTITY_TYPE_SHORT: Record<string, string> = {
  document: 'DOC',
  meeting: 'MTG',
  task: 'TASK',
  project: 'PROJ',
  client: 'CLIENT',
  checklist_item: 'CHECK',
};

// ---------------------------------------------------------------------------
// Entity link builder
// ---------------------------------------------------------------------------
export function buildEntityLink(
  entityType: string,
  entityId: string,
  clientId?: string,
  projectId?: string,
): string {
  switch (entityType) {
    case 'document':
      return `/docs/reader/${entityId}`;
    case 'meeting':
      return clientId ? `/clients/${clientId}` : '/inbox';
    case 'task':
      return '/tasks';
    case 'project':
      return clientId
        ? `/clients/${clientId}/projects/${entityId}`
        : '/inbox';
    case 'client':
      return `/clients/${entityId}`;
    case 'checklist_item':
      return clientId ? `/clients/${clientId}` : '/inbox';
    default:
      return '/inbox';
  }
}
