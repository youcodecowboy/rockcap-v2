import { View, Text, TouchableOpacity } from 'react-native';
import { Building2, ChevronRight } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface BeauhurstMiniCardProps {
  metadata?: any;
  onPressFullIntel?: () => void;
}

function fmtMoney(raw: any): string {
  if (!raw) return '—';
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!isFinite(n) || n === 0) return '—';
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${Math.round(n)}`;
}

export default function BeauhurstMiniCard({ metadata, onPressFullIntel }: BeauhurstMiniCardProps) {
  if (!metadata) return null;
  const turnover = metadata.beauhurst_data_turnover;
  const ebitda = metadata.beauhurst_data_ebitda;
  const headcount = metadata.beauhurst_data_headcount;
  const stage = metadata.beauhurst_data_stage_of_evolution;
  const growthSignals = metadata.beauhurst_data_growth_signals;
  const riskSignals = metadata.beauhurst_data_risk_signals;

  if (!turnover && !ebitda && !headcount && !stage && !growthSignals && !riskSignals) {
    return null; // No Beauhurst data available for this company
  }

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-[14px]">
      <View className="flex-row justify-between items-center mb-2.5">
        <View className="flex-row items-center gap-1.5">
          <View
            className="w-5 h-5 rounded-[6px] items-center justify-center"
            style={{ backgroundColor: '#dbeafe' }}
          >
            <Building2 size={12} color="#2563eb" strokeWidth={2} />
          </View>
          <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
            Beauhurst intel
          </Text>
        </View>
        <TouchableOpacity
          onPress={onPressFullIntel}
          hitSlop={6}
          className="flex-row items-center gap-0.5"
        >
          <Text className="text-xs font-medium text-m-text-primary">Full intel</Text>
          <ChevronRight size={12} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View className="flex-row flex-wrap gap-y-2.5 mb-3">
        <View className="w-1/2 pr-2">
          <Text className="text-[10px] text-m-text-tertiary uppercase">Turnover</Text>
          <Text className="text-[14px] font-semibold text-m-text-primary mt-0.5">
            {fmtMoney(turnover)}
          </Text>
        </View>
        <View className="w-1/2 pl-2">
          <Text className="text-[10px] text-m-text-tertiary uppercase">Headcount</Text>
          <Text className="text-[14px] font-semibold text-m-text-primary mt-0.5">
            {headcount ?? '—'}
          </Text>
        </View>
        <View className="w-1/2 pr-2">
          <Text className="text-[10px] text-m-text-tertiary uppercase">EBITDA</Text>
          <Text className="text-[14px] font-semibold text-m-text-primary mt-0.5">
            {fmtMoney(ebitda)}
          </Text>
        </View>
        <View className="w-1/2 pl-2">
          <Text className="text-[10px] text-m-text-tertiary uppercase">Stage</Text>
          <Text className="text-[14px] font-semibold text-m-text-primary mt-0.5">
            {stage ?? '—'}
          </Text>
        </View>
      </View>

      {/* Signal chips — Beauhurst returns these as semicolon-separated strings */}
      <View className="flex-row flex-wrap gap-1">
        {(growthSignals ? String(growthSignals).split(';').slice(0, 2) : []).map((s, i) => (
          <View key={`g-${i}`} style={{ backgroundColor: '#dcfce7' }} className="px-2 py-0.5 rounded-full">
            <Text className="text-[10px]" style={{ color: '#059669' }}>{s.trim()}</Text>
          </View>
        ))}
        {(riskSignals ? String(riskSignals).split(';').slice(0, 1) : []).map((s, i) => (
          <View key={`r-${i}`} style={{ backgroundColor: '#fef3c7' }} className="px-2 py-0.5 rounded-full">
            <Text className="text-[10px]" style={{ color: '#d97706' }}>{s.trim()}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
