'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useQuery } from 'convex/react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Skeleton, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Landmark } from 'lucide-react';

import LendersSidebar from './components/LendersSidebar';
import LenderProfile from './components/LenderProfile';
import KnowledgeGraphDrawer from '@/components/knowledge/KnowledgeGraphDrawer';

function LendersPageContent() {
  const colors = useColors();
  const lenderTone = colors.entityTypes.lender;

  // Deep linking: /lenders?lenderId=<id>
  const searchParams = useSearchParams();
  const urlLenderId = searchParams.get('lenderId');

  const [selectedLenderId, setSelectedLenderId] = useState<Id<'clients'> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [initializedFromUrl, setInitializedFromUrl] = useState(false);

  useEffect(() => {
    if (urlLenderId && !initializedFromUrl) {
      setSelectedLenderId(urlLenderId as Id<'clients'>);
      setInitializedFromUrl(true);
    }
  }, [urlLenderId, initializedFromUrl]);

  const selectedLender = useQuery(
    // @ts-ignore - Convex type instantiation depth issue
    api.clients.get,
    selectedLenderId ? { id: selectedLenderId } : 'skip'
  );

  const handleLenderSelect = useCallback((lenderId: Id<'clients'>) => {
    setSelectedLenderId(lenderId);
    setIsGraphOpen(false);
  }, []);

  return (
    <div className="h-screen flex flex-col" style={{ background: colors.bg.base }}>
      {/* Header */}
      <header
        className="px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ background: colors.bg.card, borderBottom: `1px solid ${colors.border.default}` }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5" style={{ color: lenderTone }} />
            <h1 style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary }}>
              Lenders
            </h1>
          </div>
          {selectedLender && (
            <div className="hidden md:flex items-center gap-2" style={{ fontSize: 12, color: colors.text.secondary }}>
              <button
                onClick={() => setSelectedLenderId(null)}
                style={{ background: 'transparent', border: 'none', color: colors.text.secondary, cursor: 'pointer' }}
              >
                All lenders
              </button>
              <span style={{ color: colors.text.dim }}>/</span>
              <span style={{ fontWeight: 500, color: colors.text.primary }}>
                {selectedLender.name}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Body: sidebar + profile canvas */}
      <div className="flex-1 flex overflow-hidden">
        <LendersSidebar
          selectedLenderId={selectedLenderId}
          onLenderSelect={handleLenderSelect}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {selectedLenderId ? (
          <LenderProfile
            lenderId={selectedLenderId}
            onOpenGraph={() => setIsGraphOpen(true)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <EmptyState
              icon={<Landmark className="w-10 h-10" />}
              title="Select a lender"
              body="Pick a lender from the list to see their appetite, facility book, projects, people, and knowledge graph."
            />
          </div>
        )}
      </div>

      {/* Knowledge graph — page-level fixed drawer, opened pre-focused on the lender */}
      {isGraphOpen && selectedLenderId && selectedLender && (
        <KnowledgeGraphDrawer
          entryEntityType="client"
          entryEntityId={selectedLenderId}
          entryName={selectedLender.name}
          selectEntryOnMount
          onClose={() => setIsGraphOpen(false)}
        />
      )}
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function LendersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-6" style={{ width: '100%' }}>
          <Skeleton width={240} height={12} />
        </div>
      }
    >
      <LendersPageContent />
    </Suspense>
  );
}
