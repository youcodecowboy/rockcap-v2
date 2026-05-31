'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Plus, CheckSquare } from 'lucide-react';
import {
  Button,
  StatTile,
  Panel,
  TabStrip,
  EmptyState,
  Modal,
  Skeleton,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import TaskDayStrip, { getWeekRange } from '@/components/tasks/TaskDayStrip';
import TaskListItem from '@/components/tasks/TaskListItem';
import TaskDetailSheet from '@/components/tasks/TaskDetailSheet';
import TaskCreationFlow from '@/components/tasks/TaskCreationFlow';
import { groupTasksByDate } from '@/components/tasks/groupTasksByDate';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function TasksPage() {
  const colors = useColors();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<'tasks'> | null>(null);
  const [showCreation, setShowCreation] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'reminders'>('tasks');
  const [weekOffset, setWeekOffset] = useState(0);

  const tasks = useQuery(api.tasks.getByUser, { includeCreated: true, includeAssigned: true });
  const metrics = useQuery(api.tasks.getMetrics, {});
  const clients = useQuery(api.clients.list, {});
  const reminders = useQuery(api.reminders.getByUser, {});
  const completeTask = useMutation(api.tasks.complete);

  const dateRange = useMemo(() => getWeekRange(weekOffset), [weekOffset]);

  const dateCounts = useQuery(api.tasks.getByDateRange, dateRange);

  const enhancedTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.map(t => ({
      ...t,
      clientName: t.clientId ? clients?.find(c => c._id === t.clientId)?.name : undefined,
    }));
  }, [tasks, clients]);

  const displayTasks = useMemo(() => {
    let filtered = enhancedTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');

    if (selectedDate) {
      filtered = filtered.filter(t => t.dueDate?.split('T')[0] === selectedDate);
    }

    const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return filtered.sort((a, b) => {
      const now = new Date().toISOString();
      const aOverdue = a.dueDate && a.dueDate < now ? 0 : 1;
      const bOverdue = b.dueDate && b.dueDate < now ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return (priorityWeight[a.priority || 'medium'] || 1) - (priorityWeight[b.priority || 'medium'] || 1);
    });
  }, [enhancedTasks, selectedDate]);

  const sectionLabel = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
    : 'All Tasks';

  const groupedTasks = useMemo(() => {
    if (selectedDate) return null;
    return groupTasksByDate(displayTasks);
  }, [displayTasks, selectedDate]);

  const summaryTiles: { key: keyof NonNullable<typeof metrics>; label: string; accent: string }[] = [
    { key: 'todo', label: 'To Do', accent: colors.accent.blue },
    { key: 'inProgress', label: 'In Progress', accent: colors.accent.blue },
    { key: 'meetingsToday', label: 'Meetings', accent: colors.accent.indigo },
    { key: 'completed', label: 'Completed', accent: colors.accent.green },
    { key: 'overdue', label: 'Overdue', accent: colors.accent.red },
    { key: 'dueToday', label: 'Due Today', accent: colors.accent.yellow },
  ];

  const groupLabelStyle = {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
    marginBottom: 8,
  };

  return (
    <div style={{ minHeight: '100vh', background: colors.bg.base, padding: 32 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 300, color: colors.text.primary }}>Tasks</h1>
            <p style={{ marginTop: 4, fontSize: 13, color: colors.text.muted }}>Manage your tasks and reminders</p>
          </div>
          <Button variant="primary" accent={colors.accent.blue} onClick={() => setShowCreation(true)}>
            <Plus size={14} />
            New Task
          </Button>
        </div>

        {/* Summary tiles */}
        {metrics && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 1,
              background: colors.border.light,
              border: `1px solid ${colors.border.light}`,
            }}
          >
            {summaryTiles.map(tile => (
              <StatTile
                key={tile.key}
                label={tile.label}
                value={metrics[tile.key]}
                accent={tile.accent}
              />
            ))}
          </div>
        )}

        {/* Day Strip */}
        <TaskDayStrip
          dateCounts={dateCounts}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
        />

        {/* Tabs */}
        <TabStrip
          tabs={[
            { id: 'tasks', label: 'Tasks' },
            { id: 'reminders', label: 'Reminders' },
          ]}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as 'tasks' | 'reminders')}
          entityType="deal"
        />

        {/* Two-panel layout */}
        {activeTab === 'tasks' ? (
          <div style={{ display: 'flex', gap: 24 }}>
            {/* Left: task list */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {tasks === undefined ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} height={56} />
                  ))}
                </div>
              ) : displayTasks.length === 0 ? (
                <EmptyState
                  icon={<CheckSquare size={28} />}
                  title={selectedDate ? 'No tasks due on this day' : 'No tasks yet'}
                />
              ) : groupedTasks ? (
                groupedTasks.map(group => (
                  <div key={group.label} style={{ marginBottom: 20 }}>
                    <div style={{ ...groupLabelStyle, color: colors.text.muted }}>
                      {group.label}
                      <span style={{ color: colors.text.dim, fontWeight: 400, marginLeft: 6 }}>({group.tasks.length})</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {group.tasks.map(task => (
                        <TaskListItem
                          key={task._id}
                          task={task}
                          onTap={() => setSelectedTaskId(task._id)}
                          onToggleComplete={() => completeTask({ id: task._id })}
                        />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div>
                  <div style={{ ...groupLabelStyle, color: colors.text.muted }}>{sectionLabel}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {displayTasks.map(task => (
                      <TaskListItem
                        key={task._id}
                        task={task}
                        onTap={() => setSelectedTaskId(task._id)}
                        onToggleComplete={() => completeTask({ id: task._id })}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: detail panel */}
            <div
              style={{
                width: 400,
                flexShrink: 0,
                background: colors.bg.card,
                border: `1px solid ${colors.border.default}`,
                borderRadius: 4,
                minHeight: 400,
              }}
            >
              <TaskDetailSheet
                taskId={selectedTaskId}
                isOpen={true}
                onClose={() => setSelectedTaskId(null)}
                variant="panel"
              />
            </div>
          </div>
        ) : (
          <Panel title="Reminders" accent={colors.accent.blue}>
            {reminders && reminders.filter(r => r.status !== 'completed').length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reminders.filter(r => r.status !== 'completed').map(reminder => (
                  <div
                    key={reminder._id}
                    style={{
                      border: `1px solid ${colors.border.default}`,
                      borderRadius: 4,
                      padding: 12,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{reminder.title}</div>
                    {reminder.description && (
                      <div style={{ fontSize: 12, color: colors.text.muted, marginTop: 4 }}>{reminder.description}</div>
                    )}
                    <div style={{ fontFamily: MONO, fontSize: 10, color: colors.text.dim, marginTop: 4 }}>
                      {new Date(reminder.scheduledFor).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<CheckSquare size={28} />} title="No reminders" />
            )}
          </Panel>
        )}
      </div>

      {/* Creation modal */}
      <Modal open={showCreation} onClose={() => setShowCreation(false)} title="New Task" width={500}>
        <div style={{ height: 560 }}>
          <TaskCreationFlow
            onTaskCreated={(taskId) => {
              setShowCreation(false);
              setSelectedTaskId(taskId as Id<'tasks'>);
            }}
            onClose={() => setShowCreation(false)}
          />
        </div>
      </Modal>
    </div>
  );
}
