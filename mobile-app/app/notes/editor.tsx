import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { ArrowLeft, Save } from 'lucide-react-native';
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

export default function NoteEditorScreen() {
  const { noteId } = useLocalSearchParams<{ noteId?: string }>();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const existingNote = useQuery(
    api.notes.get,
    isAuthenticated && noteId ? { id: noteId as any } : 'skip'
  );

  const createNote = useMutation(api.notes.create);
  const updateNote = useMutation(api.notes.update);

  useEffect(() => {
    if (existingNote) {
      setTitle(existingNote.title || '');
      setBody(extractPlainText(existingNote.content));
    }
  }, [existingNote]);

  const handleSave = async () => {
    if (!title.trim() && !body.trim()) return;
    setSaving(true);
    try {
      const noteTitle = title.trim() || 'Untitled';
      const content = body.trim() ? wrapInTiptapJson(body.trim()) : wrapInTiptapJson('');

      if (noteId) {
        await updateNote({ id: noteId as any, title: noteTitle, content } as any);
      } else {
        await createNote({ title: noteTitle, content } as any);
      }
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

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

      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Start writing..."
        multiline
        textAlignVertical="top"
        className="flex-1 px-4 pt-3 text-base text-m-text-primary leading-6"
        placeholderTextColor={colors.textPlaceholder}
      />
    </KeyboardAvoidingView>
  );
}
