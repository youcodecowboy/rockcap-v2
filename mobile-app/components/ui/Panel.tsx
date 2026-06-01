import { View, Text } from 'react-native';
import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { useColors } from '@/lib/useColors';
import { radius, spacing, typography } from '@/lib/theme';

interface PanelProps {
  title?: string;
  actions?: ReactNode;
  /** Colours the 2px top border (e.g. an entity colour). Defaults to a plain hairline. */
  accent?: string;
  padded?: boolean;
  children: ReactNode;
  style?: ViewStyle;
}

// Canon card/section container. Layered depth via bg.card on bg.base; separation via hairlines.
export default function Panel({ title, actions, accent, padded = true, children, style }: PanelProps) {
  const c = useColors();
  const hasHeader = Boolean(title || actions);

  return (
    <View
      style={[
        {
          backgroundColor: c.bg.card,
          borderWidth: 1,
          borderColor: c.border.default,
          borderTopWidth: accent ? 2 : 1,
          borderTopColor: accent ?? c.border.default,
          borderRadius: radius.lg,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {hasHeader ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: spacing[3],
            paddingHorizontal: spacing[4],
            borderBottomWidth: 1,
            borderBottomColor: c.border.light,
          }}
        >
          {title ? (
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
              {title}
            </Text>
          ) : <View />}
          {actions}
        </View>
      ) : null}
      <View style={{ padding: padded ? spacing[4] : 0 }}>{children}</View>
    </View>
  );
}
