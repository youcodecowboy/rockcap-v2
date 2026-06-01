import { View, Text } from 'react-native';
import { useColors } from '@/lib/useColors';
import { radius, typography } from '@/lib/theme';
import type { EntityType, StatusKey } from '@/lib/theme';

interface ChipProps {
  label: string;
  /** Base colour — pass a hex (6-digit). Use the entity/status helpers for the common cases. */
  color?: string;
  /** Show a leading filled dot in the colour. */
  dot?: boolean;
}

// Generic tinted pill: 15% fill, 40% border, solid text — the canon's chip treatment.
// Powers entity badges, status pills and flag chips. color must be a 6-digit hex for the
// alpha suffixes (`26`/`66`) to apply.
export default function Chip({ label, color, dot }: ChipProps) {
  const c = useColors();
  const base = color ?? c.text.muted;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: radius.sm,
        backgroundColor: `${base}26`,
        borderWidth: 1,
        borderColor: `${base}66`,
      }}
    >
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: base }} /> : null}
      <Text
        style={{
          color: base,
          fontSize: typography.size.xs,
          fontWeight: typography.weight.medium,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** Entity-coloured chip, e.g. <EntityChip label="Client" type="client" />. */
export function EntityChip({ label, type, dot }: { label: string; type: EntityType; dot?: boolean }) {
  const c = useColors();
  return <Chip label={label} color={c.entityTypes[type]} dot={dot} />;
}

/** Status-coloured chip, e.g. <StatusChip label="Drafted" status="drafted" />. */
export function StatusChip({ label, status, dot }: { label: string; status: StatusKey; dot?: boolean }) {
  const c = useColors();
  return <Chip label={label} color={c.status[status]} dot={dot} />;
}
