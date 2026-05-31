'use client';

import { useState, useMemo, type CSSProperties } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Calendar, momentLocalizer, View } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Panel, Button } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import EventModal from '@/components/EventModal';
import './calendar.css';

const localizer = momentLocalizer(moment);

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource?: {
    eventId: Id<'events'>;
    description?: string;
    location?: string;
    allDay?: boolean;
    colorId?: string;
  };
}

export default function CalendarPage() {
  const colors = useColors();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<View>('month');
  const [selectedEvent, setSelectedEvent] = useState<Id<'events'> | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [newEventStart, setNewEventStart] = useState<Date | null>(null);
  const [newEventEnd, setNewEventEnd] = useState<Date | null>(null);

  // Calculate date range for querying events
  const dateRange = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    switch (view) {
      case 'month':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        const dayOfWeek = start.getDay();
        start.setDate(start.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case 'day':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'agenda':
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() + 30);
        end.setHours(23, 59, 59, 999);
        break;
    }

    return { start: start.toISOString(), end: end.toISOString() };
  }, [currentDate, view]);

  const events = useQuery(api.events.getByDateRange, {
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  // Transform events for react-big-calendar
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    if (!events) return [];

    return events.map(event => {
      const start = new Date(event.startTime);
      const end = new Date(event.endTime);

      return {
        id: event._id,
        title: event.title,
        start,
        end,
        resource: {
          eventId: event._id,
          description: event.description,
          location: event.location,
          allDay: event.allDay,
          colorId: event.colorId,
        },
      };
    });
  }, [events]);

  const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    setNewEventStart(start);
    setNewEventEnd(end);
    setSelectedEvent(null);
    setIsEventModalOpen(true);
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event.resource!.eventId);
    setIsEventModalOpen(true);
  };

  const handleNavigate = (date: Date) => {
    setCurrentDate(date);
  };

  const handleViewChange = (newView: View) => {
    setView(newView);
  };

  // Tokenize Google Calendar colorIds onto canon accent tones. The grid lib
  // keeps its own layout CSS, but event chips derive their tint from tokens.
  const eventStyleGetter = (event: CalendarEvent) => {
    const colorId = event.resource?.colorId || '1';
    const toneMap: Record<string, string> = {
      '1': colors.accent.blue,
      '2': colors.accent.green,
      '3': colors.accent.purple,
      '4': colors.accent.red,
      '5': colors.accent.yellow,
      '6': colors.accent.orange,
      '7': colors.accent.cyan,
      '8': colors.text.muted,
      '9': colors.accent.indigo,
      '10': colors.accent.green,
      '11': colors.accent.red,
    };
    const tone = toneMap[colorId] || colors.accent.blue;

    return {
      style: {
        backgroundColor: `${tone}20`,
        borderColor: tone,
        borderLeftWidth: '3px',
        borderRadius: '2px',
        color: colors.text.primary,
        fontSize: '12px',
        padding: '2px 4px',
      },
    };
  };

  // CSS variables consumed by calendar.css so the react-big-calendar grid
  // tracks the active theme tokens (the lib's layout CSS stays untouched).
  const calendarVars = {
    '--cal-surface': colors.bg.card,
    '--cal-toolbar-bg': colors.bg.cardAlt,
    '--cal-toolbar-fg': colors.text.primary,
    '--cal-border': colors.border.default,
    '--cal-header-bg': colors.bg.light,
    '--cal-header-fg': colors.text.secondary,
    '--cal-cell-fg': colors.text.secondary,
    '--cal-off-range-bg': colors.bg.light,
    '--cal-off-range-fg': colors.text.dim,
    '--cal-today-bg': `${colors.accent.blue}12`,
    '--cal-accent': colors.accent.blue,
    '--cal-accent-soft': `${colors.accent.blue}1a`,
    '--cal-btn-bg': colors.bg.card,
    '--cal-btn-fg': colors.text.secondary,
    '--cal-btn-border': colors.border.default,
    '--cal-btn-active-bg': colors.accent.blue,
    '--cal-btn-active-fg': '#ffffff',
    '--cal-muted-fg': colors.text.muted,
  } as CSSProperties;

  return (
    <div style={{ minHeight: '100vh', background: colors.bg.light }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Development Banner */}
        <div
          style={{
            marginBottom: 24,
            padding: 12,
            borderRadius: 4,
            background: `${colors.accent.yellow}15`,
            border: `1px solid ${colors.accent.yellow}40`,
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" style={{ color: colors.accent.yellow }} />
            <p style={{ fontSize: 12, color: colors.text.secondary }}>
              <span style={{ fontWeight: 500 }}>In Development</span> — Not all features are fully functional. Google Calendar sync coming soon.
            </p>
          </div>
        </div>

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 300, color: colors.text.primary }}>Calendar</h1>
            <p style={{ marginTop: 6, fontSize: 13, color: colors.text.muted }}>
              Manage your events and schedule
            </p>
          </div>
          <Button
            variant="primary"
            accent={colors.accent.blue}
            onClick={() => {
              setSelectedEvent(null);
              setNewEventStart(null);
              setNewEventEnd(null);
              setIsEventModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            New Event
          </Button>
        </div>

        {/* Calendar */}
        <Panel padded={false}>
          <div className="rbc-canon" style={calendarVars}>
            <Calendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              style={{ height: 700 }}
              view={view}
              onView={handleViewChange}
              date={currentDate}
              onNavigate={handleNavigate}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              selectable
              eventPropGetter={eventStyleGetter}
              popup
              formats={{
                dayFormat: 'ddd M/D',
                dayHeaderFormat: 'dddd M/D',
                monthHeaderFormat: 'MMMM YYYY',
                dayRangeHeaderFormat: ({ start, end }) =>
                  `${moment(start).format('MMM D')} - ${moment(end).format('MMM D, YYYY')}`,
              }}
            />
          </div>
        </Panel>

        {/* Event Modal */}
        {isEventModalOpen && (
          <EventModal
            eventId={selectedEvent || undefined}
            initialStart={newEventStart || undefined}
            initialEnd={newEventEnd || undefined}
            isOpen={isEventModalOpen}
            onClose={() => {
              setIsEventModalOpen(false);
              setSelectedEvent(null);
              setNewEventStart(null);
              setNewEventEnd(null);
            }}
            onSuccess={() => {
              setIsEventModalOpen(false);
              setSelectedEvent(null);
              setNewEventStart(null);
              setNewEventEnd(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
