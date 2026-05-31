'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { useColors } from '@/lib/useColors';
import { Panel, DataTable, EmptyState, StatusPill } from '@/components/layouts';
import {
  FileText,
  MessageSquare,
  Calendar,
} from 'lucide-react';

interface Communication {
  id: string;
  type: 'document';
  date: string;
  participants: string[];
  documentId: string;
  summary: string;
}

interface ClientCommunicationsTabProps {
  clientId: Id<"clients">;
  communications: Communication[];
  documents: any[];
}

export default function ClientCommunicationsTab({
  clientId,
  communications,
  documents,
}: ClientCommunicationsTabProps) {
  const router = useRouter();
  const colors = useColors();

  // Group communications by date
  const groupedCommunications = useMemo(() => {
    const sorted = [...communications].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const groups: Record<string, Communication[]> = {};
    sorted.forEach((comm) => {
      const dateKey = new Date(comm.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(comm);
    });

    return groups;
  }, [communications]);

  const getDocumentName = (documentId: string): string => {
    const doc = documents.find((d: any) => d._id === documentId);
    return doc?.fileName || 'Unknown Document';
  };

  const getDocumentType = (documentId: string): string => {
    const doc = documents.find((d: any) => d._id === documentId);
    return doc?.fileTypeDetected || doc?.category || 'Document';
  };

  if (communications.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare size={32} />}
        title="No communications"
        body="Communications will appear here as documents are uploaded and interactions are recorded."
      />
    );
  }

  return (
    <Panel
      title={`Communication Timeline · ${communications.length} interactions`}
      accent={colors.entityTypes.client}
      padded={false}
    >
      {Object.entries(groupedCommunications).map(([date, comms]) => (
        <div key={date}>
          {/* Date Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: colors.bg.light,
              borderBottom: `1px solid ${colors.border.default}`,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 9,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.text.muted,
              fontWeight: 500,
            }}
          >
            <Calendar size={12} />
            {date}
          </div>

          <DataTable
            rows={comms}
            getRowKey={(c) => c.id}
            onRowClick={(c) => router.push(`/docs/${c.documentId}`)}
            columns={[
              {
                key: 'document',
                header: 'Document',
                render: (c) => (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                    <FileText size={16} style={{ flexShrink: 0, marginTop: 2 }} color={colors.accent.blue} />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: colors.text.primary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {getDocumentName(c.documentId)}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: colors.text.muted,
                          marginTop: 2,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {c.summary}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'type',
                header: 'Type',
                width: 160,
                render: (c) => <StatusPill label={getDocumentType(c.documentId)} tone={colors.accent.blue} />,
              },
              {
                key: 'time',
                header: 'Time',
                mono: true,
                align: 'right',
                width: 100,
                render: (c) =>
                  new Date(c.date).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
              },
            ]}
          />
        </div>
      ))}
    </Panel>
  );
}
