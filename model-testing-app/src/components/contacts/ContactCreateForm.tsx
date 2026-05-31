'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useColors } from '@/lib/useColors';
import { Field, Input, Textarea, Button, IconButton } from '@/components/layouts';

interface ContactCreateFormProps {
  onCreated: () => void;
  onClose: () => void;
}

export default function ContactCreateForm({ onCreated, onClose }: ContactCreateFormProps) {
  const colors = useColors();
  const accent = colors.entityTypes.contact;
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
    <div className="flex flex-col h-full" style={{ background: colors.bg.base }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid ${colors.border.default}` }}
      >
        <IconButton label="Back" onClick={onClose}>
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <span
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 500,
            color: colors.text.secondary,
          }}
        >
          New Contact
        </span>
        <div className="w-7" />
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <Field label="Name *">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Full name"
          />
        </Field>

        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@example.com"
          />
        </Field>

        <Field label="Phone">
          <Input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+44 7700 900000"
          />
        </Field>

        <Field label="Role">
          <Input
            value={role}
            onChange={e => setRole(e.target.value)}
            placeholder="e.g. Solicitor, Surveyor, Broker"
          />
        </Field>

        {/* Client (searchable) */}
        <Field label="Client">
          {selectedClientName ? (
            <div
              className="flex items-center justify-between"
              style={{
                border: `1px solid ${colors.border.default}`,
                borderRadius: 4,
                padding: '7px 10px',
              }}
            >
              <span style={{ fontSize: 12, color: colors.text.primary, fontWeight: 500 }}>{selectedClientName}</span>
              <button
                onClick={() => { setClientId(''); setClientSearch(''); }}
                style={{ fontSize: 11, color: colors.text.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>
          ) : (
            <div>
              <Input
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                placeholder="Search clients..."
              />
              {clientSearch && filteredClients.length > 0 && (
                <div
                  style={{
                    marginTop: 4,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: 4,
                    background: colors.bg.card,
                    maxHeight: 150,
                    overflowY: 'auto',
                  }}
                >
                  {filteredClients.map(c => (
                    <button
                      key={c._id}
                      onClick={() => { setClientId(c._id); setClientSearch(''); }}
                      className="w-full text-left"
                      style={{
                        padding: '8px 10px',
                        fontSize: 12,
                        color: colors.text.primary,
                        background: 'transparent',
                        borderBottom: `1px solid ${colors.border.light}`,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = colors.bg.cardAlt)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Field>

        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any additional notes..."
            rows={3}
          />
        </Field>
      </div>

      {/* Submit button */}
      <div className="px-4 pb-4 pt-2">
        <Button
          variant="primary"
          accent={accent}
          onClick={handleSubmit}
          disabled={!name.trim() || isSubmitting}
          style={{ width: '100%', justifyContent: 'center', padding: '10px 14px' }}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Creating...
            </>
          ) : 'Create Contact'}
        </Button>
      </div>
    </div>
  );
}
