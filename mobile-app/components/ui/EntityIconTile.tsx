import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useColors } from '@/lib/useColors';
import { radius } from '@/lib/theme';
import type { EntityType } from '@/lib/theme';

interface EntityIconTileProps {
  icon: LucideIcon;
  /** Entity colour key, or pass an explicit `color` to override. */
  type?: EntityType;
  color?: string;
  size?: number;
}

// Square icon tile in an entity colour: 15% fill, 40% border, solid icon. The mobile analogue of
// the web EntityIconTile, used in entity headers and list rows.
export default function EntityIconTile({ icon: Icon, type, color, size = 40 }: EntityIconTileProps) {
  const c = useColors();
  const base = color ?? (type ? c.entityTypes[type] : c.text.muted);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        backgroundColor: `${base}26`,
        borderWidth: 1,
        borderColor: `${base}66`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={size * 0.5} color={base} />
    </View>
  );
}
