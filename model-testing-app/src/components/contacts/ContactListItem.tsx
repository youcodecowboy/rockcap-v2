'use client';

import { useState } from 'react';
import { Id } from '../../../convex/_generated/dataModel';
import { useColors } from '@/lib/useColors';

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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarTone(name: string, accents: string[]): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return accents[Math.abs(hash) % accents.length];
}

export default function ContactListItem({ contact, clientName, onTap }: ContactListItemProps) {
  const colors = useColors();
  const [hover, setHover] = useState(false);
  const initials = getInitials(contact.name);
  const accents = [
    colors.accent.blue,
    colors.accent.green,
    colors.accent.yellow,
    colors.accent.purple,
    colors.accent.red,
    colors.accent.cyan,
    colors.accent.orange,
    colors.accent.teal,
  ];
  const tone = avatarTone(contact.name, accents);
  const subtitle = [contact.role, contact.company].filter(Boolean).join(' · ');

  return (
    <div
      onClick={onTap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="px-3 py-2.5 flex items-center gap-3 cursor-pointer"
      style={{
        background: hover ? colors.bg.cardAlt : colors.bg.card,
        borderRadius: 4,
        transition: 'background 100ms linear',
      }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          fontWeight: 500,
          background: `${tone}20`,
          color: tone,
          border: `1px solid ${tone}40`,
        }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
          {contact.name}
        </div>
        {subtitle && (
          <div className="truncate" style={{ fontSize: 11, color: colors.text.muted }}>{subtitle}</div>
        )}
      </div>
      {clientName && (
        <span className="flex-shrink-0" style={{ fontSize: 11, color: colors.text.muted }}>{clientName}</span>
      )}
    </div>
  );
}
