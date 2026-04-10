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
  const subtitle = [contact.role, contact.company].filter(Boolean).join(' \u00b7 ');

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
