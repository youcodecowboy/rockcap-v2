import { View, Text } from 'react-native';

interface Props { metadata?: any; }

const SIGNAL_CATEGORIES: { key: string; label: string; bg: string; text: string }[] = [
  { key: 'beauhurst_data_growth_signals', label: 'Growth', bg: '#dcfce7', text: '#059669' },
  { key: 'beauhurst_data_risk_signals', label: 'Risk', bg: '#fef3c7', text: '#d97706' },
  { key: 'beauhurst_data_innovation_signals', label: 'Innovation', bg: '#dbeafe', text: '#2563eb' },
  { key: 'beauhurst_data_environmental_signals', label: 'Environmental', bg: '#dcfce7', text: '#065f46' },
  { key: 'beauhurst_data_social_governance_signals', label: 'Social & gov', bg: '#f3e8ff', text: '#9333ea' },
];

export default function BeauhurstSignalsCard({ metadata }: Props) {
  if (!metadata) return null;
  const all: { label: string; value: string; bg: string; text: string }[] = [];
  for (const cat of SIGNAL_CATEGORIES) {
    const raw = metadata[cat.key];
    if (!raw) continue;
    for (const v of String(raw).split(';').slice(0, 3)) {
      const trimmed = v.trim();
      if (trimmed) all.push({ label: cat.label, value: trimmed, bg: cat.bg, text: cat.text });
    }
  }
  if (all.length === 0) return null;

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5">
      <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase mb-2">Signals</Text>
      <View className="flex-row flex-wrap gap-1">
        {all.slice(0, 10).map((s, i) => (
          <View key={i} style={{ backgroundColor: s.bg }} className="px-2 py-0.5 rounded-full">
            <Text style={{ color: s.text }} className="text-[10px] font-medium">
              {s.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
