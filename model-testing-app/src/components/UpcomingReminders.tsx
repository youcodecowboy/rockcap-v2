'use client';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Calendar } from 'lucide-react';
import Link from 'next/link';
import { Id } from '../../convex/_generated/dataModel';

export default function UpcomingReminders() {
  const reminders = useQuery(api.reminders.getUpcoming, { days: 7, limit: 3 });
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});

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
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  if (reminders === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Upcoming Reminders
          </CardTitle>
          <CardDescription>Your reminders for the next 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (reminders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Upcoming Reminders
          </CardTitle>
          <CardDescription>Your reminders for the next 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-gray-500">
            <p className="mb-2">No upcoming reminders</p>
            <Link
              href="/reminders"
              className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
            >
              Create a reminder
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Upcoming Reminders
        </CardTitle>
        <CardDescription>Your reminders for the next 7 days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {reminders.map((reminder) => {
            const clientName = reminder.clientId
              ? clients?.find(c => c._id === reminder.clientId)?.name
              : undefined;
            const projectName = reminder.projectId
              ? projects?.find(p => p._id === reminder.projectId)?.name
              : undefined;

            return (
              <div
                key={reminder._id}
                className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 mb-1">{reminder.title}</h3>
                    {reminder.description && (
                      <p className="text-sm text-gray-600 mb-1 line-clamp-1">
                        {reminder.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{formatTime(reminder.scheduledFor)}</span>
                      </div>
                      {clientName && (
                        <Link
                          href={`/clients/${reminder.clientId}`}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {clientName}
                        </Link>
                      )}
                      {projectName && (
                        <Link
                          href={`/projects/${reminder.projectId}`}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {projectName}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <Link
            href="/reminders"
            className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
          >
            View all reminders →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

