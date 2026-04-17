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
  ArrowUpRight, ArrowDownLeft, User, Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type FilterKey = 'all' | 'EMAIL' | 'MEETING' | 'NOTE' | 'CALL' | 'TASK';

const TYPE_TILE: Record<string, { bg: string; tint: string; Icon: any; label: string }> = {
  NOTE: { bg: '#f3e8ff', tint: '#9333ea', Icon: StickyNote, label: 'Note' },
  EMAIL: { bg: '#ffedd5', tint: '#ea580c', Icon: Mail, label: 'Email' },
  INCOMING_EMAIL: { bg: '#dcfce7', tint: '#059669', Icon: Mail, label: 'Email' },
  MEETING: { bg: '#dbeafe', tint: '#2563eb', Icon: Video, label: 'Meeting' },
  CALL: { bg: '#fef3c7', tint: '#d97706', Icon: Phone, label: 'Call' },
  TASK: { bg: '#ffedd5', tint: '#ea580c', Icon: CheckSquare, label: 'Task' },
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

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
          <ActivityIcon className="w-4 h-4 text-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground">
            Unified feed of everything happening across the company — HubSpot
            engagements, activity, and CRM changes.
          </p>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Button
              key={f.key}
              variant={active ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f.key)}
              className="h-7 text-xs"
            >
              {f.label}
            </Button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No activity yet
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {(['Today', 'Yesterday', 'This week', 'Earlier this month', 'Older'] as Bucket[]).map(
            (bucket) => {
              const rows = grouped.get(bucket) ?? [];
              if (rows.length === 0) return null;
              return (
                <section key={bucket} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {bucket}
                    </h2>
                    <span className="text-[10px] text-muted-foreground">
                      · {rows.length}
                    </span>
                  </div>
                  <Card>
                    <CardContent className="p-0 divide-y divide-border">
                      {rows.map((a: any) => {
                        const tile = TYPE_TILE[a.activityType] ?? TYPE_TILE.NOTE;
                        const Icon = tile.Icon;
                        const isEmail =
                          a.activityType === 'EMAIL' || a.activityType === 'INCOMING_EMAIL';
                        const direction = a.direction;

                        const RowContent = (
                          <div className="flex items-start gap-3 p-3 hover:bg-muted/40 transition-colors">
                            <div
                              className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 relative"
                              style={{ backgroundColor: tile.bg }}
                            >
                              <Icon className="w-4 h-4" style={{ color: tile.tint }} />
                              {isEmail && direction ? (
                                <div
                                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 border-background"
                                  style={{
                                    backgroundColor:
                                      direction === 'outbound' ? '#ea580c' : '#059669',
                                  }}
                                >
                                  {direction === 'outbound' ? (
                                    <ArrowUpRight className="w-2 h-2 text-white" />
                                  ) : (
                                    <ArrowDownLeft className="w-2 h-2 text-white" />
                                  )}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="text-[11px] text-muted-foreground truncate">
                                  <span className="font-medium text-foreground/70">
                                    {tile.label}
                                  </span>
                                  {direction ? ` · ${direction}` : ''}
                                  {a.ownerName ? ` · ${a.ownerName}` : ''}
                                  {a.companyName ? ` · ${a.companyName}` : ''}
                                </p>
                                <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {fmtTime(a.activityDate)}
                                </p>
                              </div>
                              {a.subject ? (
                                <p className="text-sm font-medium text-foreground truncate mt-0.5">
                                  {a.subject}
                                </p>
                              ) : null}
                              {a.bodyPreview ? (
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                  {a.bodyPreview}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );

                        // Link to the client profile when we can resolve one,
                        // otherwise render a non-interactive row.
                        return a.clientId ? (
                          <Link key={a._id} href={`/clients/${a.clientId}`}>
                            {RowContent}
                          </Link>
                        ) : (
                          <div key={a._id}>{RowContent}</div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </section>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
