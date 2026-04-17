import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Keyboard } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import type { Doc } from '../../../model-testing-app/convex/_generated/dataModel';
import { Search, Building2, Plus } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface Props {
  onSelectCompany: (company: Doc<'companies'>) => void;
  onCreateNew: (typedName: string) => void;
  placeholder?: string;
}

export default function CompanyAutocomplete({
  onSelectCompany,
  onCreateNew,
  placeholder = 'Client name',
}: Props) {
  const [query, setQuery] = useState('');
  const matches = useQuery(
    api.companies.searchByName,
    query.trim().length >= 2 ? { query, limit: 6 } : 'skip',
  ) ?? [];

  const showDropdown = query.trim().length >= 2;

  return (
    <View className="gap-2">
      <View>
        <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-1.5">
          Client name
        </Text>
        <View className="bg-m-bg-card border-2 border-m-text-primary rounded-[10px] px-3 py-2.5 flex-row items-center gap-2">
          <Search size={16} color={colors.textTertiary} strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={colors.textPlaceholder ?? colors.textTertiary}
            className="flex-1 text-sm text-m-text-primary"
            autoFocus
          />
        </View>
      </View>

      {showDropdown ? (
        <View className="bg-m-bg-card border border-m-border rounded-[12px] overflow-hidden">
          {matches.length > 0 ? (
            <View className="bg-m-bg px-3 py-2 border-b border-m-border">
              <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
                From HubSpot ({matches.length} matches)
              </Text>
            </View>
          ) : null}
          {matches.map((c) => {
            const isExact = c.name.toLowerCase() === query.trim().toLowerCase();
            return (
              <TouchableOpacity
                key={c._id}
                onPress={() => {
                  Keyboard.dismiss();
                  onSelectCompany(c);
                }}
                className="flex-row items-center gap-2.5 p-3 border-b border-m-border-subtle"
                activeOpacity={0.6}
              >
                <View
                  className="w-9 h-9 rounded-[8px] items-center justify-center"
                  style={{ backgroundColor: '#dbeafe' }}
                >
                  <Building2 size={14} color="#2563eb" strokeWidth={2} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-[13px] font-semibold text-m-text-primary" numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text className="text-[11px] text-m-text-tertiary mt-0.5" numberOfLines={1}>
                    {[
                      c.domain,
                      c.hubspotLifecycleStageName ?? c.hubspotLifecycleStage,
                      c.promotedToClientId ? 'already a client' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {isExact ? (
                  <View className="bg-m-success/15 px-1.5 py-0.5 rounded">
                    <Text className="text-[9px] font-bold text-m-success uppercase tracking-wide">
                      Match
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}

          {/* Manual create fallback */}
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              onCreateNew(query.trim());
            }}
            className="flex-row items-center gap-2.5 p-3 bg-m-bg"
            activeOpacity={0.6}
          >
            <View className="w-9 h-9 rounded-[8px] bg-m-bg-subtle items-center justify-center">
              <Plus size={16} color={colors.textSecondary} strokeWidth={2} />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-medium text-m-text-primary">
                Create "{query}" from scratch
              </Text>
              <Text className="text-[11px] text-m-text-tertiary mt-0.5">
                Won't be linked to a HubSpot company
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
