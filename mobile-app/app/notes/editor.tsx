import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
  Modal, FlatList,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { ArrowLeft, Save, X, Plus, Building2, FolderOpen } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function extractPlainText(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  const texts: string[] = [];
  function walk(node: any) {
    if (node.text) texts.push(node.text);
    if (node.content) node.content.forEach(walk);
    if (node.children) node.children.forEach(walk);
  }
  walk(content);
  return texts.join(' ');
}

function wrapInTiptapJson(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
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
  const { noteId } = useLocalSearchParams<{ noteId?: string }>();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState<string | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

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

  // Resolve client/project names when editing existing note
  const allClients = clients || [];
  const allProjects = useQuery(api.projects.list, isAuthenticated ? {} : 'skip');

  useEffect(() => {
    if (existingNote) {
      setTitle(existingNote.title || '');
      setBody(extractPlainText(existingNote.content));
      setTags((existingNote as any).tags || []);
      if ((existingNote as any).clientId) {
        setSelectedClientId((existingNote as any).clientId);
        const client = allClients.find((c: any) => c._id === (existingNote as any).clientId);
        if (client) setSelectedClientName((client as any).name);
      }
      if ((existingNote as any).projectId) {
        setSelectedProjectId((existingNote as any).projectId);
        const project = allProjects?.find((p: any) => p._id === (existingNote as any).projectId);
        if (project) setSelectedProjectName((project as any).name);
      }
    }
  }, [existingNote, allClients, allProjects]);

  const handleSave = async () => {
    if (!title.trim() && !body.trim()) return;
    setSaving(true);
    try {
      const noteTitle = title.trim() || 'Untitled';
      const content = body.trim() ? wrapInTiptapJson(body.trim()) : wrapInTiptapJson('');

      if (noteId) {
        await updateNote({
          id: noteId as any,
          title: noteTitle,
          content,
          clientId: selectedClientId || undefined,
          projectId: selectedProjectId || undefined,
          tags: tags,
          updatedAt: new Date().toISOString(),
        } as any);
      } else {
        await createNote({
          title: noteTitle,
          content,
          clientId: selectedClientId || undefined,
          projectId: selectedProjectId || undefined,
          tags: tags,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any);
      }
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to save note');
    } finally {
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
    // Reset project when client changes
    setSelectedProjectId(null);
    setSelectedProjectName(null);
  };

  const handleProjectSelect = (id: string, name: string) => {
    setSelectedProjectId(id);
    setSelectedProjectName(name);
  };

  const clientItems = (allClients as any[]).map((c: any) => ({ id: c._id, name: c.name }));
  const projectItems = (projects || []).map((p: any) => ({ id: p._id, name: p.name }));

  const canSave = title.trim() || body.trim();

  if (noteId && !existingNote) return <LoadingSpinner message="Loading note..." />;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-m-bg">
      <View className="bg-m-bg-brand pt-14 pb-4 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <ArrowLeft size={20} color={colors.textOnBrand} />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-m-text-on-brand">
            {noteId ? 'Edit Note' : 'New Note'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || !canSave}
          className="flex-row items-center gap-1.5 bg-white/10 rounded-full px-4 py-2"
          style={{ opacity: saving || !canSave ? 0.4 : 1 }}
        >
          <Save size={14} color={colors.textOnBrand} />
          <Text className="text-m-text-on-brand text-sm font-medium">
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Note title"
        autoFocus={!noteId}
        className="px-4 pt-4 pb-2 text-lg text-m-text-primary font-semibold"
        placeholderTextColor={colors.textPlaceholder}
      />

      <View className="mx-4 h-px bg-m-border" />

      {/* Client / Project chips */}
      <View className="flex-row items-center gap-2 px-4 py-2.5">
        <TouchableOpacity
          onPress={() => setShowClientPicker(true)}
          className="flex-row items-center gap-1.5 bg-m-bg-subtle rounded-full px-3 py-1.5"
        >
          <Building2 size={13} color={selectedClientId ? colors.textPrimary : colors.textTertiary} />
          <Text
            className={`text-xs font-medium ${selectedClientId ? 'text-m-text-primary' : 'text-m-text-tertiary'}`}
            numberOfLines={1}
          >
            {selectedClientName || 'Link to client'}
          </Text>
          {selectedClientId && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                setSelectedClientId(null);
                setSelectedClientName(null);
                setSelectedProjectId(null);
                setSelectedProjectName(null);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            >
              <X size={12} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            if (!selectedClientId) {
              Alert.alert('Select client first', 'Link a client before selecting a project.');
              return;
            }
            setShowProjectPicker(true);
          }}
          className="flex-row items-center gap-1.5 bg-m-bg-subtle rounded-full px-3 py-1.5"
        >
          <FolderOpen size={13} color={selectedProjectId ? colors.textPrimary : colors.textTertiary} />
          <Text
            className={`text-xs font-medium ${selectedProjectId ? 'text-m-text-primary' : 'text-m-text-tertiary'}`}
            numberOfLines={1}
          >
            {selectedProjectName || 'Link to project'}
          </Text>
          {selectedProjectId && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                setSelectedProjectId(null);
                setSelectedProjectName(null);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            >
              <X size={12} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </View>

      <View className="mx-4 h-px bg-m-border" />

      {/* Tags */}
      <View className="flex-row flex-wrap items-center gap-1.5 px-4 py-2.5">
        {tags.map(tag => (
          <TouchableOpacity
            key={tag}
            onPress={() => removeTag(tag)}
            className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
            style={{ backgroundColor: getTagColor(tag) + '20' }}
          >
            <Text style={{ color: getTagColor(tag), fontSize: 12, fontWeight: '500' }}>{tag}</Text>
            <X size={10} color={getTagColor(tag)} />
          </TouchableOpacity>
        ))}
        {showTagInput ? (
          <TextInput
            value={tagInput}
            onChangeText={setTagInput}
            placeholder="Tag name"
            autoFocus
            onSubmitEditing={() => addTag(tagInput)}
            onBlur={() => {
              if (tagInput.trim()) addTag(tagInput);
              else setShowTagInput(false);
            }}
            returnKeyType="done"
            className="bg-m-bg-subtle rounded-full px-2.5 py-1 text-xs text-m-text-primary min-w-[80px]"
            placeholderTextColor={colors.textPlaceholder}
          />
        ) : (
          <TouchableOpacity
            onPress={() => setShowTagInput(true)}
            className="w-6 h-6 rounded-full bg-m-bg-subtle items-center justify-center"
          >
            <Plus size={12} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      <View className="mx-4 h-px bg-m-border" />

      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Start writing..."
        multiline
        textAlignVertical="top"
        className="flex-1 px-4 pt-3 text-base text-m-text-primary leading-6"
        placeholderTextColor={colors.textPlaceholder}
      />

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
    </KeyboardAvoidingView>
  );
}
