'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Plus } from 'lucide-react';
import TaskSummaryPills from '@/components/tasks/TaskSummaryPills';
import TaskDayStrip from '@/components/tasks/TaskDayStrip';
import TaskListItem from '@/components/tasks/TaskListItem';
import TaskDetailSheet from '@/components/tasks/TaskDetailSheet';
import TaskCreationFlow from '@/components/tasks/TaskCreationFlow';

export default function TasksPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<'tasks'> | null>(null);
  const [showCreation, setShowCreation] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'reminders'>('tasks');

  const tasks = useQuery(api.tasks.getByUser, { includeCreated: true, includeAssigned: true });
  const metrics = useQuery(api.tasks.getMetrics, {});
  const clients = useQuery(api.clients.list, {});
  const reminders = useQuery(api.reminders.getByUser, {});
  const completeTask = useMutation(api.tasks.complete);

  const dateRange = useMemo(() => {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 6);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }, []);

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

  return (
    <div className="bg-gray-50 min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tasks</h1>
            <p className="mt-1 text-gray-500">Manage your tasks and reminders</p>
          </div>
          <button
            onClick={() => setShowCreation(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>

        {/* Summary + Day Strip */}
        <TaskSummaryPills metrics={metrics} />
        <TaskDayStrip
          dateCounts={dateCounts}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {(['tasks', 'reminders'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'tasks' ? 'Tasks' : 'Reminders'}
            </button>
          ))}
        </div>

        {/* Two-panel layout */}
        {activeTab === 'tasks' ? (
          <div className="flex gap-6">
            {/* Left: task list */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {sectionLabel}
              </div>
              <div className="space-y-2">
                {displayTasks.length === 0 ? (
                  <div className="text-center py-12 text-sm text-gray-400">
                    {selectedDate ? 'No tasks due on this day' : 'No tasks yet'}
                  </div>
                ) : (
                  displayTasks.map(task => (
                    <TaskListItem
                      key={task._id}
                      task={task}
                      onTap={() => setSelectedTaskId(task._id)}
                      onToggleComplete={() => completeTask({ id: task._id })}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Right: detail panel */}
            <div className="w-[400px] flex-shrink-0 bg-white border border-gray-200 rounded-lg min-h-[400px]">
              <TaskDetailSheet
                taskId={selectedTaskId}
                isOpen={true}
                onClose={() => setSelectedTaskId(null)}
                variant="panel"
              />
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <p className="text-sm text-gray-500 mb-4">Your reminders</p>
            {reminders && reminders.length > 0 ? (
              <div className="space-y-2">
                {reminders.filter(r => r.status !== 'completed').map(reminder => (
                  <div key={reminder._id} className="border border-gray-200 rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-900">{reminder.title}</div>
                    {reminder.description && (
                      <div className="text-xs text-gray-500 mt-1">{reminder.description}</div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(reminder.scheduledFor).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No reminders</p>
            )}
          </div>
        )}
      </div>

      {/* Creation modal */}
      {showCreation && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowCreation(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
            <div className="bg-white rounded-2xl w-[500px] h-[600px] shadow-xl overflow-hidden">
              <TaskCreationFlow
                onTaskCreated={(taskId) => {
                  setShowCreation(false);
                  setSelectedTaskId(taskId as Id<'tasks'>);
                }}
                onClose={() => setShowCreation(false)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
