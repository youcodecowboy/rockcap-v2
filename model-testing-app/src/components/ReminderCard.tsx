'use client';

import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Clock, CheckCircle2, XCircle, AlertCircle, Building2, FolderKanban, Calendar } from 'lucide-react';
import Link from 'next/link';

interface ReminderCardProps {
  reminder: {
    _id: Id<'reminders'>;
    title: string;
    description?: string;
    scheduledFor: string;
    status: 'pending' | 'completed' | 'dismissed' | 'overdue';
    clientId?: Id<'clients'>;
    projectId?: Id<'projects'>;
    clientName?: string;
    projectName?: string;
  };
  onUpdate?: () => void;
}

export default function ReminderCard({ reminder, onUpdate }: ReminderCardProps) {
  const completeReminder = useMutation(api.reminders.complete);
  const dismissReminder = useMutation(api.reminders.dismiss);

  const handleComplete = async () => {
    try {
      await completeReminder({ id: reminder._id });
      onUpdate?.();
    } catch (error) {
      console.error('Failed to complete reminder:', error);
    }
  };

  const handleDismiss = async () => {
    try {
      await dismissReminder({ id: reminder._id });
      onUpdate?.();
    } catch (error) {
      console.error('Failed to dismiss reminder:', error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMs < 0) {
      return 'Overdue';
    }
    if (diffMins < 60) {
      return `in ${diffMins}m`;
    }
    if (diffHours < 24) {
      return `in ${diffHours}h`;
    }
    if (diffDays < 7) {
      return `in ${diffDays}d`;
    }
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getStatusColor = () => {
    switch (reminder.status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'dismissed':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'overdue':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getStatusIcon = () => {
    switch (reminder.status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'dismissed':
        return <XCircle className="w-4 h-4" />;
      case 'overdue':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className={`bg-white rounded-lg border-2 p-4 transition-shadow hover:shadow-md ${getStatusColor()}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 mb-1">{reminder.title}</h3>
          {reminder.description && (
            <p className="text-sm text-gray-600 mb-2">{reminder.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-4">
          {getStatusIcon()}
          <span className="text-xs font-medium capitalize">{reminder.status}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
        <div className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          <span>{formatTime(reminder.scheduledFor)}</span>
        </div>
        {reminder.clientName && (
          <Link
            href={`/clients/${reminder.clientId}`}
            className="flex items-center gap-1 hover:text-blue-600"
          >
            <Building2 className="w-4 h-4" />
            <span>{reminder.clientName}</span>
          </Link>
        )}
        {reminder.projectName && (
          <Link
            href={`/projects/${reminder.projectId}`}
            className="flex items-center gap-1 hover:text-blue-600"
          >
            <FolderKanban className="w-4 h-4" />
            <span>{reminder.projectName}</span>
          </Link>
        )}
      </div>

      {reminder.status === 'pending' && (
        <div className="flex gap-2">
          <button
            onClick={handleComplete}
            className="flex-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
          >
            Complete
          </button>
          <button
            onClick={handleDismiss}
            className="flex-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

