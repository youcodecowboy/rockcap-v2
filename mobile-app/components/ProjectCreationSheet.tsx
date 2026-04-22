import {
  View, Text, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { X, FolderPlus } from 'lucide-react-native';
import { api } from '../../model-testing-app/convex/_generated/api';
import type { Id } from '../../model-testing-app/convex/_generated/dataModel';
import { colors } from '@/lib/theme';
import { generateShortcodeSuggestion } from '@/lib/shortcodeUtils';

interface ProjectCreationSheetProps {
  visible: boolean;
  onClose: () => void;
  clientId: Id<'clients'>;
  onCreated?: (projectId: Id<'projects'>) => void;
}

export default function ProjectCreationSheet({ visible, onClose, clientId, onCreated }: ProjectCreationSheetProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [shortcode, setShortcode] = useState('');
  const [userEditedShortcode, setUserEditedShortcode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createProject = useMutation(api.projects.create);

  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  // Auto-suggest shortcode from name until the user manually edits the shortcode field.
  useEffect(() => {
    if (!userEditedShortcode) {
      setShortcode(generateShortcodeSuggestion(name));
    }
  }, [name, userEditedShortcode]);

  const reset = () => {
    setName('');
    setShortcode('');
    setUserEditedShortcode(false);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleShortcodeChange = (value: string) => {
    setUserEditedShortcode(true);
    setShortcode(value.toUpperCase().slice(0, 10));
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const projectId = await createProject({
        name: name.trim(),
        projectShortcode: shortcode.trim() || undefined,
        clientRoles: [{ clientId, role: 'primary' }],
      });
      reset();
      onCreated?.(projectId as Id<'projects'>);
      onClose();
      router.push(`/(tabs)/clients/${clientId}/projects/${projectId}` as any);
    } catch (e: any) {
      console.error('Failed to create project:', e);
      const message = e?.message || '';
      if (message.toLowerCase().includes('shortcode') && message.toLowerCase().includes('use')) {
        setError('This shortcode is taken — try another.');
      } else {
        setError(message || 'Could not create project. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-1 bg-m-bg">
          {/* Header */}
          <View className="px-4 pt-14 pb-3 bg-m-bg-brand gap-2">
            <View className="flex-row items-center justify-between">
              <TouchableOpacity
                onPress={handleClose}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text className="text-base text-m-text-on-brand">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!name.trim() || submitting}
                accessibilityRole="button"
                accessibilityLabel="Create project"
              >
                <Text className={`text-base font-semibold ${(!name.trim() || submitting) ? 'text-m-text-on-brand/40' : 'text-m-text-on-brand'}`}>
                  {submitting ? 'Creating…' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center justify-center gap-2">
              <FolderPlus size={18} color={colors.textOnBrand} />
              <Text className="text-lg font-medium text-m-text-on-brand">New Project</Text>
            </View>
          </View>

          <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }}>
            {/* Name */}
            <View>
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                Project name <Text className="text-m-error">*</Text>
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g., Wimbledon Development Phase 2"
                placeholderTextColor={colors.textPlaceholder}
                autoFocus
                className="text-sm text-m-text-primary bg-m-bg-subtle rounded-lg px-3 py-3"
              />
            </View>

            {/* Shortcode */}
            <View>
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                Project shortcode
              </Text>
              <TextInput
                value={shortcode}
                onChangeText={handleShortcodeChange}
                placeholder="e.g., WIMBDEV2"
                placeholderTextColor={colors.textPlaceholder}
                maxLength={10}
                autoCapitalize="characters"
                className="text-sm text-m-text-primary bg-m-bg-subtle rounded-lg px-3 py-3 font-mono"
              />
              <Text className="text-xs text-m-text-secondary mt-1">
                Max 10 characters. Used for document naming.
              </Text>
            </View>

            {error && (
              <View className="bg-m-error/10 rounded-lg px-3 py-2">
                <Text className="text-xs text-m-error">{error}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
