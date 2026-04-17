import {
  Modal, View, Text, TouchableOpacity, ScrollView, TextInput,
  Linking, Alert, Platform, KeyboardAvoidingView, ActivityIndicator,
  Clipboard,
} from 'react-native';
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import {
  X, Phone, Mail, Copy, Pencil, Trash2, Building,
  Check, CheckSquare, Calendar, Circle, CheckCircle2, Clock,
  AlertTriangle, MapPin, Users,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';
import ContactAvatar from './ContactAvatar';
import TaskCreationFlow from '@/components/TaskCreationFlow';

// ---------------------------------------------------------------------------
// ContactDetailModal — full-screen contact detail with quick actions.
//
// Actions row (top):
//   - Call (tel: link, if phone set)
//   - Email (mailto: link, if email set)
//   - Copy (contact info to clipboard)
//   - Task (opens TaskCreationFlow prefilled with contact name + client)
//   - Meeting (opens TaskCreationFlow in meeting mode with contact as attendee)
//
// Edit mode lets you update all fields inline. Delete has a confirm step.
// ---------------------------------------------------------------------------

interface Props {
  visible: boolean;
  contactId: string | null;
  onClose: () => void;
}

export default function ContactDetailModal({ visible, contactId, onClose }: Props) {
  const { isAuthenticated } = useConvexAuth();

  const contact = useQuery(
    api.contacts.get,
    isAuthenticated && contactId ? { id: contactId as any } : 'skip',
  );
  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');

  // Resolve linked companies (HubSpot association) — only query if the
  // contact actually has linkedCompanyIds. Falls back to the legacy
  // `contact.company` string when no association is linked.
  const linkedCompanies = useQuery(
    api.companies.listByIds,
    isAuthenticated && contact?.linkedCompanyIds?.length
      ? { ids: contact.linkedCompanyIds as any }
      : 'skip',
  );
  const companyName =
    (contact as any)?.company || (linkedCompanies?.[0]?.name ?? null);

  // Related records — tasks and meetings that reference this contact via
  // their contactIds field. Guarded by isAuthenticated + contactId so we
  // don't fire queries when the modal is closed.
  const relatedTasks = useQuery(
    api.tasks.getByContact,
    isAuthenticated && contactId ? { contactId: contactId as any } : 'skip',
  );
  const relatedEvents = useQuery(
    api.events.getByContact,
    isAuthenticated && contactId ? { contactId: contactId as any } : 'skip',
  );

  const updateContact = useMutation(api.contacts.update);
  const removeContact = useMutation(api.contacts.remove);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editClientId, setEditClientId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Action flows
  const [showTaskCreate, setShowTaskCreate] = useState(false);
  const [showMeetingCreate, setShowMeetingCreate] = useState(false);

  // Sync edit state when a new contact loads (esp. when reopening a different contact)
  useEffect(() => {
    if (contact && !editing) {
      setEditName(contact.name || '');
      setEditEmail(contact.email || '');
      setEditPhone(contact.phone || '');
      setEditRole(contact.role || '');
      setEditNotes(contact.notes || '');
      setEditClientId(contact.clientId || '');
    }
  }, [contact, editing]);

  const clientName = useMemo(() => {
    if (!contact?.clientId) return null;
    return (clients || []).find((c: any) => c._id === contact.clientId)?.name ?? null;
  }, [contact, clients]);

  if (!visible || !contactId) return null;

  const handleSaveEdit = async () => {
    if (!editName.trim() || !contact) return;
    setSaving(true);
    try {
      await updateContact({
        id: contact._id,
        name: editName.trim(),
        email: editEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
        role: editRole.trim() || undefined,
        notes: editNotes.trim() || undefined,
        clientId: editClientId ? (editClientId as any) : null,
      });
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!contact) return;
    Alert.alert(
      'Delete contact?',
      `${contact.name} will be removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeContact({ id: contact._id });
              onClose();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Could not delete');
            }
          },
        },
      ],
    );
  };

  const handleCopy = async () => {
    if (!contact) return;
    const lines: string[] = [contact.name];
    if (contact.role) lines.push(contact.role);
    if (contact.email) lines.push(contact.email);
    if (contact.phone) lines.push(contact.phone);
    if (clientName) lines.push(clientName);
    try {
      // Clipboard is deprecated in favor of @react-native-clipboard/clipboard
      // but the core API still works for the simple string case and avoids
      // adding a new native dep just for copy support.
      Clipboard.setString(lines.join('\n'));
      Alert.alert('Copied', 'Contact info copied to clipboard');
    } catch {
      Alert.alert('Copy failed', 'Could not access clipboard');
    }
  };

  const handleCall = () => {
    if (!contact?.phone) return;
    Linking.openURL(`tel:${contact.phone}`).catch(() => {
      Alert.alert('Cannot place call', 'No phone app available on this device');
    });
  };

  const handleEmail = () => {
    if (!contact?.email) return;
    Linking.openURL(`mailto:${contact.email}`).catch(() => {
      Alert.alert('Cannot open email', 'No mail app available on this device');
    });
  };

  const handleCancelEdit = () => {
    // Reset edit state to last-saved contact
    if (contact) {
      setEditName(contact.name || '');
      setEditEmail(contact.email || '');
      setEditPhone(contact.phone || '');
      setEditRole(contact.role || '');
      setEditNotes(contact.notes || '');
      setEditClientId(contact.clientId || '');
    }
    setEditing(false);
  };

  // Loading + not-found guards
  if (contact === undefined) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View className="flex-1 bg-m-bg items-center justify-center">
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      </Modal>
    );
  }

  if (contact === null) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View className="flex-1 bg-m-bg">
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border bg-m-bg-card">
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text className="text-base font-semibold text-m-text-primary">Contact</Text>
            <View style={{ width: 20 }} />
          </View>
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-sm text-m-text-tertiary text-center">
              Contact not found — it may have been deleted.
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-m-bg">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border bg-m-bg-card">
          <TouchableOpacity onPress={editing ? handleCancelEdit : onClose} hitSlop={8}>
            {editing ? (
              <Text className="text-sm text-m-text-secondary">Cancel</Text>
            ) : (
              <X size={20} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
          <Text className="text-base font-semibold text-m-text-primary">
            {editing ? 'Edit Contact' : 'Contact'}
          </Text>
          {editing ? (
            <TouchableOpacity
              onPress={handleSaveEdit}
              disabled={!editName.trim() || saving}
              hitSlop={8}
              style={{ opacity: !editName.trim() || saving ? 0.4 : 1 }}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <Text className="text-sm font-semibold text-m-text-primary">Save</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setEditing(true)} hitSlop={8}>
              <Pencil size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Identity hero */}
            <View className="items-center mb-5">
              <ContactAvatar name={contact.name} size={72} />
              {editing ? (
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  className="text-xl font-bold text-m-text-primary mt-3 text-center"
                  placeholder="Name"
                  placeholderTextColor={colors.textPlaceholder}
                />
              ) : (
                <Text
                  className="text-xl font-bold text-m-text-primary mt-3 text-center"
                  style={{ letterSpacing: -0.3 }}
                >
                  {contact.name}
                </Text>
              )}
              {!editing && contact.role ? (
                <Text className="text-sm text-m-text-secondary mt-0.5">
                  {contact.role}
                </Text>
              ) : null}
              {!editing && clientName ? (
                <View className="flex-row items-center gap-1 mt-1">
                  <Building size={12} color={colors.accent} />
                  <Text className="text-xs text-m-accent">{clientName}</Text>
                </View>
              ) : null}
            </View>

            {/* Quick actions (only when not editing) */}
            {!editing && (
              <View className="flex-row gap-2 mb-5">
                <QuickAction
                  icon={<Phone size={16} color={contact.phone ? colors.accent : colors.textTertiary} />}
                  label="Call"
                  disabled={!contact.phone}
                  onPress={handleCall}
                />
                <QuickAction
                  icon={<Mail size={16} color={contact.email ? colors.accent : colors.textTertiary} />}
                  label="Email"
                  disabled={!contact.email}
                  onPress={handleEmail}
                />
                <QuickAction
                  icon={<Copy size={16} color={colors.accent} />}
                  label="Copy"
                  onPress={handleCopy}
                />
                <QuickAction
                  icon={<CheckSquare size={16} color={colors.accent} />}
                  label="Task"
                  onPress={() => setShowTaskCreate(true)}
                />
                <QuickAction
                  icon={<Calendar size={16} color={colors.accent} />}
                  label="Meeting"
                  onPress={() => setShowMeetingCreate(true)}
                />
              </View>
            )}

            {/* Structured fields */}
            <View className="bg-m-bg-card border border-m-border rounded-[12px] overflow-hidden mb-4">
              <FieldRow
                label="Phone"
                value={editing ? editPhone : contact.phone || '—'}
                editing={editing}
                onChangeText={setEditPhone}
                placeholder="+44 7700 900000"
                keyboardType="phone-pad"
                linkPrefix={contact.phone ? 'tel:' : undefined}
              />
              <FieldRow
                label="Email"
                value={editing ? editEmail : contact.email || '—'}
                editing={editing}
                onChangeText={setEditEmail}
                placeholder="email@example.com"
                keyboardType="email-address"
                linkPrefix={contact.email ? 'mailto:' : undefined}
              />
              <FieldRow
                label="Role"
                value={editing ? editRole : contact.role || '—'}
                editing={editing}
                onChangeText={setEditRole}
                placeholder="e.g. Solicitor, Broker"
                isLast={!editing && !companyName}
              />
              {!editing && companyName ? (
                <View
                  className="px-3 py-2.5 flex-row items-center justify-between"
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: colors.borderSubtle,
                  }}
                >
                  <Text className="text-[11px] text-m-text-tertiary uppercase tracking-wide">
                    Company
                  </Text>
                  <Text
                    className="text-sm font-medium text-m-text-primary text-right"
                    style={{ flex: 1, marginLeft: 12 }}
                    numberOfLines={1}
                  >
                    {companyName}
                  </Text>
                </View>
              ) : null}
              {editing && (
                <ClientRow
                  label="Client"
                  clientId={editClientId}
                  clients={clients || []}
                  onChange={setEditClientId}
                  isLast
                />
              )}
              {!editing && clientName ? (
                <View className="flex-row items-center justify-between px-3 py-2.5 border-t border-m-border-subtle">
                  <Text className="text-[11px] text-m-text-tertiary uppercase tracking-wide">
                    Client
                  </Text>
                  <Text className="text-sm font-medium text-m-text-primary" numberOfLines={1}>
                    {clientName}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Notes */}
            <View className="mb-4">
              <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide mb-1.5">
                Notes
              </Text>
              {editing ? (
                <TextInput
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="Add notes..."
                  placeholderTextColor={colors.textPlaceholder}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  className="text-sm text-m-text-primary bg-m-bg-subtle border border-m-border rounded-[10px] px-3 py-2.5"
                  style={{ minHeight: 90 }}
                />
              ) : (
                <View className="bg-m-bg-card border border-m-border rounded-[10px] p-3">
                  <Text
                    className="text-sm leading-5"
                    style={{
                      color: contact.notes ? colors.textSecondary : colors.textTertiary,
                      fontStyle: contact.notes ? 'normal' : 'italic',
                    }}
                  >
                    {contact.notes || 'No notes yet'}
                  </Text>
                </View>
              )}
            </View>

            {/* Related Tasks — only shown when not editing, keeps edit mode focused */}
            {!editing && relatedTasks && relatedTasks.length > 0 && (
              <View className="mt-5">
                <View className="flex-row items-center gap-1.5 mb-2">
                  <CheckSquare size={13} color={colors.textSecondary} />
                  <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide">
                    Related Tasks ({relatedTasks.length})
                  </Text>
                </View>
                <View className="bg-m-bg-card border border-m-border rounded-[12px] overflow-hidden">
                  {relatedTasks.slice(0, 5).map((task: any, idx: number) => (
                    <View key={task._id}>
                      {idx > 0 && <View className="h-px bg-m-border-subtle" />}
                      <RelatedTaskRow task={task} />
                    </View>
                  ))}
                </View>
                {relatedTasks.length > 5 ? (
                  <Text className="text-xs text-m-text-tertiary mt-1.5">
                    +{relatedTasks.length - 5} more — view in Tasks
                  </Text>
                ) : null}
              </View>
            )}

            {/* Related Meetings — events linked via contactIds */}
            {!editing && relatedEvents && relatedEvents.length > 0 && (
              <View className="mt-5">
                <View className="flex-row items-center gap-1.5 mb-2">
                  <Calendar size={13} color={colors.textSecondary} />
                  <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide">
                    Related Meetings ({relatedEvents.length})
                  </Text>
                </View>
                <View className="bg-m-bg-card border border-m-border rounded-[12px] overflow-hidden">
                  {relatedEvents.slice(0, 5).map((event: any, idx: number) => (
                    <View key={event._id}>
                      {idx > 0 && <View className="h-px bg-m-border-subtle" />}
                      <RelatedMeetingRow event={event} />
                    </View>
                  ))}
                </View>
                {relatedEvents.length > 5 ? (
                  <Text className="text-xs text-m-text-tertiary mt-1.5">
                    +{relatedEvents.length - 5} more — view in Calendar
                  </Text>
                ) : null}
              </View>
            )}

            {/* Empty-state hint when neither exists */}
            {!editing &&
              relatedTasks !== undefined &&
              relatedEvents !== undefined &&
              relatedTasks.length === 0 &&
              relatedEvents.length === 0 && (
                <View className="mt-5 py-4 items-center">
                  <Users size={18} color={colors.textTertiary} />
                  <Text className="text-xs text-m-text-tertiary mt-1.5 text-center">
                    No tasks or meetings yet.
                  </Text>
                  <Text className="text-[11px] text-m-text-tertiary mt-0.5 text-center">
                    Tap Task or Meeting above to start one.
                  </Text>
                </View>
              )}

            {/* Delete (edit mode only) */}
            {editing && (
              <TouchableOpacity
                onPress={handleDelete}
                className="flex-row items-center justify-center gap-1.5 py-3 rounded-[10px] bg-m-bg-card border border-m-border mt-2"
              >
                <Trash2 size={14} color={colors.error} />
                <Text className="text-sm font-medium" style={{ color: colors.error }}>
                  Delete Contact
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Create task prefilled with this contact */}
        <TaskCreationFlow
          visible={showTaskCreate}
          onClose={() => setShowTaskCreate(false)}
          initialMode="task"
          prefilledTitle={`Follow up with ${contact.name}`}
          prefilledDescription={
            [
              contact.role && `Role: ${contact.role}`,
              contact.email && `Email: ${contact.email}`,
              contact.phone && `Phone: ${contact.phone}`,
            ]
              .filter(Boolean)
              .join('\n') || undefined
          }
          prefilledClientId={contact.clientId ?? undefined}
          // Link the task to this contact so it surfaces in the "Related Tasks"
          // section next time someone opens this contact's detail.
          prefilledContactIds={[contact._id as unknown as string]}
        />

        {/* Create meeting with this contact as attendee */}
        <TaskCreationFlow
          visible={showMeetingCreate}
          onClose={() => setShowMeetingCreate(false)}
          initialMode="meeting"
          prefilledTitle={`Meeting with ${contact.name}`}
          prefilledClientId={contact.clientId ?? undefined}
          // attendeeOptions in TaskCreationFlow keys contacts by their Convex _id,
          // which is exactly what contact._id is — so this pre-selects the contact
          // in the attendees picker AND links the event via contactIds.
          prefilledAttendeeIds={[contact._id as unknown as string]}
          prefilledContactIds={[contact._id as unknown as string]}
        />
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function QuickAction({
  icon, label, onPress, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className="flex-1 items-center justify-center rounded-[10px] py-2.5"
      style={{
        backgroundColor: colors.bgSubtle,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: disabled ? 0.4 : 1,
        gap: 4,
      }}
    >
      {icon}
      <Text
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: disabled ? colors.textTertiary : colors.textPrimary }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function FieldRow({
  label, value, editing, onChangeText, placeholder, keyboardType, linkPrefix, isLast,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  linkPrefix?: 'tel:' | 'mailto:';
  isLast?: boolean;
}) {
  const hasLink = !editing && linkPrefix && value !== '—';
  return (
    <View
      className="px-3 py-2.5 flex-row items-center justify-between"
      style={{
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.borderSubtle,
      }}
    >
      <Text className="text-[11px] text-m-text-tertiary uppercase tracking-wide">
        {label}
      </Text>
      {editing ? (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textPlaceholder}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
          autoCorrect={keyboardType !== 'email-address'}
          className="text-sm text-m-text-primary text-right"
          style={{ flex: 1, marginLeft: 12, paddingVertical: 0 }}
        />
      ) : hasLink ? (
        <TouchableOpacity
          onPress={() => Linking.openURL(`${linkPrefix}${value}`).catch(() => {})}
          style={{ flex: 1, marginLeft: 12 }}
        >
          <Text
            className="text-sm font-medium text-m-accent text-right"
            numberOfLines={1}
          >
            {value}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text
          className="text-sm font-medium text-m-text-primary text-right"
          style={{ flex: 1, marginLeft: 12 }}
          numberOfLines={1}
        >
          {value}
        </Text>
      )}
    </View>
  );
}

function ClientRow({
  label, clientId, clients, onChange, isLast,
}: {
  label: string;
  clientId: string;
  clients: any[];
  onChange: (id: string) => void;
  isLast?: boolean;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const selectedName = clientId
    ? clients.find((c) => c._id === clientId)?.name
    : null;

  return (
    <>
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        className="px-3 py-2.5 flex-row items-center justify-between"
        style={{
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: colors.borderSubtle,
        }}
      >
        <Text className="text-[11px] text-m-text-tertiary uppercase tracking-wide">
          {label}
        </Text>
        <View className="flex-row items-center gap-1" style={{ flex: 1, marginLeft: 12, justifyContent: 'flex-end' }}>
          <Text
            className="text-sm"
            style={{
              color: selectedName ? colors.textPrimary : colors.textTertiary,
            }}
            numberOfLines={1}
          >
            {selectedName || 'No client'}
          </Text>
          <Text className="text-m-text-tertiary text-sm">›</Text>
        </View>
      </TouchableOpacity>

      {/* Inline picker — mirrors ContactCreateModal's picker */}
      {showPicker && (
        <Modal
          visible
          animationType="slide"
          presentationStyle="formSheet"
          onRequestClose={() => setShowPicker(false)}
        >
          <View className="flex-1 bg-m-bg">
            <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border">
              <Text className="text-base font-semibold text-m-text-primary">
                Select Client
              </Text>
              <TouchableOpacity onPress={() => setShowPicker(false)} hitSlop={8}>
                <X size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity
                onPress={() => {
                  onChange('');
                  setShowPicker(false);
                }}
                className="flex-row items-center justify-between px-4 py-3 border-b border-m-border-subtle"
              >
                <Text className="text-sm italic" style={{ color: colors.textSecondary }}>
                  No client
                </Text>
                {!clientId && <Check size={14} color={colors.accent} />}
              </TouchableOpacity>
              {[...clients]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <TouchableOpacity
                    key={c._id}
                    onPress={() => {
                      onChange(c._id);
                      setShowPicker(false);
                    }}
                    className="flex-row items-center gap-3 px-4 py-3 border-b border-m-border-subtle"
                    style={{
                      backgroundColor:
                        c._id === clientId ? colors.bgSubtle : 'transparent',
                    }}
                  >
                    <Building size={14} color={colors.textTertiary} />
                    <Text
                      className="flex-1 text-sm text-m-text-primary"
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    {c._id === clientId && <Check size={14} color={colors.accent} />}
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Related Task row — compact read-only snapshot shown inside the contact detail.
// Mirrors the visual vocabulary of TaskItem on the tasks screen but stripped
// down for display: status dot, title, priority/due-date metadata row.
// ---------------------------------------------------------------------------

function RelatedTaskRow({ task }: { task: any }) {
  const isCompleted = task.status === 'completed';
  const isOverdue =
    task.dueDate && !isCompleted && new Date(task.dueDate) < new Date();

  return (
    <View className="flex-row items-start gap-2.5 px-3 py-2.5">
      <View style={{ marginTop: 2 }}>
        {isCompleted ? (
          <CheckCircle2 size={14} color={colors.success} />
        ) : (
          <Circle size={14} color={colors.border} />
        )}
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className="text-sm"
          numberOfLines={1}
          style={{
            color: isCompleted ? colors.textTertiary : colors.textPrimary,
            textDecorationLine: isCompleted ? 'line-through' : 'none',
          }}
        >
          {task.title}
        </Text>
        <View className="flex-row items-center gap-2 mt-0.5">
          {task.priority && (
            <View
              className="rounded-[5px] px-1 py-0.5"
              style={{
                backgroundColor:
                  task.priority === 'high'
                    ? '#fef2f2'
                    : task.priority === 'medium'
                    ? '#fef3c7'
                    : '#f0fdf4',
              }}
            >
              <Text
                className="text-[9px] font-semibold capitalize"
                style={{
                  color:
                    task.priority === 'high'
                      ? '#b91c1c'
                      : task.priority === 'medium'
                      ? '#92400e'
                      : '#166534',
                }}
              >
                {task.priority}
              </Text>
            </View>
          )}
          {task.dueDate && (
            <View className="flex-row items-center gap-0.5">
              <Clock
                size={9}
                color={isOverdue ? colors.error : colors.textTertiary}
              />
              <Text
                className="text-[10px]"
                style={{
                  color: isOverdue ? colors.error : colors.textTertiary,
                }}
              >
                {new Date(task.dueDate).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                })}
              </Text>
              {isOverdue ? (
                <AlertTriangle size={9} color={colors.error} style={{ marginLeft: 2 }} />
              ) : null}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Related Meeting row — shows event title + start time + location.
// Uses Intl date formatter with a "Today"/"Tomorrow" fallback so near-future
// meetings read at a glance. Past events use the full "5 Mar" format.
// ---------------------------------------------------------------------------

function RelatedMeetingRow({ event }: { event: any }) {
  const start = new Date(event.startTime);
  const now = new Date();
  const isToday = start.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = start.toDateString() === tomorrow.toDateString();
  const isPast = start.getTime() < now.getTime();

  const dateLabel = isToday
    ? 'Today'
    : isTomorrow
    ? 'Tomorrow'
    : start.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year:
          start.getFullYear() === now.getFullYear() ? undefined : 'numeric',
      });

  const timeLabel = event.allDay
    ? 'All day'
    : start.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });

  return (
    <View className="flex-row items-start gap-2.5 px-3 py-2.5">
      <View
        className="rounded-[6px] items-center justify-center"
        style={{
          width: 28,
          height: 28,
          backgroundColor: isPast ? colors.bgInset : '#dbeafe',
          marginTop: 1,
        }}
      >
        <Calendar
          size={13}
          color={isPast ? colors.textTertiary : '#1d4ed8'}
        />
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className="text-sm text-m-text-primary"
          numberOfLines={1}
          style={{ opacity: isPast ? 0.6 : 1 }}
        >
          {event.title}
        </Text>
        <View className="flex-row items-center gap-1 mt-0.5">
          <Text className="text-[11px] font-medium text-m-text-tertiary">
            {dateLabel} · {timeLabel}
          </Text>
          {event.location ? (
            <View className="flex-row items-center gap-0.5 ml-2">
              <MapPin size={9} color={colors.textTertiary} />
              <Text
                className="text-[11px] text-m-text-tertiary"
                numberOfLines={1}
              >
                {event.location}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
