import {
  View, Text, TextInput, TouchableOpacity, Alert,
  Modal, FlatList,
} from 'react-native';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { ArrowLeft, Save, X, Plus, Building2, FolderOpen, FileText } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import RichTextEditor, { type MentionItem } from '@/components/RichTextEditor';
import MobileHeader from '@/components/MobileHeader';
import MiniTabBar from '@/components/MiniTabBar';

function extractMentionedUserIds(content: any): string[] {
  const ids: string[] = [];
  function walk(node: any) {
    if (node.type === 'mention' && node.attrs?.type === 'user' && node.attrs?.id) {
      ids.push(node.attrs.id);
    }
    if (node.content) node.content.forEach(walk);
  }
  if (content?.content) content.content.forEach(walk);
  return [...new Set(ids)];
}

const TAG_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function PickerModal({
  visible, onClose, title, items, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: { id: string; name: string }[];
  onSelect: (id: string, name: string) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View className="flex-1 bg-m-bg">
        <View className="flex-row items-center justify-between px-4 pt-14 pb-3 bg-m-bg-brand">
          <Text className="text-lg font-medium text-m-text-on-brand">{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <X size={20} color={colors.textOnBrand} />
          </TouchableOpacity>
        </View>
        <TextInput
          placeholder="Search..."
          value={search}
          onChangeText={setSearch}
          className="mx-4 mt-3 bg-m-bg-subtle rounded-lg px-3 py-2.5 text-sm text-m-text-primary"
          placeholderTextColor={colors.textPlaceholder}
        />
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingTop: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => { onSelect(item.id, item.name); onClose(); }}
              className="px-4 py-3 border-b border-m-border-subtle"
            >
              <Text className="text-sm text-m-text-primary">{item.name}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View className="px-4 py-8 items-center">
              <Text className="text-sm text-m-text-tertiary">No results</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

export default function NoteEditorScreen() {
  const { noteId, clientId: preselectedClientId } = useLocalSearchParams<{ noteId?: string; clientId?: string }>();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [title, setTitle] = useState('');
  const [contentJson, setContentJson] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(preselectedClientId ?? null);
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState<string | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  const existingNote = useQuery(
    api.notes.get,
    isAuthenticated && noteId ? { id: noteId as any } : 'skip'
  );

  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const projects = useQuery(
    api.projects.getByClient,
    isAuthenticated && selectedClientId ? { clientId: selectedClientId as any } : 'skip'
  );

  const createNote = useMutation(api.notes.create);
  const updateNote = useMutation(api.notes.update);

  const allClients = clients || [];
  const allProjects = useQuery(api.projects.list, isAuthenticated ? {} : 'skip');
  const allUsers = useQuery(api.users.getAll, isAuthenticated ? {} : 'skip');
  // Contacts — with HubSpot sync, this can be 1000+ entries. The Tiptap
  // mention popup filters client-side and slices to 10 results, so it
  // stays snappy regardless of list size. Convex shares this subscription
  // across any screen using the same query+args (e.g. TaskCreationFlow),
  // so we don't double-fetch.
  const allContacts = useQuery(api.contacts.getAll, isAuthenticated ? {} : 'skip');

  // Build mention items for the editor. Order matters: users first (most
  // common mention target), then clients, projects, contacts. Tiptap's
  // default suggestion sort preserves insertion order when scores tie.
  const editorMentionItems = useMemo((): MentionItem[] => {
    const items: MentionItem[] = [];
    if (allUsers) items.push(...(allUsers as any[]).map((u: any) => ({ id: u._id, label: u.name || u.email || 'User', type: 'user' as const })));
    if (allClients.length) items.push(...(allClients as any[]).map((c: any) => ({ id: c._id, label: c.name, type: 'client' as const })));
    if (allProjects) items.push(...(allProjects as any[]).map((p: any) => ({ id: p._id, label: (p as any).name || 'Project', type: 'project' as const })));
    if (allContacts) items.push(...(allContacts as any[]).map((c: any) => ({ id: c._id, label: c.name || 'Contact', type: 'contact' as const })));
    return items;
  }, [allUsers, allClients, allProjects, allContacts]);

  // For new notes (no noteId) there's no server content to wait for, so seed
  // initialContent with `null` — that flips RichTextEditor past its
  // "still-loading" guard and triggers the Tiptap `init` message that
  // actually constructs the editor. `undefined` means "waiting for fetch"
  // and leaves the editor inert (nothing to type into).
  const [initialEditorContent, setInitialEditorContent] = useState<any>(
    noteId ? undefined : null
  );

  // Load existing note data (once)
  const loadedRef = useRef(false);
  useEffect(() => {
    if (existingNote && !loadedRef.current) {
      loadedRef.current = true;
      setTitle(existingNote.title || '');
      setTags((existingNote as any).tags || []);
      setInitialEditorContent(existingNote.content);
      if ((existingNote as any).clientId) setSelectedClientId((existingNote as any).clientId);
      if ((existingNote as any).projectId) setSelectedProjectId((existingNote as any).projectId);
    }
  }, [existingNote]);

  // Resolve client/project names reactively as lookup data loads
  useEffect(() => {
    if (selectedClientId && allClients.length > 0 && !selectedClientName) {
      const client = allClients.find((c: any) => c._id === selectedClientId);
      if (client) setSelectedClientName((client as any).name);
    }
  }, [selectedClientId, allClients, selectedClientName]);

  useEffect(() => {
    if (selectedProjectId && allProjects && !selectedProjectName) {
      const project = allProjects.find((p: any) => p._id === selectedProjectId);
      if (project) setSelectedProjectName((project as any).name);
    }
  }, [selectedProjectId, allProjects, selectedProjectName]);

  const handleContentChange = (json: any) => {
    setContentJson(json);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!title.trim() && !contentJson) return;
    setSaving(true);
    try {
      const noteTitle = title.trim() || 'Untitled';
      const content = contentJson ? JSON.stringify(contentJson) : '{"type":"doc","content":[]}';

      const mentionedUserIds = contentJson ? extractMentionedUserIds(contentJson) : [];

      // createdAt / updatedAt are set server-side by the mutations — they
      // aren't in the validator schema, and passing them triggers a Convex
      // ArgumentValidationError ("Object contains extra field `createdAt`").
      if (noteId) {
        await updateNote({
          id: noteId as any,
          title: noteTitle,
          content,
          clientId: selectedClientId || undefined,
          projectId: selectedProjectId || undefined,
          tags: tags,
          mentionedUserIds,
        } as any);
      } else {
        await createNote({
          title: noteTitle,
          content,
          clientId: selectedClientId || undefined,
          projectId: selectedProjectId || undefined,
          tags: tags,
          mentionedUserIds,
        } as any);
      }
      setSaved(true);
      setSaving(false);
    } catch (error) {
      // Surface the real error (auth failures, validation, etc.) so the next
      // repro has a stack trace to work from instead of a generic alert.
      const message =
        error instanceof Error ? error.message : 'Failed to save note';
      Alert.alert('Error', message);
      setSaving(false);
    }
  };

  const addTag = (text: string) => {
    const tag = text.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
    setShowTagInput(false);
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleClientSelect = (id: string, name: string) => {
    setSelectedClientId(id);
    setSelectedClientName(name);
    setSelectedProjectId(null);
    setSelectedProjectName(null);
  };

  const handleProjectSelect = (id: string, name: string) => {
    setSelectedProjectId(id);
    setSelectedProjectName(name);
  };

  const clientItems = (allClients as any[]).map((c: any) => ({ id: c._id, name: c.name }));
  const projectItems = (projects || []).map((p: any) => ({ id: p._id, name: p.name }));

  if (noteId && !existingNote) return <LoadingSpinner message="Loading note..." />;

  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />

      {/* Sub-navigation — matches web's "← Notes" + "Docs" bar */}
      <View className="flex-row items-center justify-between px-4 py-2 border-b border-m-border bg-m-bg-card">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-1.5">
          <ArrowLeft size={14} color={colors.textSecondary} />
          <Text className="text-sm text-m-text-secondary">Notes</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/docs')} className="flex-row items-center gap-1.5">
          <FileText size={14} color={colors.textTertiary} />
          <Text className="text-sm text-m-text-tertiary">Docs</Text>
        </TouchableOpacity>
      </View>

      {/* Metadata bar — client/project chips + tag count */}
      <View className="flex-row items-center gap-2 px-4 py-2 border-b border-m-border">
        <TouchableOpacity
          onPress={() => setShowClientPicker(true)}
          className="flex-row items-center gap-1.5 bg-m-bg-subtle rounded-full px-3 py-1.5"
        >
          <Building2 size={12} color={selectedClientId ? colors.textPrimary : colors.textTertiary} />
          <Text
            className={`text-xs font-medium ${selectedClientId ? 'text-m-text-primary' : 'text-m-text-tertiary'}`}
            numberOfLines={1}
          >
            {selectedClientName || 'Client'}
          </Text>
          {selectedClientId && (
            <TouchableOpacity onPress={() => { setSelectedClientId(null); setSelectedClientName(null); setSelectedProjectId(null); setSelectedProjectName(null); }}>
              <X size={10} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            if (!selectedClientId) { Alert.alert('Select client first'); return; }
            setShowProjectPicker(true);
          }}
          className="flex-row items-center gap-1.5 bg-m-bg-subtle rounded-full px-3 py-1.5"
        >
          <FolderOpen size={12} color={selectedProjectId ? colors.textPrimary : colors.textTertiary} />
          <Text
            className={`text-xs font-medium ${selectedProjectId ? 'text-m-text-primary' : 'text-m-text-tertiary'}`}
            numberOfLines={1}
          >
            {selectedProjectName || 'Project'}
          </Text>
          {selectedProjectId && (
            <TouchableOpacity onPress={() => { setSelectedProjectId(null); setSelectedProjectName(null); }}>
              <X size={10} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {tags.length > 0 && (
          <Text className="text-xs text-m-text-tertiary">{tags.length} tags</Text>
        )}
      </View>

      {/* Title + save status */}
      <View className="flex-row items-center px-4 pt-3 pb-1">
        <TextInput
          value={title}
          onChangeText={(t) => { setTitle(t); setSaved(false); }}
          placeholder="Note title"
          autoFocus={!noteId}
          className="flex-1 text-lg text-m-text-primary font-semibold"
          placeholderTextColor={colors.textPlaceholder}
        />
        <TouchableOpacity onPress={handleSave} className="flex-row items-center gap-1.5 ml-2">
          {saved ? (
            <>
              <View className="w-2 h-2 rounded-full bg-m-success" />
              <Text className="text-xs text-m-text-tertiary">Saved</Text>
            </>
          ) : (
            <>
              <Save size={14} color={saving ? colors.textTertiary : colors.textPrimary} />
              <Text className={`text-xs font-medium ${saving ? 'text-m-text-tertiary' : 'text-m-text-primary'}`}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Tags row */}
      <View className="flex-row flex-wrap items-center gap-1.5 px-4 py-1.5">
        {tags.map(tag => (
          <TouchableOpacity
            key={tag}
            onPress={() => removeTag(tag)}
            className="flex-row items-center gap-1 rounded-full px-2.5 py-0.5"
            style={{ backgroundColor: getTagColor(tag) + '20' }}
          >
            <Text style={{ color: getTagColor(tag), fontSize: 11, fontWeight: '500' }}>{tag}</Text>
            <X size={9} color={getTagColor(tag)} />
          </TouchableOpacity>
        ))}
        {showTagInput ? (
          <TextInput
            value={tagInput}
            onChangeText={setTagInput}
            placeholder="Tag name"
            autoFocus
            onSubmitEditing={() => addTag(tagInput)}
            onBlur={() => { if (tagInput.trim()) addTag(tagInput); else setShowTagInput(false); }}
            returnKeyType="done"
            className="bg-m-bg-subtle rounded-full px-2.5 py-0.5 text-xs text-m-text-primary min-w-[80px]"
            placeholderTextColor={colors.textPlaceholder}
          />
        ) : (
          <TouchableOpacity
            onPress={() => setShowTagInput(true)}
            className="w-5 h-5 rounded-full bg-m-bg-subtle items-center justify-center"
          >
            <Plus size={10} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Rich text editor — Tiptap via WebView */}
      <RichTextEditor
        initialContent={initialEditorContent}
        placeholder="Start writing..."
        onChange={handleContentChange}
        onReady={() => setEditorReady(true)}
        mentionItems={editorMentionItems}
      />

      <MiniTabBar />

      {/* Picker modals */}
      <PickerModal
        visible={showClientPicker}
        onClose={() => setShowClientPicker(false)}
        title="Select Client"
        items={clientItems}
        onSelect={handleClientSelect}
      />
      <PickerModal
        visible={showProjectPicker}
        onClose={() => setShowProjectPicker(false)}
        title="Select Project"
        items={projectItems}
        onSelect={handleProjectSelect}
      />
    </View>
  );
}
