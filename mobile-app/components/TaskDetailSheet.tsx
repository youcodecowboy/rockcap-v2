import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../model-testing-app/convex/_generated/api';
import { X, Trash2, Calendar, Pause, Pencil, Check, Clock, User2, Briefcase, FolderOpen, Flag } from 'lucide-react-native';
import { colors } from '@/lib/theme';

// ── Constants ────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do', bg: '#f5f5f4', text: '#525252', activeBg: '#000000', activeText: '#ffffff' },
  { value: 'in_progress', label: 'In Progress', bg: '#f5f5f4', text: '#525252', activeBg: '#3b82f6', activeText: '#ffffff' },
  { value: 'completed', label: 'Done', bg: '#f5f5f4', text: '#525252', activeBg: '#059669', activeText: '#ffffff' },
] as const;

const PRIORITIES = [
  { value: 'low', label: 'Low', bg: '#f5f5f4', text: '#a3a3a3', activeBg: '#eff6ff', activeText: '#2563eb' },
  { value: 'medium', label: 'Medium', bg: '#f5f5f4', text: '#a3a3a3', activeBg: '#fef3c7', activeText: '#d97706' },
  { value: 'high', label: 'High', bg: '#f5f5f4', text: '#a3a3a3', activeBg: '#fee2e2', activeText: '#ef4444' },
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
    assignedTo?: string[];
    createdAt?: string;
    updatedAt?: string;
  };
  clientName?: string;
  projectName?: string;
  visible: boolean;
  onClose: () => void;
}

// ── Component ────────────────────────────────────────────────

export default function TaskDetailSheet({ task, clientName, projectName, visible, onClose }: TaskDetailSheetProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description ?? '');
  const [editNotes, setEditNotes] = useState(task.notes ?? '');
  const [editDueDate, setEditDueDate] = useState(task.dueDate ?? '');
  const [editPriority, setEditPriority] = useState(task.priority ?? 'medium');
  const [currentStatus, setCurrentStatus] = useState(task.status);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateTask = useMutation(api.tasks.update);
  const removeTask = useMutation(api.tasks.remove);
  const allUsers = useQuery(api.users.getAll, {});

  const assigneeNames = task.assignedTo
    ? task.assignedTo.map((id) => {
        const u = allUsers?.find((u) => u._id === id);
        return u?.name || u?.email || 'Unknown';
      })
    : [];

  // ── Handlers ──────────────────────────────────────────────

  const handleStatusChange = useCallback(async (newStatus: string) => {
    setCurrentStatus(newStatus);
    try {
      await updateTask({ id: task._id, status: newStatus } as any);
    } catch (e: any) {
      setCurrentStatus(task.status); // revert
      Alert.alert('Error', e.message ?? 'Failed to update status');
    }
  }, [task._id, task.status, updateTask]);

  const handlePause = useCallback(async () => {
    const newStatus = currentStatus === 'paused' ? 'todo' : 'paused';
    setCurrentStatus(newStatus);
    try {
      await updateTask({ id: task._id, status: newStatus } as any);
    } catch (e: any) {
      setCurrentStatus(task.status);
      Alert.alert('Error', e.message ?? 'Failed to update status');
    }
  }, [task._id, task.status, currentStatus, updateTask]);

  const startEditing = useCallback(() => {
    setEditTitle(task.title);
    setEditDescription(task.description ?? '');
    setEditNotes(task.notes ?? '');
    setEditDueDate(task.dueDate ?? '');
    setEditPriority(task.priority ?? 'medium');
    setIsEditing(true);
  }, [task]);

  const handleSave = useCallback(async () => {
    if (!editTitle.trim()) {
      Alert.alert('Error', 'Title is required');
      return;
    }
    setSaving(true);
    try {
      const updates: any = {
        id: task._id,
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        priority: editPriority,
        notes: editNotes.trim() || undefined,
      };
      if (editDueDate.trim()) {
        const parsed = new Date(editDueDate.trim());
        if (!isNaN(parsed.getTime())) {
          updates.dueDate = parsed.toISOString();
        }
      } else if (task.dueDate) {
        updates.dueDate = null;
      }
      await updateTask(updates);
      setIsEditing(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save task');
    } finally {
      setSaving(false);
    }
  }, [task._id, task.dueDate, editTitle, editDescription, editNotes, editDueDate, editPriority, updateTask]);

  const handleDelete = useCallback(async () => {
    try {
      await removeTask({ id: task._id } as any);
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to delete task');
    }
  }, [task._id, removeTask, onClose]);

  const confirmDelete = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  // ── Format helpers ────────────────────────────────────────

  const formatDate = (iso?: string): string => {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const formatTimestamp = (iso?: string): string => {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const isPaused = currentStatus === 'paused';

  // ── Structured fields ─────────────────────────────────────

  const fields = [
    { label: 'Client', value: clientName || '\u2014', icon: <Briefcase size={13} color={colors.textTertiary} /> },
    { label: 'Project', value: projectName || '\u2014', icon: <FolderOpen size={13} color={colors.textTertiary} /> },
    { label: 'Due', value: formatDate(task.dueDate), icon: <Calendar size={13} color={colors.textTertiary} /> },
    {
      label: 'Priority',
      value: task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : 'Medium',
      icon: <Flag size={13} color={colors.textTertiary} />,
    },
    { label: 'Assigned', value: assigneeNames.length > 0 ? assigneeNames.join(', ') : '\u2014', icon: <User2 size={13} color={colors.textTertiary} /> },
    { label: 'Created', value: formatTimestamp(task.createdAt), icon: <Clock size={13} color={colors.textTertiary} /> },
  ];

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
          <Text className="text-base font-semibold text-m-text-primary">Task Details</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

          {/* Title */}
          {isEditing ? (
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Task title"
              placeholderTextColor={colors.textPlaceholder}
              className="text-lg font-bold text-m-text-primary bg-m-bg-card border border-m-border rounded-xl px-3 py-3 mb-3"
            />
          ) : (
            <Text className="text-lg font-bold text-m-text-primary mb-3">{task.title}</Text>
          )}

          {/* Status buttons */}
          <View className="flex-row gap-2 mb-2">
            {STATUS_OPTIONS.map((opt) => {
              const isActive = currentStatus === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => handleStatusChange(opt.value)}
                  className="rounded-full px-4 py-2"
                  style={{
                    backgroundColor: isActive ? opt.activeBg : opt.bg,
                    borderWidth: isActive ? 2 : 1,
                    borderColor: isActive ? opt.activeBg : colors.border,
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: isActive ? opt.activeText : opt.text }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Action row */}
          <View className="flex-row gap-2 mb-4">
            <TouchableOpacity
              onPress={handlePause}
              className="flex-row items-center gap-1.5 rounded-lg px-3 py-2"
              style={{
                backgroundColor: isPaused ? '#fef3c7' : colors.bgSubtle,
                borderWidth: 1,
                borderColor: isPaused ? '#fbbf24' : colors.border,
              }}
            >
              <Pause size={13} color={isPaused ? '#d97706' : colors.textSecondary} />
              <Text className="text-xs font-medium" style={{ color: isPaused ? '#d97706' : colors.textSecondary }}>
                Pause
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={isEditing ? handleSave : startEditing}
              disabled={isEditing && saving}
              className="flex-row items-center gap-1.5 rounded-lg px-3 py-2"
              style={{
                backgroundColor: isEditing ? '#dbeafe' : colors.bgSubtle,
                borderWidth: 1,
                borderColor: isEditing ? '#3b82f6' : colors.border,
                opacity: saving ? 0.5 : 1,
              }}
            >
              {isEditing ? (
                <Check size={13} color="#3b82f6" />
              ) : (
                <Pencil size={13} color={colors.textSecondary} />
              )}
              <Text className="text-xs font-medium" style={{ color: isEditing ? '#3b82f6' : colors.textSecondary }}>
                {isEditing ? (saving ? 'Saving...' : 'Save') : 'Edit'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={confirmDelete}
              className="flex-row items-center gap-1.5 rounded-lg px-3 py-2"
              style={{
                backgroundColor: colors.bgSubtle,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Trash2 size={13} color={colors.error} />
              <Text className="text-xs font-medium" style={{ color: colors.error }}>Delete</Text>
            </TouchableOpacity>
          </View>

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <View className="rounded-xl p-3 mb-4" style={{ backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }}>
              <Text className="text-xs mb-2" style={{ color: '#b91c1c' }}>Delete this task? This can't be undone.</Text>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={handleDelete}
                  className="rounded-lg px-3 py-1.5"
                  style={{ backgroundColor: '#dc2626' }}
                >
                  <Text className="text-xs font-medium text-white">Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowDeleteConfirm(false)}
                  className="rounded-lg px-3 py-1.5 bg-white"
                  style={{ borderWidth: 1, borderColor: colors.border }}
                >
                  <Text className="text-xs font-medium text-m-text-primary">Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Structured fields */}
          <View className="border-t border-m-border pt-3 mb-4">
            {fields.map((field) => (
              <View key={field.label} className="flex-row items-center justify-between py-2.5">
                <View className="flex-row items-center gap-2">
                  {field.icon}
                  <Text className="text-xs font-medium text-m-text-tertiary">{field.label}</Text>
                </View>
                <Text className="text-xs font-semibold text-m-text-primary">{field.value}</Text>
              </View>
            ))}
          </View>

          {/* Due date editor (edit mode) */}
          {isEditing && (
            <>
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Due Date</Text>
              <View className="flex-row items-center bg-m-bg-card border border-m-border rounded-xl px-3 py-3 mb-4">
                <Calendar size={16} color={colors.textTertiary} />
                <TextInput
                  value={editDueDate ? (() => {
                    const d = new Date(editDueDate);
                    return isNaN(d.getTime()) ? editDueDate : d.toISOString().split('T')[0];
                  })() : ''}
                  onChangeText={setEditDueDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textPlaceholder}
                  className="flex-1 ml-2 text-sm text-m-text-primary"
                />
              </View>

              {/* Priority editor (edit mode) */}
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Priority</Text>
              <View className="flex-row gap-2 mb-4">
                {PRIORITIES.map((p) => {
                  const isSelected = editPriority === p.value;
                  return (
                    <TouchableOpacity
                      key={p.value}
                      onPress={() => setEditPriority(p.value)}
                      className="rounded-full px-4 py-2"
                      style={{
                        backgroundColor: isSelected ? p.activeBg : p.bg,
                        borderWidth: 1,
                        borderColor: isSelected ? p.activeText : colors.border,
                      }}
                    >
                      <Text
                        className="text-xs font-medium"
                        style={{ color: isSelected ? p.activeText : p.text }}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Description */}
          {(task.description || isEditing) && (
            <View className="mb-4">
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Description</Text>
              {isEditing ? (
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Add a description..."
                  placeholderTextColor={colors.textPlaceholder}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  className="bg-m-bg-card border border-m-border rounded-xl px-3 py-3 text-sm text-m-text-primary"
                  style={{ minHeight: 72 }}
                />
              ) : (
                <Text className="text-sm text-m-text-secondary leading-relaxed">{task.description}</Text>
              )}
            </View>
          )}

          {/* Notes */}
          <View className="mb-4">
            <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Notes</Text>
            {isEditing ? (
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Add notes..."
                placeholderTextColor={colors.textPlaceholder}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                className="bg-m-bg-subtle border border-m-border rounded-xl px-3 py-3 text-sm text-m-text-primary"
                style={{ minHeight: 80 }}
              />
            ) : (
              <View className="bg-m-bg-subtle border border-m-border rounded-xl px-3 py-2.5" style={{ minHeight: 40 }}>
                <Text className="text-xs text-m-text-secondary">{task.notes || 'No notes yet'}</Text>
              </View>
            )}
          </View>

          {/* Timestamps */}
          {task.updatedAt && (
            <View className="border-t border-m-border pt-3">
              <View className="flex-row justify-between py-1">
                <Text className="text-[10px] text-m-text-tertiary">Updated</Text>
                <Text className="text-[10px] text-m-text-tertiary">{formatTimestamp(task.updatedAt)}</Text>
              </View>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
