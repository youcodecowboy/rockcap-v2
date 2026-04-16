import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../../../model-testing-app/convex/_generated/api';
import { ArrowLeft, Send, Paperclip, FileText, Building, FolderOpen, User, X } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import MobileHeader from '@/components/MobileHeader';
import ContactDetailModal from '@/components/contacts/ContactDetailModal';

// Types referencable in a message. Historical: document/project/client. Added
// 'contact' so users can share a rolodex entry in-thread (e.g., "here's the
// solicitor we discussed — @John Smith"). Receiver taps the chip → opens the
// contact detail modal with live details.
interface EntityReference {
  type: 'document' | 'project' | 'client' | 'contact';
  id: string;
  name: string;
}

// Shared icon mapping — a single source of truth for the chip icon across
// composer pending-refs, in-message chips, and the attach menu list.
function iconForReference(type: EntityReference['type']) {
  if (type === 'document') return FileText;
  if (type === 'client') return Building;
  if (type === 'contact') return User;
  return FolderOpen; // project
}

function formatTime(ts: number | string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function ConversationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [messageText, setMessageText] = useState('');
  const [references, setReferences] = useState<EntityReference[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [sending, setSending] = useState(false);
  // When a user taps a "contact" chip in a message, open the contact
  // detail modal. We keep this state here (rather than navigate to a route)
  // so the reader stays in context of the conversation.
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const conversation = useQuery(
    api.conversations.get,
    isAuthenticated && id ? { id: id as any } : 'skip'
  );
  const messages = useQuery(
    api.directMessages.getByConversation,
    isAuthenticated && id ? { conversationId: id as any } : 'skip'
  );

  const sendMessage = useMutation(api.directMessages.send);
  const markAsRead = useMutation(api.conversations.markAsRead);

  const navigateToReference = useCallback((ref: EntityReference) => {
    if (ref.type === 'client') {
      router.push(`/clients/${ref.id}` as any);
    } else if (ref.type === 'project') {
      // Projects nest under clients; use the project's clientId if known, else go to clients list
      router.push(`/clients` as any);
    } else if (ref.type === 'document') {
      router.push({
        pathname: '/docs/viewer',
        params: { documentId: ref.id, title: ref.name, fileType: '' },
      } as any);
    } else if (ref.type === 'contact') {
      // Stay in-conversation — open the contact detail as a modal overlay.
      setOpenContactId(ref.id);
    }
  }, [router]);

  // Mark as read when viewing
  useEffect(() => {
    if (id && messages && messages.length > 0) {
      markAsRead({ conversationId: id as any }).catch(() => {});
    }
  }, [id, messages, markAsRead]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages?.length]);

  const currentUserId = (conversation as any)?.currentUserId;
  const participants = (conversation as any)?.participants || [];
  const otherParticipants = participants.filter((p: any) => p._id !== currentUserId);
  const participantNames = otherParticipants.map((p: any) => p.name || p.email || 'User').join(', ');

  const handleSend = useCallback(async () => {
    if (!messageText.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage({
        conversationId: id as any,
        content: messageText.trim(),
        references: references.length > 0 ? references : undefined,
      } as any);
      setMessageText('');
      setReferences([]);
    } catch (error) {
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [messageText, references, id, sendMessage, sending]);

  const removeReference = (idx: number) => {
    setReferences(references.filter((_, i) => i !== idx));
  };

  if (!conversation || !messages) {
    return (
      <View className="flex-1 bg-m-bg">
        <MobileHeader />
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-m-bg"
      keyboardVerticalOffset={0}
    >
      <MobileHeader />

      {/* Sub-header with back + title + participants */}
      <View className="px-4 py-2.5 border-b border-m-border bg-m-bg-card flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="p-1 mr-2">
          <ArrowLeft size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-base font-semibold text-m-text-primary" numberOfLines={1}>
            {(conversation as any).title || 'Conversation'}
          </Text>
          {participantNames && (
            <Text className="text-xs text-m-text-tertiary" numberOfLines={1}>
              {participantNames}
            </Text>
          )}
        </View>
      </View>

      {/* Messages list */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item: any) => item._id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }: { item: any }) => {
          const isMe = item.senderId === currentUserId;
          const senderName = item.senderName || 'Unknown';
          const msgRefs: EntityReference[] = item.references || [];

          return (
            <View className={`flex-row ${isMe ? 'justify-end' : 'justify-start'}`}>
              {!isMe && (
                <View className="w-7 h-7 rounded-full bg-m-bg-inset items-center justify-center mr-2 mt-1">
                  <Text className="text-[10px] font-semibold text-m-text-secondary">
                    {getInitials(senderName)}
                  </Text>
                </View>
              )}
              <View className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <Text className="text-[10px] text-m-text-tertiary mb-0.5 ml-1">
                    {senderName}
                  </Text>
                )}
                <View
                  className={`rounded-2xl px-3.5 py-2 ${isMe ? 'bg-m-bg-brand' : 'bg-m-bg-inset'}`}
                >
                  <Text className={`text-sm ${isMe ? 'text-m-text-on-brand' : 'text-m-text-primary'}`}>
                    {item.content}
                  </Text>
                  {msgRefs.length > 0 && (
                    <View className="mt-1.5 gap-1">
                      {msgRefs.map((ref, i) => {
                        const Icon = iconForReference(ref.type);
                        return (
                          <TouchableOpacity
                            key={i}
                            onPress={() => navigateToReference(ref)}
                            className={`flex-row items-center gap-1 rounded px-2 py-1 ${isMe ? 'bg-white/10' : 'bg-white/60'}`}
                            activeOpacity={0.7}
                          >
                            <Icon size={11} color={isMe ? 'rgba(255,255,255,0.9)' : colors.textSecondary} />
                            <Text className={`text-xs underline ${isMe ? 'text-white' : 'text-m-text-primary'}`} numberOfLines={1}>
                              {ref.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
                <Text className="text-[10px] text-m-text-tertiary mt-0.5 mx-1">
                  {formatTime(item.createdAt || item._creationTime)}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-sm text-m-text-tertiary">No messages yet</Text>
            <Text className="text-xs text-m-text-tertiary mt-1">Say hi!</Text>
          </View>
        }
      />

      {/* Reference chips (if any pending) */}
      {references.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 px-4 py-2 border-t border-m-border bg-m-bg-subtle">
          {references.map((ref, i) => {
            const Icon = iconForReference(ref.type);
            return (
              <View key={i} className="flex-row items-center gap-1 bg-m-bg-card border border-m-border rounded-full px-2 py-1">
                <Icon size={10} color={colors.textSecondary} />
                <Text className="text-xs text-m-text-secondary">{ref.name}</Text>
                <TouchableOpacity onPress={() => removeReference(i)}>
                  <X size={10} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* Composer */}
      <View className="flex-row items-end gap-2 px-3 py-2 border-t border-m-border bg-m-bg-card">
        <TouchableOpacity
          onPress={() => setShowAttachMenu(!showAttachMenu)}
          className="w-9 h-9 rounded-full items-center justify-center"
        >
          <Paperclip size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <TextInput
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Message..."
          multiline
          className="flex-1 bg-m-bg-subtle rounded-2xl px-4 py-2 text-sm text-m-text-primary max-h-[100px]"
          placeholderTextColor={colors.textPlaceholder}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!messageText.trim() || sending}
          className={`w-9 h-9 rounded-full items-center justify-center ${messageText.trim() ? 'bg-m-bg-brand' : 'bg-m-bg-inset'}`}
        >
          <Send size={16} color={messageText.trim() ? colors.textOnBrand : colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Attach menu */}
      {showAttachMenu && (
        <AttachMenu
          onClose={() => setShowAttachMenu(false)}
          onSelect={(ref) => {
            if (references.length < 5) setReferences([...references, ref]);
            setShowAttachMenu(false);
          }}
          existingIds={references.map(r => r.id)}
        />
      )}

      {/* Contact detail — shown when user taps a 'contact' reference chip */}
      <ContactDetailModal
        visible={openContactId !== null}
        contactId={openContactId}
        onClose={() => setOpenContactId(null)}
      />
    </KeyboardAvoidingView>
  );
}

// ── Attach menu ──────────────────────────────────────────────

function AttachMenu({ onClose, onSelect, existingIds }: {
  onClose: () => void;
  onSelect: (ref: EntityReference) => void;
  existingIds: string[];
}) {
  const { isAuthenticated } = useConvexAuth();
  const [tab, setTab] = useState<'client' | 'project' | 'document' | 'contact'>('client');
  const [search, setSearch] = useState('');

  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const projects = useQuery(api.projects.list, isAuthenticated ? {} : 'skip');
  const documents = useQuery(
    api.documents.getRecent,
    isAuthenticated ? { limit: 50 } : 'skip'
  );
  // Contacts — only fetched when the "contact" tab is active, so users who
  // only attach clients/projects/documents never pay the 1000-record download.
  // Once the tab is opened, Convex's reactive subscription keeps it warm for
  // the rest of the session.
  const contacts = useQuery(
    api.contacts.getAll,
    isAuthenticated && tab === 'contact' ? {} : 'skip'
  );

  const items = useMemo(() => {
    const q = search.toLowerCase();
    let list: { id: string; name: string; type: EntityReference['type'] }[] = [];
    if (tab === 'client' && clients) {
      list = (clients as any[]).map(c => ({ id: c._id, name: c.name, type: 'client' as const }));
    } else if (tab === 'project' && projects) {
      list = (projects as any[]).map(p => ({ id: p._id, name: (p as any).name || 'Project', type: 'project' as const }));
    } else if (tab === 'document' && documents) {
      list = (documents as any[]).map(d => ({ id: d._id, name: d.fileName || 'Document', type: 'document' as const }));
    } else if (tab === 'contact' && contacts) {
      list = (contacts as any[]).map(c => ({ id: c._id, name: c.name || 'Contact', type: 'contact' as const }));
    }
    if (q) list = list.filter(i => i.name.toLowerCase().includes(q));
    // Cap to 30 for render cost — search narrows below that for typical use.
    // Contacts tab: at 1000 records, this keeps the FlatList tiny.
    return list.filter(i => !existingIds.includes(i.id)).slice(0, 30);
  }, [tab, clients, projects, documents, contacts, search, existingIds]);

  return (
    <View className="absolute inset-0 bg-black/50 justify-end" style={{ zIndex: 1000 }}>
      <TouchableOpacity className="flex-1" onPress={onClose} activeOpacity={1} />
      <View className="bg-m-bg-card border-t border-m-border" style={{ maxHeight: '60%' }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-3 pb-2 border-b border-m-border">
          <Text className="text-base font-semibold text-m-text-primary">Attach</Text>
          <TouchableOpacity onPress={onClose}><X size={18} color={colors.textSecondary} /></TouchableOpacity>
        </View>
        {/* Tabs */}
        <View className="flex-row border-b border-m-border">
          {(['client', 'project', 'document', 'contact'] as const).map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              className={`flex-1 py-2.5 items-center ${tab === t ? 'border-b-2 border-m-accent' : ''}`}
            >
              <Text className={`text-sm font-medium capitalize ${tab === t ? 'text-m-text-primary' : 'text-m-text-tertiary'}`}>
                {t}s
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* Search */}
        <View className="px-4 py-2">
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={`Search ${tab}s...`}
            className="bg-m-bg-subtle rounded-lg px-3 py-2 text-sm text-m-text-primary"
            placeholderTextColor={colors.textPlaceholder}
          />
        </View>
        {/* List */}
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const Icon = iconForReference(item.type);
            return (
              <TouchableOpacity
                onPress={() => onSelect(item)}
                className="flex-row items-center gap-3 px-4 py-2.5 border-b border-m-border-subtle"
              >
                <Icon size={14} color={colors.textSecondary} />
                <Text className="text-sm text-m-text-primary flex-1" numberOfLines={1}>{item.name}</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View className="py-8 items-center">
              <Text className="text-sm text-m-text-tertiary">No {tab}s found</Text>
            </View>
          }
        />
      </View>
    </View>
  );
}
