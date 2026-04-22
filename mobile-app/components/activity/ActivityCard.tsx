import { useState } from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import {
  StickyNote, Mail, Video, Phone, CheckSquare, FileText,
  ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';
import type { Doc } from '../../../model-testing-app/convex/_generated/dataModel';

interface ActivityCardProps {
  activity: Doc<'activities'>;
}

const TYPE_TILE = {
  NOTE: { bg: '#f3e8ff', tint: '#9333ea', Icon: StickyNote, label: 'Note' },
  EMAIL: { bg: '#ffedd5', tint: '#ea580c', Icon: Mail, label: 'Email' },
  INCOMING_EMAIL: { bg: '#dcfce7', tint: '#059669', Icon: Mail, label: 'Email' },
  MEETING: { bg: '#dbeafe', tint: '#2563eb', Icon: Video, label: 'Meeting' },
  // Meeting transcripts (Fireflies.ai) — purple to distinguish from calendar
  // meetings while staying in the "meetings" visual family. Matches the home
  // tab's `meeting-note` ActivityKind tile colors (commit f777d2e).
  MEETING_NOTE: { bg: '#ede9fe', tint: '#7c3aed', Icon: FileText, label: 'Meeting notes' },
  CALL: { bg: '#fef3c7', tint: '#d97706', Icon: Phone, label: 'Call' },
  TASK: { bg: '#ffedd5', tint: '#ea580c', Icon: CheckSquare, label: 'Task' },
} as const;

/**
 * Format an activity date/time for the card header.
 *
 * Returns something like:
 *   "14:30"                     — today
 *   "Yesterday 14:30"           — yesterday
 *   "Mon 12 Apr, 14:30"         — same year
 *   "12 Apr 2024, 14:30"        — older
 *
 * The original version returned time-only regardless of age, which made
 * activities from months ago indistinguishable from today's.
 */
function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  if (sameDay) return time;
  if (isYesterday) return `Yesterday ${time}`;

  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    const dateFmt = d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    return `${dateFmt}, ${time}`;
  }
  const dateFmt = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${dateFmt}, ${time}`;
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  const minutes = Math.round(ms / 60000);
  return `${minutes} min`;
}

/**
 * Best-effort HTML-to-text for email bodies. HubSpot emails come in as
 * `bodyHtml` with <p>, <br>, anchor tags, and inline styles — we strip to
 * plain text for mobile. Good enough for an expandable preview; richer
 * rendering is a future enhancement.
 */
function stripHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function ActivityCard({ activity }: ActivityCardProps) {
  const typeKey = activity.activityType as keyof typeof TYPE_TILE;
  const tile = TYPE_TILE[typeKey] ?? TYPE_TILE.NOTE;
  const Icon = tile.Icon;
  const direction = activity.direction; // 'inbound' | 'outbound' | undefined
  const isEmail = typeKey === 'EMAIL' || typeKey === 'INCOMING_EMAIL';
  // Fireflies.ai transcript affordances: small "FIREFLIES" pill next to the
  // attribution line + an inline "Open transcript" link inside the expanded
  // body. Only MEETING_NOTE activities carry `sourceIntegration === 'fireflies'`
  // today, but we gate on the field itself so any future integration-tagged
  // activity type renders the same badge.
  const isFireflies =
    (activity as any).sourceIntegration === 'fireflies';
  const transcriptUrl: string | undefined =
    (activity as any).transcriptUrl || undefined;

  // Expandable: if the activity has a full body (bodyHtml, or body, or a
  // bodyPreview longer than a one-liner), let the user tap to expand.
  // Notes in particular are often a paragraph the preview truncates.
  const fullBody =
    stripHtml(activity.bodyHtml) ||
    (activity as any).body ||
    activity.bodyPreview ||
    '';
  const previewBody = activity.bodyPreview || fullBody;
  const hasMoreContent =
    fullBody.length > 0 && fullBody.length > (previewBody?.length ?? 0) + 20;

  const [expanded, setExpanded] = useState(false);

  const attribution =
    tile.label +
    (direction ? ` · ${direction}` : '') +
    (activity.duration ? ` · ${formatDuration(activity.duration)}` : '') +
    (activity.ownerName ? ` · ${activity.ownerName}` : '');

  const Container: any = hasMoreContent ? TouchableOpacity : View;
  const containerProps = hasMoreContent
    ? { onPress: () => setExpanded((v) => !v), activeOpacity: 0.7 }
    : {};

  return (
    <Container
      className="bg-m-bg-card border border-m-border rounded-[12px] p-3 flex-row gap-2.5"
      {...containerProps}
    >
      <View
        className="w-8 h-8 rounded-[8px] items-center justify-center relative"
        style={{ backgroundColor: tile.bg }}
      >
        <Icon size={16} color={tile.tint} strokeWidth={2} />
        {isEmail && direction ? (
          <View
            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full items-center justify-center"
            style={{
              backgroundColor: direction === 'outbound' ? '#ea580c' : '#059669',
              borderWidth: 2,
              borderColor: '#fafaf9',
            }}
          >
            {direction === 'outbound' ? (
              <ArrowUpRight size={7} color="#ffffff" strokeWidth={3} />
            ) : (
              <ArrowDownLeft size={7} color="#ffffff" strokeWidth={3} />
            )}
          </View>
        ) : null}
      </View>

      <View className="flex-1 min-w-0">
        <View className="flex-row justify-between items-baseline mb-0.5">
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              className="text-[11px] text-m-text-tertiary"
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {attribution}
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
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#7c3aed', letterSpacing: 0.3 }}>
                  FIREFLIES
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-[10px] text-m-text-tertiary ml-2">
            {formatDateTime(activity.activityDate)}
          </Text>
        </View>

        {activity.subject ? (
          <Text
            className="text-[13px] font-medium text-m-text-primary"
            numberOfLines={expanded ? undefined : 1}
          >
            {activity.subject}
          </Text>
        ) : null}

        {expanded && fullBody ? (
          <Text className="text-[12px] text-m-text-secondary mt-1 leading-[17px]">
            {fullBody}
          </Text>
        ) : previewBody ? (
          <Text className="text-[11px] text-m-text-secondary mt-0.5" numberOfLines={2}>
            {previewBody}
          </Text>
        ) : null}

        {/* Fireflies transcript deep-link — shown only when expanded so it
            doesn't add visual noise to collapsed rows. Tapping opens the
            transcript in the user's browser via Linking.openURL. */}
        {expanded && isFireflies && transcriptUrl ? (
          <TouchableOpacity
            onPress={(e) => {
              // Prevent the parent TouchableOpacity (expand/collapse) from
              // firing when the user taps the link itself.
              e.stopPropagation();
              Linking.openURL(transcriptUrl).catch(() => {
                /* noop — URL may be malformed; silently ignore */
              });
            }}
            hitSlop={6}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              alignSelf: 'flex-start',
              marginTop: 6,
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

        {hasMoreContent ? (
          <View className="flex-row items-center gap-1 mt-1.5">
            {expanded ? (
              <>
                <ChevronUp size={11} color={colors.textTertiary} strokeWidth={2} />
                <Text className="text-[10px] text-m-text-tertiary font-medium">
                  Collapse
                </Text>
              </>
            ) : (
              <>
                <ChevronDown size={11} color={colors.textTertiary} strokeWidth={2} />
                <Text className="text-[10px] text-m-text-tertiary font-medium">
                  Read more
                </Text>
              </>
            )}
          </View>
        ) : null}
      </View>
    </Container>
  );
}
