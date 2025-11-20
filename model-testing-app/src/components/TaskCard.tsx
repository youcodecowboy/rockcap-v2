'use client';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { CheckSquare, Circle, Clock, User, Building2, FolderKanban, Tag } from 'lucide-react';
import Link from 'next/link';

interface TaskCardProps {
  task: {
    _id: Id<'tasks'>;
    title: string;
    description?: string;
    notes?: string;
    status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
    dueDate?: string;
    createdBy: Id<'users'>;
    assignedTo?: Id<'users'>;
    clientId?: Id<'clients'>;
    projectId?: Id<'projects'>;
    clientName?: string;
    projectName?: string;
    assignedToName?: string;
    createdByName?: string;
  };
  onUpdate?: () => void;
}

export default function TaskCard({ task, onUpdate }: TaskCardProps) {
  const getStatusIcon = () => {
    switch (task.status) {
      case 'completed':
        return <CheckSquare className="w-4 h-4 text-green-600" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'cancelled':
        return <Circle className="w-4 h-4 text-gray-400" />;
      default:
        return <Circle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getPriorityColor = () => {
    switch (task.priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays < 7 && diffDays > -7) {
      return `${Math.abs(diffDays)} days ${diffDays > 0 ? 'from now' : 'ago'}`;
    }
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className={`bg-white rounded-lg border-2 p-4 transition-shadow hover:shadow-md ${getPriorityColor()}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {getStatusIcon()}
            <h3 className="font-semibold text-gray-900">{task.title}</h3>
          </div>
          {task.description && (
            <p className="text-sm text-gray-600 mb-2">{task.description}</p>
          )}
        </div>
        {task.priority && (
          <span className="ml-2 px-2 py-1 text-xs font-medium rounded-full capitalize">
            {task.priority}
          </span>
        )}
      </div>

      {task.notes && (
        <div className="mb-2 text-sm text-gray-500 italic">
          {task.notes}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mb-3">
        {task.assignedToName && (
          <div className="flex items-center gap-1">
            <User className="w-4 h-4" />
            <span>{task.assignedToName}</span>
          </div>
        )}
        {task.dueDate && (
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{formatDate(task.dueDate)}</span>
          </div>
        )}
        {task.clientName && (
          <Link
            href={`/clients/${task.clientId}`}
            className="flex items-center gap-1 hover:text-blue-600"
          >
            <Building2 className="w-4 h-4" />
            <span>{task.clientName}</span>
          </Link>
        )}
        {task.projectName && (
          <Link
            href={`/projects/${task.projectId}`}
            className="flex items-center gap-1 hover:text-blue-600"
          >
            <FolderKanban className="w-4 h-4" />
            <span>{task.projectName}</span>
          </Link>
        )}
      </div>

      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full"
            >
              <Tag className="w-3 h-3" />
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
        <span className="text-xs text-gray-500 capitalize">{task.status}</span>
        {task.createdByName && (
          <span className="text-xs text-gray-500">Created by {task.createdByName}</span>
        )}
      </div>
    </div>
  );
}

