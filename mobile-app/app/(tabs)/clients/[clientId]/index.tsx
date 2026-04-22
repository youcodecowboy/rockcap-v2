import { View, Text, ScrollView, TouchableOpacity, TextInput, Linking, Modal, SafeAreaView } from 'react-native';
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
  StickyNote,
  Pencil,
  DollarSign,
  FolderKanban,
  Video,
  Building2,
  Globe,
  MapPin,
  Calendar,
  Lightbulb,
  TrendingUp,
  Briefcase,
  Search,
  ExternalLink,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import MobileHeader from '@/components/MobileHeader';
import ContactAvatar from '@/components/contacts/ContactAvatar';
import ContactDetailModal from '@/components/contacts/ContactDetailModal';
import SyncStrip from '@/components/client/SyncStrip';
import OpenDealsCard from '@/components/client/OpenDealsCard';
import RecentActivityCard from '@/components/client/RecentActivityCard';
import BeauhurstMiniCard from '@/components/client/BeauhurstMiniCard';
import ClassificationCard from '@/components/client/ClassificationCard';
import LinkContactModal from '@/components/clients/LinkContactModal';
import TaskCreationFlow from '@/components/TaskCreationFlow';
import FlagCreationSheet from '@/components/FlagCreationSheet';
import ProjectCreationSheet from '@/components/ProjectCreationSheet';
import DealCard from '@/components/deals/DealCard';
import DealDetailSheet from '@/components/deals/DealDetailSheet';
import ActivityCard from '@/components/activity/ActivityCard';
import BeauhurstIdentityCard from '@/components/intelligence/BeauhurstIdentityCard';
import BeauhurstFinancialsCard from '@/components/intelligence/BeauhurstFinancialsCard';
import BeauhurstSignalsCard from '@/components/intelligence/BeauhurstSignalsCard';

// ============================================================================
// Constants
// ============================================================================

const TABS = ['Overview', 'Deals', 'Activity', 'Projects', 'Docs', 'Intelligence', 'Notes', 'Tasks', 'Checklist', 'Meetings', 'Flags'] as const;
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

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}K`;
  return `£${amount.toLocaleString()}`;
}

function formatDateShort(dateStr: string | undefined | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Palette for metric-tile icons. Each entry is { iconBg, iconTint } so the
// tiles pop visually without fighting the overall neutral palette.
const metricTones = {
  green: { bg: '#dcfce7', tint: '#059669' },
  purple: { bg: '#f3e8ff', tint: '#9333ea' },
  blue: { bg: '#dbeafe', tint: '#2563eb' },
  orange: { bg: '#ffedd5', tint: '#ea580c' },
  amber: { bg: '#fef3c7', tint: '#d97706' },
};

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

// Compact "label over value" row used inside the Company Information card.
function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <View>
      <Text className="text-[10px] text-m-text-tertiary uppercase tracking-wide mb-0.5">
        {label}
      </Text>
      <Text className="text-sm text-m-text-primary">{value}</Text>
    </View>
  );
}

// Build a human-readable address line from the client's components. Returns
// null when the client has no address fields so the caller can suppress the
// row entirely.
function formatClientAddress(client: any): string | null {
  const parts: string[] = [];
  if (client.address) parts.push(client.address);
  if (client.city) parts.push(client.city);
  if (client.state) parts.push(client.state);
  if (client.zip) parts.push(client.zip);
  if (client.country) parts.push(client.country);
  return parts.length > 0 ? parts.join(', ') : null;
}

// ----------------------------------------------------------------------------
// ProjectsList — the client's Projects tab. Search bar at the top, then
// Active projects grouped separately from everything else, matching the
// desktop ClientProjectsTab. Each project card has a colored briefcase tile
// (purple for active, gray otherwise), shortcode chip, description, and a
// footer with document count + creation date.
// ----------------------------------------------------------------------------
function ProjectsList({
  clientId, projects, folderCounts, projectSearch, setProjectSearch, onOpenProject,
}: {
  clientId: string;
  projects: any[];
  folderCounts: any;
  projectSearch: string;
  setProjectSearch: (s: string) => void;
  onOpenProject: (projectId: string) => void;
}) {
  const q = projectSearch.trim().toLowerCase();
  const filtered = q
    ? projects.filter((p) =>
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.projectShortcode ?? '').toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q),
      )
    : projects;

  const active = filtered.filter((p) => p.status === 'active');
  const other = filtered.filter((p) => p.status !== 'active');

  const Card = ProjectListCard; // local alias for readability

  return (
    <View className="gap-3">
      {/* Search bar */}
      <View className="bg-m-bg-card rounded-[10px] border border-m-border flex-row items-center px-3">
        <Search size={14} color={colors.textTertiary} />
        <TextInput
          placeholder="Search projects..."
          placeholderTextColor={colors.textTertiary}
          value={projectSearch}
          onChangeText={setProjectSearch}
          className="flex-1 text-sm text-m-text-primary ml-2 py-2.5"
        />
        {projectSearch.length > 0 ? (
          <TouchableOpacity onPress={() => setProjectSearch('')} className="p-1">
            <X size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {filtered.length === 0 ? (
        <View className="items-center py-12">
          <View
            className="w-12 h-12 rounded-[12px] items-center justify-center mb-3"
            style={{ backgroundColor: colors.bgSubtle }}
          >
            <FolderKanban size={24} color={colors.textTertiary} />
          </View>
          <Text className="text-sm font-medium text-m-text-primary mb-1">
            {q ? 'No projects found' : 'No projects yet'}
          </Text>
          <Text className="text-xs text-m-text-tertiary text-center px-8">
            {q ? 'Try adjusting your search terms' : 'Create your first project on desktop.'}
          </Text>
        </View>
      ) : (
        <>
          {/* Active Projects */}
          {active.length > 0 && (
            <View>
              <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                Active Projects ({active.length})
              </Text>
              <View className="gap-2">
                {active.map((p) => (
                  <Card
                    key={p._id}
                    project={p}
                    clientId={clientId}
                    folderCounts={folderCounts}
                    onPress={() => onOpenProject(p._id)}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Other Projects */}
          {other.length > 0 && (
            <View>
              <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                Other Projects ({other.length})
              </Text>
              <View className="gap-2">
                {other.map((p) => (
                  <Card
                    key={p._id}
                    project={p}
                    clientId={clientId}
                    folderCounts={folderCounts}
                    onPress={() => onOpenProject(p._id)}
                  />
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function ProjectListCard({
  project, folderCounts, onPress,
}: {
  project: any;
  clientId: string;
  folderCounts: any;
  onPress: () => void;
}) {
  const isActive = project.status === 'active';
  const projectDocs = folderCounts?.projectFolders?.[project._id] ?? {};
  const docCount = Object.values(projectDocs).reduce(
    (s: number, c: any) => s + (c as number),
    0,
  );
  const iconTone = isActive ? metricTones.purple : { bg: colors.bgInset, tint: colors.textTertiary };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View className="bg-m-bg-card rounded-[12px] border border-m-border p-3 flex-row items-start gap-3">
        {/* Colored briefcase tile */}
        <View
          className="w-11 h-11 rounded-[10px] items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconTone.bg }}
        >
          <Briefcase size={20} color={iconTone.tint} />
        </View>

        {/* Name + status */}
        <View className="flex-1 min-w-0">
          <View className="flex-row items-start justify-between gap-2">
            <Text
              className="text-sm font-semibold text-m-text-primary flex-1"
              numberOfLines={1}
            >
              {project.name}
            </Text>
            {project.status ? <StatusBadge status={project.status} size="xs" /> : null}
          </View>

          {/* Shortcode chip */}
          {project.projectShortcode ? (
            <View className="self-start bg-m-bg-subtle rounded-[6px] px-1.5 py-0.5 mt-1">
              <Text
                className="text-[11px] font-mono text-m-text-secondary"
                numberOfLines={1}
              >
                {project.projectShortcode}
              </Text>
            </View>
          ) : null}

          {/* Description */}
          {project.description ? (
            <Text
              className="text-xs text-m-text-secondary mt-1.5"
              numberOfLines={2}
            >
              {project.description}
            </Text>
          ) : null}

          {/* Footer: doc count + created date */}
          <View className="flex-row items-center gap-3 mt-2">
            <View className="flex-row items-center gap-1">
              <FileText size={11} color={colors.textTertiary} />
              <Text className="text-[11px] text-m-text-tertiary">
                {docCount} {docCount === 1 ? 'doc' : 'docs'}
              </Text>
            </View>
            {project.createdAt || project._creationTime ? (
              <View className="flex-row items-center gap-1">
                <Calendar size={11} color={colors.textTertiary} />
                <Text className="text-[11px] text-m-text-tertiary">
                  {new Date(
                    project.createdAt ||
                      new Date(project._creationTime).toISOString(),
                  ).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <ChevronRight size={16} color={colors.textTertiary} style={{ marginTop: 2 }} />
      </View>
    </TouchableOpacity>
  );
}

// ----------------------------------------------------------------------------
// StageNoteBanner — inline-editable "Status: X" strip with blue left border.
// Mirrors the desktop ClientOverviewTab stage note banner at the top of the
// overview, but adapted for touch: tap the pencil to open the editor, tap ✓
// to save. Empty state reads "Click to add..." (tap to start editing).
// ----------------------------------------------------------------------------
function StageNoteBanner({
  value, onSave,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      console.error('Failed to save stage note:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  return (
    <View
      className="bg-m-bg-card rounded-[12px] border border-m-border px-3 py-2.5"
      style={{ borderLeftWidth: 4, borderLeftColor: '#3b82f6' }}
    >
      <View className="flex-row items-center gap-2">
        <StickyNote size={14} color="#3b82f6" />
        {editing ? (
          <>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="e.g. Awaiting KYC docs"
              placeholderTextColor={colors.textPlaceholder}
              autoFocus
              className="flex-1 text-sm text-m-text-primary py-0"
            />
            <TouchableOpacity onPress={handleSave} disabled={saving} className="p-1">
              <Check size={16} color={colors.success} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCancel} className="p-1">
              <X size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View className="flex-1 flex-row flex-wrap items-center gap-1">
              <Text className="text-sm font-semibold text-m-text-secondary">Status:</Text>
              {value ? (
                <Text className="text-sm text-m-text-primary flex-1" numberOfLines={1}>
                  {value}
                </Text>
              ) : (
                <Text className="text-sm italic text-m-text-tertiary flex-1">
                  Tap to add...
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setEditing(true)} className="p-1" hitSlop={6}>
              <Pencil size={13} color={colors.textTertiary} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------------
// MetricTile — one of four in the Key Metrics row. Colored icon chip on the
// left, a compact value/label pair on the right. Tappable tiles get a
// subtle chevron via the natural shadow on Card. Keeps tiles compact so 4
// fit on a narrow phone screen (2x2 grid on the narrowest, otherwise a row).
// ----------------------------------------------------------------------------
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
        <Text className="text-[10px] font-medium text-m-text-tertiary uppercase tracking-wide" numberOfLines={1}>
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

// ----------------------------------------------------------------------------
// KnowledgeLibraryCard — compact version of the desktop MissingDocumentsCard.
// Shows overall progress, a "X required missing" alert, and the top 5 missing
// items. When everything is fulfilled, switches to the green "All Complete"
// state.
// ----------------------------------------------------------------------------
function KnowledgeLibraryCard({
  summary, missingItems, onViewAll,
}: {
  summary: any;
  missingItems: any[] | undefined;
  onViewAll: () => void;
}) {
  // Loading — render nothing; avoids layout flash
  if (summary === undefined || missingItems === undefined) {
    return null;
  }

  // Not set up yet
  if (!summary || summary.overall?.total === 0) {
    return (
      <Card>
        <View className="flex-row items-center gap-2 mb-2">
          <Lightbulb size={16} color={metricTones.amber.tint} />
          <Text className="text-sm font-semibold text-m-text-primary flex-1">
            Knowledge Library
          </Text>
        </View>
        <Text className="text-sm text-m-text-tertiary">
          No document requirements configured yet.
        </Text>
        <TouchableOpacity
          onPress={onViewAll}
          className="mt-3 flex-row items-center self-start bg-m-bg-subtle rounded-full px-3 py-1.5"
        >
          <Text className="text-xs text-m-text-secondary mr-1">Set up requirements</Text>
          <ChevronRight size={12} color={colors.textTertiary} />
        </TouchableOpacity>
      </Card>
    );
  }

  const total = summary.overall.total as number;
  const fulfilled = summary.overall.fulfilled as number;
  const missing = summary.overall.missing as number;
  const pct = Math.round((fulfilled / total) * 100);

  const requiredMissing = (missingItems ?? []).filter((m: any) => m.priority === 'required');
  const topMissing = requiredMissing.slice(0, 5);

  // All complete state — green accent
  if (missing === 0) {
    return (
      <Card
        style={{
          backgroundColor: '#f0fdf4',
          borderColor: '#bbf7d0',
        }}
      >
        <View className="flex-row items-center gap-2 mb-2">
          <CheckCircle2 size={16} color={colors.success} />
          <Text className="text-sm font-semibold" style={{ color: '#065f46', flex: 1 }}>
            Knowledge Library
          </Text>
          <Text className="text-xs" style={{ color: '#059669' }}>
            {fulfilled}/{total}
          </Text>
        </View>
        <Text className="text-sm font-medium mb-2" style={{ color: '#065f46' }}>
          All Complete!
        </Text>
        <View className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#bbf7d0' }}>
          <View className="h-full rounded-full" style={{ width: '100%', backgroundColor: colors.success }} />
        </View>
        <TouchableOpacity onPress={onViewAll} className="mt-3 flex-row items-center self-start">
          <Text className="text-xs font-medium" style={{ color: '#059669' }}>
            View all documents
          </Text>
          <ChevronRight size={12} color="#059669" style={{ marginLeft: 2 }} />
        </TouchableOpacity>
      </Card>
    );
  }

  return (
    <Card>
      <View className="flex-row items-center gap-2 mb-3">
        <Lightbulb size={16} color={metricTones.amber.tint} />
        <Text className="text-sm font-semibold text-m-text-primary flex-1">
          Knowledge Library
        </Text>
        <TouchableOpacity onPress={onViewAll} className="flex-row items-center">
          <Text className="text-xs text-m-text-tertiary mr-1">View all</Text>
          <ChevronRight size={12} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Progress */}
      <View className="mb-3">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-sm font-medium text-m-text-primary">{pct}% Complete</Text>
          <Text className="text-xs text-m-text-tertiary">
            {fulfilled}/{total} documents
          </Text>
        </View>
        <View className="h-2 bg-m-bg-inset rounded-full overflow-hidden">
          <View
            className="h-full bg-m-accent rounded-full"
            style={{ width: `${pct}%` }}
          />
        </View>
      </View>

      {/* Required missing alert */}
      {requiredMissing.length > 0 && (
        <View
          className="rounded-[8px] px-2.5 py-1.5 mb-3 flex-row items-center gap-1.5"
          style={{ backgroundColor: '#fef2f2' }}
        >
          <AlertTriangle size={13} color="#b91c1c" />
          <Text className="text-xs font-medium" style={{ color: '#b91c1c' }}>
            {requiredMissing.length} required document{requiredMissing.length !== 1 ? 's' : ''} missing
          </Text>
        </View>
      )}

      {/* Top missing items */}
      {topMissing.length > 0 && (
        <>
          <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-1.5">
            Priority Missing
          </Text>
          <View className="gap-1.5">
            {topMissing.map((item: any) => (
              <View key={item._id} className="flex-row items-center gap-2">
                <FileText size={13} color={colors.textTertiary} />
                <Text
                  className="text-sm text-m-text-secondary flex-1"
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                {item.priority === 'required' ? (
                  <View
                    className="rounded-[6px] px-1.5 py-0.5"
                    style={{ backgroundColor: '#fef2f2' }}
                  >
                    <Text className="text-[10px] font-medium" style={{ color: '#b91c1c' }}>
                      Required
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
            {requiredMissing.length > 5 && (
              <Text className="text-xs text-m-text-tertiary pl-5">
                +{requiredMissing.length - 5} more required documents
              </Text>
            )}
          </View>
        </>
      )}

      {/* Category breakdown */}
      {summary.byCategory && Object.keys(summary.byCategory).length > 0 && (
        <View className="mt-3 pt-3 border-t border-m-border-subtle">
          <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-1.5">
            By Category
          </Text>
          <View className="gap-1">
            {Object.entries(summary.byCategory).map(([cat, stats]: any) => (
              <View key={cat} className="flex-row items-center justify-between">
                <Text className="text-xs text-m-text-secondary">{cat}</Text>
                <Text
                  className="text-xs font-medium"
                  style={{ color: stats.missing > 0 ? colors.error : colors.success }}
                >
                  {stats.fulfilled}/{stats.total}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Card>
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

// DealsTab — inline tab for the 'Deals' view. Renders a summary strip
// (Open / Won / Lost totals), a search field, an expandable Open list of
// DealCards, and collapsed Won/Lost summary rows. Tapping a card opens the
// DealDetailSheet.
function DealsTab({
  clientId,
  onNavigateToActivity,
}: {
  clientId: string;
  // Parent-supplied callback. The "View all activity" CTA inside the deal
  // detail sheet calls this with the deal's id + name so ClientDetailScreen
  // can (a) switch to the Activity tab and (b) pre-filter ActivityTab to
  // just this deal's feed.
  onNavigateToActivity?: (dealId: string, dealName: string) => void;
}) {
  const deals = useQuery(api.deals.listForClient, { clientId: clientId as any }) ?? [];
  const [search, setSearch] = useState('');
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [openExpanded, setOpenExpanded] = useState(true);
  // Closed Won / Closed Lost groups default collapsed — user taps to expand.
  // Tracked as a Set so we can extend easily if we add more groups later.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (label: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? deals.filter((d) => (d.name ?? '').toLowerCase().includes(q))
    : deals;

  const open = filtered.filter((d) => d.isClosed !== true);
  const won = filtered.filter((d) => d.isClosedWon === true);
  const lost = filtered.filter((d) => d.isClosed === true && d.isClosedWon !== true);

  const sum = (arr: any[]) => arr.reduce((s, d) => s + (d.amount ?? 0), 0);
  const fmt = (amount: number) =>
    amount >= 1_000_000
      ? `£${(amount / 1_000_000).toFixed(1)}M`
      : amount >= 1_000
        ? `£${Math.round(amount / 1_000)}K`
        : `£${amount.toLocaleString()}`;

  return (
    <View className="gap-3">
      {/* Summary strip */}
      <View className="flex-row gap-2">
        {[
          { label: 'Open', total: sum(open), count: open.length, tone: '#0a0a0a' },
          { label: 'Won', total: sum(won), count: won.length, tone: '#059669' },
          { label: 'Lost', total: sum(lost), count: lost.length, tone: '#525252' },
        ].map((s) => (
          <View
            key={s.label}
            className="flex-1 bg-m-bg-card border border-m-border rounded-[12px] p-2.5 items-center"
          >
            <Text className="text-[9px] font-semibold text-m-text-tertiary uppercase">
              {s.label}
            </Text>
            <Text className="text-[15px] font-bold mt-0.5" style={{ color: s.tone }}>
              {fmt(s.total)}
            </Text>
            <Text className="text-[10px] text-m-text-tertiary">{s.count} deals</Text>
          </View>
        ))}
      </View>

      {/* Search */}
      <View className="bg-m-bg-card rounded-[10px] border border-m-border flex-row items-center px-3">
        <Search size={14} color={colors.textTertiary} />
        <TextInput
          placeholder="Search deals..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
          className="flex-1 text-sm text-m-text-primary ml-2 py-2.5"
        />
      </View>

      {/* Open section (expandable) */}
      <TouchableOpacity
        onPress={() => setOpenExpanded(!openExpanded)}
        className="flex-row items-center gap-2 px-1"
      >
        <ChevronRight
          size={14}
          color={colors.textSecondary}
          strokeWidth={2}
          style={{ transform: [{ rotate: openExpanded ? '90deg' : '0deg' }] }}
        />
        <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide">
          Open ({open.length})
        </Text>
      </TouchableOpacity>
      {openExpanded ? (
        <View className="gap-2">
          {open.map((d) => (
            <DealCard key={d._id} deal={d} onPress={() => setSelectedDeal(d)} />
          ))}
          {open.length === 0 ? (
            <Text className="text-xs text-m-text-tertiary italic p-3">No open deals</Text>
          ) : null}
        </View>
      ) : null}

      {/* Won/Lost groups — collapsible. Tap the header row to expand/collapse
          the list of deals underneath. Previously the TouchableOpacity had no
          onPress so taps were silently dropped. */}
      {[
        { label: 'Closed Won', deals: won, tone: colors.success ?? '#059669' },
        { label: 'Closed Lost', deals: lost, tone: colors.textSecondary },
      ].map((group) => {
        const isExpanded = expandedGroups.has(group.label);
        return (
          <View key={group.label} className="gap-2">
            <TouchableOpacity
              onPress={() => toggleGroup(group.label)}
              className="flex-row items-center gap-2 bg-m-bg-card border border-m-border rounded-[12px] px-3.5 py-2.5"
              activeOpacity={0.7}
            >
              <ChevronRight
                size={14}
                color={colors.textSecondary}
                strokeWidth={2}
                style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }}
              />
              <Text className="text-xs font-semibold text-m-text-primary flex-1">
                {group.label}
              </Text>
              <Text className="text-[11px] font-semibold" style={{ color: group.tone }}>
                {fmt(sum(group.deals))}
              </Text>
              <Text className="text-[11px] text-m-text-tertiary">
                · {group.deals.length} deals
              </Text>
            </TouchableOpacity>
            {isExpanded ? (
              <View className="gap-2">
                {group.deals.map((d) => (
                  <DealCard
                    key={d._id}
                    deal={d}
                    onPress={() => setSelectedDeal(d)}
                  />
                ))}
                {group.deals.length === 0 ? (
                  <Text className="text-xs text-m-text-tertiary italic p-3">
                    No {group.label.toLowerCase()} deals
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      <DealDetailSheet
        deal={selectedDeal}
        visible={selectedDeal !== null}
        onClose={() => setSelectedDeal(null)}
        onViewAllActivity={() => {
          // Defer to the parent — it owns both the activeTab state and the
          // deal-filter state that ActivityTab reads. Fixes a pre-existing
          // out-of-scope `setActiveTab` reference here that was silently
          // being TypeScript-error'd but never crashed because the code
          // path requires tapping this CTA.
          if (selectedDeal && onNavigateToActivity) {
            onNavigateToActivity(String(selectedDeal._id), selectedDeal.name);
          }
          setSelectedDeal(null);
        }}
      />
    </View>
  );
}

// ActivityTab — inline tab for the 'Activity' view. Renders filter chips
// (All, Emails, Meetings, Notes, Calls, Tasks), groups the resulting
// activities into Today / Yesterday / This week / Older buckets, and
// renders each entry with ActivityCard.
//
// Hooks note: we call useQuery twice unconditionally — the second query
// is skipped (via 'skip') unless the user has picked the EMAIL filter.
// That keeps hook order stable across filter changes (rules-of-hooks).
type ActivityFilter = 'all' | 'EMAIL' | 'MEETING' | 'NOTE' | 'CALL' | 'TASK';

function ActivityTab({
  clientId,
  dealFilter,
  onSetDealFilter,
  onClearDealFilter,
}: {
  clientId: string;
  // Optional deal-scope filter. When set, the list is narrowed to
  // activities whose `dealId` matches or whose `linkedDealIds` array
  // includes this deal. The filter chip at the top of the tab lets the
  // user clear back to the whole-client feed. Can be set either from
  // DealDetailSheet's "View activity for this deal" deep-link OR from
  // the in-tab "Filter by deal" picker.
  dealFilter?: { id: string; name: string } | null;
  onSetDealFilter?: (deal: { id: string; name: string }) => void;
  onClearDealFilter?: () => void;
}) {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [showDealPicker, setShowDealPicker] = useState(false);
  // Load client's deals for the in-tab "Filter by deal" picker. Cheap —
  // typically a handful per client — and the query is already used
  // elsewhere on the client profile.
  const clientDeals = useQuery(
    api.deals.listForClient,
    { clientId: clientId as any },
  ) ?? [];
  // Hydrate the active deal's company associations so we can match
  // activities by company as a fallback. HubSpot's v1 engagements
  // endpoint doesn't reliably return deal associations, so activities
  // often lack `dealId`/`linkedDealIds` even when they're genuinely
  // tied to a deal via its company.
  const selectedDealFull = useQuery(
    api.deals.getDealById,
    dealFilter ? { dealId: dealFilter.id as any } : 'skip',
  );
  const dealCompanyIdSet = new Set(
    ((selectedDealFull as any)?.linkedCompanyIds ?? []).map((id: any) => String(id)),
  );

  // Always query outgoing emails; query incoming only when the user picks EMAIL filter
  const outboundOrAll = useQuery(
    api.activities.listForClient,
    filter === 'all'
      ? { clientId: clientId as any, limit: 200 }
      : {
          clientId: clientId as any,
          typeFilter: filter === 'EMAIL' ? 'EMAIL' : filter,
          limit: 200,
        },
  ) ?? [];

  const incomingEmails = useQuery(
    api.activities.listForClient,
    filter === 'EMAIL'
      ? { clientId: clientId as any, typeFilter: 'INCOMING_EMAIL', limit: 200 }
      : 'skip',
  ) ?? [];

  // When the user picks MEETING, also pull MEETING_NOTE (Fireflies transcripts)
  // so both show up under the "Meetings" chip — matches the home tab's
  // ACTIVITY_FILTERS match list `['meeting', 'meeting-note']` (commit f777d2e).
  // Convex `typeFilter` is a single string, so we run a second query and merge
  // rather than changing the server signature.
  const meetingNotes = useQuery(
    api.activities.listForClient,
    filter === 'MEETING'
      ? { clientId: clientId as any, typeFilter: 'MEETING_NOTE', limit: 200 }
      : 'skip',
  ) ?? [];

  const fullList =
    filter === 'EMAIL'
      ? [...outboundOrAll, ...incomingEmails]
      : filter === 'MEETING'
        ? [...outboundOrAll, ...meetingNotes]
        : outboundOrAll;

  // Apply optional deal-scope filter. Three match paths, any one is
  // enough:
  //   1. Explicit primary link (activity.dealId)
  //   2. Multi-link (activity.linkedDealIds contains the deal)
  //   3. Company fallback (activity.companyId is one of the deal's
  //      linkedCompanyIds) — needed because the HubSpot v1 engagements
  //      endpoint often doesn't return deal associations, so dealId +
  //      linkedDealIds end up empty even when the activity is genuinely
  //      about the deal.
  const dealScoped = dealFilter
    ? fullList.filter((a: any) => {
        if (a.dealId && String(a.dealId) === dealFilter.id) return true;
        const linked: any[] = a.linkedDealIds || [];
        if (linked.some((id) => String(id) === dealFilter.id)) return true;
        if (a.companyId && dealCompanyIdSet.has(String(a.companyId))) return true;
        return false;
      })
    : fullList;

  const sorted = dealScoped
    .slice()
    .sort((a, b) => (b.activityDate ?? '').localeCompare(a.activityDate ?? ''));

  // Group by date bucket
  const now = Date.now();
  type Bucket = 'Today' | 'Yesterday' | 'This week' | 'Older';
  const bucketOf = (iso?: string): Bucket => {
    if (!iso) return 'Older';
    const days = Math.floor((now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return 'This week';
    return 'Older';
  };

  const grouped: Record<Bucket, typeof sorted> = {
    Today: [],
    Yesterday: [],
    'This week': [],
    Older: [],
  };
  for (const a of sorted) {
    grouped[bucketOf(a.activityDate)].push(a);
  }

  const FILTERS: { key: ActivityFilter; label: string }[] = [
    { key: 'all', label: `All · ${sorted.length}` },
    { key: 'EMAIL', label: 'Emails' },
    { key: 'MEETING', label: 'Meetings' },
    { key: 'NOTE', label: 'Notes' },
    { key: 'CALL', label: 'Calls' },
    { key: 'TASK', label: 'Tasks' },
  ];

  return (
    <View className="gap-3">
      {/* Deal-scope filter row — shows the active deal pill (dismissible)
          or a "Filter by deal" trigger when no filter is set. Tapping the
          trigger opens a picker of the client's deals. */}
      <View className="flex-row">
        {dealFilter ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingLeft: 10,
              paddingRight: 4,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: colors.bgBrand,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: colors.textOnBrand,
                maxWidth: 200,
              }}
              numberOfLines={1}
            >
              Deal: {dealFilter.name}
            </Text>
            <TouchableOpacity
              onPress={onClearDealFilter}
              hitSlop={8}
              style={{
                width: 18,
                height: 18,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 9,
                backgroundColor: 'rgba(255,255,255,0.2)',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.textOnBrand,
                  lineHeight: 11,
                }}
              >
                ×
              </Text>
            </TouchableOpacity>
          </View>
        ) : clientDeals.length > 0 ? (
          <TouchableOpacity
            onPress={() => setShowDealPicker(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bgCard,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: colors.textSecondary,
              }}
            >
              Filter by deal
            </Text>
            <Text
              style={{
                fontSize: 9,
                color: colors.textTertiary,
                marginTop: 1,
              }}
            >
              ▾
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Deal picker modal */}
      <Modal
        visible={showDealPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDealPicker(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(10,10,10,0.55)' }}>
          <TouchableOpacity
            onPress={() => setShowDealPicker(false)}
            activeOpacity={1}
            style={{ flex: 1 }}
          />
          <SafeAreaView
            className="rounded-t-[20px] overflow-hidden"
            style={{ backgroundColor: colors.bgCard, maxHeight: '70%' }}
          >
            <View className="items-center pt-2 pb-1">
              <View className="w-10 h-1 rounded-full" style={{ backgroundColor: '#d4d4d4' }} />
            </View>
            <View
              className="flex-row items-center justify-between px-4 pt-2 pb-3"
              style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Text className="text-[15px] font-semibold text-m-text-primary">
                Filter by deal
              </Text>
              <TouchableOpacity onPress={() => setShowDealPicker(false)} hitSlop={8}>
                <Text className="text-[18px] text-m-text-tertiary">×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {clientDeals.map((d: any) => (
                <TouchableOpacity
                  key={d._id}
                  onPress={() => {
                    onSetDealFilter?.({ id: String(d._id), name: d.name });
                    setShowDealPicker(false);
                  }}
                  className="flex-row items-center justify-between px-4 py-3"
                  style={{ borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }}
                >
                  <View className="flex-1 min-w-0">
                    <Text
                      className="text-sm font-medium text-m-text-primary"
                      numberOfLines={1}
                    >
                      {d.name}
                    </Text>
                    <Text
                      className="text-[11px] text-m-text-tertiary mt-0.5"
                      numberOfLines={1}
                    >
                      {d.stageName || d.stage || 'Unstaged'}
                      {d.amount ? ` · £${d.amount.toLocaleString()}` : ''}
                    </Text>
                  </View>
                  <ChevronRight size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Filter chips — horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              className="px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: active ? '#0a0a0a' : '#fafaf9',
                borderWidth: active ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              <Text
                className="text-[11px] font-medium"
                style={{ color: active ? '#ffffff' : colors.textSecondary }}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Timeline grouped */}
      {(['Today', 'Yesterday', 'This week', 'Older'] as const).map((bucket) =>
        grouped[bucket].length > 0 ? (
          <View key={bucket} className="gap-2">
            <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
              {bucket}
            </Text>
            {grouped[bucket].map((a) => (
              <ActivityCard key={a._id} activity={a} />
            ))}
          </View>
        ) : null,
      )}

      {sorted.length === 0 ? (
        <Text className="text-sm text-m-text-tertiary italic text-center py-12">
          No activity yet
        </Text>
      ) : null}
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
  // Active deal filter on the Activity tab. Set by the deal-detail sheet's
  // "View all activity" CTA; cleared via the chip at the top of ActivityTab
  // or by tapping a different deal's CTA (new filter replaces the old).
  const [dealActivityFilter, setDealActivityFilter] = useState<
    { id: string; name: string } | null
  >(null);

  // ---------- State for interactive features ----------
  const [expandedFlags, setExpandedFlags] = useState<Set<string>>(new Set());
  const [expandedMeetings, setExpandedMeetings] = useState<Set<string>>(new Set());
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [flagFilter, setFlagFilter] = useState<'open' | 'resolved'>('open');
  const [projectSearch, setProjectSearch] = useState('');
  // Which contact's detail sheet is open (from Key Contacts on Overview).
  // null = no sheet open. The ContactDetailModal is rendered once at the
  // bottom of the component; this just toggles its visibility.
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const [showLinkContact, setShowLinkContact] = useState(false);

  // Tasks creation modal
  const [showTaskCreation, setShowTaskCreation] = useState(false);

  // Flags creation sheet
  const [showFlagSheet, setShowFlagSheet] = useState(false);

  // Project creation sheet
  const [showProjectSheet, setShowProjectSheet] = useState(false);

  // ---------- Queries ----------
  const skip = !isAuthenticated || !clientId;

  const client = useQuery(api.clients.get, skip ? 'skip' : { id: clientId as any });

  const projects = useQuery(api.projects.getByClient, skip ? 'skip' : { clientId: clientId as any });

  const contacts = useQuery(api.contacts.getByClient, skip ? 'skip' : { clientId: clientId as any });

  const tasks = useQuery(api.tasks.getByClient, skip ? 'skip' : { clientId: clientId as any });

  const notes = useQuery(api.notes.getByClient, skip ? 'skip' : { clientId: clientId as any });

  const documents = useQuery(api.documents.getByClient, skip ? 'skip' : { clientId: clientId as any });

  const folderCounts = useQuery(api.documents.getFolderCounts, skip ? 'skip' : { clientId: clientId as any });

  // Folder records (source of truth for which folders exist, including empty ones).
  // folderCounts only has entries for folders with docs, so we can't use it alone —
  // empty client-level folders would never render.
  const foldersData = useQuery(api.folderStructure.getAllFoldersForClient, skip ? 'skip' : { clientId: clientId as any });

  const openFlagCount = useQuery(api.flags.getOpenCountByClient, skip ? 'skip' : { clientId: clientId as any });

  const clientFlags = useQuery(
    api.flags.getByClient,
    skip ? 'skip' : { clientId: clientId as any, status: flagFilter }
  );

  // Resolve the primary linked company for this client (via promotedToClientId).
  // Used by Overview to surface HubSpot owner, sync time, URL, and Beauhurst
  // intel that live on the company record.
  const promotedCompanies = useQuery(
    api.companies.listByPromotedClient,
    skip ? 'skip' : { clientId: clientId as any }
  );
  const primaryCompany = promotedCompanies?.[0];

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
    // Merged feed: native `meetings` table rows + MEETING_NOTE activities
    // (e.g. Fireflies transcripts). Each row carries `source: 'native' | 'fireflies'`
    // so the UI can render a purple FIREFLIES badge + transcript link for the
    // fireflies variant. See convex/meetings.ts.
    meetings = useQuery(
      api.meetings.getByClientIncludingMeetingNotes,
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

  // Checklist summary — powers the Knowledge Library card progress bar.
  let checklistSummary: any = undefined;
  try {
    checklistSummary = useQuery(
      api.knowledgeLibrary.getChecklistSummary,
      skip ? 'skip' : { clientId: clientId as any },
    );
  } catch {
    // API may not exist
  }

  // Missing items — powers "Priority Missing" list inside Knowledge Library.
  let missingItems: any = undefined;
  try {
    missingItems = useQuery(
      api.knowledgeLibrary.getMissingItems,
      skip ? 'skip' : { clientId: clientId as any },
    );
  } catch {
    // API may not exist
  }

  // ---------- Mutations ----------
  const completeTask = useMutation(api.tasks.complete);
  const updateChecklistStatus = useMutation(api.knowledgeLibrary.updateItemStatus);
  const replyToFlag = useMutation(api.flags.reply);
  const updateStageNote = useMutation(api.clients.updateStageNote);

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

  // Overview: derived metrics for the 4-tile key-metrics row.
  const totalDealValue = useMemo(() => {
    if (!projects) return 0;
    return projects.reduce((s: number, p: any) => s + (p.loanAmount || 0), 0);
  }, [projects]);

  const activeProjectsCount = useMemo(() => {
    if (!projects) return 0;
    return projects.filter((p: any) => p.status === 'active').length;
  }, [projects]);

  const primaryContact = useMemo(() => {
    if (!contacts || contacts.length === 0) return null;
    return contacts[0];
  }, [contacts]);

  // Overview: recent documents (top 3 by uploadedAt desc) + recent projects.
  const recentDocuments = useMemo(() => {
    if (!documents) return [];
    return [...documents]
      .sort(
        (a: any, b: any) =>
          new Date(b.uploadedAt || 0).getTime() -
          new Date(a.uploadedAt || 0).getTime()
      )
      .slice(0, 3);
  }, [documents]);

  const recentProjects = useMemo(() => {
    if (!projects) return [];
    return [...projects]
      .sort(
        (a: any, b: any) =>
          new Date(b._creationTime || 0).getTime() -
          new Date(a._creationTime || 0).getTime()
      )
      .slice(0, 3);
  }, [projects]);

  // Overview: top 5 active tasks for the Active Tasks preview card.
  const activeTasksPreview = useMemo(() => {
    if (!tasks) return [];
    return tasks
      .filter((t: any) => t.status === 'todo' || t.status === 'in_progress')
      .slice(0, 5);
  }, [tasks]);

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
  const handleSaveStageNote = async (next: string) => {
    if (!clientId) return;
    await updateStageNote({ id: clientId as any, stageNote: next });
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

  // Fireflies rows route to a dedicated detail screen with parsed transcript
  // formatting. Native meetings keep the existing inline expand-toggle
  // behaviour (rendered inside the same Card below).
  const handleMeetingTap = (m: any) => {
    if (m.source === 'fireflies' && m.activityId) {
      router.push(`/meetings/transcript/${m.activityId}` as any);
      return;
    }
    toggleMeetingExpanded(m._id);
  };

  // ---------- Render ----------
  if (!client) return <LoadingSpinner message="Loading client..." />;

  return (
    <View className="flex-1 bg-m-bg">
      {/* App chrome (RockCap brand + nav). Matches every other top-level
          screen so the client profile no longer looks like it jumps
          straight into the client-branded banner with no RockCap context. */}
      <MobileHeader />

      {/* Client brand banner — flattened from 4 stacked rows to 2:
            row 1 = back arrow + name + status pill on one line
            row 2 = single horizontal chip strip (type + HubSpot facets)
          Previously: back, name, type+status, HubSpot chips = 4 rows.
          Previous status was a pill rendered after the type text on its
          own row; it now sits at the far right of the name row for
          balance and to reclaim vertical space. */}
      <View className="bg-m-bg-brand pt-2 pb-3 px-4">
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => router.back()}
            className="flex-row items-center -ml-1 pr-1"
            hitSlop={8}
          >
            <ArrowLeft size={20} color={colors.textOnBrand} />
          </TouchableOpacity>
          <Text
            className="flex-1 text-lg font-bold text-m-text-on-brand"
            numberOfLines={1}
          >
            {client.name}
          </Text>
          {client.status ? (
            <View className="bg-white/15 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] text-m-text-on-brand/80 uppercase tracking-wide font-medium">
                {client.status}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Unified chip strip: client type + HubSpot facets (lifecycle,
            company type, industry, owner). Consolidates what used to be
            a standalone type+status row AND a separate HubSpot chip row. */}
        {(() => {
          const chips: { label: string; value: string }[] = [];
          if (client.type) chips.push({ label: 'Type', value: client.type });
          const stageName =
            primaryCompany?.hubspotLifecycleStageName ??
            primaryCompany?.hubspotLifecycleStage;
          if (stageName) chips.push({ label: 'Lifecycle', value: stageName });
          if (primaryCompany?.type && primaryCompany.type !== client.type)
            chips.push({ label: 'HS Type', value: primaryCompany.type });
          if (primaryCompany?.industry)
            chips.push({ label: 'Industry', value: primaryCompany.industry });
          if (primaryCompany?.ownerName)
            chips.push({ label: 'Owner', value: primaryCompany.ownerName });
          if (chips.length === 0) return null;
          return (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingTop: 6 }}
            >
              {chips.map((c) => (
                <View
                  key={`${c.label}:${c.value}`}
                  className="bg-white/12 border border-white/20 px-2 py-0.5 rounded-full"
                >
                  <Text className="text-[10px] text-m-text-on-brand/80 uppercase tracking-wide font-medium">
                    <Text className="text-m-text-on-brand/55">{c.label} · </Text>
                    {c.value}
                  </Text>
                </View>
              ))}
            </ScrollView>
          );
        })()}
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
            {/* Stage Note — inline-editable "Status:" banner with blue accent */}
            <StageNoteBanner
              value={client.stageNote || ''}
              onSave={handleSaveStageNote}
            />

            {/* HubSpot sync strip — owner chip + last-sync timestamp + open-in-HubSpot link.
                Sourced from the primary linked company (promotedToClientId match). */}
            {primaryCompany ? (
              <SyncStrip
                ownerName={primaryCompany.ownerName}
                lastSync={primaryCompany.lastHubSpotSync}
                hubspotUrl={primaryCompany.hubspotUrl}
              />
            ) : null}

            {/* Open Deals summary — HubSpot deals linked to this client */}
            <OpenDealsCard
              clientId={clientId as any}
              onViewAll={() => setActiveTab('Deals')}
            />

            {/* Recent Activity — notes / emails / meetings / calls / tasks */}
            <RecentActivityCard
              clientId={clientId as any}
              onViewAll={() => setActiveTab('Activity')}
            />

            {/* Beauhurst intelligence snapshot — turnover / headcount / stage */}
            <BeauhurstMiniCard
              metadata={primaryCompany?.metadata}
              onPressFullIntel={() => setActiveTab('Intelligence')}
            />

            {/* Classification chips — company type, lead source, industry, county */}
            <ClassificationCard
              companyType={primaryCompany?.metadata?.company_type}
              leadSource={primaryCompany?.metadata?.lead_source}
              industry={primaryCompany?.industry}
              county={primaryCompany?.metadata?.company_county}
            />

            {/* Key Metrics — 4 colored tiles, wrap to 2x2 on narrow screens */}
            <View className="flex-row flex-wrap gap-2">
              <MetricTile
                icon={<DollarSign size={18} color={metricTones.green.tint} />}
                tone="green"
                label="Deal Value"
                value={totalDealValue > 0 ? formatCurrency(totalDealValue) : '—'}
                valueSubtle={projects && projects.length === 0 ? '(no projects)' : undefined}
              />
              <MetricTile
                icon={<FolderKanban size={18} color={metricTones.purple.tint} />}
                tone="purple"
                label="Active Projects"
                value={String(activeProjectsCount)}
                valueSubtle={
                  projects && projects.length > 0
                    ? `of ${projects.length}`
                    : undefined
                }
                onPress={() => setActiveTab('Projects')}
              />
              <MetricTile
                icon={<User size={18} color={metricTones.blue.tint} />}
                tone="blue"
                label="Primary Contact"
                value={primaryContact?.name ?? 'No contacts'}
                valueSubtle={
                  primaryContact?.role || primaryContact?.email || undefined
                }
              />
              <MetricTile
                icon={<FileText size={18} color={metricTones.orange.tint} />}
                tone="orange"
                label="Documents"
                value={String(totalDocs)}
                onPress={() => setActiveTab('Docs')}
              />
            </View>

            {/* Knowledge Library — progress + missing required docs */}
            <KnowledgeLibraryCard
              summary={checklistSummary}
              missingItems={missingItems}
              onViewAll={() => setActiveTab('Checklist')}
            />

            {/* Company Information — expanded detail card */}
            <Card>
              <View className="flex-row items-center gap-2 mb-3">
                <Building2 size={16} color={colors.textSecondary} />
                <Text className="text-sm font-semibold text-m-text-primary flex-1">
                  Company Information
                </Text>
              </View>
              <View className="gap-2.5">
                <InfoRow label="Company Name" value={(client as any).companyName || client.name} />
                {(client as any).industry ? (
                  <InfoRow label="Industry" value={(client as any).industry} />
                ) : null}
                {formatClientAddress(client) ? (
                  <View>
                    <Text className="text-[10px] text-m-text-tertiary uppercase tracking-wide mb-0.5">
                      Address
                    </Text>
                    <View className="flex-row items-start gap-1.5">
                      <MapPin size={12} color={colors.textTertiary} style={{ marginTop: 2 }} />
                      <Text className="text-sm text-m-text-primary flex-1">
                        {formatClientAddress(client)}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {client.email ? (
                  <View>
                    <Text className="text-[10px] text-m-text-tertiary uppercase tracking-wide mb-0.5">
                      Email
                    </Text>
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`mailto:${client.email}`)}
                      className="flex-row items-center gap-1.5"
                    >
                      <Mail size={12} color={colors.accent} />
                      <Text className="text-sm text-m-accent">{client.email}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {client.phone ? (
                  <View>
                    <Text className="text-[10px] text-m-text-tertiary uppercase tracking-wide mb-0.5">
                      Phone
                    </Text>
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${client.phone}`)}
                      className="flex-row items-center gap-1.5"
                    >
                      <Phone size={12} color={colors.accent} />
                      <Text className="text-sm text-m-accent">{client.phone}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {(client as any).website ? (
                  <View>
                    <Text className="text-[10px] text-m-text-tertiary uppercase tracking-wide mb-0.5">
                      Website
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        const url = (client as any).website;
                        Linking.openURL(url.startsWith('http') ? url : `https://${url}`);
                      }}
                      className="flex-row items-center gap-1.5"
                    >
                      <Globe size={12} color={colors.accent} />
                      <Text className="text-sm text-m-accent">{(client as any).website}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {(client as any).createdAt || client._creationTime ? (
                  <View>
                    <Text className="text-[10px] text-m-text-tertiary uppercase tracking-wide mb-0.5">
                      Client Since
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                      <Calendar size={12} color={colors.textTertiary} />
                      <Text className="text-sm text-m-text-primary">
                        {formatDateShort(
                          (client as any).createdAt ||
                            new Date(client._creationTime).toISOString()
                        )}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {(client as any).tags && (client as any).tags.length > 0 ? (
                  <View>
                    <Text className="text-[10px] text-m-text-tertiary uppercase tracking-wide mb-1">
                      Tags
                    </Text>
                    <View className="flex-row flex-wrap gap-1">
                      {(client as any).tags.map((tag: string, i: number) => (
                        <View
                          key={i}
                          className="bg-m-bg-subtle rounded-full px-2 py-0.5"
                        >
                          <Text className="text-[11px] font-medium text-m-text-secondary">
                            {tag}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
                {(client as any).notes ? (
                  <View className="mt-1 pt-2 border-t border-m-border-subtle">
                    <Text className="text-[10px] text-m-text-tertiary uppercase tracking-wide mb-1">
                      Notes
                    </Text>
                    <Text className="text-sm text-m-text-secondary leading-5">
                      {String((client as any).notes).slice(0, 300)}
                      {String((client as any).notes).length > 300 ? '...' : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Card>

            {/* Recent Activity — Documents + Projects sections */}
            {(recentDocuments.length > 0 || recentProjects.length > 0) && (
              <Card>
                <View className="flex-row items-center gap-2 mb-3">
                  <TrendingUp size={16} color={colors.textSecondary} />
                  <Text className="text-sm font-semibold text-m-text-primary flex-1">
                    Recent Activity
                  </Text>
                </View>

                {/* Documents */}
                {recentDocuments.length > 0 && (
                  <View className="mb-3">
                    <View className="flex-row items-center justify-between mb-1.5">
                      <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
                        Documents
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
                      {recentDocuments.map((doc: any) => (
                        <TouchableOpacity
                          key={doc._id}
                          onPress={() =>
                            router.push(`/(tabs)/docs/viewer?documentId=${doc._id}` as any)
                          }
                          className="flex-row items-center gap-2 py-1.5"
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
                              <Text className="text-[10px] text-m-text-secondary" numberOfLines={1}>
                                {doc.category}
                              </Text>
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Projects */}
                {recentProjects.length > 0 && (
                  <View
                    className={recentDocuments.length > 0 ? 'pt-3 border-t border-m-border-subtle' : ''}
                  >
                    <View className="flex-row items-center justify-between mb-1.5">
                      <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
                        Projects
                      </Text>
                      <TouchableOpacity
                        onPress={() => setActiveTab('Projects')}
                        className="flex-row items-center"
                      >
                        <Text className="text-xs text-m-text-tertiary mr-0.5">View all</Text>
                        <ChevronRight size={12} color={colors.textTertiary} />
                      </TouchableOpacity>
                    </View>
                    <View className="gap-1">
                      {recentProjects.map((p: any) => {
                        const isActive = p.status === 'active';
                        return (
                          <TouchableOpacity
                            key={p._id}
                            onPress={() =>
                              router.push(
                                `/(tabs)/clients/${clientId}/projects/${p._id}` as any
                              )
                            }
                            className="flex-row items-center gap-2 py-1.5"
                          >
                            <View
                              className="w-6 h-6 rounded-[6px] items-center justify-center"
                              style={{
                                backgroundColor: isActive
                                  ? metricTones.green.bg
                                  : colors.bgInset,
                              }}
                            >
                              <Briefcase
                                size={12}
                                color={
                                  isActive ? metricTones.green.tint : colors.textTertiary
                                }
                              />
                            </View>
                            <Text
                              className="text-sm text-m-text-primary flex-1"
                              numberOfLines={1}
                            >
                              {p.name}
                            </Text>
                            {p.loanAmount ? (
                              <Text className="text-xs text-m-text-tertiary">
                                {formatCurrency(p.loanAmount)}
                              </Text>
                            ) : null}
                            {p.status ? <StatusBadge status={p.status} size="xs" /> : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </Card>
            )}

            {/* Active Tasks preview (top 5) */}
            {activeTasksPreview.length > 0 && (
              <Card>
                <View className="flex-row items-center gap-2 mb-3">
                  <CheckCircle2 size={16} color={colors.textSecondary} />
                  <Text className="text-sm font-semibold text-m-text-primary flex-1">
                    Active Tasks
                  </Text>
                  <View className="bg-m-bg-subtle rounded-full px-1.5 py-0.5">
                    <Text className="text-[10px] font-semibold text-m-text-secondary">
                      {activeTasksPreview.length}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setActiveTab('Tasks')}
                    className="flex-row items-center"
                  >
                    <Text className="text-xs text-m-text-tertiary mr-0.5">View all</Text>
                    <ChevronRight size={12} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                <View className="gap-2">
                  {activeTasksPreview.map((task: any) => {
                    const isOverdue =
                      task.dueDate && new Date(task.dueDate) < new Date();
                    return (
                      <View
                        key={task._id}
                        className="flex-row items-start gap-2"
                      >
                        <View
                          className="w-1.5 h-1.5 rounded-full mt-2"
                          style={{
                            backgroundColor:
                              task.status === 'in_progress'
                                ? metricTones.blue.tint
                                : colors.textTertiary,
                          }}
                        />
                        <View className="flex-1">
                          <Text
                            className="text-sm text-m-text-primary"
                            numberOfLines={1}
                          >
                            {task.title}
                          </Text>
                          <View className="flex-row items-center gap-2 mt-0.5">
                            {task.priority ? (
                              <View
                                className="rounded-[6px] px-1.5 py-0.5"
                                style={{
                                  backgroundColor:
                                    task.priority === 'high'
                                      ? '#fef2f2'
                                      : task.priority === 'medium'
                                        ? '#fef3c7'
                                        : '#f0fdf4',
                                }}
                              >
                                <Text
                                  className="text-[10px] font-medium capitalize"
                                  style={{
                                    color:
                                      task.priority === 'high'
                                        ? '#b91c1c'
                                        : task.priority === 'medium'
                                          ? '#92400e'
                                          : '#166534',
                                  }}
                                >
                                  {task.priority}
                                </Text>
                              </View>
                            ) : null}
                            {task.dueDate ? (
                              <View className="flex-row items-center gap-0.5">
                                <Clock
                                  size={10}
                                  color={isOverdue ? colors.error : colors.textTertiary}
                                />
                                <Text
                                  className="text-[10px]"
                                  style={{
                                    color: isOverdue ? colors.error : colors.textTertiary,
                                  }}
                                >
                                  {new Date(task.dueDate).toLocaleDateString('en-GB', {
                                    day: 'numeric',
                                    month: 'short',
                                  })}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}

            {/* Key Contacts — always rendered (even at 0) so the "+ Link"
                entry point is reachable for clients with no contacts yet. */}
            {contacts ? (
              <Card>
                <View className="flex-row items-center gap-2 mb-2">
                  <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide flex-1">
                    Key Contacts ({contacts.length})
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowLinkContact(true)}
                    className="flex-row items-center gap-0.5 px-2 py-1 rounded-full bg-m-bg-subtle"
                    hitSlop={6}
                    accessibilityLabel="Link existing contact"
                  >
                    <Plus size={11} color={colors.textPrimary} strokeWidth={2.5} />
                    <Text className="text-[11px] font-medium text-m-text-primary">
                      Link
                    </Text>
                  </TouchableOpacity>
                  {contacts.length > 0 ? (
                    <TouchableOpacity
                      onPress={() =>
                        router.push(`/contacts?clientId=${clientId}` as any)
                      }
                      className="flex-row items-center"
                      hitSlop={6}
                    >
                      <Text className="text-xs text-m-text-tertiary mr-0.5">
                        View all
                      </Text>
                      <ChevronRight size={12} color={colors.textTertiary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {contacts.length === 0 ? (
                  <Text className="text-xs text-m-text-tertiary italic py-2">
                    No contacts linked yet — tap Link to add one
                  </Text>
                ) : null}
                <View className="gap-0">
                  {contacts.slice(0, 5).map((c: any, idx: number) => (
                    <View key={c._id}>
                      {idx > 0 && <View className="h-px bg-m-border-subtle" />}
                      <TouchableOpacity
                        onPress={() => setOpenContactId(c._id)}
                        activeOpacity={0.6}
                        className="flex-row items-center gap-3 py-2.5"
                      >
                        <ContactAvatar name={c.name} size={32} />
                        <View className="flex-1 min-w-0">
                          <Text
                            className="text-sm font-medium text-m-text-primary"
                            numberOfLines={1}
                          >
                            {c.name}
                          </Text>
                          {c.role || c.email ? (
                            <Text
                              className="text-xs text-m-text-tertiary mt-0.5"
                              numberOfLines={1}
                            >
                              {c.role || c.email}
                            </Text>
                          ) : null}
                        </View>
                        <ChevronRight size={14} color={colors.textTertiary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                {contacts.length > 5 ? (
                  <TouchableOpacity
                    onPress={() =>
                      router.push(`/contacts?clientId=${clientId}` as any)
                    }
                    className="mt-2 pt-2 border-t border-m-border-subtle flex-row items-center justify-center"
                  >
                    <Text className="text-xs text-m-accent font-medium">
                      View all {contacts.length} contacts
                    </Text>
                    <ChevronRight size={12} color={colors.accent} />
                  </TouchableOpacity>
                ) : null}
              </Card>
            ) : null}

            {/* Quick Links — compact remaining-jumps */}
            <Card>
              <SectionHeader title="Quick Links" />
              <View className="gap-0">
                <QuickLinkRow
                  label="Open Flags"
                  value={openFlagCount ?? 0}
                  onPress={() => setActiveTab('Flags')}
                />
                <QuickLinkRow
                  label="Notes"
                  value={notes?.length ?? 0}
                  onPress={() => setActiveTab('Notes')}
                />
              </View>
            </Card>
          </>
        )}

        {/* ================================================================ */}
        {/* DEALS TAB */}
        {/* ================================================================ */}
        {activeTab === 'Deals' ? (
          <DealsTab
            clientId={clientId as any}
            onNavigateToActivity={(dealId, dealName) => {
              setDealActivityFilter({ id: dealId, name: dealName });
              setActiveTab('Activity');
            }}
          />
        ) : null}

        {/* ================================================================ */}
        {/* ACTIVITY TAB */}
        {/* ================================================================ */}
        {activeTab === 'Activity' ? (
          <ActivityTab
            clientId={clientId as any}
            dealFilter={dealActivityFilter}
            onSetDealFilter={(deal) => setDealActivityFilter(deal)}
            onClearDealFilter={() => setDealActivityFilter(null)}
          />
        ) : null}

        {/* ================================================================ */}
        {/* PROJECTS TAB */}
        {/* ================================================================ */}
        {activeTab === 'Projects' && (
          <View className="gap-2">
            <TouchableOpacity
              onPress={() => setShowProjectSheet(true)}
              className="bg-m-accent rounded-lg py-2.5 items-center flex-row justify-center gap-2"
              accessibilityRole="button"
            >
              <Plus size={16} color={colors.textOnBrand} />
              <Text className="text-sm font-medium text-m-text-on-brand">New Project</Text>
            </TouchableOpacity>

            <ProjectsList
              clientId={clientId as string}
              projects={sortedProjects}
              folderCounts={folderCounts}
              projectSearch={projectSearch}
              setProjectSearch={setProjectSearch}
              onOpenProject={(pid) =>
                router.push(`/(tabs)/clients/${clientId}/projects/${pid}` as any)
              }
            />
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

            {/* Client-level folders. Rendered from foldersData (actual folder
                records) so empty folders still appear. Shown flat — parents and
                children as peers — to match desktop's visible folder set in a
                mobile list UI. Unfiled pseudo-row surfaces docs not matched to
                any known folder (computed: clientTotal − sum(folder counts)). */}
            {(() => {
              const allClientFolders = foldersData?.clientFolders ?? [];
              const counts = (folderCounts?.clientFolders ?? {}) as Record<string, number>;
              const filedSum = allClientFolders.reduce(
                (sum: number, f: any) => sum + (counts[f.folderType] ?? 0),
                0
              );
              const unfiledCount = Math.max(0, (folderCounts?.clientTotal ?? 0) - filedSum);
              if (allClientFolders.length === 0 && unfiledCount === 0) return null;
              return (
                <Card>
                  <SectionHeader title="Client Documents" />
                  <View className="gap-1">
                    {allClientFolders.map((folder: any) => {
                      const count = counts[folder.folderType] ?? 0;
                      return (
                        <TouchableOpacity
                          key={folder._id}
                          onPress={() =>
                            router.push({
                              pathname: '/(tabs)/docs',
                              params: {
                                clientId: clientId as string,
                                clientName: client.name,
                                clientFolderType: folder.folderType,
                                clientFolderName: folder.name,
                              },
                            })
                          }
                          className="flex-row items-center justify-between py-2"
                        >
                          <View className="flex-row items-center gap-2 flex-1">
                            <FolderOpen size={14} color={colors.accent} />
                            <Text className="text-sm text-m-text-primary">{folder.name}</Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            <Text className="text-xs text-m-text-tertiary">{count}</Text>
                            <ChevronRight size={14} color={colors.textTertiary} />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                    {unfiledCount > 0 && (
                      <TouchableOpacity
                        onPress={() =>
                          router.push({
                            pathname: '/(tabs)/docs',
                            params: {
                              clientId: clientId as string,
                              clientName: client.name,
                              clientFolderType: 'unfiled',
                              clientFolderName: 'Unfiled',
                            },
                          })
                        }
                        className="flex-row items-center justify-between py-2"
                      >
                        <View className="flex-row items-center gap-2 flex-1">
                          <FolderOpen size={14} color={colors.textTertiary} />
                          <Text className="text-sm text-m-text-primary italic">Unfiled</Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                          <Text className="text-xs text-m-text-tertiary">{unfiledCount}</Text>
                          <ChevronRight size={14} color={colors.textTertiary} />
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                </Card>
              );
            })()}

            {/* Project folders */}
            {docsProjectFolders.length > 0 ? (
              docsProjectFolders.map((proj) => (
                <Card key={proj.projectId}>
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/docs',
                        params: {
                          clientId: clientId as string,
                          clientName: client.name,
                          projectId: proj.projectId,
                          projectName: proj.projectName,
                        },
                      })
                    }
                    className="flex-row items-center gap-2 mb-2"
                  >
                    <FileText size={14} color={colors.accent} />
                    <Text className="text-sm font-semibold text-m-text-primary flex-1">{proj.projectName}</Text>
                    <Text className="text-xs text-m-text-tertiary">{proj.total} docs</Text>
                  </TouchableOpacity>
                  <View className="gap-0">
                    {Object.entries(proj.folders).map(([folder, count], idx) => (
                      <View key={folder}>
                        {idx > 0 && <View className="h-px bg-m-border-subtle" />}
                        <TouchableOpacity
                          // Deep-link into /docs at the documents level for
                          // this project/folder combo. `folder` here is the
                          // folderType string (keys from getFolderCounts are
                          // folderType, not _id — same gotcha as Bug 2).
                          onPress={() =>
                            router.push({
                              pathname: '/(tabs)/docs',
                              params: {
                                clientId: clientId as string,
                                clientName: client.name,
                                projectId: proj.projectId,
                                projectName: proj.projectName,
                                folderType: folder,
                                folderName:
                                  folder === 'notes'
                                    ? 'Notes'
                                    : folder.replace(/_/g, ' '),
                              },
                            })
                          }
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
            {primaryCompany?.metadata ? (
              <View className="gap-3">
                <View className="flex-row items-center gap-1.5 px-1">
                  <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
                    Beauhurst intel
                  </Text>
                  <View className="bg-m-bg-subtle px-1.5 py-0.5 rounded">
                    <Text className="text-[9px] font-semibold text-m-text-secondary uppercase">CRM</Text>
                  </View>
                </View>
                <BeauhurstIdentityCard metadata={primaryCompany.metadata} companyName={primaryCompany.name} />
                <BeauhurstFinancialsCard metadata={primaryCompany.metadata} />
                <BeauhurstSignalsCard metadata={primaryCompany.metadata} />

                {/* Divider */}
                <View className="flex-row items-center gap-2.5 py-1">
                  <View className="flex-1 h-px bg-m-border" />
                  <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
                    AI intel from docs
                  </Text>
                  <View className="flex-1 h-px bg-m-border" />
                </View>
              </View>
            ) : null}
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
              onPress={() => router.push({ pathname: '/notes/editor', params: { clientId: clientId as string } })}
              className="bg-m-accent rounded-lg py-2.5 items-center flex-row justify-center gap-2"
            >
              <Plus size={16} color={colors.textOnBrand} />
              <Text className="text-sm font-medium text-m-text-on-brand">Add Note</Text>
            </TouchableOpacity>

            {notes && notes.length > 0 ? (
              notes.map((n: any) => {
                const preview = extractPlainText(n.content);
                const truncatedPreview = preview.length > 80 ? preview.slice(0, 80) + '...' : preview;
                const noteDate = n.updatedAt ?? n.createdAt ?? n._creationTime;

                return (
                  <TouchableOpacity
                    key={n._id}
                    onPress={() => router.push({ pathname: '/notes/editor', params: { noteId: n._id } })}
                    activeOpacity={0.7}
                  >
                    <Card>
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
                  </TouchableOpacity>
                );
              })
            ) : (
              <EmptyState message="No notes yet" />
            )}
          </View>
        )}

        {/* ================================================================ */}
        {/* TASKS TAB */}
        {/* ================================================================ */}
        {activeTab === 'Tasks' && (
          <View className="gap-2">
            <TouchableOpacity
              onPress={() => setShowTaskCreation(true)}
              className="bg-m-accent rounded-lg py-2.5 items-center flex-row justify-center gap-2"
            >
              <Plus size={16} color={colors.textOnBrand} />
              <Text className="text-sm font-medium text-m-text-on-brand">New Task</Text>
            </TouchableOpacity>

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

            {tasks && tasks.length === 0 && <EmptyState message="No tasks" />}
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
                const isFireflies = m.source === 'fireflies';
                // Strip HTML tags for the expanded transcript view. Cheap/naive but
                // matches ActivityCard's approach — fine for plain-text rendering.
                const strippedFullBody: string | undefined =
                  isFireflies && typeof m.fullBody === 'string'
                    ? m.fullBody
                        .replace(/<br\s*\/?>(?=\s|$)/gi, '\n')
                        .replace(/<\/?p[^>]*>/gi, '\n')
                        .replace(/<[^>]+>/g, '')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/\n{3,}/g, '\n\n')
                        .trim()
                    : undefined;
                return (
                  <Card key={m._id}>
                    <TouchableOpacity onPress={() => handleMeetingTap(m)}>
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 mr-2">
                          <View className="flex-row items-center gap-2 flex-wrap">
                            <Text className="text-sm font-medium text-m-text-primary">
                              {m.title || 'Meeting'}
                            </Text>
                            {isFireflies ? (
                              <View
                                style={{
                                  paddingHorizontal: 5,
                                  paddingVertical: 1,
                                  backgroundColor: '#ede9fe',
                                  borderRadius: 3,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 9,
                                    fontWeight: '700',
                                    color: '#7c3aed',
                                    letterSpacing: 0.3,
                                  }}
                                >
                                  FIREFLIES
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <View className="flex-row items-center gap-3 mt-1">
                            <Text className="text-xs text-m-text-tertiary">
                              {new Date(m.meetingDate).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </Text>
                            {m.attendees && m.attendees.length > 0 && (
                              <Text className="text-xs text-m-text-tertiary">
                                {m.attendees.length} attendee{m.attendees.length !== 1 ? 's' : ''}
                              </Text>
                            )}
                            {isFireflies && typeof m.durationMinutes === 'number' && m.durationMinutes > 0 ? (
                              <Text className="text-xs text-m-text-tertiary">
                                {m.durationMinutes} min
                              </Text>
                            ) : null}
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
                        {isFireflies ? (
                          <>
                            {strippedFullBody ? (
                              <View>
                                <Text className="text-xs font-semibold text-m-text-tertiary mb-1">Transcript</Text>
                                <Text className="text-sm text-m-text-secondary leading-5">
                                  {strippedFullBody}
                                </Text>
                              </View>
                            ) : m.bodyPreview ? (
                              <View>
                                <Text className="text-xs font-semibold text-m-text-tertiary mb-1">Preview</Text>
                                <Text className="text-sm text-m-text-secondary leading-5">
                                  {m.bodyPreview}
                                </Text>
                              </View>
                            ) : null}
                            {m.transcriptUrl ? (
                              <TouchableOpacity
                                onPress={(e) => {
                                  e.stopPropagation();
                                  Linking.openURL(m.transcriptUrl).catch(() => {
                                    /* noop — URL may be malformed */
                                  });
                                }}
                                hitSlop={6}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 4,
                                  alignSelf: 'flex-start',
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                  borderRadius: 6,
                                  backgroundColor: '#ede9fe',
                                }}
                              >
                                <ExternalLink size={11} color="#7c3aed" strokeWidth={2.2} />
                                <Text style={{ fontSize: 11, fontWeight: '600', color: '#7c3aed' }}>
                                  Open transcript
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
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
              onPress={() => setShowFlagSheet(true)}
              className="bg-m-accent rounded-lg py-2.5 items-center flex-row justify-center gap-2"
            >
              <Flag size={16} color={colors.textOnBrand} />
              <Text className="text-sm font-medium text-m-text-on-brand">New Flag</Text>
            </TouchableOpacity>

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

      {/* Contact detail — opened from the Overview's Key Contacts card */}
      <ContactDetailModal
        visible={openContactId !== null}
        contactId={openContactId}
        onClose={() => setOpenContactId(null)}
      />

      {/* Link contact — opened from the Key Contacts "+" button */}
      <LinkContactModal
        visible={showLinkContact}
        clientId={clientId as any}
        clientName={client.name}
        alreadyLinkedIds={(contacts ?? []).map((c: any) => c._id)}
        onClose={() => setShowLinkContact(false)}
      />

      <TaskCreationFlow
        visible={showTaskCreation}
        onClose={() => setShowTaskCreation(false)}
        prefilledClientId={clientId as any}
      />

      <FlagCreationSheet
        visible={showFlagSheet}
        onClose={() => setShowFlagSheet(false)}
        clientId={clientId as any}
      />

      <ProjectCreationSheet
        visible={showProjectSheet}
        onClose={() => setShowProjectSheet(false)}
        clientId={clientId as any}
      />
    </View>
  );
}
