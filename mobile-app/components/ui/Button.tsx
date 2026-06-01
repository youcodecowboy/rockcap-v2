import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useColors } from '@/lib/useColors';
import { radius, spacing, typography } from '@/lib/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  /** Overrides the primary fill colour (e.g. an entity colour). Ignored for non-primary variants. */
  accent?: string;
  icon?: LucideIcon;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

// Canon button — borders over shadows, linear feedback via Pressable opacity.
export default function Button({
  label,
  onPress,
  variant = 'secondary',
  size = 'md',
  accent,
  icon: Icon,
  disabled,
  loading,
  style,
}: ButtonProps) {
  const c = useColors();
  const pad = size === 'sm'
    ? { paddingVertical: spacing[2], paddingHorizontal: spacing[3] }
    : { paddingVertical: spacing[3], paddingHorizontal: spacing[4] };
  const fontSize = size === 'sm' ? typography.size.sm : typography.size.md;

  const fill = accent ?? c.accent.orange;
  const palettes: Record<Variant, { bg: string; border: string; fg: string }> = {
    primary: { bg: fill, border: fill, fg: '#ffffff' },
    secondary: { bg: c.bg.card, border: c.border.default, fg: c.text.primary },
    ghost: { bg: 'transparent', border: 'transparent', fg: c.text.secondary },
    danger: { bg: c.accent.red, border: c.accent.red, fg: '#ffffff' },
  };
  const p = palettes[variant];

  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing[2],
          minHeight: size === 'sm' ? 34 : 44,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: p.border,
          backgroundColor: p.bg,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
          ...pad,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={p.fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          {Icon ? <Icon size={fontSize + 2} color={p.fg} /> : null}
          <Text style={{ color: p.fg, fontSize, fontWeight: typography.weight.medium }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
