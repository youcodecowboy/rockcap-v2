'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Modal, Field, Input, Textarea, Button } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Trash2, Building2 } from 'lucide-react';
import ClientProjectSearch from './ClientProjectSearch';
import DatePickerCompact from './DatePickerCompact';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface EventModalProps {
  eventId?: Id<'events'>;
  initialStart?: Date;
  initialEnd?: Date;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EventModal({
  eventId,
  initialStart,
  initialEnd,
  isOpen,
  onClose,
  onSuccess,
}: EventModalProps) {
  const colors = useColors();
  const createEvent = useMutation(api.events.create);
  const updateEvent = useMutation(api.events.update);
  const deleteEvent = useMutation(api.events.remove);
  const event = useQuery(api.events.get, eventId ? { id: eventId } : 'skip');
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [clientId, setClientId] = useState<Id<'clients'> | undefined>();
  const [projectId, setProjectId] = useState<Id<'projects'> | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Initialize from event data or initial dates
  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description || '');
      setLocation(event.location || '');
      setAllDay(event.allDay || false);

      const start = new Date(event.startTime);
      const end = new Date(event.endTime);

      setStartDate(start.toISOString().split('T')[0]);
      setStartTime(start.toTimeString().slice(0, 5));
      setEndDate(end.toISOString().split('T')[0]);
      setEndTime(end.toTimeString().slice(0, 5));

      setClientId(event.clientId);
      setProjectId(event.projectId);
    } else if (initialStart && initialEnd) {
      // New event with initial dates
      setStartDate(initialStart.toISOString().split('T')[0]);
      setStartTime(initialStart.toTimeString().slice(0, 5));
      setEndDate(initialEnd.toISOString().split('T')[0]);
      setEndTime(initialEnd.toTimeString().slice(0, 5));

      // Default to 1 hour duration if times are the same
      if (initialStart.getTime() === initialEnd.getTime()) {
        const endTime = new Date(initialStart);
        endTime.setHours(endTime.getHours() + 1);
        setEndTime(endTime.toTimeString().slice(0, 5));
      }
    } else {
      // New event without initial dates
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

      setStartDate(now.toISOString().split('T')[0]);
      setStartTime(now.toTimeString().slice(0, 5));
      setEndDate(oneHourLater.toISOString().split('T')[0]);
      setEndTime(oneHourLater.toTimeString().slice(0, 5));
    }
  }, [event, initialStart, initialEnd]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('Please enter an event title');
      return;
    }

    setIsSubmitting(true);

    try {
      // Build start and end times
      const startDateTime = allDay
        ? new Date(startDate + 'T00:00:00')
        : new Date(startDate + 'T' + startTime);
      const endDateTime = allDay
        ? new Date(endDate + 'T23:59:59')
        : new Date(endDate + 'T' + endTime);

      if (endDateTime <= startDateTime) {
        alert('End time must be after start time');
        setIsSubmitting(false);
        return;
      }

      if (eventId && event) {
        // Update existing event
        await updateEvent({
          id: eventId,
          title,
          description: description || undefined,
          location: location || undefined,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          allDay,
          clientId: clientId || undefined,
          projectId: projectId || undefined,
        });
      } else {
        // Create new event
        await createEvent({
          title,
          description: description || undefined,
          location: location || undefined,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          allDay,
          clientId: clientId || undefined,
          projectId: projectId || undefined,
        });
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving event:', error);
      alert('Failed to save event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!eventId) return;

    if (!confirm('Are you sure you want to delete this event?')) {
      return;
    }

    try {
      await deleteEvent({ id: eventId });
      onSuccess();
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Failed to delete event. Please try again.');
    }
  };

  const getClientName = (id?: Id<'clients'>) => {
    if (!id) return null;
    return clients?.find(c => c._id === id)?.name;
  };

  const getProjectName = (id?: Id<'projects'>) => {
    if (!id) return null;
    return projects?.find(p => p._id === id)?.name;
  };

  const footer = (
    <div className="flex items-center gap-2 w-full">
      {eventId && (
        <Button
          type="button"
          variant="danger"
          onClick={handleDelete}
          style={{ marginRight: 'auto' }}
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </Button>
      )}
      <Button
        type="button"
        variant="secondary"
        onClick={onClose}
        disabled={isSubmitting}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        form="event-form"
        variant="primary"
        accent={colors.accent.blue}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Saving...' : eventId ? 'Update Event' : 'Create Event'}
      </Button>
    </div>
  );

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={eventId ? 'Edit Event' : 'Create New Event'}
      width={640}
      footer={footer}
    >
      <form id="event-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <Field label="Title *">
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
            required
          />
        </Field>

        {/* Description */}
        <Field label="Description">
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add event details"
            rows={3}
          />
        </Field>

        {/* All Day Toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={allDay}
            id="allDay"
            onClick={() => setAllDay(!allDay)}
            style={{
              position: 'relative',
              width: 36,
              height: 20,
              borderRadius: 10,
              border: `1px solid ${allDay ? colors.accent.blue : colors.border.default}`,
              background: allDay ? colors.accent.blue : colors.bg.cardAlt,
              cursor: 'pointer',
              transition: 'background 100ms linear, border-color 100ms linear',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 1,
                left: allDay ? 17 : 1,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#ffffff',
                transition: 'left 100ms linear',
              }}
            />
          </button>
          <label
            htmlFor="allDay"
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.text.muted,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            All-day event
          </label>
        </div>

        {/* Date and Time */}
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Start ${allDay ? 'Date' : 'Date & Time'}`}>
            <div className="flex gap-2">
              <DatePickerCompact
                value={startDate}
                onChange={setStartDate}
              />
              {!allDay && (
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={{ flex: 1 }}
                />
              )}
            </div>
          </Field>
          <Field label={`End ${allDay ? 'Date' : 'Date & Time'}`}>
            <div className="flex gap-2">
              <DatePickerCompact
                value={endDate}
                onChange={setEndDate}
                minDate={new Date(startDate)}
              />
              {!allDay && (
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={{ flex: 1 }}
                />
              )}
            </div>
          </Field>
        </div>

        {/* Location */}
        <Field label="Location">
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Add location"
          />
        </Field>

        {/* Client/Project Linking */}
        <div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.text.muted,
              fontWeight: 500,
              marginBottom: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Building2 className="w-4 h-4" />
            Link to Client/Project
          </div>
          <ClientProjectSearch
            selectedClientId={clientId}
            selectedProjectId={projectId}
            onClientSelect={setClientId}
            onProjectSelect={setProjectId}
          />
          {(clientId || projectId) && (
            <div className="mt-2" style={{ fontSize: 12, color: colors.text.secondary }}>
              {clientId && <span>Client: {getClientName(clientId)}</span>}
              {clientId && projectId && <span> • </span>}
              {projectId && <span>Project: {getProjectName(projectId)}</span>}
            </div>
          )}
        </div>

        {/* Advanced Options (Collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ fontSize: 12, color: colors.accent.blue, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
          </button>
          {showAdvanced && (
            <div
              className="mt-2 p-4 space-y-4"
              style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4 }}
            >
              <p style={{ fontSize: 12, color: colors.text.muted }}>
                Advanced options (recurrence, attendees, reminders) will be available in a future update.
              </p>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
