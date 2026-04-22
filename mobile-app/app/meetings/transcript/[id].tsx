import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import type { Id } from '../../../../model-testing-app/convex/_generated/dataModel';
import { ArrowLeft, Calendar, Clock, Users, ExternalLink, FileText } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import {
  parseFirefliesBody,
  type FirefliesBullet,
} from '@/lib/fireflies-parser';

/**
 * Fireflies transcript detail screen. Loaded when the user taps a
 * Fireflies-sourced meeting row in the client-profile Meetings section.
 *
 * Route param `id` is the real activity `_id` (not the synthetic
 * `activity-` prefixed one — the caller strips the prefix before
 * navigating).
 */
export default function TranscriptDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activity = useQuery(
    api.activities.getById,
    id ? { id: id as Id<'activities'> } : 'skip',
  );

  if (!activity) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
        <TopBar onBack={() => router.back()} />
        <Text style={{ marginTop: 40, textAlign: 'center', color: colors.textTertiary }}>
          Loading…
        </Text>
      </View>
    );
  }

  const parsed = parseFirefliesBody(activity.bodyHtml ?? '');
  const attendees = activity.toEmails ?? [];
  const durationMinutes =
    typeof activity.duration === 'number' && activity.duration > 0
      ? Math.round(activity.duration / 60000)
      : null;
  const dateStr = formatMeetingDate(activity.activityDate);
  const transcriptUrl = (activity as any).transcriptUrl as string | undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}
      >
        {/* Hero card */}
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#e5e5e5',
            padding: 18,
            gap: 10,
          }}
        >
          {/* Fireflies badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                backgroundColor: '#ede9fe',
                borderRadius: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <FileText size={11} color="#7c3aed" />
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#7c3aed', letterSpacing: 0.4 }}>
                FIREFLIES TRANSCRIPT
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 22,
              fontWeight: '700',
              color: colors.textPrimary,
              lineHeight: 28,
              letterSpacing: -0.3,
            }}
          >
            {activity.subject || 'Call transcript'}
          </Text>

          {/* Meta row: date + duration */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {dateStr ? <MetaChip Icon={Calendar} label={dateStr} /> : null}
            {durationMinutes ? <MetaChip Icon={Clock} label={`${durationMinutes} min`} /> : null}
            {attendees.length > 0 ? (
              <MetaChip
                Icon={Users}
                label={`${attendees.length} attendee${attendees.length === 1 ? '' : 's'}`}
              />
            ) : null}
          </View>

          {/* Attendees list (expanded) */}
          {attendees.length > 0 && (
            <View style={{ marginTop: 4, gap: 4 }}>
              {attendees.map((email: string) => (
                <Text
                  key={email}
                  style={{ fontSize: 13, color: colors.textSecondary }}
                >
                  • {email}
                </Text>
              ))}
            </View>
          )}

          {/* Open in Fireflies */}
          {transcriptUrl && (
            <TouchableOpacity
              onPress={() => Linking.openURL(transcriptUrl)}
              style={{
                marginTop: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                backgroundColor: '#0a0a0a',
                borderRadius: 10,
              }}
            >
              <ExternalLink size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                Open recording in Fireflies
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Parsed sections */}
        {parsed.sections.map((section, i) => (
          <View
            key={`${section.heading}-${i}`}
            style={{
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#e5e5e5',
              padding: 16,
              gap: 10,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: colors.textPrimary,
                letterSpacing: -0.2,
              }}
            >
              {section.heading}
            </Text>
            {section.summary ? (
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 20,
                  color: colors.textSecondary,
                }}
              >
                {section.summary}
              </Text>
            ) : null}
            {section.bullets.length > 0 && (
              <View style={{ gap: 6, marginTop: 4 }}>
                {section.bullets.map((b, bi) => (
                  <BulletRow key={bi} bullet={b} />
                ))}
              </View>
            )}
          </View>
        ))}

        {/* Action items */}
        {parsed.actionItems.length > 0 && (
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#e5e5e5',
              padding: 16,
              gap: 12,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: colors.textPrimary,
                letterSpacing: -0.2,
              }}
            >
              Action items
            </Text>
            {parsed.actionItems.map((group, i) => (
              <View key={`${group.person}-${i}`} style={{ gap: 4 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.textPrimary,
                    marginTop: i > 0 ? 4 : 0,
                  }}
                >
                  {group.person}
                </Text>
                {group.items.map((item, ii) => (
                  <BulletRow key={ii} bullet={item} />
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Parse-failure fallback */}
        {parsed.sections.length === 0 && parsed.actionItems.length === 0 && (
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#e5e5e5',
              padding: 20,
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 14, color: colors.textTertiary, textAlign: 'center' }}>
              Couldn't parse this transcript's structure.
            </Text>
            {transcriptUrl ? (
              <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
                Tap "Open in Fireflies" above to view it there.
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e5e5',
        backgroundColor: '#fff',
      }}
    >
      <TouchableOpacity
        onPress={onBack}
        style={{ padding: 6, marginRight: 4 }}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <ArrowLeft size={20} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text
        style={{
          fontSize: 15,
          fontWeight: '600',
          color: colors.textPrimary,
        }}
      >
        Meeting transcript
      </Text>
    </View>
  );
}

function MetaChip({
  Icon,
  label,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon size={13} color={colors.textTertiary} />
      <Text style={{ fontSize: 12, color: colors.textSecondary }}>{label}</Text>
    </View>
  );
}

function BulletRow({ bullet, depth = 0 }: { bullet: FirefliesBullet; depth?: number }) {
  return (
    <View style={{ marginLeft: depth * 14 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Text style={{ color: colors.textTertiary, fontSize: 13, lineHeight: 20 }}>
          {depth === 0 ? '•' : '◦'}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 20, color: colors.textPrimary, flex: 1 }}>
          {bullet.text}
          {bullet.timeMarkerUrl ? (
            <Text
              onPress={() => Linking.openURL(bullet.timeMarkerUrl!)}
              style={{ color: '#7c3aed', fontWeight: '600' }}
            >
              {' '}
              ↗
            </Text>
          ) : null}
        </Text>
      </View>
      {bullet.children.length > 0 && (
        <View style={{ gap: 4, marginTop: 4 }}>
          {bullet.children.map((child, i) => (
            <BulletRow key={i} bullet={child} depth={depth + 1} />
          ))}
        </View>
      )}
    </View>
  );
}

function formatMeetingDate(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
