import {
  View, Text, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ScrollView,
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
import TaskCreateSheet from '@/components/TaskCreateSheet';
import TaskListItem from '@/components/TaskListItem';

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
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [taskFilter, setTaskFilter] = useState<'active' | 'done' | 'all'>('active');

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
      clientName: (t as any).clientId ? clientNameMap[(t as any).clientId] : undefined,
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

    // Apply task filter
    const filteredTasks = taskItems.filter((t) => {
      if (taskFilter === 'active') return t.status !== 'completed' && t.status !== 'cancelled';
      if (taskFilter === 'done') return t.status === 'completed';
      return true;
    });

    // If a specific day is selected, filter to that day
    if (selectedDay) {
      const dayEnd = new Date(selectedDay);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayTasks = filteredTasks.filter((t) => {
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

    // No day selected — group into sections with sorting
    const overdue: ListItem[] = [];
    const dueTodayItems: ListItem[] = [];
    const tomorrowItems: ListItem[] = [];
    const futureItems: ListItem[] = [];
    const noDueDate: ListItem[] = [];
    const completedItems: ListItem[] = [];

    // Sort tasks: overdue first, then by due date, then by priority
    const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const sortedTasks = [...filteredTasks].sort((a, b) => {
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return (priorityWeight[a.priority || 'medium'] || 1) - (priorityWeight[b.priority || 'medium'] || 1);
    });

    for (const t of sortedTasks) {
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

    // Add events to the relevant sections
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
  }, [tasks, events, selectedDay, showCompleted, taskFilter, clientNameMap]);

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

  const handleComplete = useCallback(async (taskId: string) => {
    try {
      await completeTask({ id: taskId } as any);
    } catch {
      Alert.alert('Error', 'Failed to complete task');
    }
  }, [completeTask]);

  const handleOpenTask = useCallback((taskId: string) => {
    const fullTask = tasks?.find((t) => t._id === taskId);
    if (fullTask) {
      setSelectedTask(fullTask);
    }
  }, [tasks]);

  // ── Render helpers ─────────────────────────────────────────

  const renderMetricPill = (
    label: string,
    count: number,
    icon: React.ReactNode,
  ) => (
    <View key={label} className="flex-1 bg-m-bg-card border border-m-border rounded-xl px-3 py-2.5 items-center">
      <View className="mb-1">{icon}</View>
      <Text className="text-lg font-bold text-m-text-primary">{count}</Text>
      <Text className="text-[10px] text-m-text-tertiary mt-0.5">{label}</Text>
    </View>
  );

  const sectionHeaderColor: Record<string, string> = {
    'Overdue': colors.error,
    'Today': colors.warning,
    'Tomorrow': colors.textTertiary,
    'Upcoming': colors.textTertiary,
    'No due date': colors.textTertiary,
    'Completed': colors.textTertiary,
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
                    {renderMetricPill('To Do', metrics.todo, <Circle size={16} color="#3b82f6" />)}
                    {renderMetricPill('In Progress', metrics.inProgress, <ArrowRight size={16} color="#3b82f6" />)}
                    {renderMetricPill('Meetings', metrics.meetings, <Calendar size={16} color="#6366f1" />)}
                  </View>
                  <View className="flex-row gap-2">
                    {renderMetricPill('Completed', metrics.completed, <CheckCircle2 size={16} color={colors.success} />)}
                    {renderMetricPill('Overdue', metrics.overdue, <AlertCircle size={16} color={colors.error} />)}
                    {renderMetricPill('Due Today', metrics.dueToday, <Calendar size={16} color={colors.warning} />)}
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
                          {isToday && !isSelected && (
                            <Text className="text-[8px] font-bold text-m-accent mt-0.5">TODAY</Text>
                          )}
                          {hasItems && !isSelected && !isToday && (
                            <View className="w-1 h-1 rounded-full bg-m-accent mt-1" />
                          )}
                          {hasItems && isSelected && (
                            <View className="w-1 h-1 rounded-full bg-white mt-1" />
                          )}
                          {hasItems && isToday && !isSelected && (
                            <View className="w-1 h-1 rounded-full bg-m-accent mt-0.5" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* ── Filter Pills ── */}
              <View className="flex-row px-4 pb-2 gap-2">
                {(['active', 'done', 'all'] as const).map((filter) => {
                  const active = taskFilter === filter;
                  const count = filter === 'active'
                    ? tasks?.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length ?? 0
                    : filter === 'done'
                      ? tasks?.filter((t) => t.status === 'completed').length ?? 0
                      : tasks?.length ?? 0;
                  return (
                    <TouchableOpacity
                      key={filter}
                      onPress={() => setTaskFilter(filter)}
                      className={`px-3 py-1.5 rounded-full border ${
                        active ? 'bg-m-accent border-m-accent' : 'border-m-border bg-m-bg-card'
                      }`}
                    >
                      <Text className={`text-xs font-medium ${active ? 'text-m-text-on-brand' : 'text-m-text-secondary'}`}>
                        {filter.charAt(0).toUpperCase() + filter.slice(1)} {count}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              const section = item.section!;
              const isCompletedSection = section.title === 'Completed';
              const headerColor = sectionHeaderColor[section.title] || colors.textTertiary;
              return (
                <TouchableOpacity
                  onPress={isCompletedSection ? () => setShowCompleted((s) => !s) : undefined}
                  activeOpacity={isCompletedSection ? 0.6 : 1}
                  className="px-4 pt-4 pb-1.5 flex-row items-center justify-between"
                >
                  <View className="flex-row items-center gap-1.5">
                    <Text
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: headerColor }}
                    >
                      {section.title}
                    </Text>
                    <Text className="text-xs font-normal text-m-text-tertiary">
                      ({section.data.length})
                    </Text>
                  </View>
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
                {listItem._type === 'task' ? (
                  <TaskListItem
                    task={listItem}
                    onComplete={handleComplete}
                    onPress={handleOpenTask}
                  />
                ) : (
                  renderEventItem(listItem)
                )}
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

      {/* Task create sheet */}
      <TaskCreateSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(taskId) => {
          const newTask = tasks?.find((t) => t._id === taskId);
          if (newTask) setSelectedTask(newTask);
        }}
      />

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
