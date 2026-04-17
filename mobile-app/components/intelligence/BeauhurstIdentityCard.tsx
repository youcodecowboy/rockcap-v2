import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface Props {
  metadata?: any;
  companyName?: string;
}

export default function BeauhurstIdentityCard({ metadata, companyName }: Props) {
  if (!metadata) return null;
  const chId = metadata.beauhurst_data_companies_house_id;
  const linkedin = metadata.beauhurst_data_linkedin_page;
  const beauhurstUrl = metadata.beauhurst_data_beauhurst_url;
  const legalForm = metadata.beauhurst_data_legal_form;
  const stage = metadata.beauhurst_data_stage_of_evolution;

  const hasAny = chId || linkedin || beauhurstUrl || legalForm || stage;
  if (!hasAny) return null;

  const openUrl = (url: string | undefined) => {
    if (url) Linking.openURL(url);
  };

  const chUrl = chId
    ? `https://find-and-update.company-information.service.gov.uk/company/${chId}`
    : null;

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5">
      <View className="mb-2.5">
        <Text className="text-[13px] font-semibold text-m-text-primary">{companyName}</Text>
        <Text className="text-[11px] text-m-text-tertiary mt-0.5">
          {[legalForm, stage].filter(Boolean).join(' · ') || '—'}
        </Text>
      </View>
      <View className="gap-2">
        {chUrl ? (
          <TouchableOpacity onPress={() => openUrl(chUrl)} className="flex-row justify-between">
            <Text className="text-xs text-m-text-tertiary">Companies House</Text>
            <View className="flex-row items-center gap-1">
              <Text className="text-xs text-m-text-primary underline">{chId}</Text>
              <ExternalLink size={10} color={colors.textPrimary} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        ) : null}
        {linkedin ? (
          <TouchableOpacity onPress={() => openUrl(linkedin)} className="flex-row justify-between">
            <Text className="text-xs text-m-text-tertiary">LinkedIn</Text>
            <View className="flex-row items-center gap-1">
              <Text className="text-xs text-m-text-primary underline">Profile</Text>
              <ExternalLink size={10} color={colors.textPrimary} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        ) : null}
        {beauhurstUrl ? (
          <TouchableOpacity onPress={() => openUrl(beauhurstUrl)} className="flex-row justify-between">
            <Text className="text-xs text-m-text-tertiary">Beauhurst profile</Text>
            <View className="flex-row items-center gap-1">
              <Text className="text-xs text-m-text-primary underline">Open</Text>
              <ExternalLink size={10} color={colors.textPrimary} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
