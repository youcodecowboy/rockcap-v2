'use client';

// The lender's document evidence trail, grouped by project — which documents
// this lender's knowledge actually came from, what each one tells us, and a
// click-through into the full document preview drawer (the docs section's).
// Data: appetiteSignals.lenderDocuments (four-lane federation) for the list,
// appetiteSignals.lenderDocumentAtoms lazily per expanded row.

import { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Panel, EmptyState, StatusPill, SkeletonCard, SkeletonText } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { FileText, ChevronRight, Atom, Maximize2 } from 'lucide-react';
import { relTime } from './LenderEditors';
import FileDetailPanel from '../../docs/components/FileDetailPanel';

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

/** The lazily-loaded expansion: what this document tells us about the lender. */
function DocAtoms({ lenderId, documentId }: { lenderId: Id<'clients'>; documentId: string }) {
  const colors = useColors();
  const data = useQuery(api.appetiteSignals.lenderDocumentAtoms, {
    lenderClientId: lenderId,
    documentId: documentId as Id<'documents'>,
  });

  if (data === undefined) return <SkeletonText lines={2} />;
  if (data.atoms.length === 0) {
    return (
      <div style={{ fontSize: 11, color: colors.text.muted }}>
        No knowledge atoms recorded from this document yet.
      </div>
    );
  }

  const lenderAtoms = data.atoms.filter((a) => a.lenderLinked);
  const otherCount = data.atoms.length - lenderAtoms.length;
  const shown = lenderAtoms.length > 0 ? lenderAtoms : data.atoms.slice(0, 8);

  return (
    <div className="space-y-1.5">
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: colors.text.muted,
        }}
      >
        {lenderAtoms.length > 0
          ? `What it tells us about this lender · ${lenderAtoms.length}`
          : 'Knowledge pulled from this document'}
      </div>
      {shown.map((a) => (
        <div key={a.atomId} className="flex items-start gap-2">
          <span
            className="mt-1.5 flex-shrink-0"
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: a.status === 'contested' ? colors.accent.red : colors.entityTypes.lender,
            }}
          />
          <span style={{ fontSize: 11.5, color: colors.text.secondary, lineHeight: 1.5 }}>
            {a.statement}
            {a.status === 'contested' && (
              <span className="ml-1.5 align-middle">
                <StatusPill label="contested" tone={colors.accent.red} />
              </span>
            )}
          </span>
        </div>
      ))}
      {lenderAtoms.length > 0 && otherCount > 0 && (
        <div style={{ fontSize: 10, color: colors.text.dim, paddingLeft: 13 }}>
          +{otherCount} further atom{otherCount === 1 ? '' : 's'} about the wider deal (project facts, borrower terms)
        </div>
      )}
    </div>
  );
}

function DocRow({
  lenderId,
  doc,
  onPreview,
}: {
  lenderId: Id<'clients'>;
  doc: LenderDoc;
  onPreview: (doc: LenderDoc) => void;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const summary = (doc.summary ?? '').trim();

  return (
    <div style={{ borderTop: `1px solid ${colors.border.default}` }}>
      {/* Header row — click to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardAlt; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <ChevronRight
          className="w-3.5 h-3.5 flex-shrink-0"
          style={{
            color: colors.text.dim,
            transform: expanded ? 'rotate(90deg)' : undefined,
            transition: 'transform 120ms ease',
          }}
        />
        <FileText className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.blue }} />
        <span className="min-w-0 flex items-center gap-2 flex-wrap">
          <span style={{ fontSize: 12.5, fontWeight: 500, color: colors.text.primary }}>
            {doc.fileName}
          </span>
          {doc.fileTypeDetected && (
            <StatusPill label={doc.fileTypeDetected} tone={colors.accent.blue} />
          )}
          {doc.atomCount > 0 && (
            <span
              className="inline-flex items-center gap-1"
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
        </span>
        <span className="ml-auto flex items-center gap-2 flex-shrink-0">
          <span style={{ fontFamily: MONO, fontSize: 9, color: colors.text.dim }}>
            {relTime(doc.uploadedAt)}
          </span>
          <span
            role="button"
            title="Open document preview"
            onClick={(e) => { e.stopPropagation(); onPreview(doc); }}
            className="inline-flex items-center justify-center rounded"
            style={{ width: 22, height: 22, color: colors.text.muted }}
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.card; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </span>
        </span>
      </button>

      {/* Expansion — the "why is this here" view */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3" style={{ paddingLeft: 42 }}>
          <div className="flex items-center gap-2 flex-wrap">
            {doc.via.map((v) => (
              <span
                key={v}
                style={{
                  fontFamily: MONO,
                  fontSize: 8.5,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: 2,
                  border: `1px solid ${colors.border.default}`,
                  color: colors.text.muted,
                }}
              >
                {VIA_LABELS[v] ?? v}
              </span>
            ))}
            {doc.category && (
              <span style={{ fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase', color: colors.text.dim }}>
                {doc.category}
              </span>
            )}
          </div>

          <DocAtoms lenderId={lenderId} documentId={doc.documentId} />

          {summary && (
            <div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: colors.text.muted,
                  marginBottom: 4,
                }}
              >
                Summary
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: colors.text.secondary,
                  lineHeight: 1.55,
                  whiteSpace: 'pre-line',
                }}
              >
                {summary}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LenderDocumentsTab({ lenderId }: { lenderId: Id<'clients'> }) {
  const colors = useColors();
  const data = useQuery(api.appetiteSignals.lenderDocuments, { lenderClientId: lenderId });
  const [previewId, setPreviewId] = useState<Id<'documents'> | null>(null);
  const previewDoc = useQuery(api.documents.get, previewId ? { id: previewId } : 'skip');

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
              <DocRow
                key={doc.documentId}
                lenderId={lenderId}
                doc={doc}
                onPreview={(d) => setPreviewId(d.documentId as Id<'documents'>)}
              />
            ))}
          </div>
        </Panel>
      ))}
      {data.totalFound > data.documents.length && (
        <div style={{ fontSize: 10, color: colors.text.muted, textAlign: 'center' }}>
          Showing {data.documents.length} of {data.totalFound} documents.
        </div>
      )}

      {/* Full document preview — the docs section's drawer, mounted here. */}
      <FileDetailPanel
        document={(previewDoc ?? null) as never}
        isOpen={previewId !== null && previewDoc != null}
        onClose={() => setPreviewId(null)}
      />
    </div>
  );
}
