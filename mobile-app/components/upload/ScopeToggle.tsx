import { View, TouchableOpacity, Text } from 'react-native';
import { Building, Briefcase, UserCircle } from 'lucide-react-native';
import { colors } from '@/lib/theme';

// Three-way segmented control for upload scope. Mirrors the desktop
// ClientProjectsTab / ScopeToggle — clients get shared-team docs, internal
// are team-only (no client), personal are private to the uploader.
export type UploadScope = 'client' | 'internal' | 'personal';

const SCOPES: {
  key: UploadScope;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
}[] = [
  { key: 'client', label: 'Client', icon: Building },
  { key: 'internal', label: 'Internal', icon: Briefcase },
  { key: 'personal', label: 'Personal', icon: UserCircle },
];

interface Props {
  value: UploadScope;
  onChange: (next: UploadScope) => void;
}

export default function ScopeToggle({ value, onChange }: Props) {
  return (
    <View className="flex-row gap-2">
      {SCOPES.map(({ key, label, icon: Icon }) => {
        const isActive = value === key;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onChange(key)}
            className="flex-1 flex-row items-center justify-center rounded-[10px] py-2.5"
            style={{
              backgroundColor: isActive ? colors.bgBrand : colors.bgSubtle,
              borderWidth: isActive ? 0 : 1,
              borderColor: colors.border,
              gap: 6,
            }}
          >
            <Icon size={14} color={isActive ? colors.textOnBrand : colors.textSecondary} />
            <Text
              className="text-[13px] font-medium"
              style={{ color: isActive ? colors.textOnBrand : colors.textSecondary }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
