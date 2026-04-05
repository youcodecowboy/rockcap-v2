'use client';

import { useUser } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';

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
  const projects = useQuery(api.projects.list, {});
  const clients = useQuery(api.clients.list, {});
  const recentDocs = useQuery(api.documents.getRecent, { limit: 3 });

  return (
    <div>
      <div className="px-[var(--m-page-px)] pt-5 pb-1.5">
        <h1 className="text-[17px] font-medium text-[var(--m-text-primary)] tracking-[-0.01em]">
          Hello, {firstName}
        </h1>
        <p className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5">
          Loading...
        </p>
      </div>
    </div>
  );
}
