'use client';

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
  // Only show clients that have at least one contact
  const relevantClients = clients.filter(c => contactClientIds.has(c._id));

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      <button
        onClick={() => onSelectClient(null)}
        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
          selectedClientId === null
            ? 'bg-[var(--m-accent)] text-white'
            : 'bg-white border border-[var(--m-border)] text-[var(--m-text-secondary)]'
        }`}
      >
        All
      </button>
      {relevantClients.sort((a, b) => a.name.localeCompare(b.name)).map(client => (
        <button
          key={client._id}
          onClick={() => onSelectClient(selectedClientId === client._id ? null : client._id)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
            selectedClientId === client._id
              ? 'bg-[var(--m-accent)] text-white'
              : 'bg-white border border-[var(--m-border)] text-[var(--m-text-secondary)]'
          }`}
        >
          {client.name}
        </button>
      ))}
    </div>
  );
}
