'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { X, Phone, Mail, Copy, Pencil, Trash2 } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { Section, Row, Field, Input, Textarea, Select, Button, IconButton } from '@/components/layouts';

interface ContactDetailSheetProps {
  contactId: Id<'contacts'> | null;
  isOpen: boolean;
  onClose: () => void;
  variant: 'sheet' | 'panel';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function ContactDetailSheet({ contactId, isOpen, onClose, variant }: ContactDetailSheetProps) {
  const colors = useColors();
  const accent = colors.entityTypes.contact;
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
        <div
          className="flex items-center justify-center h-full"
          style={{ fontSize: 13, color: colors.text.muted }}
        >
          Select a contact to view details
        </div>
      );
    }
    return null;
  }

  const clientName = contact.clientId ? clients?.find(c => c._id === contact.clientId)?.name : undefined;
  const initials = getInitials(contact.name);

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

  const quickAction = (icon: React.ReactNode, label: string) => (
    <div
      className="flex-1 flex flex-col items-center gap-1 py-2.5"
      style={{ background: `${accent}15`, border: `1px solid ${accent}40`, borderRadius: 4, color: accent }}
    >
      {icon}
      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 9, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 500 }}>{label}</span>
    </div>
  );

  const content = (
    <div className={variant === 'sheet' ? '' : 'h-full overflow-y-auto'}>
      {variant === 'sheet' && (
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full" style={{ background: colors.border.mid }} />
        </div>
      )}

      <div className="px-4 pb-4">
        {variant === 'panel' && (
          <div className="flex justify-end mb-2">
            <IconButton label="Close" onClick={onClose}>
              <X className="w-4 h-4" />
            </IconButton>
          </div>
        )}

        {/* Avatar + name */}
        <div className="text-center mb-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 18,
              fontWeight: 500,
              background: `${accent}20`,
              color: accent,
              border: `1px solid ${accent}40`,
            }}
          >
            {initials}
          </div>
          <div style={{ fontSize: 18, fontWeight: 500, color: colors.text.primary }}>{contact.name}</div>
          {contact.role && (
            <div style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>
              {contact.role}{contact.company ? ` · ${contact.company}` : ''}
            </div>
          )}
          {clientName && (
            <div style={{ fontSize: 12, color: accent, marginTop: 4 }}>{clientName}</div>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 mb-4">
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex-1">
              {quickAction(<Phone className="w-4 h-4" />, 'Call')}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex-1">
              {quickAction(<Mail className="w-4 h-4" />, 'Email')}
            </a>
          )}
          <button onClick={copyContactInfo} className="flex-1">
            {quickAction(<Copy className="w-4 h-4" />, 'Copy')}
          </button>
        </div>

        {/* Structured fields */}
        <Section title="Details">
          <Row label="Phone" value={contact.phone || '—'} />
          <Row label="Email" value={contact.email || '—'} />
          <Row label="Role" value={contact.role || '—'} />
          <Row label="Company" value={clientName || contact.company || '—'} />
        </Section>

        {/* Notes */}
        <Section title="Notes">
          {isEditing ? (
            <Textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Add notes..."
              style={{ minHeight: 60 }}
            />
          ) : (
            <div
              style={{
                background: colors.bg.cardAlt,
                border: `1px solid ${colors.border.default}`,
                borderRadius: 4,
                padding: 10,
                fontSize: 12,
                color: colors.text.secondary,
                minHeight: 40,
              }}
            >
              {contact.notes || 'No notes yet'}
            </div>
          )}
        </Section>

        {/* Edit form */}
        {isEditing && (
          <div className="space-y-2.5" style={{ marginBottom: 16 }}>
            <Field label="Name">
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </Field>
            <Field label="Email">
              <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} />
            </Field>
            <Field label="Role">
              <Input value={editRole} onChange={e => setEditRole(e.target.value)} />
            </Field>
            <Field label="Client">
              <Select value={editClientId} onChange={e => setEditClientId(e.target.value)}>
                <option value="">No client</option>
                {clients?.sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mt-4">
          <Button
            variant={isEditing ? 'primary' : 'secondary'}
            accent={accent}
            onClick={isEditing ? saveEdit : startEditing}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <Pencil className="w-3 h-3" /> {isEditing ? 'Save' : 'Edit'}
          </Button>
          {!isEditing && (
            <Button
              variant="danger"
              onClick={() => setShowDeleteConfirm(true)}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
          )}
          {isEditing && (
            <Button
              variant="secondary"
              onClick={() => setIsEditing(false)}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Cancel
            </Button>
          )}
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div
            style={{
              background: `${colors.accent.red}15`,
              border: `1px solid ${colors.accent.red}40`,
              borderRadius: 4,
              padding: 12,
              marginTop: 12,
            }}
          >
            <p style={{ fontSize: 12, color: colors.accent.red, marginBottom: 8 }}>
              Delete this contact? This can&apos;t be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" size="sm" onClick={handleDelete}>Delete</Button>
              <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
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
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto animate-slide-up"
        style={{
          background: colors.bg.card,
          borderTop: `2px solid ${accent}`,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      >
        {content}
      </div>
    </>
  );
}
