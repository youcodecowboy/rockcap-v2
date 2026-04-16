import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
} from 'react-native';
import { useState, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../../../../model-testing-app/convex/_generated/api';
import {
  ArrowLeft, ChevronRight, ChevronDown, FolderOpen, FileText,
  Circle, CheckCircle2, Plus, AlertTriangle, Clock,
  DollarSign, CheckSquare, TrendingUp, Briefcase, MapPin, Calendar,
  Percent,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import MobileHeader from '@/components/MobileHeader';

// ============================================================================
// Constants
// ============================================================================

const TABS = ['Overview', 'Docs', 'Tasks', 'Intelligence', 'Checklist', 'Notes'] as const;
type TabName = (typeof TABS)[number];

// ============================================================================
// Utility helpers
// ============================================================================

function formatGBP(amount: number | undefined | null): string {
  if (amount == null) return '--';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

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

function formatCurrencyShort(amount: number | undefined | null): string {
  if (amount == null) return '—';
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}K`;
  return `£${amount.toLocaleString()}`;
}

function formatProjectAddress(project: any): string | null {
  const parts: string[] = [];
  if (project.address) parts.push(project.address);
  if (project.city) parts.push(project.city);
  if (project.state) parts.push(project.state);
  if (project.zip) parts.push(project.zip);
  return parts.length > 0 ? parts.join(', ') : null;
}

// Shared palette for the metric tiles (same keys as the client overview).
const metricTones = {
  green: { bg: '#dcfce7', tint: '#059669' },
  purple: { bg: '#f3e8ff', tint: '#9333ea' },
  blue: { bg: '#dbeafe', tint: '#2563eb' },
  orange: { bg: '#ffedd5', tint: '#ea580c' },
  amber: { bg: '#fef3c7', tint: '#d97706' },
};

// ============================================================================
// Small shared components
// ============================================================================

function StatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'xs' }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    active: { bg: 'bg-m-success/15', text: 'text-m-success' },
    fulfilled: { bg: 'bg-m-success/15', text: 'text-m-success' },
    completed: { bg: 'bg-m-success/15', text: 'text-m-success' },
    pending: { bg: 'bg-m-warning/15', text: 'text-m-warning' },
    pending_review: { bg: 'bg-m-warning/15', text: 'text-m-warning' },
    in_progress: { bg: 'bg-m-warning/15', text: 'text-m-warning' },
    open: { bg: 'bg-m-error/15', text: 'text-m-error' },
    missing: { bg: 'bg-m-error/15', text: 'text-m-error' },
    overdue: { bg: 'bg-m-error/15', text: 'text-m-error' },
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

// Compact "label over value" row used inside the Project Information card.
function InfoRow({
  label, value, icon,
}: {
  label: string;
  value: string | React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <View>
      <Text className="text-[10px] text-m-text-tertiary uppercase tracking-wide mb-0.5">
        {label}
      </Text>
      <View className="flex-row items-center gap-1.5">
        {icon}
        {typeof value === 'string' ? (
          <Text className="text-sm text-m-text-primary flex-1">{value}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

// Key-metric tile — colored icon chip + label/value on the right. Mirrors
// the client-overview version so the two screens feel connected.
function MetricTile({
  icon, tone, label, value, valueSubtle, onPress,
}: {
  icon: React.ReactNode;
  tone: keyof typeof metricTones;
  label: string;
  value: string;
  valueSubtle?: string;
  onPress?: () => void;
}) {
  const { bg } = metricTones[tone];
  const Inner = (
    <View className="bg-m-bg-card rounded-[12px] border border-m-border p-3 flex-row items-center gap-2.5">
      <View
        className="w-9 h-9 rounded-[8px] items-center justify-center"
        style={{ backgroundColor: bg }}
      >
        {icon}
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className="text-[10px] font-medium text-m-text-tertiary uppercase tracking-wide"
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          className="text-[15px] font-semibold text-m-text-primary"
          numberOfLines={1}
        >
          {value}
          {valueSubtle ? (
            <Text className="text-xs font-normal text-m-text-tertiary"> {valueSubtle}</Text>
          ) : null}
        </Text>
      </View>
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} className="flex-1 min-w-[48%]">
        {Inner}
      </TouchableOpacity>
    );
  }
  return <View className="flex-1 min-w-[48%]">{Inner}</View>;
}

function QuickLinkRow({
  label, value, onPress,
}: {
  label: string;
  value: string | number;
  onPress: () => void;
}) {
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

function TaskItem({ task, onToggle }: { task: any; onToggle: () => void }) {
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
        {task.priority === 'high' && <AlertTriangle size={14} color={colors.error} />}
      </View>
    </Card>
  );
}

function ChecklistItem({
  item, onCycleStatus,
}: { item: any; onCycleStatus: () => void }) {
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

function CollapsibleSection({
  title, children, defaultOpen = true,
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
// Main screen
// ============================================================================

export default function ProjectDetailScreen() {
  const { clientId, projectId } = useLocalSearchParams<{
    clientId: string;
    projectId: string;
  }>();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [activeTab, setActiveTab] = useState<TabName>('Overview');
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);

  // Notes form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');

  // Tasks form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');

  // ---------- Queries ----------
  const skip = !isAuthenticated || !projectId;

  const project = useQuery(api.projects.get, skip ? 'skip' : { id: projectId as any });
  const client = useQuery(
    api.clients.get,
    !isAuthenticated || !clientId ? 'skip' : { id: clientId as any },
  );
  const stats = useQuery(api.projects.getStats, skip ? 'skip' : { projectId: projectId as any });
  const activeTaskCount = useQuery(
    api.tasks.getActiveCountByProject,
    skip ? 'skip' : { projectId: projectId as any },
  );
  const tasks = useQuery(
    api.tasks.getByProject,
    skip ? 'skip' : { projectId: projectId as any },
  );
  const notes = useQuery(
    api.notes.getByProject,
    skip ? 'skip' : { projectId: projectId as any },
  );
  const documents = useQuery(
    api.documents.getByProject,
    skip ? 'skip' : { projectId: projectId as any },
  );
  const projectFolders = useQuery(
    api.projects.getProjectFolders,
    skip ? 'skip' : { projectId: projectId as any },
  );

  // Optional queries (graceful fall-through if the module shape changes)
  let intelligence: any = undefined;
  try {
    intelligence = useQuery(
      api.knowledgeLibrary.getKnowledgeItemsByProject,
      skip ? 'skip' : { projectId: projectId as any },
    );
  } catch {
    // API may not exist
  }

  let checklist: any = undefined;
  try {
    checklist = useQuery(
      api.knowledgeLibrary.getChecklistByProject,
      skip ? 'skip' : { projectId: projectId as any },
    );
  } catch {
    // API may not exist
  }

  // ---------- Mutations ----------
  const createNote = useMutation(api.notes.create);
  const createTask = useMutation(api.tasks.create);
  const completeTask = useMutation(api.tasks.complete);
  const updateChecklistStatus = useMutation(api.knowledgeLibrary.updateItemStatus);

  // ---------- Derived data ----------
  const totalDocs = documents?.length ?? 0;

  // Group docs by their stored folder for the Docs tab. Docs without a folder
  // land in "General".
  const docFolderCounts = useMemo(() => {
    if (!documents) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    for (const d of documents) {
      const folder = (d as any).folderKey || (d as any).folder || 'General';
      map[folder] = (map[folder] ?? 0) + 1;
    }
    return map;
  }, [documents]);

  const taskGroups = useMemo(() => {
    if (!tasks) return { overdue: [], today: [], upcoming: [], noDue: [], completed: [] };
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const groups = {
      overdue: [] as any[],
      today: [] as any[],
      upcoming: [] as any[],
      noDue: [] as any[],
      completed: [] as any[],
    };
    for (const t of tasks) {
      if (t.status === 'completed') { groups.completed.push(t); continue; }
      if (!t.dueDate) { groups.noDue.push(t); continue; }
      const dueStr = t.dueDate.split('T')[0];
      if (dueStr < todayStr) groups.overdue.push(t);
      else if (dueStr === todayStr) groups.today.push(t);
      else groups.upcoming.push(t);
    }
    groups.completed.sort((a: any, b: any) =>
      new Date(b.updatedAt || b._creationTime).getTime() -
      new Date(a.updatedAt || a._creationTime).getTime()
    );
    return groups;
  }, [tasks]);

  // Extended checklist stats for the Overview "Document Checklist" card.
  // Personal-progress fields (total/fulfilled/pct) are used by existing code;
  // the extra status + byCategory counts drive the three status tiles and
  // the by-category breakdown.
  const checklistProgress = useMemo(() => {
    if (!checklist || !Array.isArray(checklist) || checklist.length === 0) return null;
    const total = checklist.length;
    const fulfilled = checklist.filter((i: any) => i.status === 'fulfilled').length;
    const pendingReview = checklist.filter((i: any) => i.status === 'pending_review').length;
    const missing = checklist.filter((i: any) => i.status === 'missing').length;
    const byCategory: Record<string, { fulfilled: number; total: number }> = {};
    for (const item of checklist) {
      const cat = item.category || 'General';
      if (!byCategory[cat]) byCategory[cat] = { fulfilled: 0, total: 0 };
      byCategory[cat].total += 1;
      if (item.status === 'fulfilled') byCategory[cat].fulfilled += 1;
    }
    return {
      total,
      fulfilled,
      pendingReview,
      missing,
      pct: Math.round((fulfilled / total) * 100),
      byCategory,
    };
  }, [checklist]);

  // Recent documents — top 5 by uploadedAt (falling back to _creationTime)
  // for the Overview tab's Recent Documents card.
  const recentDocuments = useMemo(() => {
    if (!documents) return [];
    return [...documents]
      .sort(
        (a: any, b: any) =>
          new Date(b.uploadedAt || b._creationTime || 0).getTime() -
          new Date(a.uploadedAt || a._creationTime || 0).getTime()
      )
      .slice(0, 5);
  }, [documents]);

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

  // ---------- Handlers ----------
  const handleSaveNote = async () => {
    if (!noteTitle.trim()) return;
    try {
      await createNote({
        title: noteTitle.trim(),
        content: noteBody.trim(),
        projectId: projectId as any,
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
        projectId: projectId as any,
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

  // ---------- Render ----------
  if (!project) return <LoadingSpinner message="Loading project..." />;

  const clientName = client?.name || 'Client';

  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />

      {/* Sub-header — back link to client + project name + status */}
      <View className="bg-m-bg-card border-b border-m-border px-4 py-3">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center mb-1.5"
          hitSlop={8}
        >
          <ArrowLeft size={16} color={colors.accent} />
          <Text className="text-[13px] text-m-accent ml-1" numberOfLines={1}>
            {clientName}
          </Text>
        </TouchableOpacity>
        <View className="flex-row items-center gap-2">
          <Text
            className="text-[18px] font-semibold text-m-text-primary flex-1"
            numberOfLines={1}
          >
            {project.name}
          </Text>
          {(project as any).status && (
            <StatusBadge status={(project as any).status} />
          )}
        </View>
        {(project as any).projectShortcode ? (
          <Text className="text-[11px] font-mono text-m-text-tertiary mt-1">
            {(project as any).projectShortcode}
          </Text>
        ) : null}
      </View>

      {/* Tab bar — horizontal scroll so all 6 tabs fit on narrow screens */}
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

      {/* Tab content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
      >
        {/* ==================== OVERVIEW ==================== */}
        {activeTab === 'Overview' && (
          <>
            {/* Key Metrics — 4 colored tiles (wraps to 2x2 on narrow screens) */}
            <View className="flex-row flex-wrap gap-2">
              <MetricTile
                icon={<DollarSign size={18} color={metricTones.green.tint} />}
                tone="green"
                label="Loan Amount"
                value={
                  stats?.loanAmount
                    ? formatCurrencyShort(stats.loanAmount)
                    : (project as any).loanAmount
                    ? formatCurrencyShort((project as any).loanAmount)
                    : '—'
                }
              />
              <MetricTile
                icon={<CheckSquare size={18} color={metricTones.blue.tint} />}
                tone="blue"
                label="Active Tasks"
                value={String(activeTaskCount ?? 0)}
                onPress={() => setActiveTab('Tasks')}
              />
              <MetricTile
                icon={<FileText size={18} color={metricTones.orange.tint} />}
                tone="orange"
                label="Documents"
                value={String(totalDocs)}
                onPress={() => setActiveTab('Docs')}
              />
              <MetricTile
                icon={<Percent size={18} color={metricTones.amber.tint} />}
                tone="amber"
                label="Checklist"
                value={checklistProgress ? `${checklistProgress.pct}%` : '—'}
                valueSubtle={
                  checklistProgress
                    ? `${checklistProgress.fulfilled}/${checklistProgress.total}`
                    : undefined
                }
                onPress={() => setActiveTab('Checklist')}
              />
            </View>

            {/* Document Checklist — rich card with progress + 3 status tiles */}
            {checklistProgress && (
              <Card>
                <View className="flex-row items-center gap-2 mb-3">
                  <CheckSquare size={16} color={colors.textSecondary} />
                  <Text className="text-sm font-semibold text-m-text-primary flex-1">
                    Document Checklist
                  </Text>
                  <TouchableOpacity
                    onPress={() => setActiveTab('Checklist')}
                    className="flex-row items-center"
                  >
                    <Text className="text-xs text-m-text-tertiary mr-0.5">View all</Text>
                    <ChevronRight size={12} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>

                {/* Overall Progress */}
                <View className="mb-3">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-sm text-m-text-secondary">Overall Completion</Text>
                    <Text className="text-sm font-semibold text-m-text-primary">
                      {checklistProgress.pct}%
                    </Text>
                  </View>
                  <View className="h-2 bg-m-bg-inset rounded-full overflow-hidden">
                    <View
                      className="h-full bg-m-accent rounded-full"
                      style={{ width: `${checklistProgress.pct}%` }}
                    />
                  </View>
                  <Text className="text-xs text-m-text-tertiary mt-1">
                    {checklistProgress.fulfilled} of {checklistProgress.total} documents
                  </Text>
                </View>

                {/* Status Breakdown — 3 tiles */}
                <View className="flex-row gap-2 pt-3 border-t border-m-border-subtle">
                  <View className="flex-1 items-center">
                    <View className="flex-row items-center gap-1 mb-0.5">
                      <CheckCircle2 size={14} color={colors.success} />
                      <Text className="text-lg font-semibold" style={{ color: '#15803d' }}>
                        {checklistProgress.fulfilled}
                      </Text>
                    </View>
                    <Text className="text-[10px] text-m-text-tertiary">Fulfilled</Text>
                  </View>
                  <View className="w-px bg-m-border-subtle" />
                  <View className="flex-1 items-center">
                    <View className="flex-row items-center gap-1 mb-0.5">
                      <Clock size={14} color={metricTones.amber.tint} />
                      <Text
                        className="text-lg font-semibold"
                        style={{ color: '#b45309' }}
                      >
                        {checklistProgress.pendingReview}
                      </Text>
                    </View>
                    <Text className="text-[10px] text-m-text-tertiary">Pending</Text>
                  </View>
                  <View className="w-px bg-m-border-subtle" />
                  <View className="flex-1 items-center">
                    <View className="flex-row items-center gap-1 mb-0.5">
                      <Circle size={14} color={colors.textTertiary} />
                      <Text
                        className="text-lg font-semibold text-m-text-primary"
                      >
                        {checklistProgress.missing}
                      </Text>
                    </View>
                    <Text className="text-[10px] text-m-text-tertiary">Missing</Text>
                  </View>
                </View>

                {/* By Category — top 4 */}
                {Object.keys(checklistProgress.byCategory).length > 0 && (
                  <View className="mt-3 pt-3 border-t border-m-border-subtle">
                    <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-1.5">
                      By Category
                    </Text>
                    <View className="gap-1">
                      {Object.entries(checklistProgress.byCategory)
                        .slice(0, 4)
                        .map(([cat, s]: any) => (
                          <View
                            key={cat}
                            className="flex-row items-center justify-between"
                          >
                            <Text
                              className="text-xs text-m-text-secondary flex-1"
                              numberOfLines={1}
                            >
                              {cat}
                            </Text>
                            <Text className="text-xs text-m-text-tertiary ml-2">
                              {s.fulfilled}/{s.total}
                            </Text>
                          </View>
                        ))}
                    </View>
                  </View>
                )}

                {/* Alert when many missing */}
                {checklistProgress.missing > 3 && (
                  <View
                    className="mt-3 flex-row items-start gap-2 p-2 rounded-[8px]"
                    style={{ backgroundColor: '#fffbeb' }}
                  >
                    <AlertTriangle size={14} color={metricTones.amber.tint} style={{ marginTop: 1 }} />
                    <Text className="text-xs flex-1" style={{ color: '#92400e' }}>
                      {checklistProgress.missing} documents still missing. Use the
                      Checklist tab to request them.
                    </Text>
                  </View>
                )}
              </Card>
            )}

            {/* Project Information — expanded detail card */}
            <Card>
              <View className="flex-row items-center gap-2 mb-3">
                <Briefcase size={16} color={colors.textSecondary} />
                <Text className="text-sm font-semibold text-m-text-primary flex-1">
                  Project Information
                </Text>
              </View>
              <View className="gap-2.5">
                <InfoRow label="Project Name" value={project.name} />
                {(project as any).projectShortcode ? (
                  <View>
                    <Text className="text-[10px] text-m-text-tertiary uppercase tracking-wide mb-0.5">
                      Shortcode
                    </Text>
                    <View className="self-start bg-m-bg-subtle rounded-[6px] px-1.5 py-0.5">
                      <Text className="text-[11px] font-mono text-m-text-secondary">
                        {(project as any).projectShortcode}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {project.description ? (
                  <InfoRow label="Description" value={project.description} />
                ) : null}
                {formatProjectAddress(project) ? (
                  <InfoRow
                    label="Address"
                    value={
                      <>
                        <MapPin size={12} color={colors.textTertiary} />
                        <Text className="text-sm text-m-text-primary flex-1">
                          {formatProjectAddress(project)}
                        </Text>
                      </>
                    }
                  />
                ) : null}
                {(project as any).startDate ? (
                  <InfoRow
                    label="Start Date"
                    icon={<Calendar size={12} color={colors.textTertiary} />}
                    value={formatDate((project as any).startDate)}
                  />
                ) : null}
                {(project as any).expectedCompletionDate ||
                (project as any).endDate ? (
                  <InfoRow
                    label="Expected Completion"
                    icon={<Calendar size={12} color={colors.textTertiary} />}
                    value={formatDate(
                      (project as any).expectedCompletionDate ||
                        (project as any).endDate,
                    )}
                  />
                ) : null}
                {stats?.loanAmount != null ? (
                  <InfoRow label="Loan Amount" value={formatGBP(stats.loanAmount)} />
                ) : (project as any).loanAmount ? (
                  <InfoRow
                    label="Loan Amount"
                    value={formatGBP((project as any).loanAmount)}
                  />
                ) : null}
                {stats?.totalCosts != null ? (
                  <InfoRow label="Total Costs" value={formatGBP(stats.totalCosts)} />
                ) : null}
                {(project as any).interestRate ? (
                  <InfoRow
                    label="Interest Rate"
                    value={`${(project as any).interestRate}%`}
                  />
                ) : null}
              </View>
            </Card>

            {/* Recent Documents */}
            {recentDocuments.length > 0 && (
              <Card>
                <View className="flex-row items-center gap-2 mb-3">
                  <TrendingUp size={16} color={colors.textSecondary} />
                  <Text className="text-sm font-semibold text-m-text-primary flex-1">
                    Recent Documents
                  </Text>
                  <TouchableOpacity
                    onPress={() => setActiveTab('Docs')}
                    className="flex-row items-center"
                  >
                    <Text className="text-xs text-m-text-tertiary mr-0.5">View all</Text>
                    <ChevronRight size={12} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                <View className="gap-1">
                  {recentDocuments.map((doc: any, idx: number) => (
                    <View key={doc._id}>
                      {idx > 0 && <View className="h-px bg-m-border-subtle" />}
                      <TouchableOpacity
                        onPress={() =>
                          router.push(`/(tabs)/docs/viewer?id=${doc._id}` as any)
                        }
                        className="flex-row items-center gap-2 py-2"
                      >
                        <FileText size={14} color={colors.textTertiary} />
                        <Text
                          className="text-sm text-m-text-primary flex-1"
                          numberOfLines={1}
                        >
                          {doc.displayName || doc.documentCode || doc.fileName}
                        </Text>
                        {doc.category ? (
                          <View className="bg-m-bg-subtle rounded-[6px] px-1.5 py-0.5">
                            <Text
                              className="text-[10px] text-m-text-secondary"
                              numberOfLines={1}
                            >
                              {doc.category}
                            </Text>
                          </View>
                        ) : null}
                        {doc.uploadedAt ? (
                          <Text className="text-[10px] text-m-text-tertiary">
                            {new Date(doc.uploadedAt).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </Card>
            )}

            {/* Quick Links — slimmed since metrics handle the common ones */}
            <Card>
              <SectionHeader title="Quick Links" />
              <View className="gap-0">
                <QuickLinkRow
                  label="Notes"
                  value={notes?.length ?? 0}
                  onPress={() => setActiveTab('Notes')}
                />
                <QuickLinkRow
                  label="Intelligence"
                  value={
                    intelligence && Array.isArray(intelligence) ? intelligence.length : 0
                  }
                  onPress={() => setActiveTab('Intelligence')}
                />
              </View>
            </Card>
          </>
        )}

        {/* ==================== DOCS ==================== */}
        {activeTab === 'Docs' && (
          <View className="gap-3">
            <Card>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-medium text-m-text-primary">Total Documents</Text>
                <Text className="text-lg font-bold text-m-text-primary">{totalDocs}</Text>
              </View>
            </Card>

            {/* Folders within this project */}
            {Object.keys(docFolderCounts).length > 0 ? (
              <Card>
                <SectionHeader title="By Folder" />
                <View className="gap-0">
                  {Object.entries(docFolderCounts).map(([folder, count], idx) => (
                    <View key={folder}>
                      {idx > 0 && <View className="h-px bg-m-border-subtle" />}
                      <TouchableOpacity
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
                          <Text className="text-xs text-m-text-tertiary">{count}</Text>
                          <ChevronRight size={14} color={colors.textTertiary} />
                        </View>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            {/* Recent docs list — first 10 */}
            {documents && documents.length > 0 ? (
              <Card>
                <SectionHeader title="Recent" count={Math.min(documents.length, 10)} />
                <View className="gap-0">
                  {documents.slice(0, 10).map((d: any, idx: number) => (
                    <View key={d._id}>
                      {idx > 0 && <View className="h-px bg-m-border-subtle" />}
                      <TouchableOpacity
                        onPress={() =>
                          router.push(`/(tabs)/docs/viewer?id=${d._id}` as any)
                        }
                        className="flex-row items-center gap-2 py-2"
                      >
                        <FileText size={14} color={colors.textTertiary} />
                        <Text
                          className="text-sm text-m-text-primary flex-1"
                          numberOfLines={1}
                        >
                          {d.displayName || d.fileName || 'Untitled'}
                        </Text>
                        <ChevronRight size={14} color={colors.textTertiary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </Card>
            ) : totalDocs === 0 ? (
              <EmptyState message="No documents" />
            ) : null}
          </View>
        )}

        {/* ==================== TASKS ==================== */}
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
                    onPress={() => {
                      setShowTaskForm(false);
                      setTaskTitle('');
                      setTaskDueDate('');
                    }}
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

        {/* ==================== INTELLIGENCE ==================== */}
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
                            {typeof item.value === 'string'
                              ? item.value
                              : JSON.stringify(item.value)}
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
            ) : (
              <EmptyState message="No intelligence available" />
            )}
          </View>
        )}

        {/* ==================== CHECKLIST ==================== */}
        {activeTab === 'Checklist' && (
          <View className="gap-2">
            {checklist === undefined ? (
              <EmptyState message="Loading checklist..." />
            ) : checklist && Array.isArray(checklist) && checklist.length > 0 ? (
              <>
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

                {Object.entries(checklistByCategory).map(([category, items]) => (
                  <CollapsibleSection key={category} title={category}>
                    <Card>
                      <View className="gap-0">
                        {(items as any[]).map((item: any, idx: number) => (
                          <View key={item._id}>
                            {idx > 0 && <View className="h-px bg-m-border-subtle" />}
                            <ChecklistItem
                              item={item}
                              onCycleStatus={() =>
                                handleCycleChecklistStatus(item._id, item.status)
                              }
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

        {/* ==================== NOTES ==================== */}
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
                    onPress={() => {
                      setShowNoteForm(false);
                      setNoteTitle('');
                      setNoteBody('');
                    }}
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
                const truncatedPreview =
                  preview.length > 80 ? preview.slice(0, 80) + '...' : preview;
                const noteDate = n.updatedAt ?? n.createdAt ?? n._creationTime;
                return (
                  <Card key={n._id}>
                    <View className="flex-row items-start gap-2">
                      {n.emoji ? <Text className="text-lg">{n.emoji}</Text> : null}
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
                    {n.tags && n.tags.length > 0 ? (
                      <View className="flex-row flex-wrap gap-1 mt-2">
                        {n.tags.map((tag: string, i: number) => (
                          <View key={i} className="bg-m-accent/15 px-2 py-0.5 rounded-full">
                            <Text className="text-[10px] font-medium text-m-accent">{tag}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
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
      </ScrollView>
    </View>
  );
}
