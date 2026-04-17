import { View, Text, Modal, TouchableOpacity, ScrollView, SafeAreaView, Linking } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import type { Doc } from '../../../model-testing-app/convex/_generated/dataModel';
import { X, ChevronRight, ExternalLink, User } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import { stageTone } from '@/lib/dealStageColors';

interface DealDetailSheetProps {
  deal: Doc<'deals'> | null;
  visible: boolean;
  onClose: () => void;
  onViewAllActivity?: () => void;
}

function formatMoney(amount?: number): string {
  if (amount === undefined || amount === null) return '—';
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}K`;
  return `£${amount.toLocaleString()}`;
}

export default function DealDetailSheet({ deal, visible, onClose, onViewAllActivity }: DealDetailSheetProps) {
  const linkedContacts = useQuery(
    api.contacts.listByIds,
    deal?.linkedContactIds?.length ? { ids: deal.linkedContactIds } : 'skip',
  );

  if (!deal) return null;
  const tone = stageTone(deal.stageName);
  const probabilityPct = deal.probability ? Math.round(deal.probability * 100) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(10,10,10,0.5)' }}>
        <SafeAreaView className="bg-m-bg rounded-t-[20px] max-h-[92%]">
          <View className="items-center py-2">
            <View className="w-10 h-1 bg-m-bg-inset rounded-full" />
          </View>

          <View className="flex-row justify-between items-start px-4 pb-3 border-b border-m-border bg-m-bg-card">
            <View className="flex-1 min-w-0">
              <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-0.5">
                Deal
              </Text>
              <Text className="text-[17px] font-bold text-m-text-primary">{deal.name}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="w-[30px] h-[30px] rounded-full bg-m-bg-subtle items-center justify-center"
              hitSlop={8}
            >
              <X size={16} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 px-3.5 py-3.5" contentContainerStyle={{ gap: 12 }}>
            {/* Amount + Stage */}
            <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5">
              <View className="flex-row justify-between items-start">
                <View>
                  <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase">Amount</Text>
                  <Text className="text-[26px] font-bold text-m-text-primary mt-0.5">
                    {formatMoney(deal.amount)}
                  </Text>
                </View>
                <View style={{ backgroundColor: tone.bg }} className="px-3 py-1 rounded-full self-center">
                  <Text style={{ color: tone.text }} className="text-xs font-semibold">
                    {deal.stageName ?? '—'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Details grid */}
            <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5">
              <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase mb-2.5">Details</Text>
              <View className="flex-row flex-wrap gap-y-3">
                <View className="w-1/2 pr-2">
                  <Text className="text-[10px] text-m-text-tertiary uppercase">Close date</Text>
                  <Text className="text-[13px] font-medium text-m-text-primary mt-0.5">
                    {deal.closeDate ? new Date(deal.closeDate).toLocaleDateString('en-GB') : 'No date'}
                  </Text>
                </View>
                <View className="w-1/2 pl-2">
                  <Text className="text-[10px] text-m-text-tertiary uppercase">Probability</Text>
                  <Text className="text-[13px] font-medium text-m-text-primary mt-0.5">
                    {probabilityPct !== null ? `${probabilityPct}%` : '—'}
                  </Text>
                </View>
                <View className="w-1/2 pr-2">
                  <Text className="text-[10px] text-m-text-tertiary uppercase">Pipeline</Text>
                  <Text className="text-[13px] font-medium text-m-text-primary mt-0.5">
                    {deal.pipelineName ?? '—'}
                  </Text>
                </View>
                <View className="w-1/2 pl-2">
                  <Text className="text-[10px] text-m-text-tertiary uppercase">Deal type</Text>
                  <Text className="text-[13px] font-medium text-m-text-primary mt-0.5">{deal.dealType ?? '—'}</Text>
                </View>
                {deal.spvName ? (
                  <View className="w-full">
                    <Text className="text-[10px] text-m-text-tertiary uppercase">SPV</Text>
                    <Text className="text-[13px] font-medium text-m-text-primary mt-0.5">{deal.spvName}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* HubSpot link */}
            {deal.hubspotUrl ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(deal.hubspotUrl!)}
                className="bg-m-bg-card border border-m-border rounded-[12px] p-3 flex-row items-center gap-2.5"
              >
                <View
                  className="w-8 h-8 rounded-full bg-m-bg-subtle items-center justify-center"
                >
                  <ExternalLink size={14} color={colors.textSecondary} strokeWidth={2} />
                </View>
                <Text className="text-sm font-medium text-m-text-primary flex-1">Open in HubSpot</Text>
                <ChevronRight size={14} color={colors.textTertiary} strokeWidth={2} />
              </TouchableOpacity>
            ) : null}

            {/* Linked contacts */}
            {linkedContacts && linkedContacts.length > 0 ? (
              <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5">
                <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase mb-2.5">
                  Linked contacts ({linkedContacts.length})
                </Text>
                <View className="gap-2.5">
                  {linkedContacts.slice(0, 5).map((c) => (
                    <View key={c._id} className="flex-row items-center gap-2.5">
                      <View className="w-8 h-8 rounded-full bg-m-bg-subtle items-center justify-center">
                        <User size={14} color={colors.textSecondary} />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="text-sm font-medium text-m-text-primary" numberOfLines={1}>
                          {c.name}
                        </Text>
                        {c.role ? (
                          <Text className="text-[11px] text-m-text-tertiary" numberOfLines={1}>
                            {c.role}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Recent activity link */}
            <TouchableOpacity
              onPress={onViewAllActivity}
              className="bg-m-bg-card border border-m-border rounded-[12px] p-3 flex-row items-center"
            >
              <Text className="text-sm font-medium text-m-text-primary flex-1">
                View activity for this deal
              </Text>
              <ChevronRight size={14} color={colors.textTertiary} strokeWidth={2} />
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
