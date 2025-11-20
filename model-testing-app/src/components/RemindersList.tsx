'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import ReminderCard from './ReminderCard';
import { Plus, Filter } from 'lucide-react';

interface RemindersListProps {
  onCreateClick?: () => void;
  statusFilter?: 'pending' | 'completed' | 'dismissed' | 'overdue';
  clientId?: string;
  projectId?: string;
}

export default function RemindersList({
  onCreateClick,
  statusFilter,
  clientId,
  projectId,
}: RemindersListProps) {
  const [localStatusFilter, setLocalStatusFilter] = useState<
    'pending' | 'completed' | 'dismissed' | 'overdue' | 'all'
  >(statusFilter || 'all');
  const [showFilters, setShowFilters] = useState(false);

  const reminders = useQuery(api.reminders.getByUser, {
    status: localStatusFilter === 'all' ? undefined : localStatusFilter,
    clientId: clientId as any,
    projectId: projectId as any,
  });

  // Get clients and projects for display
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});

  // Enhance reminders with client/project names
  const enhancedReminders = reminders?.map(reminder => ({
    ...reminder,
    clientName: reminder.clientId
      ? clients?.find(c => c._id === reminder.clientId)?.name
      : undefined,
    projectName: reminder.projectId
      ? projects?.find(p => p._id === reminder.projectId)?.name
      : undefined,
  })) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Reminders</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            Filter
          </button>
          {onCreateClick && (
            <button
              onClick={onCreateClick}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Reminder
            </button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Status:</label>
            <select
              value={localStatusFilter}
              onChange={(e) =>
                setLocalStatusFilter(
                  e.target.value as 'pending' | 'completed' | 'dismissed' | 'overdue' | 'all'
                )
              }
              className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="dismissed">Dismissed</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>
      )}

      {reminders === undefined ? (
        <div className="text-center py-8 text-gray-500">Loading reminders...</div>
      ) : enhancedReminders.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-4">No reminders found</p>
          {onCreateClick && (
            <button
              onClick={onCreateClick}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create your first reminder
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {enhancedReminders.map((reminder) => (
            <ReminderCard key={reminder._id} reminder={reminder} />
          ))}
        </div>
      )}
    </div>
  );
}

