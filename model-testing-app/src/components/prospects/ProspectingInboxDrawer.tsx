'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useColors } from '@/lib/useColors';
import { EmptyState, SkeletonText, StatusPill } from '@/components/layouts';
import EmailViewer from '@/app/(desktop)/inbox/components/EmailViewer';
import EmailAttachmentStrip from '@/components/EmailAttachmentStrip';
import {
  X,
  Mail,
  ArrowUpRight,
  ArrowDownLeft,
  Paperclip,
  Users,
  CalendarCheck,
  CalendarClock,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

// Prospecting inbox drawer — near-full-screen overlay opened from the
// /prospects header. The full experience in one surface: KPI strip +
// per-operator line, stage/direction filters, the org-wide both-direction
// feed on the left, and a reading pane on the right (rendered HTML email +
// attachment chips for inbound; excerpt + Gmail link for outbound, whose
// bodies the ledger deliberately never stores). Poll freshness in the
// header — trust starts with "when did we last look".

const STAGES: Array<{ key: string; label: string }> = [
  { key: 'cold_outreach', label: 'Cold' },
  { key: 'warm_pre_meeting', label: 'Warm · pre-meeting' },
  { key: 'warm_post_meeting', label: 'Warm · post-meeting' },
  { key: 'pre_qualification', label: 'Pre-qual' },
  { key: 'qualified', label: 'Qualified' },
];

const INTENT_LABELS: Record<string, { label: string; tone: 'green' | 'red' | 'orange' | 'blue' | 'muted' }> = {
  book_meeting: { label: 'Wants meeting', tone: 'green' },
  positive: { label: 'Positive', tone: 'green' },
  not_interested: { label: 'Not interested', tone: 'red' },
  defer_long_term: { label: 'Defer', tone: 'orange' },
  info_question: { label: 'Question', tone: 'blue' },
  out_of_office: { label: 'Out of office', tone: 'muted' },
  unknown: { label: 'Unclassified', tone: 'muted' },
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function stageLabel(stage?: string): string {
  return STAGES.find((s) => s.key === stage)?.label ?? 'Unstaged';
}

export default function ProspectingInboxDrawer({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  const router = useRouter();
  const [stage, setStage] = useState<string | null>(null);
  const [direction, setDirection] = useState<'inbound' | 'outbound' | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const data = useQuery(api.prospectingInbox.list, {
    stage: stage ?? undefined,
    direction: direction ?? undefined,
    limit: 100,
  });
  const kpis = useQuery(api.prospectingInbox.kpis, {});
  const pollStatus = useQuery(api.prospectingInbox.pollStatus, {});

  // ESC closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const selected = useMemo(
    () => data?.rows.find((r: any) => (r.replyEventId ?? r.touchpointId) === selectedKey) ?? null,
    [data, selectedKey],
  );

  const freshest = useMemo(() => {
    const ok = (pollStatus ?? []).filter((p: any) => !p.needsReconnect && p.lastSyncAt);
    if (ok.length === 0) return null;
    return ok.map((p: any) => p.lastSyncAt).sort().reverse()[0];
  }, [pollStatus]);
  const needsReconnect = (pollStatus ?? []).filter((p: any) => p.needsReconnect);

  const kpiTiles = [
    { label: 'Sent (30d)', value: kpis?.totals.outboundSent, icon: <ArrowUpRight size={13} /> },
    { label: 'Received (30d)', value: kpis?.totals.inboundReceived, icon: <ArrowDownLeft size={13} /> },
    { label: 'Meetings held', value: kpis?.totals.meetingsHeld, icon: <CalendarCheck size={13} /> },
    { label: 'Upcoming', value: kpis?.totals.meetingsUpcoming, icon: <CalendarClock size={13} /> },
    { label: 'Prospects contacted', value: kpis?.totals.uniqueProspectsContacted, icon: <Users size={13} /> },
  ];

  const chip = (isActive: boolean) => ({
    color: isActive ? colors.text.primary : colors.text.muted,
    background: isActive ? colors.bg.light : 'transparent',
    border: `1px solid ${isActive ? colors.border.default : colors.border.light}`,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col m-4 flex-1 rounded-lg overflow-hidden shadow-2xl"
        style={{ background: colors.bg.base, border: `1px solid ${colors.border.default}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: `1px solid ${colors.border.default}` }}
        >
          <Mail size={16} style={{ color: colors.entityTypes?.prospect ?? colors.accent.blue }} />
          <h2 className="text-base font-semibold" style={{ color: colors.text.primary }}>
            Prospects Inbox
          </h2>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: colors.text.muted }}>
            <RefreshCw size={11} />
            {freshest ? `last polled ${timeAgo(freshest)} ago` : 'no healthy mailbox connection'}
            <span title="The Gmail poller runs every 5 minutes across all connected mailboxes">·  5-min cron</span>
          </span>
          {needsReconnect.length > 0 && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: colors.accent.orange }}
              title={needsReconnect.map((p: any) => p.email).join(', ')}
            >
              <AlertTriangle size={11} />
              {needsReconnect.length} mailbox{needsReconnect.length > 1 ? 'es' : ''} need reconnect
            </span>
          )}
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-md"
            style={{ color: colors.text.muted, border: `1px solid ${colors.border.light}` }}
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        {/* KPI strip + operator line */}
        <div
          className="flex flex-wrap items-center gap-2 px-5 py-2.5"
          style={{ borderBottom: `1px solid ${colors.border.light}` }}
        >
          {kpiTiles.map((t) => (
            <div
              key={t.label}
              className="flex items-center gap-2 rounded-md px-3 py-1.5"
              style={{ background: colors.bg.light, border: `1px solid ${colors.border.light}` }}
            >
              <span style={{ color: colors.text.muted }}>{t.icon}</span>
              <span className="text-sm font-semibold" style={{ color: colors.text.primary }}>
                {t.value ?? '–'}
              </span>
              <span className="text-xs" style={{ color: colors.text.muted }}>
                {t.label}
              </span>
            </div>
          ))}
          {kpis?.byOperator && Object.keys(kpis.byOperator).length > 0 && (
            <div className="flex flex-wrap gap-x-4 text-xs ml-2" style={{ color: colors.text.muted }}>
              {Object.entries(kpis.byOperator as Record<string, any>).map(([name, b]) => (
                <span key={name}>
                  <span style={{ color: colors.text.secondary, fontWeight: 600 }}>{name.split(' ')[0]}</span>: {b.outboundSent}↑ {b.inboundReceived}↓
                  {b.meetingsHeld + b.meetingsUpcoming > 0 ? ` ${b.meetingsHeld + b.meetingsUpcoming}mtg` : ''}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
        <div
          className="flex flex-wrap items-center gap-1.5 px-5 py-2"
          style={{ borderBottom: `1px solid ${colors.border.light}` }}
        >
          {[{ key: null as string | null, label: 'All stages' }, ...STAGES].map((s) => (
            <button
              key={s.key ?? 'all'}
              onClick={() => setStage(s.key)}
              className="px-2.5 py-1 rounded-full text-xs"
              style={chip(stage === s.key)}
            >
              {s.label}
            </button>
          ))}
          <span className="mx-2" style={{ color: colors.border.default }}>
            |
          </span>
          {([
            { key: null, label: 'Both' },
            { key: 'inbound', label: 'Received' },
            { key: 'outbound', label: 'Sent' },
          ] as const).map((d) => (
            <button
              key={d.key ?? 'both'}
              onClick={() => setDirection(d.key)}
              className="px-2.5 py-1 rounded-full text-xs"
              style={chip(direction === d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Two panes */}
        <div className="flex flex-1 min-h-0">
          {/* Feed */}
          <div
            className="w-[400px] flex-shrink-0 overflow-y-auto"
            style={{ borderRight: `1px solid ${colors.border.default}`, background: colors.bg.light }}
          >
            {data === undefined ? (
              <div className="p-4">
                <SkeletonText lines={10} />
              </div>
            ) : data.rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Mail size={24} />}
                  title="Nothing here"
                  body={`No prospect mail matching these filters in the last ${data.windowDays} days.`}
                />
              </div>
            ) : (
              data.rows.map((row: any) => {
                const key = row.replyEventId ?? row.touchpointId;
                const isActive = key === selectedKey;
                const intent = row.classifiedIntent ? INTENT_LABELS[row.classifiedIntent] : null;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    className="flex w-full flex-col gap-1 px-4 py-3 text-left"
                    style={{
                      background: isActive ? colors.bg.base : 'transparent',
                      borderBottom: `1px solid ${colors.border.light}`,
                      borderLeft: `2px solid ${isActive ? colors.accent.blue : 'transparent'}`,
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        style={{ color: row.kind === 'inbound' ? colors.accent.green : colors.accent.blue, flexShrink: 0 }}
                      >
                        {row.kind === 'inbound' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                      </span>
                      <span className="text-sm font-medium truncate" style={{ color: colors.text.primary }}>
                        {row.clientName}
                      </span>
                      <span className="ml-auto flex items-center gap-1.5 text-xs flex-shrink-0" style={{ color: colors.text.muted }}>
                        {row.hasAttachments && <Paperclip size={11} />}
                        {timeAgo(row.occurredAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] flex-shrink-0"
                        style={{
                          color: colors.text.secondary,
                          background: colors.bg.cardAlt ?? colors.bg.base,
                          border: `1px solid ${colors.border.light}`,
                        }}
                      >
                        {stageLabel(row.pipelineStage)}
                      </span>
                      {row.operatorName && (
                        <span className="text-[10px] flex-shrink-0" style={{ color: colors.accent.blue }}>
                          {row.kind === 'inbound' ? '→ ' : 'by '}
                          {row.operatorName.split(' ')[0]}
                        </span>
                      )}
                      {intent && (
                        <span
                          className="text-[10px] flex-shrink-0"
                          style={{
                            color:
                              intent.tone === 'muted'
                                ? colors.text.muted
                                : colors.accent[intent.tone as 'green' | 'red' | 'orange' | 'blue'],
                          }}
                        >
                          {intent.label}
                        </span>
                      )}
                      <span className="text-xs truncate" style={{ color: colors.text.secondary }}>
                        {row.subject || '(no subject)'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Reading pane */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {selected ? (
              <ReadingPane
                row={selected}
                onOpenProspect={(clientId: string) => {
                  onClose();
                  router.push(`/prospects/${clientId}`);
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <EmptyState
                  icon={<Mail size={26} />}
                  title="Select an email"
                  body="Pick a row to read it — inbound renders in full; outbound shows the tracked excerpt."
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadingPane({
  row,
  onOpenProspect,
}: {
  row: any;
  onOpenProspect: (clientId: string) => void;
}) {
  const colors = useColors();
  const detail = useQuery(
    api.prospectingInbox.detail,
    row.replyEventId
      ? { replyEventId: row.replyEventId }
      : row.touchpointId
        ? { touchpointId: row.touchpointId }
        : 'skip',
  );
  const intent = row.classifiedIntent ? INTENT_LABELS[row.classifiedIntent] : null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold truncate" style={{ color: colors.text.primary }}>
              {row.subject || '(no subject)'}
            </h3>
            <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
              {row.kind === 'inbound' ? (
                <>
                  From <span style={{ color: colors.text.primary }}>{detail?.fromName || row.contactName || row.counterpartyEmail}</span>
                  {detail?.fromEmail && <span style={{ color: colors.text.muted }}> · {detail.fromEmail}</span>}
                  {row.operatorName && <span style={{ color: colors.text.muted }}> · received in {row.operatorName.split(' ')[0]}&apos;s inbox</span>}
                </>
              ) : (
                <>
                  To <span style={{ color: colors.text.primary }}>{row.contactName || row.counterpartyEmail}</span>
                  {row.operatorName && <span style={{ color: colors.text.muted }}> · sent by {row.operatorName.split(' ')[0]}</span>}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {intent && (
              <StatusPill
                label={intent.label}
                tone={
                  intent.tone === 'muted'
                    ? colors.text.muted
                    : colors.accent[intent.tone as 'green' | 'red' | 'orange' | 'blue']
                }
              />
            )}
            <span className="text-xs" style={{ color: colors.text.muted }}>
              {new Date(row.occurredAt).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
        <button
          onClick={() => onOpenProspect(row.clientId)}
          className="mt-2 inline-flex items-center gap-1 text-xs"
          style={{ color: colors.accent.blue }}
        >
          {row.clientName} · {stageLabel(row.pipelineStage)}
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {row.kind === 'inbound' ? (
        <>
          {detail && (detail.attachments ?? []).some((a: any) => !a.inline) && (
            <div className="px-6 py-3" style={{ borderBottom: `1px solid ${colors.border.light}` }}>
              <EmailAttachmentStrip
                replyEventId={detail.replyEventId}
                attachments={detail.attachments}
                gmailFallbackUrl={detail.rawMessageRef}
              />
            </div>
          )}
          <div className="flex-1 px-6 py-4 overflow-y-auto">
            {detail === undefined ? (
              <SkeletonText lines={8} />
            ) : detail === null ? (
              <span className="text-sm" style={{ color: colors.text.muted }}>
                Email not found.
              </span>
            ) : (
              <EmailViewer html={detail.bodyHtml} text={detail.bodyText} />
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 px-6 py-4 overflow-y-auto">
          {detail === undefined ? (
            <SkeletonText lines={6} />
          ) : detail && (detail.bodyHtml || detail.bodyText) ? (
            <EmailViewer html={detail.bodyHtml} text={detail.bodyText} />
          ) : row.snippet ? (
            <p className="text-sm whitespace-pre-wrap" style={{ color: colors.text.primary, lineHeight: 1.65 }}>
              {row.snippet}
              {row.snippet.length >= 160 ? '…' : ''}
            </p>
          ) : (
            <p className="text-sm" style={{ color: colors.text.muted }}>
              No body captured for this send.
            </p>
          )}
          <p className="text-xs mt-4" style={{ color: colors.text.muted }}>
            <a
              href={
                row.threadId
                  ? `https://mail.google.com/mail/u/0/#all/${row.threadId}`
                  : 'https://mail.google.com/mail/u/0/#sent'
              }
              target="_blank"
              rel="noreferrer"
              style={{ color: colors.accent.blue, textDecoration: 'underline' }}
            >
              Open the thread in Gmail
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
