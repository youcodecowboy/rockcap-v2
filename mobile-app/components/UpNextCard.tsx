import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ListTodo, Calendar, Bell } from 'lucide-react-native';
import { colors } from '@/lib/theme';

/**
 * UpNextCard — React Native port of the web dashboard's rich "Up Next" card.
 *
 * Renders a Card with a stacked list of upcoming items (tasks, reminders, events),
 * each with a type icon, title, context · relative-time subtitle, urgency-colored
 * left border, and an urgency badge.
 *
 * Data shape matches the web's `UpNextItem` for parity; build the array in the
 * parent via a `resolveUpNext()` helper that merges tasks + reminders + events
 * and sorts by urgency (overdue first, then soonest upcoming).
 */

export type UpNextItemType = 'task' | 'reminder' | 'event';

export interface UpNextItem {
  id: string;
  type: UpNextItemType;
  title: string;
  context: string; // client name for tasks/reminders, location for events
  dueDate: Date;
  href: string; // route to navigate on tap
}

type Urgency = 'overdue' | 'today' | 'future';

function getUrgency(dueDate: Date): Urgency {
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffMs < 0) return 'overdue';
  if (diffHours < 24) return 'today';
  return 'future';
}

function formatRelativeTime(dueDate: Date): string {
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const minutes = Math.floor(abs / 60000);
  const hours = Math.floor(abs / 3600000);
  const days = Math.floor(abs / 86400000);

  if (days > 0) {
    const label = `${days}d`;
    return diffMs < 0 ? `Due ${label} ago` : `In ${label}`;
  }
  if (hours > 0) {
    const label = `${hours}h`;
    return diffMs < 0 ? `Due ${label} ago` : `In ${label}`;
  }
  const label = `${Math.max(1, minutes)}m`;
  return diffMs < 0 ? `Due ${label} ago` : `In ${label}`;
}

interface UrgencyStyle {
  borderColor: string;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
  badgeLabel: string;
}

const urgencyStyles: Record<Urgency, UrgencyStyle> = {
  overdue: {
    borderColor: colors.error,
    iconColor: colors.error,
    badgeBg: '#fef2f2',
    badgeText: '#991b1b',
    badgeLabel: 'OVERDUE',
  },
  today: {
    borderColor: colors.warning,
    iconColor: colors.warning,
    badgeBg: '#fffbeb',
    badgeText: '#92400e',
    badgeLabel: 'DUE TODAY',
  },
  future: {
    borderColor: colors.borderSubtle,
    iconColor: colors.textTertiary,
    badgeBg: colors.bgSubtle,
    badgeText: colors.textSecondary,
    badgeLabel: 'UPCOMING',
  },
};

const typeIcons: Record<UpNextItemType, typeof ListTodo> = {
  task: ListTodo,
  reminder: Bell,
  event: Calendar,
};

interface UpNextCardProps {
  items: UpNextItem[];
  maxItems?: number;
}

export default function UpNextCard({ items, maxItems = 3 }: UpNextCardProps) {
  const router = useRouter();
  const visible = items.slice(0, maxItems);

  return (
    <View className="bg-m-bg-card rounded-xl p-4 border border-m-border">
      <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-3">
        Up Next
      </Text>

      {visible.length === 0 ? (
        <Text className="text-sm text-m-text-tertiary">Nothing scheduled</Text>
      ) : (
        <View className="gap-2">
          {visible.map((item) => {
            const urgency = getUrgency(item.dueDate);
            const style = urgencyStyles[urgency];
            const Icon = typeIcons[item.type];
            const relative = formatRelativeTime(item.dueDate);

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => router.push(item.href as never)}
                className="flex-row items-start gap-3 pl-3 py-1.5"
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: style.borderColor,
                }}
              >
                <View className="mt-0.5">
                  <Icon size={16} color={style.iconColor} />
                </View>
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text
                      className="text-sm font-semibold text-m-text-primary flex-1"
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <View
                      className="px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: style.badgeBg }}
                    >
                      <Text
                        className="text-[9px] font-semibold tracking-wide"
                        style={{ color: style.badgeText }}
                      >
                        {style.badgeLabel}
                      </Text>
                    </View>
                  </View>
                  <Text
                    className="text-xs text-m-text-tertiary mt-0.5"
                    numberOfLines={1}
                  >
                    {item.context} · {relative}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}
