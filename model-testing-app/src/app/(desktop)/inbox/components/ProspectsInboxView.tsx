'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../../convex/_generated/api';
import { useColors } from '@/lib/useColors';
import { EmptyState, SkeletonText } from '@/components/layouts';
import { Mail, ArrowUpRight, ArrowDownLeft, Paperclip, Users, CalendarCheck, CalendarClock } from 'lucide-react';

// Prospects inbox — the org-wide, client-linked mail feed (both directions)
// with the prospecting KPI strip on top. Distinct from the Gmail box (the
// operator's private mailbox): rows here are business correspondence only —
// inbound replyEvents with a client link + outbound email touchpoints
// (in-app sends AND poller-captured manual Gmail sends). Stage chips filter
// via the clients row's pipelineStage.

const STAGES: Array<{ key: string; label: string }> = [
  { key: 'cold_outreach', label: 'Cold' },
  { key: 'warm_pre_meeting', label: 'Warm · pre-meeting' },
  { key: 'warm_post_meeting', label: 'Warm · post-meeting' },
  { key: 'pre_qualification', label: 'Pre-qual' },
  { key: 'qualified', label: 'Qualified' },
];

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function stageLabel(stage?: string): string {
  return STAGES.find((s) => s.key === stage)?.label ?? 'Unstaged';
}

export default function ProspectsInboxView() {
  const colors = useColors();
  const router = useRouter();
  const [stage, setStage] = useState<string | null>(null);
  const [direction, setDirection] = useState<'inbound' | 'outbound' | null>(null);

  const data = useQuery(api.prospectingInbox.list, {
    stage: stage ?? undefined,
    direction: direction ?? undefined,
    limit: 80,
  });
  const kpis = useQuery(api.prospectingInbox.kpis, {});

  const kpiTiles = [
    { label: 'Sent (30d)', value: kpis?.totals.outboundSent, icon: <ArrowUpRight size={13} /> },
    { label: 'Received (30d)', value: kpis?.totals.inboundReceived, icon: <ArrowDownLeft size={13} /> },
    { label: 'Meetings held', value: kpis?.totals.meetingsHeld, icon: <CalendarCheck size={13} /> },
    { label: 'Meetings upcoming', value: kpis?.totals.meetingsUpcoming, icon: <CalendarClock size={13} /> },
    { label: 'Prospects contacted', value: kpis?.totals.uniqueProspectsContacted, icon: <Users size={13} /> },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-y-auto">
      {/* KPI strip */}
      <div
        className="flex flex-wrap gap-2 px-4 py-3"
        style={{ borderBottom: `1px solid ${colors.border.light}` }}
      >
        {kpiTiles.map((t) => (
          <div
            key={t.label}
            className="flex items-center gap-2 rounded-md px-3 py-2"
            style={{ background: colors.bg.light, border: `1px solid ${colors.border.light}` }}
          >
            <span style={{ color: colors.text.muted }}>{t.icon}</span>
            <span className="text-base font-semibold" style={{ color: colors.text.primary }}>
              {t.value ?? '–'}
            </span>
            <span className="text-xs" style={{ color: colors.text.muted }}>
              {t.label}
            </span>
          </div>
        ))}
      </div>

      {/* Filters: stage chips + direction */}
      <div
        className="flex flex-wrap items-center gap-1.5 px-4 py-2"
        style={{ borderBottom: `1px solid ${colors.border.light}` }}
      >
        {[{ key: null as string | null, label: 'All stages' }, ...STAGES].map((s) => {
          const isActive = stage === s.key;
          return (
            <button
              key={s.key ?? 'all'}
              onClick={() => setStage(s.key)}
              className="px-2.5 py-1 rounded-full text-xs"
              style={{
                color: isActive ? colors.text.primary : colors.text.muted,
                background: isActive ? colors.bg.light : 'transparent',
                border: `1px solid ${isActive ? colors.border.default : colors.border.light}`,
              }}
            >
              {s.label}
            </button>
          );
        })}
        <span className="mx-2" style={{ color: colors.border.default }}>
          |
        </span>
        {([
          { key: null, label: 'Both' },
          { key: 'inbound', label: 'Received' },
          { key: 'outbound', label: 'Sent' },
        ] as const).map((d) => {
          const isActive = direction === d.key;
          return (
            <button
              key={d.key ?? 'both'}
              onClick={() => setDirection(d.key)}
              className="px-2.5 py-1 rounded-full text-xs"
              style={{
                color: isActive ? colors.text.primary : colors.text.muted,
                background: isActive ? colors.bg.light : 'transparent',
                border: `1px solid ${isActive ? colors.border.default : colors.border.light}`,
              }}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      {/* Feed */}
      {data === undefined ? (
        <div className="p-4">
          <SkeletonText lines={8} />
        </div>
      ) : data.rows.length === 0 ? (
        <div className="p-8">
          <EmptyState
            icon={<Mail size={28} />}
            title="No prospect mail in this view"
            body={`Nothing matching these filters in the last ${data.windowDays} days. Inbound appears when a sender matches a prospect contact; outbound when mail goes to one.`}
          />
        </div>
      ) : (
        <div>
          {data.rows.map((row: any) => (
            <button
              key={row.replyEventId ?? row.touchpointId}
              onClick={() => router.push(`/prospects/${row.clientId}`)}
              className="flex w-full flex-col gap-1 px-4 py-3 text-left"
              style={{ borderBottom: `1px solid ${colors.border.light}` }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  style={{
                    color: row.kind === 'inbound' ? colors.accent.green : colors.accent.blue,
                    flexShrink: 0,
                  }}
                  title={row.kind === 'inbound' ? 'Received' : 'Sent'}
                >
                  {row.kind === 'inbound' ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                </span>
                <span className="text-sm font-medium truncate" style={{ color: colors.text.primary }}>
                  {row.clientName}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] flex-shrink-0"
                  style={{
                    color: colors.text.secondary,
                    background: colors.bg.light,
                    border: `1px solid ${colors.border.light}`,
                  }}
                >
                  {stageLabel(row.pipelineStage)}
                </span>
                {row.contactName && (
                  <span className="text-xs truncate" style={{ color: colors.text.muted }}>
                    {row.kind === 'inbound' ? 'from' : 'to'} {row.contactName}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1.5 text-xs flex-shrink-0" style={{ color: colors.text.muted }}>
                  {row.hasAttachments && <Paperclip size={11} />}
                  {timeAgo(row.occurredAt)}
                </span>
              </div>
              <span className="text-xs truncate" style={{ color: colors.text.secondary }}>
                {row.subject || '(no subject)'}
              </span>
              {row.snippet && (
                <span className="text-xs truncate" style={{ color: colors.text.muted }}>
                  {row.snippet}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
