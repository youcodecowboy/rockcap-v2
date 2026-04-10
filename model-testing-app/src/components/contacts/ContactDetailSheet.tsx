'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { X, Phone, Mail, Copy, Pencil, Trash2 } from 'lucide-react';

interface ContactDetailSheetProps {
  contactId: Id<'contacts'> | null;
  isOpen: boolean;
  onClose: () => void;
  variant: 'sheet' | 'panel';
}

const avatarColors = [
  { bg: 'bg-blue-50', text: 'text-blue-700' },
  { bg: 'bg-green-50', text: 'text-green-700' },
  { bg: 'bg-amber-50', text: 'text-amber-700' },
  { bg: 'bg-purple-50', text: 'text-purple-700' },
  { bg: 'bg-rose-50', text: 'text-rose-700' },
  { bg: 'bg-cyan-50', text: 'text-cyan-700' },
  { bg: 'bg-orange-50', text: 'text-orange-700' },
  { bg: 'bg-teal-50', text: 'text-teal-700' },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export default function ContactDetailSheet({ contactId, isOpen, onClose, variant }: ContactDetailSheetProps) {
  const contact = useQuery(api.contacts.get, contactId ? { id: contactId } : 'skip');
  const updateContact = useMutation(api.contacts.update);
  const removeContact = useMutation(api.contacts.remove);
  const clients = useQuery(api.clients.list, {});

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editClientId, setEditClientId] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!contact || !isOpen) {
    if (variant === 'panel') {
      return (
        <div className="flex items-center justify-center h-full text-sm text-gray-400">
          Select a contact to view details
        </div>
      );
    }
    return null;
  }

  const clientName = contact.clientId ? clients?.find(c => c._id === contact.clientId)?.name : undefined;
  const initials = getInitials(contact.name);
  const avatarColor = getAvatarColor(contact.name);

  const handleDelete = async () => {
    await removeContact({ id: contact._id });
    onClose();
  };

  const startEditing = () => {
    setEditName(contact.name);
    setEditEmail(contact.email || '');
    setEditPhone(contact.phone || '');
    setEditRole(contact.role || '');
    setEditNotes(contact.notes || '');
    setEditClientId(contact.clientId || '');
    setIsEditing(true);
  };

  const saveEdit = async () => {
    await updateContact({
      id: contact._id,
      name: editName || undefined,
      email: editEmail || undefined,
      phone: editPhone || undefined,
      role: editRole || undefined,
      notes: editNotes || undefined,
      clientId: editClientId ? editClientId as Id<'clients'> : null,
    });
    setIsEditing(false);
  };

  const copyContactInfo = () => {
    const lines = [contact.name];
    if (contact.role) lines.push(contact.role);
    if (contact.email) lines.push(contact.email);
    if (contact.phone) lines.push(contact.phone);
    if (clientName) lines.push(clientName);
    navigator.clipboard.writeText(lines.join('\n'));
  };

  const content = (
    <div className={variant === 'sheet' ? '' : 'h-full overflow-y-auto'}>
      {variant === 'sheet' && (
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-[var(--m-border)]" />
        </div>
      )}

      <div className="px-4 pb-4">
        {variant === 'panel' && (
          <div className="flex justify-end mb-2">
            <button onClick={onClose} className="text-[var(--m-text-tertiary)]">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Avatar + name */}
        <div className="text-center mb-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-2 ${avatarColor.bg} ${avatarColor.text}`}>
            {initials}
          </div>
          <div className="text-lg font-bold text-[var(--m-text-primary)]">{contact.name}</div>
          {contact.role && (
            <div className="text-[13px] text-[var(--m-text-secondary)] mt-0.5">
              {contact.role}{contact.company ? ` \u00b7 ${contact.company}` : ''}
            </div>
          )}
          {clientName && (
            <div className="text-[12px] text-[var(--m-accent)] mt-1">{clientName}</div>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 mb-4">
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-[var(--m-accent-subtle)] rounded-lg"
            >
              <Phone className="w-4 h-4 text-[var(--m-accent)]" />
              <span className="text-[10px] font-semibold text-[var(--m-accent)]">Call</span>
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-[var(--m-accent-subtle)] rounded-lg"
            >
              <Mail className="w-4 h-4 text-[var(--m-accent)]" />
              <span className="text-[10px] font-semibold text-[var(--m-accent)]">Email</span>
            </a>
          )}
          <button
            onClick={copyContactInfo}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-[var(--m-accent-subtle)] rounded-lg"
          >
            <Copy className="w-4 h-4 text-[var(--m-accent)]" />
            <span className="text-[10px] font-semibold text-[var(--m-accent)]">Copy</span>
          </button>
        </div>

        {/* Structured fields */}
        <div className="border-t border-[var(--m-border-subtle)] pt-3 space-y-2">
          {[
            { label: 'Phone', value: contact.phone || '\u2014' },
            { label: 'Email', value: contact.email || '\u2014' },
            { label: 'Role', value: contact.role || '\u2014' },
            { label: 'Company', value: clientName || contact.company || '\u2014' },
          ].map(field => (
            <div key={field.label} className="flex justify-between py-1.5">
              <span className="text-xs text-[var(--m-text-tertiary)] font-medium">{field.label}</span>
              <span className="text-xs text-[var(--m-text-primary)] font-semibold">{field.value}</span>
            </div>
          ))}
        </div>

        {/* Notes */}
        <div className="mt-4">
          <span className="text-xs font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider">Notes</span>
          {isEditing ? (
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Add notes..."
              className="w-full mt-1 border border-[var(--m-border)] rounded-lg p-2 text-sm min-h-[60px] bg-[var(--m-bg-subtle)]"
            />
          ) : (
            <div className="mt-1 bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg p-2.5 text-xs text-[var(--m-text-secondary)] min-h-[40px]">
              {contact.notes || 'No notes yet'}
            </div>
          )}
        </div>

        {/* Edit form */}
        {isEditing && (
          <div className="mt-4 space-y-2.5">
            <div>
              <label className="text-[10px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider">Name</label>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full mt-0.5 border border-[var(--m-border)] rounded-lg px-2.5 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider">Email</label>
              <input value={editEmail} onChange={e => setEditEmail(e.target.value)}
                className="w-full mt-0.5 border border-[var(--m-border)] rounded-lg px-2.5 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider">Phone</label>
              <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                className="w-full mt-0.5 border border-[var(--m-border)] rounded-lg px-2.5 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider">Role</label>
              <input value={editRole} onChange={e => setEditRole(e.target.value)}
                className="w-full mt-0.5 border border-[var(--m-border)] rounded-lg px-2.5 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider">Client</label>
              <select
                value={editClientId}
                onChange={e => setEditClientId(e.target.value)}
                className="w-full mt-0.5 border border-[var(--m-border)] rounded-lg px-2.5 py-2 text-sm bg-white"
              >
                <option value="">No client</option>
                {clients?.sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={isEditing ? saveEdit : startEditing}
            className="flex-1 flex items-center justify-center gap-1 py-2.5 bg-[var(--m-bg-subtle)] text-[var(--m-text-secondary)] rounded-lg text-xs font-semibold border border-[var(--m-border)]"
          >
            <Pencil className="w-3 h-3" /> {isEditing ? 'Save' : 'Edit'}
          </button>
          {!isEditing && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 bg-[var(--m-bg-subtle)] text-red-600 rounded-lg text-xs font-semibold border border-[var(--m-border)]"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
          {isEditing && (
            <button
              onClick={() => setIsEditing(false)}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 bg-[var(--m-bg-subtle)] text-[var(--m-text-secondary)] rounded-lg text-xs font-semibold border border-[var(--m-border)]"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
            <p className="text-xs text-red-700 mb-2">Delete this contact? This can't be undone.</p>
            <div className="flex gap-2">
              <button onClick={handleDelete} className="px-3 py-1 bg-red-600 text-white text-xs rounded-lg font-medium">Delete</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1 bg-white text-xs rounded-lg border font-medium">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (variant === 'panel') {
    return content;
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 max-h-[80vh] overflow-y-auto shadow-xl animate-slide-up">
        {content}
      </div>
    </>
  );
}
