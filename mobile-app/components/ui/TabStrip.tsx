import { ScrollView, Pressable, Text, View } from 'react-native';
import { useColors } from '@/lib/useColors';
import { spacing, typography } from '@/lib/theme';
import type { EntityType } from '@/lib/theme';

export interface TabDef {
  id: string;
  label: string;
  count?: number;
}

interface TabStripProps {
  tabs: TabDef[];
  activeTab: string;
  onChange: (id: string) => void;
  /** Active tab's underline colour is the entity colour; defaults to neutral. */
  entityType?: EntityType;
}

// In-page tab strip — active tab gets a 2px entity-coloured underline. Horizontally scrollable so
// it survives narrow screens and long tab sets (mobile adaptation of the web TabStrip).
export default function TabStrip({ tabs, activeTab, onChange, entityType }: TabStripProps) {
  const c = useColors();
  const active = entityType ? c.entityTypes[entityType] : c.text.primary;

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: c.border.default }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing[2] }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onChange(tab.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: spacing[3],
                paddingVertical: spacing[3],
                borderBottomWidth: 2,
                borderBottomColor: isActive ? active : 'transparent',
              }}
            >
              <Text
                style={{
                  color: isActive ? c.text.primary : c.text.muted,
                  fontSize: typography.size.md,
                  fontWeight: isActive ? typography.weight.medium : typography.weight.normal,
                }}
              >
                {tab.label}
              </Text>
              {typeof tab.count === 'number' && tab.count > 0 ? (
                <Text style={{ color: c.text.dim, fontSize: typography.size.sm }}>{tab.count}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
