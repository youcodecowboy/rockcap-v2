/**
 * Global Activity Stream — /activity on desktop.
 *
 * A "pulse of the company" feed that merges HubSpot-synced activity
 * (emails, meetings, calls, notes, tasks) across the whole organization.
 * Filter chips narrow by type; rows deep-link to the linked client profile.
 *
 * For the MVP, the feed is backed solely by the `activities` table. A
 * future iteration can merge in-app signals (new documents filed, flags
 * raised, tasks completed) to widen the "pulse".
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import {
  Activity as ActivityIcon,
  StickyNote, Mail, Video, Phone, CheckSquare,
  ArrowUpRight, ArrowDownLeft,
  ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';
import {
  Panel,
  StatTile,
  EmptyState,
  Button,
  SkeletonText,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

type FilterKey = 'all' | 'EMAIL' | 'MEETING' | 'NOTE' | 'CALL' | 'TASK';

// Maps each HubSpot activity type onto a canon accent token + icon + label.
function typeTile(colors: ColorPalette): Record<string, { tint: string; Icon: any; label: string }> {
  return {
    NOTE: { tint: colors.accent.purple, Icon: StickyNote, label: 'Note' },
    EMAIL: { tint: colors.accent.orange, Icon: Mail, label: 'Email' },
    INCOMING_EMAIL: { tint: colors.accent.green, Icon: Mail, label: 'Email' },
    MEETING: { tint: colors.accent.blue, Icon: Video, label: 'Meeting' },
    CALL: { tint: colors.accent.yellow, Icon: Phone, label: 'Call' },
    TASK: { tint: colors.accent.orange, Icon: CheckSquare, label: 'Task' },
  };
}

function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

type Bucket = 'Today' | 'Yesterday' | 'This week' | 'Earlier this month' | 'Older';

/**
 * HTML-to-text for activity bodies. HubSpot emails come in as bodyHtml with
 * <p>, <br>, anchor tags, inline styles, etc. We strip to plain text for
 * this reading view — rich rendering is a future enhancement.
 */
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

/**
 * Expandable activity row — click the row to toggle the full body / metadata.
 * The "Open client" affordance lives inside the expanded detail so the
 * whole row is free to be a click target. Also shows "Open in HubSpot" when
 * the activity has a hubspotUrl.
 */
function ActivityRow({ activity }: { activity: any }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState(false);

  const tiles = typeTile(colors);
  const tile = tiles[activity.activityType] ?? tiles.NOTE;
  const Icon = tile.Icon;
  const isEmail =
    activity.activityType === 'EMAIL' || activity.activityType === 'INCOMING_EMAIL';
  const direction = activity.direction;
  const fullBody =
    stripHtml(activity.bodyHtml) ||
    activity.body ||
    activity.bodyPreview ||
    '';
  const hasMore =
    fullBody.length > 0 &&
    fullBody.length > (activity.bodyPreview?.length ?? 0) + 20;

  return (
    <div
      onClick={() => setExpanded((v) => !v)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setExpanded((v) => !v);
        }
      }}
      style={{
        cursor: 'pointer',
        background: hover ? colors.bg.cardAlt : 'transparent',
        transition: 'background 100ms linear',
      }}
    >
      <div className="flex items-start gap-3" style={{ padding: 12 }}>
        <div
          className="flex items-center justify-center shrink-0 relative"
          style={{
            width: 34,
            height: 34,
            borderRadius: 4,
            background: `${tile.tint}15`,
            border: `1px solid ${tile.tint}40`,
          }}
        >
          <Icon className="w-4 h-4" style={{ color: tile.tint }} />
          {isEmail && direction ? (
            <div
              className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center"
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                border: `2px solid ${colors.bg.card}`,
                backgroundColor: direction === 'outbound' ? colors.accent.orange : colors.accent.green,
              }}
            >
              {direction === 'outbound' ? (
                <ArrowUpRight className="w-2 h-2" style={{ color: '#fff' }} />
              ) : (
                <ArrowDownLeft className="w-2 h-2" style={{ color: '#fff' }} />
              )}
            </div>
          ) : null}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate" style={{ fontSize: 11, color: colors.text.muted }}>
              <span style={{ fontWeight: 500, color: colors.text.secondary }}>{tile.label}</span>
              {direction ? ` · ${direction}` : ''}
              {activity.ownerName ? ` · ${activity.ownerName}` : ''}
              {activity.companyName ? ` · ${activity.companyName}` : ''}
            </p>
            <p
              className="whitespace-nowrap"
              style={{ fontFamily: MONO, fontSize: 10, color: colors.text.dim }}
            >
              {fmtTime(activity.activityDate)}
            </p>
          </div>
          {activity.subject ? (
            <p
              className={expanded ? '' : 'truncate'}
              style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, marginTop: 2 }}
            >
              {activity.subject}
            </p>
          ) : null}
          {/* Preview (collapsed) or full body (expanded) */}
          {expanded && fullBody ? (
            <p
              className="whitespace-pre-wrap"
              style={{ fontSize: 12, color: colors.text.secondary, marginTop: 6, lineHeight: 1.6 }}
            >
              {fullBody}
            </p>
          ) : activity.bodyPreview ? (
            <p className="line-clamp-2" style={{ fontSize: 12, color: colors.text.muted, marginTop: 2 }}>
              {activity.bodyPreview}
            </p>
          ) : null}

          {/* Expanded detail row: link-out affordances + expand/collapse chevron */}
          {(hasMore || activity.hubspotUrl || activity.clientId) && expanded ? (
            <div
              className="flex items-center gap-3"
              style={{ marginTop: 12, paddingTop: 8, borderTop: `1px solid ${colors.border.light}` }}
              // Stop clicks on the affordances from collapsing the row again.
              onClick={(e) => e.stopPropagation()}
            >
              {activity.clientId ? (
                <Link
                  href={`/clients/${activity.clientId}`}
                  className="inline-flex items-center gap-1"
                  style={{ fontSize: 11, fontWeight: 500, color: colors.accent.blue }}
                >
                  Open client
                  <ChevronUp className="w-3 h-3 rotate-45" />
                </Link>
              ) : null}
              {activity.hubspotUrl ? (
                <a
                  href={activity.hubspotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1"
                  style={{ fontSize: 11, fontWeight: 500, color: colors.accent.blue }}
                >
                  Open in HubSpot
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : null}
              <span
                className="ml-auto inline-flex items-center gap-1"
                style={{ fontSize: 11, color: colors.text.muted }}
              >
                <ChevronUp className="w-3 h-3" />
                Collapse
              </span>
            </div>
          ) : null}

          {/* Collapsed-state hint if there's more to see */}
          {hasMore && !expanded ? (
            <span
              className="inline-flex items-center gap-1"
              style={{ fontSize: 10, color: colors.text.muted, marginTop: 6, fontWeight: 500 }}
            >
              <ChevronDown className="w-3 h-3" />
              Read more
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function bucketOf(iso?: string): Bucket {
  if (!iso) return 'Older';
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 'Older';
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 30) return 'Earlier this month';
  return 'Older';
}

export default function GlobalActivityPage() {
  const colors = useColors();
  const [filter, setFilter] = useState<FilterKey>('all');

  // Always fetch outbound/all in one query, and incoming emails in a second
  // when the user is filtering to EMAIL. Same pattern as the mobile Activity
  // tab — HubSpot treats EMAIL (outbound) and INCOMING_EMAIL as separate
  // activityTypes, and the filter UI collapses them into one.
  const outboundOrAll = useQuery(
    api.activities.listRecentGlobal,
    filter === 'all'
      ? { limit: 200 }
      : {
          limit: 200,
          typeFilter: filter === 'EMAIL' ? 'EMAIL' : filter,
        },
  );
  const incomingEmails = useQuery(
    api.activities.listRecentGlobal,
    filter === 'EMAIL' ? { limit: 100, typeFilter: 'INCOMING_EMAIL' } : 'skip',
  );

  const loading = outboundOrAll === undefined;
  const items = outboundOrAll ?? [];
  const all =
    filter === 'EMAIL' && incomingEmails
      ? [...items, ...incomingEmails]
      : items;

  const sorted = all
    .slice()
    .sort((a: any, b: any) =>
      (b.activityDate ?? '').localeCompare(a.activityDate ?? ''),
    );

  // Group by bucket — insertion-ordered Map to preserve display order.
  const grouped = new Map<Bucket, any[]>();
  for (const b of ['Today', 'Yesterday', 'This week', 'Earlier this month', 'Older'] as Bucket[]) {
    grouped.set(b, []);
  }
  for (const a of sorted) {
    const b = bucketOf(a.activityDate);
    grouped.get(b)!.push(a);
  }

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: `All · ${sorted.length}` },
    { key: 'EMAIL', label: 'Emails' },
    { key: 'MEETING', label: 'Meetings' },
    { key: 'NOTE', label: 'Notes' },
    { key: 'CALL', label: 'Calls' },
    { key: 'TASK', label: 'Tasks' },
  ];

  // Summary counts by canonical type for the StatTile row.
  const countOf = (type: FilterKey) =>
    sorted.filter((a: any) =>
      type === 'EMAIL'
        ? a.activityType === 'EMAIL' || a.activityType === 'INCOMING_EMAIL'
        : a.activityType === type,
    ).length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center"
          style={{
            width: 34,
            height: 34,
            borderRadius: 4,
            background: colors.bg.cardAlt,
            border: `1px solid ${colors.border.default}`,
          }}
        >
          <ActivityIcon className="w-4 h-4" style={{ color: colors.text.secondary }} />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 300, color: colors.text.primary }}>Activity</h1>
          <p style={{ fontSize: 13, color: colors.text.muted }}>
            Unified feed of everything happening across the company — HubSpot
            engagements, activity, and CRM changes.
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      {!loading && sorted.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 1,
            background: colors.border.default,
            border: `1px solid ${colors.border.default}`,
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <StatTile label="Total" value={sorted.length} accent={colors.text.muted} />
          <StatTile label="Emails" value={countOf('EMAIL')} accent={colors.accent.orange} />
          <StatTile label="Meetings" value={countOf('MEETING')} accent={colors.accent.blue} />
          <StatTile label="Notes" value={countOf('NOTE')} accent={colors.accent.purple} />
          <StatTile label="Calls" value={countOf('CALL')} accent={colors.accent.yellow} />
          <StatTile label="Tasks" value={countOf('TASK')} accent={colors.accent.orange} />
        </div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Button
              key={f.key}
              variant={active ? 'primary' : 'secondary'}
              size="sm"
              accent={colors.accent.blue}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-2">
          <SkeletonText />
          <SkeletonText />
          <SkeletonText />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={<ActivityIcon className="w-10 h-10" />} title="No activity yet" />
      ) : (
        <div className="space-y-6">
          {(['Today', 'Yesterday', 'This week', 'Earlier this month', 'Older'] as Bucket[]).map(
            (bucket) => {
              const rows = grouped.get(bucket) ?? [];
              if (rows.length === 0) return null;
              return (
                <Panel key={bucket} title={`${bucket} · ${rows.length}`} padded={false}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {rows.map((a: any, idx: number) => (
                      <div
                        key={a._id}
                        style={idx > 0 ? { borderTop: `1px solid ${colors.border.light}` } : undefined}
                      >
                        <ActivityRow activity={a} />
                      </div>
                    ))}
                  </div>
                </Panel>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
