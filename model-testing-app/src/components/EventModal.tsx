'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { X, Trash2, MapPin, Clock, Users, Building2, FolderKanban } from 'lucide-react';
import ClientProjectSearch from './ClientProjectSearch';
import DatePickerCompact from './DatePickerCompact';

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

  return (
    <Drawer open={isOpen} onOpenChange={onClose} direction="right">
      <DrawerContent className="w-full sm:w-[600px] lg:w-[700px] h-full overflow-hidden flex flex-col">
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-xl">{eventId ? 'Edit Event' : 'Create New Event'}</DrawerTitle>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <form id="event-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              required
              className="mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add event details"
              rows={3}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* All Day Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="allDay"
              checked={allDay}
              onCheckedChange={setAllDay}
            />
            <Label htmlFor="allDay">All-day event</Label>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start {allDay ? 'Date' : 'Date & Time'}</Label>
              <div className="mt-1 flex gap-2">
                <DatePickerCompact
                  value={startDate}
                  onChange={setStartDate}
                />
                {!allDay && (
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="flex-1"
                  />
                )}
              </div>
            </div>
            <div>
              <Label>End {allDay ? 'Date' : 'Date & Time'}</Label>
              <div className="mt-1 flex gap-2">
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
                    className="flex-1"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Location */}
          <div>
            <Label htmlFor="location" className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Location
            </Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
              className="mt-1"
            />
          </div>

          {/* Client/Project Linking */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4" />
              Link to Client/Project
            </Label>
            <ClientProjectSearch
              selectedClientId={clientId}
              selectedProjectId={projectId}
              onClientSelect={setClientId}
              onProjectSelect={setProjectId}
            />
            {(clientId || projectId) && (
              <div className="mt-2 text-sm text-gray-600">
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
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced Options
            </button>
            {showAdvanced && (
              <div className="mt-2 p-4 border border-gray-200 rounded-md space-y-4">
                <p className="text-sm text-gray-500">
                  Advanced options (recurrence, attendees, reminders) will be available in a future update.
                </p>
              </div>
            )}
          </div>

          </form>
        </div>

        {/* Actions */}
        <DrawerFooter className="border-t bg-gray-50">
          <div className="flex items-center gap-2">
            {eventId && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                className="mr-auto"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="event-form"
              disabled={isSubmitting}
              className="flex-1 bg-black text-white hover:bg-gray-800"
            >
              {isSubmitting ? 'Saving...' : eventId ? 'Update Event' : 'Create Event'}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

