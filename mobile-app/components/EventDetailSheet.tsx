import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Alert,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../model-testing-app/convex/_generated/api';
import {
  X, Calendar, Clock, MapPin, Trash2, Users, FileText, Plus, ExternalLink,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface EventDetailSheetProps {
  event: {
    _id: string;
    title: string;
    description?: string;
    location?: string;
    startTime: string;
    endTime: string;
    allDay?: boolean;
    attendees?: { email?: string; name?: string; responseStatus?: string }[];
    googleEventId?: string;
    googleCalendarUrl?: string;
    syncStatus?: string;
    metadata?: any;
  };
  visible: boolean;
  onClose: () => void;
  onCreateTaskFromEvent?: (event: any) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function EventDetailSheet({ event, visible, onClose, onCreateTaskFromEvent }: EventDetailSheetProps) {
  const isGoogleSynced = !!event.googleEventId || event.syncStatus === 'synced';
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? '');
  const [location, setLocation] = useState(event.location ?? '');
  const [notes, setNotes] = useState((event.metadata as any)?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const updateEvent = useMutation(api.events.update);
  const removeEvent = useMutation(api.events.remove);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updates: any = { id: event._id };
      // For Google-synced events, only allow notes to be saved (in metadata)
      if (isGoogleSynced) {
        updates.metadata = { ...(event.metadata || {}), notes: notes.trim() || undefined };
      } else {
        updates.title = title.trim();
        updates.description = description.trim() || undefined;
        updates.location = location.trim() || undefined;
        updates.metadata = { ...(event.metadata || {}), notes: notes.trim() || undefined };
      }
      await updateEvent(updates);
      setEditing(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save event');
    } finally {
      setSaving(false);
    }
  }, [event._id, event.metadata, isGoogleSynced, title, description, location, notes, updateEvent]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete event?', `Remove "${event.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await removeEvent({ id: event._id as any });
            onClose();
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Failed to delete event');
          }
        },
      },
    ]);
  }, [event._id, event.title, removeEvent, onClose]);

  const openGoogleCalendar = useCallback(() => {
    if (event.googleCalendarUrl) {
      Linking.openURL(event.googleCalendarUrl).catch(() => {});
    }
  }, [event.googleCalendarUrl]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: colors.bg }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border bg-m-bg-card">
          <TouchableOpacity onPress={onClose} hitSlop={8}><X size={20} color={colors.textSecondary} /></TouchableOpacity>
          <Text className="text-base font-semibold text-m-text-primary">Event</Text>
          <View style={{ width: 20 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Title */}
          <View className="flex-row items-start mb-3">
            <View className="w-7 h-7 rounded-full bg-indigo-100 items-center justify-center mr-3 mt-0.5">
              <Calendar size={14} color="#6366f1" />
            </View>
            <View className="flex-1">
              {isGoogleSynced && (
                <View className="flex-row items-center gap-1.5 mb-1.5">
                  <View className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <Text className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Google</Text>
                </View>
              )}
              {editing && !isGoogleSynced ? (
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Event title"
                  className="text-lg font-semibold text-m-text-primary"
                  placeholderTextColor={colors.textPlaceholder}
                />
              ) : (
                <Text className="text-lg font-semibold text-m-text-primary">{event.title}</Text>
              )}
            </View>
          </View>

          {/* Date / time */}
          <View className="flex-row items-center gap-2 mb-2 ml-10">
            <Clock size={13} color={colors.textTertiary} />
            <Text className="text-sm text-m-text-secondary">
              {formatDate(event.startTime)} · {formatTime(event.startTime)} – {formatTime(event.endTime)}
            </Text>
          </View>

          {/* Location */}
          {(event.location || editing) && (
            <View className="flex-row items-start gap-2 mb-3 ml-10">
              <MapPin size={13} color={colors.textTertiary} style={{ marginTop: 3 }} />
              {editing && !isGoogleSynced ? (
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Add location..."
                  className="flex-1 text-sm text-m-text-primary"
                  placeholderTextColor={colors.textPlaceholder}
                />
              ) : (
                <Text className="text-sm text-m-text-secondary flex-1">{event.location || '—'}</Text>
              )}
            </View>
          )}

          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <View className="flex-row items-start gap-2 mb-3 ml-10">
              <Users size={13} color={colors.textTertiary} style={{ marginTop: 3 }} />
              <View className="flex-1">
                {event.attendees.slice(0, 5).map((a, i) => (
                  <Text key={i} className="text-sm text-m-text-secondary" numberOfLines={1}>
                    {a.name || a.email}
                  </Text>
                ))}
                {event.attendees.length > 5 && (
                  <Text className="text-xs text-m-text-tertiary">+ {event.attendees.length - 5} more</Text>
                )}
              </View>
            </View>
          )}

          {/* Description */}
          {(event.description || (editing && !isGoogleSynced)) && (
            <View className="mt-3">
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-1.5">Description</Text>
              {editing && !isGoogleSynced ? (
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Add description..."
                  multiline
                  className="bg-m-bg-card border border-m-border rounded-xl px-3 py-3 text-sm text-m-text-primary"
                  placeholderTextColor={colors.textPlaceholder}
                  style={{ minHeight: 72 }}
                  textAlignVertical="top"
                />
              ) : (
                <Text className="text-sm text-m-text-secondary leading-5">{event.description}</Text>
              )}
            </View>
          )}

          {/* Notes (always editable) */}
          <View className="mt-4">
            <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-1.5">Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Add notes..."
              multiline
              onFocus={() => setEditing(true)}
              className="bg-m-bg-card border border-m-border rounded-xl px-3 py-3 text-sm text-m-text-primary"
              placeholderTextColor={colors.textPlaceholder}
              style={{ minHeight: 72 }}
              textAlignVertical="top"
            />
          </View>

          {/* Actions */}
          <Text className="text-[11px] font-semibold text-m-text-tertiary uppercase tracking-wide mt-6 mb-2">Actions</Text>

          {onCreateTaskFromEvent && (
            <TouchableOpacity
              onPress={() => { onCreateTaskFromEvent(event); onClose(); }}
              className="flex-row items-center gap-3 px-3 py-3 bg-m-bg-card border border-m-border rounded-xl mb-2"
            >
              <Plus size={16} color={colors.textPrimary} />
              <Text className="text-sm text-m-text-primary">Create Task from This</Text>
            </TouchableOpacity>
          )}

          {isGoogleSynced && event.googleCalendarUrl && (
            <TouchableOpacity
              onPress={openGoogleCalendar}
              className="flex-row items-center gap-3 px-3 py-3 bg-m-bg-card border border-m-border rounded-xl mb-2"
            >
              <ExternalLink size={16} color={colors.textPrimary} />
              <Text className="text-sm text-m-text-primary">Open in Google Calendar</Text>
            </TouchableOpacity>
          )}

          {/* Save / Delete */}
          <View className="mt-6 gap-2">
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className="bg-m-bg-brand rounded-xl py-3.5 items-center"
              style={{ opacity: saving ? 0.5 : 1 }}
            >
              <Text className="text-m-text-on-brand text-sm font-semibold">
                {saving ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>

            {!isGoogleSynced && (
              <TouchableOpacity
                onPress={handleDelete}
                className="border border-red-200 rounded-xl py-3.5 items-center flex-row justify-center gap-2"
              >
                <Trash2 size={14} color={colors.error} />
                <Text className="text-sm font-medium" style={{ color: colors.error }}>Delete Event</Text>
              </TouchableOpacity>
            )}
          </View>

          {isGoogleSynced && (
            <Text className="text-xs text-m-text-tertiary text-center mt-4">
              Google events can only be edited in Google Calendar. You can add notes here.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
