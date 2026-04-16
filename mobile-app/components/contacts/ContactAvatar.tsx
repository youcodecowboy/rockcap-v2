import { View, Text } from 'react-native';

// Reusable avatar tile: colored circle with 1-2 letter initials.
// The color is derived deterministically from the name so the same contact
// always gets the same color. Used in:
//   - ContactListItem (small, 36px)
//   - ContactDetailModal header (large, 56px)
//   - Client detail's Key Contacts row (small, 32px)

// The palette is intentionally muted pastels — loud hues compete with the
// product's monochrome design system. Pairs lift their background color
// while matching a readable text color.
const AVATAR_PALETTE = [
  { bg: '#eff6ff', fg: '#1d4ed8' }, // blue
  { bg: '#ecfdf5', fg: '#047857' }, // green
  { bg: '#fef3c7', fg: '#b45309' }, // amber
  { bg: '#f3e8ff', fg: '#7e22ce' }, // purple
  { bg: '#ffe4e6', fg: '#be123c' }, // rose
  { bg: '#ecfeff', fg: '#0e7490' }, // cyan
  { bg: '#ffedd5', fg: '#c2410c' }, // orange
  { bg: '#ccfbf1', fg: '#0f766e' }, // teal
] as const;

export function getContactInitials(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function getContactAvatarColor(name: string) {
  // Simple deterministic hash — same name always maps to the same palette
  // entry. Not cryptographic, just stable.
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

interface Props {
  name: string;
  size?: number;
}

export default function ContactAvatar({ name, size = 36 }: Props) {
  const initials = getContactInitials(name);
  const { bg, fg } = getContactAvatarColor(name);
  // Font size scales with the container so the initials read the same weight
  // at any size. 0.4 * size is the common sweet spot for 2-letter initials.
  const fontSize = Math.round(size * 0.4);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize,
          fontWeight: '700',
          color: fg,
          letterSpacing: -0.3,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}
