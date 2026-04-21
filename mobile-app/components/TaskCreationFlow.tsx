import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { useUser } from '@clerk/clerk-expo';
import { api } from '../../model-testing-app/convex/_generated/api';
import {
  X, Sparkles, ArrowUp, Calendar, Building, FolderOpen, User, Flag, Users, Paperclip, FileText,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';
import DateTimePicker from '@/components/DateTimePicker';
import PeoplePicker, { type PersonOption } from '@/components/PeoplePicker';
import DocumentPicker, { type AttachedDoc } from '@/components/DocumentPicker';
import { resolveApiBase } from '@/lib/apiBase';

const PARSE_API_URL = `${resolveApiBase()}/api/mobile/tasks/parse`;

interface TaskCreationFlowProps {
  visible: boolean;
  onClose: () => void;
  initialMode?: 'task' | 'meeting';
  prefilledTitle?: string;
  prefilledDate?: string;
  // New: allow callers to launch the flow with a link/participant
  // already in place. Useful for "Create task about {contact}" and
  // "Schedule meeting with {contact}" from the contact detail sheet.
  prefilledDescription?: string;
  prefilledClientId?: string;
  prefilledProjectId?: string;
  // For meetings: attendee IDs from the combined (users + contacts) pool.
  prefilledAttendeeIds?: string[];
  // For tasks: assignee user IDs (overrides the default "current user" seed).
  prefilledAssigneeIds?: string[];
  // Contact-book entries to link to the task/event. Distinct from attendees:
  // attendees become email snapshots on the event for calendar sync, while
  // contactIds persist as live references so contact detail can query
  // "tasks/meetings involving this contact".
  prefilledContactIds?: string[];
}

type Step = 'intro' | 'manual' | 'creating';

export default function TaskCreationFlow({
  visible, onClose, initialMode = 'task', prefilledTitle, prefilledDate,
  prefilledDescription, prefilledClientId, prefilledProjectId,
  prefilledAttendeeIds, prefilledAssigneeIds, prefilledContactIds,
}: TaskCreationFlowProps) {
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const [step, setStep] = useState<Step>('intro');
  const [mode, setMode] = useState<'task' | 'meeting'>(initialMode);
  const [aiInput, setAiInput] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Smart defaults: tasks default to end-of-today, meetings to next rounded hour
  const defaultTaskDate = useMemo(() => {
    if (prefilledDate) return prefilledDate;
    const d = new Date();
    d.setHours(17, 0, 0, 0); // 5pm today
    return d.toISOString();
  }, [prefilledDate]);
  const defaultMeetingStart = useMemo(() => {
    if (prefilledDate) return prefilledDate;
    const d = new Date();
    // Round up to the next hour
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.toISOString();
  }, [prefilledDate]);
  const defaultMeetingEnd = useMemo(() => {
    const d = new Date(defaultMeetingStart);
    d.setHours(d.getHours() + 1);
    return d.toISOString();
  }, [defaultMeetingStart]);

  // Manual form state
  const [title, setTitle] = useState(prefilledTitle ?? '');
  const [description, setDescription] = useState(prefilledDescription ?? '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState(defaultTaskDate);
  const [clientId, setClientId] = useState<string | null>(prefilledClientId ?? null);
  const [projectId, setProjectId] = useState<string | null>(prefilledProjectId ?? null);
  const [assignedToIds, setAssignedToIds] = useState<string[]>(
    prefilledAssigneeIds ?? [],
  );
  const [attachments, setAttachments] = useState<AttachedDoc[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  // Event-specific
  const [startTime, setStartTime] = useState(defaultMeetingStart);
  const [endTime, setEndTime] = useState(defaultMeetingEnd);
  const [location, setLocation] = useState('');
  const [attendeeIds, setAttendeeIds] = useState<string[]>(
    prefilledAttendeeIds ?? [],
  );

  // Load context for AI + pickers
  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const projects = useQuery(api.projects.list, isAuthenticated ? {} : 'skip');
  const users = useQuery(api.users.getAll, isAuthenticated ? {} : 'skip');
  const contacts = useQuery(api.contacts.getAll, isAuthenticated ? {} : 'skip');
  const currentUser = useQuery(api.users.getCurrent, isAuthenticated ? {} : 'skip');

  // Default assignee = current user (only on first load)
  const defaultAssigneeSet = useRef(false);
  useEffect(() => {
    if (currentUser && !defaultAssigneeSet.current && assignedToIds.length === 0) {
      defaultAssigneeSet.current = true;
      setAssignedToIds([(currentUser as any)._id]);
    }
  }, [currentUser, assignedToIds.length]);

  const createTask = useMutation(api.tasks.create);
  const createEvent = useMutation(api.events.create);

  const reset = () => {
    setStep('intro');
    setAiInput('');
    setAiError(null);
    setTitle(prefilledTitle ?? '');
    setDescription(prefilledDescription ?? '');
    setPriority('medium');
    setDueDate(defaultTaskDate);
    setClientId(prefilledClientId ?? null);
    setProjectId(prefilledProjectId ?? null);
    setAssignedToIds(
      prefilledAssigneeIds
        ?? (currentUser ? [(currentUser as any)._id] : []),
    );
    setAttachments([]);
    setStartTime(defaultMeetingStart);
    setEndTime(defaultMeetingEnd);
    setLocation('');
    setAttendeeIds(prefilledAttendeeIds ?? []);
  };

  const handleClose = () => { reset(); onClose(); };

  const filteredProjects = useMemo(
    () => (projects || []).filter((p: any) => !clientId || p.clientId === clientId),
    [projects, clientId]
  );

  // People option lists
  const userOptions: PersonOption[] = useMemo(
    () => (users || []).map((u: any) => ({
      id: u._id,
      name: u.name || u.email || 'User',
      email: u.email,
      source: 'user' as const,
    })),
    [users]
  );

  // For meeting attendees: combine users + contacts
  const attendeeOptions: PersonOption[] = useMemo(() => {
    const fromContacts = (contacts || []).map((c: any) => ({
      id: c._id,
      name: c.name || 'Contact',
      email: c.email,
      source: 'contact' as const,
    }));
    return [...userOptions, ...fromContacts];
  }, [userOptions, contacts]);

  const handleAISubmit = useCallback(async () => {
    if (!aiInput.trim() || !currentUser) return;
    setAiThinking(true);
    setAiError(null);
    try {
      const res = await fetch(PARSE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: aiInput.trim() }],
          context: {
            userId: (currentUser as any)._id,
            userName: (currentUser as any).name || (currentUser as any).email,
            clients: (clients || []).map((c: any) => ({ id: c._id, name: c.name })),
            projects: (projects || []).map((p: any) => ({ id: p._id, name: p.name, clientId: p.clientId })),
            users: (users || []).map((u: any) => ({ id: u._id, name: u.name || u.email })),
            timeZone: 'Europe/London',
          },
          mode,
        }),
      });
      const data = await res.json();

      if (data.type === 'task' && data.task) {
        setTitle(data.task.title || '');
        setDescription(data.task.description || '');
        setPriority(data.task.priority || 'medium');
        setDueDate(data.task.dueDate || defaultTaskDate);
        setClientId(data.task.clientId || null);
        setProjectId(data.task.projectId || null);
        // AI may return assignedTo array — pre-fill, else keep current user
        if (Array.isArray(data.task.assignedTo) && data.task.assignedTo.length > 0) {
          setAssignedToIds(data.task.assignedTo);
        }
        setMode('task');
        setStep('manual');
      } else if (data.type === 'event' && data.event) {
        setTitle(data.event.title || '');
        setDescription(data.event.description || '');
        setStartTime(data.event.startTime || defaultMeetingStart);
        setEndTime(data.event.endTime || defaultMeetingEnd);
        setLocation(data.event.location || '');
        setClientId(data.event.clientId || null);
        setProjectId(data.event.projectId || null);
        if (Array.isArray(data.event.attendees) && data.event.attendees.length > 0) {
          setAttendeeIds(data.event.attendees);
        }
        setMode('meeting');
        setStep('manual');
      } else if (data.type === 'message') {
        // AI needs more info — show the question, keep input visible
        setAiError(data.content);
      } else if (data.error) {
        setAiError(data.error);
      } else {
        setAiError('Could not parse — try the manual flow');
      }
    } catch (err: any) {
      setAiError('AI unavailable: ' + (err?.message || 'unknown error'));
    } finally {
      setAiThinking(false);
    }
  }, [aiInput, currentUser, clients, projects, users, mode]);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) { Alert.alert('Title required'); return; }
    setStep('creating');

    // Derive the set of contact IDs to persist onto the task/event.
    // - Always include explicitly-prefilled contactIds (from contact detail).
    // - For meetings: union with any attendees that came from the contacts
    //   side of the attendee pool (`source: 'contact'`). Selecting a contact
    //   as an attendee implies a link.
    const contactIdsFromAttendees =
      mode === 'meeting'
        ? attendeeIds
            .map((id) => attendeeOptions.find((o) => o.id === id))
            .filter((o): o is PersonOption => Boolean(o))
            .filter((o) => o.source === 'contact')
            .map((o) => o.id)
        : [];
    const linkedContactIds = Array.from(
      new Set([...(prefilledContactIds ?? []), ...contactIdsFromAttendees]),
    );

    try {
      if (mode === 'task') {
        const args: any = {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
        };
        if (dueDate.trim()) {
          const d = new Date(dueDate);
          if (!isNaN(d.getTime())) args.dueDate = d.toISOString();
        }
        if (clientId) args.clientId = clientId;
        if (projectId) args.projectId = projectId;
        // assignedTo triggers notifications in convex/tasks.ts on anyone other than creator
        if (assignedToIds.length > 0) args.assignedTo = assignedToIds;
        if (attachments.length > 0) args.attachmentIds = attachments.map(a => a.id);
        if (linkedContactIds.length > 0) args.contactIds = linkedContactIds;
        await createTask(args);
      } else {
        const start = new Date(startTime);
        const end = endTime ? new Date(endTime) : new Date(start.getTime() + 60 * 60 * 1000);
        if (isNaN(start.getTime())) { Alert.alert('Invalid start time'); setStep('manual'); return; }
        const args: any = {
          title: title.trim(),
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        };
        if (clientId) args.clientId = clientId;
        if (projectId) args.projectId = projectId;
        // Map attendee IDs to the events.create attendees shape (email/name)
        if (attendeeIds.length > 0) {
          args.attendees = attendeeIds
            .map(id => attendeeOptions.find(o => o.id === id))
            .filter((o): o is PersonOption => Boolean(o))
            .map(o => ({ email: o.email, name: o.name, responseStatus: 'needsAction' as const }));
        }
        if (linkedContactIds.length > 0) args.contactIds = linkedContactIds;
        await createEvent(args);
      }
      handleClose();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create');
      setStep('manual');
    }
  }, [
    mode, title, description, priority, dueDate, startTime, endTime, location,
    clientId, projectId, attendeeIds, attendeeOptions, attachments,
    assignedToIds, prefilledContactIds, createTask, createEvent,
  ]);

  const clientName = useMemo(
    () => clients?.find((c: any) => c._id === clientId)?.name,
    [clients, clientId]
  );
  const projectName = useMemo(
    () => projects?.find((p: any) => p._id === projectId)?.name,
    [projects, projectId]
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border bg-m-bg-card">
          <TouchableOpacity onPress={handleClose} hitSlop={8}><X size={20} color={colors.textSecondary} /></TouchableOpacity>
          <Text className="text-base font-semibold text-m-text-primary">
            {mode === 'task' ? 'New Task' : 'New Meeting'}
          </Text>
          <View style={{ width: 20 }} />
        </View>

        {step === 'intro' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            {/* Sparkle hero */}
            <View className="items-center mt-4 mb-5">
              <View className="w-14 h-14 rounded-full bg-m-bg-inset items-center justify-center mb-3">
                <Sparkles size={20} color={colors.textPrimary} />
              </View>
              <Text className="text-lg font-semibold text-m-text-primary">What do you need to do?</Text>
              <Text className="text-sm text-m-text-tertiary text-center mt-1.5 px-2">
                Tell me what you need to do, when you need to do it, and who you need to do it with.
              </Text>
            </View>

            {/* Mode toggle */}
            <View className="flex-row bg-m-bg-card border border-m-border rounded-xl p-1 mb-4">
              {(['task', 'meeting'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setMode(m)}
                  className={`flex-1 py-2.5 items-center rounded-lg ${mode === m ? 'bg-white' : ''}`}
                  style={mode === m ? { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } } : undefined}
                >
                  <Text className={`text-sm font-medium ${mode === m ? 'text-m-text-primary' : 'text-m-text-tertiary'}`}>
                    {m === 'task' ? 'Task' : 'Meeting'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* AI input */}
            <View className="bg-m-bg-card border border-m-border rounded-xl px-3 py-2 flex-row items-center">
              <TextInput
                value={aiInput}
                onChangeText={(t) => { setAiInput(t); setAiError(null); }}
                placeholder={mode === 'task' ? 'Describe your task...' : 'Describe your meeting...'}
                placeholderTextColor={colors.textPlaceholder}
                onSubmitEditing={handleAISubmit}
                returnKeyType="send"
                className="flex-1 text-sm text-m-text-primary py-1"
              />
              <TouchableOpacity
                onPress={handleAISubmit}
                disabled={!aiInput.trim() || aiThinking}
                className="w-7 h-7 rounded-full bg-m-bg-brand items-center justify-center"
                style={{ opacity: !aiInput.trim() || aiThinking ? 0.4 : 1 }}
              >
                {aiThinking ? <ActivityIndicator size="small" color={colors.textOnBrand} /> : <ArrowUp size={14} color={colors.textOnBrand} />}
              </TouchableOpacity>
            </View>

            {aiError && (
              <Text className="text-xs text-m-text-secondary text-center mt-3">{aiError}</Text>
            )}

            <TouchableOpacity onPress={() => setStep('manual')} className="mt-4 items-center">
              <Text className="text-sm text-m-text-tertiary underline">Skip AI, create manually</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 'manual' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View className="bg-m-bg-card border border-m-border rounded-xl p-4">
              <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                {mode === 'task' ? 'New Task' : 'New Meeting'}
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Tap to set title"
                placeholderTextColor={colors.textTertiary}
                className="text-lg font-semibold text-m-text-primary mb-3"
              />

              {mode === 'task' ? (
                <FormRow icon={Calendar} label="Due date">
                  <DateTimePicker
                    value={dueDate}
                    onChange={setDueDate}
                    mode="datetime"
                    placeholder="Set date"
                  />
                </FormRow>
              ) : (
                <>
                  <FormRow icon={Calendar} label="Start">
                    <DateTimePicker
                      value={startTime}
                      onChange={(iso) => {
                        setStartTime(iso);
                        // Keep end time at least 15 min after start if it's earlier
                        if (endTime && new Date(endTime) <= new Date(iso)) {
                          const newEnd = new Date(iso);
                          newEnd.setHours(newEnd.getHours() + 1);
                          setEndTime(newEnd.toISOString());
                        }
                      }}
                      mode="datetime"
                      placeholder="Pick start"
                    />
                  </FormRow>
                  <FormRow icon={Calendar} label="End">
                    <DateTimePicker
                      value={endTime}
                      onChange={setEndTime}
                      mode="datetime"
                      minDate={startTime ? new Date(startTime) : undefined}
                      placeholder="Pick end"
                    />
                  </FormRow>
                  <FormRow icon={Building} label="Location">
                    <TextInput
                      value={location}
                      onChangeText={setLocation}
                      placeholder="Add location"
                      placeholderTextColor={colors.textPlaceholder}
                      className="text-sm text-m-text-primary text-right"
                    />
                  </FormRow>
                </>
              )}

              {mode === 'task' && (
                <View className="flex-row items-center justify-between py-3 border-b border-m-border-subtle">
                  <View className="flex-row items-center gap-2.5">
                    <Flag size={14} color={colors.textTertiary} />
                    <Text className="text-sm text-m-text-secondary">Priority</Text>
                  </View>
                  <View className="flex-row gap-1">
                    {(['low', 'medium', 'high'] as const).map((p) => (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setPriority(p)}
                        className={`px-2.5 py-1 rounded-full ${priority === p ? 'bg-m-bg-brand' : 'bg-m-bg-subtle'}`}
                      >
                        <Text className={`text-[11px] font-medium capitalize ${priority === p ? 'text-m-text-on-brand' : 'text-m-text-tertiary'}`}>
                          {p}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <FormRow icon={Building} label={clientName || 'Personal'}>
                <PickerInline
                  options={[{ id: '', name: 'Personal' }, ...((clients || []) as any[]).map((c: any) => ({ id: c._id, name: c.name }))]}
                  selectedId={clientId || ''}
                  onSelect={(id) => { setClientId(id || null); setProjectId(null); }}
                />
              </FormRow>

              {clientId && filteredProjects.length > 0 && (
                <FormRow icon={FolderOpen} label={projectName || '—'}>
                  <PickerInline
                    options={[{ id: '', name: '—' }, ...filteredProjects.map((p: any) => ({ id: p._id, name: p.name }))]}
                    selectedId={projectId || ''}
                    onSelect={(id) => setProjectId(id || null)}
                  />
                </FormRow>
              )}

              {mode === 'task' ? (
                <FormRow icon={User} label="Assigned to" last>
                  <PeoplePicker
                    options={userOptions}
                    selectedIds={assignedToIds}
                    onChange={setAssignedToIds}
                    title="Assign Task"
                    placeholder="No one"
                  />
                </FormRow>
              ) : (
                <FormRow icon={Users} label="Attendees" last>
                  <PeoplePicker
                    options={attendeeOptions}
                    selectedIds={attendeeIds}
                    onChange={setAttendeeIds}
                    title="Invite Attendees"
                    placeholder="No attendees"
                  />
                </FormRow>
              )}

              {/* Attachments (task mode only — events have their own schema) */}
              {mode === 'task' && (
                <View className="mt-3 pt-3 border-t border-m-border-subtle">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center gap-2">
                      <Paperclip size={14} color={colors.textTertiary} />
                      <Text className="text-sm text-m-text-secondary">Attachments</Text>
                      {attachments.length > 0 && (
                        <Text className="text-xs text-m-text-tertiary">({attachments.length})</Text>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => setShowDocPicker(true)}>
                      <Text className="text-xs font-medium text-m-text-primary">
                        {attachments.length === 0 ? '+ Add' : 'Manage'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {attachments.length > 0 && (
                    <View className="gap-1">
                      {attachments.map((att) => (
                        <View key={att.id} className="flex-row items-center gap-2 bg-m-bg-subtle rounded-lg px-2.5 py-2">
                          <FileText size={12} color={colors.textSecondary} />
                          <Text className="text-xs text-m-text-primary flex-1" numberOfLines={1}>
                            {att.name}
                          </Text>
                          <TouchableOpacity
                            onPress={() => setAttachments(attachments.filter(a => a.id !== att.id))}
                            hitSlop={6}
                          >
                            <X size={11} color={colors.textTertiary} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="+ Add description"
                placeholderTextColor={colors.textPlaceholder}
                multiline
                className="mt-3 px-3 py-2.5 bg-m-bg-subtle rounded-lg text-sm text-m-text-primary"
                style={{ minHeight: 60 }}
                textAlignVertical="top"
              />

              <View className="flex-row gap-2 mt-4">
                <TouchableOpacity
                  onPress={() => setStep('intro')}
                  className="flex-1 border border-m-border rounded-lg py-3 items-center"
                >
                  <Text className="text-sm font-medium text-m-text-primary">Back to AI</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCreate}
                  className="flex-1 bg-m-bg-brand rounded-lg py-3 items-center"
                >
                  <Text className="text-sm font-medium text-m-text-on-brand">
                    Create {mode === 'task' ? 'Task' : 'Meeting'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}

        {step === 'creating' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={colors.textPrimary} />
            <Text className="text-sm text-m-text-tertiary mt-3">Creating...</Text>
          </View>
        )}

        {/* Document picker — nested modal */}
        <DocumentPicker
          visible={showDocPicker}
          onClose={() => setShowDocPicker(false)}
          selectedIds={attachments.map(a => a.id)}
          onChange={setAttachments}
          contextClientId={clientId ?? undefined}
          contextProjectId={projectId ?? undefined}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function FormRow({
  icon: Icon, label, children, last,
}: { icon: any; label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View className={`flex-row items-center justify-between py-3 ${last ? '' : 'border-b border-m-border-subtle'}`}>
      <View className="flex-row items-center gap-2.5 flex-1">
        <Icon size={14} color={colors.textTertiary} />
        <Text className="text-sm text-m-text-secondary" numberOfLines={1}>{label}</Text>
      </View>
      <View className="flex-1 items-end">{children}</View>
    </View>
  );
}

function PickerInline({
  options, selectedId, onSelect,
}: { options: { id: string; name: string }[]; selectedId: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === selectedId);

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)}>
        <Text className="text-sm text-m-text-primary">{selected?.name || 'Select'}</Text>
      </TouchableOpacity>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border bg-m-bg-card">
            <TouchableOpacity onPress={() => setOpen(false)}><X size={20} color={colors.textSecondary} /></TouchableOpacity>
            <Text className="text-base font-semibold text-m-text-primary">Select</Text>
            <View style={{ width: 20 }} />
          </View>
          <ScrollView style={{ flex: 1 }}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.id || 'none'}
                onPress={() => { onSelect(opt.id); setOpen(false); }}
                className="px-4 py-3 border-b border-m-border-subtle"
              >
                <Text className={`text-sm ${opt.id === selectedId ? 'font-semibold text-m-text-primary' : 'text-m-text-secondary'}`}>
                  {opt.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
