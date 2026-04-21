import { View, SafeAreaView, Text, TouchableOpacity } from 'react-native';
import { useMutation } from 'convex/react';
import { useRouter, Stack } from 'expo-router';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import type { Doc } from '../../../../model-testing-app/convex/_generated/dataModel';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import CompanyAutocomplete from '@/components/clients/CompanyAutocomplete';
import MobileHeader from '@/components/MobileHeader';

export default function NewClientScreen() {
  const createWithPromotion = useMutation(api.clients.createWithPromotion);
  const router = useRouter();

  const handleSelectCompany = async (company: Doc<'companies'>) => {
    // Already linked — navigate straight to that client
    if (company.promotedToClientId) {
      router.replace(`/clients/${company.promotedToClientId}` as any);
      return;
    }
    const clientId = await createWithPromotion({
      name: company.name,
      companyName: company.name,
      industry: (company as any).industry,
      website: (company as any).website ?? (company as any).domain,
      address: (company as any).address,
      city: (company as any).city,
      country: (company as any).country,
      phone: (company as any).phone,
      type: (company as any).type,
      promoteFromCompanyId: company._id,
    });
    router.replace(`/clients/${clientId}` as any);
  };

  const handleCreateNew = async (typedName: string) => {
    if (!typedName) return;
    const clientId = await createWithPromotion({ name: typedName, status: 'prospect' });
    router.replace(`/clients/${clientId}` as any);
  };

  return (
    <SafeAreaView className="flex-1 bg-m-bg">
      <Stack.Screen options={{ headerShown: false }} />
      <MobileHeader />
      <View className="flex-row items-center px-3 py-2 border-b border-m-border bg-m-bg-card">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-9 h-9 rounded-full items-center justify-center"
          hitSlop={8}
        >
          <ChevronLeft size={20} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text className="text-base font-semibold text-m-text-primary ml-1">New client</Text>
      </View>
      <View className="p-4">
        <CompanyAutocomplete
          onSelectCompany={handleSelectCompany}
          onCreateNew={handleCreateNew}
        />
      </View>
    </SafeAreaView>
  );
}
