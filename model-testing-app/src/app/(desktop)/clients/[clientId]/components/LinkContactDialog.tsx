/**
 * LinkContactDialog — desktop port of the mobile LinkContactModal.
 *
 * Renders a canon Modal with a search box over ALL contacts. Clicking
 * a result calls `contacts.linkToClient` which sets `contact.clientId`,
 * then closes. The parent `contacts.getByClient` query reactively picks
 * up the new contact without any refetch.
 */

'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Check, Loader2 } from 'lucide-react';
import { Modal, Field, Input } from '@/components/layouts';
import { useColors } from '@/lib/useColors';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface LinkContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: Id<'clients'>;
  clientName: string;
  /** Contacts already linked to this client — hidden from results. */
  alreadyLinkedIds?: string[];
}

export default function LinkContactDialog({
  open, onOpenChange, clientId, clientName, alreadyLinkedIds = [],
}: LinkContactDialogProps) {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const allContacts = useQuery(api.contacts.getAll, open ? {} : 'skip');
  const linkToClient = useMutation(api.contacts.linkToClient);

  const alreadyLinkedSet = useMemo(
    () => new Set(alreadyLinkedIds.map(String)),
    [alreadyLinkedIds],
  );

  const filtered = useMemo(() => {
    if (!allContacts) return [];
    const q = query.trim().toLowerCase();
    const pool = allContacts.filter(
      (c: any) => !alreadyLinkedSet.has(String(c._id)),
    );
    if (!q) return pool.slice(0, 20); // preview only; 4k+ contacts otherwise
    return pool
      .filter(
        (c: any) =>
          c.name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.role?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [allContacts, query, alreadyLinkedSet]);

  const handleLink = async (contactId: Id<'contacts'>) => {
    setLinkingId(String(contactId));
    try {
      await linkToClient({ contactId, clientId });
      setQuery('');
      onOpenChange(false);
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title={`Link contact to ${clientName}`}
      width={560}
    >
      <Field
        label="Search contacts"
        hint="Search by name, email, role, or company. Click a result to link."
      >
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start typing..."
        />
      </Field>

      <div
        style={{
          maxHeight: 420,
          overflowY: 'auto',
          marginTop: 12,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
        }}
      >
        {allContacts === undefined ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
            <Loader2 size={16} className="animate-spin" style={{ color: colors.text.muted }} />
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 12, color: colors.text.muted, textAlign: 'center', padding: '40px 0' }}>
            {query.trim()
              ? 'No contacts match your search'
              : 'Start typing to search contacts'}
          </p>
        ) : (
          <div>
            {!query.trim() ? (
              <p
                style={{
                  padding: '8px 14px 4px',
                  fontFamily: MONO,
                  fontSize: 9,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: colors.text.muted,
                }}
              >
                Recent ({filtered.length})
              </p>
            ) : null}
            {filtered.map((c: any, i: number) => {
              const linking = linkingId === String(c._id);
              return (
                <button
                  key={c._id}
                  onClick={() => handleLink(c._id)}
                  disabled={linking}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    borderTop: i === 0 && !query.trim() ? `1px solid ${colors.border.light}` : i === 0 ? 'none' : `1px solid ${colors.border.light}`,
                    cursor: linking ? 'wait' : 'pointer',
                    opacity: linking ? 0.5 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: colors.bg.cardAlt,
                      border: `1px solid ${colors.border.default}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: 12,
                      fontWeight: 500,
                      color: colors.text.secondary,
                    }}
                  >
                    {(c.name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </p>
                    <p style={{ fontSize: 11, color: colors.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[c.role, c.company, c.email].filter(Boolean).join(' · ') || 'No details'}
                    </p>
                  </div>
                  {linking ? (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 9,
                        fontWeight: 500,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: colors.text.muted,
                        background: colors.bg.cardAlt,
                        border: `1px solid ${colors.border.default}`,
                        padding: '2px 6px',
                        borderRadius: 2,
                      }}
                    >
                      Linking…
                    </span>
                  ) : (
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: `${colors.entityTypes.client}20`,
                        border: `1px solid ${colors.entityTypes.client}40`,
                        color: colors.entityTypes.client,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Check size={14} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
