import {
  View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import {
  Plus, Circle, CheckCircle2, ArrowRight, Calendar, AlertCircle, ChevronLeft, ChevronRight, Clock, MapPin,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';
import MobileHeader from '@/components/MobileHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import TaskDetailSheet from '@/components/TaskDetailSheet';

// ── Date helpers ──────────────────────────────────────────────

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDayAbbrev(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3);
}

function getDueLabel(dueDate: string): { text: string; color: string } {
  const due = new Date(dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) return { text: `Overdue ${Math.abs(diffDays)}d`, color: colors.error };
  if (diffDays === 0) return { text: 'Due today', color: colors.warning };
  if (diffDays === 1) return { text: 'Tomorrow', color: colors.textSecondary };
  if (diffDays < 7) return { text: due.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), color: colors.textTertiary };
  return { text: due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), color: colors.textTertiary };
}

function getAccentColor(task: { status: string; dueDate?: string }): string {
  if (task.status === 'in_progress') return '#3b82f6'; // blue
  if (task.status === 'paused') return '#f59e0b'; // amber
  if (task.dueDate && task.status !== 'completed') {
    const due = new Date(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due < today) return colors.error;
  }
  return 'transparent';
}

// ── Types ─────────────────────────────────────────────────────

type TaskItem = {
  _type: 'task';
  _id: string;
  title: string;
  status: string;
  dueDate?: string;
  priority?: string;
  clientName?: string;
};

type EventItem = {
  _type: 'event';
  _id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  syncStatus?: string;
};

type ListItem = TaskItem | EventItem;

type Section = {
  title: string;
  data: ListItem[];
  collapsed?: boolean;
};

// ── Component ─────────────────────────────────────────────────

export default function TasksScreen() {
  const router = useRouter();
  const { create } = useLocalSearchParams();
  const { isAuthenticated } = useConvexAuth();
  const [showCreate, setShowCreate] = useState(create === 'true');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);

  // Client/project name lookups
  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const projects = useQuery(api.projects.list, isAuthenticated ? {} : 'skip');

  const clientNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (clients) {
      for (const c of clients) {
        map[c._id] = c.name ?? c.company ?? c._id;
      }
    }
    return map;
  }, [clients]);

  const projectNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (projects) {
      for (const p of projects) {
        map[p._id] = (p as any).name ?? (p as any).address ?? p._id;
      }
    }
    return map;
  }, [projects]);

  // Week dates
  const baseDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekStart = useMemo(() => startOfWeek(baseDate), [baseDate]);
  const weekEnd = useMemo(() => endOfWeek(baseDate), [baseDate]);
  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekStart]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Data queries
  const tasks = useQuery(api.tasks.getByUser, isAuthenticated ? {} : 'skip');
  const events = useQuery(
    api.events.getByDateRange,
    isAuthenticated ? { startDate: weekStart.toISOString(), endDate: weekEnd.toISOString() } : 'skip',
  );
  const createTask = useMutation(api.tasks.create);
  const completeTask = useMutation(api.tasks.complete);

  // ── Metrics ───────────────────────────────────────────────

  const metrics = useMemo(() => {
    if (!tasks) return null;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todo = tasks.filter((t) => t.status === 'todo').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const overdue = tasks.filter((t) => {
      if (t.status === 'completed' || t.status === 'cancelled' || !t.dueDate) return false;
      return new Date(t.dueDate) < todayStart;
    }).length;
    const dueToday = tasks.filter((t) => {
      if (t.status === 'completed' || t.status === 'cancelled' || !t.dueDate) return false;
      const d = new Date(t.dueDate);
      return d >= todayStart && d < todayEnd;
    }).length;

    const todayEvents = events?.filter((e) => {
      const start = new Date(e.startTime);
      return start >= todayStart && start < todayEnd;
    }).length ?? 0;

    return { todo, inProgress, completed, overdue, dueToday, meetings: todayEvents };
  }, [tasks, events]);

  // ── Selected day filtering ─────────────────────────────────

  const selectedDay = selectedDayIndex !== null ? weekDays[selectedDayIndex] : null;

  // Count tasks/events per day for the day strip dots
  const dayCounts = useMemo(() => {
    const counts: number[] = new Array(7).fill(0);
    if (!tasks && !events) return counts;
    weekDays.forEach((day, i) => {
      const dayEnd = new Date(day);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const taskCount = tasks?.filter((t) => {
        if (!t.dueDate || t.status === 'completed' || t.status === 'cancelled') return false;
        const d = new Date(t.dueDate);
        return d >= day && d < dayEnd;
      }).length ?? 0;
      const eventCount = events?.filter((e) => {
        const s = new Date(e.startTime);
        return s >= day && s < dayEnd;
      }).length ?? 0;
      counts[i] = taskCount + eventCount;
    });
    return counts;
  }, [tasks, events, weekDays]);

  // ── Build unified list ─────────────────────────────────────

  const sections = useMemo((): Section[] => {
    if (!tasks) return [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

    // Map tasks to list items
    const taskItems: TaskItem[] = tasks.map((t) => ({
      _type: 'task' as const,
      _id: t._id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
      priority: (t as any).priority,
      clientName: (t as any).clientName,
    }));

    // Map events to list items
    const eventItems: EventItem[] = (events ?? []).map((e) => ({
      _type: 'event' as const,
      _id: e._id,
      title: e.title,
      startTime: e.startTime,
      endTime: e.endTime,
      location: e.location,
      syncStatus: e.syncStatus,
    }));

    // If a specific day is selected, filter to that day
    if (selectedDay) {
      const dayEnd = new Date(selectedDay);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayTasks = taskItems.filter((t) => {
        if (t.status === 'completed' || t.status === 'cancelled') return false;
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        return d >= selectedDay && d < dayEnd;
      });
      const dayEvents = eventItems.filter((e) => {
        const s = new Date(e.startTime);
        return s >= selectedDay && s < dayEnd;
      });

      const label = isSameDay(selectedDay, todayStart)
        ? 'Today'
        : selectedDay.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

      const items: ListItem[] = [...dayEvents, ...dayTasks];
      if (items.length === 0) return [];
      return [{ title: label, data: items }];
    }

    // No day selected — group into sections
    const overdue: ListItem[] = [];
    const dueTodayItems: ListItem[] = [];
    const tomorrowItems: ListItem[] = [];
    const futureItems: ListItem[] = [];
    const noDueDate: ListItem[] = [];
    const completedItems: ListItem[] = [];

    for (const t of taskItems) {
      if (t.status === 'completed') {
        completedItems.push(t);
        continue;
      }
      if (t.status === 'cancelled') continue;
      if (!t.dueDate) {
        noDueDate.push(t);
        continue;
      }
      const d = new Date(t.dueDate);
      if (d < todayStart) overdue.push(t);
      else if (d < tomorrowStart) dueTodayItems.push(t);
      else if (d < tomorrowEnd) tomorrowItems.push(t);
      else futureItems.push(t);
    }

    // Add today's events to the "Today" section
    for (const e of eventItems) {
      const s = new Date(e.startTime);
      if (s >= todayStart && s < tomorrowStart) dueTodayItems.unshift(e);
      else if (s >= tomorrowStart && s < tomorrowEnd) tomorrowItems.unshift(e);
      else if (s >= tomorrowEnd) futureItems.unshift(e);
    }

    const result: Section[] = [];
    if (overdue.length > 0) result.push({ title: 'Overdue', data: overdue });
    if (dueTodayItems.length > 0) result.push({ title: 'Today', data: dueTodayItems });
    if (tomorrowItems.length > 0) result.push({ title: 'Tomorrow', data: tomorrowItems });
    if (futureItems.length > 0) result.push({ title: 'Upcoming', data: futureItems });
    if (noDueDate.length > 0) result.push({ title: 'No due date', data: noDueDate });
    if (completedItems.length > 0) result.push({ title: 'Completed', data: completedItems.slice(0, showCompleted ? 20 : 0), collapsed: !showCompleted });

    return result;
  }, [tasks, events, selectedDay, showCompleted]);

  // Flatten sections into a FlatList-friendly array
  const flatData = useMemo(() => {
    const items: { type: 'header' | 'item'; key: string; section?: Section; item?: ListItem }[] = [];
    for (const section of sections) {
      items.push({ type: 'header', key: `header-${section.title}`, section });
      for (const item of section.data) {
        items.push({ type: 'item', key: item._id, item });
      }
    }
    return items;
  }, [sections]);

  // ── Handlers ───────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (!newTaskTitle.trim()) return;
    try {
      await createTask({ title: newTaskTitle.trim() } as any);
      setNewTaskTitle('');
      setShowCreate(false);
    } catch {
      Alert.alert('Error', 'Failed to create task');
    }
  }, [newTaskTitle, createTask]);

  const handleComplete = useCallback(async (taskId: string) => {
    try {
      await completeTask({ id: taskId } as any);
    } catch {
      Alert.alert('Error', 'Failed to complete task');
    }
  }, [completeTask]);

  // ── Render helpers ─────────────────────────────────────────

  const renderMetricPill = (
    label: string,
    count: number,
    icon: React.ReactNode,
    bgColor: string,
  ) => (
    <View key={label} className="flex-1 bg-m-bg-card border border-m-border rounded-xl px-3 py-2.5 items-center">
      <View className="mb-1">{icon}</View>
      <Text className="text-lg font-bold text-m-text-primary">{count}</Text>
      <Text className="text-[10px] text-m-text-tertiary mt-0.5">{label}</Text>
    </View>
  );

  const handleOpenTask = useCallback((task: TaskItem) => {
    // Find the full task data from the query results
    const fullTask = tasks?.find((t) => t._id === task._id);
    if (fullTask) {
      setSelectedTask(fullTask);
    }
  }, [tasks]);

  const renderTaskItem = (task: TaskItem) => {
    const accent = getAccentColor(task);
    const dueLabel = task.dueDate ? getDueLabel(task.dueDate) : null;
    const isCompleted = task.status === 'completed';

    return (
      <View className="bg-m-bg-card border border-m-border rounded-xl overflow-hidden flex-row">
        {/* Left accent border */}
        <View style={{ width: 3, backgroundColor: accent }} />

        <View className="flex-1 flex-row items-center px-3 py-3">
          {/* Checkbox */}
          <TouchableOpacity
            onPress={() => !isCompleted && handleComplete(task._id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="mr-3"
          >
            {isCompleted ? (
              <CheckCircle2 size={20} color={colors.success} />
            ) : (
              <Circle size={20} color={colors.textTertiary} />
            )}
          </TouchableOpacity>

          {/* Content — tappable to open detail */}
          <TouchableOpacity className="flex-1" activeOpacity={0.6} onPress={() => handleOpenTask(task)}>
            <Text
              className={`text-sm ${isCompleted ? 'text-m-text-tertiary line-through' : 'text-m-text-primary'}`}
              numberOfLines={1}
            >
              {task.title}
            </Text>
            <View className="flex-row items-center mt-0.5 gap-2">
              {dueLabel && (
                <Text className="text-xs" style={{ color: dueLabel.color }}>
                  {dueLabel.text}
                </Text>
              )}
              {task.clientName && (
                <Text className="text-xs text-m-text-tertiary" numberOfLines={1}>
                  {task.clientName}
                </Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Priority badge */}
          {task.priority === 'high' && (
            <View className="bg-red-50 rounded px-1.5 py-0.5 ml-2">
              <Text className="text-[10px] font-medium" style={{ color: colors.error }}>High</Text>
            </View>
          )}
          {task.priority === 'medium' && (
            <View className="bg-amber-50 rounded px-1.5 py-0.5 ml-2">
              <Text className="text-[10px] font-medium" style={{ color: colors.warning }}>Med</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderEventItem = (event: EventItem) => {
    const startTime = new Date(event.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const endTime = new Date(event.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    return (
      <View className="bg-m-bg-card border border-m-border rounded-xl overflow-hidden flex-row">
        {/* Left indigo accent */}
        <View style={{ width: 3, backgroundColor: '#6366f1' }} />

        <View className="flex-1 px-3 py-3">
          <View className="flex-row items-center">
            <Calendar size={14} color="#6366f1" />
            {event.syncStatus === 'synced' && (
              <View className="ml-1 w-1.5 h-1.5 rounded-full bg-green-400" />
            )}
            <Text className="text-sm text-m-text-primary font-medium ml-2 flex-1" numberOfLines={1}>
              {event.title}
            </Text>
          </View>
          <View className="flex-row items-center mt-1 gap-2">
            <View className="flex-row items-center">
              <Clock size={11} color={colors.textTertiary} />
              <Text className="text-xs text-m-text-tertiary ml-1">{startTime} - {endTime}</Text>
            </View>
            {event.location && (
              <View className="flex-row items-center">
                <MapPin size={11} color={colors.textTertiary} />
                <Text className="text-xs text-m-text-tertiary ml-0.5" numberOfLines={1}>{event.location}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ── Main render ────────────────────────────────────────────

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-m-bg">
      <MobileHeader />

      {/* Create task bar */}
      {showCreate && (
        <View className="px-4 py-3 bg-m-bg-card border-b border-m-border flex-row items-center gap-2">
          <TextInput
            placeholder="What needs to be done?"
            value={newTaskTitle}
            onChangeText={setNewTaskTitle}
            autoFocus
            onSubmitEditing={handleCreate}
            returnKeyType="done"
            className="flex-1 bg-m-bg-subtle rounded-lg px-3 py-2.5 text-sm text-m-text-primary"
            placeholderTextColor={colors.textPlaceholder}
          />
          <TouchableOpacity
            onPress={handleCreate}
            disabled={!newTaskTitle.trim()}
            className="bg-m-accent rounded-lg px-4 py-2.5"
            style={{ opacity: newTaskTitle.trim() ? 1 : 0.3 }}
          >
            <Text className="text-m-text-on-brand text-sm font-medium">Add</Text>
          </TouchableOpacity>
        </View>
      )}

      {!tasks ? (
        <LoadingSpinner />
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListHeaderComponent={
            <View>
              {/* ── Summary Pills ── */}
              {metrics && (
                <View className="px-4 pt-4 pb-2">
                  <Text className="text-lg font-bold text-m-text-primary mb-3">Tasks</Text>
                  <View className="flex-row gap-2 mb-2">
                    {renderMetricPill('To Do', metrics.todo, <Circle size={16} color="#3b82f6" />, '#eff6ff')}
                    {renderMetricPill('In Progress', metrics.inProgress, <ArrowRight size={16} color="#3b82f6" />, '#eff6ff')}
                    {renderMetricPill('Meetings', metrics.meetings, <Calendar size={16} color="#6366f1" />, '#eef2ff')}
                  </View>
                  <View className="flex-row gap-2">
                    {renderMetricPill('Completed', metrics.completed, <CheckCircle2 size={16} color={colors.success} />, '#ecfdf5')}
                    {renderMetricPill('Overdue', metrics.overdue, <AlertCircle size={16} color={colors.error} />, '#fef2f2')}
                    {renderMetricPill('Due Today', metrics.dueToday, <Calendar size={16} color={colors.warning} />, '#fffbeb')}
                  </View>
                </View>
              )}

              {/* ── Day Strip ── */}
              <View className="px-4 pt-3 pb-2">
                <View className="flex-row items-center justify-between mb-2">
                  <TouchableOpacity onPress={() => { setWeekOffset((w) => w - 1); setSelectedDayIndex(null); }} hitSlop={8}>
                    <ChevronLeft size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setWeekOffset(0); setSelectedDayIndex(null); }}>
                    <Text className="text-xs font-medium text-m-text-secondary">
                      {weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - {weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setWeekOffset((w) => w + 1); setSelectedDayIndex(null); }} hitSlop={8}>
                    <ChevronRight size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-1.5">
                    {weekDays.map((day, i) => {
                      const isToday = isSameDay(day, today);
                      const isSelected = selectedDayIndex === i;
                      const hasItems = dayCounts[i] > 0;

                      return (
                        <TouchableOpacity
                          key={i}
                          onPress={() => setSelectedDayIndex(isSelected ? null : i)}
                          className={`items-center rounded-xl px-3 py-2 min-w-[44px] ${
                            isSelected ? 'bg-m-accent' : isToday ? 'bg-m-bg-subtle' : ''
                          }`}
                          style={isSelected ? undefined : isToday ? { borderWidth: 1, borderColor: colors.border } : undefined}
                        >
                          <Text
                            className={`text-[10px] font-medium ${
                              isSelected ? 'text-m-text-on-brand' : 'text-m-text-tertiary'
                            }`}
                          >
                            {formatDayAbbrev(day)}
                          </Text>
                          <Text
                            className={`text-sm font-bold mt-0.5 ${
                              isSelected ? 'text-m-text-on-brand' : isToday ? 'text-m-text-primary' : 'text-m-text-secondary'
                            }`}
                          >
                            {day.getDate()}
                          </Text>
                          {hasItems && !isSelected && (
                            <View className="w-1 h-1 rounded-full bg-m-accent mt-1" />
                          )}
                          {hasItems && isSelected && (
                            <View className="w-1 h-1 rounded-full bg-white mt-1" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              const section = item.section!;
              const isCompletedSection = section.title === 'Completed';
              return (
                <TouchableOpacity
                  onPress={isCompletedSection ? () => setShowCompleted((s) => !s) : undefined}
                  activeOpacity={isCompletedSection ? 0.6 : 1}
                  className="px-4 pt-4 pb-1.5 flex-row items-center justify-between"
                >
                  <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider">
                    {section.title}
                  </Text>
                  {isCompletedSection && (
                    <Text className="text-xs text-m-text-tertiary">
                      {showCompleted ? 'Hide' : `Show (${tasks?.filter((t) => t.status === 'completed').length ?? 0})`}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            }

            const listItem = item.item!;
            return (
              <View className="px-4 mb-2">
                {listItem._type === 'task' ? renderTaskItem(listItem) : renderEventItem(listItem)}
              </View>
            );
          }}
          ListEmptyComponent={
            selectedDay ? (
              <View className="px-4 pt-8 items-center">
                <Text className="text-sm text-m-text-tertiary">Nothing scheduled for this day</Text>
              </View>
            ) : (
              <EmptyState icon={CheckCircle2} title="No tasks" description="Tap + to create one" />
            )
          }
        />
      )}

      {/* Floating action button */}
      <TouchableOpacity
        onPress={() => setShowCreate(true)}
        className="absolute bottom-6 right-5 w-14 h-14 rounded-full bg-m-accent items-center justify-center"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 4,
        }}
      >
        <Plus size={24} color={colors.textOnBrand} />
      </TouchableOpacity>

      {/* Task detail sheet */}
      {selectedTask && (
        <TaskDetailSheet
          key={selectedTask._id}
          task={selectedTask}
          clientName={selectedTask.clientId ? clientNameMap[selectedTask.clientId] : undefined}
          projectName={selectedTask.projectId ? projectNameMap[selectedTask.projectId] : undefined}
          visible={!!selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </KeyboardAvoidingView>
  );
}
