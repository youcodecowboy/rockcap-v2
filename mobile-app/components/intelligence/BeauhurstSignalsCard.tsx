import { View, Text } from 'react-native';
import { useColors } from '@/lib/useColors';
import { typography } from '@/lib/theme';
import type { Palette } from '@/lib/theme';

interface Props { metadata?: any; }

// Each signal category maps to a canon accent KEY (resolved against the live
// palette below) so chips read on the dark canvas with the tinted treatment.
const SIGNAL_CATEGORIES: { key: string; label: string; accent: keyof Palette['accent'] }[] = [
  { key: 'beauhurst_data_growth_signals', label: 'Growth', accent: 'green' },
  { key: 'beauhurst_data_risk_signals', label: 'Risk', accent: 'yellow' },
  { key: 'beauhurst_data_innovation_signals', label: 'Innovation', accent: 'blue' },
  { key: 'beauhurst_data_environmental_signals', label: 'Environmental', accent: 'teal' },
  { key: 'beauhurst_data_social_governance_signals', label: 'Social & gov', accent: 'purple' },
];

export default function BeauhurstSignalsCard({ metadata }: Props) {
  const c = useColors();
  if (!metadata) return null;
  const all: { label: string; value: string; color: string }[] = [];
  for (const cat of SIGNAL_CATEGORIES) {
    const raw = metadata[cat.key];
    if (!raw) continue;
    const color = c.accent[cat.accent];
    for (const v of String(raw).split(';').slice(0, 3)) {
      const trimmed = v.trim();
      if (trimmed) all.push({ label: cat.label, value: trimmed, color });
    }
  }
  if (all.length === 0) return null;

  return (
    <View
      className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5"
      style={{ borderTopWidth: 2, borderTopColor: c.entityTypes.client }}
    >
      <Text
        className="text-[10px] font-semibold text-m-text-tertiary uppercase mb-2"
        style={{ fontFamily: typography.family.mono, letterSpacing: 0.5 }}
      >
        Signals
      </Text>
      <View className="flex-row flex-wrap gap-1">
        {all.slice(0, 10).map((s, i) => (
          <View
            key={i}
            style={{
              backgroundColor: `${s.color}26`,
              borderWidth: 1,
              borderColor: `${s.color}66`,
            }}
            className="px-2 py-0.5 rounded-full"
          >
            <Text style={{ color: s.color }} className="text-[10px] font-medium">
              {s.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
