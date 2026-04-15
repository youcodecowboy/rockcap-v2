'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, MapPin, Clock, Users, ExternalLink, Plus, FileText, Pencil, Trash2 } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';

interface EventDetailSheetProps {
  event: any;
  isOpen: boolean;
  onClose: () => void;
  onCreateTaskFromEvent?: (eventTitle: string, eventDate: string, clientId?: string, projectId?: string) => void;
}

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

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg-card)] rounded-t-2xl max-h-[85vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-8 h-1 bg-[var(--m-border)] rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-4 pb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              {isGoogleSynced && (
                <span className="text-[10px] font-semibold text-[#4285F4] bg-blue-50 px-1.5 py-0.5 rounded">Google</span>
              )}
            </div>
            {isEditing ? (
              <input
                autoFocus
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="w-full text-[18px] font-semibold text-[var(--m-text-primary)] bg-transparent border-b border-[var(--m-accent)] outline-none mt-1 pb-1"
              />
            ) : (
              <h2 className="text-[18px] font-semibold text-[var(--m-text-primary)] mt-1">{event.title}</h2>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-[var(--m-text-tertiary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Details */}
        <div className="px-4 space-y-3 pb-4">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            <span className="text-[14px] text-[var(--m-text-primary)]">
              {formatDateTime(event.startTime, event.endTime, event.allDay)}
            </span>
          </div>

          {(event.location || isEditing) && (
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              {isEditing ? (
                <input
                  value={editLocation}
                  onChange={e => setEditLocation(e.target.value)}
                  placeholder="Location..."
                  className="flex-1 text-[14px] text-[var(--m-text-primary)] bg-transparent border-b border-[var(--m-border)] outline-none pb-0.5"
                />
              ) : (
                <span className="text-[14px] text-[var(--m-text-primary)]">{event.location}</span>
              )}
            </div>
          )}

          {(event.description || isEditing) && (
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 text-[var(--m-text-tertiary)] mt-0.5" />
              {isEditing ? (
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  placeholder="Description..."
                  rows={2}
                  className="flex-1 text-[14px] text-[var(--m-text-primary)] bg-transparent border border-[var(--m-border)] rounded-lg px-2 py-1 outline-none resize-none"
                />
              ) : (
                <span className="text-[14px] text-[var(--m-text-secondary)]">{event.description}</span>
              )}
            </div>
          )}

          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-start gap-3">
              <Users className="w-4 h-4 text-[var(--m-text-tertiary)] mt-0.5" />
              <div className="text-[14px] text-[var(--m-text-secondary)]">
                {event.attendees.map((a: any) => a.name || a.email).join(', ')}
              </div>
            </div>
          )}

          {event.googleCalendarUrl && (
            <a
              href={event.googleCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[13px] text-[#4285F4] font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in Google Calendar
            </a>
          )}
        </div>

        {/* Edit/Save buttons for local events */}
        {isLocal && (
          <div className="px-4 pb-4">
            {isEditing ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2 text-[13px] font-medium text-[var(--m-text-secondary)] border border-[var(--m-border)] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdits}
                  disabled={saving}
                  className="flex-1 py-2 text-[13px] font-medium text-[var(--m-text-on-brand)] bg-[var(--m-bg-brand)] rounded-lg disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-medium text-[var(--m-text-primary)] border border-[var(--m-border)] rounded-lg active:bg-[var(--m-bg-subtle)]"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="py-2 px-4 text-[13px] font-medium text-[var(--m-error)] border border-red-200 rounded-lg active:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="px-4 pb-4">
            <div className="bg-red-50 rounded-lg px-3 py-3">
              <p className="text-[13px] text-red-700 font-medium mb-2">Delete this event?</p>
              <div className="flex gap-2">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-1.5 text-[12px] text-[var(--m-text-secondary)] border border-[var(--m-border)] rounded-lg bg-white">Cancel</button>
                <button onClick={handleDelete} className="flex-1 py-1.5 text-[12px] text-white bg-[var(--m-error)] rounded-lg">Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* Notes area */}
        {showNotes && (
          <div className="px-4 pb-4">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add personal notes about this event..."
              rows={3}
              className="w-full text-[14px] text-[var(--m-text-primary)] border border-[var(--m-border)] rounded-lg px-3 py-2 resize-none bg-transparent outline-none"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={() => setShowNotes(false)} className="flex-1 py-2 text-[13px] text-[var(--m-text-secondary)] border border-[var(--m-border)] rounded-lg">Cancel</button>
              <button onClick={handleSaveNotes} className="flex-1 py-2 text-[13px] text-[var(--m-text-on-brand)] bg-[var(--m-bg-brand)] rounded-lg">Save</button>
            </div>
          </div>
        )}

        {/* Google-synced event actions */}
        {isGoogleSynced && (
          <div className="px-4 pb-6 space-y-2">
            <div className="text-[11px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-[0.05em] mb-1">Actions</div>
            <button
              onClick={() => setShowNotes(true)}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-[13px] font-medium text-[var(--m-text-primary)] bg-[var(--m-bg-subtle)] rounded-lg active:bg-[var(--m-bg-inset)]"
            >
              <FileText className="w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
              Add Notes
            </button>
            <button
              onClick={handleCreateTask}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-[13px] font-medium text-[var(--m-text-primary)] bg-[var(--m-bg-subtle)] rounded-lg active:bg-[var(--m-bg-inset)]"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
              Create Task from This
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
