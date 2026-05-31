'use client';

import { useUser } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Panel,
  Button,
  StatusPill,
  EmptyState,
  DataTable,
  Modal,
  type Column,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';
import {
  CheckSquare,
  Bell,
  Mail,
  Calendar,
  FileText,
  UserPlus,
  Plus,
  Upload,
  Clock,
  Inbox,
  ArrowRight,
  FolderKanban,
  Building2,
  ListTodo
} from 'lucide-react';
import { useChatDrawer } from '@/contexts/ChatDrawerContext';
import CreateRolodexModal from '@/components/CreateRolodexModal';
import TaskFormCompact from '@/components/TaskFormCompact';
import { Id } from '../../../convex/_generated/dataModel';

export default function Dashboard() {
  const colors = useColors();
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const firstName = user?.firstName || 'there';
  const { setIsOpen: setChatDrawerOpen } = useChatDrawer();

  // State for modals
  const [isCreateContactModalOpen, setIsCreateContactModalOpen] = useState(false);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);

  // State for today's date (client-side only to avoid hydration mismatch)
  const [todayDate, setTodayDate] = useState<string>('');

  // Fetch dashboard data
  const taskMetrics = useQuery(api.tasks.getMetrics, {});
  const nextReminder = useQuery(api.reminders.getUpcoming, { limit: 1 });
  const nextEvent = useQuery(api.events.getNextEvent, {});
  const upcomingTasks = useQuery(api.tasks.getByUser, {});
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});

  // Format date/time helpers
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMs < 0) return 'Overdue';
    if (diffMins < 60) return `${diffMins} minutes`;
    if (diffHours < 24) return `${diffHours} hours`;
    if (diffDays < 7) return `${diffDays} days`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const formatTimeRemaining = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMs < 0) return { text: 'Overdue', urgent: true, isOverdue: true };
    if (diffMins < 60) return { text: `${diffMins}m remaining`, urgent: diffMins < 30, isOverdue: false };
    if (diffHours < 24) return { text: `${diffHours}h remaining`, urgent: diffHours < 2, isOverdue: false };
    if (diffDays < 7) return { text: `${diffDays}d remaining`, urgent: false, isOverdue: false };
    return { text: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), urgent: false, isOverdue: false };
  };

  // Set today's date on client side only (to avoid hydration mismatch)
  useEffect(() => {
    const today = new Date();
    setTodayDate(today.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  // Filter upcoming tasks (non-completed, include all tasks including overdue)
  const filteredUpcomingTasks = upcomingTasks?.filter(task => {
    // Exclude only completed and cancelled tasks
    return task.status !== 'completed' && task.status !== 'cancelled';
  }).sort((a, b) => {
    // Sort: overdue tasks first (most urgent), then upcoming tasks, then tasks without due dates
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1; // Tasks without due dates go to end
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  }).slice(0, 10) || [];

  // Get client/project names for tasks
  const getTaskClientName = (clientId?: Id<'clients'>) => {
    if (!clientId) return null;
    return clients?.find(c => c._id === clientId)?.name;
  };

  const getTaskProjectName = (projectId?: Id<'projects'>) => {
    if (!projectId) return null;
    return projects?.find(p => p._id === projectId)?.name;
  };

  const getTaskName = (taskId?: Id<'tasks'>) => {
    if (!taskId) return null;
    return upcomingTasks?.find(t => t._id === taskId)?.title;
  };

  const getPriorityTone = (priority: string, c: ColorPalette) => {
    switch (priority) {
      case 'high': return c.accent.red;
      case 'medium': return c.accent.yellow;
      case 'low': return c.accent.blue;
      default: return c.text.muted;
    }
  };

  // Check if task/reminder is overdue
  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    const date = new Date(dueDate);
    const now = new Date();
    return date.getTime() < now.getTime();
  };

  // Check if task/reminder is urgent
  const isUrgent = (dueDate?: string) => {
    if (!dueDate) return false;
    const date = new Date(dueDate);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    return diffMs < 0 || diffHours < 24; // Overdue or less than 24 hours
  };

  // Action handlers
  const handleNewNote = () => {
    router.push('/notes');
  };

  const handleNewContact = () => {
    setIsCreateContactModalOpen(true);
  };

  const handleNewTask = () => {
    setIsCreateTaskModalOpen(true);
  };

  const handleNewReminder = () => {
    router.push('/tasks');
  };

  const handleNewUpload = () => {
    router.push('/docs');
  };

  const metaText = (children: React.ReactNode) => (
    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>
      {children}
    </span>
  );

  const linkStyle = { fontSize: 12, color: colors.text.secondary, textDecoration: 'none' } as const;

  const upcomingTaskColumns: Column<typeof filteredUpcomingTasks[number]>[] = [
    {
      key: 'task',
      header: 'Task',
      render: (task) => (
        <div className="flex flex-col">
          <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{task.title}</span>
          {(getTaskClientName(task.clientId) || getTaskProjectName(task.projectId)) && (
            <span style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
              {getTaskClientName(task.clientId) && getTaskProjectName(task.projectId)
                ? `${getTaskClientName(task.clientId)} • ${getTaskProjectName(task.projectId)}`
                : getTaskClientName(task.clientId) || getTaskProjectName(task.projectId)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Due Date',
      render: (task) => (
        <div className="flex items-center gap-2">
          <Clock className="w-3 h-3" style={{ color: colors.text.muted }} />
          <span style={{ fontSize: 11, color: colors.text.secondary }}>
            {task.dueDate ? formatDate(task.dueDate) : 'No due date'}
          </span>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (task) => (
        <StatusPill label={task.priority || 'medium'} tone={getPriorityTone(task.priority || 'medium', colors)} />
      ),
    },
  ];

  return (
    <div style={{ background: colors.bg.light, minHeight: '100vh' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 style={{ fontSize: 28, fontWeight: 600, color: colors.text.primary }}>
            Hello {isLoaded ? firstName : '...'}
          </h1>
          <p style={{ marginTop: 8, fontSize: 15, color: colors.text.muted }}>
            Here is what you have to do today — {todayDate || '...'}
          </p>
        </div>

        {/* Action Buttons - Moved Above Cards */}
        <div className="mb-8">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Button variant="secondary" onClick={handleNewNote} style={{ justifyContent: 'center', height: 36 }}>
              <FileText className="w-4 h-4" style={{ color: colors.accent.blue }} />
              <span>New Note</span>
            </Button>
            <Button variant="secondary" onClick={handleNewContact} style={{ justifyContent: 'center', height: 36 }}>
              <UserPlus className="w-4 h-4" style={{ color: colors.accent.green }} />
              <span>New Contact</span>
            </Button>
            <Button variant="secondary" disabled style={{ justifyContent: 'center', height: 36 }}>
              <Mail className="w-4 h-4" style={{ color: colors.accent.purple }} />
              <span>New E-mail</span>
            </Button>
            <Button variant="secondary" onClick={handleNewTask} style={{ justifyContent: 'center', height: 36 }}>
              <Plus className="w-4 h-4" style={{ color: colors.accent.yellow }} />
              <span>New Task</span>
            </Button>
            <Button variant="secondary" onClick={handleNewReminder} style={{ justifyContent: 'center', height: 36 }}>
              <Bell className="w-4 h-4" style={{ color: colors.accent.orange }} />
              <span>New Reminder</span>
            </Button>
            <Button variant="secondary" onClick={handleNewUpload} style={{ justifyContent: 'center', height: 36 }}>
              <Upload className="w-4 h-4" style={{ color: colors.accent.red }} />
              <span>New Upload</span>
            </Button>
          </div>
        </div>

        {/* Dynamic Cards - 3 Rectangular Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 items-stretch">
          {/* Next Task Card */}
          <Panel
            title="Next Task"
            accent={colors.accent.blue}
            actions={metaText(
              taskMetrics?.upNext?.dueDate && isOverdue(taskMetrics.upNext.dueDate)
                ? 'Overdue'
                : taskMetrics?.upNext
                ? 'Upcoming'
                : 'No Task'
            )}
          >
            <div className="flex flex-col h-full">
              <div className="mb-3">
                {taskMetrics?.upNext ? (
                  <>
                    <h2 style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary, marginBottom: 8 }}>
                      {taskMetrics.upNext.title}
                    </h2>
                    {taskMetrics.upNext.description && (
                      <p className="line-clamp-2" style={{ fontSize: 12, color: colors.text.muted, marginBottom: 8 }}>
                        {taskMetrics.upNext.description}
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {getTaskClientName(taskMetrics.upNext.clientId) && (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3 h-3" style={{ color: colors.text.muted }} />
                          <span style={{ fontSize: 11, color: colors.text.muted }}>Client:</span>
                          <Link href={`/clients/${taskMetrics.upNext.clientId}`} style={linkStyle}>
                            {getTaskClientName(taskMetrics.upNext.clientId)}
                          </Link>
                        </div>
                      )}
                      {getTaskProjectName(taskMetrics.upNext.projectId) && (
                        <div className="flex items-center gap-1.5">
                          <FolderKanban className="w-3 h-3" style={{ color: colors.text.muted }} />
                          <span style={{ fontSize: 11, color: colors.text.muted }}>Project:</span>
                          <Link href={`/projects/${taskMetrics.upNext.projectId}`} style={{ ...linkStyle, fontWeight: 600 }}>
                            {getTaskProjectName(taskMetrics.upNext.projectId)}
                          </Link>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: colors.text.muted }}>
                    No tasks scheduled
                  </h2>
                )}
              </div>

              <div className="mt-auto flex items-center justify-between" style={{ paddingTop: 8, borderTop: `1px solid ${colors.border.default}` }}>
                <div className="flex items-center gap-2">
                  {taskMetrics?.upNext?.dueDate ? (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" style={{ color: colors.text.muted }} />
                      <span style={{ fontSize: 11, fontWeight: 500, color: formatTimeRemaining(taskMetrics.upNext.dueDate).urgent ? colors.accent.red : colors.text.secondary }}>
                        {formatTimeRemaining(taskMetrics.upNext.dueDate).text}
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: colors.text.dim }}>No scheduled time</span>
                  )}
                  {taskMetrics?.upNext?.priority && (
                    <StatusPill label={taskMetrics.upNext.priority} tone={getPriorityTone(taskMetrics.upNext.priority, colors)} />
                  )}
                </div>
                <Button variant="secondary" size="sm" onClick={() => router.push('/tasks')}>
                  {taskMetrics?.upNext ? 'View Task' : 'Create Task'}
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </Panel>

          {/* Next Reminder Card */}
          <Panel
            title="Next Reminder"
            accent={colors.accent.orange}
            actions={metaText(
              nextReminder && nextReminder.length > 0 && nextReminder[0].scheduledFor && isOverdue(nextReminder[0].scheduledFor)
                ? 'Overdue'
                : nextReminder && nextReminder.length > 0
                ? 'Upcoming'
                : 'No Reminder'
            )}
          >
            <div className="flex flex-col h-full">
              <div className="mb-3">
                {nextReminder && nextReminder.length > 0 ? (
                  <>
                    <h2 style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary, marginBottom: 8 }}>
                      {nextReminder[0].title}
                    </h2>
                    {nextReminder[0].description && (
                      <p className="line-clamp-2" style={{ fontSize: 12, color: colors.text.muted, marginBottom: 8 }}>
                        {nextReminder[0].description}
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {getTaskName(nextReminder[0].taskId) && (
                        <div className="flex items-center gap-1.5">
                          <ListTodo className="w-3 h-3" style={{ color: colors.text.muted }} />
                          <span style={{ fontSize: 11, color: colors.text.muted }}>Task:</span>
                          <Link href={`/tasks`} style={linkStyle}>
                            {getTaskName(nextReminder[0].taskId)}
                          </Link>
                        </div>
                      )}
                      {getTaskClientName(nextReminder[0].clientId) && (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3 h-3" style={{ color: colors.text.muted }} />
                          <span style={{ fontSize: 11, color: colors.text.muted }}>Client:</span>
                          <Link href={`/clients/${nextReminder[0].clientId}`} style={linkStyle}>
                            {getTaskClientName(nextReminder[0].clientId)}
                          </Link>
                        </div>
                      )}
                      {getTaskProjectName(nextReminder[0].projectId) && (
                        <div className="flex items-center gap-1.5">
                          <FolderKanban className="w-3 h-3" style={{ color: colors.text.muted }} />
                          <span style={{ fontSize: 11, color: colors.text.muted }}>Project:</span>
                          <Link href={`/projects/${nextReminder[0].projectId}`} style={{ ...linkStyle, fontWeight: 600 }}>
                            {getTaskProjectName(nextReminder[0].projectId)}
                          </Link>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: colors.text.muted }}>
                    No reminders scheduled
                  </h2>
                )}
              </div>

              <div className="mt-auto flex items-center justify-between" style={{ paddingTop: 8, borderTop: `1px solid ${colors.border.default}` }}>
                <div className="flex items-center gap-2">
                  {nextReminder && nextReminder.length > 0 && nextReminder[0].scheduledFor ? (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" style={{ color: colors.text.muted }} />
                      <span style={{ fontSize: 11, fontWeight: 500, color: formatTimeRemaining(nextReminder[0].scheduledFor).urgent ? colors.accent.red : colors.text.secondary }}>
                        {formatTimeRemaining(nextReminder[0].scheduledFor).text}
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: colors.text.dim }}>No scheduled time</span>
                  )}
                </div>
                <Button variant="secondary" size="sm" onClick={() => router.push('/tasks')}>
                  {nextReminder && nextReminder.length > 0 ? 'View Reminder' : 'Create Reminder'}
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </Panel>

          {/* Next Event Card */}
          <Panel
            title="Next Event"
            accent={colors.accent.blue}
            actions={metaText(
              nextEvent && nextEvent.startTime && isOverdue(nextEvent.startTime)
                ? 'Overdue'
                : nextEvent
                ? 'Upcoming'
                : 'No Event'
            )}
          >
            <div className="flex flex-col h-full">
              <div className="mb-3">
                {nextEvent ? (
                  <>
                    <h2 style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary, marginBottom: 8 }}>
                      {nextEvent.title}
                    </h2>
                    {nextEvent.description && (
                      <p className="line-clamp-2" style={{ fontSize: 12, color: colors.text.muted, marginBottom: 8 }}>
                        {nextEvent.description}
                      </p>
                    )}
                    {nextEvent.location && (
                      <p className="flex items-center gap-1" style={{ fontSize: 11, color: colors.text.muted, marginBottom: 8 }}>
                        <span className="w-3 h-3">📍</span>
                        {nextEvent.location}
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {getTaskClientName(nextEvent.clientId) && (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3 h-3" style={{ color: colors.text.muted }} />
                          <span style={{ fontSize: 11, color: colors.text.muted }}>Client:</span>
                          <Link href={`/clients/${nextEvent.clientId}`} style={linkStyle}>
                            {getTaskClientName(nextEvent.clientId)}
                          </Link>
                        </div>
                      )}
                      {getTaskProjectName(nextEvent.projectId) && (
                        <div className="flex items-center gap-1.5">
                          <FolderKanban className="w-3 h-3" style={{ color: colors.text.muted }} />
                          <span style={{ fontSize: 11, color: colors.text.muted }}>Project:</span>
                          <Link href={`/projects/${nextEvent.projectId}`} style={{ ...linkStyle, fontWeight: 600 }}>
                            {getTaskProjectName(nextEvent.projectId)}
                          </Link>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: colors.text.muted }}>
                    No events scheduled
                  </h2>
                )}
              </div>

              <div className="mt-auto flex items-center justify-between" style={{ paddingTop: 8, borderTop: `1px solid ${colors.border.default}` }}>
                <div className="flex items-center gap-2">
                  {nextEvent?.startTime ? (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" style={{ color: colors.text.muted }} />
                      <span style={{ fontSize: 11, fontWeight: 500, color: formatTimeRemaining(nextEvent.startTime).urgent ? colors.accent.red : colors.text.secondary }}>
                        {formatTimeRemaining(nextEvent.startTime).text}
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: colors.text.dim }}>No scheduled time</span>
                  )}
                </div>
                <Button variant="secondary" size="sm" onClick={() => router.push('/calendar')}>
                  {nextEvent ? 'View Event' : 'Create Event'}
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </Panel>
        </div>

        {/* Tables Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inbox */}
          <Panel title="Inbox" accent={colors.accent.blue} actions={metaText('Notifications & Emails')}>
            <div className="flex flex-col h-full">
              <EmptyState
                icon={<Inbox size={28} />}
                title="Coming soon"
                body="Email integration and notifications will appear here."
              />
              <div className="mt-4 flex">
                <Button variant="secondary" size="sm" onClick={() => router.push('/inbox')} style={{ marginLeft: 'auto' }}>
                  View Inbox
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </Panel>

          {/* Upcoming Tasks */}
          <Panel
            title="Upcoming Tasks"
            accent={colors.accent.blue}
            actions={metaText(
              upcomingTasks === undefined
                ? 'Loading...'
                : filteredUpcomingTasks.length > 0
                ? `${filteredUpcomingTasks.length} Tasks`
                : 'No Tasks'
            )}
          >
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto">
                <DataTable
                  columns={upcomingTaskColumns}
                  rows={filteredUpcomingTasks.slice(0, 5)}
                  getRowKey={(task) => task._id}
                  empty={
                    <EmptyState icon={<CheckSquare size={28} />} title="No upcoming tasks" />
                  }
                />
                {filteredUpcomingTasks.length > 5 && (
                  <p style={{ fontSize: 11, color: colors.text.muted, textAlign: 'center', marginTop: 8 }}>
                    +{filteredUpcomingTasks.length - 5} more tasks
                  </p>
                )}
              </div>
              <div className="mt-4 flex">
                <Button variant="secondary" size="sm" onClick={() => router.push('/tasks')} style={{ marginLeft: 'auto' }}>
                  {filteredUpcomingTasks && filteredUpcomingTasks.length > 0 ? 'View All Tasks' : 'Create Task'}
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </Panel>
        </div>

        {/* Modals */}
        <CreateRolodexModal
          isOpen={isCreateContactModalOpen}
          onClose={() => setIsCreateContactModalOpen(false)}
          onSuccess={() => {
            setIsCreateContactModalOpen(false);
          }}
        />

        <Modal
          open={isCreateTaskModalOpen}
          onClose={() => setIsCreateTaskModalOpen(false)}
          title="Create New Task"
          width={672}
        >
          <TaskFormCompact
            onSuccess={() => {
              setIsCreateTaskModalOpen(false);
            }}
            onCancel={() => {
              setIsCreateTaskModalOpen(false);
            }}
          />
        </Modal>
      </div>
    </div>
  );
}
