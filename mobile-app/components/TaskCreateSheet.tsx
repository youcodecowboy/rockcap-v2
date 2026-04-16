import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../model-testing-app/convex/_generated/api';
import { X, Calendar, ChevronDown, Search } from 'lucide-react-native';
import { colors } from '@/lib/theme';

// ── Constants ────────────────────────────────────────────────

const PRIORITIES = [
  { value: 'low', label: 'Low', bg: '#eff6ff', text: '#2563eb', inactiveBg: '#f5f5f4', inactiveText: '#a3a3a3' },
  { value: 'medium', label: 'Medium', bg: '#fef3c7', text: '#d97706', inactiveBg: '#f5f5f4', inactiveText: '#a3a3a3' },
  { value: 'high', label: 'High', bg: '#fee2e2', text: '#ef4444', inactiveBg: '#f5f5f4', inactiveText: '#a3a3a3' },
] as const;

// ── Types ────────────────────────────────────────────────────

interface TaskCreateSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreated?: (taskId: string) => void;
  initialClientId?: string;
  initialProjectId?: string;
}

// ── Component ────────────────────────────────────────────────

export default function TaskCreateSheet({ visible, onClose, onCreated, initialClientId, initialProjectId }: TaskCreateSheetProps) {
  const { isAuthenticated } = useConvexAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<string>('medium');
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(initialClientId);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(initialProjectId);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const projects = useQuery(api.projects.list, isAuthenticated ? {} : 'skip');
  const createTask = useMutation(api.tasks.create);

  const filteredClients = useMemo(() => {
    if (!clients) return [];
    if (!clientSearch.trim()) return clients.slice(0, 20);
    const q = clientSearch.toLowerCase();
    return clients.filter((c) => {
      const name = (c.name ?? c.company ?? '').toLowerCase();
      return name.includes(q);
    }).slice(0, 20);
  }, [clients, clientSearch]);

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    let filtered = projects;
    if (selectedClientId) {
      filtered = filtered.filter((p: any) => {
        const roles = p.clientRoles ?? [];
        return roles.some((r: any) => r.clientId === selectedClientId);
      });
    }
    if (projectSearch.trim()) {
      const q = projectSearch.toLowerCase();
      filtered = filtered.filter((p: any) => {
        const name = ((p as any).name ?? (p as any).address ?? '').toLowerCase();
        return name.includes(q);
      });
    }
    return filtered.slice(0, 20);
  }, [projects, selectedClientId, projectSearch]);

  const selectedClientName = useMemo(() => {
    if (!selectedClientId || !clients) return undefined;
    const c = clients.find((c) => c._id === selectedClientId);
    return c?.name ?? c?.company;
  }, [clients, selectedClientId]);

  const selectedProjectName = useMemo(() => {
    if (!selectedProjectId || !projects) return undefined;
    const p = projects.find((p) => p._id === selectedProjectId);
    return (p as any)?.name ?? (p as any)?.address;
  }, [projects, selectedProjectId]);

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setDueDate('');
    setPriority('medium');
    setSelectedClientId(initialClientId);
    setSelectedProjectId(initialProjectId);
    setShowClientPicker(false);
    setShowProjectPicker(false);
    setClientSearch('');
    setProjectSearch('');
  }, [initialClientId, initialProjectId]);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Title is required');
      return;
    }
    setCreating(true);
    try {
      const payload: any = {
        title: title.trim(),
        priority,
      };
      if (description.trim()) payload.description = description.trim();
      if (dueDate.trim()) {
        const parsed = new Date(dueDate.trim());
        if (!isNaN(parsed.getTime())) {
          payload.dueDate = parsed.toISOString();
        }
      }
      if (selectedClientId) payload.clientId = selectedClientId;
      if (selectedProjectId) payload.projectId = selectedProjectId;

      const taskId = await createTask(payload);
      resetForm();
      onCreated?.(String(taskId));
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to create task');
    } finally {
      setCreating(false);
    }
  }, [title, description, dueDate, priority, selectedClientId, selectedProjectId, createTask, resetForm, onCreated, onClose]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-m-bg">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border bg-m-bg-card">
          <TouchableOpacity onPress={handleClose} hitSlop={8}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text className="text-base font-semibold text-m-text-primary">New Task</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

          {/* Title */}
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What needs to be done?"
            placeholderTextColor={colors.textPlaceholder}
            autoFocus
            className="text-lg font-bold text-m-text-primary bg-m-bg-card border border-m-border rounded-xl px-4 py-3.5 mb-4"
          />

          {/* Description */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Add details..."
            placeholderTextColor={colors.textPlaceholder}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            className="bg-m-bg-card border border-m-border rounded-xl px-3 py-3 text-sm text-m-text-primary mb-4"
            style={{ minHeight: 72 }}
          />

          {/* Priority */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Priority</Text>
          <View className="flex-row gap-2 mb-4">
            {PRIORITIES.map((p) => {
              const isSelected = priority === p.value;
              return (
                <TouchableOpacity
                  key={p.value}
                  onPress={() => setPriority(p.value)}
                  className="flex-1 rounded-xl py-2.5 items-center"
                  style={{
                    backgroundColor: isSelected ? p.bg : p.inactiveBg,
                    borderWidth: 1,
                    borderColor: isSelected ? p.text : colors.border,
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: isSelected ? p.text : p.inactiveText }}
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
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textPlaceholder}
              className="flex-1 ml-2 text-sm text-m-text-primary"
            />
          </View>

          {/* Client picker */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Client</Text>
          <TouchableOpacity
            onPress={() => { setShowClientPicker(!showClientPicker); setShowProjectPicker(false); }}
            className="flex-row items-center justify-between bg-m-bg-card border border-m-border rounded-xl px-3 py-3 mb-1"
          >
            <Text className={`text-sm ${selectedClientName ? 'text-m-text-primary font-medium' : 'text-m-text-placeholder'}`}>
              {selectedClientName ?? 'Select client (optional)'}
            </Text>
            <ChevronDown size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          {selectedClientId && (
            <TouchableOpacity onPress={() => { setSelectedClientId(undefined); setSelectedProjectId(undefined); }} className="mb-2">
              <Text className="text-xs text-m-text-tertiary">Clear client</Text>
            </TouchableOpacity>
          )}
          {showClientPicker && (
            <View className="bg-m-bg-card border border-m-border rounded-xl mb-4 overflow-hidden" style={{ maxHeight: 200 }}>
              <View className="flex-row items-center px-3 py-2 border-b border-m-border">
                <Search size={14} color={colors.textTertiary} />
                <TextInput
                  value={clientSearch}
                  onChangeText={setClientSearch}
                  placeholder="Search clients..."
                  placeholderTextColor={colors.textPlaceholder}
                  className="flex-1 ml-2 text-sm text-m-text-primary"
                  autoFocus
                />
              </View>
              <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled">
                {filteredClients.map((c) => (
                  <TouchableOpacity
                    key={c._id}
                    onPress={() => {
                      setSelectedClientId(c._id);
                      setSelectedProjectId(undefined);
                      setShowClientPicker(false);
                      setClientSearch('');
                    }}
                    className="px-3 py-2.5 border-b border-m-border"
                    style={selectedClientId === c._id ? { backgroundColor: colors.bgSubtle } : undefined}
                  >
                    <Text className="text-sm text-m-text-primary">{c.name ?? c.company}</Text>
                  </TouchableOpacity>
                ))}
                {filteredClients.length === 0 && (
                  <View className="px-3 py-3">
                    <Text className="text-xs text-m-text-tertiary text-center">No clients found</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
          {!showClientPicker && <View className="mb-3" />}

          {/* Project picker */}
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wider mb-1.5">Project</Text>
          <TouchableOpacity
            onPress={() => { setShowProjectPicker(!showProjectPicker); setShowClientPicker(false); }}
            className="flex-row items-center justify-between bg-m-bg-card border border-m-border rounded-xl px-3 py-3 mb-1"
          >
            <Text className={`text-sm ${selectedProjectName ? 'text-m-text-primary font-medium' : 'text-m-text-placeholder'}`}>
              {selectedProjectName ?? 'Select project (optional)'}
            </Text>
            <ChevronDown size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          {selectedProjectId && (
            <TouchableOpacity onPress={() => setSelectedProjectId(undefined)} className="mb-2">
              <Text className="text-xs text-m-text-tertiary">Clear project</Text>
            </TouchableOpacity>
          )}
          {showProjectPicker && (
            <View className="bg-m-bg-card border border-m-border rounded-xl mb-4 overflow-hidden" style={{ maxHeight: 200 }}>
              <View className="flex-row items-center px-3 py-2 border-b border-m-border">
                <Search size={14} color={colors.textTertiary} />
                <TextInput
                  value={projectSearch}
                  onChangeText={setProjectSearch}
                  placeholder="Search projects..."
                  placeholderTextColor={colors.textPlaceholder}
                  className="flex-1 ml-2 text-sm text-m-text-primary"
                  autoFocus
                />
              </View>
              <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled">
                {filteredProjects.map((p: any) => (
                  <TouchableOpacity
                    key={p._id}
                    onPress={() => {
                      setSelectedProjectId(p._id);
                      setShowProjectPicker(false);
                      setProjectSearch('');
                    }}
                    className="px-3 py-2.5 border-b border-m-border"
                    style={selectedProjectId === p._id ? { backgroundColor: colors.bgSubtle } : undefined}
                  >
                    <Text className="text-sm text-m-text-primary">{p.name ?? p.address}</Text>
                  </TouchableOpacity>
                ))}
                {filteredProjects.length === 0 && (
                  <View className="px-3 py-3">
                    <Text className="text-xs text-m-text-tertiary text-center">
                      {selectedClientId ? 'No projects for this client' : 'No projects found'}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
          {!showProjectPicker && <View className="mb-4" />}

          {/* Create button */}
          <TouchableOpacity
            onPress={handleCreate}
            disabled={creating || !title.trim()}
            className="bg-m-accent rounded-xl py-3.5 items-center"
            style={{ opacity: creating || !title.trim() ? 0.4 : 1 }}
          >
            <Text className="text-m-text-on-brand text-sm font-semibold">
              {creating ? 'Creating...' : 'Create Task'}
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
