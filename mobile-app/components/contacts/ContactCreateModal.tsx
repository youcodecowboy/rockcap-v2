import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { X, Loader2, Search, Check, ChevronRight, Building } from 'lucide-react-native';
import { colors } from '@/lib/theme';

// ---------------------------------------------------------------------------
// ContactCreateModal — modal form for adding a new contact.
//
// Matches the mobile-web ContactCreateForm but adapted for native: full-screen
// Modal, KeyboardAvoidingView for iOS, inline client picker sheet for
// searchable association.
//
// Required: name. Optional: email, phone, role, client link, notes.
// ---------------------------------------------------------------------------

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated?: (contactId: string) => void;
  // Pre-link to a client when opened from a client's Contacts tab.
  prefilledClientId?: string;
}

export default function ContactCreateModal({
  visible, onClose, onCreated, prefilledClientId,
}: Props) {
  const { isAuthenticated } = useConvexAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [notes, setNotes] = useState('');
  const [clientId, setClientId] = useState<string | undefined>(prefilledClientId);
  const [submitting, setSubmitting] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const createContact = useMutation(api.contacts.create);

  const filteredClients = useMemo(() => {
    const list = [...(clients || [])].sort((a: any, b: any) =>
      a.name.localeCompare(b.name),
    );
    const q = clientSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c: any) => c.name.toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const selectedClientName = useMemo(() => {
    if (!clientId) return null;
    return (clients || []).find((c: any) => c._id === clientId)?.name ?? null;
  }, [clientId, clients]);

  const canSubmit = name.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const contactId = await createContact({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role: role.trim() || undefined,
        notes: notes.trim() || undefined,
        clientId: clientId ? (clientId as any) : undefined,
      });
      // Reset for the next open.
      setName(''); setEmail(''); setPhone(''); setRole(''); setNotes('');
      setClientId(prefilledClientId);
      onCreated?.(contactId as unknown as string);
      onClose();
    } catch (err: any) {
      console.error('Failed to create contact:', err);
      Alert.alert('Error', err?.message || 'Could not create contact');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setName(''); setEmail(''); setPhone(''); setRole(''); setNotes('');
    setClientId(prefilledClientId);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-m-bg">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border bg-m-bg-card">
          <TouchableOpacity onPress={handleClose} hitSlop={8}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text className="text-base font-semibold text-m-text-primary">
            New Contact
          </Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            hitSlop={8}
            style={{ opacity: canSubmit ? 1 : 0.4 }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Text className="text-sm font-semibold text-m-text-primary">Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Name (required) */}
            <Field label="Name" required>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Full name"
                placeholderTextColor={colors.textPlaceholder}
                autoFocus
                className="text-[15px] text-m-text-primary bg-m-bg-subtle border border-m-border rounded-[10px] px-3 py-2.5"
              />
            </Field>

            {/* Email */}
            <Field label="Email">
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com"
                placeholderTextColor={colors.textPlaceholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="text-[15px] text-m-text-primary bg-m-bg-subtle border border-m-border rounded-[10px] px-3 py-2.5"
              />
            </Field>

            {/* Phone */}
            <Field label="Phone">
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="+44 7700 900000"
                placeholderTextColor={colors.textPlaceholder}
                keyboardType="phone-pad"
                className="text-[15px] text-m-text-primary bg-m-bg-subtle border border-m-border rounded-[10px] px-3 py-2.5"
              />
            </Field>

            {/* Role */}
            <Field label="Role">
              <TextInput
                value={role}
                onChangeText={setRole}
                placeholder="e.g. Solicitor, Surveyor, Broker"
                placeholderTextColor={colors.textPlaceholder}
                className="text-[15px] text-m-text-primary bg-m-bg-subtle border border-m-border rounded-[10px] px-3 py-2.5"
              />
            </Field>

            {/* Client */}
            <Field label="Client">
              <TouchableOpacity
                onPress={() => setShowClientPicker(true)}
                className="flex-row items-center px-3 py-2.5 rounded-[10px] bg-m-bg-subtle border border-m-border"
              >
                <Building size={14} color={colors.textTertiary} />
                <Text
                  className="flex-1 text-[15px] ml-2"
                  style={{
                    color: selectedClientName ? colors.textPrimary : colors.textTertiary,
                  }}
                  numberOfLines={1}
                >
                  {selectedClientName ?? 'Link to client...'}
                </Text>
                {selectedClientName ? (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setClientId(undefined);
                    }}
                    hitSlop={8}
                  >
                    <X size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                ) : (
                  <ChevronRight size={14} color={colors.textTertiary} />
                )}
              </TouchableOpacity>
            </Field>

            {/* Notes */}
            <Field label="Notes">
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Any additional notes..."
                placeholderTextColor={colors.textPlaceholder}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className="text-[15px] text-m-text-primary bg-m-bg-subtle border border-m-border rounded-[10px] px-3 py-2.5"
                style={{ minHeight: 90 }}
              />
            </Field>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Client picker (inline bottom sheet — embedded to avoid nested Modals) */}
        {showClientPicker && (
          <>
            <TouchableOpacity
              onPress={() => setShowClientPicker(false)}
              activeOpacity={1}
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.35)',
              }}
            />
            <View
              className="absolute bottom-0 left-0 right-0 bg-m-bg rounded-t-[20px]"
              style={{
                maxHeight: '75%',
                paddingBottom: Platform.OS === 'ios' ? 20 : 0,
              }}
            >
              <View className="items-center pt-2 pb-1">
                <View className="w-10 h-1 rounded-full bg-m-border" />
              </View>
              <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-m-border">
                <Text className="text-[15px] font-semibold text-m-text-primary">
                  Select Client
                </Text>
                <TouchableOpacity onPress={() => setShowClientPicker(false)} hitSlop={8}>
                  <X size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>

              <View className="px-4 py-2.5">
                <View className="flex-row items-center gap-2 px-3 py-2 rounded-[10px] bg-m-bg-subtle border border-m-border">
                  <Search size={14} color={colors.textTertiary} />
                  <TextInput
                    value={clientSearch}
                    onChangeText={setClientSearch}
                    placeholder="Search..."
                    placeholderTextColor={colors.textTertiary}
                    className="flex-1 text-sm text-m-text-primary py-0"
                    autoFocus
                  />
                </View>
              </View>

              <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
                {filteredClients.length === 0 ? (
                  <View className="py-8 items-center px-6">
                    <Text className="text-sm text-m-text-tertiary">
                      {clientSearch ? 'No clients found' : 'No clients yet'}
                    </Text>
                  </View>
                ) : (
                  filteredClients.map((c: any) => {
                    const isSelected = c._id === clientId;
                    return (
                      <TouchableOpacity
                        key={c._id}
                        onPress={() => {
                          setClientId(c._id);
                          setShowClientPicker(false);
                          setClientSearch('');
                        }}
                        className="flex-row items-center gap-3 px-4 py-3 border-b border-m-border-subtle"
                        style={{
                          backgroundColor: isSelected ? colors.bgSubtle : 'transparent',
                        }}
                      >
                        <Building size={14} color={colors.textTertiary} />
                        <Text
                          className="flex-1 text-sm text-m-text-primary"
                          numberOfLines={1}
                        >
                          {c.name}
                        </Text>
                        {isSelected && <Check size={14} color={colors.accent} />}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function Field({
  label, required, children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide mb-1.5">
        {label}
        {required ? <Text style={{ color: colors.error }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}
