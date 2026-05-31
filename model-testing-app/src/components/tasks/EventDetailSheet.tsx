'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, MapPin, Clock, Users, ExternalLink, Plus, FileText, Pencil, Trash2 } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Button, IconButton, Field, Input, Textarea, StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';

interface EventDetailSheetProps {
  event: any;
  isOpen: boolean;
  onClose: () => void;
  onCreateTaskFromEvent?: (eventTitle: string, eventDate: string, clientId?: string, projectId?: string) => void;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function formatDateTime(startTime: string, endTime: string, allDay?: boolean): string {
  if (allDay) {
    return new Date(startTime).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  const start = new Date(startTime);
  const end = new Date(endTime);
  const datePart = start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeFmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timeFmt(start)} – ${timeFmt(end)}`;
}

export default function EventDetailSheet({ event, isOpen, onClose, onCreateTaskFromEvent }: EventDetailSheetProps) {
  const colors = useColors();
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateEvent = useMutation(api.events.update);
  const deleteEvent = useMutation(api.events.remove);

  // Reset state when event changes
  useEffect(() => {
    if (event) {
      setNotes(event.metadata?.notes || '');
      setEditTitle(event.title || '');
      setEditLocation(event.location || '');
      setEditDescription(event.description || '');
      setIsEditing(false);
      setShowNotes(false);
      setShowDeleteConfirm(false);
    }
  }, [event?._id]);

  if (!isOpen || !event) return null;

  const isGoogleSynced = event.syncStatus === 'synced';
  const isLocal = !isGoogleSynced;

  const handleSaveNotes = async () => {
    await updateEvent({
      id: event._id,
      metadata: { ...(event.metadata || {}), notes },
    });
    setShowNotes(false);
  };

  const handleSaveEdits = async () => {
    setSaving(true);
    try {
      await updateEvent({
        id: event._id,
        title: editTitle,
        location: editLocation || undefined,
        description: editDescription || undefined,
      });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update event:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteEvent({ id: event._id });
      onClose();
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  };

  const handleCreateTask = () => {
    if (onCreateTaskFromEvent) {
      onCreateTaskFromEvent(
        `Follow up: ${event.title}`,
        event.startTime,
        event.clientId,
        event.projectId,
      );
    }
    onClose();
  };

  const detailRow = (icon: React.ReactNode, body: React.ReactNode, alignTop = false) => (
    <div className="flex gap-3" style={{ alignItems: alignTop ? 'flex-start' : 'center' }}>
      <span style={{ color: colors.text.muted, marginTop: alignTop ? 2 : 0, flexShrink: 0 }}>{icon}</span>
      {body}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 overflow-y-auto"
        style={{
          background: colors.bg.card,
          borderTop: `1px solid ${colors.border.default}`,
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
          maxHeight: '85vh',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center" style={{ paddingTop: 12, paddingBottom: 8 }}>
          <div style={{ width: 32, height: 4, borderRadius: 999, background: colors.border.mid }} />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between" style={{ padding: '0 16px 12px' }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Calendar size={16} color={colors.entityTypes.project} style={{ flexShrink: 0 }} />
              {isGoogleSynced && <StatusPill label="Google" tone={colors.accent.blue} />}
            </div>
            {isEditing ? (
              <div style={{ marginTop: 6 }}>
                <Input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} />
              </div>
            ) : (
              <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.text.primary, marginTop: 4 }}>{event.title}</h2>
            )}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>

        {/* Details */}
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {detailRow(
            <Clock size={16} />,
            <span style={{ fontSize: 14, color: colors.text.primary }}>{formatDateTime(event.startTime, event.endTime, event.allDay)}</span>
          )}

          {(event.location || isEditing) && detailRow(
            <MapPin size={16} />,
            isEditing ? (
              <div className="flex-1"><Input value={editLocation} onChange={e => setEditLocation(e.target.value)} placeholder="Location..." /></div>
            ) : (
              <span style={{ fontSize: 14, color: colors.text.primary }}>{event.location}</span>
            )
          )}

          {(event.description || isEditing) && detailRow(
            <FileText size={16} />,
            isEditing ? (
              <div className="flex-1"><Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Description..." rows={2} /></div>
            ) : (
              <span style={{ fontSize: 14, color: colors.text.secondary }}>{event.description}</span>
            ),
            true
          )}

          {event.attendees && event.attendees.length > 0 && detailRow(
            <Users size={16} />,
            <div style={{ fontSize: 14, color: colors.text.secondary }}>
              {event.attendees.map((a: any) => a.name || a.email).join(', ')}
            </div>,
            true
          )}

          {event.googleCalendarUrl && (
            <a
              href={event.googleCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
              style={{ fontSize: 13, color: colors.accent.blue, fontWeight: 500 }}
            >
              <ExternalLink size={14} />
              Open in Google Calendar
            </a>
          )}
        </div>

        {/* Edit/Save buttons for local events */}
        {isLocal && (
          <div style={{ padding: '0 16px 16px' }}>
            {isEditing ? (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setIsEditing(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Button>
                <Button variant="primary" onClick={handleSaveEdits} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setIsEditing(true)} style={{ flex: 1, justifyContent: 'center' }}>
                  <Pencil size={12} /> Edit
                </Button>
                <Button variant="secondary" onClick={() => setShowDeleteConfirm(true)} style={{ color: colors.accent.red }}>
                  <Trash2 size={14} />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ background: `${colors.accent.red}15`, border: `1px solid ${colors.accent.red}40`, borderRadius: 4, padding: 12 }}>
              <p style={{ fontSize: 13, color: colors.accent.red, fontWeight: 500, marginBottom: 8 }}>Delete this event?</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Button>
                <Button variant="danger" size="sm" onClick={handleDelete} style={{ flex: 1, justifyContent: 'center' }}>Delete</Button>
              </div>
            </div>
          </div>
        )}

        {/* Notes area */}
        {showNotes && (
          <div style={{ padding: '0 16px 16px' }}>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add personal notes about this event..."
              rows={3}
            />
            <div className="flex gap-2" style={{ marginTop: 8 }}>
              <Button variant="secondary" onClick={() => setShowNotes(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Button>
              <Button variant="primary" onClick={handleSaveNotes} style={{ flex: 1, justifyContent: 'center' }}>Save</Button>
            </div>
          </div>
        )}

        {/* Google-synced event actions */}
        {isGoogleSynced && (
          <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500, marginBottom: 4 }}>
              Actions
            </div>
            <button
              onClick={() => setShowNotes(true)}
              className="flex items-center gap-2 w-full"
              style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: colors.text.primary, background: colors.bg.cardAlt, border: `1px solid ${colors.border.default}`, borderRadius: 4, cursor: 'pointer' }}
            >
              <FileText size={14} color={colors.text.muted} />
              Add Notes
            </button>
            <button
              onClick={handleCreateTask}
              className="flex items-center gap-2 w-full"
              style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: colors.text.primary, background: colors.bg.cardAlt, border: `1px solid ${colors.border.default}`, borderRadius: 4, cursor: 'pointer' }}
            >
              <Plus size={14} color={colors.text.muted} />
              Create Task from This
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
