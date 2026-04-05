'use client';

import { useUser } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import DashboardGreeting from './DashboardGreeting';
import QuickActions from './QuickActions';
import UpNextCard, { type UpNextItem } from './UpNextCard';
import NotificationsSection from './NotificationsSection';
import RecentsSection from './RecentsSection';

export default function DashboardContent() {
  const { user } = useUser();
  const firstName = user?.firstName || 'there';

  // All queries fire in parallel
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

  // Build client lookup map (shared by UpNext and RecentsSection later)
  const clientMap = new Map(clients?.map(c => [c._id, c.name]) ?? []);

  const taskCountByProject = new Map<string, number>();
  if (tasks) {
    for (const t of tasks) {
      if (t.projectId && t.status !== 'completed' && t.status !== 'cancelled') {
        taskCountByProject.set(t.projectId, (taskCountByProject.get(t.projectId) ?? 0) + 1);
      }
    }
  }

  const projectCountByClient = new Map<string, number>();
  if (projects) {
    for (const p of projects) {
      for (const role of p.clientRoles) {
        projectCountByClient.set(role.clientId, (projectCountByClient.get(role.clientId) ?? 0) + 1);
      }
    }
  }

  // Resolve the single most urgent "up next" item
  const resolveUpNext = (): UpNextItem | null => {
    const candidates: UpNextItem[] = [];

    // Most urgent active task with a due date
    if (tasks) {
      const activeTasks = tasks
        .filter(t => t.status !== 'completed' && t.status !== 'cancelled' && t.dueDate)
        .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
      const top = activeTasks[0];
      if (top && top.dueDate) {
        candidates.push({
          type: 'task',
          title: top.title,
          context: (top.clientId && clientMap.get(top.clientId)) || 'No client',
          dueDate: new Date(top.dueDate),
          href: '/m-tasks',
        });
      }
    }

    // Most urgent reminder
    if (nextReminder && nextReminder.length > 0) {
      const r = nextReminder[0];
      candidates.push({
        type: 'reminder',
        title: r.title,
        context: (r.clientId && clientMap.get(r.clientId)) || 'Reminder',
        dueDate: new Date(r.scheduledFor),
        href: '/m-tasks',
      });
    }

    // Next event
    if (nextEvent) {
      candidates.push({
        type: 'event',
        title: nextEvent.title,
        context: nextEvent.location || 'No location',
        dueDate: new Date(nextEvent.startTime),
        href: '/m-tasks',
      });
    }

    if (candidates.length === 0) return null;

    // Sort: most overdue first, then soonest upcoming
    const now = Date.now();
    candidates.sort((a, b) => {
      const aOverdue = a.dueDate.getTime() < now;
      const bOverdue = b.dueDate.getTime() < now;
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      return a.dueDate.getTime() - b.dueDate.getTime();
    });

    return candidates[0];
  };

  const upNextItem = resolveUpNext();

  return (
    <div>
      <DashboardGreeting
        firstName={firstName}
        overdueCount={overdueCount}
        unreadCount={unreadCount ?? undefined}
      />
      <QuickActions />
      <UpNextCard item={upNextItem} />
      <NotificationsSection notifications={notifications} unreadCount={unreadCount} />
      <RecentsSection
        projects={projects}
        clients={clients}
        documents={recentDocs}
        clientMap={clientMap}
        taskCountByProject={taskCountByProject}
        projectCountByClient={projectCountByClient}
      />
    </div>
  );
}
