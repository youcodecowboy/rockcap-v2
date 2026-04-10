# Contacts Address Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean address book for contacts (people) linked to clients (companies), with search, client filter chips, A-Z browsing, detail sheet/panel, and simple create form — consistent across mobile and desktop.

**Architecture:** No schema changes. Shared components in `src/components/contacts/` consumed by mobile `/m-contacts` and desktop `/rolodex`. Client-side filtering and A-Z grouping (small dataset). One minor backend update: add `clientId` to the contacts update mutation.

**Tech Stack:** Next.js 16, Convex (existing queries/mutations), React, Tailwind CSS with mobile design tokens (`--m-*`), Lucide icons

**Spec:** `docs/superpowers/specs/2026-04-10-contacts-address-book-design.md`

---

### Task 1: Add clientId to contacts.update mutation

**Files:**
- Modify: `convex/contacts.ts:110-130`

The existing `update` mutation only accepts name, role, email, phone, company, notes — but not `clientId`. We need it so users can change which client a contact is associated with.

- [ ] **Step 1: Update the update mutation args**

In `convex/contacts.ts`, add `clientId` to the update mutation args (line 118) and handler:

```typescript
// Mutation: Update contact
export const update = mutation({
  args: {
    id: v.id("contacts"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    notes: v.optional(v.string()),
    clientId: v.optional(v.union(v.id("clients"), v.null())),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Contact not found");
    }
    
    const patchData: any = { ...updates, updatedAt: new Date().toISOString() };
    if (patchData.clientId === null) patchData.clientId = undefined;
    
    await ctx.db.patch(id, patchData);
    return id;
  },
});
```

- [ ] **Step 2: Run Convex codegen**

Run: `npx convex codegen`
Expected: Success.

- [ ] **Step 3: Commit**

```bash
git add convex/contacts.ts
git commit -m "feat(contacts): add clientId to update mutation for client reassignment"
```

---

### Task 2: Shared Utility — groupContactsByLetter

**Files:**
- Create: `src/components/contacts/groupContactsByLetter.ts`

- [ ] **Step 1: Create the utility**

```typescript
/**
 * Groups a sorted contact array into alphabetical sections.
 * Returns sections like { letter: "A", contacts: [...] }
 */

interface ContactWithName {
  _id: string;
  name: string;
  [key: string]: any;
}

interface ContactGroup<T> {
  letter: string;
  contacts: T[];
}

export function groupContactsByLetter<T extends ContactWithName>(contacts: T[]): ContactGroup<T>[] {
  const sorted = [...contacts].sort((a, b) =>
    a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' })
  );

  const groups: Map<string, T[]> = new Map();

  for (const contact of sorted) {
    const firstChar = contact.name.charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';

    if (!groups.has(letter)) {
      groups.set(letter, []);
    }
    groups.get(letter)!.push(contact);
  }

  return Array.from(groups.entries()).map(([letter, contacts]) => ({
    letter,
    contacts,
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/contacts/groupContactsByLetter.ts
git commit -m "feat(contacts): add groupContactsByLetter utility"
```

---

### Task 3: Shared Components — ContactSearchBar + ContactClientChips + ContactListItem

**Files:**
- Create: `src/components/contacts/ContactSearchBar.tsx`
- Create: `src/components/contacts/ContactClientChips.tsx`
- Create: `src/components/contacts/ContactListItem.tsx`

- [ ] **Step 1: Create ContactSearchBar**

```typescript
'use client';

import { Search, X } from 'lucide-react';

interface ContactSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function ContactSearchBar({ value, onChange }: ContactSearchBarProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--m-text-tertiary)]" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search contacts..."
        className="w-full pl-9 pr-8 py-2.5 bg-white border border-[var(--m-border)] rounded-lg text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none focus:border-[var(--m-accent)]"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--m-text-tertiary)]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create ContactClientChips**

```typescript
'use client';

interface Client {
  _id: string;
  name: string;
}

interface ContactClientChipsProps {
  clients: Client[];
  contactClientIds: Set<string>;
  selectedClientId: string | null;
  onSelectClient: (id: string | null) => void;
}

export default function ContactClientChips({
  clients,
  contactClientIds,
  selectedClientId,
  onSelectClient,
}: ContactClientChipsProps) {
  // Only show clients that have at least one contact
  const relevantClients = clients.filter(c => contactClientIds.has(c._id));

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      <button
        onClick={() => onSelectClient(null)}
        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
          selectedClientId === null
            ? 'bg-[var(--m-accent)] text-white'
            : 'bg-white border border-[var(--m-border)] text-[var(--m-text-secondary)]'
        }`}
      >
        All
      </button>
      {relevantClients.sort((a, b) => a.name.localeCompare(b.name)).map(client => (
        <button
          key={client._id}
          onClick={() => onSelectClient(selectedClientId === client._id ? null : client._id)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
            selectedClientId === client._id
              ? 'bg-[var(--m-accent)] text-white'
              : 'bg-white border border-[var(--m-border)] text-[var(--m-text-secondary)]'
          }`}
        >
          {client.name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create ContactListItem**

```typescript
'use client';

import { Id } from '../../../convex/_generated/dataModel';

interface Contact {
  _id: Id<'contacts'>;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  company?: string;
  clientId?: Id<'clients'>;
}

interface ContactListItemProps {
  contact: Contact;
  clientName?: string;
  onTap: () => void;
}

// Deterministic color from name for avatar
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

export default function ContactListItem({ contact, clientName, onTap }: ContactListItemProps) {
  const initials = getInitials(contact.name);
  const color = getAvatarColor(contact.name);
  const subtitle = [contact.role, contact.company].filter(Boolean).join(' · ');

  return (
    <div
      onClick={onTap}
      className="bg-white px-3 py-2.5 flex items-center gap-3 active:bg-[var(--m-bg-subtle)] transition-colors cursor-pointer rounded-lg"
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 ${color.bg} ${color.text}`}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[var(--m-text-primary)] truncate">
          {contact.name}
        </div>
        {subtitle && (
          <div className="text-[11px] text-[var(--m-text-tertiary)] truncate">{subtitle}</div>
        )}
      </div>
      {clientName && (
        <span className="text-[11px] text-[var(--m-text-tertiary)] flex-shrink-0">{clientName}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/contacts/ContactSearchBar.tsx src/components/contacts/ContactClientChips.tsx src/components/contacts/ContactListItem.tsx
git commit -m "feat(contacts): add ContactSearchBar, ContactClientChips, ContactListItem"
```

---

### Task 4: ContactDetailSheet

**Files:**
- Create: `src/components/contacts/ContactDetailSheet.tsx`

- [ ] **Step 1: Create the detail sheet component**

```typescript
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

// Deterministic avatar color (same logic as ContactListItem)
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
        {/* Close button (panel only) */}
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
              {contact.role}{contact.company ? ` · ${contact.company}` : ''}
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
            { label: 'Phone', value: contact.phone || '—' },
            { label: 'Email', value: contact.email || '—' },
            { label: 'Role', value: contact.role || '—' },
            { label: 'Company', value: clientName || contact.company || '—' },
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

        {/* Edit form (shown when editing) */}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/contacts/ContactDetailSheet.tsx
git commit -m "feat(contacts): add ContactDetailSheet with call/email/copy actions"
```

---

### Task 5: ContactCreateForm

**Files:**
- Create: `src/components/contacts/ContactCreateForm.tsx`

- [ ] **Step 1: Create the form component**

```typescript
'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface ContactCreateFormProps {
  onCreated: () => void;
  onClose: () => void;
}

export default function ContactCreateForm({ onCreated, onClose }: ContactCreateFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [clientId, setClientId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clients = useQuery(api.clients.list, {});
  const createContact = useMutation(api.contacts.create);

  const filteredClients = clients?.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  ).sort((a, b) => a.name.localeCompare(b.name)) || [];

  const selectedClientName = clientId ? clients?.find(c => c._id === clientId)?.name : undefined;

  const handleSubmit = async () => {
    if (!name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await createContact({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role: role.trim() || undefined,
        notes: notes.trim() || undefined,
        clientId: clientId ? clientId as Id<'clients'> : undefined,
      });
      onCreated();
    } catch (err) {
      console.error('Failed to create contact:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--m-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--m-border)]">
        <button onClick={onClose} className="text-[var(--m-text-tertiary)]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-[15px] font-bold text-[var(--m-text-primary)]">New Contact</span>
        <div className="w-5" />
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Name (required) */}
        <div>
          <label className="text-[11px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Full name"
            className="w-full mt-1 border border-[var(--m-border)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none focus:border-[var(--m-accent)]"
          />
        </div>

        {/* Email */}
        <div>
          <label className="text-[11px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="w-full mt-1 border border-[var(--m-border)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none focus:border-[var(--m-accent)]"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="text-[11px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+44 7700 900000"
            className="w-full mt-1 border border-[var(--m-border)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none focus:border-[var(--m-accent)]"
          />
        </div>

        {/* Role */}
        <div>
          <label className="text-[11px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider">Role</label>
          <input
            value={role}
            onChange={e => setRole(e.target.value)}
            placeholder="e.g. Solicitor, Surveyor, Broker"
            className="w-full mt-1 border border-[var(--m-border)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none focus:border-[var(--m-accent)]"
          />
        </div>

        {/* Client (searchable dropdown) */}
        <div>
          <label className="text-[11px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider">Client</label>
          {selectedClientName ? (
            <div className="mt-1 flex items-center justify-between border border-[var(--m-border)] rounded-lg px-3 py-2.5">
              <span className="text-[13px] text-[var(--m-text-primary)] font-medium">{selectedClientName}</span>
              <button onClick={() => { setClientId(''); setClientSearch(''); }} className="text-[var(--m-text-tertiary)] text-xs">Clear</button>
            </div>
          ) : (
            <div className="mt-1">
              <input
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                placeholder="Search clients..."
                className="w-full border border-[var(--m-border)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none focus:border-[var(--m-accent)]"
              />
              {clientSearch && filteredClients.length > 0 && (
                <div className="mt-1 border border-[var(--m-border)] rounded-lg bg-white max-h-[150px] overflow-y-auto">
                  {filteredClients.map(c => (
                    <button
                      key={c._id}
                      onClick={() => { setClientId(c._id); setClientSearch(''); }}
                      className="w-full text-left px-3 py-2 text-[13px] text-[var(--m-text-primary)] hover:bg-[var(--m-bg-subtle)] border-b border-[var(--m-border-subtle)] last:border-b-0"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="text-[11px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-wider">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any additional notes..."
            rows={3}
            className="w-full mt-1 border border-[var(--m-border)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none focus:border-[var(--m-accent)] resize-none"
          />
        </div>
      </div>

      {/* Submit button */}
      <div className="px-4 pb-4 pt-2">
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || isSubmitting}
          className="w-full py-3 bg-[var(--m-accent)] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Creating...
            </span>
          ) : 'Create Contact'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/contacts/ContactCreateForm.tsx
git commit -m "feat(contacts): add ContactCreateForm with searchable client dropdown"
```

---

### Task 6: Mobile `/m-contacts` Page

**Files:**
- Create: `src/app/(mobile)/m-contacts/components/ContactsContent.tsx`
- Modify: `src/app/(mobile)/m-contacts/page.tsx`

- [ ] **Step 1: Create ContactsContent**

```typescript
'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Plus } from 'lucide-react';
import ContactSearchBar from '@/components/contacts/ContactSearchBar';
import ContactClientChips from '@/components/contacts/ContactClientChips';
import ContactListItem from '@/components/contacts/ContactListItem';
import ContactDetailSheet from '@/components/contacts/ContactDetailSheet';
import ContactCreateForm from '@/components/contacts/ContactCreateForm';
import { groupContactsByLetter } from '@/components/contacts/groupContactsByLetter';

export default function ContactsContent() {
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<Id<'contacts'> | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const contacts = useQuery(api.contacts.getAll);
  const clients = useQuery(api.clients.list, {});

  // Build set of client IDs that have contacts
  const contactClientIds = useMemo(() => {
    const ids = new Set<string>();
    contacts?.forEach(c => { if (c.clientId) ids.add(c.clientId); });
    return ids;
  }, [contacts]);

  // Client name lookup
  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    clients?.forEach(c => map.set(c._id, c.name));
    return map;
  }, [clients]);

  // Filter contacts
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    let filtered = contacts;

    if (selectedClientId) {
      filtered = filtered.filter(c => c.clientId === selectedClientId);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q))
      );
    }

    return filtered;
  }, [contacts, selectedClientId, search]);

  // Group by letter
  const grouped = useMemo(() => groupContactsByLetter(filteredContacts), [filteredContacts]);

  if (showCreate) {
    return (
      <ContactCreateForm
        onCreated={() => setShowCreate(false)}
        onClose={() => setShowCreate(false)}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-var(--m-header-h)-var(--m-footer-h))]">
      <div className="px-[var(--m-page-px)] pt-3 space-y-2.5">
        <ContactSearchBar value={search} onChange={setSearch} />
        <ContactClientChips
          clients={clients || []}
          contactClientIds={contactClientIds}
          selectedClientId={selectedClientId}
          onSelectClient={setSelectedClientId}
        />
      </div>

      <div className="border-t border-[var(--m-border)] mx-[var(--m-page-px)] mt-2.5" />

      {/* Contact count */}
      <div className="px-[var(--m-page-px)] pt-2 pb-1">
        <span className="text-[11px] text-[var(--m-text-tertiary)]">
          {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* A-Z grouped list */}
      <div className="flex-1 px-[var(--m-page-px)] pb-20">
        {grouped.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--m-text-tertiary)]">
              {search || selectedClientId ? 'No contacts found' : 'No contacts yet'}
            </p>
            {(search || selectedClientId) ? (
              <button
                onClick={() => { setSearch(''); setSelectedClientId(null); }}
                className="mt-2 text-sm text-[var(--m-accent)] font-medium"
              >
                Clear filters
              </button>
            ) : (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-2 text-sm text-[var(--m-accent)] font-medium"
              >
                Add your first contact
              </button>
            )}
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.letter} className="mt-2">
              <div className="text-[12px] font-bold text-[var(--m-accent)] pb-1.5 border-b border-[var(--m-border-subtle)]">
                {group.letter}
              </div>
              <div>
                {group.contacts.map(contact => (
                  <ContactListItem
                    key={contact._id}
                    contact={contact}
                    clientName={contact.clientId ? clientMap.get(contact.clientId) : undefined}
                    onTap={() => setSelectedContactId(contact._id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-[calc(var(--m-footer-h)+env(safe-area-inset-bottom)+1rem)] right-4 bg-[var(--m-accent)] text-white rounded-full shadow-lg flex items-center gap-1.5 px-4 py-3 z-20"
        aria-label="New contact"
      >
        <Plus className="w-4 h-4" />
        <span className="text-sm font-semibold">New Contact</span>
      </button>

      {/* Detail sheet */}
      <ContactDetailSheet
        contactId={selectedContactId}
        isOpen={!!selectedContactId}
        onClose={() => setSelectedContactId(null)}
        variant="sheet"
      />
    </div>
  );
}
```

- [ ] **Step 2: Update page.tsx**

Replace `src/app/(mobile)/m-contacts/page.tsx`:

```typescript
import ContactsContent from './components/ContactsContent';

export default function MobileContacts() {
  return <ContactsContent />;
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/(mobile)/m-contacts/
git commit -m "feat(mobile): implement m-contacts address book with search, client chips, A-Z list"
```

---

### Task 7: Desktop `/rolodex` Page Rework

**Files:**
- Modify: `src/app/(desktop)/rolodex/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the rolodex page**

Replace the entire content of `src/app/(desktop)/rolodex/page.tsx`:

```typescript
'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Plus } from 'lucide-react';
import ContactSearchBar from '@/components/contacts/ContactSearchBar';
import ContactClientChips from '@/components/contacts/ContactClientChips';
import ContactListItem from '@/components/contacts/ContactListItem';
import ContactDetailSheet from '@/components/contacts/ContactDetailSheet';
import ContactCreateForm from '@/components/contacts/ContactCreateForm';
import { groupContactsByLetter } from '@/components/contacts/groupContactsByLetter';

export default function RolodexPage() {
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<Id<'contacts'> | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const contacts = useQuery(api.contacts.getAll);
  const clients = useQuery(api.clients.list, {});

  const contactClientIds = useMemo(() => {
    const ids = new Set<string>();
    contacts?.forEach(c => { if (c.clientId) ids.add(c.clientId); });
    return ids;
  }, [contacts]);

  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    clients?.forEach(c => map.set(c._id, c.name));
    return map;
  }, [clients]);

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    let filtered = contacts;

    if (selectedClientId) {
      filtered = filtered.filter(c => c.clientId === selectedClientId);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q))
      );
    }

    return filtered;
  }, [contacts, selectedClientId, search]);

  const grouped = useMemo(() => groupContactsByLetter(filteredContacts), [filteredContacts]);

  return (
    <div className="bg-gray-50 min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Contacts</h1>
            <p className="mt-1 text-gray-500">
              {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Contact
          </button>
        </div>

        {/* Search + Chips */}
        <ContactSearchBar value={search} onChange={setSearch} />
        <ContactClientChips
          clients={clients || []}
          contactClientIds={contactClientIds}
          selectedClientId={selectedClientId}
          onSelectClient={setSelectedClientId}
        />

        {/* Two-panel layout */}
        <div className="flex gap-6">
          {/* Left: A-Z list */}
          <div className="flex-1 min-w-0">
            {grouped.length === 0 ? (
              <div className="text-center py-12 text-sm text-gray-400">
                {search || selectedClientId ? 'No contacts found' : 'No contacts yet'}
              </div>
            ) : (
              grouped.map(group => (
                <div key={group.letter} className="mb-4">
                  <div className="text-xs font-bold text-blue-700 pb-1.5 border-b border-gray-200 mb-1">
                    {group.letter}
                  </div>
                  <div className="space-y-0.5">
                    {group.contacts.map(contact => (
                      <ContactListItem
                        key={contact._id}
                        contact={contact}
                        clientName={contact.clientId ? clientMap.get(contact.clientId) : undefined}
                        onTap={() => setSelectedContactId(contact._id)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Right: detail panel */}
          <div className="w-[400px] flex-shrink-0 bg-white border border-gray-200 rounded-lg min-h-[400px]">
            <ContactDetailSheet
              contactId={selectedContactId}
              isOpen={true}
              onClose={() => setSelectedContactId(null)}
              variant="panel"
            />
          </div>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowCreate(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
            <div className="bg-white rounded-2xl w-[500px] h-[600px] shadow-xl overflow-hidden">
              <ContactCreateForm
                onCreated={() => setShowCreate(false)}
                onClose={() => setShowCreate(false)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/(desktop)/rolodex/page.tsx
git commit -m "feat(desktop): rework rolodex as contacts address book with two-panel layout"
```

---

### Task 8: Final Build + Push

- [ ] **Step 1: Run full build**

Run: `npx next build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Fix any build errors**

- [ ] **Step 3: Push to GitHub**

```bash
git push origin main
```
