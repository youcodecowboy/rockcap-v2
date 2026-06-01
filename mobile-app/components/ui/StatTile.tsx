import { View, Text, Pressable } from 'react-native';
import type { ReactNode } from 'react';
import { useColors } from '@/lib/useColors';
import { radius, spacing, typography } from '@/lib/theme';

interface StatTileProps {
  label: string;
  value: ReactNode;
  meta?: string;
  /** 2px top border colour (e.g. an entity colour). Defaults to a mid hairline. */
  accent?: string;
  onPress?: () => void;
}

// Metric tile — light-weight large value, mono-uppercase label. Borders, not shadows.
export default function StatTile({ label, value, meta, accent, onPress }: StatTileProps) {
  const c = useColors();
  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: c.bg.card,
        borderWidth: 1,
        borderColor: c.border.default,
        borderTopWidth: 2,
        borderTopColor: accent ?? c.border.mid,
        borderRadius: radius.md,
        padding: spacing[3],
      }}
    >
      <Text
        style={{
          color: c.text.muted,
          fontSize: typography.size.label,
          fontWeight: typography.weight.medium,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          fontFamily: typography.family.mono,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: c.text.primary,
          fontSize: typography.size.title,
          fontWeight: typography.weight.light,
          marginTop: spacing[1],
        }}
      >
        {value}
      </Text>
      {meta ? (
        <Text style={{ color: c.text.muted, fontSize: typography.size.xs, marginTop: 2 }}>
          {meta}
        </Text>
      ) : null}
    </Wrapper>
  );
}
