import { View, Text } from 'react-native';
import { useColors } from '@/lib/useColors';
import type { Palette } from '@/lib/theme';

// Reusable avatar tile: colored circle with 1-2 letter initials.
// The color is derived deterministically from the name so the same contact
// always gets the same color. Used in:
//   - ContactListItem (small, 36px)
//   - ContactDetailModal header (large, 56px)
//   - Client detail's Key Contacts row (small, 32px)

// Avatar colours are drawn from the canon accent palette so they read on the
// dark canvas — same "hash name → pick a colour" selection as before, but the
// SOURCE is now the theme accents and the treatment is the canon tinted
// pattern (`${color}26` fill, solid `color` initials) instead of light pastels.
const AVATAR_ACCENT_KEYS = [
  'blue', 'green', 'yellow', 'purple', 'red', 'cyan', 'orange', 'teal',
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

/**
 * Deterministically pick a canon accent colour for a name — same name always
 * maps to the same accent. Hash is not cryptographic, just stable. Returns the
 * solid accent hex; callers tint the background with `${color}26`.
 */
export function getContactAvatarColor(accent: Palette['accent'], name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const key = AVATAR_ACCENT_KEYS[Math.abs(hash) % AVATAR_ACCENT_KEYS.length];
  return accent[key];
}

interface Props {
  name: string;
  size?: number;
}

export default function ContactAvatar({ name, size = 36 }: Props) {
  const c = useColors();
  const initials = getContactInitials(name);
  const color = getContactAvatarColor(c.accent, name);
  // Font size scales with the container so the initials read the same weight
  // at any size. 0.4 * size is the common sweet spot for 2-letter initials.
  const fontSize = Math.round(size * 0.4);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        // Canon tinted treatment: faint accent fill, hairline accent ring,
        // solid accent initials — reads correctly on the dark canvas.
        backgroundColor: `${color}26`,
        borderWidth: 1,
        borderColor: `${color}66`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize,
          fontWeight: '700',
          color,
          letterSpacing: -0.3,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}
