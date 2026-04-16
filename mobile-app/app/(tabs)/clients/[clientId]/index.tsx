import { View, Text, ScrollView, TouchableOpacity, TextInput, Linking } from 'react-native';
import { useState, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../../../model-testing-app/convex/_generated/api';
import {
  ArrowLeft,
  Check,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Circle,
  CheckCircle2,
  Plus,
  Mail,
  Phone,
  User,
  AlertTriangle,
  Clock,
  Flag,
  MessageSquare,
  FileText,
  Send,
  X,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// ============================================================================
// Constants
// ============================================================================

const TABS = ['Overview', 'Projects', 'Docs', 'Intelligence', 'Notes', 'Tasks', 'Checklist', 'Meetings', 'Flags'] as const;
type TabName = (typeof TABS)[number];

// ============================================================================
// Utility Functions
// ============================================================================

function extractPlainText(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  const texts: string[] = [];
  function walk(node: any) {
    if (node.text) texts.push(node.text);
    if (node.content) node.content.forEach(walk);
    if (node.children) node.children.forEach(walk);
  }
  walk(content);
  return texts.join(' ');
}

// ============================================================================
// Helper Sub-Components
// ============================================================================

function StatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'xs' }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    active: { bg: 'bg-m-success/15', text: 'text-m-success' },
    fulfilled: { bg: 'bg-m-success/15', text: 'text-m-success' },
    completed: { bg: 'bg-m-success/15', text: 'text-m-success' },
    resolved: { bg: 'bg-m-success/15', text: 'text-m-success' },
    pending: { bg: 'bg-m-warning/15', text: 'text-m-warning' },
    pending_review: { bg: 'bg-m-warning/15', text: 'text-m-warning' },
    in_progress: { bg: 'bg-m-warning/15', text: 'text-m-warning' },
    open: { bg: 'bg-m-error/15', text: 'text-m-error' },
    missing: { bg: 'bg-m-error/15', text: 'text-m-error' },
    overdue: { bg: 'bg-m-error/15', text: 'text-m-error' },
    urgent: { bg: 'bg-m-error/15', text: 'text-m-error' },
  };
  const c = colorMap[status] || { bg: 'bg-m-bg-inset', text: 'text-m-text-tertiary' };
  const textSize = size === 'xs' ? 'text-[10px]' : 'text-xs';

  return (
    <View className={`px-2 py-0.5 rounded-full ${c.bg}`}>
      <Text className={`${textSize} font-medium capitalize ${c.text}`}>
        {status.replace(/_/g, ' ')}
      </Text>
    </View>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
      {title}{count !== undefined ? ` (${count})` : ''}
    </Text>
  );
}

function EmptyState({ message }: { message: string }) {
  return <Text className="text-sm text-m-text-tertiary text-center py-8">{message}</Text>;
}

function QuickLinkRow({ label, value, onPress }: { label: string; value: string | number; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} className="flex-row items-center justify-between py-2">
      <Text className="text-sm text-m-text-secondary">{label}</Text>
      <View className="flex-row items-center gap-1">
        <Text className="text-sm font-semibold text-m-text-primary">{value}</Text>
        <ChevronRight size={14} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
}

function TaskItem({
  task,
  onToggle,
}: {
  task: any;
  onToggle: () => void;
}) {
  const isCompleted = task.status === 'completed';
  const isOverdue = task.dueDate && !isCompleted && new Date(task.dueDate) < new Date();

  return (
    <Card>
      <View className="flex-row items-start gap-3">
        <TouchableOpacity onPress={onToggle} className="mt-0.5">
          {isCompleted ? (
            <CheckCircle2 size={20} color={colors.success} />
          ) : (
            <Circle size={20} color={colors.border} />
          )}
        </TouchableOpacity>
        <View className="flex-1">
          <Text
            className={`text-sm ${isCompleted ? 'text-m-text-tertiary line-through' : 'text-m-text-primary'}`}
          >
            {task.title}
          </Text>
          {task.dueDate ? (
            <Text className={`text-xs mt-1 ${isOverdue ? 'text-m-error font-medium' : 'text-m-text-tertiary'}`}>
              {isOverdue ? 'Overdue: ' : 'Due: '}
              {new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </Text>
          ) : null}
        </View>
        {task.priority === 'high' && (
          <AlertTriangle size={14} color={colors.error} />
        )}
      </View>
    </Card>
  );
}

function ChecklistItem({
  item,
  onCycleStatus,
}: {
  item: any;
  onCycleStatus: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="text-sm text-m-text-primary flex-1 mr-3" numberOfLines={1}>
        {item.name || item.title || 'Item'}
      </Text>
      <TouchableOpacity onPress={onCycleStatus}>
        <StatusBadge status={item.status || 'missing'} size="xs" />
      </TouchableOpacity>
    </View>
  );
}

function FlagCard({
  flag,
  isExpanded,
  onToggle,
  thread,
  onReply,
}: {
  flag: any;
  isExpanded: boolean;
  onToggle: () => void;
  thread: any[] | undefined;
  onReply: (content: string) => void;
}) {
  const [replyText, setReplyText] = useState('');

  return (
    <Card>
      <TouchableOpacity onPress={onToggle}>
        <View className="flex-row items-start gap-2">
          <View
            className={`w-2 h-2 rounded-full mt-1.5 ${
              flag.priority === 'urgent' ? 'bg-m-error' : 'bg-m-warning'
            }`}
          />
          <View className="flex-1">
            <Text className="text-sm font-medium text-m-text-primary">
              {flag.note || 'Flag'}
            </Text>
            <View className="flex-row items-center gap-2 mt-1">
              <StatusBadge status={flag.status || 'open'} size="xs" />
              <Text className="text-[10px] text-m-text-tertiary">
                {new Date(flag.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </Text>
            </View>
          </View>
          {isExpanded ? (
            <ChevronDown size={16} color={colors.textTertiary} />
          ) : (
            <ChevronRight size={16} color={colors.textTertiary} />
          )}
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View className="mt-3 pt-3 border-t border-m-border-subtle">
          {thread && thread.length > 0 ? (
            <View className="gap-2 mb-3">
              {thread.map((entry: any) => (
                <View key={entry._id} className="pl-3 border-l-2 border-m-border-subtle">
                  <Text className="text-xs text-m-text-secondary">{entry.content}</Text>
                  <Text className="text-[10px] text-m-text-tertiary mt-0.5">
                    {entry.entryType === 'activity' ? 'System' : 'Reply'} -{' '}
                    {new Date(entry.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-xs text-m-text-tertiary mb-3">No thread entries yet</Text>
          )}

          <View className="flex-row items-center gap-2">
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Reply..."
              placeholderTextColor={colors.textPlaceholder}
              className="flex-1 bg-m-bg-subtle rounded-lg px-3 py-2 text-sm text-m-text-primary"
            />
            <TouchableOpacity
              onPress={() => {
                if (replyText.trim()) {
                  onReply(replyText.trim());
                  setReplyText('');
                }
              }}
              className="bg-m-accent rounded-lg p-2"
            >
              <Send size={14} color={colors.textOnBrand} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Card>
  );
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View className="mb-2">
      <TouchableOpacity onPress={() => setOpen(!open)} className="flex-row items-center gap-1 mb-1">
        {open ? (
          <ChevronDown size={14} color={colors.textTertiary} />
        ) : (
          <ChevronRight size={14} color={colors.textTertiary} />
        )}
        <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide">{title}</Text>
      </TouchableOpacity>
      {open && children}
    </View>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function ClientDetailScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [activeTab, setActiveTab] = useState<TabName>('Overview');

  // ---------- State for interactive features ----------
  const [expandedFlags, setExpandedFlags] = useState<Set<string>>(new Set());
  const [expandedMeetings, setExpandedMeetings] = useState<Set<string>>(new Set());
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [flagFilter, setFlagFilter] = useState<'open' | 'resolved'>('open');

  // Notes form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');

  // Tasks form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');

  // Flags form
  const [showFlagForm, setShowFlagForm] = useState(false);
  const [flagNote, setFlagNote] = useState('');
  const [flagPriority, setFlagPriority] = useState<'normal' | 'urgent'>('normal');

  // ---------- Queries ----------
  const skip = !isAuthenticated || !clientId;

  const client = useQuery(api.clients.get, skip ? 'skip' : { id: clientId as any });

  const projects = useQuery(api.projects.getByClient, skip ? 'skip' : { clientId: clientId as any });

  const contacts = useQuery(api.contacts.getByClient, skip ? 'skip' : { clientId: clientId as any });

  const tasks = useQuery(api.tasks.getByClient, skip ? 'skip' : { clientId: clientId as any });

  const notes = useQuery(api.notes.getByClient, skip ? 'skip' : { clientId: clientId as any });

  const documents = useQuery(api.documents.getByClient, skip ? 'skip' : { clientId: clientId as any });

  const folderCounts = useQuery(api.documents.getFolderCounts, skip ? 'skip' : { clientId: clientId as any });

  const openFlagCount = useQuery(api.flags.getOpenCountByClient, skip ? 'skip' : { clientId: clientId as any });

  const clientFlags = useQuery(
    api.flags.getByClient,
    skip ? 'skip' : { clientId: clientId as any, status: flagFilter }
  );

  // Optional queries — may not exist
  let intelligence: any = undefined;
  try {
    intelligence = useQuery(
      api.knowledgeLibrary.getKnowledgeItemsByClient,
      skip ? 'skip' : { clientId: clientId as any }
    );
  } catch {
    // Fallback
    try {
      intelligence = useQuery(
        api.intelligence.getClientIntelligence,
        skip ? 'skip' : { clientId: clientId as any }
      );
    } catch {
      // API may not exist
    }
  }

  let checklist: any = undefined;
  try {
    checklist = useQuery(
      api.knowledgeLibrary.getClientLevelChecklist,
      skip ? 'skip' : { clientId: clientId as any }
    );
  } catch {
    // API may not exist
  }

  let meetings: any = undefined;
  try {
    meetings = useQuery(
      api.meetings.getByClient,
      skip ? 'skip' : { clientId: clientId as any }
    );
  } catch {
    // API may not exist
  }

  // Thread queries for expanded flags
  const expandedFlagId = expandedFlags.size === 1 ? Array.from(expandedFlags)[0] : null;
  let flagThread: any = undefined;
  try {
    flagThread = useQuery(
      api.flags.getThread,
      expandedFlagId ? { flagId: expandedFlagId as any } : 'skip'
    );
  } catch {
    // API may not exist
  }

  // ---------- Mutations ----------
  const createNote = useMutation(api.notes.create);
  const createTask = useMutation(api.tasks.create);
  const completeTask = useMutation(api.tasks.complete);
  const updateChecklistStatus = useMutation(api.knowledgeLibrary.updateItemStatus);
  const createFlag = useMutation(api.flags.create);
  const replyToFlag = useMutation(api.flags.reply);

  // ---------- Derived data ----------
  const totalDocs = documents?.length ?? 0;

  const sortedProjects = useMemo(() => {
    if (!projects) return [];
    return [...projects].sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [projects]);

  const taskGroups = useMemo(() => {
    if (!tasks) return { overdue: [], today: [], upcoming: [], noDue: [], completed: [] };
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const groups = { overdue: [] as any[], today: [] as any[], upcoming: [] as any[], noDue: [] as any[], completed: [] as any[] };

    for (const t of tasks) {
      if (t.status === 'completed') {
        groups.completed.push(t);
        continue;
      }
      if (!t.dueDate) {
        groups.noDue.push(t);
        continue;
      }
      const dueStr = t.dueDate.split('T')[0];
      if (dueStr < todayStr) groups.overdue.push(t);
      else if (dueStr === todayStr) groups.today.push(t);
      else groups.upcoming.push(t);
    }

    groups.completed.sort((a: any, b: any) =>
      new Date(b.updatedAt || b._creationTime).getTime() - new Date(a.updatedAt || a._creationTime).getTime()
    );

    return groups;
  }, [tasks]);

  const checklistProgress = useMemo(() => {
    if (!checklist || !Array.isArray(checklist) || checklist.length === 0) return null;
    const total = checklist.length;
    const fulfilled = checklist.filter((i: any) => i.status === 'fulfilled').length;
    return { total, fulfilled, pct: Math.round((fulfilled / total) * 100) };
  }, [checklist]);

  const checklistByCategory = useMemo(() => {
    if (!checklist || !Array.isArray(checklist)) return {};
    const grouped: Record<string, any[]> = {};
    for (const item of checklist) {
      const cat = item.category || 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }
    return grouped;
  }, [checklist]);

  const intelligenceByCategory = useMemo(() => {
    if (!intelligence || !Array.isArray(intelligence)) return {};
    const grouped: Record<string, any[]> = {};
    for (const item of intelligence) {
      const cat = item.category || 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }
    return grouped;
  }, [intelligence]);

  // Docs: project folders with document counts
  const docsProjectFolders = useMemo(() => {
    if (!projects || !folderCounts) return [];
    return projects.map((p) => {
      const pFolders = folderCounts.projectFolders?.[p._id] || {};
      const totalInProject = Object.values(pFolders).reduce((s: number, c: any) => s + (c as number), 0);
      return {
        projectId: p._id,
        projectName: p.name,
        folders: pFolders,
        total: totalInProject,
      };
    }).filter((p) => p.total > 0);
  }, [projects, folderCounts]);

  // ---------- Handlers ----------
  const handleSaveNote = async () => {
    if (!noteTitle.trim()) return;
    try {
      await createNote({
        title: noteTitle.trim(),
        content: noteBody.trim(),
        clientId: clientId as any,
      });
      setNoteTitle('');
      setNoteBody('');
      setShowNoteForm(false);
    } catch (e) {
      console.error('Failed to create note:', e);
    }
  };

  const handleSaveTask = async () => {
    if (!taskTitle.trim()) return;
    try {
      await createTask({
        title: taskTitle.trim(),
        clientId: clientId as any,
        dueDate: taskDueDate || undefined,
      });
      setTaskTitle('');
      setTaskDueDate('');
      setShowTaskForm(false);
    } catch (e) {
      console.error('Failed to create task:', e);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await completeTask({ id: taskId as any });
    } catch (e) {
      console.error('Failed to complete task:', e);
    }
  };

  const handleCycleChecklistStatus = async (itemId: string, currentStatus: string) => {
    const cycle: Record<string, 'missing' | 'pending_review' | 'fulfilled'> = {
      missing: 'pending_review',
      pending_review: 'fulfilled',
      fulfilled: 'missing',
    };
    const next = cycle[currentStatus] || 'pending_review';
    try {
      await updateChecklistStatus({ checklistItemId: itemId as any, status: next });
    } catch (e) {
      console.error('Failed to update checklist status:', e);
    }
  };

  const handleCreateFlag = async () => {
    if (!flagNote.trim()) return;
    try {
      await createFlag({
        entityType: 'client',
        entityId: clientId!,
        note: flagNote.trim(),
        priority: flagPriority,
        clientId: clientId as any,
      });
      setFlagNote('');
      setFlagPriority('normal');
      setShowFlagForm(false);
    } catch (e) {
      console.error('Failed to create flag:', e);
    }
  };

  const handleReplyToFlag = async (flagId: string, content: string) => {
    try {
      await replyToFlag({ flagId: flagId as any, content });
    } catch (e) {
      console.error('Failed to reply to flag:', e);
    }
  };

  const toggleFlagExpanded = (flagId: string) => {
    setExpandedFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flagId)) next.delete(flagId);
      else {
        next.clear();
        next.add(flagId);
      }
      return next;
    });
  };

  const toggleMeetingExpanded = (meetingId: string) => {
    setExpandedMeetings((prev) => {
      const next = new Set(prev);
      if (next.has(meetingId)) next.delete(meetingId);
      else next.add(meetingId);
      return next;
    });
  };

  // ---------- Render ----------
  if (!client) return <LoadingSpinner message="Loading client..." />;

  return (
    <View className="flex-1 bg-m-bg">
      {/* Header */}
      <View className="bg-m-bg-brand pt-14 pb-4 px-4">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center mb-2">
          <ArrowLeft size={20} color={colors.textOnBrand} />
          <Text className="text-m-text-on-brand/60 text-sm ml-1">Clients</Text>
        </TouchableOpacity>
        <Text className="text-xl font-bold text-m-text-on-brand">{client.name}</Text>
        <View className="flex-row items-center gap-2 mt-1">
          {client.type ? (
            <Text className="text-sm text-m-text-on-brand/50 capitalize">{client.type}</Text>
          ) : null}
          {client.status ? (
            <View className="bg-white/15 px-2 py-0.5 rounded-full">
              <Text className="text-xs text-m-text-on-brand/70 capitalize">{client.status}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Tab Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="border-b border-m-border bg-m-bg-card"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 4 }}
        style={{ flexGrow: 0 }}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`py-2.5 px-3 ${activeTab === tab ? 'border-b-2 border-m-accent' : ''}`}
          >
            <Text
              className={`text-xs font-medium ${activeTab === tab ? 'text-m-text-primary' : 'text-m-text-tertiary'}`}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab Content */}
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}>
        {/* ================================================================ */}
        {/* OVERVIEW TAB */}
        {/* ================================================================ */}
        {activeTab === 'Overview' && (
          <>
            {/* Contact Details */}
            <Card>
              <SectionHeader title="Details" />
              {client.email ? (
                <TouchableOpacity onPress={() => Linking.openURL(`mailto:${client.email}`)} className="flex-row items-center gap-2 mb-1.5">
                  <Mail size={14} color={colors.accent} />
                  <Text className="text-sm text-m-accent underline">{client.email}</Text>
                </TouchableOpacity>
              ) : null}
              {client.phone ? (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${client.phone}`)} className="flex-row items-center gap-2 mb-1.5">
                  <Phone size={14} color={colors.accent} />
                  <Text className="text-sm text-m-accent underline">{client.phone}</Text>
                </TouchableOpacity>
              ) : null}
              {client.stageNote ? (
                <View className="mt-2 pt-2 border-t border-m-border-subtle">
                  <Text className="text-xs text-m-text-tertiary mb-1">Stage Note</Text>
                  <Text className="text-sm text-m-text-secondary">{client.stageNote}</Text>
                </View>
              ) : null}
            </Card>

            {/* Summary Metrics */}
            <Card>
              <SectionHeader title="Summary" />
              <View className="flex-row justify-between">
                <View className="items-center flex-1">
                  <Text className="text-2xl font-bold text-m-text-primary">{projects?.length ?? 0}</Text>
                  <Text className="text-xs text-m-text-tertiary">Projects</Text>
                </View>
                <View className="w-px bg-m-border-subtle" />
                <View className="items-center flex-1">
                  <Text className="text-2xl font-bold text-m-text-primary">{totalDocs}</Text>
                  <Text className="text-xs text-m-text-tertiary">Documents</Text>
                </View>
                <View className="w-px bg-m-border-subtle" />
                <View className="items-center flex-1">
                  <Text className="text-2xl font-bold text-m-text-primary">{tasks?.length ?? 0}</Text>
                  <Text className="text-xs text-m-text-tertiary">Tasks</Text>
                </View>
              </View>
            </Card>

            {/* Key Contacts */}
            {contacts && contacts.length > 0 ? (
              <Card>
                <SectionHeader title="Key Contacts" count={contacts.length} />
                <View className="gap-3">
                  {contacts.slice(0, 5).map((c: any) => (
                    <View key={c._id} className="flex-row items-start gap-3">
                      <View className="w-8 h-8 rounded-full bg-m-bg-inset items-center justify-center">
                        <User size={14} color={colors.textTertiary} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-m-text-primary">{c.name}</Text>
                        {c.role ? <Text className="text-xs text-m-text-tertiary">{c.role}</Text> : null}
                        <View className="flex-row gap-3 mt-1">
                          {c.email ? (
                            <TouchableOpacity onPress={() => Linking.openURL(`mailto:${c.email}`)}>
                              <Text className="text-xs text-m-accent">{c.email}</Text>
                            </TouchableOpacity>
                          ) : null}
                          {c.phone ? (
                            <TouchableOpacity onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                              <Text className="text-xs text-m-accent">{c.phone}</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            {/* Quick Links */}
            <Card>
              <SectionHeader title="Quick Links" />
              <View className="gap-0">
                {taskGroups.overdue.length > 0 || taskGroups.today.length > 0 ? (
                  <QuickLinkRow
                    label="Active Tasks"
                    value={taskGroups.overdue.length + taskGroups.today.length + taskGroups.upcoming.length + taskGroups.noDue.length}
                    onPress={() => setActiveTab('Tasks')}
                  />
                ) : (
                  <QuickLinkRow label="Tasks" value={tasks?.length ?? 0} onPress={() => setActiveTab('Tasks')} />
                )}
                <QuickLinkRow
                  label="Open Flags"
                  value={openFlagCount ?? 0}
                  onPress={() => setActiveTab('Flags')}
                />
                <QuickLinkRow label="Documents" value={totalDocs} onPress={() => setActiveTab('Docs')} />
                <QuickLinkRow label="Notes" value={notes?.length ?? 0} onPress={() => setActiveTab('Notes')} />
              </View>
            </Card>
          </>
        )}

        {/* ================================================================ */}
        {/* PROJECTS TAB */}
        {/* ================================================================ */}
        {activeTab === 'Projects' && (
          <View className="gap-2">
            {sortedProjects.length > 0 ? (
              sortedProjects.map((p) => {
                const projectDocs = folderCounts?.projectFolders?.[p._id] ?? {};
                const docCount = Object.values(projectDocs).reduce(
                  (s: number, c: any) => s + (c as number),
                  0,
                );
                return (
                  <TouchableOpacity
                    key={p._id}
                    onPress={() =>
                      router.push(`/(tabs)/clients/${clientId}/projects/${p._id}` as any)
                    }
                  >
                    <Card>
                      <View className="flex-row items-center justify-between mb-1">
                        <View className="flex-1 flex-row items-center gap-2 mr-2">
                          <FolderOpen size={14} color={colors.accent} />
                          <Text
                            className="text-sm font-medium text-m-text-primary flex-1"
                            numberOfLines={1}
                          >
                            {p.name}
                          </Text>
                        </View>
                        {p.status && <StatusBadge status={p.status} />}
                      </View>
                      {p.description ? (
                        <Text
                          className="text-sm text-m-text-secondary mt-1"
                          numberOfLines={2}
                        >
                          {p.description}
                        </Text>
                      ) : null}
                      {/* Footer: doc count + chevron */}
                      <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-m-border-subtle">
                        <Text className="text-xs text-m-text-tertiary">
                          {docCount} {docCount === 1 ? 'document' : 'documents'}
                        </Text>
                        <ChevronRight size={14} color={colors.textTertiary} />
                      </View>
                    </Card>
                  </TouchableOpacity>
                );
              })
            ) : (
              <EmptyState message="No projects" />
            )}
          </View>
        )}

        {/* ================================================================ */}
        {/* DOCS TAB */}
        {/* ================================================================ */}
        {activeTab === 'Docs' && (
          <View className="gap-3">
            {/* Total count header */}
            <Card>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-medium text-m-text-primary">Total Documents</Text>
                <Text className="text-lg font-bold text-m-text-primary">{folderCounts?.clientTotal ?? totalDocs}</Text>
              </View>
            </Card>

            {/* Client-level folders */}
            {folderCounts && folderCounts.clientFolders && Object.keys(folderCounts.clientFolders).length > 0 ? (
              <Card>
                <SectionHeader title="Client Documents" />
                <View className="gap-1">
                  {Object.entries(folderCounts.clientFolders).map(([folder, count]) => (
                    <TouchableOpacity
                      key={folder}
                      onPress={() => router.push('/(tabs)/docs' as any)}
                      className="flex-row items-center justify-between py-2"
                    >
                      <View className="flex-row items-center gap-2 flex-1">
                        <FolderOpen size={14} color={colors.accent} />
                        <Text className="text-sm text-m-text-primary capitalize">
                          {folder.replace(/_/g, ' ')}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Text className="text-xs text-m-text-tertiary">{count as number}</Text>
                        <ChevronRight size={14} color={colors.textTertiary} />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </Card>
            ) : null}

            {/* Project folders */}
            {docsProjectFolders.length > 0 ? (
              docsProjectFolders.map((proj) => (
                <Card key={proj.projectId}>
                  <View className="flex-row items-center gap-2 mb-2">
                    <FileText size={14} color={colors.accent} />
                    <Text className="text-sm font-semibold text-m-text-primary flex-1">{proj.projectName}</Text>
                    <Text className="text-xs text-m-text-tertiary">{proj.total} docs</Text>
                  </View>
                  <View className="gap-0">
                    {Object.entries(proj.folders).map(([folder, count], idx) => (
                      <View key={folder}>
                        {idx > 0 && <View className="h-px bg-m-border-subtle" />}
                        <TouchableOpacity
                          onPress={() => router.push('/(tabs)/docs' as any)}
                          className="flex-row items-center justify-between py-2 pl-5"
                        >
                          <View className="flex-row items-center gap-2 flex-1">
                            <FolderOpen size={12} color={colors.textTertiary} />
                            <Text className="text-sm text-m-text-secondary capitalize">
                              {folder === 'notes' ? 'Notes' : folder.replace(/_/g, ' ')}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            <Text className="text-xs text-m-text-tertiary">{count as number}</Text>
                            <ChevronRight size={14} color={colors.textTertiary} />
                          </View>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </Card>
              ))
            ) : totalDocs === 0 ? (
              <EmptyState message="No documents" />
            ) : null}
          </View>
        )}

        {/* ================================================================ */}
        {/* INTELLIGENCE TAB */}
        {/* ================================================================ */}
        {activeTab === 'Intelligence' && (
          <View className="gap-2">
            {intelligence && Array.isArray(intelligence) && intelligence.length > 0 ? (
              Object.entries(intelligenceByCategory).map(([category, items]) => (
                <CollapsibleSection key={category} title={category}>
                  <Card>
                    <View className="gap-3">
                      {(items as any[]).map((item: any) => (
                        <View key={item._id}>
                          <Text className="text-sm font-medium text-m-text-primary">
                            {item.label || item.fieldPath || 'Item'}
                          </Text>
                          <Text className="text-sm text-m-text-secondary mt-0.5">
                            {typeof item.value === 'string' ? item.value : JSON.stringify(item.value)}
                          </Text>
                          {item.sourceDocumentName ? (
                            <Text className="text-[10px] text-m-text-tertiary mt-0.5">
                              Source: {item.sourceDocumentName}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </Card>
                </CollapsibleSection>
              ))
            ) : intelligence && !Array.isArray(intelligence) ? (
              // Fallback for non-array intelligence (old format)
              <Card>
                <SectionHeader title="Client Intelligence" />
                {typeof intelligence.overview === 'string' ? (
                  <Text className="text-sm text-m-text-secondary leading-5">{intelligence.overview}</Text>
                ) : intelligence.overview && typeof intelligence.overview === 'object' ? (
                  <View className="gap-2">
                    {Object.entries(intelligence.overview).map(([key, value]) => (
                      <View key={key}>
                        <Text className="text-xs font-semibold text-m-text-tertiary capitalize mb-0.5">
                          {key.replace(/_/g, ' ')}
                        </Text>
                        <Text className="text-sm text-m-text-secondary leading-5">
                          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <EmptyState message="No intelligence available" />
                )}
              </Card>
            ) : (
              <EmptyState message="No intelligence available" />
            )}
          </View>
        )}

        {/* ================================================================ */}
        {/* NOTES TAB */}
        {/* ================================================================ */}
        {activeTab === 'Notes' && (
          <View className="gap-2">
            <TouchableOpacity
              onPress={() => setShowNoteForm(!showNoteForm)}
              className="bg-m-accent rounded-lg py-2.5 items-center flex-row justify-center gap-2"
            >
              <Plus size={16} color={colors.textOnBrand} />
              <Text className="text-sm font-medium text-m-text-on-brand">Add Note</Text>
            </TouchableOpacity>

            {showNoteForm && (
              <Card>
                <TextInput
                  value={noteTitle}
                  onChangeText={setNoteTitle}
                  placeholder="Note title (required)"
                  placeholderTextColor={colors.textPlaceholder}
                  className="text-sm text-m-text-primary bg-m-bg-subtle rounded-lg px-3 py-2 mb-2"
                />
                <TextInput
                  value={noteBody}
                  onChangeText={setNoteBody}
                  placeholder="Note content..."
                  placeholderTextColor={colors.textPlaceholder}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  className="text-sm text-m-text-primary bg-m-bg-subtle rounded-lg px-3 py-2 mb-3 min-h-[80px]"
                />
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={handleSaveNote}
                    className="bg-m-accent rounded-lg py-2 px-4 flex-1 items-center"
                  >
                    <Text className="text-sm font-medium text-m-text-on-brand">Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setShowNoteForm(false); setNoteTitle(''); setNoteBody(''); }}
                    className="bg-m-bg-subtle rounded-lg py-2 px-4 items-center"
                  >
                    <Text className="text-sm text-m-text-secondary">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            )}

            {notes && notes.length > 0 ? (
              notes.map((n: any) => {
                const preview = extractPlainText(n.content);
                const truncatedPreview = preview.length > 80 ? preview.slice(0, 80) + '...' : preview;
                const noteDate = n.updatedAt ?? n.createdAt ?? n._creationTime;

                return (
                  <Card key={n._id}>
                    <View className="flex-row items-start gap-2">
                      {n.emoji ? (
                        <Text className="text-lg">{n.emoji}</Text>
                      ) : null}
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-m-text-primary">
                          {n.title || 'Untitled'}
                        </Text>
                        {truncatedPreview ? (
                          <Text className="text-xs text-m-text-secondary mt-1" numberOfLines={2}>
                            {truncatedPreview}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Tags */}
                    {n.tags && n.tags.length > 0 ? (
                      <View className="flex-row flex-wrap gap-1 mt-2">
                        {n.tags.map((tag: string, i: number) => (
                          <View key={i} className="bg-m-accent/15 px-2 py-0.5 rounded-full">
                            <Text className="text-[10px] font-medium text-m-accent">{tag}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {/* Footer: date and word count */}
                    <View className="flex-row items-center justify-between mt-2">
                      {noteDate ? (
                        <Text className="text-[10px] text-m-text-tertiary">
                          {new Date(noteDate).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </Text>
                      ) : <View />}
                      {n.wordCount ? (
                        <Text className="text-[10px] text-m-text-tertiary">
                          {n.wordCount} words
                        </Text>
                      ) : null}
                    </View>
                  </Card>
                );
              })
            ) : !showNoteForm ? (
              <EmptyState message="No notes yet" />
            ) : null}
          </View>
        )}

        {/* ================================================================ */}
        {/* TASKS TAB */}
        {/* ================================================================ */}
        {activeTab === 'Tasks' && (
          <View className="gap-2">
            <TouchableOpacity
              onPress={() => setShowTaskForm(!showTaskForm)}
              className="bg-m-accent rounded-lg py-2.5 items-center flex-row justify-center gap-2"
            >
              <Plus size={16} color={colors.textOnBrand} />
              <Text className="text-sm font-medium text-m-text-on-brand">New Task</Text>
            </TouchableOpacity>

            {showTaskForm && (
              <Card>
                <TextInput
                  value={taskTitle}
                  onChangeText={setTaskTitle}
                  placeholder="Task title"
                  placeholderTextColor={colors.textPlaceholder}
                  className="text-sm text-m-text-primary bg-m-bg-subtle rounded-lg px-3 py-2 mb-2"
                />
                <TextInput
                  value={taskDueDate}
                  onChangeText={setTaskDueDate}
                  placeholder="Due date (YYYY-MM-DD)"
                  placeholderTextColor={colors.textPlaceholder}
                  className="text-sm text-m-text-primary bg-m-bg-subtle rounded-lg px-3 py-2 mb-3"
                />
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={handleSaveTask}
                    className="bg-m-accent rounded-lg py-2 px-4 flex-1 items-center"
                  >
                    <Text className="text-sm font-medium text-m-text-on-brand">Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setShowTaskForm(false); setTaskTitle(''); setTaskDueDate(''); }}
                    className="bg-m-bg-subtle rounded-lg py-2 px-4 items-center"
                  >
                    <Text className="text-sm text-m-text-secondary">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            )}

            {taskGroups.overdue.length > 0 && (
              <>
                <View className="flex-row items-center gap-2 mt-1">
                  <AlertTriangle size={12} color={colors.error} />
                  <Text className="text-xs font-semibold text-m-error uppercase tracking-wide">
                    Overdue ({taskGroups.overdue.length})
                  </Text>
                </View>
                {taskGroups.overdue.map((t: any) => (
                  <TaskItem key={t._id} task={t} onToggle={() => handleCompleteTask(t._id)} />
                ))}
              </>
            )}

            {taskGroups.today.length > 0 && (
              <>
                <View className="flex-row items-center gap-2 mt-1">
                  <Clock size={12} color={colors.warning} />
                  <Text className="text-xs font-semibold text-m-warning uppercase tracking-wide">
                    Due Today ({taskGroups.today.length})
                  </Text>
                </View>
                {taskGroups.today.map((t: any) => (
                  <TaskItem key={t._id} task={t} onToggle={() => handleCompleteTask(t._id)} />
                ))}
              </>
            )}

            {taskGroups.upcoming.length > 0 && (
              <>
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mt-1">
                  Upcoming ({taskGroups.upcoming.length})
                </Text>
                {taskGroups.upcoming.map((t: any) => (
                  <TaskItem key={t._id} task={t} onToggle={() => handleCompleteTask(t._id)} />
                ))}
              </>
            )}

            {taskGroups.noDue.length > 0 && (
              <>
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mt-1">
                  No Due Date ({taskGroups.noDue.length})
                </Text>
                {taskGroups.noDue.map((t: any) => (
                  <TaskItem key={t._id} task={t} onToggle={() => handleCompleteTask(t._id)} />
                ))}
              </>
            )}

            {taskGroups.completed.length > 0 && (
              <>
                <TouchableOpacity
                  onPress={() => setShowCompletedTasks(!showCompletedTasks)}
                  className="flex-row items-center gap-2 mt-2"
                >
                  {showCompletedTasks ? (
                    <ChevronDown size={14} color={colors.textTertiary} />
                  ) : (
                    <ChevronRight size={14} color={colors.textTertiary} />
                  )}
                  <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide">
                    Completed ({taskGroups.completed.length})
                  </Text>
                </TouchableOpacity>
                {showCompletedTasks &&
                  taskGroups.completed.slice(0, 5).map((t: any) => (
                    <TaskItem key={t._id} task={t} onToggle={() => {}} />
                  ))}
              </>
            )}

            {tasks && tasks.length === 0 && !showTaskForm && <EmptyState message="No tasks" />}
          </View>
        )}

        {/* ================================================================ */}
        {/* CHECKLIST TAB */}
        {/* ================================================================ */}
        {activeTab === 'Checklist' && (
          <View className="gap-2">
            {checklist === undefined ? (
              <EmptyState message="Loading checklist..." />
            ) : checklist && Array.isArray(checklist) && checklist.length > 0 ? (
              <>
                {/* Progress Bar */}
                {checklistProgress && (
                  <Card>
                    <View className="flex-row items-center justify-between mb-2">
                      <Text className="text-sm font-medium text-m-text-primary">Progress</Text>
                      <Text className="text-sm font-bold text-m-text-primary">
                        {checklistProgress.fulfilled}/{checklistProgress.total} ({checklistProgress.pct}%)
                      </Text>
                    </View>
                    <View className="h-2.5 bg-m-bg-inset rounded-full overflow-hidden">
                      <View
                        className="h-full bg-m-success rounded-full"
                        style={{ width: `${checklistProgress.pct}%` }}
                      />
                    </View>
                  </Card>
                )}

                {/* Items grouped by category */}
                {Object.entries(checklistByCategory).map(([category, items]) => (
                  <CollapsibleSection key={category} title={category}>
                    <Card>
                      <View className="gap-0">
                        {(items as any[]).map((item: any, idx: number) => (
                          <View key={item._id}>
                            {idx > 0 && <View className="h-px bg-m-border-subtle" />}
                            <ChecklistItem
                              item={item}
                              onCycleStatus={() => handleCycleChecklistStatus(item._id, item.status)}
                            />
                          </View>
                        ))}
                      </View>
                    </Card>
                  </CollapsibleSection>
                ))}
              </>
            ) : (
              <EmptyState message="No checklist items" />
            )}
          </View>
        )}

        {/* ================================================================ */}
        {/* MEETINGS TAB */}
        {/* ================================================================ */}
        {activeTab === 'Meetings' && (
          <View className="gap-2">
            {meetings === undefined ? (
              <EmptyState message="Loading meetings..." />
            ) : meetings && meetings.length > 0 ? (
              meetings.map((m: any) => {
                const isExpanded = expandedMeetings.has(m._id);
                return (
                  <Card key={m._id}>
                    <TouchableOpacity onPress={() => toggleMeetingExpanded(m._id)}>
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 mr-2">
                          <Text className="text-sm font-medium text-m-text-primary">
                            {m.title || 'Meeting'}
                          </Text>
                          <View className="flex-row items-center gap-3 mt-1">
                            <Text className="text-xs text-m-text-tertiary">
                              {new Date(m.meetingDate).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </Text>
                            {m.attendees && (
                              <Text className="text-xs text-m-text-tertiary">
                                {m.attendees.length} attendee{m.attendees.length !== 1 ? 's' : ''}
                              </Text>
                            )}
                          </View>
                        </View>
                        {isExpanded ? (
                          <ChevronDown size={16} color={colors.textTertiary} />
                        ) : (
                          <ChevronRight size={16} color={colors.textTertiary} />
                        )}
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View className="mt-3 pt-3 border-t border-m-border-subtle gap-3">
                        {m.summary ? (
                          <View>
                            <Text className="text-xs font-semibold text-m-text-tertiary mb-1">Summary</Text>
                            <Text className="text-sm text-m-text-secondary leading-5">{m.summary}</Text>
                          </View>
                        ) : null}
                        {m.keyPoints && m.keyPoints.length > 0 ? (
                          <View>
                            <Text className="text-xs font-semibold text-m-text-tertiary mb-1">Key Points</Text>
                            {m.keyPoints.map((point: string, i: number) => (
                              <View key={i} className="flex-row gap-2 mb-1">
                                <Text className="text-sm text-m-text-tertiary">-</Text>
                                <Text className="text-sm text-m-text-secondary flex-1">{point}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                        {m.actionItems && m.actionItems.length > 0 ? (
                          <View>
                            <Text className="text-xs font-semibold text-m-text-tertiary mb-1">Action Items</Text>
                            {m.actionItems.map((ai: any) => (
                              <View key={ai.id} className="flex-row items-start gap-2 mb-1.5">
                                <View
                                  className={`w-3 h-3 rounded-full mt-1 ${
                                    ai.status === 'completed'
                                      ? 'bg-m-success'
                                      : ai.status === 'cancelled'
                                        ? 'bg-m-text-tertiary'
                                        : 'bg-m-warning'
                                  }`}
                                />
                                <View className="flex-1">
                                  <Text className="text-sm text-m-text-secondary">{ai.description}</Text>
                                  {ai.assignee ? (
                                    <Text className="text-[10px] text-m-text-tertiary">{ai.assignee}</Text>
                                  ) : null}
                                </View>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    )}
                  </Card>
                );
              })
            ) : (
              <EmptyState message="No meetings" />
            )}
          </View>
        )}

        {/* ================================================================ */}
        {/* FLAGS TAB */}
        {/* ================================================================ */}
        {activeTab === 'Flags' && (
          <View className="gap-2">
            {/* Filter pills */}
            <View className="flex-row gap-2 mb-1">
              <TouchableOpacity
                onPress={() => setFlagFilter('open')}
                className={`px-4 py-1.5 rounded-full ${flagFilter === 'open' ? 'bg-m-accent' : 'bg-m-bg-subtle'}`}
              >
                <Text className={`text-xs font-medium ${flagFilter === 'open' ? 'text-m-text-on-brand' : 'text-m-text-secondary'}`}>
                  Open
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFlagFilter('resolved')}
                className={`px-4 py-1.5 rounded-full ${flagFilter === 'resolved' ? 'bg-m-accent' : 'bg-m-bg-subtle'}`}
              >
                <Text className={`text-xs font-medium ${flagFilter === 'resolved' ? 'text-m-text-on-brand' : 'text-m-text-secondary'}`}>
                  Resolved
                </Text>
              </TouchableOpacity>
            </View>

            {/* New Flag button */}
            <TouchableOpacity
              onPress={() => setShowFlagForm(!showFlagForm)}
              className="bg-m-accent rounded-lg py-2.5 items-center flex-row justify-center gap-2"
            >
              <Flag size={16} color={colors.textOnBrand} />
              <Text className="text-sm font-medium text-m-text-on-brand">New Flag</Text>
            </TouchableOpacity>

            {showFlagForm && (
              <Card>
                <TextInput
                  value={flagNote}
                  onChangeText={setFlagNote}
                  placeholder="Describe the flag..."
                  placeholderTextColor={colors.textPlaceholder}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  className="text-sm text-m-text-primary bg-m-bg-subtle rounded-lg px-3 py-2 mb-2 min-h-[60px]"
                />
                <View className="flex-row items-center gap-2 mb-3">
                  <Text className="text-xs text-m-text-tertiary">Priority:</Text>
                  <TouchableOpacity
                    onPress={() => setFlagPriority('normal')}
                    className={`px-3 py-1 rounded-full ${flagPriority === 'normal' ? 'bg-m-accent' : 'bg-m-bg-subtle'}`}
                  >
                    <Text className={`text-xs ${flagPriority === 'normal' ? 'text-m-text-on-brand' : 'text-m-text-secondary'}`}>
                      Normal
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setFlagPriority('urgent')}
                    className={`px-3 py-1 rounded-full ${flagPriority === 'urgent' ? 'bg-m-error' : 'bg-m-bg-subtle'}`}
                  >
                    <Text className={`text-xs ${flagPriority === 'urgent' ? 'text-white' : 'text-m-text-secondary'}`}>
                      Urgent
                    </Text>
                  </TouchableOpacity>
                </View>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={handleCreateFlag}
                    className="bg-m-accent rounded-lg py-2 px-4 flex-1 items-center"
                  >
                    <Text className="text-sm font-medium text-m-text-on-brand">Create Flag</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setShowFlagForm(false); setFlagNote(''); setFlagPriority('normal'); }}
                    className="bg-m-bg-subtle rounded-lg py-2 px-4 items-center"
                  >
                    <Text className="text-sm text-m-text-secondary">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            )}

            {clientFlags && clientFlags.length > 0 ? (
              clientFlags.map((f: any) => (
                <FlagCard
                  key={f._id}
                  flag={f}
                  isExpanded={expandedFlags.has(f._id)}
                  onToggle={() => toggleFlagExpanded(f._id)}
                  thread={expandedFlags.has(f._id) && expandedFlagId === f._id ? flagThread : undefined}
                  onReply={(content) => handleReplyToFlag(f._id, content)}
                />
              ))
            ) : (
              <EmptyState message={flagFilter === 'open' ? 'No open flags' : 'No resolved flags'} />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
