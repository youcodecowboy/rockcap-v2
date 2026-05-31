'use client';

import { Calendar } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { useColors } from '@/lib/useColors';

interface EventItem {
  _id: Id<'events'>;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  location?: string;
  status?: string;
  syncStatus?: string;
  clientId?: Id<'clients'>;
  clientName?: string;
}

interface EventListItemProps {
  event: EventItem;
  onTap: () => void;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function formatTimeRange(startTime: string, endTime: string, allDay?: boolean): string {
  if (allDay) return 'All day';
  const start = new Date(startTime);
  const end = new Date(endTime);
  const fmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function EventListItem({ event, onTap }: EventListItemProps) {
  const colors = useColors();
  const accent = colors.entityTypes.project; // indigo for events
  const isGoogleSynced = event.syncStatus === 'synced';
  const timeLabel = formatTimeRange(event.startTime, event.endTime, event.allDay);

  return (
    <button
      onClick={onTap}
      className="flex items-start gap-3 w-full text-left"
      style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${colors.border.light}`,
        borderLeft: `3px solid ${accent}`,
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      <div className="relative" style={{ marginTop: 2 }}>
        <Calendar size={16} color={accent} style={{ flexShrink: 0 }} />
        {isGoogleSynced && (
          <div
            className="absolute flex items-center justify-center"
            style={{ bottom: -4, right: -4, width: 10, height: 10, borderRadius: 999, background: colors.bg.card }}
          >
            <div style={{ width: 6, height: 6, borderRadius: 999, background: colors.accent.blue }} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.title}
        </div>
        <div className="flex items-center gap-1" style={{ marginTop: 2 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: accent, fontWeight: 500 }}>{timeLabel}</span>
          {event.location && (
            <>
              <span style={{ fontSize: 11, color: colors.text.muted }}>·</span>
              <span style={{ fontSize: 11, color: colors.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {event.location}
              </span>
            </>
          )}
        </div>
        {event.clientName && (
          <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{event.clientName}</div>
        )}
      </div>
    </button>
  );
}

export type { EventItem };
