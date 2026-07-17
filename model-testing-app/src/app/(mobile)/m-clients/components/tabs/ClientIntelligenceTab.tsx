'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { ChevronDown } from 'lucide-react';

// Atoms-backed mobile Knowledge tab (knowledge cutover Phase 2) — replaces the
// legacy knowledgeItems list. Renders the same expandEntity payload the
// desktop KnowledgeAtomsTab and the graph drawer use: the client's attribute
// facts + relationship edges + each ring member's attribute atoms, grouped by
// predicate family, contested flagged. Read-only on mobile — adjudication
// lives in the desktop drawer.

interface ClientIntelligenceTabProps {
  clientId: string;
}

interface Row {
  id: string;
  family: string;
  predicate: string;
  line: string;
  qualifier?: string;
  status: 'active' | 'contested';
  hostName?: string; // set when the fact hangs off a ring member, not the client
  provenance: string;
}

const FAMILY_ORDER = ['financing', 'people', 'structure', 'property', 'other'];

function familyFor(predicate: string): string {
  if (/lend|charge|fund|refinanc|loan|interest|matur|guarantee|facility/.test(predicate)) return 'financing';
  if (/advis|introduc|formerly|officer|director|person/.test(predicate)) return 'people';
  if (/parent|renamed|owns|acquired|registration|registered|psc/.test(predicate)) return 'structure';
  if (/gdv|unit|planning|valuation|construction|price|site|scheme/.test(predicate)) return 'property';
  return 'other';
}

function fmt(value: unknown, currency?: string): string {
  if (typeof value === 'number') {
    return currency ? `£${value.toLocaleString('en-GB')}` : value.toLocaleString('en-GB');
  }
  if (value === null || value === undefined) return '—';
  return String(value);
}

export default function ClientIntelligenceTab({ clientId }: ClientIntelligenceTabProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(FAMILY_ORDER));
  const toggle = (fam: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(fam)) next.delete(fam);
      else next.add(fam);
      return next;
    });
  };

  const data = useQuery(api.knowledge.graphQueries.expandEntity, {
    entityType: 'client',
    entityId: clientId,
    includeRingAttributes: true,
  });

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const entity = data.entity as { id: string; name: string };
    const out: Row[] = [];
    [...(data.edges as any[]), ...(data.nativeEdges as any[])].forEach((e, i) => {
      if (e.other.id === entity.id) return;
      out.push({
        id: `e${i}`,
        family: familyFor(e.predicate),
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
        family: familyFor(a.predicate),
        predicate: a.predicate,
        line: fmt(a.value, a.currency),
        qualifier: a.qualifier,
        status: a.status,
        provenance: a.native ? 'native' : a.asOf ? `atom · ${a.asOf}` : 'atom',
      });
    });
    const ring = (data.ringAttributes ?? {}) as Record<string, any[]>;
    for (const rows_ of Object.values(ring)) {
      rows_.forEach((a) => {
        out.push({
          id: a.atomId,
          family: familyFor(a.predicate),
          predicate: a.predicate,
          line: fmt(a.value, a.currency),
          qualifier: a.qualifier,
          status: a.status,
          hostName: a.subject.name,
          provenance: a.asOf ? `atom · ${a.asOf}` : 'atom',
        });
      });
    }
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
        No knowledge yet — facts appear as documents, notes and meetings are atomized
      </div>
    );
  }

  const groups = FAMILY_ORDER
    .map(fam => ({ key: fam, items: rows.filter(r => r.family === fam) }))
    .filter(g => g.items.length > 0);

  return (
    <div>
      {groups.map(({ key, items }) => {
        const isOpen = expanded.has(key);
        return (
          <div key={key}>
            <button
              onClick={() => toggle(key)}
              className="flex items-center justify-between w-full py-2.5 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)] text-left"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)]">
                {key}
                <span className="text-[var(--m-text-tertiary)] font-normal ml-1.5">({items.length})</span>
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[var(--m-text-tertiary)] transition-transform ${isOpen ? '' : '-rotate-90'}`}
              />
            </button>
            {isOpen && items.map((r) => (
              <div key={r.id} className="px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[var(--m-text-primary)]">
                      {r.hostName && <span>{r.hostName} · </span>}
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
      })}
    </div>
  );
}
