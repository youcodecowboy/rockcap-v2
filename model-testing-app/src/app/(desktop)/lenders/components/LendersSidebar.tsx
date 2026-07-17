'use client';

import { useMemo, useRef } from 'react';
import { useQuery } from 'convex/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Input, StatusPill, EmptyState, clientStatusTone } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Search, Landmark, ChevronRight } from 'lucide-react';

interface Lender {
  _id: Id<'clients'>;
  name: string;
  companyName?: string;
  status?: string;
}

interface LendersSidebarProps {
  selectedLenderId: Id<'clients'> | null;
  onLenderSelect: (lenderId: Id<'clients'>) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function LendersSidebar({
  selectedLenderId,
  onLenderSelect,
  searchQuery,
  onSearchChange,
}: LendersSidebarProps) {
  const colors = useColors();
  const lenders = useQuery(api.appetiteSignals.listLenders, { limit: 1000 });

  const filteredLenders = useMemo(() => {
    if (!lenders) return [];
    if (!searchQuery.trim()) return lenders as Lender[];
    const q = searchQuery.toLowerCase();
    return (lenders as Lender[]).filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.companyName?.toLowerCase().includes(q),
    );
  }, [lenders, searchQuery]);

  return (
    <div
      className="flex flex-col h-full flex-shrink-0"
      style={{
        width: 300,
        borderRight: `1px solid ${colors.border.default}`,
        background: colors.bg.light,
      }}
    >
      {/* Search */}
      <div className="p-3" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: colors.text.dim, pointerEvents: 'none', zIndex: 1 }}
          />
          <Input
            placeholder="Search lenders..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
      </div>

      {/* Count */}
      <div
        className="px-4 py-2"
        style={{
          borderBottom: `1px solid ${colors.border.default}`,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: colors.text.muted,
        }}
      >
        {lenders === undefined
          ? 'Loading…'
          : `${filteredLenders.length} lender${filteredLenders.length === 1 ? '' : 's'}`}
      </div>

      {/* Lender list — virtualized (same pattern as DocsSidebar's client list) */}
      <LenderList
        lenders={filteredLenders}
        selectedLenderId={selectedLenderId}
        onLenderSelect={onLenderSelect}
        searchQuery={searchQuery}
        isLoading={lenders === undefined}
      />
    </div>
  );
}

interface LenderListProps {
  lenders: Lender[];
  selectedLenderId: Id<'clients'> | null;
  onLenderSelect: (lenderId: Id<'clients'>) => void;
  searchQuery: string;
  isLoading: boolean;
}

function LenderList({
  lenders,
  selectedLenderId,
  onLenderSelect,
  searchQuery,
  isLoading,
}: LenderListProps) {
  const colors = useColors();
  const parentRef = useRef<HTMLDivElement>(null);
  const lenderTone = colors.entityTypes.lender;

  const virtualizer = useVirtualizer({
    count: lenders.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  if (!isLoading && lenders.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <EmptyState
          icon={<Landmark className="w-10 h-10" />}
          title={searchQuery ? 'No lenders match your search' : 'No lenders yet'}
          body={
            searchQuery
              ? undefined
              : 'Lenders are created as documents are ingested, or via lender.create.'
          }
        />
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const lender = lenders[virtualRow.index];
          const selected = selectedLenderId === lender._id;
          return (
            <div
              key={lender._id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="px-2"
            >
              <button
                onClick={() => onLenderSelect(lender._id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left"
                style={{
                  background: selected ? `${lenderTone}15` : 'transparent',
                  color: selected ? lenderTone : colors.text.secondary,
                  border: `1px solid ${selected ? `${lenderTone}40` : 'transparent'}`,
                  transition: 'background 100ms linear',
                }}
                onMouseEnter={(e) => {
                  if (!selected) e.currentTarget.style.background = colors.bg.cardAlt;
                }}
                onMouseLeave={(e) => {
                  if (!selected) e.currentTarget.style.background = 'transparent';
                }}
              >
                <Landmark className="w-4 h-4 flex-shrink-0" style={{ color: lenderTone }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate" style={{ color: colors.text.primary }}>
                    {lender.name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {lender.status && (
                      <StatusPill
                        label={lender.status}
                        tone={clientStatusTone(lender.status, colors)}
                      />
                    )}
                    {lender.companyName && lender.companyName !== lender.name && (
                      <span className="text-xs truncate" style={{ color: colors.text.muted }}>
                        {lender.companyName}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.dim }} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
