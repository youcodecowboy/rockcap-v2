'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useColors } from '@/lib/useColors';
import { SkeletonText } from '@/components/layouts';
import InboxSidebar, { type InboxFilter } from './components/InboxSidebar';
import InboxItemList, { type InboxItem } from './components/InboxItemList';
import InboxDetailPanel from './components/InboxDetailPanel';
import GmailInboxView from './components/GmailInboxView';

const VALID_FILTERS: InboxFilter[] = ['all', 'flags', 'notifications', 'mentions', 'resolved'];
type InboxBox = 'app' | 'gmail';

function InboxPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read URL state
  const filterParam = searchParams.get('filter') as InboxFilter | null;
  const activeFilter: InboxFilter =
    filterParam && VALID_FILTERS.includes(filterParam) ? filterParam : 'all';
  const selectedId = searchParams.get('selected') || searchParams.get('flag') || null;
  const activeBox: InboxBox = searchParams.get('box') === 'gmail' ? 'gmail' : 'app';

  // Query all filter counts in parallel
  const allItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'all' });
  const flagItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'flags' });
  const notifItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'notifications' });
  const mentionItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'mentions' });
  const resolvedItems = useQuery(api.flags.getInboxItemsEnriched, { filter: 'resolved' });

  // Current filter items
  const currentItems: InboxItem[] = useMemo(() => {
    const itemMap: Record<InboxFilter, typeof allItems> = {
      all: allItems,
      flags: flagItems,
      notifications: notifItems,
      mentions: mentionItems,
      resolved: resolvedItems,
    };
    return (itemMap[activeFilter] || []) as InboxItem[];
  }, [activeFilter, allItems, flagItems, notifItems, mentionItems, resolvedItems]);

  const counts = useMemo(
    () => ({
      all: allItems?.length || 0,
      flags: flagItems?.length || 0,
      notifications: notifItems?.length || 0,
      mentions: mentionItems?.length || 0,
      resolved: resolvedItems?.length || 0,
    }),
    [allItems, flagItems, notifItems, mentionItems, resolvedItems]
  );

  // Determine kind of selected item
  const selectedKind = useMemo(() => {
    if (!selectedId || !currentItems) return null;
    const item = currentItems.find((i) => i.id === selectedId);
    return item?.kind || null;
  }, [selectedId, currentItems]);

  // URL state updaters
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      // Clean up legacy 'flag' param
      params.delete('flag');
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const handleFilterChange = useCallback(
    (filter: InboxFilter) => {
      updateParams({ filter: filter === 'all' ? null : filter, selected: null });
    },
    [updateParams]
  );

  const handleSelect = useCallback(
    (id: string) => {
      updateParams({ selected: id });
    },
    [updateParams]
  );

  const handleBoxChange = useCallback(
    (box: InboxBox) => {
      // Switching mailboxes clears the selection + app-inbox filter; selection
      // ids aren't shared between the flag/notification inbox and Gmail.
      updateParams({ box: box === 'app' ? null : box, selected: null, filter: null });
    },
    [updateParams]
  );

  const colors = useColors();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]" style={{ background: colors.bg.base }}>
      {/* Mailbox toggle: App inbox (flags / notifications / mentions) vs Gmail */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{ borderBottom: `1px solid ${colors.border.default}` }}
      >
        {(['app', 'gmail'] as const).map((box) => {
          const isActive = activeBox === box;
          return (
            <button
              key={box}
              onClick={() => handleBoxChange(box)}
              className="px-3 py-1.5 rounded-md"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontWeight: 600,
                color: isActive ? colors.text.primary : colors.text.muted,
                background: isActive ? colors.bg.light : 'transparent',
                border: `1px solid ${isActive ? colors.border.default : 'transparent'}`,
              }}
            >
              {box === 'app' ? 'App Inbox' : 'Gmail'}
            </button>
          );
        })}
      </div>

      <div className="flex flex-1 min-h-0">
        {activeBox === 'gmail' ? (
          <GmailInboxView selectedId={selectedId} onSelect={handleSelect} />
        ) : (
          <>
            {/* Left Panel */}
            <InboxSidebar
              activeFilter={activeFilter}
              onFilterChange={handleFilterChange}
              counts={counts}
            >
              <InboxItemList
                items={currentItems || []}
                selectedId={selectedId}
                onSelect={handleSelect}
              />
            </InboxSidebar>

            {/* Right Panel */}
            <div className="flex-1 min-w-0">
              <InboxDetailPanel selectedId={selectedId} selectedKind={selectedKind} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 h-[calc(100vh-4rem)] p-6">
          <SkeletonText lines={6} />
        </div>
      }
    >
      <InboxPageContent />
    </Suspense>
  );
}
