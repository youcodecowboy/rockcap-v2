'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Loader2 } from 'lucide-react';

interface TaskFormProps {
  taskId?: Id<'tasks'>;
  initialClientId?: Id<'clients'>;
  initialProjectId?: Id<'projects'>;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function TaskForm({
  taskId,
  initialClientId,
  initialProjectId,
  onSuccess,
  onCancel,
}: TaskFormProps) {
  const createTask = useMutation(api.tasks.create);
  const updateTask = useMutation(api.tasks.update);
  const task = useQuery(api.tasks.get, taskId ? { id: taskId } : 'skip');
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});
  const users = useQuery(api.users.getCurrent, {});

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<'todo' | 'in_progress' | 'completed' | 'cancelled'>('todo');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [tags, setTags] = useState('');
  const [clientId, setClientId] = useState<Id<'clients'> | undefined>(initialClientId);
  const [projectId, setProjectId] = useState<Id<'projects'> | undefined>(initialProjectId);
  const [assignedTo, setAssignedTo] = useState<Id<'users'> | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load task data if editing
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setNotes(task.notes || '');
      setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
      setStatus(task.status);
      setPriority(task.priority || 'medium');
      setTags(task.tags?.join(', ') || '');
      setClientId(task.clientId);
      setProjectId(task.projectId);
      setAssignedTo(task.assignedTo);
    }
  }, [task]);

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

      if (taskId) {
        await updateTask({
          id: taskId,
          title,
          description: description || undefined,
          notes: notes || undefined,
          dueDate: dueDate || null,
          status,
          priority,
          tags: tagsArray,
          clientId: clientId || null,
          projectId: projectId || null,
          assignedTo: assignedTo || null,
        });
      } else {
        await createTask({
          title,
          description: description || undefined,
          notes: notes || undefined,
          dueDate: dueDate || undefined,
          priority,
          tags: tagsArray,
          clientId,
          projectId,
          assignedTo,
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
          placeholder="Task title..."
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
          placeholder="What needs to happen..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
          placeholder="Additional notes..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Priority
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Due Date
        </label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Assigned To
        </label>
        <select
          value={assignedTo || ''}
          onChange={(e) => setAssignedTo((e.target.value as Id<'users'>) || undefined)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Unassigned</option>
          {/* Note: In a real app, you'd fetch all users. For now, we'll just show current user */}
          {users && (
            <option value={users._id}>{users.name || users.email}</option>
          )}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Full user assignment will be available when user management is expanded
        </p>
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

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tags (comma-separated)
        </label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="tag1, tag2, tag3"
        />
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
            taskId ? 'Update Task' : 'Create Task'
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

