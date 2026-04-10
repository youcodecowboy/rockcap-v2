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
