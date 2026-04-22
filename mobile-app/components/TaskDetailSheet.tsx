import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../model-testing-app/convex/_generated/api';
import { X, Trash2, Calendar, Paperclip, FileText, Pencil } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import DocumentPicker, { type AttachedDoc } from '@/components/DocumentPicker';

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
    attachmentIds?: string[];
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
  const [attachmentIds, setAttachmentIds] = useState<string[]>(task.attachmentIds ?? []);
  const [showDocPicker, setShowDocPicker] = useState(false);
  // Tap-to-open defaults to view mode. Edit is opt-in via the header
  // Pencil button (or by tapping the same task again while in view).
  // Rationale: users reported that every tap from the homepage opened
  // a full edit form, which was one scroll away from being destructive
  // (Delete sits at the bottom). View-first keeps read traffic cheap.
  const [isEditMode, setIsEditMode] = useState(false);

  const { isAuthenticated } = useConvexAuth();
  // Resolve attachment names. We query a broad set and pick out the matching ones.
  const recentDocs = useQuery(
    api.documents.getRecent,
    isAuthenticated && attachmentIds.length > 0 ? { limit: 200 } : 'skip'
  );
  const attachedDocs: AttachedDoc[] = useMemo(() => {
    if (!recentDocs) return attachmentIds.map(id => ({ id, name: 'Loading…' }));
    const byId = new Map<string, any>();
    (recentDocs as any[]).forEach((d) => byId.set(d._id, d));
    return attachmentIds.map((id) => {
      const d = byId.get(id);
      return { id, name: d?.fileName || 'Document', fileType: d?.fileType };
    });
  }, [attachmentIds, recentDocs]);

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
        attachmentIds,
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
      // Snap back to view mode after a successful save so the user sees
      // their edits reflected in read-only form; they can close the sheet
      // manually (or tap Pencil again to continue editing).
      setIsEditMode(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save task');
    } finally {
      setSaving(false);
    }
  }, [task._id, title, description, status, priority, dueDate, notes, task.dueDate, updateTask, attachmentIds]);

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
        {/* Header — X always closes; right-side action swaps per mode:
            view mode shows a Pencil (promotes to edit), edit mode shows
            Trash (delete). Keeps the destructive action out of plain
            read traffic. */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border bg-m-bg-card">
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text className="text-base font-semibold text-m-text-primary">
            {isEditMode ? 'Edit Task' : 'Task'}
          </Text>
          {isEditMode ? (
            <TouchableOpacity onPress={handleDelete} hitSlop={8}>
              <Trash2 size={20} color={colors.error} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setIsEditMode(true)} hitSlop={8}>
              <Pencil size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

          {/* Title — big read-only headline in view mode, editable in edit mode. */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Title</Text>
          {isEditMode ? (
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Task title"
              placeholderTextColor={colors.textPlaceholder}
              className="bg-m-bg-card border border-m-border rounded-xl px-3 py-3 text-sm text-m-text-primary mb-4"
            />
          ) : (
            <Text className="text-lg font-semibold text-m-text-primary mb-4">
              {title || 'Untitled task'}
            </Text>
          )}

          {/* Description — hide the whole section in view mode when empty
              so the sheet doesn't look padded with placeholders. */}
          {isEditMode || description ? (
            <>
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Description</Text>
              {isEditMode ? (
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
              ) : (
                <Text className="text-sm text-m-text-secondary mb-4" style={{ lineHeight: 20 }}>
                  {description}
                </Text>
              )}
            </>
          ) : null}

          {/* Status — in view mode show only the active chip (non-interactive);
              in edit mode show the full selectable list. */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Status</Text>
          {isEditMode ? (
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
          ) : (
            <View className="flex-row mb-4">
              {(() => {
                const s = STATUSES.find((x) => x.value === status) ?? STATUSES[0];
                return (
                  <View
                    className="rounded-full px-4 py-2"
                    style={{ backgroundColor: s.bg, borderWidth: 1, borderColor: s.text }}
                  >
                    <Text className="text-xs font-medium" style={{ color: s.text }}>
                      {s.label}
                    </Text>
                  </View>
                );
              })()}
            </View>
          )}

          {/* Priority — same view/edit shape as Status. */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Priority</Text>
          {isEditMode ? (
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
          ) : (
            <View className="flex-row mb-4">
              {(() => {
                const p = PRIORITIES.find((x) => x.value === priority) ?? PRIORITIES[1];
                return (
                  <View
                    className="rounded-full px-4 py-2"
                    style={{ backgroundColor: p.bg, borderWidth: 1, borderColor: p.text }}
                  >
                    <Text className="text-xs font-medium" style={{ color: p.text }}>
                      {p.label}
                    </Text>
                  </View>
                );
              })()}
            </View>
          )}

          {/* Due Date — view shows formatted date or "No due date"; edit keeps
              the raw input with parse-on-blur behavior. */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Due Date</Text>
          {isEditMode ? (
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
          ) : (
            <View className="flex-row items-center bg-m-bg-subtle border border-m-border rounded-xl px-3 py-3 mb-4">
              <Calendar size={16} color={colors.textTertiary} />
              <Text className="flex-1 ml-2 text-sm text-m-text-secondary">
                {dueDate ? formatDisplayDate(dueDate) : 'No due date'}
              </Text>
            </View>
          )}

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

          {/* Notes — hide section entirely in view mode when empty, same
              principle as Description. */}
          {isEditMode || notes ? (
            <>
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Notes</Text>
              {isEditMode ? (
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Add notes..."
                  placeholderTextColor={colors.textPlaceholder}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  className="bg-m-bg-card border border-m-border rounded-xl px-3 py-3 text-sm text-m-text-primary mb-4"
                  style={{ minHeight: 96 }}
                />
              ) : (
                <Text className="text-sm text-m-text-secondary mb-4" style={{ lineHeight: 20 }}>
                  {notes}
                </Text>
              )}
            </>
          ) : null}

          {/* Attachments — list always readable; +Add / remove-X only in
              edit mode. Section hidden in view when empty. */}
          {isEditMode || attachedDocs.length > 0 ? (
            <>
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-1.5">
                  <Paperclip size={13} color={colors.textTertiary} />
                  <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider">Attachments</Text>
                  {attachedDocs.length > 0 && (
                    <Text className="text-xs text-m-text-tertiary">({attachedDocs.length})</Text>
                  )}
                </View>
                {isEditMode ? (
                  <TouchableOpacity onPress={() => setShowDocPicker(true)}>
                    <Text className="text-xs font-medium text-m-text-primary">
                      {attachedDocs.length === 0 ? '+ Add' : 'Manage'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {attachedDocs.length > 0 ? (
                <View className="gap-1.5 mb-6">
                  {attachedDocs.map((att) => (
                    <View key={att.id} className="flex-row items-center gap-2 bg-m-bg-card border border-m-border rounded-xl px-3 py-2.5">
                      <FileText size={14} color={colors.textSecondary} />
                      <Text className="text-sm text-m-text-primary flex-1" numberOfLines={1}>
                        {att.name}
                      </Text>
                      {isEditMode ? (
                        <TouchableOpacity
                          onPress={() => setAttachmentIds(attachmentIds.filter(i => i !== att.id))}
                          hitSlop={8}
                        >
                          <X size={13} color={colors.textTertiary} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <View className="bg-m-bg-subtle rounded-xl px-3 py-3 mb-6">
                  <Text className="text-xs text-m-text-tertiary text-center">No attachments</Text>
                </View>
              )}
            </>
          ) : null}

          {/* Footer actions — edit mode keeps the destructive pair; view
              mode surfaces a single Edit CTA so the Pencil isn't the
              only entry point. */}
          {isEditMode ? (
            <>
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
              <TouchableOpacity
                onPress={handleDelete}
                className="border border-red-200 rounded-xl py-3.5 items-center"
              >
                <Text className="text-sm font-medium" style={{ color: colors.error }}>Delete Task</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              onPress={() => setIsEditMode(true)}
              className="bg-m-bg-card border border-m-border rounded-xl py-3.5 flex-row items-center justify-center gap-2"
            >
              <Pencil size={14} color={colors.textPrimary} />
              <Text className="text-sm font-semibold text-m-text-primary">Edit Task</Text>
            </TouchableOpacity>
          )}

        </ScrollView>

        {/* Document picker */}
        <DocumentPicker
          visible={showDocPicker}
          onClose={() => setShowDocPicker(false)}
          selectedIds={attachmentIds}
          onChange={(docs) => setAttachmentIds(docs.map(d => d.id))}
          contextClientId={task.clientId}
          contextProjectId={task.projectId}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}
