/**
 * LinkContactDialog — desktop port of the mobile LinkContactModal.
 *
 * Renders a shadcn Dialog with a search box over ALL contacts. Clicking
 * a result calls `contacts.linkToClient` which sets `contact.clientId`,
 * then closes. The parent `contacts.getByClient` query reactively picks
 * up the new contact without any refetch.
 */

'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Search, Check, Loader2, UserPlus } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-4 h-4" />
            Link Contact to {clientName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Search contacts by name, email, role, or company. Tap to link.
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Start typing..."
              className="pl-9"
            />
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {allContacts === undefined ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              {query.trim()
                ? 'No contacts match your search'
                : 'Start typing to search contacts'}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {!query.trim() ? (
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Recent ({filtered.length})
                </p>
              ) : null}
              {filtered.map((c: any) => {
                const linking = linkingId === String(c._id);
                return (
                  <button
                    key={c._id}
                    onClick={() => handleLink(c._id)}
                    disabled={linking}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-medium">
                      {(c.name?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {[c.role, c.company, c.email].filter(Boolean).join(' · ') ||
                          'No details'}
                      </p>
                    </div>
                    {linking ? (
                      <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        Linking…
                      </span>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
