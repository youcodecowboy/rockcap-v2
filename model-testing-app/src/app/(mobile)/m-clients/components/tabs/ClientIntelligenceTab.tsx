'use client';

interface ClientIntelligenceTabProps {
  clientId: string;
}

export default function ClientIntelligenceTab({ clientId }: ClientIntelligenceTabProps) {
  void clientId;
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Intelligence tab coming soon
    </div>
  );
}
