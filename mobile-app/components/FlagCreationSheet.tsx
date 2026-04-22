import {
  View, Text, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { useState, useMemo } from 'react';
import { useMutation, useQuery, useConvexAuth } from 'convex/react';
import { X, Flag } from 'lucide-react-native';
import { api } from '../../model-testing-app/convex/_generated/api';
import type { Id } from '../../model-testing-app/convex/_generated/dataModel';
import { colors } from '@/lib/theme';
import PeoplePicker, { type PersonOption } from '@/components/PeoplePicker';

interface FlagCreationSheetProps {
  visible: boolean;
  onClose: () => void;
  clientId: Id<'clients'>;
  onCreated?: (flagId: Id<'flags'>) => void;
}

export default function FlagCreationSheet({ visible, onClose, clientId, onCreated }: FlagCreationSheetProps) {
  const { isAuthenticated } = useConvexAuth();
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [assignedToIds, setAssignedToIds] = useState<string[]>([]);
  const [linkedProjectId, setLinkedProjectId] = useState<Id<'projects'> | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientProjects = useQuery(
    api.projects.getByClient,
    isAuthenticated && visible ? { clientId } : 'skip'
  );

  const allUsers = useQuery(api.users.getAll, isAuthenticated && visible ? {} : 'skip');

  const createFlag = useMutation(api.flags.create);

  const peoplePickerOptions = useMemo<PersonOption[]>(() => {
    if (!allUsers) return [];
    return (allUsers as any[]).map((u: any) => ({
      id: u._id,
      name: u.name || u.email || 'User',
      email: u.email,
      source: 'user' as const,
    }));
  }, [allUsers]);

  const linkedProjectName = useMemo(() => {
    if (!linkedProjectId || !clientProjects) return null;
    const project = (clientProjects as any[]).find((p: any) => p._id === linkedProjectId);
    return project?.name ?? null;
  }, [linkedProjectId, clientProjects]);

  const reset = () => {
    setNote('');
    setPriority('normal');
    setAssignedToIds([]);
    setLinkedProjectId(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const flagId = await createFlag({
        entityType: 'client',
        entityId: clientId,
        clientId,
        note: note.trim(),
        priority,
        assignedTo: (assignedToIds[0] as Id<'users'> | undefined) || undefined,
        projectId: linkedProjectId || undefined,
      });
      reset();
      onClose();
      onCreated?.(flagId as Id<'flags'>);
    } catch (e: any) {
      console.error('Failed to create flag:', e);
      setError(e?.message || 'Could not create flag. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-1 bg-m-bg">
            {/* Header */}
            <View className="flex-row items-center justify-between px-4 pt-14 pb-3 bg-m-bg-brand">
              <View className="flex-row items-center gap-2">
                <Flag size={18} color={colors.textOnBrand} />
                <Text className="text-lg font-medium text-m-text-on-brand">New Flag</Text>
              </View>
              <TouchableOpacity onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close">
                <X size={20} color={colors.textOnBrand} />
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }}>
              {/* Note body */}
              <View>
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                  Note
                </Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Describe what needs attention…"
                  placeholderTextColor={colors.textPlaceholder}
                  multiline
                  autoFocus
                  textAlignVertical="top"
                  className="text-sm text-m-text-primary bg-m-bg-subtle rounded-lg px-3 py-3"
                  style={{ minHeight: 160 }}
                />
              </View>

              {/* Priority */}
              <View>
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                  Priority
                </Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setPriority('normal')}
                    className={`flex-1 py-2 rounded-lg items-center ${priority === 'normal' ? 'bg-m-accent' : 'bg-m-bg-subtle'}`}
                    accessibilityRole="button"
                  >
                    <Text className={`text-sm font-medium ${priority === 'normal' ? 'text-m-text-on-brand' : 'text-m-text-secondary'}`}>
                      Normal
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setPriority('urgent')}
                    className={`flex-1 py-2 rounded-lg items-center ${priority === 'urgent' ? 'bg-m-error' : 'bg-m-bg-subtle'}`}
                    accessibilityRole="button"
                  >
                    <Text className={`text-sm font-medium ${priority === 'urgent' ? 'text-white' : 'text-m-text-secondary'}`}>
                      Urgent
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Assignee — PeoplePicker manages its own modal */}
              <View>
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                  Assigned to
                </Text>
                <View className="bg-m-bg-subtle rounded-lg px-3 py-3 flex-row items-center justify-between">
                  <PeoplePicker
                    options={peoplePickerOptions}
                    selectedIds={assignedToIds}
                    onChange={(ids) => setAssignedToIds(ids.slice(0, 1))}
                    title="Assign to"
                    placeholder="Me (default)"
                    maxSelection={1}
                  />
                  {assignedToIds.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setAssignedToIds([])}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Linked project (optional) */}
              <View>
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                  Linked project (optional)
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (!clientProjects || (clientProjects as any[]).length === 0) {
                      Alert.alert('No projects', 'This client has no projects yet.');
                      return;
                    }
                    setShowProjectPicker(true);
                  }}
                  className="bg-m-bg-subtle rounded-lg px-3 py-3 flex-row items-center justify-between"
                  accessibilityRole="button"
                >
                  <Text className="text-sm text-m-text-primary">
                    {linkedProjectName ?? 'None'}
                  </Text>
                  {linkedProjectId && (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation?.(); setLinkedProjectId(null); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>

              {error && (
                <View className="bg-m-error/10 rounded-lg px-3 py-2">
                  <Text className="text-xs text-m-error">{error}</Text>
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View className="flex-row gap-2 px-4 py-3 border-t border-m-border-subtle">
              <TouchableOpacity
                onPress={handleClose}
                disabled={submitting}
                className="bg-m-bg-subtle rounded-lg py-3 px-4 items-center"
                accessibilityRole="button"
              >
                <Text className="text-sm text-m-text-secondary">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!note.trim() || submitting}
                className={`flex-1 rounded-lg py-3 items-center ${(!note.trim() || submitting) ? 'bg-m-accent/50' : 'bg-m-accent'}`}
                accessibilityRole="button"
              >
                <Text className="text-sm font-medium text-m-text-on-brand">
                  {submitting ? 'Creating…' : 'Create Flag'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Project picker — simple inline picker modal */}
      <Modal
        visible={showProjectPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProjectPicker(false)}
      >
        <View className="flex-1 bg-m-bg">
          <View className="flex-row items-center justify-between px-4 pt-14 pb-3 bg-m-bg-brand">
            <Text className="text-lg font-medium text-m-text-on-brand">Link project</Text>
            <TouchableOpacity onPress={() => setShowProjectPicker(false)} accessibilityRole="button">
              <X size={20} color={colors.textOnBrand} />
            </TouchableOpacity>
          </View>
          <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
            {(clientProjects as any[] | undefined)?.map((p: any) => (
              <TouchableOpacity
                key={p._id}
                onPress={() => {
                  setLinkedProjectId(p._id);
                  setShowProjectPicker(false);
                }}
                className="bg-m-bg-subtle rounded-lg px-3 py-3 mb-2"
                accessibilityRole="button"
              >
                <Text className="text-sm text-m-text-primary">{p.name}</Text>
                {p.projectShortcode && (
                  <Text className="text-xs text-m-text-tertiary font-mono mt-1">{p.projectShortcode}</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
