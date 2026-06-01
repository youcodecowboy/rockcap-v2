import { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import type { TextInputProps, ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useColors } from '@/lib/useColors';
import { radius, spacing, typography } from '@/lib/theme';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  style?: ViewStyle;
}

// Form-control wrapper: mono-uppercase label on top, hint/error below. Mirrors web Field.
export function Field({ label, hint, error, children, style }: FieldProps) {
  const c = useColors();
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? (
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
      ) : null}
      {children}
      {error ? (
        <Text style={{ color: c.accent.red, fontSize: typography.size.sm }}>{error}</Text>
      ) : hint ? (
        <Text style={{ color: c.text.dim, fontSize: typography.size.sm }}>{hint}</Text>
      ) : null}
    </View>
  );
}

interface InputProps extends TextInputProps {
  mono?: boolean;
}

// Text input with canon styling and a blue focus border. Use multiline for the textarea shape.
export function Input({ mono, style, multiline, onFocus, onBlur, ...props }: InputProps) {
  const c = useColors();
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      placeholderTextColor={c.text.dim}
      multiline={multiline}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        {
          backgroundColor: c.bg.card,
          borderWidth: 1,
          borderColor: focused ? c.accent.blue : c.border.default,
          borderRadius: radius.md,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[3],
          color: c.text.primary,
          fontSize: typography.size.md,
          fontFamily: mono ? typography.family.mono : typography.family.sans,
          minHeight: multiline ? 96 : 44,
          textAlignVertical: multiline ? 'top' : 'center',
        },
        style,
      ]}
      {...props}
    />
  );
}
