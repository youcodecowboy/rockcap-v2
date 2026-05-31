'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Plus, Users } from 'lucide-react';
import ContactSearchBar from '@/components/contacts/ContactSearchBar';
import ContactClientChips from '@/components/contacts/ContactClientChips';
import ContactListItem from '@/components/contacts/ContactListItem';
import ContactDetailSheet from '@/components/contacts/ContactDetailSheet';
import ContactCreateForm from '@/components/contacts/ContactCreateForm';
import { groupContactsByLetter } from '@/components/contacts/groupContactsByLetter';
import { Button, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function RolodexPage() {
  const colors = useColors();
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
    <div style={{ background: colors.bg.base, minHeight: '100vh', padding: 32 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
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
              {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
            </div>
          </div>
          <Button
            variant="primary"
            accent={colors.entityTypes.contact}
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} />
            New Contact
          </Button>
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
        <div style={{ display: 'flex', gap: 24 }}>
          {/* Left: A-Z list */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {grouped.length === 0 ? (
              <EmptyState
                icon={<Users size={40} />}
                title={search || selectedClientId ? 'No contacts found' : 'No contacts yet'}
                body={
                  search || selectedClientId
                    ? 'Adjust your search or client filter to find a contact.'
                    : 'Add your first contact to start building your rolodex.'
                }
                action={
                  <Button
                    variant="primary"
                    accent={colors.entityTypes.contact}
                    onClick={() => setShowCreate(true)}
                  >
                    <Plus size={14} />
                    New Contact
                  </Button>
                }
              />
            ) : (
              grouped.map(group => (
                <div key={group.letter} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 9,
                      fontWeight: 500,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: colors.entityTypes.contact,
                      paddingBottom: 6,
                      borderBottom: `1px solid ${colors.border.default}`,
                      marginBottom: 4,
                    }}
                  >
                    {group.letter}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
          <div
            style={{
              width: 400,
              flexShrink: 0,
              background: colors.bg.card,
              border: `1px solid ${colors.border.default}`,
              borderRadius: 4,
              minHeight: 400,
            }}
          >
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
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
            onClick={() => setShowCreate(false)}
          />
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
            }}
          >
            <div
              style={{
                background: colors.bg.card,
                border: `1px solid ${colors.border.default}`,
                borderRadius: 4,
                width: 500,
                height: 600,
                overflow: 'hidden',
              }}
            >
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
