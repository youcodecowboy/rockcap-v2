import { View, Text } from 'react-native';
import { Tag } from 'lucide-react-native';
import EntityIconTile from '@/components/ui/EntityIconTile';

interface ClassificationCardProps {
  companyType?: string;
  leadSource?: string;
  industry?: string;
  county?: string;
}

export default function ClassificationCard({
  companyType,
  leadSource,
  industry,
  county,
}: ClassificationCardProps) {
  const rows: { label: string; value: string }[] = [];
  if (companyType) rows.push({ label: 'Company type', value: companyType });
  if (leadSource) rows.push({ label: 'Lead source', value: leadSource });
  if (industry) rows.push({ label: 'Industry', value: industry });
  if (county) rows.push({ label: 'County', value: county });

  if (rows.length === 0) return null;

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-[14px]">
      <View className="flex-row items-center gap-1.5 mb-2.5">
        <EntityIconTile icon={Tag} type="prospect" size={20} />
        <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
          Classification
        </Text>
      </View>
      <View className="gap-2">
        {rows.map((r) => (
          <View key={r.label} className="flex-row justify-between">
            <Text className="text-xs text-m-text-tertiary">{r.label}</Text>
            <Text className="text-xs font-medium text-m-text-primary">{r.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
