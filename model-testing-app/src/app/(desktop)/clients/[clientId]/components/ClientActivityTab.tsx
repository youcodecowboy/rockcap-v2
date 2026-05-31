/**
 * ClientActivityTab — desktop port of the mobile per-client ActivityTab.
 *
 * Filter chips (All / Emails / Meetings / Notes / Calls / Tasks) + date-
 * bucketed timeline (Today / Yesterday / This week / Earlier this month /
 * Older). EMAIL filter merges outbound EMAIL + INCOMING_EMAIL for parity
 * with the mobile and global /activity views. Rows are expandable so the
 * user can tap to read the full body without leaving the page.
 */

'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import {
  Activity as ActivityIcon,
  StickyNote, Mail, Video, Phone, CheckSquare,
  ArrowUpRight, ArrowDownLeft,
  ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';
import { Panel, EmptyState, Button, SkeletonText } from '@/components/layouts';
import { useColors } from '@/lib/useColors';

type FilterKey = 'all' | 'EMAIL' | 'MEETING' | 'NOTE' | 'CALL' | 'TASK';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** Per-type icon + accent token key. Tints resolve against useColors(). */
const TYPE_TILE: Record<string, { tone: keyof ReturnType<typeof useColors>['accent']; Icon: any; label: string }> = {
  NOTE: { tone: 'purple', Icon: StickyNote, label: 'Note' },
  EMAIL: { tone: 'orange', Icon: Mail, label: 'Email' },
  INCOMING_EMAIL: { tone: 'green', Icon: Mail, label: 'Email' },
  MEETING: { tone: 'blue', Icon: Video, label: 'Meeting' },
  CALL: { tone: 'yellow', Icon: Phone, label: 'Call' },
  TASK: { tone: 'orange', Icon: CheckSquare, label: 'Task' },
};

function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

type Bucket = 'Today' | 'Yesterday' | 'This week' | 'Earlier this month' | 'Older';

function bucketOf(iso?: string): Bucket {
  if (!iso) return 'Older';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 'Older';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 30) return 'Earlier this month';
  return 'Older';
}

function stripHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function ActivityRow({ activity, last }: { activity: any; last: boolean }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const tile = TYPE_TILE[activity.activityType] ?? TYPE_TILE.NOTE;
  const Icon = tile.Icon;
  const tint = colors.accent[tile.tone];
  const isEmail = activity.activityType === 'EMAIL' || activity.activityType === 'INCOMING_EMAIL';
  const direction = activity.direction;
  const dirTint = direction === 'outbound' ? colors.accent.orange : colors.accent.green;
  const fullBody =
    stripHtml(activity.bodyHtml) || activity.body || activity.bodyPreview || '';
  const hasMore =
    fullBody.length > 0 && fullBody.length > (activity.bodyPreview?.length ?? 0) + 20;

  return (
    <div
      style={{
        cursor: 'pointer',
        borderBottom: last ? 'none' : `1px solid ${colors.border.light}`,
      }}
      onClick={() => setExpanded((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setExpanded((v) => !v);
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12 }}>
        <div
          style={{
            width: 34, height: 34, borderRadius: 4, flexShrink: 0, position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${tint}15`, border: `1px solid ${tint}40`,
          }}
        >
          <Icon size={15} style={{ color: tint }} />
          {isEmail && direction ? (
            <div
              style={{
                position: 'absolute', bottom: -3, right: -3, width: 14, height: 14, borderRadius: 999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: dirTint, border: `2px solid ${colors.bg.card}`,
              }}
            >
              {direction === 'outbound' ? (
                <ArrowUpRight size={8} style={{ color: '#ffffff' }} />
              ) : (
                <ArrowDownLeft size={8} style={{ color: '#ffffff' }} />
              )}
            </div>
          ) : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 11, color: colors.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ fontWeight: 500, color: colors.text.secondary }}>{tile.label}</span>
              {direction ? ` · ${direction}` : ''}
              {activity.ownerName ? ` · ${activity.ownerName}` : ''}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: colors.text.muted, whiteSpace: 'nowrap' }}>
              {fmtTime(activity.activityDate)}
            </div>
          </div>
          {activity.subject ? (
            <div
              style={{
                fontSize: 13, fontWeight: 500, color: colors.text.primary, marginTop: 2,
                overflow: expanded ? undefined : 'hidden',
                textOverflow: expanded ? undefined : 'ellipsis',
                whiteSpace: expanded ? undefined : 'nowrap',
              }}
            >
              {activity.subject}
            </div>
          ) : null}
          {expanded && fullBody ? (
            <div style={{ fontSize: 12, color: colors.text.secondary, whiteSpace: 'pre-wrap', marginTop: 6, lineHeight: 1.6 }}>
              {fullBody}
            </div>
          ) : activity.bodyPreview ? (
            <div
              style={{
                fontSize: 12, color: colors.text.muted, marginTop: 2,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}
            >
              {activity.bodyPreview}
            </div>
          ) : null}

          {hasMore && !expanded ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: colors.text.muted, marginTop: 6, fontWeight: 500 }}>
              <ChevronDown size={12} />
              Read more
            </span>
          ) : null}
          {expanded ? (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 8, borderTop: `1px solid ${colors.border.light}` }}
              onClick={(e) => e.stopPropagation()}
            >
              {activity.hubspotUrl ? (
                <a
                  href={activity.hubspotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: colors.accent.blue, textDecoration: 'none' }}
                >
                  Open in HubSpot
                  <ExternalLink size={12} />
                </a>
              ) : null}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: colors.text.muted }}>
                <ChevronUp size={12} />
                Collapse
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface Props {
  clientId: Id<'clients'>;
}

export default function ClientActivityTab({ clientId }: Props) {
  const colors = useColors();
  const [filter, setFilter] = useState<FilterKey>('all');

  // Always query outbound/all; query INCOMING_EMAIL separately when filter=EMAIL.
  // Same refactored pattern as the mobile ActivityTab (from Task C.2 of Plan 2).
  const outboundOrAll = useQuery(
    api.activities.listForClient,
    filter === 'all'
      ? { clientId, limit: 200 }
      : { clientId, typeFilter: filter === 'EMAIL' ? 'EMAIL' : filter, limit: 200 },
  );
  const incomingEmails = useQuery(
    api.activities.listForClient,
    filter === 'EMAIL' ? { clientId, typeFilter: 'INCOMING_EMAIL', limit: 200 } : 'skip',
  );

  const loading = outboundOrAll === undefined;
  const all =
    filter === 'EMAIL' && incomingEmails
      ? [...(outboundOrAll ?? []), ...incomingEmails]
      : outboundOrAll ?? [];

  const sorted = useMemo(
    () =>
      all.slice().sort((a: any, b: any) =>
        (b.activityDate ?? '').localeCompare(a.activityDate ?? ''),
      ),
    [all],
  );

  const grouped = useMemo(() => {
    const m = new Map<Bucket, any[]>();
    for (const b of ['Today', 'Yesterday', 'This week', 'Earlier this month', 'Older'] as Bucket[]) {
      m.set(b, []);
    }
    for (const a of sorted) m.get(bucketOf(a.activityDate))!.push(a);
    return m;
  }, [sorted]);

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: `All · ${sorted.length}` },
    { key: 'EMAIL', label: 'Emails' },
    { key: 'MEETING', label: 'Meetings' },
    { key: 'NOTE', label: 'Notes' },
    { key: 'CALL', label: 'Calls' },
    { key: 'TASK', label: 'Tasks' },
  ];

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 36, height: 36, borderRadius: 4,
            background: `${colors.entityTypes.client}15`,
            border: `1px solid ${colors.entityTypes.client}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ActivityIcon size={16} style={{ color: colors.entityTypes.client }} />
        </div>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary }}>Activity</h2>
          <p style={{ fontSize: 12, color: colors.text.muted }}>
            HubSpot engagements linked to this client's companies
          </p>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'primary' : 'secondary'}
            accent={colors.entityTypes.client}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <Panel>
          <SkeletonText lines={6} />
        </Panel>
      ) : sorted.length === 0 ? (
        <EmptyState icon={<ActivityIcon size={20} />} title="No activity yet" />
      ) : (
        <div className="space-y-5">
          {(['Today', 'Yesterday', 'This week', 'Earlier this month', 'Older'] as Bucket[]).map(
            (bucket) => {
              const rows = grouped.get(bucket) ?? [];
              if (rows.length === 0) return null;
              return (
                <section key={bucket} className="space-y-2">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
                    <h3 style={{ fontFamily: MONO, fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>
                      {bucket}
                    </h3>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: colors.text.muted }}>
                      · {rows.length}
                    </span>
                  </div>
                  <Panel padded={false}>
                    {rows.map((a: any, i: number) => (
                      <ActivityRow key={a._id} activity={a} last={i === rows.length - 1} />
                    ))}
                  </Panel>
                </section>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
