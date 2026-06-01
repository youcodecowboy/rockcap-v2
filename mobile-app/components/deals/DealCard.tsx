import { View, Text, TouchableOpacity } from 'react-native';
import { Calendar, Clock } from 'lucide-react-native';
import { colors, typography } from '@/lib/theme';
import { useColors } from '@/lib/useColors';
import { categorizeStage, type StageCategory } from '@/lib/dealStageColors';
import type { Palette } from '@/lib/theme';
import type { Doc } from '../../../model-testing-app/convex/_generated/dataModel';

// Stage category → canon accent (see DealDetailSheet for rationale). Keeps the
// lib-owned selection logic; only swaps the light pastels for dark-readable
// tinted accents.
function stageAccent(accent: Palette['accent'], stageName?: string): string {
  const byCategory: Record<StageCategory, string> = {
    amber: accent.yellow,
    blue: accent.blue,
    purple: accent.purple,
    green: accent.green,
    grey: '#9a9a9a',
  };
  return byCategory[categorizeStage(stageName)];
}

interface DealCardProps {
  deal: Doc<'deals'>;
  onPress?: () => void;
}

function formatMoney(amount?: number): string {
  if (amount === undefined || amount === null) return '—';
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}K`;
  return `£${amount.toLocaleString()}`;
}

function formatClose(iso?: string): { text: string; tone: 'normal' | 'warn' | 'past' } {
  if (!iso) return { text: 'No close date', tone: 'normal' };
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((then - now) / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: `Past ${-days}d`, tone: 'past' };
  if (days <= 14) return { text: `Closes ${days}d`, tone: 'warn' };
  return { text: new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), tone: 'normal' };
}

function formatLastActivity(iso?: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function DealCard({ deal, onPress }: DealCardProps) {
  const c = useColors();
  const stageColor = stageAccent(c.accent, deal.stageName);
  const closeInfo = formatClose(deal.closeDate);
  const closeColor =
    closeInfo.tone === 'past' ? colors.error : closeInfo.tone === 'warn' ? colors.warning : colors.textTertiary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="bg-m-bg-card border border-m-border rounded-[12px] p-3"
      style={{ borderLeftWidth: 2, borderLeftColor: c.entityTypes.deal }}
    >
      <View className="flex-row justify-between items-start gap-2 mb-2">
        <View className="flex-1 min-w-0">
          <Text className="text-sm font-semibold text-m-text-primary" numberOfLines={1}>
            {deal.name}
          </Text>
          {deal.spvName ? (
            <Text className="text-[11px] text-m-text-tertiary mt-0.5">SPV: {deal.spvName}</Text>
          ) : null}
        </View>
        <Text
          className="text-base font-bold text-m-text-primary"
          style={{ fontFamily: typography.family.mono }}
        >
          {formatMoney(deal.amount)}
        </Text>
      </View>

      <View className="flex-row items-center flex-wrap gap-1.5">
        <View
          style={{
            backgroundColor: `${stageColor}26`,
            borderWidth: 1,
            borderColor: `${stageColor}66`,
          }}
          className="px-2 py-0.5 rounded-full"
        >
          <Text style={{ color: stageColor }} className="text-[10px] font-medium">
            {deal.stageName ?? '—'}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Calendar size={11} color={closeColor} strokeWidth={2} />
          <Text style={{ color: closeColor }} className="text-[11px]">
            {closeInfo.text}
          </Text>
        </View>
        <View className="flex-row items-center gap-1 ml-auto">
          <Clock size={11} color={colors.textTertiary} strokeWidth={2} />
          <Text className="text-[11px] text-m-text-tertiary">{formatLastActivity(deal.lastActivityDate)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
