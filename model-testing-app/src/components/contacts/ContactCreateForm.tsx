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
