'use client';

import { Component, type ReactNode } from 'react';
import { DARK } from '@/lib/colors';
import { EmptyState } from '@/components/layouts';
import AtlasView from '@/components/knowledge/atlas/AtlasView';

// Auth: /knowledge is not in the middleware public-route list, so Clerk
// protects it exactly like every other (desktop) page — no per-page guard.

/** The overview query lives in convex/knowledge/graphOverview.ts (built in
 * parallel — see overviewRef.ts). Until it's deployed, the query errors; this
 * boundary keeps the page shell alive with an app-idiom message instead of
 * crashing the route. It also catches genuine runtime errors later. */
class AtlasErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: DARK.bg.base }}>
          <EmptyState
            title="Knowledge atlas unavailable"
            body="The org-wide overview query isn't reachable right now. If the graphOverview backend hasn't been deployed yet, this page will light up as soon as it lands."
          />
        </div>
      );
    }
    return this.props.children;
  }
}

export default function KnowledgePage() {
  return (
    // The (desktop) layout reserves 4rem of top chrome (pt-16); the board owns
    // the rest of the viewport.
    <div style={{ height: 'calc(100vh - 4rem)' }}>
      <AtlasErrorBoundary>
        <AtlasView />
      </AtlasErrorBoundary>
    </div>
  );
}
