import { View, Text } from 'react-native';
import { useColors } from '@/lib/useColors';
import { typography } from '@/lib/theme';

interface Props { metadata?: any; }

const MONO = { fontFamily: typography.family.mono } as const;

function fmtMoney(raw: any): string {
  if (!raw) return '—';
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!isFinite(n) || n === 0) return '—';
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${Math.round(n)}`;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export default function BeauhurstFinancialsCard({ metadata }: Props) {
  const c = useColors();
  if (!metadata) return null;
  const turnover = metadata.beauhurst_data_turnover;
  const ebitda = metadata.beauhurst_data_ebitda;
  const headcount = metadata.beauhurst_data_headcount;
  const funding = metadata.beauhurst_data_total_funding_received;
  const accountsDate = metadata.beauhurst_data_date_of_accounts;

  if (!turnover && !ebitda && !headcount && !funding) return null;

  return (
    <View
      className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5"
      style={{ borderTopWidth: 2, borderTopColor: c.entityTypes.client }}
    >
      <Text
        className="text-[10px] font-semibold text-m-text-tertiary uppercase mb-2.5"
        style={{ ...MONO, letterSpacing: 0.5 }}
      >
        Financials
      </Text>
      <View className="flex-row flex-wrap gap-y-2.5">
        <View className="w-1/2 pr-2">
          <Text className="text-[10px] text-m-text-tertiary">Turnover</Text>
          <Text className="text-sm font-semibold text-m-text-primary mt-0.5" style={MONO}>
            {fmtMoney(turnover)}
          </Text>
        </View>
        <View className="w-1/2 pl-2">
          <Text className="text-[10px] text-m-text-tertiary">EBITDA</Text>
          <Text className="text-sm font-semibold text-m-text-primary mt-0.5" style={MONO}>{fmtMoney(ebitda)}</Text>
        </View>
        <View className="w-1/2 pr-2">
          <Text className="text-[10px] text-m-text-tertiary">Headcount</Text>
          <Text className="text-sm font-semibold text-m-text-primary mt-0.5" style={MONO}>{headcount ?? '—'}</Text>
        </View>
        <View className="w-1/2 pl-2">
          <Text className="text-[10px] text-m-text-tertiary">Funding received</Text>
          <Text className="text-sm font-semibold text-m-text-primary mt-0.5" style={MONO}>{fmtMoney(funding)}</Text>
        </View>
      </View>
      {accountsDate ? (
        <Text className="text-[10px] text-m-text-tertiary mt-2">Accounts filed {fmtDate(accountsDate)}</Text>
      ) : null}
    </View>
  );
}
