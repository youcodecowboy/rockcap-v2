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

export default function NoteEditorScreen() {
  const { noteId } = useLocalSearchParams<{ noteId?: string }>();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const existingNote = useQuery(
    api.notes.get,
    isAuthenticated && noteId ? { id: noteId as any } : 'skip'
  );

  const createNote = useMutation(api.notes.create);
  const updateNote = useMutation(api.notes.update);

  useEffect(() => {
    if (existingNote && typeof existingNote.content === 'string') {
      setContent(existingNote.content);
    }
  }, [existingNote]);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      if (noteId) {
        await updateNote({ id: noteId as any, content: content.trim() } as any);
      } else {
        await createNote({ content: content.trim() } as any);
      }
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

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
          disabled={saving || !content.trim()}
          className="flex-row items-center gap-1.5 bg-white/10 rounded-full px-4 py-2"
          style={{ opacity: saving || !content.trim() ? 0.4 : 1 }}
        >
          <Save size={14} color={colors.textOnBrand} />
          <Text className="text-m-text-on-brand text-sm font-medium">
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        value={content}
        onChangeText={setContent}
        placeholder="Start writing..."
        multiline
        textAlignVertical="top"
        autoFocus={!noteId}
        className="flex-1 px-4 pt-4 text-base text-m-text-primary leading-6"
        placeholderTextColor={colors.textPlaceholder}
      />
    </KeyboardAvoidingView>
  );
}
