'use client';

import { Component, type ReactNode } from 'react';
import { DARK } from '@/lib/colors';
import { EmptyState } from '@/components/layouts';
import AtlasView from '@/components/knowledge/atlas/AtlasView';

// Auth: /knowledge is not in the middleware public-route list, so Clerk
// protects it exactly like every other (desktop) page — no per-page guard.

/** The overview is served from a cached snapshot (convex/knowledge/
 * graphOverview.ts). This boundary catches runtime errors from the snapshot
 * query or the board itself and keeps the page shell alive with an app-idiom
 * message instead of crashing the route. */
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
            body={`The atlas hit a runtime error: ${this.state.error.message} — check the Convex logs for knowledge/graphOverview.`}
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
