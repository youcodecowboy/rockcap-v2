'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Loader2 } from 'lucide-react';

interface ReminderFormProps {
  reminderId?: Id<'reminders'>;
  initialClientId?: Id<'clients'>;
  initialProjectId?: Id<'projects'>;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function ReminderForm({
  reminderId,
  initialClientId,
  initialProjectId,
  onSuccess,
  onCancel,
}: ReminderFormProps) {
  const createReminder = useMutation(api.reminders.create);
  const updateReminder = useMutation(api.reminders.update);
  const reminder = useQuery(api.reminders.get, reminderId ? { id: reminderId } : 'skip');
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [clientId, setClientId] = useState<Id<'clients'> | undefined>(initialClientId);
  const [projectId, setProjectId] = useState<Id<'projects'> | undefined>(initialProjectId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Load reminder data if editing
  useEffect(() => {
    if (reminder) {
      setTitle(reminder.title);
      setDescription(reminder.description || '');
      const scheduledDateObj = new Date(reminder.scheduledFor);
      setScheduledDate(scheduledDateObj.toISOString().split('T')[0]);
      setScheduledTime(scheduledDateObj.toTimeString().slice(0, 5));
      setClientId(reminder.clientId);
      setProjectId(reminder.projectId);
    }
  }, [reminder]);

  // Set initial date/time to now if creating new reminder
  useEffect(() => {
    if (!reminderId && !scheduledDate) {
      const now = new Date();
      setScheduledDate(now.toISOString().split('T')[0]);
      setScheduledTime(now.toTimeString().slice(0, 5));
    }
  }, [reminderId, scheduledDate]);

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

    if (!scheduledDate || !scheduledTime) {
      alert('Date and time are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();

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
        await createReminder({
          title,
          description: description || undefined,
          scheduledFor,
          clientId,
          projectId,
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date *
          </label>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Time *
          </label>
          <input
            type="time"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
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

