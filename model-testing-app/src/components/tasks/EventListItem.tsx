'use client';

import { Calendar } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';

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

function formatTimeRange(startTime: string, endTime: string, allDay?: boolean): string {
  if (allDay) return 'All day';
  const start = new Date(startTime);
  const end = new Date(endTime);
  const fmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function EventListItem({ event, onTap }: EventListItemProps) {
  const isGoogleSynced = event.syncStatus === 'synced';
  const timeLabel = formatTimeRange(event.startTime, event.endTime, event.allDay);

  return (
    <button
      onClick={onTap}
      className="flex items-start gap-3 w-full text-left px-4 py-3 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)] border-l-[3px] border-l-indigo-400"
    >
      <div className="relative mt-0.5">
        <Calendar className="w-4 h-4 text-indigo-500 flex-shrink-0" />
        {isGoogleSynced && (
          <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full bg-white flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-[#4285F4]" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-[var(--m-text-primary)] truncate">
          {event.title}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[12px] text-indigo-500 font-medium">{timeLabel}</span>
          {event.location && (
            <>
              <span className="text-[12px] text-[var(--m-text-tertiary)]">·</span>
              <span className="text-[12px] text-[var(--m-text-tertiary)] truncate">{event.location}</span>
            </>
          )}
        </div>
        {event.clientName && (
          <div className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5">{event.clientName}</div>
        )}
      </div>
    </button>
  );
}

export type { EventItem };
