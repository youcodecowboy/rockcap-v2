import { View, TouchableOpacity, Text } from 'react-native';
import { Building, Briefcase, UserCircle } from 'lucide-react-native';
import { useColors } from '@/lib/useColors';
import type { EntityType } from '@/lib/theme';

// Three-way segmented control for upload scope. Mirrors the desktop
// ClientProjectsTab / ScopeToggle — clients get shared-team docs, internal
// are team-only (no client), personal are private to the uploader.
export type UploadScope = 'client' | 'internal' | 'personal';

// Each scope carries its canon entity colour. Client docs scope to the client
// (green); internal/personal have no client entity, so they use neutral tones.
const SCOPES: {
  key: UploadScope;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  entity?: EntityType;
}[] = [
  { key: 'client', label: 'Client', icon: Building, entity: 'client' },
  { key: 'internal', label: 'Internal', icon: Briefcase },
  { key: 'personal', label: 'Personal', icon: UserCircle, entity: 'contact' },
];

interface Props {
  value: UploadScope;
  onChange: (next: UploadScope) => void;
}

export default function ScopeToggle({ value, onChange }: Props) {
  const c = useColors();
  return (
    <View className="flex-row gap-2">
      {SCOPES.map(({ key, label, icon: Icon, entity }) => {
        const isActive = value === key;
        const accent = entity ? c.entityTypes[entity] : c.text.muted;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onChange(key)}
            className="flex-1 flex-row items-center justify-center rounded-[10px] py-2.5"
            style={{
              backgroundColor: isActive ? `${accent}26` : c.bg.card,
              borderWidth: 1,
              borderColor: isActive ? `${accent}66` : c.border.default,
              gap: 6,
            }}
          >
            <Icon size={14} color={isActive ? accent : c.text.secondary} />
            <Text
              className="text-[13px] font-medium"
              style={{ color: isActive ? accent : c.text.secondary }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
