'use client';

import { Communication } from '@/types';
import { Mail, Phone, FileText, Calendar, Users, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';

interface CommunicationTimelineProps {
  communications: Communication[];
  getDocumentName?: (documentId: string) => string;
}

const typeIcons = {
  email: Mail,
  meeting: Calendar,
  call: Phone,
  document: FileText,
  other: FileText,
};

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function CommunicationTimeline({
  communications,
}: CommunicationTimelineProps) {
  const router = useRouter();
  const colors = useColors();

  const typeTones: Record<string, string> = {
    email: colors.accent.blue,
    meeting: colors.accent.purple,
    call: colors.accent.green,
    document: colors.text.muted,
    other: colors.text.muted,
  };

  // Group communications by date
  const grouped = communications.reduce((acc, comm) => {
    const date = new Date(comm.date).toLocaleDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(comm);
    return acc;
  }, {} as Record<string, Communication[]>);

  // Sort dates descending
  const sortedDates = Object.keys(grouped).sort((a, b) =>
    new Date(b).getTime() - new Date(a).getTime()
  );

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (sortedDates.length === 0) {
    return <EmptyState icon={<MessageSquare size={24} />} title="No communications found" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {sortedDates.map((date) => (
        <div key={date}>
          <div
            style={{
              position: 'sticky',
              top: 0,
              background: colors.bg.light,
              padding: '8px 0',
              marginBottom: 12,
              borderBottom: `1px solid ${colors.border.default}`,
            }}
          >
            <h3
              style={{
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 500,
                color: colors.text.muted,
              }}
            >
              {date}
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {grouped[date].map((comm) => {
              const Icon = typeIcons[comm.type] || typeIcons.other;
              const tone = typeTones[comm.type] || typeTones.other;

              return (
                <div
                  key={comm.id}
                  style={{
                    background: colors.bg.card,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: 4,
                    padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div
                      style={{
                        padding: 8,
                        borderRadius: 4,
                        background: `${tone}15`,
                        color: tone,
                        flexShrink: 0,
                        display: 'flex',
                      }}
                    >
                      <Icon size={18} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ marginBottom: 8 }}>
                        {comm.subject && (
                          <h4 style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary, marginBottom: 2 }}>
                            {comm.subject}
                          </h4>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.text.muted }}>
                          <span style={{ textTransform: 'capitalize' }}>{comm.type}</span>
                          <span>•</span>
                          <span style={{ fontFamily: MONO }}>{formatTime(comm.date)}</span>
                        </div>
                      </div>

                      {comm.participants && comm.participants.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <Users size={14} style={{ color: colors.text.dim }} />
                          <span style={{ fontSize: 12, color: colors.text.secondary }}>
                            {comm.participants.join(', ')}
                          </span>
                        </div>
                      )}

                      {comm.summary && (
                        <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 8 }}>{comm.summary}</p>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/docs/${comm.documentId}`)}
                      >
                        View Document
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
