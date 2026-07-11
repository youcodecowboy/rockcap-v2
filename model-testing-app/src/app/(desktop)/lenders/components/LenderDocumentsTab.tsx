'use client';

// The lender's document evidence trail, grouped by project — which documents
// this lender's knowledge actually came from, what was pulled from each, and
// a click-through into the owning client's library. Data: the four-lane
// federation in appetiteSignals.lenderDocuments (lender-row evidence, lender
// knowledge atoms, facility-book atoms, appetite sources).

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Panel, EmptyState, StatusPill, SkeletonCard } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { FileText, ArrowUpRight, Atom } from 'lucide-react';
import { relTime } from './LenderEditors';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const VIA_LABELS: Record<string, string> = {
  'lender evidence': 'lender record',
  knowledge: 'knowledge',
  facility: 'facility paper',
  appetite: 'appetite source',
};

interface LenderDoc {
  documentId: string;
  fileName: string;
  fileTypeDetected?: string;
  category?: string;
  summary: string;
  uploadedAt: string;
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  atomCount: number;
  via: string[];
}

function DocRow({ doc }: { doc: LenderDoc }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const summary = (doc.summary ?? '').trim();
  const isLong = summary.length > 220;

  return (
    <div
      className="px-4 py-3"
      style={{ borderTop: `1px solid ${colors.border.default}` }}
    >
      <div className="flex items-start gap-2.5">
        <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: colors.accent.blue }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 12.5, fontWeight: 500, color: colors.text.primary }}>
              {doc.fileName}
            </span>
            {doc.fileTypeDetected && (
              <StatusPill label={doc.fileTypeDetected} tone={colors.accent.blue} />
            )}
            {doc.atomCount > 0 && (
              <span
                className="inline-flex items-center gap-1"
                title={`${doc.atomCount} knowledge atoms pulled from this document for this lender`}
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  padding: '2px 6px',
                  borderRadius: 2,
                  background: `${colors.entityTypes.lender}15`,
                  border: `1px solid ${colors.entityTypes.lender}40`,
                  color: colors.entityTypes.lender,
                }}
              >
                <Atom className="w-2.5 h-2.5" />
                {doc.atomCount} atoms
              </span>
            )}
            <span className="ml-auto flex items-center gap-2 flex-shrink-0">
              <span style={{ fontFamily: MONO, fontSize: 9, color: colors.text.dim }}>
                {relTime(doc.uploadedAt)}
              </span>
              {doc.clientId && (
                <Link
                  href={`/docs?clientId=${doc.clientId}`}
                  title={`Open in ${doc.clientName ?? 'client'}'s document library`}
                  className="inline-flex items-center"
                  style={{ color: colors.text.muted }}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </span>
          </div>

          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {doc.via.map((v) => (
              <span
                key={v}
                style={{
                  fontFamily: MONO,
                  fontSize: 8.5,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: colors.text.dim,
                }}
              >
                {VIA_LABELS[v] ?? v}
              </span>
            ))}
          </div>

          {summary && (
            <div
              onClick={() => isLong && setExpanded(!expanded)}
              style={{
                fontSize: 11,
                color: colors.text.secondary,
                marginTop: 6,
                lineHeight: 1.5,
                cursor: isLong ? 'pointer' : 'default',
              }}
              title={isLong && !expanded ? 'Click to expand' : undefined}
            >
              {expanded || !isLong ? summary : `${summary.slice(0, 219)}…`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LenderDocumentsTab({ lenderId }: { lenderId: Id<'clients'> }) {
  const colors = useColors();
  const data = useQuery(api.appetiteSignals.lenderDocuments, { lenderClientId: lenderId });

  const groups = useMemo(() => {
    if (!data) return [];
    const byScope = new Map<string, LenderDoc[]>();
    for (const doc of data.documents as LenderDoc[]) {
      const scope = doc.projectName ?? doc.clientName ?? 'Unfiled';
      if (!byScope.has(scope)) byScope.set(scope, []);
      byScope.get(scope)!.push(doc);
    }
    // Biggest groups first — the projects this lender is most evidenced on.
    return [...byScope.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [data]);

  if (data === undefined) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (data.documents.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="w-10 h-10" />}
        title="No documents evidence this lender yet"
        body="Documents appear here once ingestion pulls this lender's terms, facilities, or appetite from them — or when a lender packet is atomized."
      />
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([scope, docs]) => (
        <Panel
          key={scope}
          title={`${scope} · ${docs.length} document${docs.length === 1 ? '' : 's'}`}
          padded={false}
        >
          <div>
            {docs.map((doc) => (
              <DocRow key={doc.documentId} doc={doc} />
            ))}
          </div>
        </Panel>
      ))}
      {data.totalFound > data.documents.length && (
        <div style={{ fontSize: 10, color: colors.text.muted, textAlign: 'center' }}>
          Showing {data.documents.length} of {data.totalFound} documents.
        </div>
      )}
    </div>
  );
}
