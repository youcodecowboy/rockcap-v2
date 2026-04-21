import { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView, SafeAreaView,
  Linking, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import type { Doc } from '../../../model-testing-app/convex/_generated/dataModel';
import {
  X, ChevronRight, ExternalLink, User, Pencil, Check,
} from 'lucide-react-native';
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

/** Parse ISO or YYYY-MM-DD into an ISO string, or null if invalid. */
function parseUserDate(input: string): string | null {
  if (!input.trim()) return '';
  // Accept YYYY-MM-DD or full ISO. Reject anything else.
  const match = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const d = new Date(input.trim());
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Format ISO for display in the close-date input. */
function formatDateInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export default function DealDetailSheet({
  deal, visible, onClose, onViewAllActivity,
}: DealDetailSheetProps) {
  const linkedContacts = useQuery(
    api.contacts.listByIds,
    deal?.linkedContactIds?.length ? { ids: deal.linkedContactIds } : 'skip',
  );
  const updateLocalEdits = useMutation(api.deals.updateLocalEdits);

  // Edit-mode state. When editing, the detail grid fields become inputs.
  // Edits persist to Convex on Save; the HubSpot round-trip is out of scope
  // for this pass — a future sync-back-to-HubSpot will replay them.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editCloseDate, setEditCloseDate] = useState('');
  const [editDealType, setEditDealType] = useState('');

  // Reset edit buffers every time a new deal is shown or we exit edit mode.
  useEffect(() => {
    if (!deal) return;
    setEditCloseDate(formatDateInput(deal.closeDate));
    setEditDealType(deal.dealType ?? '');
    setEditing(false);
  }, [deal?._id]);

  if (!deal) return null;
  const tone = stageTone(deal.stageName);
  const probabilityPct = deal.probability ? Math.round(deal.probability * 100) : null;

  const handleSave = async () => {
    const closeIso = parseUserDate(editCloseDate);
    if (closeIso === null) {
      Alert.alert(
        'Invalid date',
        'Enter the close date as YYYY-MM-DD, or leave blank to clear.',
      );
      return;
    }
    setSaving(true);
    try {
      await updateLocalEdits({
        dealId: deal._id,
        closeDate: closeIso,
        dealType: editDealType.trim(),
      });
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditCloseDate(formatDateInput(deal.closeDate));
    setEditDealType(deal.dealType ?? '');
    setEditing(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Sheet layout: KAV fills the modal (flex: 1), backdrop is
          absolutely positioned so it covers the full modal without
          taking flex space, and the SafeAreaView has an explicit
          `height: '92%'` so the inner ScrollView's `flex: 1` actually
          resolves to real pixels. Previous attempt used `maxHeight`
          which let the container collapse to header height. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={1}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(10,10,10,0.55)',
          }}
        />
        <SafeAreaView
          className="rounded-t-[20px] overflow-hidden"
          style={{ backgroundColor: '#f5f5f4', height: '92%' }}
        >
            {/* Drag handle + header. Header gets its own bg-m-bg-card panel
                so the title area reads as a chrome element, not a content card. */}
            <View className="bg-m-bg-card">
              <View className="items-center pt-2 pb-1">
                <View className="w-10 h-1 rounded-full" style={{ backgroundColor: '#d4d4d4' }} />
              </View>
              <View className="flex-row items-start gap-2 px-4 pt-2 pb-3 border-b border-m-border">
                <View className="flex-1 min-w-0">
                  <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-0.5">
                    Deal
                  </Text>
                  <Text className="text-[17px] font-bold text-m-text-primary" numberOfLines={2}>
                    {deal.name}
                  </Text>
                </View>
                {editing ? (
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={handleCancelEdit}
                      className="px-3 h-[30px] rounded-full bg-m-bg-subtle items-center justify-center"
                      hitSlop={8}
                      disabled={saving}
                    >
                      <Text className="text-xs font-medium text-m-text-secondary">Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSave}
                      className="px-3 h-[30px] rounded-full items-center justify-center flex-row gap-1"
                      style={{ backgroundColor: saving ? '#a3a3a3' : '#0a0a0a' }}
                      disabled={saving}
                      hitSlop={8}
                    >
                      <Check size={12} color="#ffffff" strokeWidth={2.5} />
                      <Text className="text-xs font-semibold text-white">
                        {saving ? 'Saving…' : 'Save'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => setEditing(true)}
                      className="w-[30px] h-[30px] rounded-full bg-m-bg-subtle items-center justify-center"
                      hitSlop={8}
                    >
                      <Pencil size={14} color={colors.textSecondary} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={onClose}
                      className="w-[30px] h-[30px] rounded-full bg-m-bg-subtle items-center justify-center"
                      hitSlop={8}
                    >
                      <X size={16} color={colors.textSecondary} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>

            <ScrollView
              className="flex-1 px-3.5 pt-3.5 pb-6"
              contentContainerStyle={{ gap: 12 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Amount + Stage */}
              <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5">
                <View className="flex-row justify-between items-start">
                  <View>
                    <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase">
                      Amount
                    </Text>
                    <Text className="text-[26px] font-bold text-m-text-primary mt-0.5">
                      {formatMoney(deal.amount)}
                    </Text>
                  </View>
                  <View
                    style={{ backgroundColor: tone.bg }}
                    className="px-3 py-1 rounded-full self-center"
                  >
                    <Text
                      style={{ color: tone.text }}
                      className="text-xs font-semibold"
                      numberOfLines={1}
                    >
                      {deal.stageName ?? '—'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Details grid — editable in edit mode */}
              <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3.5">
                <View className="flex-row items-center justify-between mb-2.5">
                  <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase">
                    Details
                  </Text>
                  {editing ? (
                    <Text className="text-[10px] text-m-text-tertiary italic">
                      Saves locally only — won't push to HubSpot
                    </Text>
                  ) : null}
                </View>
                <View className="flex-row flex-wrap gap-y-3">
                  <View className="w-1/2 pr-2">
                    <Text className="text-[10px] text-m-text-tertiary uppercase">
                      Close date
                    </Text>
                    {editing ? (
                      <TextInput
                        value={editCloseDate}
                        onChangeText={setEditCloseDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={colors.textTertiary}
                        className="text-[13px] font-medium text-m-text-primary mt-0.5 border-b border-m-border pb-0.5"
                        autoCapitalize="none"
                        keyboardType="numbers-and-punctuation"
                      />
                    ) : (
                      <Text className="text-[13px] font-medium text-m-text-primary mt-0.5">
                        {deal.closeDate
                          ? new Date(deal.closeDate).toLocaleDateString('en-GB')
                          : 'No date'}
                      </Text>
                    )}
                  </View>
                  <View className="w-1/2 pl-2">
                    <Text className="text-[10px] text-m-text-tertiary uppercase">
                      Probability
                    </Text>
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
                    <Text className="text-[10px] text-m-text-tertiary uppercase">
                      Deal type
                    </Text>
                    {editing ? (
                      <TextInput
                        value={editDealType}
                        onChangeText={setEditDealType}
                        placeholder="e.g. new business"
                        placeholderTextColor={colors.textTertiary}
                        className="text-[13px] font-medium text-m-text-primary mt-0.5 border-b border-m-border pb-0.5"
                        autoCapitalize="none"
                      />
                    ) : (
                      <Text className="text-[13px] font-medium text-m-text-primary mt-0.5">
                        {deal.dealType ?? '—'}
                      </Text>
                    )}
                  </View>
                  {deal.spvName ? (
                    <View className="w-full">
                      <Text className="text-[10px] text-m-text-tertiary uppercase">SPV</Text>
                      <Text className="text-[13px] font-medium text-m-text-primary mt-0.5">
                        {deal.spvName}
                      </Text>
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
                  <View className="w-8 h-8 rounded-full bg-m-bg-subtle items-center justify-center">
                    <ExternalLink size={14} color={colors.textSecondary} strokeWidth={2} />
                  </View>
                  <Text className="text-sm font-medium text-m-text-primary flex-1">
                    Open in HubSpot
                  </Text>
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
                          <Text
                            className="text-sm font-medium text-m-text-primary"
                            numberOfLines={1}
                          >
                            {c.name}
                          </Text>
                          {c.role ? (
                            <Text
                              className="text-[11px] text-m-text-tertiary"
                              numberOfLines={1}
                            >
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
      </KeyboardAvoidingView>
    </Modal>
  );
}
