import { View, Text, TouchableOpacity } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { Id } from '../../../model-testing-app/convex/_generated/dataModel';
import { TrendingUp, ChevronRight } from 'lucide-react-native';
import { useColors } from '@/lib/useColors';
import { typography } from '@/lib/theme';
import EntityIconTile from '@/components/ui/EntityIconTile';

interface OpenDealsCardProps {
  clientId: Id<'clients'>;
  onViewAll?: () => void;
}

function formatMoney(amount?: number): string {
  if (amount === undefined || amount === null) return '—';
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}K`;
  return `£${amount.toLocaleString()}`;
}

export default function OpenDealsCard({ clientId, onViewAll }: OpenDealsCardProps) {
  const c = useColors();
  const mono = { fontFamily: typography.family.mono } as const;
  const deals = useQuery(api.deals.listOpenForClient, { clientId }) ?? [];
  const allDeals = useQuery(api.deals.listForClient, { clientId }) ?? [];

  const openTotal = deals.reduce((s, d) => s + (d.amount ?? 0), 0);
  const won = allDeals.filter((d) => d.isClosedWon === true);
  const lost = allDeals.filter((d) => d.isClosed === true && d.isClosedWon !== true);
  const wonTotal = won.reduce((s, d) => s + (d.amount ?? 0), 0);
  const lostTotal = lost.reduce((s, d) => s + (d.amount ?? 0), 0);

  const topOpen = deals
    .slice()
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
    .slice(0, 2);

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-[14px]">
      <View className="flex-row justify-between items-center mb-2.5">
        <View className="flex-row items-center gap-1.5">
          <EntityIconTile icon={TrendingUp} type="deal" size={20} />
          <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
            Open deals
          </Text>
        </View>
        <TouchableOpacity onPress={onViewAll} hitSlop={6} className="flex-row items-center gap-0.5">
          <Text className="text-xs font-medium text-m-text-primary">
            View all {allDeals.length}
          </Text>
          <ChevronRight size={12} color={c.text.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View className="flex-row items-baseline gap-1.5 mb-3">
        <Text className="text-[22px] font-bold text-m-text-primary" style={mono}>{formatMoney(openTotal)}</Text>
        <Text className="text-xs text-m-text-tertiary">in {deals.length} open deals</Text>
      </View>

      <View className="gap-2">
        {topOpen.map((d) => (
          <View
            key={d._id}
            className="flex-row justify-between items-start p-2 bg-m-bg rounded-[8px] border border-m-border-subtle"
          >
            <View className="flex-1 min-w-0 mr-2">
              <Text className="text-[13px] font-medium text-m-text-primary" numberOfLines={1}>
                {d.name}
              </Text>
              <Text className="text-[10px] text-m-text-tertiary mt-0.5">
                {d.stageName ?? d.stage ?? '—'}
              </Text>
            </View>
            <Text className="text-[13px] font-semibold text-m-text-primary" style={mono}>
              {formatMoney(d.amount)}
            </Text>
          </View>
        ))}
        {topOpen.length === 0 ? (
          <Text className="text-xs text-m-text-tertiary italic">No open deals</Text>
        ) : null}
      </View>

      <View
        className="mt-2.5 pt-2.5 border-t border-m-border-subtle flex-row justify-between"
      >
        <Text className="text-[11px] text-m-text-tertiary">
          Won{' '}
          <Text style={{ color: c.status.promoted, fontWeight: '600', ...mono }}>
            {formatMoney(wonTotal)}
          </Text>
        </Text>
        <Text className="text-[11px] text-m-text-tertiary">
          Lost{' '}
          <Text style={{ color: c.text.secondary, fontWeight: '600', ...mono }}>
            {formatMoney(lostTotal)}
          </Text>
        </Text>
      </View>
    </View>
  );
}
