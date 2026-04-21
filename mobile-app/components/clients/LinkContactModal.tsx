import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, SafeAreaView,
  FlatList, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import type { Id } from '../../../model-testing-app/convex/_generated/dataModel';
import { X, Search, Check } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import ContactAvatar from '@/components/contacts/ContactAvatar';

interface LinkContactModalProps {
  visible: boolean;
  clientId: Id<'clients'>;
  clientName: string;
  /**
   * Contacts already linked to this client — used to hide them from search
   * results (you can't "link" a contact that's already linked). Pass the
   * same `contacts` array the client profile is rendering.
   */
  alreadyLinkedIds?: Id<'contacts'>[];
  onClose: () => void;
}

/**
 * Modal that searches across ALL contacts and lets the user link one to
 * the current client. On tap, calls `contacts.linkToClient` mutation which
 * sets `contact.clientId`, then closes. The parent `getByClient` query
 * reacts automatically — the newly-linked contact appears in Key Contacts
 * without a manual refresh.
 */
export default function LinkContactModal({
  visible, clientId, clientName, alreadyLinkedIds = [], onClose,
}: LinkContactModalProps) {
  const [query, setQuery] = useState('');
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const allContacts = useQuery(api.contacts.getAll, visible ? {} : 'skip');
  const linkToClient = useMutation(api.contacts.linkToClient);

  const alreadyLinkedSet = useMemo(
    () => new Set(alreadyLinkedIds.map(String)),
    [alreadyLinkedIds],
  );

  const filtered = useMemo(() => {
    if (!allContacts) return [];
    const q = query.trim().toLowerCase();
    const pool = allContacts.filter(
      (c: any) => !alreadyLinkedSet.has(String(c._id)),
    );
    if (!q) {
      // With 4000+ contacts, empty-search showing all is overkill.
      // Prompt the user to type; cap at a sensible preview.
      return pool.slice(0, 20);
    }
    return pool
      .filter(
        (c: any) =>
          c.name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.role?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [allContacts, query, alreadyLinkedSet]);

  const handleLink = async (contactId: Id<'contacts'>) => {
    setLinkingId(String(contactId));
    try {
      await linkToClient({ contactId, clientId });
      onClose();
    } catch (err: any) {
      Alert.alert('Link failed', err?.message ?? 'Please try again.');
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(10,10,10,0.55)' }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ maxHeight: '92%' }}
        >
          <SafeAreaView
            className="bg-m-bg rounded-t-[20px] max-h-full overflow-hidden"
            // Inline backgroundColor as a belt-and-braces fallback — some
            // SafeAreaView / NativeWind combos drop the `bg-m-bg` class,
            // leaving the sheet transparent over the underlying screen.
            style={{ backgroundColor: '#ffffff' }}
          >
            {/* Drag handle + header */}
            <View className="items-center pt-2 pb-1">
              <View className="w-10 h-1 rounded-full" style={{ backgroundColor: '#d4d4d4' }} />
            </View>
            <View className="flex-row items-start gap-2 px-4 pt-2 pb-3 border-b border-m-border">
              <View className="flex-1 min-w-0">
                <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-0.5">
                  Link Contact
                </Text>
                <Text
                  className="text-[16px] font-bold text-m-text-primary"
                  numberOfLines={1}
                >
                  to {clientName}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                className="w-[30px] h-[30px] rounded-full bg-m-bg-subtle items-center justify-center"
                hitSlop={8}
              >
                <X size={16} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View className="px-4 pt-3 pb-2">
              <View className="bg-m-bg-card rounded-[10px] border border-m-border flex-row items-center px-3">
                <Search size={14} color={colors.textTertiary} />
                <TextInput
                  autoFocus
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search contacts by name, email, role..."
                  placeholderTextColor={colors.textTertiary}
                  className="flex-1 text-sm text-m-text-primary ml-2 py-2.5"
                />
              </View>
            </View>

            {/* Result list */}
            <FlatList
              data={filtered}
              keyExtractor={(item: any) => item._id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View className="px-4 py-12 items-center">
                  <Text className="text-sm text-m-text-tertiary text-center">
                    {query.trim()
                      ? 'No contacts match your search'
                      : 'Start typing to search contacts'}
                  </Text>
                </View>
              }
              ListHeaderComponent={
                !query.trim() && filtered.length > 0 ? (
                  <Text className="px-4 pt-1 pb-2 text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
                    Recent ({filtered.length})
                  </Text>
                ) : null
              }
              renderItem={({ item }: any) => {
                const linking = linkingId === String(item._id);
                return (
                  <TouchableOpacity
                    onPress={() => handleLink(item._id)}
                    disabled={linking}
                    activeOpacity={0.7}
                    className="flex-row items-center gap-3 px-4 py-3 border-b border-m-border-subtle"
                  >
                    <ContactAvatar name={item.name} size={36} />
                    <View className="flex-1 min-w-0">
                      <Text
                        className="text-sm font-medium text-m-text-primary"
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text
                        className="text-[11px] text-m-text-tertiary mt-0.5"
                        numberOfLines={1}
                      >
                        {[item.role, item.company, item.email].filter(Boolean).join(' · ') ||
                          'No details'}
                      </Text>
                    </View>
                    {linking ? (
                      <View className="px-2.5 py-1 rounded-full bg-m-bg-subtle">
                        <Text className="text-[10px] font-semibold text-m-text-secondary">
                          Linking…
                        </Text>
                      </View>
                    ) : (
                      <View
                        className="w-7 h-7 rounded-full items-center justify-center"
                        style={{ backgroundColor: '#0a0a0a' }}
                      >
                        <Check size={14} color="#ffffff" strokeWidth={2.5} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
