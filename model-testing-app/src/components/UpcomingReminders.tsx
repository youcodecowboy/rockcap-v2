'use client';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Panel, EmptyState, SkeletonText } from '@/components/layouts';
import { Clock, Calendar } from 'lucide-react';
import Link from 'next/link';
import { useColors } from '@/lib/useColors';

export default function UpcomingReminders() {
  const colors = useColors();
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
      <Panel title="Upcoming Reminders" accent={colors.accent.orange}>
        <SkeletonText lines={3} />
      </Panel>
    );
  }

  if (reminders.length === 0) {
    return (
      <Panel title="Upcoming Reminders" accent={colors.accent.orange}>
        <EmptyState
          icon={<Clock size={28} />}
          title="No upcoming reminders"
          body="Your reminders for the next 7 days will appear here."
          action={
            <Link
              href="/reminders"
              style={{ fontSize: 12, color: colors.accent.blue, textDecoration: 'none' }}
            >
              Create a reminder
            </Link>
          }
        />
      </Panel>
    );
  }

  return (
    <Panel title="Upcoming Reminders" accent={colors.accent.orange}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
              style={{
                padding: 12,
                background: colors.bg.light,
                border: `1px solid ${colors.border.default}`,
                borderRadius: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, marginBottom: 4 }}>
                    {reminder.title}
                  </h3>
                  {reminder.description && (
                    <p
                      style={{ fontSize: 12, color: colors.text.muted, marginBottom: 4 }}
                      className="line-clamp-1"
                    >
                      {reminder.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: colors.text.muted }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={12} />
                      <span>{formatTime(reminder.scheduledFor)}</span>
                    </div>
                    {clientName && (
                      <Link
                        href={`/clients/${reminder.clientId}`}
                        style={{ color: colors.accent.blue, textDecoration: 'none' }}
                      >
                        {clientName}
                      </Link>
                    )}
                    {projectName && (
                      <Link
                        href={`/projects/${reminder.projectId}`}
                        style={{ color: colors.accent.blue, textDecoration: 'none' }}
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
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border.default}` }}>
        <Link
          href="/reminders"
          style={{ fontSize: 12, color: colors.accent.blue, textDecoration: 'none' }}
        >
          View all reminders →
        </Link>
      </div>
    </Panel>
  );
}
