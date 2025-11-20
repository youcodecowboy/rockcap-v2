'use client';

import { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, Plus } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { Calendar, momentLocalizer, View } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Button } from '@/components/ui/button';
import EventModal from '@/components/EventModal';

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

  const eventStyleGetter = (event: CalendarEvent) => {
    const colorId = event.resource?.colorId || '1';
    // Google Calendar color mapping (simplified)
    const colors: Record<string, { backgroundColor: string; borderColor: string }> = {
      '1': { backgroundColor: '#a4bdfc', borderColor: '#1a73e8' },
      '2': { backgroundColor: '#7ae7bf', borderColor: '#0b8043' },
      '3': { backgroundColor: '#dbadff', borderColor: '#7b1fa2' },
      '4': { backgroundColor: '#ff887c', borderColor: '#d50000' },
      '5': { backgroundColor: '#fbd75b', borderColor: '#f09300' },
      '6': { backgroundColor: '#ffb878', borderColor: '#e67c73' },
      '7': { backgroundColor: '#46d6db', borderColor: '#039be5' },
      '8': { backgroundColor: '#e1e1e1', borderColor: '#616161' },
      '9': { backgroundColor: '#5484ed', borderColor: '#3f51b5' },
      '10': { backgroundColor: '#51b749', borderColor: '#0b8043' },
      '11': { backgroundColor: '#dc2127', borderColor: '#d50000' },
    };

    const color = colors[colorId] || colors['1'];

    return {
      style: {
        backgroundColor: color.backgroundColor,
        borderColor: color.borderColor,
        borderLeftWidth: '4px',
        borderRadius: '4px',
        color: '#000',
        fontSize: '14px',
        padding: '2px 4px',
      },
    };
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Calendar</h1>
            <p className="mt-2 text-lg text-gray-600">
              Manage your events and schedule
            </p>
          </div>
          <Button
            onClick={() => {
              setSelectedEvent(null);
              setNewEventStart(null);
              setNewEventEnd(null);
              setIsEventModalOpen(true);
            }}
            className="bg-black text-white hover:bg-gray-800 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Event
          </Button>
        </div>

        {/* Calendar */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <Calendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            style={{ height: 600 }}
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

