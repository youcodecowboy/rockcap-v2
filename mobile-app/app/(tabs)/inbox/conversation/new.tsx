import {
  View, Text, TextInput, TouchableOpacity, FlatList, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../../../model-testing-app/convex/_generated/api';
import { X, Search, Check } from 'lucide-react-native';
import { colors } from '@/lib/theme';

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function NewConversationScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [title, setTitle] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const users = useQuery(api.users.getAll, isAuthenticated ? {} : 'skip');
  const createConversation = useMutation(api.conversations.create);
  const sendMessage = useMutation(api.directMessages.send);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = userSearch.toLowerCase();
    if (!q) return users as any[];
    return (users as any[]).filter(u =>
      (u.name || u.email || '').toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const toggleUser = (id: string) => {
    if (selectedUserIds.includes(id)) {
      setSelectedUserIds(selectedUserIds.filter(u => u !== id));
    } else {
      setSelectedUserIds([...selectedUserIds, id]);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) { Alert.alert('Title required', 'Please give this conversation a title.'); return; }
    if (selectedUserIds.length === 0) { Alert.alert('Participants required', 'Select at least one person to message.'); return; }
    setCreating(true);
    try {
      const conversationId = await createConversation({
        title: title.trim(),
        participantIds: selectedUserIds as any,
      } as any);

      // Send first message if provided
      if (firstMessage.trim()) {
        await sendMessage({
          conversationId: conversationId as any,
          content: firstMessage.trim(),
        } as any);
      }

      router.replace(`/inbox/conversation/${conversationId}` as any);
    } catch (error) {
      Alert.alert('Error', 'Failed to create conversation');
      setCreating(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-m-bg"
    >
      {/* Header */}
      <View className="bg-m-bg-brand pt-14 pb-3 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()} className="p-1">
            <X size={20} color={colors.textOnBrand} />
          </TouchableOpacity>
          <Text className="text-lg font-semibold text-m-text-on-brand">New Conversation</Text>
        </View>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={!title.trim() || selectedUserIds.length === 0 || creating}
          className="bg-white/15 rounded-full px-3 py-1.5"
          style={{ opacity: (!title.trim() || selectedUserIds.length === 0 || creating) ? 0.4 : 1 }}
        >
          <Text className="text-sm font-medium text-m-text-on-brand">
            {creating ? 'Creating...' : 'Create'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredUsers}
        keyExtractor={(item: any) => item._id}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {/* Thread title */}
            <View className="px-4 pt-4 pb-2">
              <Text className="text-[11px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-1.5">
                Thread Title
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g., Wimbledon Park - Valuation"
                className="bg-m-bg-card border border-m-border rounded-lg px-3 py-2.5 text-sm text-m-text-primary"
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>

            {/* Participants header */}
            <View className="px-4 pt-4 pb-2">
              <Text className="text-[11px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-1.5">
                Participants {selectedUserIds.length > 0 ? `(${selectedUserIds.length})` : ''}
              </Text>
              <View className="bg-m-bg-card border border-m-border rounded-lg flex-row items-center px-3 py-2">
                <Search size={14} color={colors.textTertiary} />
                <TextInput
                  value={userSearch}
                  onChangeText={setUserSearch}
                  placeholder="Search users..."
                  className="flex-1 text-sm text-m-text-primary ml-2"
                  placeholderTextColor={colors.textPlaceholder}
                />
              </View>
            </View>
          </View>
        }
        renderItem={({ item }: { item: any }) => {
          const selected = selectedUserIds.includes(item._id);
          const name = item.name || item.email || 'User';
          return (
            <TouchableOpacity
              onPress={() => toggleUser(item._id)}
              className="flex-row items-center gap-3 px-4 py-3 border-b border-m-border-subtle"
            >
              <View className="w-8 h-8 rounded-full bg-m-bg-inset items-center justify-center">
                <Text className="text-[11px] font-semibold text-m-text-secondary">
                  {getInitials(name)}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-m-text-primary">{name}</Text>
                {item.email && item.email !== name && (
                  <Text className="text-xs text-m-text-tertiary">{item.email}</Text>
                )}
              </View>
              <View
                className={`w-5 h-5 rounded-full border items-center justify-center ${
                  selected ? 'bg-m-bg-brand border-m-bg-brand' : 'border-m-border'
                }`}
              >
                {selected && <Check size={12} color={colors.textOnBrand} />}
              </View>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <View className="px-4 pt-4">
            <Text className="text-[11px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-1.5">
              First Message (optional)
            </Text>
            <TextInput
              value={firstMessage}
              onChangeText={setFirstMessage}
              placeholder="Kick off the conversation..."
              multiline
              className="bg-m-bg-card border border-m-border rounded-lg px-3 py-2.5 text-sm text-m-text-primary min-h-[80px]"
              placeholderTextColor={colors.textPlaceholder}
              textAlignVertical="top"
            />
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}
