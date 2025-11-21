'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Loader2 } from 'lucide-react';
import { DateTimePicker } from './DateTimePicker';

interface ReminderFormProps {
  reminderId?: Id<'reminders'>;
  initialClientId?: Id<'clients'>;
  initialProjectId?: Id<'projects'>;
  initialData?: {
    title?: string;
    description?: string;
    scheduledDate?: string;
    scheduledTime?: string;
    scheduledDateTime?: Date; // Date object for DateTimePicker
    clientId?: Id<'clients'>;
    projectId?: Id<'projects'>;
    notes?: string;
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function ReminderForm({
  reminderId,
  initialClientId,
  initialProjectId,
  initialData,
  onSuccess,
  onCancel,
}: ReminderFormProps) {
  const createReminder = useMutation(api.reminders.create);
  const updateReminder = useMutation(api.reminders.update);
  const reminder = useQuery(api.reminders.get, reminderId ? { id: reminderId } : 'skip');
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});

  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  
  // Convert initial date/time strings to Date object and time string
  const getInitialDate = () => {
    // Prefer scheduledDateTime if provided (from parsed data)
    if (initialData?.scheduledDateTime) {
      return initialData.scheduledDateTime;
    }
    // Otherwise, construct from date/time strings
    if (initialData?.scheduledDate && initialData?.scheduledTime) {
      const date = new Date(`${initialData.scheduledDate}T${initialData.scheduledTime}`);
      return isNaN(date.getTime()) ? undefined : date;
    }
    return undefined;
  };
  
  const getInitialTime = () => {
    if (initialData?.scheduledTime) {
      return initialData.scheduledTime;
    }
    if (initialData?.scheduledDateTime) {
      const hours = String(initialData.scheduledDateTime.getHours()).padStart(2, '0');
      const minutes = String(initialData.scheduledDateTime.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    if (initialData?.scheduledDate) {
      const date = new Date(`${initialData.scheduledDate}T00:00`);
      if (!isNaN(date.getTime())) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
      }
    }
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };
  
  const [scheduledDateTime, setScheduledDateTime] = useState<Date | undefined>(getInitialDate());
  const [scheduledTime, setScheduledTime] = useState(getInitialTime());
  
  // Helper to validate and resolve clientId - handle case where it might be a name string
  const resolveClientId = (value: any): Id<'clients'> | undefined => {
    if (!value) return initialClientId;
    
    // If it's already a valid ID format (starts with 'j' for Convex IDs), use it
    if (typeof value === 'string' && value.startsWith('j')) {
      return value as Id<'clients'>;
    }
    
    // If it's a name string, look it up
    if (typeof value === 'string' && clients) {
      const foundClient = clients.find(
        c => c.name.toLowerCase() === value.toLowerCase() ||
             c.companyName?.toLowerCase() === value.toLowerCase()
      );
      if (foundClient) {
        return foundClient._id;
      }
    }
    
    return initialClientId;
  };
  
  const [clientId, setClientId] = useState<Id<'clients'> | undefined>(
    resolveClientId(initialData?.clientId)
  );
  const [projectId, setProjectId] = useState<Id<'projects'> | undefined>(initialData?.projectId || initialProjectId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  
  // Update clientId when clients data loads or initialData changes
  useEffect(() => {
    if (initialData?.clientId && clients) {
      const resolvedId = resolveClientId(initialData.clientId);
      if (resolvedId && resolvedId !== clientId) {
        setClientId(resolvedId);
      }
    }
  }, [initialData?.clientId, clients]);

  // Load reminder data if editing
  useEffect(() => {
    if (reminder) {
      setTitle(reminder.title);
      setDescription(reminder.description || '');
      const scheduledDateObj = new Date(reminder.scheduledFor);
      setScheduledDateTime(scheduledDateObj);
      const hours = String(scheduledDateObj.getHours()).padStart(2, '0');
      const minutes = String(scheduledDateObj.getMinutes()).padStart(2, '0');
      setScheduledTime(`${hours}:${minutes}`);
      setClientId(reminder.clientId);
      setProjectId(reminder.projectId);
    }
  }, [reminder]);

  // Set initial date/time to now if creating new reminder
  useEffect(() => {
    if (!reminderId && !scheduledDateTime) {
      const now = new Date();
      setScheduledDateTime(now);
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setScheduledTime(`${hours}:${minutes}`);
    }
  }, [reminderId, scheduledDateTime]);

  const handleEnhance = async () => {
    if (!title.trim()) {
      alert('Please enter a reminder title first');
      return;
    }

    setIsEnhancing(true);
    try {
      const response = await fetch('/api/reminders/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminderText: title + (description ? '\n' + description : '') }),
      });

      if (!response.ok) {
        throw new Error('Failed to enhance reminder');
      }

      const enhancement = await response.json();
      if (enhancement.enhancedDescription) {
        setDescription(enhancement.enhancedDescription);
      }
      if (enhancement.suggestedClientName && clients) {
        const suggestedClient = clients.find(c => c.name === enhancement.suggestedClientName);
        if (suggestedClient) {
          setClientId(suggestedClient._id);
        }
      }
      if (enhancement.suggestedProjectName && projects) {
        const suggestedProject = projects.find(p => p.name === enhancement.suggestedProjectName);
        if (suggestedProject) {
          setProjectId(suggestedProject._id);
        }
      }
    } catch (error) {
      console.error('Failed to enhance reminder:', error);
      alert('Failed to enhance reminder. Please try again.');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('Title is required');
      return;
    }

    if (!scheduledDateTime) {
      alert('Date is required');
      return;
    }

    if (!scheduledTime) {
      alert('Time is required');
      return;
    }

    setIsSubmitting(true);
    try {
      // Combine date and time into ISO string
      const [hours, minutes] = scheduledTime.split(':').map(Number);
      const finalDate = new Date(scheduledDateTime);
      finalDate.setHours(hours, minutes, 0, 0);
      const scheduledFor = finalDate.toISOString();

      if (reminderId) {
        await updateReminder({
          id: reminderId,
          title,
          description: description || undefined,
          scheduledFor,
          clientId: clientId || null,
          projectId: projectId || null,
        });
      } else {
        // Validate clientId is actually an ID, not a name string (but allow undefined/null)
        let validClientId: Id<'clients'> | undefined = undefined;
        if (clientId) {
          // Check if it's a valid Convex ID format
          if (typeof clientId === 'string' && clientId.startsWith('j')) {
            validClientId = clientId;
          } else if (clients) {
            // Try to find by name
            const foundClient = clients.find(
              c => c.name === clientId || c.companyName === clientId
            );
            if (foundClient) {
              validClientId = foundClient._id;
            }
          }
        }
        // If clientId is invalid but was provided, we'll just skip it (optional field)
        
        await createReminder({
          title,
          description: description || undefined,
          scheduledFor,
          clientId: validClientId, // Can be undefined - optional field
          projectId, // Can be undefined - optional field
        });
      }

      onSuccess?.();
    } catch (error) {
      console.error('Failed to save reminder:', error);
      alert('Failed to save reminder. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter projects by selected client
  const filteredProjects = projects?.filter(p => {
    if (!clientId) return true;
    return p.clientRoles?.some((cr: any) => cr.clientId === clientId);
  }) || [];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title *
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Reminder title..."
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          placeholder="Reminder description..."
        />
        <button
          type="button"
          onClick={handleEnhance}
          disabled={isEnhancing || !title.trim()}
          className="mt-2 text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {isEnhancing ? (
            <>
              <Loader2 className="w-4 h-4 inline animate-spin mr-1" />
              Enhancing...
            </>
          ) : (
            '✨ Enhance with AI'
          )}
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Date & Time *
        </label>
        <DateTimePicker
          date={scheduledDateTime}
          time={scheduledTime}
          onDateChange={setScheduledDateTime}
          onTimeChange={setScheduledTime}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Client (optional)
        </label>
        <select
          value={clientId || ''}
          onChange={(e) => {
            const newClientId = e.target.value as Id<'clients'> | '';
            setClientId(newClientId || undefined);
            // Clear project if it doesn't belong to the new client
            if (newClientId && projectId) {
              const project = projects?.find(p => p._id === projectId);
              if (project && !project.clientRoles?.some((cr: any) => cr.clientId === newClientId)) {
                setProjectId(undefined);
              }
            }
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">None</option>
          {clients?.map((client) => (
            <option key={client._id} value={client._id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Project (optional)
        </label>
        <select
          value={projectId || ''}
          onChange={(e) => setProjectId((e.target.value as Id<'projects'>) || undefined)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={!clientId}
        >
          <option value="">None</option>
          {filteredProjects.map((project) => (
            <option key={project._id} value={project._id}>
              {project.name}
            </option>
          ))}
        </select>
        {!clientId && (
          <p className="mt-1 text-xs text-gray-500">Select a client first to choose a project</p>
        )}
      </div>

      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 inline animate-spin mr-2" />
              Saving...
            </>
          ) : (
            reminderId ? 'Update Reminder' : 'Create Reminder'
          )}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

