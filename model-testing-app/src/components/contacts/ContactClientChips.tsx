'use client';

import { useColors } from '@/lib/useColors';

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
  const colors = useColors();
  const accent = colors.entityTypes.contact;

  // Only show clients that have at least one contact
  const relevantClients = clients.filter(c => contactClientIds.has(c._id));

  const chipStyle = (selected: boolean) => ({
    flexShrink: 0,
    whiteSpace: 'nowrap' as const,
    padding: '4px 12px',
    borderRadius: 2,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 9,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 100ms linear, border-color 100ms linear',
    background: selected ? `${accent}20` : colors.bg.card,
    color: selected ? accent : colors.text.secondary,
    border: `1px solid ${selected ? `${accent}40` : colors.border.default}`,
  });

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      <button
        onClick={() => onSelectClient(null)}
        style={chipStyle(selectedClientId === null)}
      >
        All
      </button>
      {relevantClients.sort((a, b) => a.name.localeCompare(b.name)).map(client => (
        <button
          key={client._id}
          onClick={() => onSelectClient(selectedClientId === client._id ? null : client._id)}
          style={chipStyle(selectedClientId === client._id)}
        >
          {client.name}
        </button>
      ))}
    </div>
  );
}
