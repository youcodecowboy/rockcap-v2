'use client';

import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';

// Atoms-backed mobile project Knowledge tab (knowledge cutover Phase 2) —
// replaces the legacy knowledgeItems list with the project's atom facts and
// relationship edges from the same expandEntity payload the desktop uses.

interface ProjectIntelligenceTabProps {
  projectId: string;
}

interface Row {
  id: string;
  predicate: string;
  line: string;
  qualifier?: string;
  status: 'active' | 'contested';
  provenance: string;
}

function fmt(value: unknown, currency?: string): string {
  if (typeof value === 'number') {
    return currency ? `£${value.toLocaleString('en-GB')}` : value.toLocaleString('en-GB');
  }
  if (value === null || value === undefined) return '—';
  return String(value);
}

export default function ProjectIntelligenceTab({ projectId }: ProjectIntelligenceTabProps) {
  const data = useQuery(api.knowledge.graphQueries.expandEntity, {
    entityType: 'project',
    entityId: projectId,
  });

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const entity = data.entity as { id: string };
    const out: Row[] = [];
    [...(data.edges as any[]), ...(data.nativeEdges as any[])].forEach((e, i) => {
      if (e.other.id === entity.id) return;
      out.push({
        id: `e${i}`,
        predicate: e.predicate,
        line: e.direction === 'out' ? `→ ${e.other.name}` : `← ${e.other.name}`,
        qualifier: e.qualifier,
        status: e.status,
        provenance: e.provenance.sourceType === 'native' ? 'native' : `${e.provenance.sourceType} · ${e.provenance.observationCount ?? 1} obs`,
      });
    });
    (data.attributes as any[]).forEach((a, i) => {
      out.push({
        id: `a${i}`,
        predicate: a.predicate,
        line: fmt(a.value, a.currency),
        qualifier: a.qualifier,
        status: a.status,
        provenance: a.native ? 'native' : a.asOf ? `atom · ${a.asOf}` : 'atom',
      });
    });
    return out;
  }, [data]);

  if (data === undefined) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Loading knowledge...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        No knowledge yet — facts appear as this project's documents and notes are atomized
      </div>
    );
  }

  return (
    <div>
      {rows.map((r) => (
        <div key={r.id} className="px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-[var(--m-text-primary)]">
                <span className="font-mono text-[12px]">{r.predicate}</span>
                {r.qualifier ? ` (${r.qualifier})` : ''}
              </div>
              <div className="text-[12px] text-[var(--m-text-secondary)] mt-0.5 break-words">
                {r.line}
              </div>
              <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5 truncate">
                {r.provenance}
              </div>
            </div>
            {r.status === 'contested' && (
              <span className="shrink-0 text-[10px] bg-[var(--m-bg-inset)] text-red-500 rounded px-1.5 py-0.5 mt-0.5">
                contested
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
