'use client';

interface ClientListProps {
  onSelectClient: (clientId: string, clientName: string) => void;
}

export default function ClientList({ onSelectClient }: ClientListProps) {
  void onSelectClient;
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Client list coming soon
    </div>
  );
}
