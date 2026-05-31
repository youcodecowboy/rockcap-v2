'use client';

import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import {
  Plus,
  Mail,
  Phone,
  Copy,
  Check,
  Pencil,
  Trash2,
  User,
  UserPlus,
  Building2,
  MessageSquare,
  Briefcase,
} from 'lucide-react';
import {
  Panel,
  Button,
  IconButton,
  StatusPill,
  EmptyState,
  Modal,
  Field,
  Input,
  Textarea,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import LinkContactDialog from './LinkContactDialog';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface Contact {
  _id: Id<"contacts">;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  createdAt: string;
  // HubSpot enrichment fields — surfaced for Task C (Contacts rework).
  hubspotContactId?: string;
  hubspotUrl?: string;
  hubspotLifecycleStageName?: string;
  hubspotLifecycleStage?: string;
  linkedinUrl?: string;
  linkedCompanyIds?: Id<"companies">[];
  lastContactedDate?: string;
  lastActivityDate?: string;
}

interface ClientContactsTabProps {
  clientId: Id<"clients">;
  clientName: string;
  contacts: Contact[];
}

export default function ClientContactsTab({
  clientId,
  clientName,
  contacts,
}: ClientContactsTabProps) {
  const colors = useColors();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const createContact = useMutation(api.contacts.create);
  const updateContact = useMutation(api.contacts.update);
  const removeContact = useMutation(api.contacts.remove);
  const unlinkFromClient = useMutation(api.contacts.unlinkFromClient);

  // Resolve the linked-company names for the entire card grid in one query
  // so we can show 'Linked to <Company>' chips without N+1 fetches.
  const allLinkedCompanyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of contacts) {
      for (const cid of c.linkedCompanyIds ?? []) ids.add(String(cid));
    }
    return Array.from(ids) as Id<'companies'>[];
  }, [contacts]);
  const companies = useQuery(
    api.companies.listByIds,
    allLinkedCompanyIds.length > 0 ? { ids: allLinkedCompanyIds } : 'skip',
  );
  const companyNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies ?? []) m.set(String((c as any)._id), (c as any).name);
    return m;
  }, [companies]);

  const handleUnlink = async (contactId: Id<'contacts'>) => {
    await unlinkFromClient({ contactId });
  };

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 2000);
    } catch (error) {
      console.error('Failed to copy email:', error);
    }
  };

  const handleDelete = async (contactId: Id<"contacts">) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;

    setIsDeleting(contactId);
    try {
      await removeContact({ id: contactId });
    } catch (error) {
      console.error('Failed to delete contact:', error);
      alert('Failed to delete contact. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.text.muted,
            }}
          >
            Contacts
          </div>
          <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''} for {clientName}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => setIsLinkDialogOpen(true)}>
            <UserPlus size={14} />
            Link Existing
          </Button>
          <Button
            variant="primary"
            accent={colors.entityTypes.client}
            onClick={() => setIsAddModalOpen(true)}
          >
            <Plus size={14} />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Contact Cards Grid */}
      {contacts.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 14,
          }}
        >
          {contacts.map((contact) => {
            const linkedCompanyName =
              (contact.linkedCompanyIds ?? [])
                .map((id) => companyNameMap.get(String(id)))
                .filter(Boolean)[0] ?? null;
            return (
              <ContactCard
                key={contact._id}
                contact={contact}
                linkedCompanyName={linkedCompanyName}
                onEdit={() => setEditingContact(contact)}
                onDelete={() => handleDelete(contact._id)}
                onUnlink={() => handleUnlink(contact._id)}
                onCopyEmail={handleCopyEmail}
                copiedEmail={copiedEmail}
                isDeleting={isDeleting === contact._id}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<User size={40} />}
          title="No contacts yet"
          body="Add your first contact to start building your network."
          action={
            <Button
              variant="primary"
              accent={colors.entityTypes.client}
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus size={14} />
              Add Contact
            </Button>
          }
        />
      )}

      {/* Link existing contact — search modal */}
      <LinkContactDialog
        open={isLinkDialogOpen}
        onOpenChange={setIsLinkDialogOpen}
        clientId={clientId}
        clientName={clientName}
        alreadyLinkedIds={contacts.map((c) => String(c._id))}
      />

      {/* Add/Edit Modal */}
      <ContactModal
        isOpen={isAddModalOpen || editingContact !== null}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingContact(null);
        }}
        contact={editingContact}
        clientId={clientId}
        onSave={async (data) => {
          if (editingContact) {
            await updateContact({ id: editingContact._id, ...data });
          } else {
            await createContact({ ...data, clientId });
          }
        }}
      />
    </div>
  );
}

/** Format a last-contacted/activity ISO into a short relative 'Nd ago' label. */
function relativeDays(iso?: string): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// Contact Card Component — reworked for Task C. Surfaces HubSpot origin,
// linked-company context, lifecycle stage, last-contacted, and an 'Unlink
// from client' action alongside Edit + Delete. Restyled to the layout canon.
function ContactCard({
  contact,
  linkedCompanyName,
  onEdit,
  onDelete,
  onUnlink,
  onCopyEmail,
  copiedEmail,
  isDeleting,
}: {
  contact: Contact;
  linkedCompanyName: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onUnlink: () => void;
  onCopyEmail: (email: string) => void;
  copiedEmail: string | null;
  isDeleting: boolean;
}) {
  const colors = useColors();
  const initials = contact.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const fromHubSpot = !!contact.hubspotContactId;
  const lifecycle =
    contact.hubspotLifecycleStageName ?? contact.hubspotLifecycleStage ?? null;
  const lastTouch = relativeDays(
    contact.lastContactedDate ?? contact.lastActivityDate,
  );

  return (
    <Panel padded>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: `${colors.entityTypes.contact}20`,
              border: `1px solid ${colors.entityTypes.contact}40`,
              color: colors.entityTypes.contact,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 15,
              fontWeight: 500,
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 14, fontWeight: 500, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {contact.name}
              </h3>
              {fromHubSpot ? <StatusPill label="HubSpot" tone={colors.accent.orange} /> : null}
            </div>
            {contact.role && (
              <p
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  color: colors.text.muted,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginTop: 2,
                }}
              >
                <Briefcase size={12} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.role}</span>
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <IconButton label="Edit" onClick={onEdit}>
            <Pencil size={14} />
          </IconButton>
          <IconButton label="Unlink from client" onClick={onUnlink}>
            <User size={14} />
          </IconButton>
          <IconButton label={isDeleting ? 'Deleting' : 'Delete'} onClick={onDelete} disabled={isDeleting}>
            <Trash2 size={14} style={{ color: colors.accent.red }} />
          </IconButton>
        </div>
      </div>

      {/* HubSpot enrichment chips — lifecycle + linked company + last-touch.
          Only renders if any are available to keep non-HubSpot cards clean. */}
      {lifecycle || linkedCompanyName || lastTouch ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {lifecycle ? <StatusPill label={lifecycle} tone={colors.text.muted} /> : null}
          {linkedCompanyName ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: colors.accent.blue,
                background: `${colors.accent.blue}20`,
                border: `1px solid ${colors.accent.blue}40`,
                padding: '2px 6px',
                borderRadius: 2,
              }}
            >
              <Building2 size={10} />
              {linkedCompanyName}
            </span>
          ) : null}
          {lastTouch ? <StatusPill label={`Last touch · ${lastTouch}`} tone={colors.text.muted} /> : null}
        </div>
      ) : null}

      {/* Contact Info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {contact.email && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.text.secondary, minWidth: 0 }}>
              <Mail size={14} style={{ color: colors.text.muted, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email}</span>
            </div>
            <IconButton
              label={copiedEmail === contact.email ? 'Copied' : 'Copy email'}
              onClick={() => onCopyEmail(contact.email!)}
            >
              {copiedEmail === contact.email ? (
                <Check size={13} style={{ color: colors.accent.green }} />
              ) : (
                <Copy size={13} />
              )}
            </IconButton>
          </div>
        )}
        {contact.phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.text.secondary }}>
            <Phone size={14} style={{ color: colors.text.muted, flexShrink: 0 }} />
            <span>{contact.phone}</span>
          </div>
        )}
        {contact.company && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.text.secondary }}>
            <Building2 size={14} style={{ color: colors.text.muted, flexShrink: 0 }} />
            <span>{contact.company}</span>
          </div>
        )}
      </div>

      {/* Notes */}
      {contact.notes && (
        <div
          style={{
            background: colors.bg.cardAlt,
            border: `1px solid ${colors.border.light}`,
            borderRadius: 4,
            padding: 10,
            marginBottom: 14,
          }}
        >
          <p
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: colors.text.muted,
              marginBottom: 4,
            }}
          >
            <MessageSquare size={11} />
            Notes
          </p>
          <p
            style={{
              fontSize: 12,
              color: colors.text.primary,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
            }}
          >
            {contact.notes}
          </p>
        </div>
      )}

      {/* Action Button */}
      <Button
        variant="secondary"
        onClick={() => {
          if (contact.email) {
            window.location.href = `mailto:${contact.email}`;
          }
        }}
        disabled={!contact.email}
      >
        <Mail size={14} />
        Contact Person
      </Button>
    </Panel>
  );
}

// Contact Modal Component
function ContactModal({
  isOpen,
  onClose,
  contact,
  clientId,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  clientId: Id<"clients">;
  onSave: (data: {
    name: string;
    role?: string;
    email?: string;
    phone?: string;
    company?: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const colors = useColors();
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    email: '',
    phone: '',
    company: '',
    notes: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  // Sync the form from the contact prop whenever the modal opens. The canon
  // Modal unmounts when closed, so this replaces the old shadcn Dialog's
  // onOpenChange(open => handleOpen()) form-reset behaviour.
  useEffect(() => {
    if (!isOpen) return;
    if (contact) {
      setFormData({
        name: contact.name || '',
        role: contact.role || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        notes: contact.notes || '',
      });
    } else {
      setFormData({
        name: '',
        role: '',
        email: '',
        phone: '',
        company: '',
        notes: '',
      });
    }
  }, [isOpen, contact]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Name is required');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        name: formData.name.trim(),
        role: formData.role.trim() || undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        company: formData.company.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      });
      onClose();
      setFormData({ name: '', role: '', email: '', phone: '', company: '', notes: '' });
    } catch (error) {
      console.error('Failed to save contact:', error);
      alert('Failed to save contact. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={contact ? 'Edit contact' : 'Add new contact'}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            accent={colors.entityTypes.client}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : contact ? 'Save Changes' : 'Add Contact'}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 14 }}>
        {contact ? 'Update the contact information below.' : 'Add a new contact to your client.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Name *">
            <Input
              placeholder="John Smith"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <Input
              placeholder="CEO, Manager, etc."
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Email">
            <Input
              type="email"
              placeholder="john@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              placeholder="+44 7XXX XXXXXX"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Company">
          <Input
            placeholder="Company name"
            value={formData.company}
            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
          />
        </Field>

        <Field label="Notes">
          <Textarea
            placeholder="Any additional notes about this contact..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
          />
        </Field>
      </div>
    </Modal>
  );
}
