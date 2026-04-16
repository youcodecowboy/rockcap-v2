import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../model-testing-app/convex/_generated/api';
import { X, Trash2, Calendar } from 'lucide-react-native';
import { colors } from '@/lib/theme';

// ── Constants ────────────────────────────────────────────────

const STATUSES = [
  { value: 'todo', label: 'To Do', bg: '#f5f5f4', text: '#525252' },
  { value: 'in_progress', label: 'In Progress', bg: '#dbeafe', text: '#1d4ed8' },
  { value: 'completed', label: 'Done', bg: '#dcfce7', text: '#059669' },
  { value: 'paused', label: 'Paused', bg: '#fef3c7', text: '#d97706' },
  { value: 'cancelled', label: 'Cancelled', bg: '#fee2e2', text: '#ef4444' },
] as const;

const PRIORITIES = [
  { value: 'low', label: 'Low', bg: '#f5f5f4', text: '#a3a3a3' },
  { value: 'medium', label: 'Med', bg: '#fef3c7', text: '#d97706' },
  { value: 'high', label: 'High', bg: '#fee2e2', text: '#ef4444' },
] as const;

// ── Types ────────────────────────────────────────────────────

interface TaskDetailSheetProps {
  task: {
    _id: string;
    title: string;
    description?: string;
    status: string;
    priority?: string;
    dueDate?: string;
    notes?: string;
    clientId?: string;
    projectId?: string;
  };
  clientName?: string;
  projectName?: string;
  visible: boolean;
  onClose: () => void;
}

// ── Component ────────────────────────────────────────────────

export default function TaskDetailSheet({ task, clientName, projectName, visible, onClose }: TaskDetailSheetProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [notes, setNotes] = useState(task.notes ?? '');
  const [saving, setSaving] = useState(false);

  const updateTask = useMutation(api.tasks.update);
  const removeTask = useMutation(api.tasks.remove);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Title is required');
      return;
    }
    setSaving(true);
    try {
      const updates: any = {
        id: task._id,
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        notes: notes.trim() || undefined,
      };
      // Only send dueDate if it has a value, otherwise send null to clear
      if (dueDate.trim()) {
        // Accept YYYY-MM-DD and convert to ISO
        const parsed = new Date(dueDate.trim());
        if (!isNaN(parsed.getTime())) {
          updates.dueDate = parsed.toISOString();
        }
      } else if (task.dueDate) {
        // Clear the existing date
        updates.dueDate = null;
      }

      await updateTask(updates);
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save task');
    } finally {
      setSaving(false);
    }
  }, [task._id, title, description, status, priority, dueDate, notes, task.dueDate, updateTask, onClose]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${task.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeTask({ id: task._id } as any);
              onClose();
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Failed to delete task');
            }
          },
        },
      ],
    );
  }, [task._id, task.title, removeTask, onClose]);

  const formatDisplayDate = (iso: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-m-bg">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border bg-m-bg-card">
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text className="text-base font-semibold text-m-text-primary">Edit Task</Text>
          <TouchableOpacity onPress={handleDelete} hitSlop={8}>
            <Trash2 size={20} color={colors.error} />
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

          {/* Title */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Task title"
            placeholderTextColor={colors.textPlaceholder}
            className="bg-m-bg-card border border-m-border rounded-xl px-3 py-3 text-sm text-m-text-primary mb-4"
          />

          {/* Description */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Add a description..."
            placeholderTextColor={colors.textPlaceholder}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            className="bg-m-bg-card border border-m-border rounded-xl px-3 py-3 text-sm text-m-text-primary mb-4"
            style={{ minHeight: 72 }}
          />

          {/* Status */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            <View className="flex-row gap-2">
              {STATUSES.map((s) => {
                const isSelected = status === s.value;
                return (
                  <TouchableOpacity
                    key={s.value}
                    onPress={() => setStatus(s.value)}
                    className="rounded-full px-4 py-2"
                    style={{
                      backgroundColor: isSelected ? s.bg : 'transparent',
                      borderWidth: 1,
                      borderColor: isSelected ? s.text : colors.border,
                    }}
                  >
                    <Text
                      className="text-xs font-medium"
                      style={{ color: isSelected ? s.text : colors.textTertiary }}
                    >
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Priority */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Priority</Text>
          <View className="flex-row gap-2 mb-4">
            {PRIORITIES.map((p) => {
              const isSelected = priority === p.value;
              return (
                <TouchableOpacity
                  key={p.value}
                  onPress={() => setPriority(p.value)}
                  className="rounded-full px-4 py-2"
                  style={{
                    backgroundColor: isSelected ? p.bg : 'transparent',
                    borderWidth: 1,
                    borderColor: isSelected ? p.text : colors.border,
                  }}
                >
                  <Text
                    className="text-xs font-medium"
                    style={{ color: isSelected ? p.text : colors.textTertiary }}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Due Date */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Due Date</Text>
          <View className="flex-row items-center bg-m-bg-card border border-m-border rounded-xl px-3 py-3 mb-4">
            <Calendar size={16} color={colors.textTertiary} />
            <TextInput
              value={dueDate ? formatDisplayDate(dueDate) : ''}
              onChangeText={(text) => {
                // Accept raw input; on blur we'll parse
                setDueDate(text);
              }}
              onFocus={() => {
                // Show raw ISO/date string for editing
                if (dueDate) {
                  const d = new Date(dueDate);
                  if (!isNaN(d.getTime())) {
                    setDueDate(d.toISOString().split('T')[0]); // YYYY-MM-DD
                  }
                }
              }}
              onBlur={() => {
                // Try to parse back
                if (dueDate) {
                  const d = new Date(dueDate);
                  if (!isNaN(d.getTime())) {
                    setDueDate(d.toISOString());
                  }
                }
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textPlaceholder}
              className="flex-1 ml-2 text-sm text-m-text-primary"
            />
          </View>

          {/* Client (read-only) */}
          {clientName && (
            <>
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Client</Text>
              <View className="bg-m-bg-subtle border border-m-border rounded-xl px-3 py-3 mb-4">
                <Text className="text-sm text-m-text-secondary">{clientName}</Text>
              </View>
            </>
          )}

          {/* Project (read-only) */}
          {projectName && (
            <>
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Project</Text>
              <View className="bg-m-bg-subtle border border-m-border rounded-xl px-3 py-3 mb-4">
                <Text className="text-sm text-m-text-secondary">{projectName}</Text>
              </View>
            </>
          )}

          {/* Notes */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Add notes..."
            placeholderTextColor={colors.textPlaceholder}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="bg-m-bg-card border border-m-border rounded-xl px-3 py-3 text-sm text-m-text-primary mb-6"
            style={{ minHeight: 96 }}
          />

          {/* Save button */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            className="bg-m-accent rounded-xl py-3.5 items-center mb-3"
            style={{ opacity: saving ? 0.5 : 1 }}
          >
            <Text className="text-m-text-on-brand text-sm font-semibold">
              {saving ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>

          {/* Delete button */}
          <TouchableOpacity
            onPress={handleDelete}
            className="border border-red-200 rounded-xl py-3.5 items-center"
          >
            <Text className="text-sm font-medium" style={{ color: colors.error }}>Delete Task</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
