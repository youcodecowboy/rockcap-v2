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

      <div className="px-[var(--m-page-px)] pt-2 pb-1">
        <span className="text-[11px] text-[var(--m-text-tertiary)]">
          {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
        </span>
      </div>

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

      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-[calc(var(--m-footer-h)+env(safe-area-inset-bottom)+1rem)] right-4 bg-[var(--m-accent)] text-white rounded-full shadow-lg flex items-center gap-1.5 px-4 py-3 z-20"
        aria-label="New contact"
      >
        <Plus className="w-4 h-4" />
        <span className="text-sm font-semibold">New Contact</span>
      </button>

      <ContactDetailSheet
        contactId={selectedContactId}
        isOpen={!!selectedContactId}
        onClose={() => setSelectedContactId(null)}
        variant="sheet"
      />
    </div>
  );
}
