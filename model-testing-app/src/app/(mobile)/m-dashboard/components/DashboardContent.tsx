'use client';

import { useUser } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import DashboardGreeting from './DashboardGreeting';
import QuickActions from './QuickActions';

export default function DashboardContent() {
  const { user } = useUser();
  const firstName = user?.firstName || 'there';

  // All queries fire in parallel
  const taskMetrics = useQuery(api.tasks.getMetrics, {});
  const tasks = useQuery(api.tasks.getByUser, {});
  const nextReminder = useQuery(api.reminders.getUpcoming, { limit: 1 });
  const nextEvent = useQuery(api.events.getNextEvent, {});
  const notifications = useQuery(api.notifications.getRecent, { limit: 3, includeRead: false });
  const unreadCount = useQuery(api.notifications.getUnreadCount, {});

  // Compute overdue task count
  const overdueCount = tasks
    ? tasks.filter(t =>
        t.status !== 'completed' && t.status !== 'cancelled' &&
        t.dueDate && new Date(t.dueDate) < new Date()
      ).length
    : undefined;

  const projects = useQuery(api.projects.list, {});
  const clients = useQuery(api.clients.list, {});
  const recentDocs = useQuery(api.documents.getRecent, { limit: 3 });

  return (
    <div>
      <DashboardGreeting
        firstName={firstName}
        overdueCount={overdueCount}
        unreadCount={unreadCount ?? undefined}
      />
      <QuickActions />
    </div>
  );
}
