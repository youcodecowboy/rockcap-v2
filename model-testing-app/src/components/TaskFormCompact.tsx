'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Loader2, Calendar, User, Building2, FolderKanban, Tag, Flag, Clock, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import ClientProjectSearch from './ClientProjectSearch';

interface TaskFormCompactProps {
  taskId?: Id<'tasks'>;
  initialData?: {
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    dueDate?: string;
    clientId?: Id<'clients'>;
    projectId?: Id<'projects'>;
    tags?: string[];
    assignedTo?: Id<'users'>;
    hasReminder?: boolean;
    reminderDate?: string;
    reminderTime?: string;
    reminderTitle?: string;
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function TaskFormCompact({
  taskId,
  initialData,
  onSuccess,
  onCancel,
}: TaskFormCompactProps) {
  const createTask = useMutation(api.tasks.create);
  const updateTask = useMutation(api.tasks.update);
  const createReminder = useMutation(api.reminders.create);
  const task = useQuery(api.tasks.get, taskId ? { id: taskId } : 'skip');
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const allUsers = useQuery(api.users.getAll, {});
  const currentUser = useQuery(api.users.getCurrent, {});

  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(initialData?.priority || 'medium');
  const [dueDate, setDueDate] = useState(initialData?.dueDate || '');
  const [clientId, setClientId] = useState<Id<'clients'> | undefined>(initialData?.clientId);
  const [projectId, setProjectId] = useState<Id<'projects'> | undefined>(initialData?.projectId);
  const [assignedTo, setAssignedTo] = useState<Id<'users'> | undefined>(initialData?.assignedTo);
  const [tags, setTags] = useState(initialData?.tags?.join(', ') || '');
  
  // Reminder fields
  const [hasReminder, setHasReminder] = useState(initialData?.hasReminder || false);
  const [reminderDate, setReminderDate] = useState(initialData?.reminderDate || (() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  })());
  const [reminderTime, setReminderTime] = useState(initialData?.reminderTime || '');
  const [reminderTitle, setReminderTitle] = useState(initialData?.reminderTitle || '');
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load task data if editing
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setPriority(task.priority || 'medium');
      setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
      setTags(task.tags?.join(', ') || '');
      setClientId(task.clientId);
      setProjectId(task.projectId);
      setAssignedTo(task.assignedTo);
    }
  }, [task]);

  // Update from initialData
  useEffect(() => {
    if (initialData) {
      if (initialData.title) setTitle(initialData.title);
      if (initialData.description) setDescription(initialData.description);
      if (initialData.priority) setPriority(initialData.priority);
      if (initialData.dueDate) setDueDate(initialData.dueDate);
      if (initialData.clientId) setClientId(initialData.clientId);
      if (initialData.projectId) setProjectId(initialData.projectId);
      if (initialData.tags) setTags(initialData.tags.join(', '));
      if (initialData.assignedTo) setAssignedTo(initialData.assignedTo);
      if (initialData.hasReminder !== undefined) setHasReminder(initialData.hasReminder);
      if (initialData.reminderDate) setReminderDate(initialData.reminderDate);
      if (initialData.reminderTime) setReminderTime(initialData.reminderTime);
      if (initialData.reminderTitle) setReminderTitle(initialData.reminderTitle);
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('Title is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const tagsArray = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      let createdTaskId: Id<'tasks'>;

      if (taskId) {
        await updateTask({
          id: taskId,
          title,
          description: description || undefined,
          dueDate: dueDate || null,
          priority,
          tags: tagsArray,
          clientId: clientId || null,
          projectId: projectId || null,
          assignedTo: assignedTo || null,
        });
        createdTaskId = taskId;
      } else {
        createdTaskId = await createTask({
          title,
          description: description || undefined,
          dueDate: dueDate || undefined,
          priority,
          tags: tagsArray,
          clientId,
          projectId,
          assignedTo,
        });
      }

      // Create reminder if requested
      if (hasReminder && reminderDate && reminderTime) {
        const scheduledFor = new Date(`${reminderDate}T${reminderTime}`).toISOString();
        await createReminder({
          title: reminderTitle || `Reminder: ${title}`,
          description: `Task: ${title}`,
          scheduledFor,
          taskId: createdTaskId,
          clientId,
          projectId,
        });
      }

      onSuccess?.();
    } catch (error) {
      console.error('Failed to save task:', error);
      alert('Failed to save task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProjects = projects?.filter(p => {
    if (!clientId) return true;
    return p.clientRoles?.some((cr: any) => cr.clientId === clientId);
  }) || [];

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-lg font-semibold px-3 py-2 border-0 border-b-2 border-gray-200 focus:border-blue-500 focus:outline-none bg-transparent"
          placeholder="Task title..."
          required
        />
      </div>

      {/* Description */}
      <div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={2}
          placeholder="What needs to happen..."
        />
      </div>

      {/* Quick Actions Row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Priority */}
        <div className="flex items-center gap-2">
          <Flag className="w-4 h-4 text-gray-400" />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as any)}
            className={`px-2 py-1 rounded-md text-sm font-medium border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 ${getPriorityColor(priority)}`}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        {/* Due Date */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="px-2 py-1 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Client & Project Search */}
        <div className="flex-1">
          <ClientProjectSearch
            selectedClientId={clientId}
            selectedProjectId={projectId}
            onClientSelect={(newClientId) => {
              setClientId(newClientId);
              if (newClientId && projectId) {
                const project = projects?.find(p => p._id === projectId);
                if (project && !project.clientRoles?.some((cr: any) => cr.clientId === newClientId)) {
                  setProjectId(undefined);
                }
              }
            }}
            onProjectSelect={setProjectId}
          />
        </div>

        {/* Assigned To */}
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400" />
          <select
            value={assignedTo || ''}
            onChange={(e) => setAssignedTo((e.target.value as Id<'users'>) || undefined)}
            className="px-2 py-1 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Unassigned</option>
            {allUsers?.map((user) => (
              <option key={user._id} value={user._id}>
                {user.name || user.email}
                {user._id === currentUser?._id ? ' (me)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Tags */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Tag className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="flex-1 px-2 py-1 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="tags..."
          />
        </div>
      </div>

      {/* Reminder Section */}
      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <label htmlFor="hasReminder" className="text-sm font-medium text-gray-700 cursor-pointer">
              Set a reminder
            </label>
          </div>
          <Switch
            id="hasReminder"
            checked={hasReminder}
            onCheckedChange={setHasReminder}
          />
        </div>

        {hasReminder && (
          <div className="ml-6 space-y-3 bg-gray-50 p-3 rounded-lg">
            <input
              type="text"
              value={reminderTitle}
              onChange={(e) => setReminderTitle(e.target.value)}
              className="w-full px-2 py-1 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Reminder title (optional)"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  className="w-full px-2 py-1 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="w-full px-2 py-1 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 inline animate-spin mr-2" />
              Saving...
            </>
          ) : (
            taskId ? 'Update Task' : 'Create Task'
          )}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </form>
  );
}

